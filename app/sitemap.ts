import type { MetadataRoute } from "next";

const routes = [
  "",
  "/accuracy",
  "/about",
  "/budget",
  "/contact",
  "/housing",
  "/housing/affordability",
  "/housing/rent-vs-buy",
  "/pcs",
  "/privacy",
  "/resources",
  "/terms",
  "/terms-of-service",
  "/toolkits",
  "/toolkits/budget-planner",
  "/toolkits/deployment",
  "/toolkits/first-pcs",
  "/toolkits/junior-enlisted",
  "/toolkits/just-commissioned",
  "/toolkits/just-married",
  "/toolkits/promotion-timeline",
  "/toolkits/retirement-tsp",
  "/toolkits/student-loans",
  "/toolkits/wealth-projector",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://activepayos.com";

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
  }));
}
