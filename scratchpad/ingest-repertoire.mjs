import fs from 'fs';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const URL=env.NEXT_PUBLIC_SUPABASE_URL,KEY=env.SUPABASE_SERVICE_ROLE_KEY,TD='22222222-2222-2222-2222-222222222222',TH='22222222-0000-0000-0000-000000000010';
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const hp={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:'return=representation'};
const rep=JSON.parse(fs.readFileSync('scratchpad/td-real/repertoire.json'));
const slugs=JSON.parse(fs.readFileSync('scratchpad/td-real/titles-slugs.json'));
const slugToTitle=Object.fromEntries(slugs.map(s=>[s.slug,s.title]));
const prods=await (await fetch(`${URL}/rest/v1/productions?org_id=eq.${TD}&select=id,title&limit=1000`,{headers:hg})).json();
const idByTitle=Object.fromEntries(prods.map(p=>[p.title,p.id]));
const aps=await (await fetch(`${URL}/rest/v1/artist_productions?org_id=eq.${TD}&select=artist_id,production_id&limit=100000`,{headers:hg})).json();
const castByProd={}; aps.forEach(a=>(castByProd[a.production_id]=castByProd[a.production_id]||[]).push(a.artist_id));
const ROOM={"Duża Scena":{id:'22222222-0000-0000-0003-000000000011',name:'Duża Scena'},"Mała scena":{id:'22222222-0000-0000-0003-000000000013',name:'Mała Scena'},"sala im. Haliny Mikołajskiej":{id:'22222222-0000-0000-0003-000000000012',name:'Scena im. Haliny Mikołajskiej'}};
const addH=(hhmm,h)=>{let[H,M]=hhmm.split(':').map(Number);H+=h;return `${String(H).padStart(2,'0')}:${String(M).padStart(2,'0')}:00`;};
const months={'2026-09':'Wrzesień','2026-10':'Październik','2026-11':'Listopad','2026-12':'Grudzień'};
const STATS={consultations_started_at:'2026-06-15T09:00:00+00:00',sales_started_at:'2026-06-25T09:00:00+00:00'};

// clean existing events for these months
for(const ym of Object.keys(months)){
  const [y,m]=ym.split('-'); const nextM=String(+m+1).padStart(2,'0'); const hi=+m===12?`${+y+1}-01-01`:`${y}-${nextM}-01`;
  const evs=await (await fetch(`${URL}/rest/v1/events?org_id=eq.${TD}&start_time=gte.${ym}-01&start_time=lt.${hi}&select=id&limit=10000`,{headers:hg})).json();
  const ids=evs.map(e=>e.id);
  const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
  for(const c of chunk(ids,40)){ const q=`event_id=in.(${c.map(x=>`"${x}"`).join(',')})&org_id=eq.${TD}`;
    await fetch(`${URL}/rest/v1/event_confirmations?${q}`,{method:'DELETE',headers:hp});
    await fetch(`${URL}/rest/v1/event_artists?${q}`,{method:'DELETE',headers:hp});
    await fetch(`${URL}/rest/v1/events?id=in.(${c.map(x=>`"${x}"`).join(',')})&org_id=eq.${TD}`,{method:'DELETE',headers:hp});
  }
  console.log(`${ym}: cleared ${ids.length} old events`);
}

let evSeq=1000;
for(const [ym,label] of Object.entries(months)){
  const items=rep[ym];
  const proposal=[], events=[], eventArtists=[];
  for(const it of items){
    const room=ROOM[it.scene]; const isGuest=!it.slug;
    const title=isGuest?it.title:(slugToTitle[it.slug]||it.title);
    const pid=isGuest?null:idByTitle[title];
    const st=it.time+':00', et=addH(it.time,2);
    const type=it.label==='PREMIERA'?'Premiera':(isGuest?'Spektakl gościnny':'Spektakl');
    // proposal item (Repertuar)
    proposal.push({date:it.date,type:isGuest?'gościnny':'spektakl',room_id:room.id,room_name:room.name,start_time:st,end_time:et,production_id:pid,production_title:title});
    // event (calendar/Pulpit)
    const eid=`22222222-0000-0000-000a-${String(evSeq++).padStart(12,'0')}`;
    events.push({id:eid,production_id:pid,title,start_time:`${it.date}T${st}+00:00`,end_time:`${it.date}T${et}+00:00`,theatre_id:TH,room_id:room.id,type,org_id:TD});
    if(pid) for(const aid of (castByProd[pid]||[])) eventArtists.push({event_id:eid,artist_id:aid,org_id:TD});
  }
  // upsert proposal
  const exists=await (await fetch(`${URL}/rest/v1/repertoire_proposals?org_id=eq.${TD}&month=eq.${ym}&select=id`,{headers:hg})).json();
  const body={month:ym,label:`Repertuar — ${label} 2026`,status:'approved',proposal_data:proposal,stats:STATS,theatre_id:TH,org_id:TD,approved_at:'2026-06-10T09:00:00+00:00'};
  if(exists.length){ await fetch(`${URL}/rest/v1/repertoire_proposals?id=eq.${exists[0].id}`,{method:'PATCH',headers:hp,body:JSON.stringify(body)}); }
  else { await fetch(`${URL}/rest/v1/repertoire_proposals`,{method:'POST',headers:hp,body:JSON.stringify(body)}); }
  // insert events
  const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
  let ei=0; for(const c of chunk(events,50)){ const r=await fetch(`${URL}/rest/v1/events`,{method:'POST',headers:hp,body:JSON.stringify(c)}); if(r.ok)ei+=(await r.json()).length; else console.log('ev err',r.status,(await r.text()).slice(0,150)); }
  let ai=0; for(const c of chunk(eventArtists,100)){ const r=await fetch(`${URL}/rest/v1/event_artists`,{method:'POST',headers:hp,body:JSON.stringify(c)}); if(r.ok)ai+=(await r.json()).length; else console.log('ea err',r.status,(await r.text()).slice(0,150)); }
  console.log(`${ym} (${label}): proposal ${proposal.length} items, events ${ei}, event_artists ${ai}`);
}
console.log('DONE');
