import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { ClientWish, PostBusinessClientWishesByIdSendRevealResponse, PostBusinessRevealsResponse, RevealLink } from "../../contracts";
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
import { clientWishWire, WITH_WISH } from "../pro-business/client-wish-wire";
import { ClientWishesService } from "../pro-business/client-wishes.service";
import { NoticesService } from "../notices/notices.service";
import { hashPasscode } from "../wishes/wishes.service";
import { ShootsService } from "./shoots.service";
import { idsOf, SETS, SetName, syncHearts, Tx, UUID } from "./vault-shared";

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
  downloads: boolean;
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

/** What a send needs, read from its body. */
interface Call {
  set: SetName;
  shootId: string;
  key: string | null;
  reveal: Record<string, unknown>;
  named: string[] | null;
}

export interface SendOneBody {
  reveal: Record<string, unknown>;
  set: unknown;
  shoot: unknown;
  files?: unknown;
  client?: unknown;
  kind?: unknown;
  occasion?: unknown;
  day?: unknown;
  again?: unknown;
}

const NAMED_MAX = 200;
/** IB4: the files a reveal names: absent or empty means every ready file of the set; else 1 to 200 file ids, a repeat counted once. */
function namedFiles(v: unknown, fields: ErrorFields): string[] | null {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v) || v.length > NAMED_MAX || !v.every((x) => typeof x === "string" && UUID.test(x))) {
    fields.files = `Must be a list of up to ${NAMED_MAX} file ids from the set.`;
    return null;
  }
  return [...new Set((v as string[]).map((x) => x.toLowerCase()))];
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
    private readonly wishes: ClientWishesService,
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
    let downloads = true;
    if (typeof raw.downloads === "boolean") downloads = raw.downloads;
    else if (raw.downloads !== undefined && raw.downloads !== null) fields["reveal.downloads"] = "Must be true or false.";
    if (Object.keys(fields).length) throw AppError.validation(fields);
    return { words: { client, occasion, city, date, note, credits, booking, style }, email, passcode, endsAt, downloads };
  }

  /**
   * The files of a shoot's set the link will show: the ones still stored and passed, in the set's order (IB4: with files named, only those, in the
   * order named; one that is not a ready file of this set is refused with words, and so is a name that repeats nothing wrong: a repeat is dropped).
   */
  private async chosen(tx: Tx, businessId: string, shootSet: unknown, named?: string[] | null): Promise<string[]> {
    const ids = idsOf(shootSet);
    if (named && named.length) {
      const inSet = new Set(ids);
      const rows = await tx.storedFile.findMany({ where: { id: { in: named }, businessId, purpose: "vault_file", status: "ready" }, select: { id: true } });
      const ok = new Set(rows.map((r) => r.id));
      const bad = named.filter((i) => !inSet.has(i) || !ok.has(i));
      if (bad.length) throw AppError.validation({ files: `${bad.length === 1 ? "One file is" : `${bad.length} files are`} not ready photos of this shoot's set. Pick files from the set that have finished uploading.` });
      return named;
    }
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
  async send(businessId: string, wishId: string, body: { reveal: Record<string, unknown>; set: unknown; shoot: unknown; files?: unknown }, idemKey: string | undefined): Promise<PostBusinessClientWishesByIdSendRevealResponse> {
    if (!UUID.test(wishId)) throw AppError.notFound();
    const call = this.readCall(body, idemKey);
    const done = await this.db.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      if (call.key) {
        const first = await this.firstSend(tx, businessId, call.key);
        if (first) {
          if (first !== wishId.toLowerCase()) throw AppError.conflict("idempotency_key_reused", "This Idempotency-Key was used for another wish.");
          await this.sameSend(tx, businessId, first, call.shootId, null);
          return { again: true as const, wishId };
        }
      }
      const out = await this.sendIn(tx, businessId, wishId, call);
      return { again: false as const, wishId, deliveryId: out.deliveryId };
    });
    if (!done.again) await this.deliver(done.deliveryId);
    return this.answer(businessId, wishId);
  }

  /** The body of a send read into its parts: every fault named, before anything is touched. */
  private readCall(body: { reveal: Record<string, unknown>; set: unknown; shoot: unknown; files?: unknown }, idemKey: string | undefined): Call {
    const fields: ErrorFields = {};
    const set = SETS.find((s) => s === body.set);
    if (!set) fields.set = "Must be proofs or finals.";
    if (typeof body.shoot !== "string" || !UUID.test(body.shoot)) fields.shoot = "Must be the id of one of your shoots.";
    const key = idemKey === undefined ? null : idemKey.trim();
    if (key !== null && (!key || key.length > IDEM_MAX)) fields["Idempotency-Key"] = `Must be 1 to ${IDEM_MAX} characters.`;
    const reveal = body.reveal && typeof body.reveal === "object" && !Array.isArray(body.reveal) ? body.reveal : null;
    if (!reveal) fields.reveal = "Must be the words of the reveal.";
    const named = namedFiles(body.files, fields);
    if (Object.keys(fields).length) throw AppError.validation(fields);
    return { set: set as SetName, shootId: (body.shoot as string).toLowerCase(), key, reveal: reveal as Record<string, unknown>, named };
  }

  private async firstSend(tx: Tx, businessId: string, key: string): Promise<string | null> {
    const first = await tx.$queryRaw<{ wishId: string }[]>`SELECT "wishId"::text AS "wishId" FROM reveal_send WHERE "businessId" = ${businessId}::uuid AND key = ${key}`;
    return first[0]?.wishId ?? null;
  }

  /** IC5: a key used again names the same shoot and client as the send it first made, or it is refused (409), never replayed for another. */
  private async sameSend(tx: Tx, businessId: string, wishId: string, shootId: string, client: string | null): Promise<void> {
    const w = await tx.clientWish.findFirst({ where: { id: wishId, businessId }, select: { shoot: true, client: true } });
    const name = (client ?? "").trim().replace(/\s+/g, " ").toLowerCase();
    if (!w || (w.shoot ?? "").toLowerCase() !== shootId || (name && (w.client ?? "").trim().toLowerCase() !== name)) {
      throw AppError.conflict("idempotency_key_reused", "This Idempotency-Key was used for another shoot or client.");
    }
  }

  /** The email goes out after the commit; a failure here is carried out by the send-message job at its next run. */
  private async deliver(deliveryId: string | null): Promise<void> {
    if (!deliveryId) return;
    try {
      await this.notices.deliverNow(deliveryId);
    } catch {
      // the send-message job carries it out at its next run
    }
  }

  /**
   * The reveal on a client wish, in the caller's transaction (the owner's account is locked): the words on the wish, the shoot's mark, the
   * link and its settings, the email queued. The same step serves E-33 and the one-call reveal.
   */
  private async sendIn(tx: Tx, businessId: string, wishId: string, call: Call, strictEmail = false): Promise<{ deliveryId: string | null; linkId: string; code: string }> {
    const { set, shootId, key } = call;
    const now = this.clock.now();
    const wish = await tx.clientWish.findFirst({ where: { id: wishId, businessId } });
    if (!wish) throw AppError.notFound();
    const shoot = await tx.shoot.findFirst({ where: { id: shootId, businessId } });
    if (!shoot) throw AppError.notFound();
    const s = this.read(call.reveal, wish.client ?? "", now);
    const fileIds = await this.chosen(tx, businessId, shoot[set], call.named);
    if (!fileIds.length) throw AppError.validation({ set: `There are no ${set} in this shoot yet.` });
    const biz = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { business: true, name: true } });
    const passHash = s.passcode ? await hashPasscode(s.passcode) : null;
    if (s.email) await this.takeEmailRoom(tx, businessId, s.email);

    const existing = await tx.$queryRaw<{ linkId: string; code: string; fileIds: unknown }[]>`SELECT "linkId"::text AS "linkId", code, "fileIds" FROM reveal_access WHERE "wishId" = ${wishId}::uuid FOR UPDATE`;
    let linkId: string;
    let code: string;
    if (existing[0]) {
      ({ linkId, code } = existing[0]);
      const same = JSON.stringify(idsOf(existing[0].fileIds)) === JSON.stringify(fileIds);
      await tx.$executeRaw`
        UPDATE reveal_access SET "shootId" = ${shootId}::uuid, "set" = ${set}, "fileIds" = ${JSON.stringify(fileIds)}::jsonb, "passcodeHash" = ${passHash},
          tries = 0, "lockedUntil" = NULL, "endsAt" = ${s.endsAt}, "offAt" = NULL, "downloads" = ${s.downloads}, hearts = CASE WHEN ${same} THEN hearts ELSE '{}'::int[] END
        WHERE "linkId" = ${linkId}::uuid`;
      await tx.$executeRaw`UPDATE reveal_link SET "set" = ${set}::"RevealLinkSet" WHERE id = ${linkId}::uuid`;
    } else {
      linkId = this.ids.id();
      code = newCode();
      await tx.$executeRaw`INSERT INTO reveal_link (id, link, "set", "businessId") VALUES (${linkId}::uuid, ${this.linkOf(code)}, ${set}::"RevealLinkSet", ${businessId}::uuid)`;
      await tx.$executeRaw`
        INSERT INTO reveal_access ("linkId", "businessId", "shootId", "wishId", "set", code, "fileIds", "passcodeHash", "endsAt", "downloads", "createdAt")
        VALUES (${linkId}::uuid, ${businessId}::uuid, ${shootId}::uuid, ${wishId}::uuid, ${set}, ${code}, ${JSON.stringify(fileIds)}::jsonb, ${passHash}, ${s.endsAt}, ${s.downloads}, ${now})`;
    }
    if (passHash) await this.gateShootLinks(tx, shootId, set, passHash);
    await syncHearts(tx, linkId);
    const stored: Prisma.InputJsonObject = { ...s.words, link: linkId };
    await tx.clientWish.update({ where: { id: wishId }, data: { reveal: stored, shoot: shootId, set, sentAt: now } });
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
      else if (strictEmail && out.status !== "existing") throw AppError.validation({ "reveal.email": "This email could not be sent. Check the address and try again." });
    }
    if (key) await tx.$executeRaw`INSERT INTO reveal_send (id, "businessId", key, "wishId", "createdAt") VALUES (${this.ids.id()}::uuid, ${businessId}::uuid, ${key}, ${wishId}::uuid, ${now})`;
    return { deliveryId, linkId, code };
  }

  /**
   * IA1: the one call that sends a reveal. It makes the client wish (taking one wish from the business as E-30 does) and the reveal together,
   * in one transaction under the owner's lock: if anything is refused (no wish left, the email, a file, the limits) nothing is kept. With an
   * Idempotency-Key the same key again answers the first result. A shoot already revealed to that client on that set answers 409
   * already_sent with when and the link, unless the body says `again`: that sends the reveal again on the same client wish and takes no second wish.
   */
  async sendOne(caller: { accountId: string; businessId: string }, body: SendOneBody, idemKey: string | undefined): Promise<PostBusinessRevealsResponse> {
    const { businessId } = caller;
    const call = this.readCall({ reveal: body.reveal, set: body.set, shoot: body.shoot, files: body.files }, idemKey);
    const again = body.again === true;
    if (body.again !== undefined && typeof body.again !== "boolean") throw AppError.validation({ again: "Must be true or false." });
    const done = await this.db.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      if (call.key) {
        const first = await this.firstSend(tx, businessId, call.key);
        if (first) {
          await this.sameSend(tx, businessId, first, call.shootId, typeof call.reveal.client === "string" ? call.reveal.client : typeof body.client === "string" ? body.client : "");
          return { replay: true as const, wishId: first };
        }
      }
      const shoot = await tx.shoot.findFirst({ where: { id: call.shootId, businessId }, select: { id: true } });
      if (!shoot) throw AppError.notFound();
      const raw = call.reveal;
      const clientName = (typeof raw.client === "string" ? raw.client : typeof body.client === "string" ? body.client : "").trim().replace(/\s+/g, " ");
      const prior = clientName
        ? await tx.$queryRaw<{ id: string; sentAt: Date; code: string }[]>`
            SELECT c.id::text AS id, c."sentAt", a.code FROM client_wish c JOIN reveal_access a ON a."wishId" = c.id
             WHERE c."businessId" = ${businessId}::uuid AND c.shoot = ${call.shootId} AND c."set"::text = ${call.set} AND lower(c.client) = lower(${clientName})
             ORDER BY c."sentAt" DESC, c.id DESC LIMIT 1`
        : [];
      let wishId: string;
      if (prior[0]) {
        if (!again) {
          throw new AppError(409, "already_sent", `This shoot's ${call.set} were already sent to ${clientName} on ${toWireInstant(prior[0].sentAt).slice(0, 10)}. Send again to send them once more.`, { sentAt: toWireInstant(prior[0].sentAt), link: this.linkOf(prior[0].code) });
        }
        wishId = prior[0].id;
      } else {
        const day = typeof body.day === "string" ? body.day : typeof raw.date === "string" && raw.date ? raw.date : this.clock.now().toISOString().slice(0, 10);
        const made = await this.wishes.makeFor(tx, caller.accountId, businessId, {
          client: clientName,
          kind: typeof body.kind === "string" ? body.kind : "photographers",
          occasion: typeof body.occasion === "string" ? body.occasion : typeof raw.occasion === "string" && raw.occasion.trim() ? raw.occasion : "Reveal",
          day,
        });
        wishId = made.id;
      }
      const out = await this.sendIn(tx, businessId, wishId, call, true);
      return { replay: false as const, wishId, deliveryId: out.deliveryId };
    });
    if (!done.replay) await this.deliver(done.deliveryId);
    const answer = await this.answer(businessId, done.wishId);
    const link = await this.db.$queryRaw<{ code: string }[]>`SELECT code FROM reveal_access WHERE "wishId" = ${done.wishId}::uuid`;
    return { ...answer, link: link[0] ? this.linkOf(link[0].code) : "" };
  }

  private async answer(businessId: string, wishId: string): Promise<{ shoot: Awaited<ReturnType<ShootsService["wire"]>>; wish: ClientWish }> {
    const wish = await this.db.clientWish.findFirstOrThrow({ where: { id: wishId, businessId }, include: WITH_WISH });
    const shoot = await this.db.shoot.findFirstOrThrow({ where: { id: wish.shoot ?? "", businessId } });
    return { shoot: await this.shoots.wire(shoot, true), wish: clientWishWire(wish) };
  }

  /** What the business reads of a link: where it points, its settings, and its plays (count, first and last time; nothing of the viewers). */
  private async view(businessId: string, where: { linkId?: string }): Promise<RevealLink & Record<string, unknown>> {
    const rows = await this.db.$queryRaw<
      { linkId: string; link: string | null; set: SetName; shootId: string | null; wishId: string | null; passcode: boolean; endsAt: Date | null; offAt: Date | null; lockedUntil: Date | null; hearts: number[]; downloads: boolean; plays: string; first: Date | null; last: Date | null }[]
    >`
      SELECT a."linkId"::text AS "linkId", l.link, a."set", a."shootId"::text AS "shootId", a."wishId"::text AS "wishId", (a."passcodeHash" IS NOT NULL) AS passcode,
             a."endsAt", a."offAt", a."lockedUntil", a.hearts, a.downloads,
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
      hearts: r.hearts,
      downloads: r.downloads,
      plays: { count: Number(r.plays), first: t(r.first), last: t(r.last) },
    };
  }

  /**
   * IA4: a reveal's passcode holds for every link to those files. A link the business copied for the shoot's set (no client wish) takes the
   * passcode of the reveal sent on that set, so the copied link and the reveal's own link open with the same one. Tries and the lock start over.
   */
  private async gateShootLinks(tx: Tx, shootId: string, set: SetName, passHash: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE reveal_access SET "passcodeHash" = ${passHash}, tries = 0, "lockedUntil" = NULL
       WHERE "shootId" = ${shootId}::uuid AND "set" = ${set} AND "wishId" IS NULL AND "offAt" IS NULL`;
  }

  /** The passcode of the newest live reveal sent on a shoot's set, or null when none of them has one. */
  private async setPasscode(tx: Tx, shootId: string, set: SetName, now: Date): Promise<string | null> {
    const rows = await tx.$queryRaw<{ hash: string }[]>`
      SELECT "passcodeHash" AS hash FROM reveal_access
       WHERE "shootId" = ${shootId}::uuid AND "set" = ${set} AND "wishId" IS NOT NULL AND "passcodeHash" IS NOT NULL AND "offAt" IS NULL
         AND ("endsAt" IS NULL OR "endsAt" > ${now})
       ORDER BY "createdAt" DESC, "linkId" DESC LIMIT 1`;
    return rows[0]?.hash ?? null;
  }

  /** E-152. */
  async get(businessId: string, linkId: string): Promise<RevealLink> {
    if (!UUID.test(linkId)) throw AppError.notFound();
    return this.view(businessId, { linkId });
  }

  /** IB2: switches a link's download addresses on or off. Only finals give any; the switch is kept for a proofs link but never shows a download. */
  async setDownloads(businessId: string, linkId: string, on: unknown): Promise<RevealLink> {
    if (!UUID.test(linkId)) throw AppError.notFound();
    if (typeof on !== "boolean") throw AppError.validation({ on: "Must be true or false." });
    const n = await this.db.$executeRaw`UPDATE reveal_access SET downloads = ${on} WHERE "linkId" = ${linkId}::uuid AND "businessId" = ${businessId}::uuid`;
    if (n === 0) throw AppError.notFound();
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
   * E-153: the link of a shoot's proofs or finals, to copy. The first copy makes it (no wish, no end); a copy again gives the same link with
   * the set's files as they are now. A link switched off is made again with a new code. Where a reveal with a passcode was sent on the set,
   * the copied link carries that passcode too (IA4): it never opens without it.
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
      const gate = await this.setPasscode(tx, shootId, set, now);
      if (cur[0]) {
        await tx.$executeRaw`UPDATE reveal_access SET "fileIds" = ${JSON.stringify(fileIds)}::jsonb, "passcodeHash" = COALESCE("passcodeHash", ${gate}) WHERE "linkId" = ${cur[0].linkId}::uuid`;
        return this.linkOf(cur[0].code);
      }
      const linkId = this.ids.id();
      const code = newCode();
      await tx.$executeRaw`INSERT INTO reveal_link (id, link, "set", "businessId") VALUES (${linkId}::uuid, ${this.linkOf(code)}, ${set}::"RevealLinkSet", ${businessId}::uuid)`;
      await tx.$executeRaw`
        INSERT INTO reveal_access ("linkId", "businessId", "shootId", "set", code, "fileIds", "passcodeHash", "createdAt")
        VALUES (${linkId}::uuid, ${businessId}::uuid, ${shootId}::uuid, ${set}, ${code}, ${JSON.stringify(fileIds)}::jsonb, ${gate}, ${now})`;
      return this.linkOf(code);
    });
  }
}

export type { AccessRow };
