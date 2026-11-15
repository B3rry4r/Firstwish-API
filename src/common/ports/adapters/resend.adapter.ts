import { EmailPort, OutgoingEmail, SentEmail } from "../email.port";
import { postJson } from "./http";

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
    });
    return { id: r.id };
  }
}
