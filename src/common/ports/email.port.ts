export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** A repeat with the same key sends nothing new. */
  idempotencyKey?: string;
  /** YY1: where an answer to this email goes (a reply+<token>@ address that reaches its support thread). */
  replyTo?: string;
}
/** An email Firstwish received, as the provider holds it (YY2: the webhook event carries no body, so it is fetched by id). */
export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  /** Header names in lower case. */
  headers: Record<string, string>;
}
export interface SentEmail {
  id: string;
}

/** Email (Resend, R12). Firstwish sends email only. */
export abstract class EmailPort {
  abstract send(email: OutgoingEmail): Promise<SentEmail>;
  /** The received email with this provider id, or null when the provider has none. Never called inside a database transaction. */
  abstract fetchReceived(id: string): Promise<ReceivedEmail | null>;
}
