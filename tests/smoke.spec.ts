import { existsSync } from "node:fs";
import { chromium, expect, test } from "playwright/test";

const budgetPayload = {
  year: 2026,
  grade: "E-5",
  yosLabel: "Over 6",
  zip: "22003",
  withDependents: true,
  receivesBah: true,
  stateOfLegalResidence: "VA",
  basePayMonthly: 4000,
  bahMonthly: 2500,
  basMonthly: 465,
  annualTotal: 83580,
  annualBasePay: 48000,
  annualBah: 30000,
  annualBas: 5580,
};

const timelinePayload = {
  branch: "army",
  track: "enlisted",
  startGrade: "E-1",
  accessionDate: "2024-01-01",
  contractYears: 4,
  todayISO: "2026-01-01",
};

test("core pages and legacy pay redirect are available", async ({ request }) => {
  const home = await request.get("/");
  expect(home.status()).toBe(200);
  const html = await home.text();
  expect(html).toContain("<title>2026 Military Pay Calculator</title>");
  expect(html).toContain('name="application-name" content="ActivePayOS"');
  expect(html).toContain('href="/budget"');
  expect(html).toContain("last verified on");
  expect(html).toContain("July 15, 2026");

  for (const path of ["/accuracy", "/budget", "/housing", "/pcs", "/toolkits"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
  }

  const pay = await request.get("/pay", { maxRedirects: 0 });
  expect(pay.status()).toBe(307);
  expect(pay.headers().location).toBe("/");
});

test("interactive pay and wealth pages load without browser errors", async ({ baseURL }) => {
  const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const browser = await chromium.launch(existsSync(edgePath) ? { executablePath: edgePath } : {});
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.goto(`${baseURL}/`);
  await expect(page.getByLabel("Year", { exact: true })).toHaveValue("2026");
  await page.goto(`${baseURL}/toolkits/wealth-projector`);
  await expect(page.getByLabel("Pay table year")).toHaveValue("2026");
  expect(errors).toEqual([]);
  await browser.close();
});

test("production security headers remain strict", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["content-security-policy"]).not.toContain("'unsafe-eval'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("budget exports validate input and generate every format", async ({ request }) => {
  const invalid = await request.post("/api/export-budget", {
    data: { ...budgetPayload, zip: "invalid", format: "csv" },
  });
  expect(invalid.status()).toBe(400);
  await expect(invalid.json()).resolves.toEqual({ error: "Invalid ZIP" });

  const formats = [
    ["csv", "text/csv"],
    ["txt", "text/plain"],
    ["pdf", "application/pdf"],
    ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ] as const;

  for (const [format, contentType] of formats) {
    const response = await request.post("/api/export-budget", {
      data: { ...budgetPayload, format },
    });
    expect(response.status(), format).toBe(200);
    expect(response.headers()["content-type"]).toContain(contentType);
    expect((await response.body()).length, format).toBeGreaterThan(100);
  }
});

test("promotion timeline exports validate input and generate every format", async ({ request }) => {
  const invalid = await request.post("/api/export-timeline", {
    data: { ...timelinePayload, branch: "invalid", format: "csv" },
  });
  expect(invalid.status()).toBe(400);
  await expect(invalid.json()).resolves.toEqual({ error: "Invalid branch" });

  for (const [format, contentType] of [
    ["csv", "text/csv"],
    ["txt", "text/plain"],
    ["pdf", "application/pdf"],
  ] as const) {
    const response = await request.post("/api/export-timeline", {
      data: { ...timelinePayload, format },
    });
    expect(response.status(), format).toBe(200);
    expect(response.headers()["content-type"]).toContain(contentType);
    expect((await response.body()).length, format).toBeGreaterThan(100);
  }
});
