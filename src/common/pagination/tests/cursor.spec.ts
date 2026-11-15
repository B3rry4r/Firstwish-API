import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { AppError } from "../../errors/app-error";
import { CursorQueryDto, decodeCursor, encodeCursor, toPage } from "../cursor";

describe("cursor pagination", () => {
  it("reads limit from a query string (non-canonical '5') and defaults to 20", () => {
    const q = plainToInstance(CursorQueryDto, { limit: "5" });
    expect(validateSync(q)).toEqual([]);
    expect(q.limit).toBe(5);
    expect(plainToInstance(CursorQueryDto, {}).limit).toBe(20);
  });

  it("refuses a limit outside 1 to 50", () => {
    for (const limit of ["0", "51", "2.5", "x"]) {
      expect(validateSync(plainToInstance(CursorQueryDto, { limit })).map((e) => e.property)).toEqual(["limit"]);
    }
  });

  it("pages with { items, nextCursor } and a null cursor on the last page", () => {
    const rows = [1, 2, 3].map((n) => ({ id: `id${n}`, at: n }));
    const first = toPage(rows, 2, (r) => ({ key: r.at, id: r.id }));
    expect(first.items.map((r) => r.id)).toEqual(["id1", "id2"]);
    expect(decodeCursor(first.nextCursor as string)).toEqual({ key: 2, id: "id2" });
    expect(toPage(rows.slice(2), 2, (r) => ({ key: r.at, id: r.id }))).toEqual({ items: [rows[2]], nextCursor: null });
  });

  it("refuses a cursor the server did not make, as 422 on the cursor field", () => {
    expect(encodeCursor({ key: "a", id: "b" })).toMatch(/^[A-Za-z0-9_-]+$/);
    try {
      decodeCursor("not-a-cursor");
      throw new Error("expected a refusal");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).getStatus()).toBe(422);
      expect((e as AppError).fields).toEqual({ cursor: "Must be a cursor from a previous page." });
    }
  });
});
