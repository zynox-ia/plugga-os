import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@plugga/shared"],
  // Produces .next/standalone with only the traced runtime dependencies, so the
  // container does not carry the whole workspace. Tracing must start at the
  // monorepo root or the @plugga/shared link is missed.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
};

export default nextConfig;
