import type { ClientWish as ClientWishRow } from "@prisma/client";

/** The three times a client wish reads from its wish (ZB3: one truth); the row's own columns stay for a wish made with a reveal. */
export type ClientWishRead = ClientWishRow & { wishRef?: { sealedAt: Date | null; openedAt: Date | null; endsAt: Date | null } | null };
export const WITH_WISH = { wishRef: { select: { sealedAt: true, openedAt: true, endsAt: true } } } as const;
import type { ClientWish } from "../../contracts";

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/** A client wish row as the wire has it. Text the row does not hold (an erased or never-set field) is empty text, never null. */
export function clientWishWire(r: ClientWishRead): ClientWish {
  const w = r.wishRef ?? null;
  const linked = r.wishId !== null;
  const out: Record<string, unknown> = {
    id: r.id,
    no: r.no ?? "",
    key: r.key ?? "",
    client: r.client ?? "",
    kind: r.kind ?? "",
    occasion: r.occasion ?? "",
    day: r.day ? ymd(r.day) : "",
    createdAt: r.createdAt.toISOString(),
    sentAt: ((linked ? (w?.sealedAt ?? null) : null) ?? r.sentAt ?? r.createdAt).toISOString(),
    from: r.from ?? "",
    wish: r.wish ?? "",
    shoot: r.shoot ?? "",
    hearts: Array.isArray(r.hearts) ? r.hearts : [],
  };
  if (r.set) out.set = r.set;
  const endsAt = linked ? w?.endsAt ?? null : r.endsAt;
  const openedAt = linked ? w?.openedAt ?? null : r.openedAt;
  if (r.wishId) out.wishId = r.wishId;
  if (endsAt) out.endsAt = endsAt.toISOString();
  if (openedAt) out.openedAt = openedAt.toISOString();
  if (r.madeOwn !== null) out.madeOwn = r.madeOwn;
  if (r.reveal !== null) out.reveal = r.reveal;
  if (r.sample !== null) out.sample = r.sample;
  return out as unknown as ClientWish;
}
