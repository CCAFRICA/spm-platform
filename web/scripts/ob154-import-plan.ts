/**
 * OB-154 Phase 1: Import plan PPTX programmatically
 * Calls /api/import/sci/analyze-document → then /api/import/sci/execute
 * Run from: spm-platform/web
 * Requires: dev server running on localhost:3000
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const OPTICA = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const PLAN_FILE = '/Users/AndrewAfrica/Desktop/ViaLuce AI/RetailCorp Data 1/RetailCorp Plan1.pptx';
const BASE_URL = 'http://localhost:3000';

// Auth credentials
const EMAIL = 'admin@opticaluminar.mx';
const PASSWORD = 'demo-password-OL1';

async function getAuthCookie(): Promise<string> {
  const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`Auth failed: ${error.message}`);

  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1] || '';
  const sessionJson = JSON.stringify({
    access_token: data.session!.access_token,
    refresh_token: data.session!.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  return `sb-${projectRef}-auth-token=${encodeURIComponent(sessionJson)}`;
}

async function run() {
  console.log('=== OB-154 PHASE 1: IMPORT PLAN ===\n');

  // Read and encode the PPTX
  const fileBuffer = fs.readFileSync(PLAN_FILE);
  const fileBase64 = fileBuffer.toString('base64');
  const fileName = path.basename(PLAN_FILE);
  console.log(`File: ${fileName} (${(fileBuffer.length / 1024).toFixed(0)} KB)`);

  // Get auth cookie
  const cookie = await getAuthCookie();
  console.log('Authenticated as', EMAIL);

  // Step 1: Analyze document
  console.log('\n--- Step 1: Analyze Document ---');
  const analyzeBody = {
    tenantId: OPTICA,
    fileName,
    fileBase64,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };

  const analyzeRes = await fetch(`${BASE_URL}/api/import/sci/analyze-document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(analyzeBody),
  });

  if (!analyzeRes.ok) {
    const text = await analyzeRes.text();
    console.error(`Analyze failed (${analyzeRes.status}): ${text}`);
    process.exit(1);
  }

  const proposal = await analyzeRes.json();
  console.log(`Proposal ID: ${proposal.proposalId}`);
  console.log(`Content units: ${proposal.contentUnits?.length}`);

  for (const cu of proposal.contentUnits || []) {
    console.log(`  - ${cu.contentUnitId}: ${cu.classification} (${(cu.confidence * 100).toFixed(0)}%)`);
    if (cu.extractionSummary?.components) {
      const comps = cu.extractionSummary.components as Array<{ name: string }>;
      console.log(`    Components: ${comps.length}`);
      for (const c of comps) {
        console.log(`      - ${c.name}`);
      }
    }
  }

  // Step 2: Execute plan import
  console.log('\n--- Step 2: Execute Plan Import ---');
  const executeBody = {
    proposalId: proposal.proposalId,
    tenantId: OPTICA,
    contentUnits: (proposal.contentUnits || []).map((cu: Record<string, unknown>) => ({
      contentUnitId: cu.contentUnitId,
      confirmedClassification: 'plan',
      confirmedBindings: cu.fieldBindings || [],
      rawData: [],
      documentMetadata: {
        fileBase64,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        extractionSummary: cu.extractionSummary || {},
      },
      originalClassification: cu.classification,
      originalConfidence: cu.confidence,
    })),
  };

  const executeRes = await fetch(`${BASE_URL}/api/import/sci/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(executeBody),
    signal: AbortSignal.timeout(300000),
  });

  if (!executeRes.ok) {
    const text = await executeRes.text();
    console.error(`Execute failed (${executeRes.status}): ${text}`);
    process.exit(1);
  }

  const result = await executeRes.json();
  console.log(`Overall success: ${result.overallSuccess}`);
  for (const r of result.results || []) {
    console.log(`  - ${r.contentUnitId}: ${r.success ? 'OK' : 'FAIL'} (${r.pipeline}, ${r.rowsProcessed} rows)`);
    if (r.error) console.log(`    Error: ${r.error}`);
  }

  // Step 3: Verify rule_set created
  console.log('\n--- Step 3: Verify ---');
  const { data: ruleSets } = await sb.from('rule_sets')
    .select('id, name, status, components')
    .eq('tenant_id', OPTICA);

  console.log(`Rule sets: ${ruleSets?.length ?? 0}`);
  for (const rs of ruleSets || []) {
    const comps = rs.components;
    let count = 0;
    if (Array.isArray(comps)) count = comps.length;
    else if (comps && typeof comps === 'object') {
      const c = (comps as Record<string, unknown>).components;
      if (Array.isArray(c)) count = c.length;
    }
    console.log(`  - ${rs.id.substring(0, 8)}... name="${rs.name}" status=${rs.status} components=${count}`);
  }

  const pass = (ruleSets?.length ?? 0) >= 1;
  console.log(`\n=== Phase 1: ${pass ? 'PASS' : 'FAIL'} ===`);
}

run().catch(console.error);
