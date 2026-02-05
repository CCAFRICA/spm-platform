/** @type {import('next').NextConfig} */
const nextConfig = {
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
