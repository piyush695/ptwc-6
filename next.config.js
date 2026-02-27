/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker — produces a self-contained server in .next/standalone
  output: 'standalone',

  // Don't fail production build on type errors or lint warnings
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    domains: ['flagcdn.com', 'res.cloudinary.com', 'cdn.holaprime.com'],
  },

  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
}

module.exports = nextConfig
