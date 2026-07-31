/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server output for the production Docker image.
  output: "standalone",
  // Next 16 uses Turbopack by default; an empty config silences the
  // webpack/turbopack mismatch warning.
  turbopack: {},
};

export default nextConfig;
