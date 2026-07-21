import fs from 'fs';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const URL=env.NEXT_PUBLIC_SUPABASE_URL,KEY=env.SUPABASE_SERVICE_ROLE_KEY,TD='22222222-2222-2222-2222-222222222222';
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const hp={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:'return=representation'};
const MALE_A=new Set(['kuba','barnaba','bonawentura','kosma','jarema','sasza','dyzma','nikita','ilja','aleksa','miła']);
const gender=name=>{const f=name.trim().split(/\s+/)[0].toLowerCase(); if(MALE_A.has(f))return'M'; return f.endsWith('a')?'F':'M';};
const artists=await (await fetch(`${URL}/rest/v1/artists?org_id=eq.${TD}&select=id,name,role,team_id&limit=1000`,{headers:hg})).json();
const CAST='8c426841-7c11-4e3b-a181-62e036d0e6db';
const cast=artists.filter(a=>a.team_id===CAST); // only actors as dublers
const gof={}; cast.forEach(a=>gof[a.id]=a.role?(a.role==='Aktorka'?'F':'M'):gender(a.name));
const prods=await (await fetch(`${URL}/rest/v1/productions?org_id=eq.${TD}&select=id,title&title=in.("NINA. WIECZNA KRÓLOWA","FOGG 2126")`,{headers:hg})).json();
const aps=await (await fetch(`${URL}/rest/v1/artist_productions?org_id=eq.${TD}&select=artist_id,production_id&limit=100000`,{headers:hg})).json();
const castByProd={}; aps.forEach(a=>(castByProd[a.production_id]=castByProd[a.production_id]||new Set()).add(a.artist_id));
const subs=await (await fetch(`${URL}/rest/v1/actor_production_substitutes?org_id=eq.${TD}&select=actor_id,production_id,substitute_id&limit=100000`,{headers:hg})).json();
const existing=new Set(subs.map(s=>`${s.production_id}|${s.actor_id}`));
const rows=[];
for(const p of prods){
  const inCast=castByProd[p.id]||new Set();
  const members=[...inCast];
  // pools by gender: actors NOT in cast
  const pool={M:cast.filter(a=>gof[a.id]==='M'&&!inCast.has(a.id)).map(a=>a.id),F:cast.filter(a=>gof[a.id]==='F'&&!inCast.has(a.id)).map(a=>a.id)};
  const ptr={M:0,F:0};
  for(const aid of members){
    if(existing.has(`${p.id}|${aid}`))continue;
    const g=gof[aid]||'M'; const arr=pool[g]; if(!arr.length)continue;
    const sub=arr[ptr[g]%arr.length]; ptr[g]++;
    rows.push({actor_id:aid,production_id:p.id,substitute_id:sub,org_id:TD});
  }
  console.log(`${p.title}: cast ${members.length}, dublers to add ${rows.filter(r=>r.production_id===p.id).length} (pool M${pool.M.length}/F${pool.F.length})`);
}
if(rows.length){ const r=await fetch(`${URL}/rest/v1/actor_production_substitutes`,{method:'POST',headers:hp,body:JSON.stringify(rows)}); const j=await r.json(); console.log('inserted:',r.status, Array.isArray(j)?j.length:JSON.stringify(j).slice(0,200)); }
// verify gender match
const sub2=await (await fetch(`${URL}/rest/v1/actor_production_substitutes?org_id=eq.${TD}&production_id=in.("${prods.map(p=>p.id).join('","')}")&select=actor_id,substitute_id`,{headers:hg})).json();
let mismatch=0; for(const s of sub2){ if((gof[s.actor_id]||'?')!==(gof[s.substitute_id]||'?'))mismatch++; }
console.log('NINA+FOGG dublers total:',sub2.length,'gender mismatches:',mismatch);
