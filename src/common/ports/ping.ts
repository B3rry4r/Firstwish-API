/**
 * FB4: every provider port can be pinged. The real adapter makes ONE cheap authenticated read and answers ok, or the provider's own
 * error; a stand-in answers "stand-in" and calls nothing. The answer never carries a secret: an error is cut short and any key in it
 * is blanked (`pingError`). The staff Providers read says "connected" only for a real adapter whose ping said ok just now.
 */
export type PortPing = { state: "ok" } | { state: "stand-in" } | { state: "error"; error: string };

export const PING_OK: PortPing = { state: "ok" };
export const PING_STAND_IN: PortPing = { state: "stand-in" };

const MAX_ERROR = 160;
/** Anything that looks like a provider key (Paystack sk_/pk_, Resend re_, Anthropic sk-ant-) or a bearer token. */
const KEY_LIKE = /\b(?:sk|pk|re|rk)[_-][A-Za-z0-9_-]{6,}\b|Bearer\s+\S+/g;

/** The provider's error as one short line a staff member can read, with the secrets (the ones the adapter holds, and anything key-like) blanked. */
export function pingError(e: unknown, secrets: readonly string[] = []): PortPing {
  let text = e instanceof Error ? e.message : typeof e === "string" ? e : "The provider did not answer.";
  for (const s of secrets) if (s && s.length >= 4) text = text.split(s).join("[hidden]");
  text = text.replace(KEY_LIKE, "[hidden]").replace(/\s+/g, " ").trim();
  if (!text) text = "The provider did not answer.";
  return { state: "error", error: text.length > MAX_ERROR ? `${text.slice(0, MAX_ERROR - 1)}…` : text };
}

/** Runs one read and turns its outcome into a ping answer. */
export async function pingWith(call: () => Promise<unknown>, secrets: readonly string[] = []): Promise<PortPing> {
  try {
    await call();
    return PING_OK;
  } catch (e) {
    return pingError(e, secrets);
  }
}
