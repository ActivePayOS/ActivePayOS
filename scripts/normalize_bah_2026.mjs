import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const YEAR = 2026;

const RAW_XLSX = path.join(process.cwd(), "data", "bah", "raw", "2026 BAH Rates.xlsx");
const OUT_WITH = path.join(process.cwd(), "data", "bah", "normalized", `${YEAR}.with.json`);
const OUT_WITHOUT = path.join(process.cwd(), "data", "bah", "normalized", `${YEAR}.without.json`);

function mapColToPayGrade(col) {
  const c = String(col || "").trim();
  if (/^E(\d{2})$/.test(c)) return `E-${Number(c.slice(1))}`;
  if (/^W(\d{2})$/.test(c)) return `W-${Number(c.slice(1))}`;
  if (/^O(\d{2})E$/.test(c)) return `O-${Number(c.slice(1, 3))}E`;
  if (/^O(\d{2})$/.test(c)) return `O-${Number(c.slice(1))}`;
  return null;
}

function toStr(v) {
  return String(v ?? "").replace(/\u00A0/g, " ").trim(); // kill NBSP
}

function findHeaderRow(grid) {
  // Scan first ~50 rows to find the header row that contains MHA and MHA_NAME
  for (let r = 0; r < Math.min(50, grid.length); r++) {
    const row = grid[r] || [];
    const cells = row.map(toStr);
    const hasMha = cells.includes("MHA");
    const hasMhaName = cells.includes("MHA_NAME");
    if (hasMha && hasMhaName) return r;
  }
  return -1;
}

function parseSheet(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);

  // Read as array-of-arrays (this is the safest approach for weird Excel formats)
  const grid = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });

  if (!Array.isArray(grid) || grid.length < 5) {
    throw new Error(`Sheet ${sheetName} looks empty or malformed`);
  }

  const headerRowIndex = findHeaderRow(grid);
  if (headerRowIndex === -1) {
    // Print a hint of the first few rows so we can see what's going on
    console.log(`--- DEBUG: first 5 rows of "${sheetName}" ---`);
    console.log(grid.slice(0, 5));
    throw new Error(`Could not find header row containing "MHA" and "MHA_NAME" on sheet ${sheetName}`);
  }

  const headers = (grid[headerRowIndex] || []).map(toStr);

  const idxMha = headers.indexOf("MHA");
  const idxMhaName = headers.indexOf("MHA_NAME");

  if (idxMha === -1 || idxMhaName === -1) {
    throw new Error(`Header row found but missing MHA/MHA_NAME indices on sheet ${sheetName}`);
  }

  // Identify the pay columns by header labels (E01, W01, O01, O01E, etc.)
  const payCols = [];
  for (let i = 0; i < headers.length; i++) {
    const pg = mapColToPayGrade(headers[i]);
    if (pg) payCols.push({ i, pg });
  }

  if (payCols.length < 10) {
    throw new Error(`Too few paygrade columns detected on sheet ${sheetName}: ${payCols.length}`);
  }

  const out = {
    year: YEAR,
    dependentStatus: sheetName.toLowerCase() === "with" ? "with" : "without",
    source: "DTMO",
    generatedAt: new Date().toISOString(),
    ratesByMha: {},
  };

  // Data starts on the row after the header row
  for (let r = headerRowIndex + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;

    const mha = toStr(row[idxMha]);
    const mhaName = toStr(row[idxMhaName]);

    // MHA codes look like "AK400", "MA120", etc.
    if (!/^[A-Z]{2}\d{3}$/.test(mha)) continue;

    const rates = {};
    for (const { i, pg } of payCols) {
      const v = row[i];
      const num =
        typeof v === "number"
          ? v
          : Number(toStr(v).replace(/[^0-9.]/g, ""));

      if (Number.isFinite(num) && num > 0) {
        rates[pg] = num;
      }
    }

    // should have a lot of paygrades filled (E/W/O)
    if (Object.keys(rates).length >= 10) {
      out.ratesByMha[mha] = { mhaName, rates };
    }
  }

  const count = Object.keys(out.ratesByMha).length;
  if (count === 0) {
    // Print a few rows around the header row for debugging
    console.log(`--- DEBUG: headerRowIndex=${headerRowIndex} for "${sheetName}" ---`);
    console.log("Headers:", headers.slice(0, 20));
    console.log("Sample rows after header:");
    console.log(grid.slice(headerRowIndex + 1, headerRowIndex + 6));
  }

  if (count < 100) {
    throw new Error(`Parsed too few MHA rows (${count}). Something still off with sheet layout.`);
  }

  return out;
}

function main() {
  if (!fs.existsSync(RAW_XLSX)) {
    throw new Error(`Missing raw Excel at: ${RAW_XLSX}`);
  }

  const wb = xlsx.readFile(RAW_XLSX);

  const withJson = parseSheet(wb, "With");
  const withoutJson = parseSheet(wb, "Without");

  fs.mkdirSync(path.dirname(OUT_WITH), { recursive: true });
  fs.writeFileSync(OUT_WITH, JSON.stringify(withJson, null, 2), "utf8");
  fs.writeFileSync(OUT_WITHOUT, JSON.stringify(withoutJson, null, 2), "utf8");

  console.log(`✅ Wrote ${OUT_WITH}`);
  console.log(`✅ Wrote ${OUT_WITHOUT}`);
  console.log(
    `Rows: with=${Object.keys(withJson.ratesByMha).length}, without=${Object.keys(withoutJson.ratesByMha).length}`
  );
}

main();