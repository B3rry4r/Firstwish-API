import { Injectable } from "@nestjs/common";
import { $Enums, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import type { PostEventsBody } from "../../contracts";

/*
 * App events (E-52) and the server's own (paid in a style). Style use counts are sums of these rows (DEC-124).
 * The app may send only what it sees itself: a style preview played, and a wish preview started or finished. Money events
 * ('paid' and the other lines) come from the server when a payment is verified, never from the app (analytics-events:
 * "money figures come from the ledger, not from client events").
 */

/** What the app may send, by its wire name. */
const APP_EVENTS: Record<string, $Enums.EventName> = {
  "style-previewed": "style_previewed",
  "preview-started": "preview_started",
  "preview-finished": "preview_finished",
};

const KEY = /^[A-Za-z0-9._:-]{8,100}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PROPS_BYTES = 2048;

export interface ServerEvent {
  name: Exclude<$Enums.EventName, "style_previewed" | "preview_started" | "preview_finished">;
  /** The replay key: an event with the same name and key is written once (a payment reference, for 'paid'). */
  key: string;
  accountId?: string | null;
  wishId?: string | null;
  styleSlug?: string | null;
  kind?: string | null;
  amountKobo?: bigint | null;
  line?: $Enums.EventLine | null;
}

interface Row {
  name: $Enums.EventName;
  key: string;
  accountId: string | null;
  wishId: string | null;
  styleSlug: string | null;
  kind: string | null;
  amountKobo: bigint | null;
  line: $Enums.EventLine | null;
  props: Record<string, unknown>;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /** E-52: one app event from a signed-in account. A replay with the same key counts once. */
  async track(accountId: string, body: PostEventsBody): Promise<void> {
    const name = APP_EVENTS[body.name.trim().toLowerCase()];
    if (!name) throw AppError.validation({ name: `Must be one of ${Object.keys(APP_EVENTS).join(", ")}.` });
    const props = body.props;
    if (Buffer.byteLength(JSON.stringify(props), "utf8") > MAX_PROPS_BYTES) throw AppError.validation({ props: "Too large." });
    const key = typeof props.key === "string" ? props.key.trim() : "";
    if (!KEY.test(key)) throw AppError.validation({ "props.key": "Must be 8 to 100 letters, digits or . _ : - (the replay key)." });
    let styleSlug: string | null = null;
    if (props.style !== undefined) {
      styleSlug = typeof props.style === "string" ? props.style.trim().toLowerCase() : "";
      if (!SLUG.test(styleSlug)) throw AppError.validation({ "props.style": "Must be a style slug." });
    }
    if (name === "style_previewed" && styleSlug === null) throw AppError.validation({ "props.style": "Say which style was previewed." });
    if (styleSlug !== null) {
      const known = await this.db.style.findFirst({ where: { slug: styleSlug }, select: { id: true } });
      if (!known) throw AppError.validation({ "props.style": "No style has this slug." });
    }
    await this.write({ name, key, accountId, wishId: null, styleSlug, kind: null, amountKobo: null, line: null, props: { key, ...(styleSlug ? { style: styleSlug } : {}) } });
  }

  /**
   * The server's own events (a wish paid in a style, from the payment that verified it). Safe to call twice with the same key.
   * Pass the caller's transaction so the event lands with the payment, or none for a write of its own.
   */
  async record(e: ServerEvent, tx?: Prisma.TransactionClient): Promise<void> {
    if (!KEY.test(e.key)) throw new Error("events: a server event needs a replay key");
    if (e.accountId && !UUID.test(e.accountId)) throw new Error("events: accountId is not an id");
    if (e.wishId && !UUID.test(e.wishId)) throw new Error("events: wishId is not an id");
    const row: Row = {
      name: e.name,
      key: e.key,
      accountId: e.accountId ?? null,
      wishId: e.wishId ?? null,
      styleSlug: e.styleSlug ? e.styleSlug.trim().toLowerCase() : null,
      kind: e.kind ?? null,
      amountKobo: e.amountKobo ?? null,
      line: e.line ?? null,
      props: { key: e.key },
    };
    await this.write(row, tx);
  }

  /** Writes once per (name, account, key): a transaction-scoped lock on that triple makes two at once write one row. */
  private async write(r: Row, tx?: Prisma.TransactionClient): Promise<void> {
    const run = async (t: Prisma.TransactionClient) => {
      const scope = `${r.name}|${r.accountId ?? "-"}|${r.key}`;
      await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
      const seen = await t.$queryRaw<{ n: number }[]>`
        SELECT 1 AS n FROM "event"
        WHERE "name" = ${wireName(r.name)}::"EventName"
          AND "accountId" IS NOT DISTINCT FROM ${r.accountId}::uuid
          AND "props"->>'key' = ${r.key}
        LIMIT 1`;
      if (seen.length) return;
      await t.event.create({
        data: {
          id: this.ids.id(),
          name: r.name,
          accountId: r.accountId,
          wishId: r.wishId,
          styleSlug: r.styleSlug,
          kind: r.kind,
          amountKobo: r.amountKobo,
          line: r.line,
          at: this.clock.now(),
          props: r.props as Prisma.InputJsonObject,
        },
      });
    };
    if (tx) await run(tx);
    else await this.db.$transaction(run);
  }
}

/** The database spelling of an event name (the enum is mapped to the wire's kebab-case). */
export function wireName(n: $Enums.EventName): string {
  return n.replace(/_/g, "-");
}
