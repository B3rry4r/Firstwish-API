import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { appendFileSync, chmodSync, closeSync, fstatSync, openSync } from "node:fs";
import { EnvError } from "../../env/env";
import { ImageSizesPort, ResizeInput } from "../image-sizes.port";
import { Money } from "../../money/money";
import { AiWritingPort, WriteRequest, WriteResult } from "../ai.port";
import { EmailPort, OutgoingEmail, ReceivedEmail, SentEmail } from "../email.port";
import { PaymentsPort, PaymentStatus, StartPayment, StartedPayment, VerifiedPayment } from "../payments.port";
import { ScreenInput, ScreenResult, UploadScreeningPort } from "../screening.port";
import { hmacSha512Hex, signatureMatches } from "../signature";
import { SignUpload, SignedUpload, StoragePort, StoredObject } from "../storage.port";
import { Clock } from "../clock.port";
import { GoogleAuthorizationRequest, GoogleIdClaims, GoogleIdentityPort } from "../google.port";
import { decodePart } from "./google.adapter";
import { ProviderError } from "./http";
import { PING_STAND_IN, type PortPing } from "../ping";

/*
 * In-process stand-ins for every provider. They never make a network call. Each keeps what it was asked to do,
 * so a test can read it back, and has a few helpers to set up the next answer.
 * Used only with PROVIDERS=standin, which the env check refuses in production.
 */

/** The host every stand-in URL uses. ".invalid" never resolves. */
export const STANDIN_HOST = "standin.invalid";
export const STANDIN_PAYSTACK_SECRET = "standin-paystack-secret";

export class StandinPayments extends PaymentsPort {
  /** FB4: a stand-in calls nothing. */
  ping(): Promise<PortPing> {
    return Promise.resolve(PING_STAND_IN);
  }

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

/**
 * The outbox holds sign-in codes, so it is made for its owner alone (mode 0600, also when the file was there already), and a path
 * that cannot be written (a directory, a folder that is not there, no permission) is a config error when the app starts, not a
 * throw at the first send while the request still answers "sent".
 */
function prepareOutbox(path: string): void {
  const bad = (why: string): never => {
    throw new EnvError([{ name: "STANDIN_MAIL_OUTBOX", problem: `${why}: ${path} must be a file this app can write` }]);
  };
  let fd: number;
  try {
    fd = openSync(path, "a", 0o600);
  } catch (e) {
    return bad((e as NodeJS.ErrnoException).code === "EISDIR" ? "it is a directory" : `it cannot be opened for writing (${(e as NodeJS.ErrnoException).code ?? "error"})`);
  }
  try {
    if (!fstatSync(fd).isFile()) bad("it is not a file");
    chmodSync(path, 0o600);
  } finally {
    closeSync(fd);
  }
}

export class StandinEmail extends EmailPort {
  /** FB4: a stand-in calls nothing. */
  ping(): Promise<PortPing> {
    return Promise.resolve(PING_STAND_IN);
  }

  readonly sent: (OutgoingEmail & { id: string })[] = [];
  private seq = 0;

  /** HK1: when `outbox` names a file, each message is also appended there as one JSON line (to, template, subject, text, at). Unset: nothing is written. */
  constructor(private readonly outbox?: string) {
    super();
    if (outbox) prepareOutbox(outbox);
  }

  send(email: OutgoingEmail): Promise<SentEmail> {
    const repeat = email.idempotencyKey ? this.sent.find((e) => e.idempotencyKey === email.idempotencyKey) : undefined;
    if (repeat) return Promise.resolve({ id: repeat.id });
    const id = `standin-email-${++this.seq}`;
    this.sent.push({ ...email, id });
    if (this.outbox) {
      appendFileSync(this.outbox, `${JSON.stringify({ to: email.to, template: email.template ?? null, subject: email.subject, text: email.text, at: new Date().toISOString() })}\n`, { mode: 0o600 });
    }
    return Promise.resolve({ id });
  }

  /** Received mail the provider "holds", by its id (a test sets it; fetchReceived reads it, YY2). */
  readonly received = new Map<string, ReceivedEmail>();

  fetchReceived(id: string): Promise<ReceivedEmail | null> {
    return Promise.resolve(this.received.get(id) ?? null);
  }

  /** The last email sent to an address. */
  lastTo(to: string): (OutgoingEmail & { id: string }) | undefined {
    return [...this.sent].reverse().find((e) => e.to === to);
  }
}

export class StandinStorage extends StoragePort {
  /** FB4: a stand-in calls nothing. */
  ping(): Promise<PortPing> {
    return Promise.resolve(PING_STAND_IN);
  }

  private readonly objects = new Map<string, { bytes: Buffer; contentType: string }>();

