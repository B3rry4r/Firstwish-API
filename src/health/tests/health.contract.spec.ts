import { Body, Controller, Get, Post } from "@nestjs/common";
import { IsInt, IsString, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { Public } from "../../common/auth/decorators";
import { IsCanonEmail } from "../../common/validation/decorators";
import { createTestApp, TestApp } from "../../../test/kit/app";

class Inner {
  @IsInt() @Min(1) qty!: number;
}
class ProbeBody {
  @IsString() name!: string;
  @IsCanonEmail() email!: string;
  @ValidateNested() @Type(() => Inner) inner!: Inner;
}

/** Test-only routes to drive the error paths. */
@Controller("probe")
class ProbeController {
  @Public() @Post("echo") echo(@Body() body: ProbeBody) {
    return body;
  }
  @Public() @Get("boom") boom(): never {
    throw new Error("secret detail /srv/app/file.ts:12");
  }
}

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

describe("health and the error envelope (contract)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ controllers: [ProbeController] });
  });
  afterAll(() => t.close());

  it("GET /v1/health -> 200 { status, db, redis, version } with x-request-id", async () => {
    const res = await t.http().get("/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "ok", redis: "ok", version: expect.stringMatching(/^\d+\.\d+\.\d+/) });
    expect(res.headers["x-request-id"]).toMatch(REQUEST_ID);
  });

  it("is served only under /v1", async () => {
    expect((await t.http().get("/health")).status).toBe(404);
  });

  it("unknown route -> 404 envelope", async () => {
    const res = await t.http().get("/v1/nowhere");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "not_found", message: "No route GET /v1/nowhere.", requestId: res.headers["x-request-id"] } });
  });

  it("bad body -> 422 with fields, unknown fields refused", async () => {
    const res = await t.http().post("/v1/probe/echo").send({ name: 5, email: "nope", inner: { qty: 0 }, extra: true });
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({
      code: "validation_failed",
      message: "Some fields need fixing.",
      fields: { name: expect.any(String), email: "Must be an email address.", "inner.qty": expect.any(String), extra: "Not a known field." },
      requestId: res.headers["x-request-id"],
    });
  });

  it("good body is normalised (non-canonical email) and passed through", async () => {
    const res = await t.http().post("/v1/probe/echo").send({ name: "Ada", email: " ADA@Example.com ", inner: { qty: 2 } });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ name: "Ada", email: "ada@example.com", inner: { qty: 2 } });
  });

  it("malformed JSON -> 400 envelope", async () => {
    const res = await t.http().post("/v1/probe/echo").set("content-type", "application/json").send('{"name":');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: expect.stringMatching(/^bad_(request|json)$/), requestId: expect.stringMatching(REQUEST_ID) });
  });

  it("thrown error -> 500 with a plain message and no stack or detail", async () => {
    const res = await t.http().get("/v1/probe/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: "internal_error", message: "Something went wrong on our side.", requestId: res.headers["x-request-id"] } });
    expect(JSON.stringify(res.body)).not.toMatch(/secret detail|\.ts:|at /);
  });

  it("keeps a caller's own x-request-id, and replaces an unsafe one", async () => {
    const mine = await t.http().get("/v1/health").set("x-request-id", "web-req-12345678");
    expect(mine.headers["x-request-id"]).toBe("web-req-12345678");
    const unsafe = await t.http().get("/v1/nowhere").set("x-request-id", "<script>");
    expect(unsafe.headers["x-request-id"]).not.toBe("<script>");
    expect(unsafe.body.error.requestId).toBe(unsafe.headers["x-request-id"]);
  });

  it("CORS allows only the site's own origins, with credentials", async () => {
    const ok = await t.http().get("/v1/health").set("origin", "http://localhost:3000");
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(ok.headers["access-control-allow-credentials"]).toBe("true");
    const other = await t.http().get("/v1/health").set("origin", "http://evil.test");
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("health when the database is not there (contract)", () => {
  let t: TestApp;
  const saved = process.env.DATABASE_URL as string;
  beforeAll(async () => {
    const u = new URL(saved);
    u.pathname = "/fw_test_absent_db";
    process.env.DATABASE_URL = u.toString();
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
    process.env.DATABASE_URL = saved;
  });

  it("-> 503 envelope naming the database", async () => {
    const res = await t.http().get("/v1/health");
    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({ code: "service_unavailable", fields: { db: "down", redis: "ok" } });
    expect(res.body.error.message).toMatch(/database/);
  });
});
