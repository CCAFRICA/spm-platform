(async()=>{
  const key=process.env.ANTHROPIC_API_KEY!;
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:50,messages:[{role:'user',content:'Reply with the single word OK.'}]})});
    console.log('PROBE status:',r.status); const j:any=await r.json(); console.log('PROBE reply:', j?.content?.[0]?.text ?? JSON.stringify(j).slice(0,200));
  }catch(e:any){console.log('PROBE fetch failed:', e?.message, e?.cause?.code);}
})().then(()=>process.exit(0));
