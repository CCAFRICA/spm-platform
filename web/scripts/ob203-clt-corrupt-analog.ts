// OB-203 Phase 5 CLT — generate a CORRUPTED structural analog (.xlsx) for the observer/action-set
// witness. Boundary-corruption approach (architect-approved): a seeded analog whose FACT sheet is
// replaced with a single unintelligible column — comprehension cannot resolve a role for it, which
// drives that unit toward `failed_interpretation` (or, at minimum, an 'unknown'-role HF-247 block).
// The clean sheets (cover/roster/reference/derived) comprehend normally, so the workbook holds a
// MIX — exactly what the observer must render (some units progress, one holds at failure).
//
//   Usage: npx tsx scripts/ob203-clt-corrupt-analog.ts [seed] [outPath]
// Then import the produced file via /operate/import and follow the CLT procedure in the phase report.
import * as XLSX from 'xlsx';
import { generateStructuralAnalog } from '../src/lib/sci/structural-analog-generator';

const seed = Number(process.argv[2] || 4242);
const outPath = process.argv[3] || `/tmp/ob203_clt_corrupt_${seed}.xlsx`;

const wb = generateStructuralAnalog({ seed, factRows: 120 });
const out = XLSX.utils.book_new();

for (const sheet of wb.sheets) {
  let rows: Record<string, unknown>[];
  if (sheet.kind === 'fact') {
    // CORRUPT: collapse the fact grid to one noise column of high-entropy tokens — no recognizable
    // atom shape, no temporal/identifier/measure signal. This is the unit engineered to fail.
    rows = sheet.rows.map((_, i) => ({ '': `§${((i * 2654435761) >>> 0).toString(36)}¤${((i * 40503) >>> 0).toString(16)}` }));
  } else {
    rows = sheet.rows;
  }
  XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(rows), sheet.sheetName.slice(0, 31));
}

XLSX.writeFile(out, outPath);
console.log(`Wrote corrupted analog: ${outPath}`);
console.log(`Sheets: ${wb.sheets.map(s => `${s.sheetName}${s.kind === 'fact' ? ' (CORRUPTED)' : ''}`).join(', ')}`);
console.log('Import via /operate/import; the corrupted sheet should hold at failed_interpretation in the observer.');
