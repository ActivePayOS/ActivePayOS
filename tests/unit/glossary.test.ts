// Tests for the export glossary (plain-English notes threaded into reports).

import { describe, expect, it } from "vitest";
import { EXPORT_GLOSSARY, glossaryFor } from "@/lib/export/glossary";

describe("glossaryFor", () => {
  it("matches exact keys case-insensitively", () => {
    expect(glossaryFor("Base Pay")).toBe(EXPORT_GLOSSARY["base pay"]);
    expect(glossaryFor("BAH")).toBe(EXPORT_GLOSSARY["bah"]);
    expect(glossaryFor("Leftover")).toBe(EXPORT_GLOSSARY["leftover"]);
  });

  it("resolves the real labels the exporters produce", () => {
    expect(glossaryFor("BAH (housing allowance)")).toBe(EXPORT_GLOSSARY["bah"]);
    expect(glossaryFor("BAS (food allowance)")).toBe(EXPORT_GLOSSARY["bas"]);
    expect(glossaryFor("TSP (5% traditional)")).toBe(EXPORT_GLOSSARY["tsp"]);
    expect(glossaryFor("FICA (Social Security + Medicare)")).toBe(EXPORT_GLOSSARY["fica"]);
    expect(glossaryFor("BRS agency match received")).toBe(EXPORT_GLOSSARY["brs match"]);
    expect(glossaryFor("Total Pay")).toBe(EXPORT_GLOSSARY["total pay"]);
    expect(glossaryFor("In today's dollars")).toBe(EXPORT_GLOSSARY["today's dollars"]);
    expect(glossaryFor("IRA (Roth)")).toBe(EXPORT_GLOSSARY["ira"]);
    expect(glossaryFor("At separation (2031)")).toBe(EXPORT_GLOSSARY["at separation"]);
  });

  it("prefers specific rules over broad ones", () => {
    // "TSP expense ratio (%/yr)" is about the fee, not the TSP itself.
    expect(glossaryFor("TSP expense ratio (%/yr)")).toBe(EXPORT_GLOSSARY["expense ratio"]);
  });

  it("does not match Base Pay as BAS", () => {
    expect(glossaryFor("Base Pay")).not.toBe(EXPORT_GLOSSARY["bas"]);
  });

  it("returns undefined for unknown user labels", () => {
    expect(glossaryFor("Dog grooming")).toBeUndefined();
    expect(glossaryFor("")).toBeUndefined();
  });
});
