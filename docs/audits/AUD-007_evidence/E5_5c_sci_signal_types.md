# E5.5c — `web/src/lib/sci/sci-signal-types.ts` (verbatim with line numbers)

**Total lines: 125**

```typescript
     1	// SCI Signal Types — Classification Signal definitions for SCI events
     2	// Decision 30 — "Classification Signal" not "Training Signal"
     3	// Zero domain vocabulary. Korean Test applies.
     4	
     5	// ============================================================
     6	// SIGNAL TYPE ENUM
     7	// ============================================================
     8	
     9	export type SCISignalType =
    10	  | 'content_classification'         // Agent scored a content unit
    11	  | 'content_classification_outcome' // User confirmed or overrode agent classification
    12	  | 'field_binding'                  // Agent assigned semantic roles to fields (grouped)
    13	  | 'field_binding_outcome'          // User changed a field binding
    14	  | 'negotiation_round'             // Round 2 score adjustment
    15	  | 'convergence_outcome'           // Reconciliation match rate as interpretation proxy
    16	  | 'cost_event'                    // AI API call made during import
    17	  ;
    18	
    19	// ============================================================
    20	// SIGNAL PAYLOAD STRUCTURES
    21	// ============================================================
    22	
    23	export interface ContentClassificationSignal {
    24	  signalType: 'content_classification';
    25	  contentUnitId: string;
    26	  sourceFile: string;
    27	  tabName: string;
    28	  agentScores: Array<{
    29	    agent: string;
    30	    confidence: number;
    31	    topSignals: string[];
    32	  }>;
    33	  winningAgent: string;
    34	  winningConfidence: number;
    35	  claimType: string;
    36	  requiresHumanReview: boolean;
    37	  round: number;
    38	}
    39	
    40	export interface ContentClassificationOutcomeSignal {
    41	  signalType: 'content_classification_outcome';
    42	  contentUnitId: string;
    43	  predictedClassification: string;
    44	  confirmedClassification: string;
    45	  wasOverridden: boolean;
    46	  predictionConfidence: number;
    47	}
    48	
    49	export interface FieldBindingSignal {
    50	  signalType: 'field_binding';
    51	  contentUnitId: string;
    52	  fieldCount: number;
    53	  bindingSummary: Array<{
    54	    sourceField: string;
    55	    semanticRole: string;
    56	    confidence: number;
    57	    claimedBy: string;
    58	  }>;
    59	  avgConfidence: number;
    60	}
    61	
    62	export interface FieldBindingOutcomeSignal {
    63	  signalType: 'field_binding_outcome';
    64	  contentUnitId: string;
    65	  sourceField: string;
    66	  predictedSemanticRole: string;
    67	  confirmedSemanticRole: string;
    68	  wasOverridden: boolean;
    69	  predictionConfidence: number;
    70	}
    71	
    72	export interface NegotiationRoundSignal {
    73	  signalType: 'negotiation_round';
    74	  contentUnitId: string;
    75	  round1TopAgent: string;
    76	  round1TopConfidence: number;
    77	  round2TopAgent: string;
    78	  round2TopConfidence: number;
    79	  absenceBoostApplied: boolean;
    80	  splitDecision: boolean;
    81	}
    82	
    83	export interface ConvergenceOutcomeSignal {
    84	  signalType: 'convergence_outcome';
    85	  planId: string;
    86	  periodId: string;
    87	  entityCount: number;
    88	  matchRate: number;
    89	  totalDelta: number;
    90	  isExactMatch: boolean;
    91	}
    92	
    93	export interface CostEventSignal {
    94	  signalType: 'cost_event';
    95	  eventType: 'ai_api_call';
    96	  provider: string;
    97	  model: string;
    98	  purpose: string;
    99	  inputTokens: number;
   100	  outputTokens: number;
   101	  estimatedCostUSD: number;
   102	}
   103	
   104	// ============================================================
   105	// UNION TYPE
   106	// ============================================================
   107	
   108	export type SCISignal =
   109	  | ContentClassificationSignal
   110	  | ContentClassificationOutcomeSignal
   111	  | FieldBindingSignal
   112	  | FieldBindingOutcomeSignal
   113	  | NegotiationRoundSignal
   114	  | ConvergenceOutcomeSignal
   115	  | CostEventSignal;
   116	
   117	// ============================================================
   118	// SIGNAL CAPTURE REQUEST
   119	// ============================================================
   120	
   121	export interface SCISignalCapture {
   122	  tenantId: string;
   123	  signal: SCISignal;
   124	  entityId?: string;
   125	}
```
