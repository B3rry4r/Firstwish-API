import { loadEnv } from "../../env/env";
import { Money } from "../../money/money";
import { StandinClock } from "../clock.port";
import { hmacSha512Hex } from "../signature";
import { PaystackPayments } from "../adapters/paystack.adapter";
import { ResendEmail } from "../adapters/resend.adapter";
import { AnthropicWriting } from "../adapters/anthropic.adapter";
import { BasicScreening } from "../adapters/basic-screening.adapter";
import { R2_HOST_SUFFIX, S3Storage, s3ConfigFor } from "../adapters/s3-storage.adapter";
import { STANDIN_HOST, StandinAiWriting, StandinEmail, StandinPayments, StandinScreening, StandinStorage } from "../adapters/standins";
import { standinEnv } from "../../../../test/kit/env";

/** A fake fetch: records the call and answers with the given JSON. Real adapters point at a local test host. */
function fakeFetch(answer: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const spy = jest.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
    calls.push({ url: url instanceof Request ? url.url : url instanceof URL ? url.href : url, init: init ?? {} });
    return Promise.resolve(new Response(JSON.stringify(answer), { status: 200 }));
  });
  return { calls, restore: () => spy.mockRestore() };
}
const TEST_HOST = "http://provider.test";

describe("storage: one S3 port, r2 and spaces differ only by config", () => {
  const live = { ...standinEnv(), PROVIDERS: "live" };
  const r2 = loadEnv({ ...live, PAYSTACK_SECRET_KEY: "x", PAYSTACK_PUBLIC_KEY: "x", PAYSTACK_CALLBACK_URL: "http://localhost/cb", GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "x", GOOGLE_REDIRECT_URI: "http://localhost/g", SCREENING_PROVIDER: "basic", ANTHROPIC_API_KEY: "x", ANTHROPIC_MODEL: "m", RESEND_API_KEY: "x", STORAGE_DRIVER: "r2", R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s", R2_BUCKET: "wishes" });
  const spaces = { ...r2, STORAGE_DRIVER: "spaces" as const, SPACES_ENDPOINT: "http://spaces.test", SPACES_REGION: "fra1", SPACES_ACCESS_KEY_ID: "k", SPACES_SECRET_ACCESS_KEY: "s", SPACES_BUCKET: "wishes" };

  it("builds each adapter's endpoint from its own variables", () => {
    expect(s3ConfigFor(r2)).toEqual({ driver: "r2", endpoint: `https://acct.${R2_HOST_SUFFIX}`, region: "auto", bucket: "wishes", accessKeyId: "k", secretAccessKey: "s" });
    expect(s3ConfigFor(spaces)).toEqual({ driver: "spaces", endpoint: "http://spaces.test", region: "fra1", bucket: "wishes", accessKeyId: "k", secretAccessKey: "s" });
  });

  it("signs uploads locally against the configured endpoint (no network)", async () => {
    const s = new S3Storage(s3ConfigFor(spaces));
    const up = await s.signUpload({ key: "u/1/photo.jpg", contentType: "image/jpeg", contentLength: 2048, expiresInSeconds: 300 });
    expect(up.method).toBe("PUT");
    expect(new URL(up.url).host).toBe("wishes.spaces.test");
    expect(up.url).toContain("X-Amz-Signature=");
    expect(await s.signDownload("u/1/photo.jpg", 60)).toContain("X-Amz-Expires=60");
  });
});

describe("real adapters send the provider's request shape (fake fetch, local host)", () => {
  it("paystack initialize sends kobo and reads the authorization url", async () => {
    const f = fakeFetch({ status: true, message: "ok", data: { authorization_url: "http://pay.test/x", access_code: "ac", reference: "ref1" } });
    const p = new PaystackPayments("sk_test", "http://localhost/cb", TEST_HOST);
    const r = await p.start({ reference: "ref1", amount: Money.kobo(250000), email: "ada@example.com" });
    f.restore();
    expect(r).toEqual({ reference: "ref1", authorizationUrl: "http://pay.test/x", accessCode: "ac" });
    expect(f.calls[0].url).toBe(`${TEST_HOST}/transaction/initialize`);
    expect(JSON.parse(f.calls[0].init.body as string)).toMatchObject({ amount: 250000, currency: "NGN", callback_url: "http://localhost/cb" });
  });

  it("paystack verify maps status and amount to Money", async () => {
    const f = fakeFetch({ status: true, message: "ok", data: { status: "success", amount: 5000, paid_at: "2026-01-01T10:00:00.000Z", reference: "r" } });
    const v = await new PaystackPayments("sk", undefined, TEST_HOST).verify("r");
    f.restore();
    expect(v.status).toBe("success");
    expect(v.amount.kobo).toBe(5000);
  });

  it("paystack checks the HMAC-SHA512 signature of the raw body", () => {
    const p = new PaystackPayments("sk_test", undefined, TEST_HOST);
    const body = Buffer.from('{"event":"charge.success"}');
    expect(p.verifySignature(body, hmacSha512Hex("sk_test", body))).toBe(true);
    expect(p.verifySignature(body, hmacSha512Hex("other", body))).toBe(false);
    expect(p.verifySignature(body, undefined)).toBe(false);
  });

  it("resend posts the email with an idempotency key", async () => {
    const f = fakeFetch({ id: "em_1" });
    const r = await new ResendEmail("re_key", "wishes@example.test", TEST_HOST).send({ to: "ada@example.com", subject: "Hi", text: "Hello", idempotencyKey: "k1" });
    f.restore();
    expect(r.id).toBe("em_1");
    expect((f.calls[0].init.headers as Record<string, string>)["idempotency-key"]).toBe("k1");
    expect(JSON.parse(f.calls[0].init.body as string)).toMatchObject({ from: "wishes@example.test", to: ["ada@example.com"] });
  });

  it("anthropic sends the model from config and joins the text blocks", async () => {
    const f = fakeFetch({ model: "model-x", content: [{ type: "text", text: "Dear " }, { type: "text", text: "Ada" }] });
    const r = await new AnthropicWriting("key", "model-x", TEST_HOST).write({ prompt: "Write", maxTokens: 100 });
    f.restore();
    expect(r).toEqual({ text: "Dear Ada", model: "model-x" });
    expect(f.calls[0].url).toBe(`${TEST_HOST}/v1/messages`);
    expect(JSON.parse(f.calls[0].init.body as string)).toMatchObject({ model: "model-x", max_tokens: 100 });
  });
});

describe("basic screening", () => {
  const s = new BasicScreening();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  it("passes a file whose bytes match its type", async () => {
    expect(await s.screen({ key: "a.png", contentType: "image/png", size: 10, head: png })).toEqual({ verdict: "clean", score: 0, labels: [] });
  });
  it("rejects a file that is not what its type says, or a type the app does not take", async () => {
    expect((await s.screen({ key: "a.jpg", contentType: "image/jpeg", size: 10, head: png })).verdict).toBe("rejected");
    expect((await s.screen({ key: "a.exe", contentType: "application/x-msdownload", size: 10, head: png })).verdict).toBe("rejected");
  });
});

describe("stand-ins", () => {
  const clock = new StandinClock(new Date("2026-01-01T00:00:00Z"));
  it("payments start, settle, verify and sign", async () => {
    const p = new StandinPayments(clock);
    const started = await p.start({ reference: "r1", amount: Money.kobo(100), email: "a@b.co" });
    expect(new URL(started.authorizationUrl).hostname.endsWith(STANDIN_HOST)).toBe(true);
    expect((await p.verify("r1")).status).toBe("pending");
    p.settle("r1", "success");
    expect(await p.verify("r1")).toMatchObject({ status: "success", paidAt: clock.now() });
    expect(p.verifySignature(Buffer.from("x"), p.sign("x"))).toBe(true);
  });
  it("email keeps the outbox and honours idempotency keys", async () => {
    const e = new StandinEmail();
    const a = await e.send({ to: "a@b.co", subject: "s", text: "t", idempotencyKey: "k" });
    const b = await e.send({ to: "a@b.co", subject: "s", text: "t", idempotencyKey: "k" });
    expect(a).toEqual(b);
    expect(e.sent).toHaveLength(1);
    expect(e.lastTo("a@b.co")?.subject).toBe("s");
  });
  it("storage signs, stores and expires by the stand-in clock", async () => {
    const s = new StandinStorage(clock);
    const up = await s.signUpload({ key: "k/1", contentType: "image/png", contentLength: 4, expiresInSeconds: 60 });
    expect(up.expiresAt.toISOString()).toBe("2026-01-01T00:01:00.000Z");
    expect(await s.head("k/1")).toBeNull();
    s.put("k/1", Buffer.from("abc"), "image/png");
    expect(await s.head("k/1")).toEqual({ size: 3, contentType: "image/png" });
    expect((await s.readStart("k/1", 2))?.toString()).toBe("ab");
  });
  it("ai answers queued text, else text marked as stand-in", async () => {
    const ai = new StandinAiWriting();
    ai.queue("A letter");
    expect((await ai.write({ prompt: "p", maxTokens: 10 })).text).toBe("A letter");
    expect((await ai.write({ prompt: "p", maxTokens: 10 })).text).toMatch(/^\[stand-in writing\]/);
  });
  it("screening rejects keys containing reject", async () => {
    const s = new StandinScreening();
    expect((await s.screen({ key: "x/reject.png", contentType: "image/png", size: 1, head: Buffer.alloc(1) })).verdict).toBe("rejected");
  });
  it("screening results carry score and labels (X21)", async () => {
    const s = new StandinScreening();
    expect(await s.screen({ key: "x/ok.png", contentType: "image/png", size: 1, head: Buffer.alloc(1) })).toEqual({ verdict: "clean", score: 0, labels: [] });
    const r = await s.screen({ key: "x/reject.png", contentType: "image/png", size: 1, head: Buffer.alloc(1) });
    expect(r).toMatchObject({ verdict: "rejected", score: 1, labels: ["stand-in"] });
    const b = await new BasicScreening().screen({ key: "a.exe", contentType: "application/x-msdownload", size: 10, head: Buffer.alloc(4) });
    expect(b).toMatchObject({ verdict: "rejected", score: 1 });
    expect((b as { labels: string[] }).labels.length).toBeGreaterThan(0);
  });
  it("a signed upload binds length and type: another length or type is refused, nothing stored (X26)", async () => {
    const s = new StandinStorage(clock);
    const up = await s.signUpload({ key: "k/2", contentType: "image/png", contentLength: 3, expiresInSeconds: 60 });
    expect(up.headers).toMatchObject({ "content-type": "image/png", "content-length": "3" });
    expect(s.putSigned("k/2", Buffer.from("abcd"), "image/png")).toBe(false);
    expect(s.putSigned("k/2", Buffer.from("abc"), "image/jpeg")).toBe(false);
    expect(await s.head("k/2")).toBeNull();
    expect(s.putSigned("k/2", Buffer.from("abc"), "image/png")).toBe(true);
    expect(await s.head("k/2")).toEqual({ size: 3, contentType: "image/png" });
    const other = await s.signUpload({ key: "k/2", contentType: "image/png", contentLength: 4, expiresInSeconds: 60 });
    expect(other.url).not.toBe(up.url);
  });
  it("the real adapter's signed PUT covers content-length and content-type (X26)", async () => {
    const s = new S3Storage(s3ConfigFor({ ...standinEnv(), STORAGE_DRIVER: "spaces", SPACES_ENDPOINT: "http://spaces.test", SPACES_REGION: "fra1", SPACES_ACCESS_KEY_ID: "k", SPACES_SECRET_ACCESS_KEY: "s", SPACES_BUCKET: "wishes" } as never));
    const up = await s.signUpload({ key: "u/1/p.png", contentType: "image/png", contentLength: 99, expiresInSeconds: 60 });
    const signed = new URL(up.url).searchParams.get("X-Amz-SignedHeaders") ?? "";
    expect(signed).toContain("content-length");
    expect(signed).toContain("content-type");
    expect(up.headers["content-length"]).toBe("99");
  });
  it("the stand-in token is random: two generators never repeat a token (X26)", async () => {
    const { StandinCodeGenerator } = await import("../ids.port");
    const a = new StandinCodeGenerator();
    const b = new StandinCodeGenerator();
    expect(a.token()).not.toBe(b.token());
    expect(a.token(16)).toHaveLength(Buffer.alloc(16).toString("base64url").length);
  });
  it("the clock moves only when told", () => {
    const c = new StandinClock(new Date("2026-01-01T00:00:00Z"));
    c.advance(3 * 24 * 3600 * 1000);
    expect(c.now().toISOString()).toBe("2026-01-04T00:00:00.000Z");
  });
});
