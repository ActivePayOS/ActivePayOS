import zipMha from "../data/bah/normalized/2026.zipmha.json";
import withRates from "../data/bah/normalized/2026.with.json";
import withoutRates from "../data/bah/normalized/2026.without.json";

const zipToMha = (zipMha as any).zipToMha as Record<string, string>;
const withByMha = (withRates as any).ratesByMha as Record<string, any>;
const withoutByMha = (withoutRates as any).ratesByMha as Record<string, any>;

console.log("ZIP count:", Object.keys(zipToMha).length);
console.log("MHA count (with):", Object.keys(withByMha).length);
console.log("MHA count (without):", Object.keys(withoutByMha).length);

// Spot-check zips (includes leading zero + ZIP+4)
const testZips = ["02139", "02138", "90210", "30301", "99501", "96815", "02139-1234"];
for (const z of testZips) {
  const mha = zipToMha[z.slice(0,5)];
  console.log(z, "->", mha ?? "MISSING");
  if (mha) {
    const rec = withByMha[mha];
    console.log("  exists in ratesByMha:", !!rec);
  }
}

// Consistency check: any zip->mha that has no rate record?
let missing = 0;
for (const [zip, mha] of Object.entries(zipToMha)) {
  if (!withByMha[mha] || !withoutByMha[mha]) missing++;
}

// Show first 10 broken mappings
let shown = 0;
for (const [zip, mha] of Object.entries(zipToMha)) {
  if (!withByMha[mha] && shown < 10) {
    console.log("Broken mapping:", zip, "->", mha);
    shown++;
  }
}
console.log("ZIP->MHA entries missing ratesByMha:", missing);