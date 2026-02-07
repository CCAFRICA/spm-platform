/**
 * Identity Resolution Engine
 *
 * Matches import records to federated identities using multi-field fuzzy matching.
 */

import type {
  FederatedIdentity,
  ImportRecord,
  IdentityLink,
  ParsedEmployeeData,
} from '@/types/user-import';

// ============================================
// MATCH STRATEGIES
// ============================================

type MatchStrategy = {
  name: string;
  fields: Array<keyof ParsedEmployeeData>;
  weight: number;
  exact?: boolean;
};

const MATCH_STRATEGIES: MatchStrategy[] = [
  // Exact employee number match - highest confidence
  { name: 'employee_number_exact', fields: ['employeeNumber'], weight: 1.0, exact: true },

  // Exact email match
  { name: 'email_exact', fields: ['email'], weight: 0.95, exact: true },

  // Name + email combination
  { name: 'name_email', fields: ['firstName', 'lastName', 'email'], weight: 0.9 },

  // Name + employee number
  { name: 'name_empnum', fields: ['firstName', 'lastName', 'employeeNumber'], weight: 0.85 },

  // Full name + department
  { name: 'name_department', fields: ['firstName', 'lastName', 'department'], weight: 0.75 },

  // Name only (fuzzy)
  { name: 'name_fuzzy', fields: ['firstName', 'lastName'], weight: 0.6 },
];

// ============================================
// STRING SIMILARITY
// ============================================

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1)
 */
function stringSimilarity(a: string | undefined, b: string | undefined): number {
  if (!a || !b) return 0;

  const normalizedA = a.toLowerCase().trim();
  const normalizedB = b.toLowerCase().trim();

  if (normalizedA === normalizedB) return 1;

  const maxLength = Math.max(normalizedA.length, normalizedB.length);
  if (maxLength === 0) return 1;

  const distance = levenshteinDistance(normalizedA, normalizedB);
  return 1 - distance / maxLength;
}

/**
 * Normalize name for comparison (handle accents, prefixes, etc.)
 */
