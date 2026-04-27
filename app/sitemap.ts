import type { MetadataRoute } from "next";

const routes = [
  "",
  "/about",
  "/contact",
  "/housing",
  "/housing/affordability",
  "/housing/rent-vs-buy",
  "/pay",
  "/pcs",
  "/privacy",
  "/terms",
  "/toolkits",
  "/toolkits/budget-planner",
  "/toolkits/deployment",
  "/toolkits/first-pcs",
  "/toolkits/junior-enlisted",
  "/toolkits/just-commissioned",
  "/toolkits/just-married",
  "/toolkits/promotion-planner",
  "/toolkits/retirement-tsp",
  "/toolkits/student-loans",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://officeros.com";

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
  }));
}
