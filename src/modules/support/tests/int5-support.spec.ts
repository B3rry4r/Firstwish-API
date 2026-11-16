import { PrismaService } from "../../../common/db/prisma.service";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { signSvix } from "../../../common/auth/svix";

const SECRET = "whsec_" + Buffer.from("int5-secret-0123456789abcdef").toString("base64");
let seq = 0;

/** INT-5 (YY2, YY3): Resend's received-email event carries no body; the guard's `resend` provider checks the signature. */
describe("INT-5 support webhook", () => {
  let t: TestApp;
  let db: PrismaService;
  beforeAll(async () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    t = await createTestApp();
    db = t.app.get(PrismaService);
  });
  afterAll(async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    await t.close();
  });

  const post = (path: string, data: Record<string, unknown>, secret = SECRET) => {
    const raw = JSON.stringify({ type: "email.received", data });
    const id = `msg_int5_${process.pid}_${++seq}_${Date.now()}`;
    const ts = Math.floor(t.clock.now().getTime() / 1000);
    return t.http().post(path).set("content-type", "application/json").set("svix-id", id).set("svix-timestamp", String(ts)).set("svix-signature", signSvix(secret, raw, id, ts)).send(raw);
  };

  it("YY2: an event with only the email id has its body fetched by id; the thread is opened from what was fetched", async () => {
    const from = `int5-${process.pid}-${Date.now()}@example.test`;
    t.email.received.set("em_fetch_1", { id: "em_fetch_1", from, to: ["support@example.test"], subject: "Fetched subject", text: "Fetched words from the provider.", headers: {} });
    const r = await post("/v1/webhooks/email/inbound", { email_id: "em_fetch_1" });
    expect(r.status).toBe(200);
    const th = await db.supportThread.findFirstOrThrow({ where: { contact: from } });
    expect(th).toMatchObject({ subject: "Fetched subject", body: "Fetched words from the provider." });
  });

  it("YY2: an email id the provider does not hold is refused (409) so the provider sends the event again, and nothing is kept", async () => {
    const r = await post("/v1/webhooks/email/inbound", { email_id: "em_none_1" });
    expect(r.status).toBe(409);
    expect(await db.webhookEvent.count({ where: { provider: "resend", payload: { path: ["emailId"], equals: "em_none_1" } } })).toBe(0);
  });

  it("YY3: the guard's resend provider refuses a wrong signature (401) before the service runs", async () => {
    const r = await post("/v1/webhooks/email/inbound", { email_id: "em_fetch_1" }, "whsec_" + Buffer.from("another-secret-0123456789abcdef").toString("base64"));
    expect(r.status).toBe(401);
  });
});
