/**
 * OB-119 Diagnostic: Test AI field mapping for transaction files
 */

async function main() {
  // Test what the AI returns for a loan disbursement CSV
  const headers = `1. "OfficerID"\n2. "OfficerName"\n3. "Branch"\n4. "LoanID"\n5. "LoanAmount"\n6. "DisbursementDate"\n7. "ProductType"\n8. "Term_Months"\n9. "InterestRate"\n10. "Currency"`;

  const sampleData = `Row 1: { OfficerID: 1001, OfficerName: Carlos Garcia, Branch: CFG-CDMX-001, LoanID: LN-2024-01-1001-001, LoanAmount: 390972.67, DisbursementDate: 45308, ProductType: Personal, Term_Months: 36, InterestRate: 0.1499, Currency: MXN }
Row 2: { OfficerID: 1002, OfficerName: Maria Lopez, Branch: CFG-CDMX-002, LoanID: LN-2024-01-1002-001, LoanAmount: 74283.15, DisbursementDate: 45312, ProductType: Auto, Term_Months: 48, InterestRate: 0.1299, Currency: MXN }`;

  const resp = await fetch("http://localhost:3000/api/interpret-import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      headers,
      sampleData,
      tenantContext: "File: CFG_Loan_Disbursements_Jan2024.csv",
    }),
  });

  const data = await resp.json();
  console.log("=== AI Field Mapping Response ===");
  console.log(`Success: ${data.success}`);
  console.log(`Method: ${data.method}`);
  console.log(`Confidence: ${data.confidence}`);

  if (data.interpretation?.mappings) {
    console.log("\nMappings:");
    for (const m of data.interpretation.mappings) {
      const marker = m.targetField === 'entity_id' ? ' ← ENTITY' :
                     m.targetField === 'date' ? ' ← DATE' :
                     m.targetField === 'amount' ? ' ← AMOUNT' : '';
      console.log(`  ${m.sourceField} → ${m.targetField} (${m.confidence}%)${marker}`);
    }
  } else {
    console.log("\nRaw response:", JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);
