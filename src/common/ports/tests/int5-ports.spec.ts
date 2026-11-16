import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { maskEmail } from "../../normalise/mask-email";
import { ResendEmail } from "../adapters/resend.adapter";
import { StandinClock } from "../clock.port";
import { StandinEmail, StandinStorage } from "../adapters/standins";

/** INT-5 kernel: the masker, the email port's replyTo and received-email call, the storage port's server-side put. */
describe("INT-5 kernel ports", () => {
  let server: Server;
  let base: string;
  const seen: { url: string; headers: IncomingMessage["headers"]; body: string }[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c: Buffer) => (body += c.toString()));
      req.on("end", () => {
        seen.push({ url: req.url ?? "", headers: req.headers, body });
        res.setHeader("content-type", "application/json");
        if (req.url?.startsWith("/emails/receiving/em_missing")) {
          res.statusCode = 404;
          res.end('{"message":"not found"}');
        } else if (req.url?.startsWith("/emails/receiving/")) {
          res.end(JSON.stringify({ id: "em_1", from: "A <a@mail.test>", to: ["reply+x@mail.test"], subject: "Hello", text: "the words", headers: { "Auto-Submitted": "no" } }));
        } else res.end('{"id":"sent_1"}');
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("one email masker: first letter, three stars, the domain; no @ or no local part is three stars", () => {
    expect(maskEmail("ada@mail.com")).toBe("a***@mail.com");
    expect(maskEmail("a@b@mail.com")).toBe("a***@mail.com");
    expect(maskEmail("@mail.com")).toBe("***");
    expect(maskEmail("nothing")).toBe("***");
    expect(maskEmail("")).toBe("***");
  });

  it("YY1: the Resend adapter sends replyTo as reply_to, and nothing when there is none", async () => {
    const mail = new ResendEmail("key", "wishes@mail.test", base);
    await mail.send({ to: "a@b.test", subject: "s", text: "t", replyTo: "reply+tok@mail.test", idempotencyKey: "k1" });
    await mail.send({ to: "a@b.test", subject: "s", text: "t" });
    const [a, b] = seen.filter((s) => s.url === "/emails").map((s) => JSON.parse(s.body) as Record<string, unknown>);
    expect(a.reply_to).toEqual(["reply+tok@mail.test"]);
    expect(b).not.toHaveProperty("reply_to");
  });

  it("YY2: fetchReceived reads a received email by id (NOT RUN against Resend: a local server stands in); a 404 is null", async () => {
    const mail = new ResendEmail("key", "wishes@mail.test", base);
    expect(await mail.fetchReceived("em_1")).toEqual({ id: "em_1", from: "A <a@mail.test>", to: ["reply+x@mail.test"], subject: "Hello", text: "the words", html: undefined, headers: { "auto-submitted": "no" } });
    expect(await mail.fetchReceived("em_missing")).toBeNull();
    const standin = new StandinEmail();
    expect(await standin.fetchReceived("nope")).toBeNull();
    standin.received.set("em_9", { id: "em_9", from: "a@b.test", to: [], subject: "s", text: "t", headers: {} });
    expect((await standin.fetchReceived("em_9"))?.text).toBe("t");
  });

  it("CA2: the storage port's server-side put stores what the server gives it, as its own copy", async () => {
    const s = new StandinStorage(new StandinClock(new Date("2026-01-01T00:00:00Z")));
    const bytes = Buffer.from("card");
    await s.putObject("cards/1.png", bytes, "image/png");
    bytes[0] = 0;
    expect(await s.head("cards/1.png")).toEqual({ size: 4, contentType: "image/png" });
    expect((await s.readStart("cards/1.png", 4))?.toString()).toBe("card");
  });
});
