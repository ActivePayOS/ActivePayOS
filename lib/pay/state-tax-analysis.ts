// Home-state × duty-station analysis for active-duty military pay.
//
// Planning-level logic, not tax advice:
// - Under the SCRA, a duty-station state cannot tax the military pay of a
//   servicemember who is there on orders but legally resides elsewhere.
// - The state of legal residence (domicile) is the only state that can tax
//   military pay — and a number of states relieve some or all of that tax
//   when the member is stationed outside the state (see
//   stationedOutsideRelief in data/state-tax-context.ts).

import {
  getStateTaxContext,
  type StateTaxContext,
} from "@/data/state-tax-context";

export const OCONUS = "Overseas / OCONUS" as const;

export type MilitaryPayTaxOutcome =
  | "no_income_tax"
  | "exempt_everywhere"
  | "relief_stationed_outside"
  | "conditional_relief"
  | "partial_relief"
  | "taxed";

export type StationAnalysis = {
  homeCtx: StateTaxContext;
  /** null when stationed OCONUS */
  dutyCtx: StateTaxContext | null;
  stationedInHomeState: boolean;
  stationedOconus: boolean;
  outcome: MilitaryPayTaxOutcome;
  /** Planning rate (percent) to suggest for the take-home estimate. */
  suggestedRatePct: number;
  /** One-line verdict for the UI. */
  verdict: string;
  /** Longer explanation of why. */
  explanation: string;
  /** Conditions attached to any relief (day counts, abode tests, caps). */
  conditions: string | null;
  /** Things the analysis deliberately does not cover. */
  warnings: string[];
};

export function analyzeStationScenario(
  homeState: string,
  dutyLocation: string
): StationAnalysis | null {
  const homeCtx = getStateTaxContext(homeState);
  if (!homeCtx) return null;
  const stationedOconus = dutyLocation === OCONUS;
  const dutyCtx = stationedOconus ? null : getStateTaxContext(dutyLocation);
  if (!stationedOconus && !dutyCtx) return null;

  const stationedInHomeState = !stationedOconus && dutyLocation === homeState;
  const relief = homeCtx.stationedOutsideRelief;

  let outcome: MilitaryPayTaxOutcome;
  let suggestedRatePct: number;
  let verdict: string;
  let explanation: string;
  let conditions: string | null = null;

  if (homeCtx.category === "no_broad_wage_income_tax") {
    outcome = "no_income_tax";
    suggestedRatePct = 0;
    verdict = `${homeCtx.state} has no wage income tax — $0 state tax on military pay.`;
    explanation = `Your state of legal residence, ${homeCtx.state}, does not tax wages, and no duty-station state can tax a nonresident servicemember's military pay. Wherever you're stationed, the planning answer is 0%.`;
  } else if (homeCtx.category === "active_duty_pay_generally_exempt") {
    outcome = "exempt_everywhere";
    suggestedRatePct = 0;
    verdict = `${homeCtx.state} broadly exempts active-duty pay — 0% is the common planning answer.`;
    explanation = `${homeCtx.state} exempts or fully deducts active-duty military pay for its residents regardless of where you're stationed. Some members must still file to claim the exemption.`;
  } else if (!stationedInHomeState && relief) {
    const reliefApplies = !relief.oconusOnly || stationedOconus;
    if (!reliefApplies) {
      outcome = "taxed";
      suggestedRatePct = homeCtx.suggestedRatePct;
      verdict = `${homeCtx.state} still taxes your pay — its relief only applies overseas.`;
      explanation = `${homeCtx.state} taxes its residents' military pay wherever earned. Its stationed-away relief (${relief.headline.toLowerCase()}) applies only when stationed outside the U.S., so duty in ${dutyLocation} doesn't qualify.`;
      conditions = relief.conditions;
    } else if (relief.kind === "conditional_nonresident") {
      outcome = "conditional_relief";
      suggestedRatePct = relief.reliefRatePct;
      verdict = `${homeCtx.state} tax can drop to ~${relief.reliefRatePct}% — if you pass its nonresident tests.`;
      explanation = `${homeCtx.state} treats a member stationed elsewhere as a nonresident only when specific tests are met. If you meet them, military pay escapes ${homeCtx.state} tax; if not, the normal resident rules apply (~${homeCtx.suggestedRatePct}%).`;
      conditions = relief.conditions;
    } else if (relief.kind === "partial") {
      outcome = "partial_relief";
      suggestedRatePct = relief.reliefRatePct;
      verdict = `${homeCtx.state} gives partial relief while you're stationed away.`;
      explanation = `${homeCtx.state} taxes residents' military pay but offers a capped or situational break when stationed away. Whether you land near ${relief.reliefRatePct}% or the normal ~${homeCtx.suggestedRatePct}% depends on the conditions below.`;
      conditions = relief.conditions;
    } else {
      outcome = "relief_stationed_outside";
      suggestedRatePct = relief.reliefRatePct;
      verdict = `Stationed outside ${homeCtx.state}: military pay is ${
        relief.kind === "nonresident_treatment" ? "not " + homeCtx.state + "-source income" : "exempt"
      } — ~0%.`;
      explanation = `${relief.headline}. ${
        stationedOconus ? "An overseas station" : `Duty in ${dutyLocation}`
      } is outside ${homeCtx.state}, so the relief applies${
        stationedOconus
          ? ""
          : ` — and ${dutyLocation} cannot tax a nonresident's military pay either (SCRA)`
      }. If your LES still shows ${homeCtx.abbreviation} withholding, you can likely recover it at filing.`;
      conditions = relief.conditions;
    }
  } else {
    outcome = "taxed";
    suggestedRatePct = homeCtx.suggestedRatePct;
    if (stationedInHomeState) {
      verdict = `Stationed at home: ${homeCtx.state} taxes your military pay normally (~${homeCtx.suggestedRatePct}%).`;
      explanation = `You're stationed in your state of legal residence, so ${homeCtx.state} taxes your military pay under its ordinary resident rules.`;
    } else {
      verdict = `${homeCtx.state} taxes your pay wherever you're stationed (~${homeCtx.suggestedRatePct}%).`;
      explanation = `${homeCtx.state} taxes its residents' military pay regardless of duty station, and ${
        stationedOconus ? "an overseas assignment" : `duty in ${dutyLocation}`
      } doesn't change that. ${
        stationedOconus ? "" : `${dutyLocation} cannot tax you — the SCRA bars a duty-station state from taxing a nonresident's military pay.`
      }`.trim();
    }
  }

  const warnings: string[] = [];
  if (!stationedInHomeState && !stationedOconus) {
    warnings.push(
      `Civilian side income earned in ${dutyLocation} (an off-duty job, gig work) IS taxable by ${dutyLocation} — the SCRA protection covers military pay only.`
    );
  }
  warnings.push(
    "A civilian spouse may elect the servicemember's legal residence under the MSRRA — the best choice depends on the household, not just the member."
  );
  if (outcome !== "no_income_tax") {
    warnings.push(
      `Income sourced to ${homeCtx.state} (rental property, an in-state business) stays taxable there regardless of station.`
    );
  }
  warnings.push(
    "Planning estimate, not tax advice — confirm with your state's guidance, base legal/VITA, or a MilTax consultant before changing withholding."
  );

  return {
    homeCtx,
    dutyCtx,
    stationedInHomeState,
    stationedOconus,
    outcome,
    suggestedRatePct,
    verdict,
    explanation,
    conditions,
    warnings,
  };
}