  /**
   * `base` is where the urls point. Tests keep the host that never resolves; a stack points it at the API's own
   * /v1/standin-storage route (HP3), which serves the bytes of a stored object for a valid signed url.
   */
  constructor(
    private readonly clock: Clock,
    readonly bucket = "standin-bucket",
    private readonly base = `https://storage.${STANDIN_HOST}`,
  ) {
    super();
  }

  /** What each signed PUT bound (X26): the type and the exact length. */
  readonly bound = new Map<string, { contentType: string; contentLength: number }>();

  private sig(key: string, exp: number, bound = ""): string {
    return createHash("sha256").update(`${key}:${exp}:${bound}`).digest("hex").slice(0, 16);
  }

  signUpload(input: SignUpload): Promise<SignedUpload> {
    const expiresAt = new Date(this.clock.now().getTime() + input.expiresInSeconds * 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000);
    const sig = this.sig(input.key, exp, `${input.contentType}:${input.contentLength}`);
    const url = `${this.base}/${this.bucket}/${encodeURI(input.key)}?expires=${exp}&signature=${sig}`;
    this.bound.set(input.key, { contentType: input.contentType, contentLength: input.contentLength });
    const headers = { "content-type": input.contentType, "content-length": String(input.contentLength) };
    return Promise.resolve({ url, method: "PUT", headers, expiresAt });
  }

  /**
   * The browser's signed PUT, as storage takes it: refused (false, nothing stored) when the type or the length differs from what
   * the signature bound (X26). put() below stores without that check, for a test that sets storage up directly.
   */
  putSigned(key: string, bytes: Buffer, contentType: string): boolean {
    const b = this.bound.get(key);
    if (!b || b.contentType !== contentType || b.contentLength !== bytes.length) return false;
    this.objects.set(key, { bytes, contentType });
    return true;
  }

  /** HQ3: what a signed PUT url asked for (null when no upload was signed for the key). */
  boundFor(key: string): { contentType: string; contentLength: number } | null {
    return this.bound.get(key) ?? null;
  }

  /**
   * HQ3: the signed PUT as a real storage takes it. The signature binds the key, the expiry, the content type and the exact length,
   * so a wrong, expired or borrowed signature, another kind and another size are each refused and nothing is stored.
   */
  receive(key: string, expires: number, signature: string, contentType: string, bytes: Buffer): { ok: true } | { ok: false; status: number; message: string } {
    if (!Number.isFinite(expires) || expires * 1000 < this.clock.now().getTime()) return { ok: false, status: 403, message: "This upload link has expired." };
    const b = this.bound.get(key);
    if (!b) return { ok: false, status: 403, message: "This upload link is not valid." };
    if (signature !== this.sig(key, expires, `${b.contentType}:${b.contentLength}`)) return { ok: false, status: 403, message: "This upload link is not valid." };
    if (contentType !== b.contentType) return { ok: false, status: 403, message: "The file is not the kind this upload was asked for." };
    if (bytes.length !== b.contentLength) return { ok: false, status: 403, message: "The file is not the size this upload was asked for." };
    this.objects.set(key, { bytes, contentType });
    return { ok: true };
  }

  signDownload(key: string, expiresInSeconds: number): Promise<string> {
    const exp = Math.floor(this.clock.now().getTime() / 1000) + expiresInSeconds;
    return Promise.resolve(`${this.base}/${this.bucket}/${encodeURI(key)}?expires=${exp}&signature=${this.sig(key, exp)}`);
  }

  /** HP3: the bytes behind a signed download url, or null when the signature is wrong, the url has expired or there is no object. */
  serve(key: string, expires: number, signature: string): { bytes: Buffer; contentType: string } | null {
    if (!Number.isFinite(expires) || expires * 1000 < this.clock.now().getTime()) return null;
    if (signature !== this.sig(key, expires)) return null;
    const o = this.objects.get(key);
    return o ? { bytes: o.bytes, contentType: o.contentType } : null;
  }

  /** Puts an object, as the browser's signed upload would. */
  put(key: string, bytes: Buffer, contentType: string): void {
    this.objects.set(key, { bytes, contentType });
  }

