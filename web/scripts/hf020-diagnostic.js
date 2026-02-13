/**
 * HF-020 DEFINITIVE DIAGNOSTIC
 *
 * Paste this ENTIRE script into browser console at localhost:3000
 * Find employee 90198149 and trace EXACTLY why isCertified is wrong.
 */

(function() {
  'use strict';

  console.log('='.repeat(70));
  console.log('HF-020: DEFINITIVE DIAGNOSTIC');
  console.log('='.repeat(70));

  const TARGET_EMPLOYEE = '90198149';
  const tenantId = 'vialuce';

  // 1. Load aggregated data
  const aggKey = `data_layer_committed_aggregated_${tenantId}`;
  const aggData = localStorage.getItem(aggKey);

  if (!aggData) {
    console.error('No aggregated data found at key:', aggKey);
    console.log('Available localStorage keys:');
    Object.keys(localStorage).forEach(k => console.log('  ', k));
    return;
  }

  const employees = JSON.parse(aggData);
  console.log(`\nLoaded ${employees.length} employees from aggregated data\n`);

  // 2. Find target employee
  const targetEmp = employees.find(e =>
    String(e.employeeId) === TARGET_EMPLOYEE ||
    String(e.employeeId).includes(TARGET_EMPLOYEE)
  );

  if (!targetEmp) {
    console.error(`Employee ${TARGET_EMPLOYEE} NOT FOUND in aggregated data`);
    console.log('\nSample employee IDs:');
    employees.slice(0, 10).forEach(e => console.log('  ', e.employeeId));
    return;
  }

  console.log('='.repeat(70));
  console.log(`FOUND EMPLOYEE: ${TARGET_EMPLOYEE}`);
  console.log('='.repeat(70));

  // 3. Print ALL fields
  console.log('\n>>> RAW RECORD:');
  console.log(JSON.stringify(targetEmp, null, 2));

  // 4. Print specific fields
  console.log('\n>>> KEY FIELDS:');
  console.log('  employeeId:', targetEmp.employeeId);
  console.log('  name:', targetEmp.name);
  console.log('  role:', targetEmp.role);
  console.log('  typeof role:', typeof targetEmp.role);
  console.log('  role length:', targetEmp.role ? targetEmp.role.length : 'N/A');
  console.log('  role charCodes:', targetEmp.role ?
    Array.from(targetEmp.role).map(c => c.charCodeAt(0)).join(',') : 'N/A');

  // 5. Run deriveIsCertified logic
  console.log('\n>>> RUNNING deriveIsCertified() LOGIC:');

  const rawRole = targetEmp.role || '';
  console.log('  Step 1 - Raw role:', JSON.stringify(rawRole));

  const upperRole = rawRole.toUpperCase();
  console.log('  Step 2 - toUpperCase():', JSON.stringify(upperRole));

  const normalizedRole = upperRole.replace(/\s+/g, ' ').trim();
  console.log('  Step 3 - Normalized (\\s+ -> single space):', JSON.stringify(normalizedRole));

  const hasNoCertificado = normalizedRole.includes('NO CERTIFICADO') ||
                           normalizedRole.includes('NO-CERTIFICADO') ||
                           normalizedRole.includes('NON-CERTIFICADO') ||
                           normalizedRole.includes('NO CERT') ||
                           normalizedRole.includes('NON-CERT');
  console.log('  Step 4 - hasNoCertificado:', hasNoCertificado);

  const hasCertificado = normalizedRole.includes('CERTIFICADO') ||
                         normalizedRole.includes('CERTIFIED');
  console.log('  Step 5 - hasCertificado:', hasCertificado);

  const isCertified = hasCertificado && !hasNoCertificado;
  console.log('  Step 6 - isCertified (hasCertificado && !hasNoCertificado):', isCertified);

  // 6. Check for attributes.isCertified override
  console.log('\n>>> CHECKING ATTRIBUTES OVERRIDE:');
  if (targetEmp.attributes !== undefined) {
    console.log('  attributes exists:', true);
    console.log('  attributes.isCertified:', targetEmp.attributes?.isCertified);
    console.log('  typeof attributes.isCertified:', typeof targetEmp.attributes?.isCertified);
    if (targetEmp.attributes?.isCertified !== undefined) {
      console.log('  >>> OVERRIDE WOULD TRIGGER! Value:', Boolean(targetEmp.attributes.isCertified));
    }
  } else {
    console.log('  attributes:', undefined);
  }

  // 7. Final diagnosis
  console.log('\n' + '='.repeat(70));
  console.log('DIAGNOSIS');
  console.log('='.repeat(70));

  if (isCertified === false) {
    console.log('deriveIsCertified() returns FALSE (correct for non-certified)');
    console.log('If employee still shows Certified variant, the bug is ELSEWHERE:');
    console.log('  - Check if calculationContext path is being used');
    console.log('  - Check if EmployeeContext.isCertified is set differently');
    console.log('  - Check the variant matching in findMatchingVariant()');
  } else {
    console.log('deriveIsCertified() returns TRUE (INCORRECT for "NO CERTIFICADO")');
    console.log('Bug is in the role parsing logic or the role data itself');
  }

  console.log('\n' + '='.repeat(70));

  return {
    employeeId: targetEmp.employeeId,
    rawRole: rawRole,
    normalizedRole: normalizedRole,
    hasNoCertificado,
    hasCertificado,
    isCertified,
    attributes: targetEmp.attributes
  };
})();
