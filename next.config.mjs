/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // El lint corre aparte con `npm run lint`; no bloquea el build inicial.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
