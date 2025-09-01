/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable ESLint during builds to avoid any type errors
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Silence warnings
  // https://github.com/WalletConnect/walletconnect-monorepo/issues/1908
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
