import { createHash } from "node:crypto";
import { Money } from "../../money/money";
import { AiWritingPort, WriteRequest, WriteResult } from "../ai.port";
import { EmailPort, OutgoingEmail, SentEmail } from "../email.port";
import { PaymentsPort, PaymentStatus, StartPayment, StartedPayment, VerifiedPayment } from "../payments.port";
import { ScreenInput, ScreenResult, UploadScreeningPort } from "../screening.port";
import { hmacSha512Hex, signatureMatches } from "../signature";
import { SignUpload, SignedUpload, StoragePort, StoredObject } from "../storage.port";
import { Clock } from "../clock.port";

/*
 * In-process stand-ins for every provider. They never make a network call. Each keeps what it was asked to do,
 * so a test can read it back, and has a few helpers to set up the next answer.
 * Used only with PROVIDERS=standin, which the env check refuses in production.
 */

/** The host every stand-in URL uses. ".invalid" never resolves. */
export const STANDIN_HOST = "standin.invalid";
export const STANDIN_PAYSTACK_SECRET = "standin-paystack-secret";

export class StandinPayments extends PaymentsPort {
  readonly started: StartPayment[] = [];
  private readonly payments = new Map<string, { amount: Money; status: PaymentStatus; paidAt: Date | null }>();

  constructor(
    private readonly clock: Clock,
    readonly secret: string = STANDIN_PAYSTACK_SECRET,
  ) {
    super();
  }

  start(input: StartPayment): Promise<StartedPayment> {
    this.started.push(input);
    this.payments.set(input.reference, { amount: input.amount, status: "pending", paidAt: null });
    return Promise.resolve({
      reference: input.reference,
      authorizationUrl: `https://checkout.${STANDIN_HOST}/${encodeURIComponent(input.reference)}`,
      accessCode: `standin_${input.reference}`,
    });
  }

  /** Sets how a started payment ends, as the payer would at checkout. */
  settle(reference: string, status: PaymentStatus, amount?: Money): void {
    const p = this.payments.get(reference);
    if (!p) throw new Error(`No stand-in payment ${reference}`);
    this.payments.set(reference, { amount: amount ?? p.amount, status, paidAt: status === "success" ? this.clock.now() : null });
  }

  verify(reference: string): Promise<VerifiedPayment> {
    const p = this.payments.get(reference);
    if (!p) return Promise.reject(new Error(`No stand-in payment ${reference}`));
    return Promise.resolve({ reference, status: p.status, amount: p.amount, paidAt: p.paidAt });
  }

  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    return signatureMatches(this.secret, rawBody, signature);
  }

  /** The signature Paystack would send for this body. */
  sign(body: string | Buffer): string {
    return hmacSha512Hex(this.secret, body);
  }
}

export class StandinEmail extends EmailPort {
  readonly sent: (OutgoingEmail & { id: string })[] = [];
  private seq = 0;

  send(email: OutgoingEmail): Promise<SentEmail> {
    const repeat = email.idempotencyKey ? this.sent.find((e) => e.idempotencyKey === email.idempotencyKey) : undefined;
    if (repeat) return Promise.resolve({ id: repeat.id });
    const id = `standin-email-${++this.seq}`;
    this.sent.push({ ...email, id });
    return Promise.resolve({ id });
  }

  /** The last email sent to an address. */
  lastTo(to: string): (OutgoingEmail & { id: string }) | undefined {
    return [...this.sent].reverse().find((e) => e.to === to);
  }
}

export class StandinStorage extends StoragePort {
  private readonly objects = new Map<string, { bytes: Buffer; contentType: string }>();

  constructor(
    private readonly clock: Clock,
    readonly bucket = "standin-bucket",
  ) {
    super();
  }

  private sig(key: string, exp: number): string {
    return createHash("sha256").update(`${key}:${exp}`).digest("hex").slice(0, 16);
  }

  signUpload(input: SignUpload): Promise<SignedUpload> {
    const expiresAt = new Date(this.clock.now().getTime() + input.expiresInSeconds * 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000);
    const url = `https://storage.${STANDIN_HOST}/${this.bucket}/${encodeURI(input.key)}?expires=${exp}&signature=${this.sig(input.key, exp)}`;
    return Promise.resolve({ url, method: "PUT", headers: { "content-type": input.contentType }, expiresAt });
  }

  signDownload(key: string, expiresInSeconds: number): Promise<string> {
    const exp = Math.floor(this.clock.now().getTime() / 1000) + expiresInSeconds;
    return Promise.resolve(`https://storage.${STANDIN_HOST}/${this.bucket}/${encodeURI(key)}?expires=${exp}&signature=${this.sig(key, exp)}`);
  }

  /** Puts an object, as the browser's signed upload would. */
  put(key: string, bytes: Buffer, contentType: string): void {
    this.objects.set(key, { bytes, contentType });
  }

  head(key: string): Promise<StoredObject | null> {
    const o = this.objects.get(key);
    return Promise.resolve(o ? { size: o.bytes.length, contentType: o.contentType } : null);
  }

  readStart(key: string, bytes: number): Promise<Buffer | null> {
    const o = this.objects.get(key);
    return Promise.resolve(o ? o.bytes.subarray(0, bytes) : null);
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

export class StandinAiWriting extends AiWritingPort {
  readonly requests: WriteRequest[] = [];
  private readonly queued: string[] = [];

  /** Sets the next answers. Without one the answer is marked as stand-in text. */
  queue(...texts: string[]): void {
    this.queued.push(...texts);
  }

  write(input: WriteRequest): Promise<WriteResult> {
    this.requests.push(input);
    const text = this.queued.shift() ?? `[stand-in writing] ${input.prompt.slice(0, 80)}`;
    return Promise.resolve({ text, model: "standin" });
  }
}

export class StandinScreening extends UploadScreeningPort {
  readonly screened: ScreenInput[] = [];

  /** Clean unless the key contains "reject". */
  screen(input: ScreenInput): Promise<ScreenResult> {
    this.screened.push(input);
    return Promise.resolve(input.key.includes("reject") ? { verdict: "rejected", reason: "Rejected by the stand-in." } : { verdict: "clean" });
  }
}
