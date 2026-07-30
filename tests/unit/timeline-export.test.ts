// Tests for the promotion-timeline export builders (summary-first lead).

import { describe, expect, it } from "vitest";
import basepay2026 from "@/data/basepay/2026.json";
import { buildPromotionTimeline, type TimelineInputs } from "@/lib/promotion/timeline";
import type { BasePayDataset } from "@/lib/pay/basepay-lookup";
import { generateTimelineCsv } from "@/lib/export/timeline-csv";
import { generateTimelineTxt } from "@/lib/export/timeline-txt";
import { generateTimelinePdf } from "@/lib/export/timeline-pdf";

const INPUTS: TimelineInputs = {
  branch: "army",
  track: "enlisted",
  startGrade: "E-1",
  accessionDate: "2024-01-01",
  contractYears: 4,
  todayISO: "2026-01-01",
};

const RESULT = buildPromotionTimeline(INPUTS, basepay2026 as unknown as BasePayDataset);

describe("generateTimelineCsv", () => {
  const csv = generateTimelineCsv(RESULT, INPUTS, "2026-01-01");

  it("leads with a SUMMARY block: path, ETS, final pay", () => {
    expect(csv.indexOf("SUMMARY")).toBe(0);
    expect(csv.indexOf("SUMMARY")).toBeLessThan(csv.indexOf("Field,Value"));
    expect(csv).toContain("Projected path");
    expect(csv).toContain("Contract end (ETS / EAOS),2028-01-01");
    expect(csv).toContain("Final base pay (20-yr scenario");
    expect(csv).toContain("What it means");
  });

  it("keeps the event table and \\n endings", () => {
    expect(csv).toContain("Date,Time in service,Event");
    expect(csv).not.toContain("\r\n");
  });
});

describe("generateTimelineTxt", () => {
  const txt = generateTimelineTxt(RESULT, INPUTS, "2026-01-01");

  it("leads with the headline block before the timeline", () => {
    expect(txt.indexOf("SUMMARY")).toBeLessThan(txt.indexOf("Timeline"));
    expect(txt).toContain("Projected path:");
    expect(txt).toContain("2028-01-01");
  });
});

describe("generateTimelinePdf", () => {
  it("renders a PDF with the stat band", async () => {
    const bytes = await generateTimelinePdf(RESULT, INPUTS, "2026-01-01");
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });
});
