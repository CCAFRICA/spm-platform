import { buildInsightNarrative } from '../../src/lib/results/insight-narrative';
const fmt = (n:number)=>'$'+n.toLocaleString();
// BCL-like: anomalies present
console.log('ANOMALY case:', JSON.stringify(buildInsightNarrative({persona:'admin',totalPayout:44590,entityCount:85,componentCount:4,anomalyCount:3,topAnomaly:{description:'4 entities >2σ above mean',severity:'warning'},targetDrivenComponents:2,formatCurrency:fmt}),null,0));
// healthy
console.log('HEALTHY case:', JSON.stringify(buildInsightNarrative({persona:'admin',totalPayout:44590,entityCount:85,componentCount:4,anomalyCount:0,topAnomaly:null,targetDrivenComponents:2,formatCurrency:fmt}),null,0));
// manager
console.log('MANAGER case:', JSON.stringify(buildInsightNarrative({persona:'manager',totalPayout:44590,entityCount:12,componentCount:4,anomalyCount:2,topAnomaly:{description:'2 declining 3 periods',severity:'warning'},targetDrivenComponents:2,formatCurrency:fmt}),null,0));
