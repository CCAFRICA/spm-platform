// Display utilities — humanize platform vocabulary for customer-facing surfaces
// OB-129 Phase 6 — Zero domain vocabulary. Korean Test applies.

/**
 * Humanize a data_type string for display.
 * Converts underscore-separated internal strings to Title Case.
 *
 * Examples:
 *   "some_category_name" → "Some Category Name"
 *   "file_prefix__tab_name" → "Tab Name"
 */
export function humanizeDataType(dataType: string): string {
  if (!dataType) return '';

  // If it contains __ (double underscore from SCI tab separator), show only the tab part
  if (dataType.includes('__')) {
    const parts = dataType.split('__');
    const tabPart = parts[parts.length - 1];
    return toTitleCase(tabPart);
  }

  // Strip common prefixes
  let clean = dataType;
  if (clean.startsWith('component_data:')) {
    clean = clean.replace('component_data:', '');
  }

  return toTitleCase(clean);
}

/**
 * Convert underscore/dash separated string to Title Case.
 */
function toTitleCase(str: string): string {
  return str
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

/**
 * Filter out internal metadata keys from row_data for display.
 * Keys starting with _ are internal (e.g., _sheetName, _rowIndex from SCI).
 */
export function filterDisplayKeys(keys: string[]): string[] {
  return keys.filter(k => !k.startsWith('_'));
}
