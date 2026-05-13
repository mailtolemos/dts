/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We talk to a few external APIs from server components; keep them allowlisted.
  experimental: {
    serverComponentsExternalPackages: ['pino', 'eventsource'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
