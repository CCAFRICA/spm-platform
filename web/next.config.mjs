// ── Build-time env validation ──
// NEXT_PUBLIC_* vars are baked into the JS bundle at build time.
// A wrong or missing key causes silent auth failures in production.
if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('.supabase.co')) {
  throw new Error(
    `Invalid NEXT_PUBLIC_SUPABASE_URL: must be a *.supabase.co URL. Got: ${process.env.NEXT_PUBLIC_SUPABASE_URL.substring(0, 40)}`
  );
}
if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.startsWith('eyJ')) {
  throw new Error(
    `Invalid NEXT_PUBLIC_SUPABASE_ANON_KEY: must be a JWT (starts with "eyJ"). Got: ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 20)}...`
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large request bodies for import API (119K+ records as JSON)
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  async redirects() {
    return [
      // Redirect old data/transactions to new transactions page
      {
        source: '/data/transactions',
        destination: '/transactions',
        permanent: true,
      },
      // Redirect old data/reports to insights
      {
        source: '/data/reports',
        destination: '/insights',
        permanent: true,
      },
      // Redirect old orders path to transactions
      {
        source: '/transactions/orders',
        destination: '/transactions',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
