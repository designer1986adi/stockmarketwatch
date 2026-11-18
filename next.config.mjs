/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["yahoo-finance2"],
  // Lets the dev server work at http://stock-analysis.localhost:3000 (not just localhost).
  allowedDevOrigins: ["stock-analysis.localhost"],
};
export default nextConfig;
