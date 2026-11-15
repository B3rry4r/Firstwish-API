import { Controller, Get, HttpCode, Post } from "@nestjs/common";
import { CurrentPrincipal, Internal, Public, Roles, StaffRoles, WebhookSignature } from "../decorators";
import type { Principal } from "../principal";
import { createTestApp, TestApp } from "../../../../test/kit/app";

@Controller("probe-access")
class AccessProbe {
  @Public() @Get("public") open() {
    return { ok: true };
  }
  @Get("user") user(@CurrentPrincipal() p: Principal) {
    return p;
  }
  @Roles("creator") @Get("creator") creator() {
    return { ok: true };
  }
  @StaffRoles("finance") @Get("finance") finance() {
    return { ok: true };
  }
  @WebhookSignature("paystack") @Post("webhook") @HttpCode(200) hook() {
    return { ok: true };
  }
  @Internal() @Get("internal") internal() {
    return { ok: true };
  }
}

describe("access guard shells (contract)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ controllers: [AccessProbe] });
    t.tokens.set("person", { kind: "user", accountId: "a1", sides: ["person"] });
    t.tokens.set("creator", { kind: "user", accountId: "a2", sides: ["person", "creator"] });
    t.tokens.set("finance", { kind: "staff", staffId: "s1", roles: ["finance"] });
    t.tokens.set("owner", { kind: "staff", staffId: "s2", roles: ["owner"] });
    t.tokens.set("support", { kind: "staff", staffId: "s3", roles: ["support"] });
  });
  afterAll(() => t.close());
  const get = (path: string, token?: string) => {
    const r = t.http().get(`/v1/probe-access/${path}`);
    return token ? r.set("authorization", `Bearer ${token}`) : r;
  };

  it("public needs no token", async () => {
    expect((await get("public")).status).toBe(200);
  });

  it("a route with no decorator needs a signed-in user", async () => {
    const none = await get("user");
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe("unauthorized");
    expect((await get("user", "unknown-token")).status).toBe(401);
    const ok = await get("user", "person");
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ kind: "user", accountId: "a1", sides: ["person"] });
    expect((await get("user", "finance")).status).toBe(403);
  });

  it("role checks the user's sides", async () => {
    expect((await get("creator", "person")).status).toBe(403);
    expect((await get("creator", "creator")).status).toBe(200);
  });

  it("staff role checks staff roles; owner passes", async () => {
    expect((await get("finance", "creator")).status).toBe(403);
    expect((await get("finance", "support")).status).toBe(403);
    expect((await get("finance", "finance")).status).toBe(200);
    expect((await get("finance", "owner")).status).toBe(200);
  });

  it("webhook needs the provider signature over the raw body", async () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "r1" } });
    const good = await t.http().post("/v1/probe-access/webhook").set("content-type", "application/json").set("x-paystack-signature", t.payments.sign(body)).send(body);
    expect(good.status).toBe(200);
    const bad = await t.http().post("/v1/probe-access/webhook").set("content-type", "application/json").set("x-paystack-signature", t.payments.sign(body + " ")).send(body);
    expect(bad.status).toBe(401);
    expect((await t.http().post("/v1/probe-access/webhook").send(body)).status).toBe(401);
  });

  it("internal is refused through a proxy", async () => {
    expect((await get("internal")).status).toBe(200);
    expect((await get("internal").set("x-forwarded-for", "203.0.113.9")).status).toBe(403);
  });
});
