import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const YEAR = 2026;

const URLS = {
  CO: "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/Basic-Pay/CO/",
  CO_FE: "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/Basic-Pay/CO_FE/",
  WO: "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/Basic-Pay/WO/",
  EM: "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/Basic-Pay/EM/",
};

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

function moneyTokens(s) {
  // returns ["4,150.20", ...]
  return (s.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g) || []);
}

function toNum(tok) {
  const n = Number(tok.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function collectForGrade(fullText, grade) {
  // DFAS sometimes repeats grade twice (table split into 2 sections).
  // We find ALL occurrences and accumulate the money tokens after each.
  const text = fullText.replace(/\u00A0/g, " ").replace(/\s+/g, " ");
  const idxs = [];
  let i = 0;
  while (true) {
    const j = text.indexOf(grade, i);
    if (j === -1) break;
    idxs.push(j);
    i = j + grade.length;
  }

  const tokens = [];
  for (const j of idxs) {
    const window = text.slice(j, j + 6000);
    const toks = moneyTokens(window);
    for (const t of toks) tokens.push(t);
  }

  // Convert to numbers, keep order, then dedupe consecutive duplicates
  const nums = tokens.map(toNum).filter((x) => typeof x === "number");
  const cleaned = [];
  for (const x of nums) {
    if (cleaned.length === 0 || cleaned[cleaned.length - 1] !== x) cleaned.push(x);
  }

  // We want exactly 22 columns. If DFAS page only shows 11 for this grade (rare), it'll stay short.
  return cleaned.slice(0, 22);
}

function sanity(tableObj) {
  return Object.values(tableObj).some((arr) => Array.isArray(arr) && arr.some((x) => typeof x === "number"));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });

  const result = {
    year: YEAR,
    headers: HEADERS,
    breaks: BREAKS,
    sources: URLS,
    tables: {},
    generatedAt: new Date().toISOString(),
  };

  for (const [key, url] of Object.entries(URLS)) {
    console.log(`\nLoading ${key}: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1200);

    // THIS is the important change:
    // pull the visible text the same way you see it in the browser
    const bodyText = await page.evaluate(() => document.body?.innerText || "");

    const table = {};
    for (const g of GRADES[key]) {
      table[g] = collectForGrade(bodyText, g);
    }

    if (!sanity(table)) {
      console.log(`⚠️ Parsed 0 numeric values for ${key}. (DFAS may be blocking or the page markup changed.)`);
    } else {
      const sample = GRADES[key].find((g) => table[g]?.some((x) => typeof x === "number"));
      console.log(`✅ Parsed ${key}. Sample ${sample}:`, table[sample].slice(0, 6));
    }

    result.tables[key] = table;
  }

  await browser.close();

  const outDir = path.join(process.cwd(), "data", "basepay");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${YEAR}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
  console.log(`\n✅ Wrote ${outPath}`);
}

main().catch((e) => {
  console.error("❌ Failed:", e);
  process.exit(1);
});
