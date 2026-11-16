import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { ClientWish, PostBusinessClientWishesByIdSendRevealResponse, RevealLink } from "../../contracts";
import { lockBusinessOwner } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import type { Env } from "../../common/env/env";
import { ENV } from "../../common/env/env.module";
import { AppError, ErrorFields } from "../../common/errors/app-error";
import { normaliseEmail } from "../../common/normalise/email";
import { linkProblem, normaliseLink } from "../../common/normalise/link";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import { clientWishWire } from "../pro-business/client-wish-wire";
import { NoticesService } from "../notices/notices.service";
import { hashPasscode } from "../wishes/wishes.service";
import { ShootsService } from "./shoots.service";
import { idsOf, SETS, SetName, Tx, UUID } from "./vault-shared";

const NOTE_MAX = 600;
const SHORT_MAX = 80;
const CREDITS_MAX = 12;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STYLE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const IDEM_MAX = 120;
const REVEAL_EMAILS_PER_ADDRESS_PER_DAY = 5;
const REVEAL_EMAILS_PER_BUSINESS_PER_DAY = 100;

/** What a reveal says: the words only. The client's address, the passcode and the end date never go into the stored words. */
interface Words {
  client: string;
  occasion: string;
  city: string;
  date: string;
  note: string;
  credits: { role: string; name: string; handle: string }[];
  booking: string;
  style: string;
}
interface Settings {
  words: Words;
  email: string | null;
  passcode: string | null;
  endsAt: Date | null;
}

interface AccessRow {
  linkId: string;
  businessId: string;
  shootId: string | null;
  wishId: string | null;
  set: SetName;
  code: string;
  fileIds: unknown;
  passcodeHash: string | null;
  lockedUntil: Date | null;
  endsAt: Date | null;
  offAt: Date | null;
}

/** The link's code: 128 random bits, URL-safe. It cannot be guessed and carries nothing about the shoot or the client. */
const newCode = (): string => randomBytes(16).toString("base64url");

/**
 * Reveal links (E-152, E-153) and sending a reveal (E-33, ruling OO3). A reveal is a client wish (made by E-30) that carries a
 * shoot's proofs or finals: sending it writes the wish's reveal words, the shoot's reveal mark, a link with a random code, and one
 * email to the client through the notices path, all in one transaction under the owner's account lock.
 */
@Injectable()
export class RevealsService {
  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly notices: NoticesService,
    private readonly shoots: ShootsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  linkOf(code: string): string {
    return `${this.env.PUBLIC_SITE_URL.replace(/\/+$/, "")}/r/${code}`;
  }

