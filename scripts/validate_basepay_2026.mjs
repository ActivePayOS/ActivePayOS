import fs from "node:fs";
import path from "node:path";

const p = path.join(process.cwd(), "data", "basepay", "2026.json");
const raw = fs.readFileSync(p, "utf8");
const d = JSON.parse(raw);

function requireNumber(x, msg) {
  if (typeof x !== "number" || !Number.isFinite(x)) throw new Error(msg);
}
function requireObject(x, msg) {
  if (!x || typeof x !== "object") throw new Error(msg);
}
function requireArray(x, msg) {
  if (!Array.isArray(x)) throw new Error(msg);
}

const TABLE_KEYS = ["CO", "CO_FE", "WO", "EM"];

requireObject(d, "Dataset is not an object");
if (d.year !== 2026) throw new Error(`Expected year 2026, got ${d.year}`);
requireArray(d.headers, "headers missing or not array");
requireArray(d.breaks, "breaks missing or not array");
requireObject(d.tables, "tables missing or not object");

for (const key of TABLE_KEYS) {
  const t = d.tables[key];
  requireObject(t, `tables.${key} missing or not object`);

  const anyNumeric = Object.values(t).some(
    (arr) => Array.isArray(arr) && arr.some((v) => typeof v === "number" && Number.isFinite(v))
  );
  if (!anyNumeric) throw new Error(`${key} contains no numeric values`);
}

const o1 = d.tables?.CO?.["O-1"];
requireArray(o1, "CO O-1 missing or not array");
if (o1.length !== 22) throw new Error(`CO O-1 expected 22 columns, got ${o1.length}`);
requireNumber(o1[0], "CO O-1 first column is not numeric");

//console.log("✅ Base pay dataset looks valid");
