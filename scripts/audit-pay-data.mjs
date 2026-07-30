import fs from "node:fs";

const RAW_ZIP_MHA = "data/bah/raw/sorted_zipmha26.txt";
const NORMALIZED_ZIP_MHA = "data/bah/normalized/2026.zipmha.json";
const BAH_WITH = "data/bah/normalized/2026.with.json";
const BAH_WITHOUT = "data/bah/normalized/2026.without.json";
const BASE_PAY = "data/basepay/2026.json";
const BAS = "data/bas/2026.json";

const publishedBahGrades = [
  "E-1", "E-2", "E-3", "E-4", "E-5", "E-6", "E-7", "E-8", "E-9",
  "W-1", "W-2", "W-3", "W-4", "W-5",
  "O-1E", "O-2E", "O-3E",
  "O-1", "O-2", "O-3", "O-4", "O-5", "O-6", "O-7",
];

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function fail(message) {
  throw new Error(message);
}

function parseRawZipMha() {
  const rows = fs.readFileSync(RAW_ZIP_MHA, "utf8").split(/\r?\n/);
  const rawMap = new Map();

  for (const row of rows) {
    const [zip, mha] = row.trim().split(/\s+/);
    if (/^\d{5}$/.test(zip) && /^[A-Z0-9]{2}\d{3}$/.test(mha)) {
      rawMap.set(zip, mha);
    }
  }

  return rawMap;
}