  /** The body's reveal object read into words and settings; every fault is named under `reveal`. */
  private read(raw: Record<string, unknown>, fallbackClient: string, now: Date): Settings {
    const fields: ErrorFields = {};
    const text = (k: string, max: number): string => {
      const v = raw[k];
      if (v === undefined || v === null) return "";
      if (typeof v !== "string") {
        fields[`reveal.${k}`] = "Must be text.";
        return "";
      }
      const t = v.trim();
      if (t.length > max) fields[`reveal.${k}`] = `Up to ${max} characters.`;
      return t;
    };
    const client = text("client", SHORT_MAX).replace(/\s+/g, " ") || fallbackClient;
    const occasion = text("occasion", SHORT_MAX);
    const city = text("city", SHORT_MAX);
    const note = text("note", NOTE_MAX);
    const style = text("style", 40).toLowerCase();
    if (style && !STYLE.test(style)) fields["reveal.style"] = "Use the style's own name.";
    const date = text("date", 10);
    if (date && (!DAY.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) fields["reveal.date"] = "Must be a date like 2027-03-04.";
    let booking = text("booking", 2048);
    if (booking) {
      const n = linkProblem(booking) ? null : normaliseLink(booking);
      if (!n) fields["reveal.booking"] = linkProblem(booking) ?? "Must be a full https link.";
      else booking = n;
    }
    const credits: Words["credits"] = [];
    if (raw.credits !== undefined) {
      if (!Array.isArray(raw.credits) || raw.credits.length > CREDITS_MAX * 4) fields["reveal.credits"] = "Must be a list of credits.";
      else {
        for (const c of raw.credits as unknown[]) {
          const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
          const one = (k: string): string => (typeof o[k] === "string" ? o[k].trim().replace(/\s+/g, " ").slice(0, SHORT_MAX) : "");
          const name = one("name");
          if (name) credits.push({ role: one("role"), name, handle: one("handle") });
        }
        if (credits.length > CREDITS_MAX) fields["reveal.credits"] = `Up to ${CREDITS_MAX} credits.`;
      }
    }
    let email: string | null = null;
    if (typeof raw.email === "string" && raw.email.trim()) {
      email = normaliseEmail(raw.email);
      if (!email) fields["reveal.email"] = "Must be an email address.";
    } else if (raw.email !== undefined && raw.email !== null && raw.email !== "") fields["reveal.email"] = "Must be an email address.";
    let passcode: string | null = null;
    if (typeof raw.passcode === "string" && raw.passcode.length > 0) {
      if (raw.passcode.length < 4 || raw.passcode.length > 40) fields["reveal.passcode"] = "Use 4 to 40 characters.";
      else passcode = raw.passcode;
    } else if (raw.passcode !== undefined && raw.passcode !== null && raw.passcode !== "") fields["reveal.passcode"] = "Use 4 to 40 characters.";
    let endsAt: Date | null = null;
    if (typeof raw.endsOn === "string" && raw.endsOn.trim()) {
      const d = raw.endsOn.trim();
      if (!DAY.test(d) || new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d) fields["reveal.endsOn"] = "Must be a date like 2027-03-04.";
      else {
        endsAt = new Date(`${d}T23:59:59.999Z`);
        if (endsAt.getTime() <= now.getTime()) fields["reveal.endsOn"] = "Must be a day that has not passed.";
      }
    } else if (raw.endsOn !== undefined && raw.endsOn !== null && raw.endsOn !== "") fields["reveal.endsOn"] = "Must be a date like 2027-03-04.";
    if (Object.keys(fields).length) throw AppError.validation(fields);
    return { words: { client, occasion, city, date, note, credits, booking, style }, email, passcode, endsAt };
  }

  /** The files of a shoot's set the link will show: the ones still stored and passed, in the set's order. */
  private async chosen(tx: Tx, businessId: string, shootSet: unknown): Promise<string[]> {
    const ids = idsOf(shootSet);
    if (!ids.length) return [];
    const rows = await tx.storedFile.findMany({ where: { id: { in: ids }, businessId, purpose: "vault_file", status: "ready" }, select: { id: true } });
    const ok = new Set(rows.map((r) => r.id));
    return ids.filter((i) => ok.has(i));
  }

  /**
   * EB1: sending a reveal is limited to 5 emails a day to one address from one business and 100 a day for a business (PROVISIONAL). Counted
   * from the day's reveal emails in the database in one statement, under the owner's lock the send holds (so 20 sends at once with 2 left
   * send 2); a count that cannot be made throws, and nothing is sent (fail closed). The day is the clock port's UTC day.
   */
  private async takeEmailRoom(tx: Tx, businessId: string, email: string): Promise<void> {
    const [n] = await tx.$queryRaw<{ address: number; business: number }[]>`
      SELECT (count(*) FILTER (WHERE lower(d."to") = ${email.toLowerCase()}))::int AS address, count(*)::int AS business
        FROM message_delivery d
        JOIN client_wish c ON c.id = (CASE WHEN d."idempotencyKey" ~ '^reveal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:' THEN substr(d."idempotencyKey", 8, 36)::uuid END)
       WHERE c."businessId" = ${businessId}::uuid AND d."createdAt" >= date_trunc('day', ${this.clock.now()}::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
    if (!n) throw new Error("the day's reveal emails could not be counted");
    if (n.address >= REVEAL_EMAILS_PER_ADDRESS_PER_DAY) throw new AppError(429, "too_many_requests", `You have sent ${REVEAL_EMAILS_PER_ADDRESS_PER_DAY} reveals to this address today. Try again tomorrow.`);
    if (n.business >= REVEAL_EMAILS_PER_BUSINESS_PER_DAY) throw new AppError(429, "too_many_requests", `Your business has sent ${REVEAL_EMAILS_PER_BUSINESS_PER_DAY} reveal emails today. Try again tomorrow.`);
  }

  /**
   * E-33. `:id` is the client wish (made by E-30, which counted it); the reveal from `shoot`'s `set` goes on it. With an Idempotency-Key
   * the same key again answers the first result and sends nothing; without one, or with a new key, it sends again on purpose.
   */
  async send(businessId: string, wishId: string, body: { reveal: Record<string, unknown>; set: unknown; shoot: unknown }, idemKey: string | undefined): Promise<PostBusinessClientWishesByIdSendRevealResponse> {
    if (!UUID.test(wishId)) throw AppError.notFound();
    const fields: ErrorFields = {};
    const set = SETS.find((s) => s === body.set);
    if (!set) fields.set = "Must be proofs or finals.";
    if (typeof body.shoot !== "string" || !UUID.test(body.shoot)) fields.shoot = "Must be the id of one of your shoots.";
    const key = idemKey === undefined ? null : idemKey.trim();
    if (key !== null && (!key || key.length > IDEM_MAX)) fields["Idempotency-Key"] = `Must be 1 to ${IDEM_MAX} characters.`;
    const now = this.clock.now();
    const reveal = body.reveal && typeof body.reveal === "object" && !Array.isArray(body.reveal) ? body.reveal : null;
    if (!reveal) fields.reveal = "Must be the words of the reveal.";
    if (Object.keys(fields).length) throw AppError.validation(fields);
    const shootId = (body.shoot as string).toLowerCase();

    const done = await this.db.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      if (key) {
        const first = await tx.$queryRaw<{ wishId: string }[]>`SELECT "wishId"::text AS "wishId" FROM reveal_send WHERE "businessId" = ${businessId}::uuid AND key = ${key}`;
        if (first[0]) {
          if (first[0].wishId !== wishId.toLowerCase()) throw AppError.conflict("idempotency_key_reused", "This Idempotency-Key was used for another wish.");
          return { again: true as const, wishId };
        }
      }
      const wish = await tx.clientWish.findFirst({ where: { id: wishId, businessId } });
      if (!wish) throw AppError.notFound();
      const shoot = await tx.shoot.findFirst({ where: { id: shootId, businessId } });
      if (!shoot) throw AppError.notFound();
      const s = this.read(reveal as Record<string, unknown>, wish.client ?? "", now);
      const fileIds = await this.chosen(tx, businessId, shoot[set as SetName]);
      if (!fileIds.length) throw AppError.validation({ set: `There are no ${set} in this shoot yet.` });
      const biz = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { business: true, name: true } });
      const passHash = s.passcode ? await hashPasscode(s.passcode) : null;
      if (s.email) await this.takeEmailRoom(tx, businessId, s.email);

      const existing = await tx.$queryRaw<{ linkId: string; code: string }[]>`SELECT "linkId"::text AS "linkId", code FROM reveal_access WHERE "wishId" = ${wishId}::uuid FOR UPDATE`;
      let linkId: string;
      let code: string;
      if (existing[0]) {
        ({ linkId, code } = existing[0]);
        await tx.$executeRaw`
          UPDATE reveal_access SET "shootId" = ${shootId}::uuid, "set" = ${set}, "fileIds" = ${JSON.stringify(fileIds)}::jsonb, "passcodeHash" = ${passHash},
            tries = 0, "lockedUntil" = NULL, "endsAt" = ${s.endsAt}, "offAt" = NULL
          WHERE "linkId" = ${linkId}::uuid`;
        await tx.$executeRaw`UPDATE reveal_link SET "set" = ${set}::"RevealLinkSet" WHERE id = ${linkId}::uuid`;
      } else {
        linkId = this.ids.id();
        code = newCode();
        await tx.$executeRaw`INSERT INTO reveal_link (id, link, "set", "businessId") VALUES (${linkId}::uuid, ${this.linkOf(code)}, ${set}::"RevealLinkSet", ${businessId}::uuid)`;
        await tx.$executeRaw`
          INSERT INTO reveal_access ("linkId", "businessId", "shootId", "wishId", "set", code, "fileIds", "passcodeHash", "endsAt", "createdAt")
          VALUES (${linkId}::uuid, ${businessId}::uuid, ${shootId}::uuid, ${wishId}::uuid, ${set}, ${code}, ${JSON.stringify(fileIds)}::jsonb, ${passHash}, ${s.endsAt}, ${now})`;
      }
      const stored: Prisma.InputJsonObject = { ...s.words, link: linkId };
      await tx.clientWish.update({ where: { id: wishId }, data: { reveal: stored, shoot: shootId, set: set as SetName, sentAt: now } });
      const mark: Prisma.InputJsonObject = { wish: wishId, no: wish.no ?? "", sentAt: toWireInstant(now), link: linkId };
      await tx.shoot.update({ where: { id: shootId }, data: set === "proofs" ? { proofsReveal: mark } : { finalsReveal: mark } });
      let deliveryId: string | null = null;
      if (s.email) {
        const out = await this.notices.send(tx, {
          template: "reveal", toEmail: s.email, wishId: undefined,
          data: { name: s.words.client, business: biz.business ?? biz.name ?? "Your photographer", link: this.linkOf(code) },
          key: `reveal:${wishId}:${key ?? this.ids.id()}`,
        });
        if (out.status === "queued") deliveryId = out.deliveryId;
      }
      if (key) await tx.$executeRaw`INSERT INTO reveal_send (id, "businessId", key, "wishId", "createdAt") VALUES (${this.ids.id()}::uuid, ${businessId}::uuid, ${key}, ${wishId}::uuid, ${now})`;
      return { again: false as const, wishId, deliveryId };
    });
    if (!done.again && done.deliveryId) {
      try {
        await this.notices.deliverNow(done.deliveryId);
      } catch {
        // the send-message job carries it out at its next run
      }
    }
    return this.answer(businessId, wishId);
  }

  private async answer(businessId: string, wishId: string): Promise<{ shoot: Awaited<ReturnType<ShootsService["wire"]>>; wish: ClientWish }> {
    const wish = await this.db.clientWish.findFirstOrThrow({ where: { id: wishId, businessId } });
    const shoot = await this.db.shoot.findFirstOrThrow({ where: { id: wish.shoot ?? "", businessId } });
    return { shoot: await this.shoots.wire(shoot, true), wish: clientWishWire(wish) };
  }

  /** What the business reads of a link: where it points, its settings, and its plays (count, first and last time; nothing of the viewers). */
  private async view(businessId: string, where: { linkId?: string }): Promise<RevealLink & Record<string, unknown>> {
    const rows = await this.db.$queryRaw<
      { linkId: string; link: string | null; set: SetName; shootId: string | null; wishId: string | null; passcode: boolean; endsAt: Date | null; offAt: Date | null; lockedUntil: Date | null; plays: string; first: Date | null; last: Date | null }[]
    >`
      SELECT a."linkId"::text AS "linkId", l.link, a."set", a."shootId"::text AS "shootId", a."wishId"::text AS "wishId", (a."passcodeHash" IS NOT NULL) AS passcode,
             a."endsAt", a."offAt", a."lockedUntil",
             (SELECT count(*) FROM reveal_play p WHERE p."linkId" = a."linkId")::text AS plays,
             (SELECT min(at) FROM reveal_play p WHERE p."linkId" = a."linkId") AS first,
             (SELECT max(at) FROM reveal_play p WHERE p."linkId" = a."linkId") AS last
        FROM reveal_access a JOIN reveal_link l ON l.id = a."linkId"
       WHERE a."linkId" = ${where.linkId}::uuid AND a."businessId" = ${businessId}::uuid`;
    const r = rows[0];
    if (!r) throw AppError.notFound();
    const t = (d: Date | null): string | null => (d ? toWireInstant(d) : null);
    const now = this.clock.now();
    return {
      link: r.link ?? "",
      set: r.set,
      id: r.linkId,
      shoot: r.shootId,
      wish: r.wishId,
      passcode: r.passcode,
      endsAt: t(r.endsAt),
      off: r.offAt !== null,
      locked: r.lockedUntil !== null && r.lockedUntil.getTime() > now.getTime(),
      plays: { count: Number(r.plays), first: t(r.first), last: t(r.last) },
    };
  }

  /** E-152. */
  async get(businessId: string, linkId: string): Promise<RevealLink> {
    if (!UUID.test(linkId)) throw AppError.notFound();
    return this.view(businessId, { linkId });
  }

  /** Switches a link off at once: from the next read it answers gone. Switching off twice changes nothing. */
  async off(businessId: string, linkId: string): Promise<RevealLink> {
    if (!UUID.test(linkId)) throw AppError.notFound();
    const n = await this.db.$executeRaw`UPDATE reveal_access SET "offAt" = COALESCE("offAt", ${this.clock.now()}) WHERE "linkId" = ${linkId}::uuid AND "businessId" = ${businessId}::uuid`;
    if (n === 0) throw AppError.notFound();
    return this.view(businessId, { linkId });
  }

  /**
   * E-153: the link of a shoot's proofs or finals, to copy. The first copy makes it (no wish, no end, no passcode); a copy again gives the
   * same link with the set's files as they are now. A link switched off is made again with a new code.
   */
  async copyLink(businessId: string, shootId: string, setIn: unknown): Promise<string> {
    if (!UUID.test(shootId)) throw AppError.notFound();
    const set = SETS.find((s) => s === setIn);
    if (!set) throw AppError.validation({ set: "Must be proofs or finals." });
    const now = this.clock.now();
    return this.db.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      const shoot = await tx.shoot.findFirst({ where: { id: shootId, businessId } });
      if (!shoot) throw AppError.notFound();
      const fileIds = await this.chosen(tx, businessId, shoot[set]);
      if (!fileIds.length) throw AppError.validation({ set: `There are no ${set} in this shoot yet.` });
      const cur = await tx.$queryRaw<{ linkId: string; code: string }[]>`
        SELECT "linkId"::text AS "linkId", code FROM reveal_access
         WHERE "shootId" = ${shootId}::uuid AND "set" = ${set} AND "wishId" IS NULL AND "offAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE`;
      if (cur[0]) {
        await tx.$executeRaw`UPDATE reveal_access SET "fileIds" = ${JSON.stringify(fileIds)}::jsonb WHERE "linkId" = ${cur[0].linkId}::uuid`;
        return this.linkOf(cur[0].code);
      }
      const linkId = this.ids.id();
      const code = newCode();
      await tx.$executeRaw`INSERT INTO reveal_link (id, link, "set", "businessId") VALUES (${linkId}::uuid, ${this.linkOf(code)}, ${set}::"RevealLinkSet", ${businessId}::uuid)`;
      await tx.$executeRaw`
        INSERT INTO reveal_access ("linkId", "businessId", "shootId", "set", code, "fileIds", "createdAt")
        VALUES (${linkId}::uuid, ${businessId}::uuid, ${shootId}::uuid, ${set}, ${code}, ${JSON.stringify(fileIds)}::jsonb, ${now})`;
      return this.linkOf(code);
    });
  }
}

export type { AccessRow };
