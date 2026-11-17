/** @type {import('next').NextConfig} */
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

// Sellers paste their own image URLs into the product form, so the set of
// possible hosts is not knowable at build time. `next/image` refuses any host
// that is not allow-listed, which would turn a seller-supplied image into a
// runtime 400 from the optimizer.
//
// Two entries, deliberately:
//
//   - Supabase Storage, the platform's own bucket, named explicitly so the
//     common case is self-documenting.
//   - `**` over https only. Sellers legitimately use their own CDN or a hosted
//     catalogue, and blocking them would break the storefront. Restricting the
//     scheme to https prevents a plain-http (and therefore unencrypted) source,
//     and Next's optimizer refuses non-image responses and enforces its own
//     redirect rules, so this is a deliberate availability-over-maximum-
//     strictness trade for a marketplace whose images are user content.
//
// If image hosting is ever consolidated into Supabase Storage only, delete the
// wildcard entry here — nothing else needs to change.
const remotePatterns = [
  { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
  { protocol: "https", hostname: "**" },
];

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const host = process.env.ROUTEFLOW_ADMIN_HOSTNAME || "admin.localhost";
    return {
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }],
          destination: "/admin",
        },
      ],
    };
  },
  webpack: (config, { dev }) => {
    // Reuse modules while the dev process runs, without synced disk cache packs.
    // Disabling every cache forced costly recompilation on each route change.
    if (dev) config.cache = { type: "memory" };
    else if (/[\\/]OneDrive[\\/]/i.test(process.cwd())) config.cache = false;
    return config;
  },
  // Lint is intentionally NOT skipped during the build. It used to be
  // (`ignoreDuringBuilds: true`), which hid 9 real errors — unused imports and
  // `any` types — from CI, because a passing build reported success while the
  // code was objectively wrong.
  images: {
    remotePatterns,
  },
};

export default (phase) => ({
  ...nextConfig,
  // A build must not overwrite manifests and chunks used by a running dev server.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
});
