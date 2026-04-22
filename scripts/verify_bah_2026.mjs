import fs from "node:fs";
import path from "node:path";

const zipmhaPath = path.join(process.cwd(), "data", "bah", "normalized", "2026.zipmha.json");
const withPath   = path.join(process.cwd(), "data", "bah", "normalized", "2026.with.json");
const withoutPath= path.join(process.cwd(), "data", "bah", "normalized", "2026.without.json");

function load(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing: ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const zipmha = load(zipmhaPath);
const withRates = load(withPath);
const withoutRates = load(withoutPath);

function check(zip) {
  const mha = zipmha?.zipToMha?.[zip];
  console.log(`ZIP ${zip} -> MHA ${mha ?? "NOT_FOUND"}`);

  const recW = mha ? withRates?.ratesByMha?.[mha] : null;
  const recWO = mha ? withoutRates?.ratesByMha?.[mha] : null;

  console.log(`  With:    record=${!!recW}  O-1=${recW?.rates?.["O-1"] ?? null}`);
  console.log(`  Without: record=${!!recWO} O-1=${recWO?.rates?.["O-1"] ?? null}`);
}

check("02139");
check("22003");
check("90210");

console.log(`✅ zipToMha keys: ${Object.keys(zipmha.zipToMha).length}`);