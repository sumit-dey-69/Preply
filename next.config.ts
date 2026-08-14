import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow the sandbox preview domain to access the dev server without warnings.
  allowedDevOrigins: ["*.space-z.ai", "*.z.ai", "localhost"],
};

export default nextConfig;
