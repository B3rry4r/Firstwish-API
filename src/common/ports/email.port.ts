export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** A repeat with the same key sends nothing new. */
  idempotencyKey?: string;
}
export interface SentEmail {
  id: string;
}

/** Email (Resend, R12). Firstwish sends email only. */
export abstract class EmailPort {
  abstract send(email: OutgoingEmail): Promise<SentEmail>;
}
