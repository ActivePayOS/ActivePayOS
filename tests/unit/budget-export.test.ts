// Tests for the Budget CSV/TXT export builders (summary-first + glossary +
// balanced money flow).

import { describe, expect, it } from "vitest";
import {
  generateBudgetCsv,
  generateBudgetTxt,
  type BudgetExport,
} from "@/lib/export/budget-summary";
import { generateBudgetPdf } from "@/lib/export/budget-pdf";
import { buildPaySummary } from "@/lib/export/summary";

const B: BudgetExport = {
  generatedOn: "2026-07-30",
  income: [
    { label: "Base Pay", monthly: 4000 },
    { label: "BAH", monthly: 2100 },
  ],
  expenses: [
    { label: "Housing", monthly: 1800 },
    { label: "Groceries", monthly: 600 },
    { label: "Fun money", monthly: 350 },
  ],
  totalIncome: 6100,
  totalExpense: 2750,
  leftover: 3350,
};

describe("generateBudgetCsv", () => {
  const csv = generateBudgetCsv(B);

  it("is summary-first: the SUMMARY block precedes the income table", () => {
    expect(csv.indexOf("SUMMARY")).toBeGreaterThan(-1);
    expect(csv.indexOf("SUMMARY")).toBeLessThan(csv.indexOf("Income,Monthly"));
    expect(csv).toContain("What it means");
    expect(csv).toContain("Leftover (income - expenses)");
  });

  it("threads glossary notes per line in a What-it-is column", () => {
    expect(csv).toContain("What it is");
    expect(csv).toMatch(/Housing,1800\.00,21600\.00,.+BAH/);
    // User-invented labels get an empty note, not a fabricated one.
    expect(csv).toMatch(/Fun money,350\.00,4200\.00,($|\r?\n)/);
  });

  it("uses \\n line endings and a trailing newline", () => {
    expect(csv).not.toContain("\r\n");
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("writes a balanced money flow with a leftover edge", () => {
    expect(csv).toContain("Total Income,Leftover / Unallocated,3350.00");
  });

  it("adds an Overspent edge when expenses exceed income", () => {
    const over = generateBudgetCsv({ ...B, totalExpense: 7000, leftover: -900 });
    expect(over).toContain("Overspent (not covered by income),Total Income,900.00");
    expect(over).not.toContain("Leftover / Unallocated");
  });

  it("embeds the pay context in combined reports", () => {
    const pay = buildPaySummary({
      year: 2026,
      grade: "E-5",
      yosLabel: "Over 6",
      zip5: "22003",
      receivesBah: true,
      dependents: true,
      stateOfLegalResidence: "VA",
      baseMonthly: 4000,
      bahMonthly: 2100,
      basMonthly: 465,
      otherMonthly: 0,
      generatedOn: "2026-07-30",
    });
    const combined = generateBudgetCsv({ ...B, pay });
    expect(combined).toContain("Pay context");
    expect(combined).toContain("Grade,E-5");
  });
});

describe("generateBudgetTxt", () => {
  const txt = generateBudgetTxt(B);

  it("is summary-first with explanations", () => {
    expect(txt.indexOf("SUMMARY")).toBeLessThan(txt.indexOf("Income"));
    expect(txt).toContain("Leftover (income - expenses):");
    expect(txt).toContain("$3,350.00/mo");
  });

  it("threads glossary notes as indented sub-lines", () => {
    expect(txt).toMatch(/Housing.+\n\s+- .+BAH/);
  });

  it("keeps the overspent verdict line", () => {
    const over = generateBudgetTxt({ ...B, totalExpense: 7000, leftover: -900 });
    expect(over).toContain("Overspent: $900.00/mo");
  });

  it("uses \\n line endings", () => {
    expect(txt).not.toContain("\r\n");
  });
});

describe("generateBudgetPdf", () => {
  it("renders (leftover box now leads, glossary notes grow rows)", async () => {
    const bytes = await generateBudgetPdf(B);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });
});
