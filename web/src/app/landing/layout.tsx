import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vialuce — Performance Intelligence Platform',
  description: 'AI-powered compensation management. Upload your plan, see calculations in 5 minutes. 50-97% cheaper than legacy ICM software.',
  openGraph: {
    title: 'Vialuce — Intelligence. Acceleration. Performance.',
    description: 'The first self-service compensation intelligence platform. Start free.',
    url: 'https://vialuce.ai',
  },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
