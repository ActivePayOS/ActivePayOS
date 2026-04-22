import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { fetchHtmlWithFallback } from "./lib/fetchHtml.mjs";

const YEAR = 2026;

// DFAS pages (authoritative) — may 403
const URLS = {
  CO: "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/Basic-Pay/CO/",
  CO_FE: "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/Basic-Pay/CO_FE/",
  WO: "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/Basic-Pay/WO/",
  EM: "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/Basic-Pay/EM/",
};

// Public mirror (often accessible when DFAS blocks automated traffic)
const NAVYCS_ALL = "https://www.navycs.com/charts/2026-military-pay-chart.html";

const HEADERS = [
  "2 or less","Over 2","Over 3","Over 4","Over 6","Over 8","Over 10","Over 12","Over 14","Over 16","Over 18",
  "Over 20","Over 22","Over 24","Over 26","Over 28","Over 30","Over 32","Over 34","Over 36","Over 38","Over 40"
];
const BREAKS = [2,3,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40];

const GRADES = {
  CO:    ["O-1","O-2","O-3","O-4","O-5","O-6","O-7","O-8","O-9","O-10"],
  CO_FE: ["O-1E","O-2E","O-3E"],
  WO:    ["W-1","W-2","W-3","W-4","W-5"],
  EM:    ["E-1","E-2","E-3","E-4","E-5","E-6","E-7","E-8","E-9"],
};

function normalizeGrade(s) {
  return String(s || "")
    .toUpperCase()
    // normalize unicode dashes to "-"
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/\s+/g, "")
    .trim();
}

function parseMoneyCell(s) {
  const t = String(s || "")
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();

  // match like 4150.20
  const m = t.match(/\d+(\.\d{2})?/);
  if (!m) return null;

  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function normalizeTo22(nums) {
  const out = new Array(22).fill(null);
  for (let i = 0; i < Math.min(22, nums.length); i++) out[i] = nums[i];
  return out;
}

function totalNumericCount(outTables) {
  let c = 0;
  for (const tbl of Object.values(outTables)) {
    for (const row of Object.values(tbl)) {
      for (const v of row) if (typeof v === "number" && Number.isFinite(v)) c++;
    }
  }
  return c;
}

let navyCache = null; // { html, sourceUrl }

async function fetchHtml(url) {
  const militarypayMirror = url.replace(
    "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/Basic-Pay/",
    "https://militarypay.defense.gov/Pay/Pay-Tables/Basic-Pay/"
  );

  const candidates = [url, militarypayMirror, NAVYCS_ALL];

  // cache NavyCS so we don't refetch 4x
  if (navyCache && candidates.includes(NAVYCS_ALL)) {
    // still try DFAS/MilitaryPay first each time; if those fail in your fetchHtmlWithFallback,
    // it will eventually hit NavyCS; caching that is handled below.
  }

  const { html, sourceUrl } = await fetchHtmlWithFallback(candidates);

  if (sourceUrl !== url) {
    console.warn(`↪️  Fallback used: ${url} -> ${sourceUrl}`);
  }

  if (sourceUrl === NAVYCS_ALL) {
    navyCache = { html, sourceUrl };
  }

  return { html, sourceUrl };
}

function extractGradeRowsFromHtml(html, gradesNeeded) {
  const $ = cheerio.load(html);
  const need = new Set(gradesNeeded.map(normalizeGrade));

  // Build map: grade -> 22 numbers
  const found = {};

  // Scan all table rows; match grade in first cell
  $("table tr").each((_, tr) => {
    const cells = $(tr).find("th,td").toArray().map((c) => $(c).text());
    if (cells.length < 2) return;

    const g = normalizeGrade(cells[0]);
    if (!need.has(g)) return;

    const nums = cells
      .slice(1)
      .map(parseMoneyCell)
      .filter((x) => typeof x === "number" && Number.isFinite(x));

    found[g] = normalizeTo22(nums);
  });

  // If we didn't find them in tables (some pages are weird), try "row-like" divs/lists
  // but only as a last resort.
  if (Object.keys(found).length === 0) {
    const text = $("body").text();
    for (const g0 of need) {
      const idx = text.toUpperCase().indexOf(g0);
      if (idx === -1) continue;
      const window = text.slice(idx, idx + 20000);
      const toks = window.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g) || [];
      const nums = toks.map((t) => Number(t.replace(/,/g, ""))).filter(Number.isFinite);
      found[g0] = normalizeTo22(nums.slice(0, 22));
    }
  }

  return found;
}

function tableHasAnyNumbers(table) {
  return Object.values(table).some((arr) => Array.isArray(arr) && arr.some((v) => typeof v === "number" && Number.isFinite(v)));
}

async function main() {
  const out = {
    year: YEAR,
    headers: HEADERS,
    breaks: BREAKS,
    sources: URLS,
    generatedAt: new Date().toISOString(),
    tables: {},
  };

  for (const [key, url] of Object.entries(URLS)) {
    const gradesNeeded = GRADES[key];
    const { html } = await fetchHtml(url);

    const extracted = extractGradeRowsFromHtml(html, gradesNeeded);

    // Build table in the original grade labels order
    const table = {};
    for (const g of gradesNeeded) {
      const ng = normalizeGrade(g);
      table[g] = extracted[ng] ?? normalizeTo22([]);
    }

    if (!tableHasAnyNumbers(table)) {
      console.warn(`⚠️ ${key}: parsed 0 numeric values (blocked/layout change).`);
    } else {
      const sample = gradesNeeded.find((g) => table[g].some((v) => typeof v === "number" && Number.isFinite(v)));
      console.log(`✅ ${key} sample ${sample}:`, table[sample].slice(0, 6));
    }

    out.tables[key] = table;
  }

  // Hard fail if parsing looks wrong so CI doesn't publish junk
  const n = totalNumericCount(out.tables);
  if (n < 200) {
    console.error(`❌ Base pay parse looks wrong (only ${n} numeric values). Failing so we don’t publish junk.`);
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), "data", "basepay");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${YEAR}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`✅ Wrote ${outPath}`);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
