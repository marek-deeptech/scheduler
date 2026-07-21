import crypto from 'crypto';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TD='22222222-2222-2222-2222-222222222222', TH='22222222-0000-0000-0000-000000000010';
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const hp={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:'return=representation'};
const prods=await (await fetch(`${URL}/rest/v1/productions?org_id=eq.${TD}&select=id,title,stage,favourite_level`,{headers:hg})).json();
const aps=await (await fetch(`${URL}/rest/v1/artist_productions?org_id=eq.${TD}&select=artist_id,production_id&limit=100000`,{headers:hg})).json();
const cast={}; aps.forEach(a=>(cast[a.production_id]=cast[a.production_id]||[]).push(a.artist_id));
const byStage={duza:[],mala:[],przodownik:[]}; prods.forEach(p=>byStage[p.stage]&&byStage[p.stage].push(p));
for(const s in byStage) byStage[s].sort((a,b)=>(b.favourite_level||0)-(a.favourite_level||0)||a.title.localeCompare(b.title));
const room={duza:{id:'22222222-0000-0000-0003-000000000011',name:'Duża Scena'},mala:{id:'22222222-0000-0000-0003-000000000013',name:'Mała Scena'},przodownik:{id:'22222222-0000-0000-0003-000000000014',name:'Scena Przodownik'}};
const overlap=(s1,e1,s2,e2)=>s1<e2&&s2<e1;
// days: Jul 20-31, Aug 1-15  (skip some Mondays for realism: pn-light)
const days=[];
for(let d=20;d<=31;d++) days.push(`2026-07-${String(d).padStart(2,'0')}`);
for(let d=1;d<=15;d++) days.push(`2026-08-${String(d).padStart(2,'0')}`);
const ptr={duza:0,mala:0,przodownik:0};
const events=[], evArtists=[];
for(const date of days){
  const dow=new Date(date+'T12:00:00Z').getUTCDay(); // 0 Sun .. 6 Sat
  if(dow===1 && Math.random()<0.6) continue; // Monday often dark
  // 1-2 stages per evening
  const stages = dow===0||dow===6 ? ['duza','mala'] : (Math.random()<0.5?['duza']:['duza','przodownik']);
  const busy=[];
  for(const st of stages){
    const list=byStage[st]; const start = (dow===0||dow===6)&&st==='mala' ? '17:00:00':'19:00:00'; const end=(dow===0||dow===6)&&st==='mala'?'19:00:00':'21:00:00';
    let chosen=null;
    for(let k=0;k<list.length;k++){ const c=list[(ptr[st]+k)%list.length]; const cs=cast[c.id]||[];
      if(busy.some(b=>overlap(start.slice(0,5),end.slice(0,5),b.s,b.e)&&cs.some(a=>b.a.has(a)))) continue;
      chosen=c; ptr[st]=(ptr[st]+k+1)%list.length; break; }
    if(!chosen) continue;
    const id=crypto.randomUUID();
    events.push({id, production_id:chosen.id, title:chosen.title, start_time:`${date}T${start}`, end_time:`${date}T${end}`, location:room[st].name, theatre_id:TH, room_id:room[st].id, type:'spektakl', org_id:TD});
    (cast[chosen.id]||[]).forEach(a=>evArtists.push({event_id:id, artist_id:a, org_id:TD}));
    busy.push({s:start.slice(0,5),e:end.slice(0,5),a:new Set(cast[chosen.id]||[])});
  }
}
console.log('new events',events.length,'new event_artists',evArtists.length);
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
for(const c of chunk(events,50)){ const r=await fetch(`${URL}/rest/v1/events`,{method:'POST',headers:hp,body:JSON.stringify(c)}); if(!r.ok){console.log('ERR ev',r.status,await r.text());process.exit(1);} }
for(const c of chunk(evArtists,200)){ const r=await fetch(`${URL}/rest/v1/event_artists`,{method:'POST',headers:hp,body:JSON.stringify(c)}); if(!r.ok){console.log('ERR ea',r.status,(await r.text()).slice(0,200));} }
// verify upcoming
const evs=await (await fetch(`${URL}/rest/v1/events?org_id=eq.${TD}&select=start_time&start_time=gte.2026-07-20T00:00:00&start_time=lte.2026-08-03T23:59&limit=1000`,{headers:hg})).json();
console.log('Upcoming (Jul20-Aug3) now:',evs.length);
