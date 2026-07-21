import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TD='22222222-2222-2222-2222-222222222222';
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const hp={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:'return=representation'};

const prods=await (await fetch(`${URL}/rest/v1/productions?org_id=eq.${TD}&select=id,title,stage`,{headers:hg})).json();
const aps=await (await fetch(`${URL}/rest/v1/artist_productions?org_id=eq.${TD}&select=artist_id,production_id&limit=100000`,{headers:hg})).json();
const castByProd={}; aps.forEach(a=>(castByProd[a.production_id]=castByProd[a.production_id]||[]).push(a.artist_id));
const castByTitle=new Map(); prods.forEach(p=>castByTitle.set(p.title,castByProd[p.id]||[]));
const stageRoom={duza:{id:'22222222-0000-0000-0003-000000000011',name:'Duża Scena'},mala:{id:'22222222-0000-0000-0003-000000000013',name:'Mała Scena'},przodownik:{id:'22222222-0000-0000-0003-000000000014',name:'Scena Przodownik'}};
const stageOf=Object.fromEntries(prods.map(p=>[p.title,p.stage]));
const idOf=Object.fromEntries(prods.map(p=>[p.title,p.id]));

function countConflicts(items){
  let n=0;
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j];
    if(a.date!==b.date||a.production_title===b.production_title)continue;
    if(a.start_time>=b.end_time||b.start_time>=a.end_time)continue;
    const sh=(castByTitle.get(a.production_title)||[]).filter(x=>(castByTitle.get(b.production_title)||[]).includes(x));
    if(sh.length)n++;
  }
  return n;
}

const oct=JSON.parse(fs.readFileSync('scratchpad/rebuilt-2026-10.json'));
let nov=JSON.parse(fs.readFileSync('scratchpad/rebuilt-2026-11.json'));
console.log('pre-inject conflicts: OCT',countConflicts(oct),'NOV',countConflicts(nov));

// Inject 5 conflicts into NOV: pick 5 distinct dates with an evening item; add a partner sharing cast in a different room
const novDates=[...new Set(nov.map(i=>i.date))].sort();
const used=new Set(); let injected=0;
for(const d of novDates){ if(injected>=5)break;
  const dayItems=nov.filter(i=>i.date===d);
  // pick an evening anchor ~19:00
  const anchor=dayItems.find(i=>i.start_time>='18:00:00'&&i.start_time<='19:30:00'); if(!anchor)continue;
  const aCast=new Set(castByTitle.get(anchor.production_title)||[]);
  // find partner title sharing >=1 actor, not already playing this date, different room than anchor
  const titlesToday=new Set(dayItems.map(i=>i.production_title));
  let partner=null;
  for(const p of prods){ if(titlesToday.has(p.title))continue; if(p.title===anchor.production_title)continue;
    const shared=(castByProd[p.id]||[]).some(x=>aCast.has(x));
    if(!shared)continue; if(stageRoom[p.stage].name===anchor.room_name)continue; partner=p; break; }
  if(!partner)continue;
  const inj={date:d,type:'spektakl',room_id:stageRoom[partner.stage].id,room_name:stageRoom[partner.stage].name,start_time:anchor.start_time,end_time:anchor.end_time,production_id:partner.id,production_title:partner.title,_conflict:true};
  nov.push(inj); injected++;
  console.log(`  conflict ${injected}: ${d} ${anchor.production_title} (${anchor.room_name}) x ${partner.title} (${inj.room_name}) @ ${anchor.start_time}`);
}
// strip helper flag
nov=nov.map(({_conflict,...r})=>r);
nov.sort((a,b)=>a.date.localeCompare(b.date)||a.start_time.localeCompare(b.start_time));
console.log('post-inject conflicts: NOV',countConflicts(nov),'items',nov.length);

// WRITE proposals
async function setProp(month,data){ const r=await fetch(`${URL}/rest/v1/repertoire_proposals?org_id=eq.${TD}&month=eq.${month}`,{method:'PATCH',headers:hp,body:JSON.stringify({proposal_data:data})}); console.log(`PATCH ${month}:`,r.status,(await r.json()).length,'row'); }
await setProp('2026-10',oct);
await setProp('2026-11',nov);

// DELETE leftover Nov events (draft month = proposal only)
const evs=await (await fetch(`${URL}/rest/v1/events?org_id=eq.${TD}&select=id,start_time&limit=100000`,{headers:hg})).json();
const novEv=evs.filter(e=>e.start_time.slice(0,7)==='2026-11').map(e=>e.id);
if(novEv.length){
  const q=`event_id=in.(${novEv.map(x=>`"${x}"`).join(',')})&org_id=eq.${TD}`;
  const c=await fetch(`${URL}/rest/v1/event_confirmations?${q}`,{method:'DELETE',headers:hp}); console.log('del Nov confirmations:',(await c.json()).length);
  const ea=await fetch(`${URL}/rest/v1/event_artists?${q}`,{method:'DELETE',headers:hp}); console.log('del Nov event_artists:',(await ea.json()).length);
  const e=await fetch(`${URL}/rest/v1/events?id=in.(${novEv.map(x=>`"${x}"`).join(',')})&org_id=eq.${TD}`,{method:'DELETE',headers:hp}); console.log('del Nov events:',(await e.json()).length);
}
console.log('DONE');
