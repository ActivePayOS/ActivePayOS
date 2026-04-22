// scripts/lib/fetchHtml.mjs
export async function fetchHtmlWithFallback(urls) {
  let lastErr;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const html = await res.text();

      if (html.length < 5000) {
        throw new Error("HTML too short — likely blocked or error page");
      }

      return { html, sourceUrl: url };
    } catch (err) {
      console.warn(`[fetchHtml] Failed ${url}: ${err.message}`);
      lastErr = err;
    }
  }

  throw lastErr ?? new Error("All sources failed");
}
