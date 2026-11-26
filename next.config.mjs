/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Type and lint errors now fail the build (the old next.config.js ignored them).
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
