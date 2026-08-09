import { describe, expect, it } from "vitest";
import { formatFullDate } from "./formatDate";

describe("formatFullDate", () => {
  it("formats a date as 'Mon D, YYYY'", () => {
    expect(formatFullDate("2026-07-20")).toBe("Jul 20, 2026");
  });

  it("does not zero-pad the day", () => {
    expect(formatFullDate("2026-01-05")).toBe("Jan 5, 2026");
  });

  it("handles the last day of the year", () => {
    expect(formatFullDate("2026-12-31")).toBe("Dec 31, 2026");
  });

  it("handles the first day of the year", () => {
    expect(formatFullDate("2026-01-01")).toBe("Jan 1, 2026");
  });
});
