import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, formatDateTime, formatRelativeTime, getInitials } from "./utils";

describe("formatCurrency", () => {
  it("formats a number as Brazilian Real currency (pt-BR, BRL)", () => {
    // Node's Intl can render the currency/amount separator as a plain space
    // or a non-breaking space depending on the bundled ICU data, so match
    // loosely on whitespace rather than asserting an exact byte sequence.
    expect(formatCurrency(1234.5)).toMatch(/^R\$\s1\.234,50$/);
    expect(formatCurrency(0)).toMatch(/^R\$\s0,00$/);
  });
});

describe("formatDate / formatDateTime", () => {
  it("formats a local Date as DD/MM/YYYY, and adds HH:MM for formatDateTime", () => {
    // Built from local Y/M/D components (not an ISO string) so both the
    // construction and the Intl formatting use the same local timezone,
    // keeping the assertion stable regardless of the machine running it.
    const date = new Date(2024, 2, 5); // 5 de março de 2024
    expect(formatDate(date)).toBe("05/03/2024");

    const dateTime = new Date(2024, 2, 5, 14, 30);
    expect(formatDateTime(dateTime)).toMatch(/05\/03\/2024.*14:30/);
  });
});

describe("getInitials / formatRelativeTime", () => {
  it("derives initials from a name and relative-time buckets from a timestamp", () => {
    expect(getInitials("paulo henrique")).toBe("PH");
    expect(getInitials("Madonna")).toBe("M");

    expect(formatRelativeTime(null)).toBe("—");
    expect(formatRelativeTime(new Date(Date.now() - 10_000).toISOString())).toBe("agora");
    expect(formatRelativeTime(new Date(Date.now() - 15 * 60_000).toISOString())).toBe("15min atrás");
    expect(formatRelativeTime(new Date(Date.now() - 5 * 3_600_000).toISOString())).toBe("5h atrás");
  });
});
