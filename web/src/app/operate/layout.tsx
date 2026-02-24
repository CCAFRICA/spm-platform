import { OperateProvider } from '@/contexts/operate-context';

/**
 * Operate workspace layout — wraps all /operate/* pages with OperateContext.
 * OB-92: Shared Plan × Period × Batch state across Operate pages.
 */
export default function OperateLayout({ children }: { children: React.ReactNode }) {
  return <OperateProvider>{children}</OperateProvider>;
}
