// Tests for the zip helper behind "Everything (.zip)" downloads.

import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { filesToZipBlob } from "@/lib/export/zip";

describe("filesToZipBlob", () => {
  it("bundles strings, bytes, and blobs into one readable archive", async () => {
    const blob = await filesToZipBlob([
      { name: "report.csv", data: "a,b\n1,2\n" },
      { name: "report.txt", data: "hello" },
      { name: "report.pdf", data: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }, // %PDF
      { name: "workbook.xlsx", data: new Blob([new Uint8Array([1, 2, 3])]) },
    ]);
    expect(blob.size).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual([
      "report.csv",
      "report.pdf",
      "report.txt",
      "workbook.xlsx",
    ]);
    expect(await zip.file("report.csv")!.async("string")).toBe("a,b\n1,2\n");
    expect(await zip.file("report.txt")!.async("string")).toBe("hello");
    const pdfBytes = await zip.file("report.pdf")!.async("uint8array");
    expect(Array.from(pdfBytes)).toEqual([0x25, 0x50, 0x44, 0x46]);
  });

  it("copies offset typed-array views correctly", async () => {
    const backing = new Uint8Array([9, 9, 1, 2, 3, 9]);
    const view = backing.subarray(2, 5);
    const blob = await filesToZipBlob([{ name: "v.bin", data: view }]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Array.from(await zip.file("v.bin")!.async("uint8array"))).toEqual([1, 2, 3]);
  });
});
