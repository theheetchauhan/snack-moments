import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // allows a production build next to a running dev server (NEXT_DIST_DIR=.next-build)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // PGlite (embedded Postgres) and postgres-js run server-side only
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // hide the "N" dev-tools button Next.js shows in the corner during development
  devIndicators: false,
};

export default nextConfig;
