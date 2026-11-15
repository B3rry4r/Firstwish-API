import type { ClientWish as ClientWishRow } from "@prisma/client";
import type { ClientWish } from "../../contracts";

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/** A client wish row as the wire has it. Text the row does not hold (an erased or never-set field) is empty text, never null. */
export function clientWishWire(r: ClientWishRow): ClientWish {
  const out: Record<string, unknown> = {
    id: r.id,
    no: r.no ?? "",
    key: r.key ?? "",
    client: r.client ?? "",
    kind: r.kind ?? "",
    occasion: r.occasion ?? "",
    day: r.day ? ymd(r.day) : "",
    createdAt: r.createdAt.toISOString(),
    sentAt: (r.sentAt ?? r.createdAt).toISOString(),
    from: r.from ?? "",
    wish: r.wish ?? "",
    shoot: r.shoot ?? "",
    hearts: Array.isArray(r.hearts) ? r.hearts : [],
  };
  if (r.set) out.set = r.set;
  if (r.endsAt) out.endsAt = r.endsAt.toISOString();
  if (r.openedAt) out.openedAt = r.openedAt.toISOString();
  if (r.madeOwn !== null) out.madeOwn = r.madeOwn;
  if (r.reveal !== null) out.reveal = r.reveal;
  if (r.sample !== null) out.sample = r.sample;
  return out as unknown as ClientWish;
}
