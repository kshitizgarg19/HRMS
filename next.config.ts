import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libSQL ships a native addon — keep it out of the bundle so it loads from node_modules at runtime.
  serverExternalPackages: ["@libsql/client", "libsql"],
  // TypeScript stays strict (our migration safety net); only skip lint during deploy builds.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