  /** The server's own write (CA2). */
  putObject(key: string, bytes: Buffer, contentType: string): Promise<void> {
    this.put(key, Buffer.from(bytes), contentType);
    return Promise.resolve();
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

  copy(fromKey: string, toKey: string): Promise<void> {
    const o = this.objects.get(fromKey);
    if (!o) return Promise.reject(new Error(`No object at ${fromKey}`));
    this.objects.set(toKey, { bytes: Buffer.from(o.bytes), contentType: o.contentType });
    return Promise.resolve();
  }
}

/** The image-sizes stand-in (X22): records each request and makes nothing. */
export class StandinImageSizes extends ImageSizesPort {
  readonly made: ResizeInput[] = [];
  resize(input: ResizeInput): Promise<void> {
    this.made.push(input);
    return Promise.resolve();
  }
}

/**
 * HQ3: with nothing queued the stand-in answers in the shape each AI route asks for (the system text names it), so a request on a
 * stack is answered for real: a letter's paragraphs, the reasons, a photo order, a style change. Marked as stand-in text; any
 * other request gets the marked plain line.
 */
function standinAnswer(input: WriteRequest): string {
  const sys = input.system ?? "";
  const quoted = input.prompt.replace(/\s+/g, " ").slice(0, 80);
  if (sys.includes('"paras"')) return JSON.stringify({ paras: [`[stand-in writing] ${quoted}`] });
  if (sys.includes('"reasons"')) return JSON.stringify({ reasons: [{ title: "[stand-in writing]" }] });
  if (sys.includes('"order"')) {
    const n = Number(/There are (\d+) photos/.exec(input.prompt)?.[1] ?? 1);
    return JSON.stringify({ order: Array.from({ length: Math.max(1, n) }, (_, i) => i + 1) });
  }
  if (sys.includes("Studio style")) return JSON.stringify({ said: ["[stand-in writing] Nothing was changed."], ops: [] });
  return `[stand-in writing] ${input.prompt.slice(0, 80)}`;
}

export class StandinAiWriting extends AiWritingPort {
  /** FB4: a stand-in calls nothing. */
  ping(): Promise<PortPing> {
    return Promise.resolve(PING_STAND_IN);
  }

  readonly requests: WriteRequest[] = [];
  private readonly queued: string[] = [];

  /** Sets the next answers. Without one the answer is marked as stand-in text. */
  queue(...texts: string[]): void {
    this.queued.push(...texts);
  }

  write(input: WriteRequest): Promise<WriteResult> {
    this.requests.push(input);
    const text = this.queued.shift() ?? standinAnswer(input);
    return Promise.resolve({ text, model: "standin" });
  }
}

export class StandinScreening extends UploadScreeningPort {
  /** FB4: a stand-in calls nothing. */
  ping(): Promise<PortPing> {
    return Promise.resolve(PING_STAND_IN);
  }

  readonly screened: ScreenInput[] = [];

  /** Clean (score 0) unless the key contains "reject" (score 1, label "stand-in"). */
  screen(input: ScreenInput): Promise<ScreenResult> {
    this.screened.push(input);
    return Promise.resolve(
      input.key.includes("reject")
        ? { verdict: "rejected", score: 1, labels: ["stand-in"], reason: "Rejected by the stand-in." }
        : { verdict: "clean", score: 0, labels: [] },
    );
  }
}

/**
 * The stand-in: ID tokens are signed with a local test key (HS256). Tests make a token with signToken(), or a code with
 * issueCode() that exchangeCode() later trades for that token. No network.
 */
export class StandinGoogle extends GoogleIdentityPort {
  static readonly KEY = "standin-google-signing-key";
  private readonly codes = new Map<string, string>();
  readonly exchanged: { code: string; codeVerifier: string; redirectUri: string }[] = [];
  private seq = 0;

  authorizationUrl(r: GoogleAuthorizationRequest): string {
    const q = new URLSearchParams({ client_id: r.clientId, redirect_uri: r.redirectUri, state: r.state, code_challenge: r.codeChallenge });
    return `http://google.standin.local/authorize?${q.toString()}`;
  }

  signToken(claims: Record<string, unknown>, key = StandinGoogle.KEY): string {
    const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
    return `${head}.${body}.${createHmac("sha256", key).update(`${head}.${body}`).digest("base64url")}`;
  }

  /** A one-time code that exchangeCode() trades for a token with these claims. */
  issueCode(claims: Record<string, unknown>, key?: string): string {
    const code = `standin-google-code-${++this.seq}`;
    this.codes.set(code, this.signToken(claims, key));
    return code;
  }

  exchangeCode(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<{ idToken: string }> {
    this.exchanged.push(p);
    const idToken = this.codes.get(p.code);
    this.codes.delete(p.code);
    if (!idToken) return Promise.reject(new ProviderError("google", 400, "invalid_grant"));
    return Promise.resolve({ idToken });
  }

  verifySignature(idToken: string): Promise<GoogleIdClaims | null> {
    const [h, p, s] = idToken.split(".");
    if (!h || !p || !s) return Promise.resolve(null);
    const want = Buffer.from(createHmac("sha256", StandinGoogle.KEY).update(`${h}.${p}`).digest("base64url"));
    const given = Buffer.from(s);
    if (want.length !== given.length || !timingSafeEqual(want, given)) return Promise.resolve(null);
    return Promise.resolve(decodePart<GoogleIdClaims>(p));
  }
}
