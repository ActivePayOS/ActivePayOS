// Client-side image export for the Sankey diagram.
//
// Privacy by design: everything here runs in the browser. The live <svg> node
// is serialized, turned into a Blob, and handed to the user as a download. No
// server route, no upload, no third-party service — the user's budget numbers
// never leave their device.

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Serialize a live SVG node into a standalone, self-contained SVG string.
 * The renderers paint with concrete hex colors (not CSS variables), so the
 * exported file looks identical to what's on screen without any stylesheet.
 */
function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  // Ensure intrinsic width/height (needed for rasterization to PNG).
  const vb = svg.viewBox.baseVal;
  const w = vb && vb.width ? vb.width : svg.clientWidth || 920;
  const h = vb && vb.height ? vb.height : svg.clientHeight || 480;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));

  const xml = new XMLSerializer().serializeToString(clone);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
}

export function downloadSvg(svg: SVGSVGElement, filename: string) {
  const blob = new Blob([serializeSvg(svg)], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}

/**
 * Rasterize the SVG to PNG via an offscreen canvas. `scale` controls export
 * resolution (2 = retina-crisp, good for sharing). `background` fills the
 * canvas so the PNG isn't transparent.
 */
/**
 * Rasterize an SVG to raw PNG bytes (for embedding in a client-generated PDF).
 * Same pipeline as downloadPng but returns the bytes instead of downloading.
 */
export async function svgToPngBytes(
  svg: SVGSVGElement,
  scale = 2,
  background?: string
): Promise<Uint8Array> {
  const vb = svg.viewBox.baseVal;
  const w = vb && vb.width ? vb.width : svg.clientWidth || 920;
  const h = vb && vb.height ? vb.height : svg.clientHeight || 480;

  const svgUrl = URL.createObjectURL(
    new Blob([serializeSvg(svg)], { type: "image/svg+xml;charset=utf-8" })
  );
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not render SVG to image"));
      img.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.scale(scale, scale);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    );
    if (!blob) throw new Error("Could not encode PNG");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function downloadPng(
  svg: SVGSVGElement,
  filename: string,
  scale = 2,
  background?: string
): Promise<void> {
  const vb = svg.viewBox.baseVal;
  const w = vb && vb.width ? vb.width : svg.clientWidth || 920;
  const h = vb && vb.height ? vb.height : svg.clientHeight || 480;

  const svgString = serializeSvg(svg);
  const svgUrl = URL.createObjectURL(
    new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })
  );

  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not render SVG to image"));
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    ctx.scale(scale, scale);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    );
    if (!blob) throw new Error("Could not encode PNG");

    const pngUrl = URL.createObjectURL(blob);
    triggerDownload(pngUrl, filename);
    URL.revokeObjectURL(pngUrl);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
