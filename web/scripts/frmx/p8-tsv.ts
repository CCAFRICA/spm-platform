import fs from 'fs';
function rng(seed:number){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/0xffffffff;};}
const r=rng(99); const ri=(a:number,b:number)=>a+Math.floor(r()*(b-a+1)); const r2=(x:number)=>Math.round(x*100)/100;
const NAMES=['María Elena Gutiérrez Flores','José Antonio López Hernández','Ana Cruz Martínez','Luis Ramírez Torres','Sofía Reyes Morales','Diego Vázquez Castillo','Carmen Jiménez Ortiz','Pablo Mendoza Romero'];
const LOCS=['FRMX-CD-CDMX-001','FRMX-TV-CDMX-001','FRMX-MB-CDMX-001','FRMX-CD-MTY-001','FRMX-TV-GDL-001'];
const PRODUCTS=['Taco al Pastor','TACOS PASTOR','tacos_pastor','Orden Tacos Pastor','Pescado Zarandeado','PESC ZARAND','Margarita','margarita clasica','Cerveza Corona','CORONA 355ML'];
function row(loc:string,date:string,seq:number){
  const com=ri(1,4); const sub=r2(ri(120,900)); const ali=r2(sub*0.75); const beb=r2(sub-ali);
  const desc=r2(r()<0.4?sub*0.04:0); const cort=r2(r()<0.3?sub*0.015:0); const canc=r2(r()<0.5?sub*0.02:0);
  const net=r2(sub-desc-cort-canc); const iva=r2(net*0.16); const tot=r2(net+iva); const prop=r2(net*0.14);
  const ef=r()<0.4?tot:0; const tj=ef?0:tot;
  return { folio:`CHQ-${loc}-${date.replace(/-/g,'')}-${String(seq).padStart(4,'0')}`, fecha:date, hora_apertura:`${ri(7,22)}:${String(ri(0,59)).padStart(2,'0')}`, hora_cierre:`${ri(8,23)}:${String(ri(0,59)).padStart(2,'0')}`,
    mesa:ri(1,30), mesero_id:`MES-${String(ri(1,40)).padStart(3,'0')}`, mesero_nombre:NAMES[ri(0,NAMES.length-1)], num_comensales:com, turno:['morning','afternoon','night'][ri(0,2)],
    subtotal_alimentos:ali, subtotal_bebidas:beb, descuento:desc, cortesia:cort, cancelado:canc, subtotal:sub, iva, total:tot, propina:prop, efectivo:ef, tarjeta:tj, forma_pago:ef?'efectivo':'tarjeta', sucursal_id:loc, tipo_servicio:loc.includes('-TV-')?'express':'dine_in', descripcion_producto:PRODUCTS[ri(0,PRODUCTS.length-1)] };
}
function gen(n:number,startDay:number,month:number){ const rows=[]; for(let i=0;i<n;i++){ const d=startDay+ (i%7); const date=`2024-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`; rows.push(row(LOCS[i%LOCS.length],date,i+1)); } return rows; }
const N=2500;
// File 1: clean Spanish 23-col
const ES=['folio','fecha','hora_apertura','hora_cierre','mesa','mesero_id','mesero_nombre','num_comensales','turno','subtotal_alimentos','subtotal_bebidas','descuento','cortesia','cancelado','subtotal','iva','total','propina','efectivo','tarjeta','forma_pago','sucursal_id','tipo_servicio'];
const f1=gen(N,22,1);
fs.writeFileSync('public/demo-data/frmx/cheques_20240122_clean.tsv', ES.join('\t')+'\n'+f1.map(x=>ES.map(k=>(x as any)[k]).join('\t')).join('\n')+'\n');
// File 2: English headers
const EN=['receipt_number','date','open_time','close_time','table','server_id','server_name','guests','shift','food_subtotal','beverage_subtotal','discount','comp','voided','subtotal','tax','total','tip','cash','card','payment_method','store_id','service_type'];
const f2=gen(N,29,1);
fs.writeFileSync('public/demo-data/frmx/cheques_20240129_english.tsv', EN.join('\t')+'\n'+f2.map(x=>ES.map(k=>(x as any)[k]).join('\t')).join('\n')+'\n');
// File 3: messy mixed + 24th product column
const MX=['folio','date','hora_apertura','close_time','mesa','server_id','mesero_nombre','guests','turno','vta_comida','beverage_subtotal','descuento','comp','cancelado','subtotal','iva','total','propina','cash','tarjeta','forma_pago','store_id','tipo_servicio','descripcion_producto'];
const ESp=[...ES,'descripcion_producto'];
const f3=gen(N,5,2);
fs.writeFileSync('public/demo-data/frmx/cheques_20240205_messy.tsv', MX.join('\t')+'\n'+f3.map(x=>ESp.map(k=>(x as any)[k]).join('\t')).join('\n')+'\n');
console.log(`PROOF: 3 TSV files written, ${N} rows each. headers: ES(23) | EN(23) | MIXED+product(24)`);
