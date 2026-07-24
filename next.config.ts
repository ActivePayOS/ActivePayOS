import type { NextConfig } from "next";

// Content-Security-Policy.
//
// script-src / style-src keep 'unsafe-inline' because the app is statically
// rendered and Next.js inlines its hydration/RSC bootstrap scripts (and we ship
// a tiny inline theme-init script in app/layout.tsx). Moving to a strict
// nonce-based CSP would require middleware that opts every route into dynamic
// rendering, giving up static generation. The remaining directives (object-src,
// base-uri, frame-ancestors, form-action, default-src) are locked down and
// still provide meaningful clickjacking / injection defense.
// Next.js dev (React's Turbopack RSC runtime) requires eval() for debugging
// features, so 'unsafe-eval' is added in development only. Production never
// includes it — React does not use eval() in production builds.
const isDev = process.env.NODE_ENV === "development";
const scriptSrc = `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`;

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp,
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
