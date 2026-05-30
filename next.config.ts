import type { NextConfig } from "next";
import { config as loadDotenv } from "dotenv";

// Force-load .env.local with override: in some shells (Claude Code, certain CI),
// ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL are pre-injected (often empty) and
// Next.js's default loader refuses to overwrite existing process.env values.
loadDotenv({ path: ".env.local", override: true });

const nextConfig: NextConfig = {
  // Native modules (Sharp, Resvg) must be loaded at runtime, not bundled by Turbopack.
  // pdf-parse + pdfjs-dist : pdfjs uses `await import(workerSrc)` to load its worker.
  // Bundling moves the importing file into .next/server/chunks/ssr/ where the
  // worker mjs sibling does not exist → "Setting up fake worker failed". Marking
  // them external lets Node load them directly from node_modules with the worker
  // resolution intact.
  serverExternalPackages: [
    "sharp",
    "@resvg/resvg-js",
    "pdf-parse",
    "pdfjs-dist",
  ],
  experimental: {
    serverActions: {
      // 100mb : enough for ~10 high-quality reference ads in one batch upload.
      // Anything bigger should be split — Claude vision processes them in
      // parallel anyway so splitting doesn't cost much wall time.
      bodySizeLimit: "100mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "fal.media" },
      { protocol: "https", hostname: "v3.fal.media" },
      { protocol: "https", hostname: "v2.fal.media" },
    ],
  },
};

export default nextConfig;
