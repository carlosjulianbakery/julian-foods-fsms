/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Allow both localhost and the Vercel deployment URL
      allowedOrigins: ["localhost:3000", "*.vercel.app"],
    },
    // Disable the client-side router cache for dynamic pages so that
    // template changes made by admins are visible immediately to supervisors
    // without requiring a hard browser refresh.
    staleTimes: {
      dynamic: 0,   // no client-side cache for force-dynamic pages
      static: 180,  // 3 min for statically-generated pages (unchanged)
    },
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  staticPageGenerationTimeout: 1000,
  images: { unoptimized: true },
};

export default nextConfig;
