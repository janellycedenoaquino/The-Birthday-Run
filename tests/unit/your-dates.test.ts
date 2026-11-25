import { describe, expect, it } from "vitest";
import type { LocalDate, Timing } from "@/lib/birthday/timing";
import { yourDates, yourDatesLine } from "@/lib/rewards/your-dates";

// M-279 (S-104 signed in): the user's own dates for one reward, through the timing module (NFR-5).
const d = (s: string) => s as LocalDate;
const june15 = { month: 6, day: 15 };
const week: Timing = { type: "from_birthday", days: 7 }; // Jun 15 – Jun 21
const month: Timing = { type: "birth_month" }; // Jun 1 – Jun 30

describe("yourDates (M-279)", () => {
  it("before it opens: the dates and 'Starts in N days'", () => {
    const y = yourDates(week, june15, d("2027-06-03"));
    expect([y.opens, y.closes]).toEqual(["2027-06-15", "2027-06-21"]);
    expect(y.status).toBe("Starts in 12 days");
  });

  it("the day before: 'Starts in 1 day'", () => {
    expect(yourDates(week, june15, d("2027-06-14")).status).toBe(
      "Starts in 1 day",
    );
  });

  it("while open: days left including today; the last day reads 'Ends today'", () => {
    expect(yourDates(week, june15, d("2027-06-15")).status).toBe("7 days left");
    expect(yourDates(week, june15, d("2027-06-21")).status).toBe("Ends today");
  });

  it("after it closed this cycle: next year's dates", () => {
    const y = yourDates(week, june15, d("2027-06-25"));
    expect([y.opens, y.closes]).toEqual(["2028-06-15", "2028-06-21"]);
    expect(y.status).toMatch(/^Starts in \d+ days$/);
  });

  it("birth month: the whole month", () => {
    const y = yourDates(month, june15, d("2027-06-10"));
    expect([y.opens, y.closes]).toEqual(["2027-06-01", "2027-06-30"]);
    expect(y.status).toBe("21 days left");
  });

  it("formats the line", () => {
    expect(yourDatesLine(yourDates(week, june15, d("2027-06-15")))).toBe(
      "Your dates: Jun 15 – Jun 21 · 7 days left",
    );
  });
});
