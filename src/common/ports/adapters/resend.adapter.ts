import { EmailPort, OutgoingEmail, ReceivedEmail, SentEmail } from "../email.port";
import { getJson, postJson, ProviderError } from "./http";
import { PING_OK, type PortPing, pingError } from "../ping";

export const RESEND_BASE_URL = "https://api.resend.com";

/** Resend (R12): POST /emails, with Idempotency-Key when given. */
export class ResendEmail extends EmailPort {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly baseUrl = RESEND_BASE_URL,
  ) {
    super();
  }

  async send(email: OutgoingEmail): Promise<SentEmail> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.apiKey}` };
    if (email.idempotencyKey) headers["idempotency-key"] = email.idempotencyKey;
    const r = await postJson<{ id: string }>("resend", `${this.baseUrl}/emails`, headers, {
      from: this.from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
      ...(email.replyTo ? { reply_to: [email.replyTo] } : {}),
    });
    return { id: r.id };
  }

  /**
   * FB4: one authenticated read of the domain list. A key that may only send answers 401 restricted_api_key: the key is good, so that
   * reads as ok. NOT RUN against Resend: the shape follows Resend's documentation.
   */
  async ping(): Promise<PortPing> {
    try {
      await getJson("resend", `${this.baseUrl}/domains`, { authorization: `Bearer ${this.apiKey}` });
      return PING_OK;
    } catch (e) {
      if (e instanceof ProviderError && e.status === 401 && /restricted_api_key/.test(e.message)) return PING_OK;
      return pingError(e, [this.apiKey]);
    }
  }

  /** GET /emails/receiving/:id. NOT RUN against Resend (YY2): the shape follows Resend's documentation. */
  async fetchReceived(id: string): Promise<ReceivedEmail | null> {
    try {
      const r = await getJson<{ id: string; from?: string; to?: string[]; subject?: string; text?: string | null; html?: string | null; headers?: Record<string, unknown> | null }>(
        "resend",
        `${this.baseUrl}/emails/receiving/${encodeURIComponent(id)}`,
        { authorization: `Bearer ${this.apiKey}` },
      );
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.headers ?? {})) if (typeof v === "string") headers[k.toLowerCase()] = v;
      return { id: r.id, from: r.from ?? "", to: r.to ?? [], subject: r.subject ?? "", text: r.text ?? "", html: r.html ?? undefined, headers };
    } catch (e) {
      if (e instanceof ProviderError && e.status === 404) return null;
      throw e;
    }
  }
}
