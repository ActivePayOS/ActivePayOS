import withRates from "@/data/bah/normalized/2026.with.json";
import withoutRates from "@/data/bah/normalized/2026.without.json";
import zipMha from "@/data/bah/normalized/2026.zipmha.json";

type PayGrade =
  | "O-1" | "O-2" | "O-3" | "O-4" | "O-5" | "O-6" | "O-7" | "O-8" | "O-9" | "O-10"
  | "W-1" | "W-2" | "W-3" | "W-4" | "W-5"
  | "E-1" | "E-2" | "E-3" | "E-4" | "E-5" | "E-6" | "E-7" | "E-8" | "E-9"
  | "O-1E" | "O-2E" | "O-3E";

type ZipMhaDataset = {
  zipToMha: Record<string, string>;
};

type BahDataset = {
  ratesByMha: Record<
    string,
    {
      rates: Partial<Record<PayGrade, number>>;
    }
  >;
};

const zipMhaDataset = zipMha as ZipMhaDataset;
const bahWithDataset = withRates as BahDataset;
const bahWithoutDataset = withoutRates as BahDataset;

function normalizeZip(input: string): string | null {
  const z = (input ?? "").trim();
  const m = z.match(/^(\d{5})(?:-\d{4})?$/);
  return m ? m[1] : null;
}

function gradeForBahTable(grade: PayGrade): PayGrade {
  return grade === "O-8" || grade === "O-9" || grade === "O-10" ? "O-7" : grade;
}

export type BahLookupResult = {
  rate: number | null;
  mha: string | null;
  normalizedZip: string | null;
  status:
    | "ok"
    | "invalid_zip"
    | "zip_not_found"
    | "nonstandard_mha"
    | "missing_rate_record"
    | "missing_grade_rate";
};

export function getBahLookup(
  zipInput: string,
  grade: PayGrade,
  withDependents: boolean
): BahLookupResult {
  const normalizedZip = normalizeZip(zipInput);
  if (!normalizedZip) {
    return {
      rate: null,
      mha: null,
      normalizedZip: null,
      status: "invalid_zip",
    };
  }

  const mha = zipMhaDataset.zipToMha[normalizedZip];
  if (typeof mha !== "string") {
    return {
      rate: null,
      mha: null,
      normalizedZip,
      status: "zip_not_found",
    };
  }

  if (mha.startsWith("XX")) {
    return {
      rate: null,
      mha,
      normalizedZip,
      status: "nonstandard_mha",
    };
  }

  const dataset = withDependents ? bahWithDataset : bahWithoutDataset;
  const record = dataset.ratesByMha[mha];
  if (!record) {
    return {
      rate: null,
      mha,
      normalizedZip,
      status: "missing_rate_record",
    };
  }

  const rate = record?.rates?.[gradeForBahTable(grade)];
  if (typeof rate !== "number") {
    return {
      rate: null,
      mha,
      normalizedZip,
      status: "missing_grade_rate",
    };
  }

  return {
    rate,
    mha,
    normalizedZip,
    status: "ok",
  };
}

export function getBahRate(
  zip: string,
  grade: PayGrade,
  withDependents: boolean
): number | null {
  return getBahLookup(zip, grade, withDependents).rate;
}
