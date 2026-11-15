import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { normaliseEmail } from "../email";
import { normalisePhone } from "../phone";
import { canonicalHandle, handleProblem, normaliseHandle } from "../handle";
import { IsCanonEmail, IsCanonHandle, IsCanonPhone } from "../../validation/decorators";

describe("phone canon: E.164, default Nigeria", () => {
  it.each(["08031472093", "0803 147 2093", "+234 803 147 2093", "2348031472093", " +2348031472093 "])(
    "%s (non-canonical) gives +2348031472093",
    (input) => expect(normalisePhone(input)).toBe("+2348031472093"),
  );
  it("keeps a foreign number in its own country", () => {
    expect(normalisePhone("+44 20 7946 0958")).toBe("+442079460958");
  });
  it("refuses what is not a number", () => {
    expect(normalisePhone("12")).toBeNull();
    expect(normalisePhone("call me")).toBeNull();
  });
});

describe("email canon: trimmed, lowercased", () => {
  it("normalises a non-canonical spelling", () => {
    expect(normaliseEmail("  Ada.Obi@Example.COM ")).toBe("ada.obi@example.com");
  });
  it("refuses what is not an email", () => {
    expect(normaliseEmail("ada@")).toBeNull();
    expect(normaliseEmail("ada example.com")).toBeNull();
  });
});

describe("handle canon (R5)", () => {
  it("lowercases and drops a leading @ (non-canonical)", () => {
    expect(normaliseHandle(" @Ada.Obi ")).toBe("ada.obi");
  });
  it("applies the app's rules", () => {
    expect(handleProblem("ab")).toBe("Three or more characters.");
    expect(handleProblem("a".repeat(21))).toBe("Twenty characters at most.");
    expect(handleProblem("_ada")).toBe("Start and end with a letter or a number.");
    expect(handleProblem("ada.")).toBe("Start and end with a letter or a number.");
    expect(handleProblem("ad..a")).toBe("No two dots or underscores together.");
    expect(handleProblem("ad-a")).toBe("Only letters, numbers, dots and underscores.");
    expect(handleProblem(canonicalHandle("@Firstwish"))).toBe("@firstwish is taken.");
    expect(handleProblem("ada_obi.2")).toBeNull();
  });
});

describe("canon DTO decorators", () => {
  class Dto {
    @IsCanonEmail() email!: string;
    @IsCanonPhone() phone!: string;
    @IsCanonHandle() handle!: string;
  }
  it("rewrite non-canonical input to the canon", () => {
    const dto = plainToInstance(Dto, { email: " ADA@Example.com", phone: "08031472093", handle: "@Ada_Obi" });
    expect(validateSync(dto)).toEqual([]);
    expect(dto).toEqual({ email: "ada@example.com", phone: "+2348031472093", handle: "ada_obi" });
  });
  it("give plain reasons for bad input", () => {
    const errors = validateSync(plainToInstance(Dto, { email: "nope", phone: "12", handle: "@admin" }));
    const why = Object.fromEntries(errors.map((e) => [e.property, Object.values(e.constraints ?? {})[0]]));
    expect(why).toEqual({ email: "Must be an email address.", phone: "Must be a phone number.", handle: "@admin is taken." });
  });
});
