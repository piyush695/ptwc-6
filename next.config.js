/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker — produces a self-contained server in .next/standalone
  output: 'standalone',

  images: {
    domains: ['flagcdn.com', 'res.cloudinary.com', 'cdn.holaprime.com'],
  },

  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
}

module.exports = nextConfig
