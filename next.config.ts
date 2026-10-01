import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ["10.48.88.18"],
  images: {
    /**
     * Only the host used by the seeded catalogue is allowed. Images come from
     * `products.images` in the database — verified against the live data, all
     * 24 rows point at `placehold.co` (1000x1250).
     *
     * Keep this list as narrow as possible: do not add a wildcard or a broad
     * domain. When the catalogue moves to real product photography, add that
     * one host here rather than loosening this entry.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "gtgovpkjbqoxdgmwbwny.supabase.co",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
