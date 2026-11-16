import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { StandinClock } from "../../src/common/ports/clock.port";
import { PaystackPayments } from "../../src/common/ports/adapters/paystack.adapter";
import { PaystackRefundProvider } from "../../src/common/ports/adapters/paystack-refund-provider";
import { PaystackPayoutProvider } from "../../src/common/ports/adapters/paystack-payout-provider";
import { ResendEmail } from "../../src/common/ports/adapters/resend.adapter";
import { AnthropicWriting } from "../../src/common/ports/adapters/anthropic.adapter";
import { S3Storage } from "../../src/common/ports/adapters/s3-storage.adapter";
import { BasicScreening } from "../../src/common/ports/adapters/basic-screening.adapter";
import { StandinAiWriting, StandinEmail, StandinPayments, StandinScreening, StandinStorage } from "../../src/common/ports/adapters/standins";
import { StandinPayoutProvider } from "../../src/common/ports/adapters/standin-payout-provider";
import { StandinRefundProvider } from "../../src/common/ports/adapters/standin-refund-provider";
import { type PortPing, pingError } from "../../src/common/ports/ping";
import { NoVideoRenderer, StandinVideoRenderer } from "../../src/modules/render-jobs/video-renderer";
import { PING_CACHE_MS, ProviderStatus } from "../../src/modules/staff-reads/provider-status";

/*
 * FB4: every provider port can be pinged. Real adapters are run here against a local HTTP server that plays the provider (the base URL
 * is a constructor argument): NOT RUN against Paystack, Resend, Anthropic or R2/Spaces themselves.
 */
const SECRET = "sk_live_VERYSECRETKEY123456";

interface Seen {
  method: string;
  url: string;
  auth: string | undefined;
  apiKey: string | undefined;
}

