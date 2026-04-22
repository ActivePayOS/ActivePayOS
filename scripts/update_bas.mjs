import fs from "node:fs";
import path from "node:path";
import { fetchHtmlWithFallback } from "./lib/fetchHtml.mjs";


const BEST_EFFORT = process.env.BEST_EFFORT === "1";

// Multiple sources because DFAS blocks GitHub Actions runners
const BAS_SOURCES = [
    // NavyCS tends to be easiest to scrape when .mil blocks
    "https://www.navycs.com/bas.html",
    // Some mirrors that sometimes work
    "https://militarypay.defense.gov/Pay/Pay-Tables/BAS/",
    "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/bas/",
  ];

function strip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLatest(text) {
  // Example: "January 1, 2026 $328.48 $476.95 $953.90"
  const re =
    /January\s+1,\s+(\d{4})\s+\$?(\d{1,3}\.\d{2})\s+\$?(\d{1,3}\.\d{2})\s+\$?(\d{1,4}\.\d{2})/i;

  const m = text.match(re);
  if (!m) return null;

  return {
    year: Number(m[1]),
    officers: Number(m[2]),
    enlisted: Number(m[3]),
    basII: Number(m[4]),
  };
}

function assertReasonable(latest) {
  // BAS values should be positive and in plausible ranges (monthly BAS).
  // This prevents writing zeros if parsing fails silently.
  const { year, officers, enlisted, basII } = latest;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`Invalid year parsed: ${year}`);
  }
  for (const [k, v] of Object.entries({ officers, enlisted, basII })) {
    if (!Number.isFinite(v) || v <= 0) throw new Error(`Invalid ${k} parsed: ${v}`);
  }
  if (officers < 200 || officers > 600) throw new Error(`Officers BAS out of range: ${officers}`);
  if (enlisted < 300 || enlisted > 800) throw new Error(`Enlisted BAS out of range: ${enlisted}`);
  if (basII < 600 || basII > 1500) throw new Error(`BAS II out of range: ${basII}`);
}

async function main() {
  const { html, sourceUrl } = await fetchHtmlWithFallback(BAS_SOURCES);
  console.log(`BAS source used: ${sourceUrl}`);

  const text = strip(html);
  const latest = parseLatest(text);

  if (!latest) {
    console.error("❌ Could not parse BAS table — source may be blocked or layout changed");
    process.exit(1);
  }

  // Validation gate
  try {
    assertReasonable(latest);
  } catch (e) {
    console.error(`❌ BAS validation failed: ${e.message}`);
    process.exit(1);
  }

  // ✅ Runtime schema (matches your app)
  const out = {
    year: latest.year,
    effectiveDate: `${latest.year}-01-01`,
    source: "DFAS/DoD (mirrors)",
    generatedAt: new Date().toISOString(),
    sourceUrl,
    rates: {
      officers: latest.officers,
      enlisted: latest.enlisted,
      basII: latest.basII,
    },
  };

  const outDir = path.join(process.cwd(), "data", "bas");
  fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, `${latest.year}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");

  console.log(`✅ Wrote ${outPath}`);
  console.log("BAS:", out);
}

main().catch((e) => {
  console.error("❌", e.message ?? e);
  if (BEST_EFFORT) {
    console.warn("⚠️ BEST_EFFORT=1 set — leaving existing BAS files untouched.");
    process.exit(0);
  }
  process.exit(1);
});