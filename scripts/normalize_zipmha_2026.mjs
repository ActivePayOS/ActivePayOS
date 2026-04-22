import fs from "node:fs";
import path from "node:path";

const YEAR = 2026;

const RAW = path.join(process.cwd(), "data", "bah", "raw", "sorted_zipmha26.txt");
const OUT = path.join(process.cwd(), "data", "bah", "normalized", `${YEAR}.zipmha.json`);

function main() {
  if (!fs.existsSync(RAW)) {
    throw new Error(`Missing ZIP→MHA raw file at: ${RAW}
Put sorted_zipmha26.txt into data/bah/raw/`);
  }

  const txt = fs.readFileSync(RAW, "utf8");
  const lines = txt.split(/\r?\n/);

  const zipToMha = {};

  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;

    const parts = s.split(/\s+/);
    if (parts.length < 2) continue;

    const zip = parts[0];
    const mha = parts[1];

    if (!/^\d{5}$/.test(zip)) continue;
    if (!/^[A-Z0-9]{2}\d{3}$/.test(mha)) continue;

    zipToMha[zip] = mha;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify({ year: YEAR, generatedAt: new Date().toISOString(), zipToMha }, null, 2),
    "utf8"
  );

  console.log(`✅ Wrote ${OUT} with ${Object.keys(zipToMha).length} ZIPs`);
  console.log(`Example 02139 -> ${zipToMha["02139"] ?? "NOT FOUND"}`);
  console.log(`Example 22003 -> ${zipToMha["22003"] ?? "NOT FOUND"}`);
  console.log(`Example 90210 -> ${zipToMha["90210"] ?? "NOT FOUND"}`);
}

main();