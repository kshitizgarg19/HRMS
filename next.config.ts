import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libSQL's native addon is only used for the local file DB (dev). Keep it (and its
  // platform binaries) out of the serverless function bundles — production uses the
  // pure-JS web client over HTTP, so the functions stay small and deploy cleanly.
  serverExternalPackages: ["@libsql/client", "libsql"],
  outputFileTracingExcludes: {
    "*": [
      "node_modules/libsql/**",
      "node_modules/@libsql/linux-*/**",
      "node_modules/@libsql/darwin-*/**",
      "node_modules/@libsql/win32-*/**",
      "node_modules/@neon-rs/**",
    ],
  },
  // TypeScript stays strict (our migration safety net); only skip lint during deploy builds.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
