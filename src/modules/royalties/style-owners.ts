/**
 * Who made a style, read from the style row's `creator` document (Style.creator). Default (lead), owner may override: the
 * document is `{ "creatorId": "<creator uuid>", "templateCreatorId": "<creator uuid>" | null }` ("id" and "template": {"creatorId"}
 * are read too). House styles have no creator document and earn nothing. The Studio bundle writes it when a style is approved.
 */
export interface StyleOwners {
  creatorId: string | null;
  templateCreatorId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const id = (v: unknown): string | null => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);

export function readStyleOwners(creator: unknown): StyleOwners {
  const o = obj(creator);
  if (!o) return { creatorId: null, templateCreatorId: null };
  const t = obj(o.template);
  const creatorId = id(o.creatorId) ?? id(o.id);
  const templateCreatorId = id(o.templateCreatorId) ?? (t ? (id(t.creatorId) ?? id(t.id)) : null);
  return { creatorId, templateCreatorId: templateCreatorId && templateCreatorId !== creatorId ? templateCreatorId : null };
}
