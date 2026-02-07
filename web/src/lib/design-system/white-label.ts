/**
 * White-Label Compatibility Layer
 *
 * Ensures module accents don't clash with tenant brand colors.
 * Provides auto-generated harmonious color schemes.
 */

import { MODULE_TOKENS, type ModuleId } from './tokens';

// ============================================
// TYPES
// ============================================

export interface TenantBrand {
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
}

export interface TenantTheme {
  brand: TenantBrand;
  moduleAccents: Record<ModuleId, string>;
}

// ============================================
// COLOR UTILITIES
// ============================================

/**
 * Parse HSL string to components
 */
function parseHSL(hsl: string): { h: number; s: number; l: number } | null {
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)/);
  if (!match) return null;
  return {
    h: parseInt(match[1], 10),
    s: parseInt(match[2], 10),
    l: parseInt(match[3], 10),
  };
}

/**
 * Convert hex to HSL
 */
function hexToHSL(hex: string): { h: number; s: number; l: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Get hue from any color format
 */
function getHue(color: string): number | null {
  if (color.startsWith('hsl')) {
    const parsed = parseHSL(color);
    return parsed?.h ?? null;
  }
  if (color.startsWith('#') || /^[a-f\d]{6}$/i.test(color)) {
    const parsed = hexToHSL(color.startsWith('#') ? color : `#${color}`);
    return parsed?.h ?? null;
  }
  return null;
}

/**
 * Calculate hue distance (0-180)
 */
function hueDistance(hue1: number, hue2: number): number {
  const diff = Math.abs(hue1 - hue2);
  return Math.min(diff, 360 - diff);
}

/**
 * Shift hue to avoid clash
 */
function shiftHue(originalHue: number, avoidHue: number): number {
  const distance = hueDistance(originalHue, avoidHue);
  if (distance >= 30) return originalHue;

  // Shift to complementary
  const shift = 180;
  return (originalHue + shift) % 360;
}

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Resolve module accent to avoid clashing with tenant brand
 * If tenant brand color is too close to module accent (< 30° hue distance),
 * shift module accent to complementary
 */
export function resolveAccent(moduleId: ModuleId, tenantBrand?: TenantBrand): string {
  const moduleAccent = MODULE_TOKENS[moduleId].accent;

  if (!tenantBrand?.primaryColor) return moduleAccent;

  const moduleHue = getHue(moduleAccent);
  const brandHue = getHue(tenantBrand.primaryColor);

  if (moduleHue === null || brandHue === null) return moduleAccent;

  const distance = hueDistance(moduleHue, brandHue);
  if (distance >= 30) return moduleAccent;

  // Too close — shift to complementary
  const newHue = shiftHue(moduleHue, brandHue);
  const parsed = parseHSL(moduleAccent);
  if (!parsed) return moduleAccent;

  return `hsl(${newHue}, ${parsed.s}%, ${parsed.l}%)`;
}

/**
 * Auto-generate module accents that harmonize with tenant brand
 */
export function generateModuleAccents(
  tenantPrimaryColor: string
): Record<ModuleId, string> {
  const brandHue = getHue(tenantPrimaryColor);

  const result: Partial<Record<ModuleId, string>> = {};

  for (const [moduleId, tokens] of Object.entries(MODULE_TOKENS)) {
    const moduleHue = getHue(tokens.accent);

    if (brandHue !== null && moduleHue !== null) {
      const distance = hueDistance(moduleHue, brandHue);
      if (distance < 30) {
        const newHue = shiftHue(moduleHue, brandHue);
        const parsed = parseHSL(tokens.accent);
        if (parsed) {
          result[moduleId as ModuleId] = `hsl(${newHue}, ${parsed.s}%, ${parsed.l}%)`;
          continue;
        }
      }
    }

    result[moduleId as ModuleId] = tokens.accent;
  }

  return result as Record<ModuleId, string>;
}

/**
 * Get tenant theme with merged brand and module accents
 */
export function getTenantTheme(tenantId: string, brand?: TenantBrand): TenantTheme {
  const defaultBrand: TenantBrand = {
    primaryColor: '#1e40af', // Default navy
  };

  const activeBrand = brand || defaultBrand;
  const moduleAccents = generateModuleAccents(activeBrand.primaryColor);

  return {
    brand: activeBrand,
    moduleAccents,
  };
}

/**
 * Get CSS custom properties for a tenant theme
 */
export function getThemeCSSVariables(theme: TenantTheme): Record<string, string> {
  const vars: Record<string, string> = {
    '--brand-primary': theme.brand.primaryColor,
  };

  if (theme.brand.secondaryColor) {
    vars['--brand-secondary'] = theme.brand.secondaryColor;
  }

  for (const [moduleId, accent] of Object.entries(theme.moduleAccents)) {
    vars[`--module-${moduleId}-accent`] = accent;
  }

  return vars;
}
