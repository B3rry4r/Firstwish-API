import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { Public } from "../../auth/decorators";
import { controlCharPath } from "../control-chars.pipe";
import { createTestApp, TestApp } from "../../../../test/kit/app";

/* AA3: control characters (tab and newline aside) are refused with 422 by one global check, never a 500. */

class NoteDto {
  @IsString()
  text!: string;
  @IsOptional()
  @IsString()
  other?: string;
}
class QDto {
  @IsOptional()
  @IsString()
  q?: string;
}

@Controller("control-chars-test")
class ControlCharsTestController {
  @Public()
  @Post()
  post(@Body() b: NoteDto) {
    return { text: b.text };
  }
  @Public()
  @Get()
  get(@Query() q: QDto) {
    return { q: q.q ?? null };
  }
}

describe("controlCharPath", () => {
  it("finds NUL, C0 controls and DEL, nested", () => {
    expect(controlCharPath({ a: "x\u0000y" }, "")).toBe("a");
    expect(controlCharPath({ a: { b: ["ok", "\u001Fbad"] } }, "")).toBe("a.b.1");
    expect(controlCharPath("\u007F", "t")).toBe("t");
  });
  it("lets tab, newline, carriage return and ordinary text through", () => {
    expect(controlCharPath({ a: "line1\nline2\r\n\tok", b: "Ünïcode ✓ 😀" }, "")).toBeNull();
  });
});

describe("the global control-character check", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ controllers: [ControlCharsTestController] });
  });
  afterAll(() => t.close());

  it.each(["a\u0000b", "bell\u0007", "esc\u001B[0m", "del\u007F"])("refuses %j in a body with 422 naming the field", async (text) => {
    const r = await t.http().post("/v1/control-chars-test").send({ text });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).toContain("text");
  });

  it("refuses a control character in a query value with 422", async () => {
    const r = await t.http().get("/v1/control-chars-test").query({ q: "a\u0000b" });
    expect(r.status).toBe(422);
  });

  it("takes tabs and newlines", async () => {
    const r = await t.http().post("/v1/control-chars-test").send({ text: "a\tb\nc" });
    expect(r.status).toBe(201);
  });
});
