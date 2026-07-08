import { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const cseDev = isProd ? '' : " 'unsafe-eval'";

    const headersList = [
      {
        key: 'Content-Security-Policy',
        value: `default-src 'self'; script-src 'self' 'unsafe-inline'${cseDev} https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://jybqvhhvvqucplehvzlc.supabase.co wss://jybqvhhvvqucplehvzlc.supabase.co; frame-src 'self' https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';`,
      },
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
    ];

    // Only apply HSTS in production to prevent breaking local development
    if (isProd) {
      headersList.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      });
    }

    return [
      {
        source: '/(.*)',
        headers: headersList,
      },
    ];
  },
};

export default nextConfig;
