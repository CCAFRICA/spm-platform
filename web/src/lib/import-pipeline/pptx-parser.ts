/**
 * PPTX Parser
 *
 * Extracts text and table data from PowerPoint files.
 * PPTX files are ZIP archives containing XML files with slide content.
 */

import JSZip from 'jszip';
import type { ParsedFile, ParseOptions } from './file-parser';

export interface SlideContent {
  slideNumber: number;
  texts: string[];
  tables: TableData[];
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

interface PPTXParseResult extends ParsedFile {
  slides: SlideContent[];
}

/**
 * Parse a PPTX file and extract text/table content
 */
export async function parsePPTX(
  file: File,
  options: ParseOptions = {}
): Promise<PPTXParseResult> {
  console.log('\n========== PPTX PARSER DEBUG ==========');
  console.log('Parsing file:', file.name);

  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const slides: SlideContent[] = [];
  const allTables: TableData[] = [];

  // Find all slide files (ppt/slides/slide1.xml, slide2.xml, etc.)
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
      return numA - numB;
    });

  console.log('Found slide files:', slideFiles.length);

  for (let i = 0; i < slideFiles.length; i++) {
    const slideFile = slideFiles[i];
    const content = await zip.file(slideFile)?.async('string');
    if (!content) continue;

    const slideContent = parseSlideXML(content, i + 1);
    slides.push(slideContent);
    allTables.push(...slideContent.tables);

    console.log(`\nSlide ${i + 1}:`);
    console.log('  Texts found:', slideContent.texts.length);
    console.log('  Text preview:', slideContent.texts.slice(0, 5).join(' | '));
    console.log('  Tables found:', slideContent.tables.length);
    for (let t = 0; t < slideContent.tables.length; t++) {
      const table = slideContent.tables[t];
      console.log(`  Table ${t + 1}: ${table.headers.length} cols, ${table.rows.length} data rows`);
      console.log(`    Headers: ${table.headers.join(' | ')}`);
      if (table.rows.length > 0) {
        console.log(`    First row: ${table.rows[0].join(' | ')}`);
      }
    }
  }

  console.log('\n========== PPTX PARSER SUMMARY ==========');
  console.log('Total slides:', slides.length);
  console.log('Total tables:', allTables.length);
  console.log('==========================================\n');

  // Convert tables to ParsedFile format
  const { headers, rows } = convertTablesToUniformFormat(allTables, options);

  return {
    headers,
    rows,
    format: 'unknown', // Will be updated by the caller
    rowCount: rows.length,
    metadata: {
      fileName: file.name,
      fileSize: file.size,
    },
    slides,
  };
}

/**
 * Parse individual slide XML to extract text and tables
 */
function parseSlideXML(xml: string, slideNumber: number): SlideContent {
  const texts: string[] = [];
  const tables: TableData[] = [];

  // Extract text content from <a:t> tags (text runs)
  const textMatches = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g));
  for (const match of textMatches) {
    const text = decodeXMLEntities(match[1].trim());
    if (text) {
      texts.push(text);
    }
  }

  // Look for table structures <a:tbl>
  const tableMatches = Array.from(xml.matchAll(/<a:tbl[^>]*>([\s\S]*?)<\/a:tbl>/g));
  for (const tableMatch of tableMatches) {
    const tableXML = tableMatch[1];
    const table = parseTableXML(tableXML);
    if (table.rows.length > 0) {
      tables.push(table);
    }
  }

  // Also look for graphicFrame tables (another common structure)
  const graphicFrameMatches = Array.from(xml.matchAll(/<p:graphicFrame[^>]*>([\s\S]*?)<\/p:graphicFrame>/g));
  for (const gfMatch of graphicFrameMatches) {
    const gfXML = gfMatch[1];
    if (gfXML.includes('<a:tbl')) {
      const innerTableMatches = Array.from(gfXML.matchAll(/<a:tbl[^>]*>([\s\S]*?)<\/a:tbl>/g));
      for (const innerMatch of innerTableMatches) {
        const table = parseTableXML(innerMatch[1]);
        if (table.rows.length > 0) {
          tables.push(table);
        }
      }
    }
  }

  return {
    slideNumber,
    texts,
    tables,
  };
}

