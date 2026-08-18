import path from "node:path";

import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const scriptSources = ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://cdn.jsdelivr.net"];
if (!isProduction) scriptSources.push("'unsafe-eval'");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://assets.unicorn.studio",
  "font-src 'self' https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  `script-src ${scriptSources.join(" ")}`,
  "connect-src 'self' https://storage.googleapis.com",
  "frame-src https://accounts.google.com https://my.spline.design",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  // Keep development artifacts separate from production builds. Running `next
  // build` while the local server is open must never remove its route manifests.
  distDir: isProduction ? ".next" : ".next-dev",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@plugga/shared"],
  // Produces .next/standalone with only the traced runtime dependencies, so the
  // container does not carry the whole workspace. Tracing must start at the
  // monorepo root or the @plugga/shared link is missed.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
