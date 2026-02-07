'use client';

/**
 * Module Shell
 *
 * Top-level layout wrapper that applies wayfinding.
 * Provides ambient accent, layout signature, and spatial transitions.
 */

import React from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useModule } from '@/lib/design-system/module-context';
import { TRANSITION_TOKENS, LAYOUT_TOKENS } from '@/lib/design-system/tokens';
import { cn } from '@/lib/utils';
import * as LucideIcons from 'lucide-react';

interface ModuleShellProps {
  children: React.ReactNode;
  className?: string;
  showBreadcrumb?: boolean;
  customBreadcrumb?: React.ReactNode;
}

export function ModuleShell({
  children,
  className,
  showBreadcrumb = true,
  customBreadcrumb,
}: ModuleShellProps) {
  const { moduleConfig, moduleId, isTransitioning } = useModule();
  const pathname = usePathname();

  // Get the icon component
  const IconComponent = moduleConfig?.icon
    ? (LucideIcons[moduleConfig.icon as keyof typeof LucideIcons] as React.ComponentType<{ className?: string; style?: React.CSSProperties }>)
    : null;

  // Get layout signature styles
  const layoutSignature = moduleConfig?.layoutSignature || 'mixed';
  const layoutConfig = LAYOUT_TOKENS.signatures[layoutSignature as keyof typeof LAYOUT_TOKENS.signatures];

  // Build breadcrumb from pathname
  const pathSegments = pathname.split('/').filter(Boolean);
  const breadcrumbItems = pathSegments.map((segment, index) => ({
    label: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '),
    href: '/' + pathSegments.slice(0, index + 1).join('/'),
    isLast: index === pathSegments.length - 1,
  }));

  return (
    <div className={cn('relative min-h-full', className)}>
      {/* Ambient accent bar */}
      {moduleConfig && (
        <div
          className="absolute top-0 left-0 right-0 h-1 transition-colors"
          style={{
            backgroundColor: moduleConfig.accent,
            transitionDuration: TRANSITION_TOKENS.moduleSwitch.duration,
            transitionTimingFunction: TRANSITION_TOKENS.moduleSwitch.easing,
          }}
        />
      )}

      {/* Breadcrumb */}
      {showBreadcrumb && !customBreadcrumb && (
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm">
          {IconComponent && (
            <IconComponent
              className="h-4 w-4"
              style={{ color: moduleConfig?.accent }}
            />
          )}
          <nav className="flex items-center text-sm">
            {breadcrumbItems.map((item, index) => (
              <React.Fragment key={item.href}>
                {index > 0 && (
                  <LucideIcons.ChevronRight className="h-3 w-3 mx-1 text-slate-400" />
                )}
                <span
                  className={cn(
                    item.isLast
                      ? 'font-medium text-slate-900 dark:text-slate-100'
                      : 'text-slate-500 dark:text-slate-400'
                  )}
                >
                  {item.label}
                </span>
              </React.Fragment>
            ))}
          </nav>
        </div>
      )}

      {customBreadcrumb}

      {/* Content with transition */}
      <AnimatePresence mode="wait">
        <motion.div
          key={moduleId || 'default'}
          initial={{ opacity: 0.8 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0.8 }}
          transition={{
            duration: parseFloat(TRANSITION_TOKENS.moduleSwitch.duration) / 1000,
            ease: [0.4, 0, 0.2, 1],
          }}
          className={cn(
            'p-6',
            isTransitioning && 'pointer-events-none'
          )}
          style={{
            maxWidth: layoutConfig && 'maxWidth' in layoutConfig ? layoutConfig.maxWidth : undefined,
          }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * Module accent indicator for use in navigation
 */
export function ModuleAccentIndicator({ className }: { className?: string }) {
  const { moduleConfig } = useModule();

  if (!moduleConfig) return null;

  return (
    <div
      className={cn('w-1 rounded-full', className)}
      style={{ backgroundColor: moduleConfig.accent }}
    />
  );
}

/**
 * Module label with icon
 */
export function ModuleLabel({ showIcon = true, className }: { showIcon?: boolean; className?: string }) {
  const { moduleConfig } = useModule();

  if (!moduleConfig) return null;

  const IconComponent = moduleConfig.icon
    ? (LucideIcons[moduleConfig.icon as keyof typeof LucideIcons] as React.ComponentType<{ className?: string; style?: React.CSSProperties }>)
    : null;

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {showIcon && IconComponent && (
        <IconComponent className="h-4 w-4" style={{ color: moduleConfig.accent }} />
      )}
      <span>{moduleConfig.label}</span>
    </span>
  );
}
