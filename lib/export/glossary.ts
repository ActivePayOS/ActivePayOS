// lib/export/glossary.ts
// Plain-English explanations for the terms that appear in exported reports.
// The copy is distilled from the site's own InfoDot / Explain popovers
// (components/InfoDot.tsx, components/Explain.tsx usages), so a member reading
// a CSV offline gets the same help as a member hovering an i-dot on the page.
//
// Rendered per format as:
//   CSV  - a "What it is" column
//   TXT  - an indented sub-line under the row
//   PDF  - a muted second line under the row label
//   XLSX - a note column beside the value (export-projection-xlsx pattern)

export const EXPORT_GLOSSARY: Record<string, string> = {
  "base pay":
    "Your taxable military salary, set by the DFAS pay table for your grade and years of service.",
  bah: "Basic Allowance for Housing - a tax-free housing allowance set by your duty ZIP and whether you have dependents.",
  bas: "Basic Allowance for Subsistence - a tax-free food allowance; it does not change with family size.",
  "other income": "Special pays and other recurring monthly income you entered.",
  "total pay": "Base pay plus allowances - gross monthly pay before taxes and deductions.",
  "total income": "Everything coming in each month, before any of it is assigned a job.",
  "total expenses": "Everything going out each month, including taxes, savings, and retirement you assign.",
  tsp: "The Thrift Savings Plan - the military's 401(k); contributions are a percent of base pay only, not BAH or BAS.",
  "brs match":
    "BRS agency money: 1% of base pay automatic, plus a match of 100% on your first 3% and 50% on your next 2% - worth 5% total when you contribute at least 5%.",
  sgli: "Servicemembers' Group Life Insurance - low-cost life insurance deducted from pay ($26/mo at the $500,000 maximum).",
  fica: "Social Security and Medicare payroll taxes, withheld from taxable wages.",
  "federal tax": "Federal income-tax withholding estimated from your taxable wages and filing status.",
  "state tax":
    "State income tax for your state of legal residence - your duty-station state never taxes military pay.",
  "state of legal residence":
    "The state whose laws tax your military pay - not your duty station.",
  ira: "An Individual Retirement Account you open yourself at a brokerage - separate from the TSP.",
  "401(k)":
    "A civilian employer retirement plan for after service; amounts here include any employer match.",
  "roth vs traditional":
    "Roth pays tax on contributions today; Traditional defers tax and pays it at withdrawal - the winner is whichever tax rate is higher.",
  "today's dollars":
    "The nominal total deflated by your inflation assumption - what it would buy in today's money.",
  leftover: "Income minus expenses - money without a job yet; assign it to savings, investing, or a goal.",
  overspent: "Expenses exceed income by this amount each month - the plan spends more than it brings in.",
  savings: "Cash savings - emergency fund and short-term goals in a high-yield savings account.",
  investments: "A taxable brokerage account - money invested outside retirement accounts.",
  "market growth": "Projected total minus what was contributed - the part compound growth did.",
  "total contributed": "Every dollar put in over the horizon, including starting balances.",
  "at separation":
    "Your combined balance the year you leave the service - after that, balances keep compounding without military pay.",
  "projected total":
    "Everything combined - TSP, IRA, 401(k), investments, and savings - at the end of the horizon, in future (nominal) dollars.",
  "expense ratio": "The annual fund fee netted out of returns - about $1 per $1,000 invested per year for each 0.1%.",
  "fee drag": "What fund expense ratios cost you in ending balance over the horizon, versus fee-free growth.",
  "4% rule":
    "A rough sustainable-withdrawal heuristic - about 4% of the balance per year - not a guarantee.",
  housing: "Rent or mortgage and housing costs - a common target is keeping this at or under BAH.",
  groceries: "Food at home - BAS is meant to cover the servicemember's own meals.",
  ets: "End of the current service obligation (ETS / EAOS) - the contract end date.",
  "gi bill": "Post-9/11 GI Bill education benefit; the tier grows with aggregate active service.",
  "emergency fund": "Three months of essential expenses is the standard first savings goal.",
  "debt payments": "Monthly payments toward balances owed - paying these down is a guaranteed return.",
};

// Ordered label -> glossary-key rules. First match wins, so more specific
// patterns (BRS match, expense ratio) come before broad ones (TSP, fees).
const LABEL_RULES: Array<[RegExp, string]> = [
  [/brs|agency match/, "brs match"],
  [/expense ratio/, "expense ratio"],
  [/fee drag|fees over|lost to fees/, "fee drag"],
  [/4%|four ?percent/, "4% rule"],
  [/^base pay/, "base pay"],
  [/\bbah\b/, "bah"],
  [/\bbas\b/, "bas"],
  [/^other income/, "other income"],
  [/^total (monthly )?pay/, "total pay"],
  [/^total income/, "total income"],
  [/^total expense/, "total expenses"],
  [/^total contributed|contributed/, "total contributed"],
  [/market growth/, "market growth"],
  [/at separation/, "at separation"],
  [/projected total/, "projected total"],
  [/today'?s (usd|dollars|\$)/, "today's dollars"],
  [/^in today'?s dollars/, "today's dollars"],
  [/state of legal residence/, "state of legal residence"],
  [/state tax/, "state tax"],
  [/federal tax/, "federal tax"],
  [/\bfica\b|social security/, "fica"],
  [/\bsgli\b/, "sgli"],
  [/\btsp\b|thrift savings/, "tsp"],
  [/401\s*\(?k\)?/, "401(k)"],
  [/\bira\b/, "ira"],
  [/roth|traditional/, "roth vs traditional"],
  [/^overspent/, "overspent"],
  [/^leftover/, "leftover"],
  [/emergency fund/, "emergency fund"],
  [/debt/, "debt payments"],
  [/^savings?\b/, "savings"],
  [/^invest/, "investments"],
  [/^housing$|^rent\b|^mortgage\b/, "housing"],
  [/^groceries|^food\b/, "groceries"],
  [/\bets\b|\beaos\b|contract end/, "ets"],
  [/gi bill/, "gi bill"],
];

/**
 * Look up the one-sentence explanation for a report line label.
 * Matches the exact glossary key first, then falls back to keyword rules
 * (so "TSP (5% traditional)" and "BAH (housing allowance)" both resolve).
 */
export function glossaryFor(lineLabel: string): string | undefined {
  const norm = (lineLabel || "").trim().toLowerCase().replace(/:$/, "");
  if (!norm) return undefined;
  if (EXPORT_GLOSSARY[norm]) return EXPORT_GLOSSARY[norm];
  for (const [re, key] of LABEL_RULES) {
    if (re.test(norm)) return EXPORT_GLOSSARY[key];
  }
  return undefined;
}