function main() {
  const rawMap = parseRawZipMha();
  const zipMha = readJson(NORMALIZED_ZIP_MHA);
  const withRates = readJson(BAH_WITH);
  const withoutRates = readJson(BAH_WITHOUT);
  const basePay = readJson(BASE_PAY);
  const bas = readJson(BAS);

  const normalizedMap = zipMha.zipToMha;
  const normalizedEntries = Object.entries(normalizedMap);

  const missingFromNormalized = [...rawMap.keys()].filter((zip) => !(zip in normalizedMap));
  const extraInNormalized = Object.keys(normalizedMap).filter((zip) => !rawMap.has(zip));
  const mismatches = [...rawMap.entries()].filter(([zip, mha]) => normalizedMap[zip] !== mha);

  if (missingFromNormalized.length > 0) {
    fail(`Missing ${missingFromNormalized.length} ZIPs from normalized BAH map.`);
  }

  if (extraInNormalized.length > 0) {
    fail(`Normalized BAH map has ${extraInNormalized.length} ZIPs not in raw source.`);
  }

  if (mismatches.length > 0) {
    fail(`Normalized BAH map has ${mismatches.length} ZIP-to-MHA mismatches.`);
  }

  const uniqueMha = [...new Set(Object.values(normalizedMap))];
  const standardMha = uniqueMha.filter((mha) => !mha.startsWith("XX"));
  const nonstandardZipCount = normalizedEntries.filter(([, mha]) => mha.startsWith("XX")).length;

  const missingWithRecords = standardMha.filter((mha) => !withRates.ratesByMha[mha]);
  const missingWithoutRecords = standardMha.filter((mha) => !withoutRates.ratesByMha[mha]);

  if (missingWithRecords.length > 0 || missingWithoutRecords.length > 0) {
    fail(
      `Missing BAH rate records. with=${missingWithRecords.join(", ")} without=${missingWithoutRecords.join(", ")}`
    );
  }

  const missingGradeRates = [];
  for (const mha of standardMha) {
    for (const [label, dataset] of [
      ["with", withRates],
      ["without", withoutRates],
    ]) {
      const rates = dataset.ratesByMha[mha]?.rates ?? {};
      for (const grade of publishedBahGrades) {
        if (typeof rates[grade] !== "number") {
          missingGradeRates.push(`${mha}:${label}:${grade}`);
        }
      }
    }
  }

  if (missingGradeRates.length > 0) {
    fail(`Missing published BAH grade rates: ${missingGradeRates.slice(0, 10).join(", ")}`);
  }

  if (basePay.year !== 2026) fail("Base pay data year is not 2026.");
  if (bas.year !== 2026 && bas.data?.year !== 2026) fail("BAS data year is not 2026.");

  // --------------------------------------------------------------------------
  // Value-level checks. Structural checks above prove the tables are shaped
  // correctly; these pin a handful of known-good 2026 figures to the dollar so
  // a bad scrape / typo can't pass silently. Column index = position in the
  // `headers` array ("2 or less" = 0, "Over 3" = 2, "Over 4" = 3, ...).
  // Source: DFAS 2026 pay tables (3.8% raise) and the 2026 DFAS BAS memo.
  // --------------------------------------------------------------------------
  const KNOWN_2026_BASE_PAY = [
    { table: "EM", grade: "E-1", col: 0, expected: 2407.2 },
    { table: "EM", grade: "E-5", col: 4, expected: 4110.0 },
    { table: "WO", grade: "W-2", col: 0, expected: 4621.8 },
    { table: "CO", grade: "O-3", col: 3, expected: 7382.7 },
    { table: "CO", grade: "O-6", col: 0, expected: 8751.3 },
  ];
  for (const { table, grade, col, expected } of KNOWN_2026_BASE_PAY) {
    const actual = basePay.tables?.[table]?.[grade]?.[col];
    if (actual !== expected) {
      fail(`Base pay ${table}/${grade}[${col}] = ${actual}, expected ${expected}.`);
    }
  }

  if (basePay.e1UnderFourMonthsMonthly !== 2226.0) {
    fail(`E-1 under-4-months rate = ${basePay.e1UnderFourMonthsMonthly}, expected 2226.0.`);
  }

  // O-9/O-10 basic pay is capped by Executive Schedule Level II: every column
  // DFAS publishes for those grades is the same capped figure in 2026. A bad
  // regeneration that loses the cap must fail here, not just in vitest.
  const SENIOR_OFFICER_CAP_2026 = 18999.9;
  for (const grade of ["O-9", "O-10"]) {
    const row = basePay.tables?.CO?.[grade] ?? [];
    const published = row.filter((v) => v !== null && v !== undefined);
    if (published.length === 0) {
      fail(`No published ${grade} base-pay values found.`);
    }
    const uncapped = published.find((v) => v !== SENIOR_OFFICER_CAP_2026);
    if (uncapped !== undefined) {
      fail(`${grade} base pay = ${uncapped}, expected the ${SENIOR_OFFICER_CAP_2026} cap in every published column.`);
    }
  }

  // BAH dollar golden (2026 DTMO): Boston (MA120) O-3 with dependents.
  const bostonO3WithDep = withRates.ratesByMha?.MA120?.rates?.["O-3"];
  if (bostonO3WithDep !== 5163) {
    fail(`BAH MA120/O-3 with dependents = ${bostonO3WithDep}, expected 5163.`);
  }

  const basRates = bas.rates ?? bas.data?.rates ?? {};
  const KNOWN_2026_BAS = { enlisted: 476.95, officers: 328.48 };
  for (const [key, expected] of Object.entries(KNOWN_2026_BAS)) {
    if (basRates[key] !== expected) {
      fail(`BAS ${key} rate = ${basRates[key]}, expected ${expected}.`);
    }
  }

  console.log("[ok] ActivePayOS pay data audit passed");
  console.log(`  raw ZIP-to-MHA entries: ${rawMap.size}`);
  console.log(`  normalized ZIP-to-MHA entries: ${Object.keys(normalizedMap).length}`);
  console.log(`  unique MHA codes: ${uniqueMha.length}`);
  console.log(`  standard MHA codes with rates: ${standardMha.length}`);
  console.log(`  non-standard mapped ZIPs flagged: ${nonstandardZipCount}`);
  console.log("  senior officer BAH lookup uses the top published local BAH tier (O-7).");
}

main();
