// lib/export/zip.ts
// Thin JSZip wrapper for the "Everything (.zip)" and multi-workbook download
// paths. Runs client-side; nothing leaves the device.

import JSZip from "jszip";

export type ZipFileInput = {
  name: string;
  data: Blob | string | Uint8Array;
};

/** Bundle the given files into a single zip Blob (store order preserved). */
export async function filesToZipBlob(files: ZipFileInput[]): Promise<Blob> {
  const zip = new JSZip();
  for (const f of files) {
    if (f.data instanceof Uint8Array) {
      // Copy typed arrays into a fresh buffer so offset/detached views can't
      // corrupt the archive.
      const bytes = new Uint8Array(f.data.length);
      bytes.set(f.data);
      zip.file(f.name, bytes);
    } else if (typeof f.data === "string") {
      zip.file(f.name, f.data);
    } else {
      // Blob: hand JSZip an ArrayBuffer promise — works in both the browser
      // and Node (JSZip's own Blob detection misses Node's global Blob).
      zip.file(f.name, f.data.arrayBuffer());
    }
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
