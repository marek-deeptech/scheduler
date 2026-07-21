import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TD='22222222-2222-2222-2222-222222222222';
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const hp={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:'return=representation'};
const TODAY='2026-07-20T00:00:00';
const conf=await (await fetch(`${URL}/rest/v1/event_confirmations?org_id=eq.${TD}&select=id,artist_id,status,event_id&limit=100000`,{headers:hg})).json();
const evs=await (await fetch(`${URL}/rest/v1/events?org_id=eq.${TD}&select=id,start_time&limit=100000`,{headers:hg})).json();
const evM=Object.fromEntries(evs.map(e=>[e.id,e.start_time]));
const pendArtists=new Set(conf.filter(c=>c.status==='pending').map(c=>c.artist_id));
// candidates: confirmed, upcoming, artist not already pending
const cand=conf.filter(c=>c.status==='confirmed'&&evM[c.event_id]>=TODAY&&!pendArtists.has(c.artist_id));
// choose 3 distinct new artists
const chosen=[]; const seen=new Set();
for(const c of cand){ if(seen.has(c.artist_id))continue; seen.add(c.artist_id); chosen.push(c); if(chosen.length>=3)break; }
console.log('flipping',chosen.length,'confirmed->pending (new artists)');
for(const c of chosen){ const r=await fetch(`${URL}/rest/v1/event_confirmations?id=eq.${c.id}`,{method:'PATCH',headers:hp,body:JSON.stringify({status:'pending',responded_at:null})}); if(!r.ok)console.log('ERR',r.status,await r.text()); }
// recount
const conf2=await (await fetch(`${URL}/rest/v1/event_confirmations?org_id=eq.${TD}&select=artist_id,status,event_id&limit=100000`,{headers:hg})).json();
const udzial=new Set(conf2.filter(c=>c.status==='pending'&&evM[c.event_id]>=TODAY).map(c=>c.artist_id));
const am=await (await fetch(`${URL}/rest/v1/actor_messages?org_id=eq.${TD}&direction=eq.to_actor&kind=eq.confirmation_request&read_at=is.null&select=artist_id`,{headers:hg})).json();
const wiad=new Set(am.map(m=>m.artist_id));
console.log('udzial unique',udzial.size,'| wiadomosci unique',wiad.size,'| TOTAL union',new Set([...udzial,...wiad]).size);