describe("FB4: ping on every port", () => {
  let server: Server;
  let base: string;
  const seen: Seen[] = [];
  let answer: { status: number; body: string } = { status: 200, body: "{}" };

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res) => {
      seen.push({ method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization, apiKey: req.headers["x-api-key"] as string | undefined });
      res.writeHead(answer.status, { "content-type": "application/json" });
      res.end(answer.body);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    seen.length = 0;
    answer = { status: 200, body: "{}" };
  });

  it("the real adapters make one authenticated GET and answer ok", async () => {
    const asks: [string, () => Promise<PortPing>, string][] = [
      ["payments", () => new PaystackPayments(SECRET, undefined, base).ping(), "/transaction?perPage=1"],
      ["refunds", () => new PaystackRefundProvider(SECRET, base).ping(), "/refund?perPage=1"],
      ["payouts", () => new PaystackPayoutProvider(SECRET, base).ping(), "/transfer?perPage=1"],
      ["email", () => new ResendEmail("re_KEY1234567", "Firstwish <a@b.example>", base).ping(), "/domains"],
      ["ai", () => new AnthropicWriting("sk-ant-KEY123456", "model", base).ping(), "/v1/models?limit=1"],
    ];
    for (const [name, call, path] of asks) {
      seen.length = 0;
      expect(await call()).toEqual({ state: "ok" });
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ method: "GET", url: path });
      expect([name, Boolean(seen[0].auth ?? seen[0].apiKey)]).toEqual([name, true]);
    }
  });

  it("the provider's error comes back short, and no secret is in it, even when the provider echoes the key", async () => {
    answer = { status: 401, body: JSON.stringify({ status: false, message: `Invalid key ${SECRET} (Bearer ${SECRET})`, pad: "x".repeat(400) }) };
    for (const p of [await new PaystackPayments(SECRET, undefined, base).ping(), await new PaystackRefundProvider(SECRET, base).ping(), await new PaystackPayoutProvider(SECRET, base).ping()]) {
      expect(p.state).toBe("error");
      const text = JSON.stringify(p);
      expect(text).toContain("401");
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain("VERYSECRET");
      expect(text.length).toBeLessThan(260);
    }
    const ai = await new AnthropicWriting("sk-ant-api03-REALLYSECRET", "m", base).ping();
    expect(ai.state).toBe("error");
    expect(JSON.stringify(ai)).not.toContain("REALLYSECRET");
  });

  it("storage: one HEAD of the bucket; a refusal is an error without the keys", async () => {
    const cfg = { driver: "r2" as const, endpoint: base, region: "auto", bucket: "firstwish-int6", accessKeyId: "AKIDEXAMPLE12345", secretAccessKey: "SECRETACCESSKEYEXAMPLE99" };
    expect(await new S3Storage(cfg).ping()).toEqual({ state: "ok" });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("HEAD");
    expect(seen[0].url).toContain("firstwish-int6");
    answer = { status: 403, body: "<Error><Code>AccessDenied</Code></Error>" };
    const bad = await new S3Storage(cfg).ping();
    expect(bad.state).toBe("error");
    expect(JSON.stringify(bad)).not.toMatch(/AKIDEXAMPLE|SECRETACCESSKEY/);
  });

  it("Resend: a key that may only send (401 restricted_api_key) is a good key; any other 401 is an error", async () => {
    answer = { status: 401, body: JSON.stringify({ name: "restricted_api_key", message: "This API key is restricted to only send emails" }) };
    expect(await new ResendEmail("re_KEY1234567", "a@b.example", base).ping()).toEqual({ state: "ok" });
    answer = { status: 401, body: JSON.stringify({ name: "validation_error", message: "API key is invalid re_KEY1234567" }) };
    const bad = await new ResendEmail("re_KEY1234567", "a@b.example", base).ping();
    expect(bad.state).toBe("error");
    expect(JSON.stringify(bad)).not.toContain("KEY1234567");
  });

  it("a provider that cannot be reached is an error, not a throw", async () => {
    const down = await new PaystackPayments(SECRET, undefined, "http://127.0.0.1:1").ping();
    expect(down.state).toBe("error");
    expect(JSON.stringify(down)).not.toContain(SECRET);
  });

  it("screening runs inside the app and says ok; stand-ins say stand-in and call nothing", async () => {
    expect(await new BasicScreening().ping()).toEqual({ state: "ok" });
    const clock = new StandinClock(new Date("2040-01-01T00:00:00Z"));
    const answers = await Promise.all([
      new StandinPayments(clock, "x").ping(), new StandinRefundProvider().ping(), new StandinPayoutProvider().ping(), new StandinEmail().ping(),
      new StandinStorage(clock).ping(), new StandinAiWriting().ping(), new StandinScreening().ping(), new StandinVideoRenderer().ping(),
    ]);
    for (const a of answers) expect(a).toEqual({ state: "stand-in" });
    expect(seen).toHaveLength(0);
    expect((await new NoVideoRenderer().ping()).state).toBe("error");
  });

  it("pingError blanks the given secrets and key-like words and cuts a long line", () => {
    const p = pingError(new Error(`bad ${SECRET} and sk_test_abcdef123456 and re_abcdef123456 ${"y".repeat(500)}`), [SECRET]);
    expect(p.state).toBe("error");
    const e = (p as { error: string }).error;
    expect(e).not.toMatch(/VERYSECRET|abcdef123456/);
    expect(e.length).toBeLessThanOrEqual(160);
  });

  describe("the staff Providers read (ProviderStatus)", () => {
    const fake = (ans: () => PortPing) => {
      const f = { calls: 0, ping: () => { f.calls++; return Promise.resolve(ans()); } };
      return f;
    };
    const build = (env: "live" | "standin", over: Partial<Record<"payments" | "refunds" | "payouts" | "email" | "storage" | "ai" | "screening" | "video", { calls: number; ping: () => Promise<PortPing> }>> = {}) => {
      const ok = () => fake(() => ({ state: "ok" }));
      const clock = new StandinClock(new Date("2040-01-01T00:00:00Z"));
      const ports = { payments: ok(), refunds: ok(), payouts: ok(), email: ok(), storage: ok(), ai: ok(), screening: ok(), video: ok(), ...over };
      const s = new ProviderStatus({ PROVIDERS: env } as never, clock, ports.payments as never, ports.refunds as never, ports.payouts as never, ports.email as never, ports.storage as never, ports.ai as never, ports.screening as never, ports.video as never);
      return { s, clock, ports };
    };

    it("connected only for the real adapters with every ping ok; never from old rows", async () => {
      const { s } = build("live");
      for (const key of ["payments", "email", "ai", "storage"]) expect(await s.state(key)).toEqual({ connected: true, line: "The provider answered a check just now." });
      expect(await s.state("nothing-like-this")).toMatchObject({ connected: false });
    });

    it("a failed ping, or one of the three Paystack ports failing, is not connected and names the provider's error without a secret", async () => {
      const email = fake(() => pingError(new Error(`resend answered 403: key ${SECRET} refused`), [SECRET]));
      const refunds = fake(() => pingError(new Error("paystack answered 401: Invalid key")));
      const { s } = build("live", { email, refunds });
      const mail = await s.state("email");
      expect(mail.connected).toBe(false);
      expect(mail.line).toContain("403");
      expect(mail.line).not.toContain("VERYSECRET");
      const pay = await s.state("payments");
      expect(pay.connected).toBe(false);
      expect(pay.line).toContain("Refunds: paystack answered 401");
      expect((await s.state("ai")).connected).toBe(true);
    });

    it("a ping that throws is an error, not a 500", async () => {
      const ai = { calls: 0, ping: () => Promise.reject(new Error("socket hang up")) };
      const { s } = build("live", { ai });
      expect(await s.state("ai")).toMatchObject({ connected: false, line: expect.stringContaining("socket hang up") });
    });

    it("stand-ins (and PROVIDERS=standin) read not connected and say so", async () => {
      const { s } = build("standin", { email: fake(() => ({ state: "stand-in" })) });
      expect(await s.state("email")).toEqual({ connected: false, line: "Running on stand-ins, so nothing real has been called." });
      const live = build("live", { email: fake(() => ({ state: "stand-in" })) });
      expect((await live.s.state("email")).connected).toBe(false);
      expect((await build("live", { video: new NoVideoRendererFake() as never }).s.state("video")).connected).toBe(false);
    });

    it("each port is pinged once a minute: asks within the minute share the answer; after it the provider is asked again; 30 at once make one ping", async () => {
      const { s, clock, ports } = build("live");
      await Promise.all(Array.from({ length: 30 }, () => s.state("email")));
      expect(ports.email.calls).toBe(1);
      clock.set(new Date(clock.now().getTime() + PING_CACHE_MS - 1000));
      await s.state("email");
      expect(ports.email.calls).toBe(1);
      clock.set(new Date(clock.now().getTime() + 2000));
      await s.state("email");
      expect(ports.email.calls).toBe(2);
    });
  });
});

class NoVideoRendererFake {
  ping(): Promise<PortPing> {
    return new NoVideoRenderer().ping();
  }
}