/**
 * Parse table XML structure
 */
function parseTableXML(tableXML: string): TableData {
  const rows: string[][] = [];

  // Find all table rows <a:tr>
  const rowMatches = Array.from(tableXML.matchAll(/<a:tr[^>]*>([\s\S]*?)<\/a:tr>/g));

  for (const rowMatch of rowMatches) {
    const rowXML = rowMatch[1];
    const cells: string[] = [];

    // Find all cells <a:tc>
    const cellMatches = Array.from(rowXML.matchAll(/<a:tc[^>]*>([\s\S]*?)<\/a:tc>/g));

    for (const cellMatch of cellMatches) {
      const cellXML = cellMatch[1];
      // Extract text from cell
      const textParts: string[] = [];
      const textMatches = Array.from(cellXML.matchAll(/<a:t>([^<]*)<\/a:t>/g));
      for (const textMatch of textMatches) {
        const text = decodeXMLEntities(textMatch[1].trim());
        if (text) {
          textParts.push(text);
        }
      }
      cells.push(textParts.join(' '));
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  // First row is typically the header
  const headers = rows.length > 0 ? rows[0] : [];
  const dataRows = rows.length > 1 ? rows.slice(1) : [];

  return {
    headers,
    rows: dataRows,
  };
}

/**
 * Convert multiple tables into a unified format
 */
function convertTablesToUniformFormat(
  tables: TableData[],
  options: ParseOptions
): { headers: string[]; rows: Record<string, unknown>[] } {
  if (tables.length === 0) {
    return { headers: [], rows: [] };
  }

  // Use the first table with data as the primary source
  const primaryTable = tables.find((t) => t.headers.length > 0 && t.rows.length > 0);

  if (!primaryTable) {
    // No table with data found, try to extract from text patterns
    return extractFromTextPatterns(tables);
  }

  const headers = primaryTable.headers.map((h, i) => h || `Column${i + 1}`);
  const rows: Record<string, unknown>[] = [];
  const maxRows = options.maxRows || Infinity;

  for (let i = 0; i < primaryTable.rows.length && rows.length < maxRows; i++) {
    const rowData = primaryTable.rows[i];
    const row: Record<string, unknown> = {};

    headers.forEach((header, colIndex) => {
      let value: unknown = rowData[colIndex] ?? null;

      // Try to convert to number if it looks numeric
      if (typeof value === 'string') {
        const numValue = parseFloat(value.replace(/[,$%]/g, ''));
        if (!isNaN(numValue)) {
          value = numValue;
        }
      }

      if (options.trimValues && typeof value === 'string') {
        value = value.trim();
      }

      row[header] = value;
    });

    if (options.skipEmptyRows) {
      const hasValue = Object.values(row).some((v) => v !== null && v !== '');
      if (!hasValue) continue;
    }

    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Try to extract structured data from text patterns when no tables are found
 */
function extractFromTextPatterns(tables: TableData[]): {
  headers: string[];
  rows: Record<string, unknown>[];
} {
  // Fallback: combine all text from tables into a flat structure
  const allTexts: string[] = [];

  for (const table of tables) {
    allTexts.push(...table.headers);
    for (const row of table.rows) {
      allTexts.push(...row);
    }
  }

  if (allTexts.length === 0) {
    return { headers: [], rows: [] };
  }

  // Create a simple single-column structure
  return {
    headers: ['Content'],
    rows: allTexts.filter((t) => t.trim()).map((text) => ({ Content: text })),
  };
}

/**
 * Decode XML entities
 */
function decodeXMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

/**
 * Check if a file is a PPTX file
 */
export function isPPTXFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension === 'pptx';
}

/**
 * Get text summary from all slides
 */
export function getSlidesSummary(slides: SlideContent[]): string {
  return slides
    .map((slide) => `Slide ${slide.slideNumber}: ${slide.texts.slice(0, 3).join(' | ')}`)
    .join('\n');
}