function normalizeName(name: string | undefined): string {
  if (!name) return '';

  return name
    .toLowerCase()
    .trim()
    // Remove common prefixes/suffixes
    .replace(/^(mr\.?|mrs\.?|ms\.?|dr\.?|sr\.?|jr\.?)\s*/i, '')
    .replace(/\s+(jr\.?|sr\.?|iii?|iv)$/i, '')
    // Normalize accented characters
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Compare names with fuzzy matching
 */
function nameSimilarity(
  firstName1: string | undefined,
  lastName1: string | undefined,
  firstName2: string | undefined,
  lastName2: string | undefined
): number {
  const fn1 = normalizeName(firstName1);
  const ln1 = normalizeName(lastName1);
  const fn2 = normalizeName(firstName2);
  const ln2 = normalizeName(lastName2);

  // Try exact first/last match
  if (fn1 === fn2 && ln1 === ln2) return 1;

  // Try swapped first/last (common data entry error)
  if (fn1 === ln2 && ln1 === fn2) return 0.9;

  // Try nickname variations
  const fnSim = Math.max(
    stringSimilarity(fn1, fn2),
    nicknameMatch(fn1, fn2) ? 0.95 : 0
  );
  const lnSim = stringSimilarity(ln1, ln2);

  return (fnSim + lnSim) / 2;
}

/**
 * Common nickname mappings
 */
const NICKNAMES: Record<string, string[]> = {
  william: ['will', 'bill', 'billy', 'willy', 'liam'],
  robert: ['rob', 'bob', 'bobby', 'robbie'],
  richard: ['rick', 'rich', 'dick', 'ricky'],
  james: ['jim', 'jimmy', 'jamie'],
  michael: ['mike', 'mikey', 'mick'],
  elizabeth: ['liz', 'beth', 'lizzy', 'betsy', 'eliza'],
  margaret: ['maggie', 'meg', 'peggy', 'marge'],
  katherine: ['kate', 'katie', 'kathy', 'kat'],
  jennifer: ['jen', 'jenny', 'jenna'],
  christopher: ['chris', 'kit'],
  anthony: ['tony', 'ant'],
  alexander: ['alex', 'xander', 'sasha'],
  jonathan: ['jon', 'john', 'johnny'],
  benjamin: ['ben', 'benny', 'benji'],
  daniel: ['dan', 'danny'],
  matthew: ['matt', 'matty'],
  nicholas: ['nick', 'nicky'],
  patricia: ['pat', 'patty', 'tricia'],
  francisco: ['paco', 'pancho'],
  jose: ['pepe', 'chepe'],
  guadalupe: ['lupe', 'lupita'],
  eduardo: ['lalo', 'eddie'],
  fernando: ['nando', 'fer'],
};

function nicknameMatch(name1: string, name2: string): boolean {
  const n1 = name1.toLowerCase();
  const n2 = name2.toLowerCase();

  for (const [canonical, nicknames] of Object.entries(NICKNAMES)) {
    const allNames = [canonical, ...nicknames];
    if (allNames.includes(n1) && allNames.includes(n2)) {
      return true;
    }
  }

  return false;
}

// ============================================
// IDENTITY RESOLUTION
// ============================================

export interface MatchCandidate {
  identity: FederatedIdentity;
  confidence: number;
  matchReasons: string[];
  strategy: string;
}

/**
 * Find matching federated identities for an import record
 */
export function findIdentityMatches(
  record: ImportRecord,
  identities: FederatedIdentity[],
  threshold: number = 0.6
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];
  const parsed = record.parsedData;

  if (!parsed) return [];

  for (const identity of identities) {
    let bestMatch: MatchCandidate | null = null;

    for (const strategy of MATCH_STRATEGIES) {
      const match = evaluateStrategy(parsed, identity, strategy);

      if (match && match.confidence >= threshold) {
        if (!bestMatch || match.confidence > bestMatch.confidence) {
          bestMatch = match;
        }
      }
    }

    if (bestMatch) {
      candidates.push(bestMatch);
    }
  }

  // Sort by confidence descending
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Evaluate a single match strategy
 */
function evaluateStrategy(
  parsed: NonNullable<ParsedEmployeeData>,
  identity: FederatedIdentity,
  strategy: MatchStrategy
): MatchCandidate | null {
  const matchReasons: string[] = [];
  let totalScore = 0;
  let fieldCount = 0;

  for (const field of strategy.fields) {
    const importValue = parsed[field];
    const identityValue = getIdentityField(identity, field);

    if (!importValue || !identityValue) continue;

    fieldCount++;

    if (strategy.exact) {
      if (String(importValue).toLowerCase() === String(identityValue).toLowerCase()) {
        totalScore += 1;
        matchReasons.push(`Exact match on ${field}`);
      }
    } else {
      // Use appropriate similarity function
      let similarity: number;

      if (field === 'firstName' || field === 'lastName') {
        similarity = nameSimilarity(
          parsed.firstName,
          parsed.lastName,
          identity.canonicalData.firstName,
          identity.canonicalData.lastName
        );
        // Only count name once
        if (field === 'lastName') continue;
        matchReasons.push(`Name match: ${Math.round(similarity * 100)}%`);
      } else {
        similarity = stringSimilarity(String(importValue), String(identityValue));
        if (similarity > 0.8) {
          matchReasons.push(`${field} match: ${Math.round(similarity * 100)}%`);
        }
      }

      totalScore += similarity;
    }
  }

  if (fieldCount === 0) return null;

  const avgScore = totalScore / fieldCount;
  const confidence = avgScore * strategy.weight;

  if (confidence < 0.5) return null;

  return {
    identity,
    confidence,
    matchReasons,
    strategy: strategy.name,
  };
}

/**
 * Get field value from identity canonical data
 */
function getIdentityField(
  identity: FederatedIdentity,
  field: keyof ParsedEmployeeData
): string | undefined {
  const cd = identity.canonicalData;

  switch (field) {
    case 'firstName':
      return cd.firstName;
    case 'lastName':
      return cd.lastName;
    case 'email':
      return cd.email;
    case 'employeeNumber':
      return cd.employeeNumber;
    case 'department':
      return cd.department;
    case 'title':
      return cd.title;
    case 'location':
      return cd.location;
    default:
      return undefined;
  }
}

// ============================================
// IDENTITY CREATION & LINKING
// ============================================

/**
 * Create a new federated identity from an import record
 */
export function createIdentityFromRecord(
  record: ImportRecord,
  tenantId: string,
  sourceId: string
): Omit<FederatedIdentity, 'id'> {
  const parsed = record.parsedData!;

  return {
    tenantId,
    canonicalData: {
      firstName: parsed.firstName || '',
      lastName: parsed.lastName || '',
      email: parsed.email,
      employeeNumber: parsed.employeeNumber,
      department: parsed.department,
      title: parsed.title,
      location: parsed.location,
      hireDate: parsed.hireDate,
      terminationDate: parsed.terminationDate,
      status: parsed.terminationDate ? 'terminated' : 'active',
    },
    identityLinks: [
      {
        sourceId,
        externalId: parsed.employeeNumber || parsed.email || `row-${record.rowNumber}`,
        confidence: 100,
        linkMethod: 'exact_match',
        linkedAt: new Date().toISOString(),
      },
    ],
    hierarchy: {
      directReports: [],
    },
    identityConfidence: 100,
    hierarchyConfidence: 0, // Will be set by hierarchy detection
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

/**
 * Create an identity link for an existing identity
 */
export function createIdentityLink(
  record: ImportRecord,
  sourceId: string,
  matchConfidence: number,
  matchMethod: IdentityLink['linkMethod']
): IdentityLink {
  const parsed = record.parsedData!;

  return {
    sourceId,
    externalId: parsed.employeeNumber || parsed.email || `row-${record.rowNumber}`,
    confidence: Math.round(matchConfidence * 100),
    linkMethod: matchMethod,
    linkedAt: new Date().toISOString(),
  };
}

/**
 * Merge import record data into existing identity
 */
export function mergeRecordIntoIdentity(
  identity: FederatedIdentity,
  record: ImportRecord,
  sourceId: string,
  sourcePriority: number
): FederatedIdentity {
  const parsed = record.parsedData!;
  const existing = identity.canonicalData;

  // Only update fields if source has higher priority or field is empty
  const shouldUpdate = (field: string, newValue: string | undefined): boolean => {
    if (!newValue) return false;
    const existingValue = existing[field as keyof typeof existing];
    if (!existingValue) return true;

    // Check source priority from existing links
    const existingLink = identity.identityLinks.find((l) =>
      l.externalId === existing.employeeNumber || l.externalId === existing.email
    );
    // Lower priority number = higher priority
    return sourcePriority < (existingLink ? 5 : 10);
  };

  return {
    ...identity,
    canonicalData: {
      ...existing,
      firstName: shouldUpdate('firstName', parsed.firstName) ? parsed.firstName! : existing.firstName,
      lastName: shouldUpdate('lastName', parsed.lastName) ? parsed.lastName! : existing.lastName,
      email: shouldUpdate('email', parsed.email) ? parsed.email : existing.email,
      employeeNumber: shouldUpdate('employeeNumber', parsed.employeeNumber)
        ? parsed.employeeNumber
        : existing.employeeNumber,
      department: shouldUpdate('department', parsed.department) ? parsed.department : existing.department,
      title: shouldUpdate('title', parsed.title) ? parsed.title : existing.title,
      location: shouldUpdate('location', parsed.location) ? parsed.location : existing.location,
      hireDate: shouldUpdate('hireDate', parsed.hireDate) ? parsed.hireDate : existing.hireDate,
      terminationDate: shouldUpdate('terminationDate', parsed.terminationDate)
        ? parsed.terminationDate
        : existing.terminationDate,
      status: parsed.terminationDate ? 'terminated' : existing.status,
    },
    identityLinks: [
      ...identity.identityLinks,
      createIdentityLink(record, sourceId, 0.9, 'fuzzy_match'),
    ],
    updatedAt: new Date().toISOString(),
    version: identity.version + 1,
  };
}
