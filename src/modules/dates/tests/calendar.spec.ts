import { nextOccurrence, occurrenceIn, todayIn } from "../calendar";

describe("calendar (B12)", () => {
  it("29 February falls on 28 February in a year without one, and on 29 February in a leap year", () => {
    expect(occurrenceIn("2000-02-29", 2027)).toBe("2027-02-28");
    expect(occurrenceIn("2000-02-29", 2028)).toBe("2028-02-29");
    expect(nextOccurrence("2000-02-29", "2027-01-10")).toEqual({ on: "2027-02-28", days: 49, years: 27 });
    expect(nextOccurrence("2000-02-29", "2027-02-28")).toEqual({ on: "2027-02-28", days: 0, years: 27 });
    expect(nextOccurrence("2000-02-29", "2027-03-01")).toEqual({ on: "2028-02-29", days: 365, years: 28 });
  });

  it("today counts as 0 days; a day just gone is next year's; a date still to come is its own", () => {
    expect(nextOccurrence("1990-05-17", "2027-05-17")).toEqual({ on: "2027-05-17", days: 0, years: 37 });
    expect(nextOccurrence("1990-05-17", "2027-05-18")).toEqual({ on: "2028-05-17", days: 365, years: 38 });
    expect(nextOccurrence("2027-06-01", "2027-01-10")).toEqual({ on: "2027-06-01", days: 142, years: 0 });
    expect(nextOccurrence("1990-12-31", "2027-12-31")).toEqual({ on: "2027-12-31", days: 0, years: 37 });
  });

  it("today is the calendar date in Lagos, whatever the server's zone", () => {
    expect(todayIn(new Date("2027-01-10T22:59:00Z"))).toBe("2027-01-10");
    expect(todayIn(new Date("2027-01-10T23:00:00Z"))).toBe("2027-01-11");
  });
});
