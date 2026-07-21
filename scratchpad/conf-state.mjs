import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TD='22222222-2222-2222-2222-222222222222';
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const TODAY='2026-07-20T00:00:00';
const conf=await (await fetch(`${URL}/rest/v1/event_confirmations?org_id=eq.${TD}&select=id,artist_id,status,event_id&limit=100000`,{headers:hg})).json();
const evs=await (await fetch(`${URL}/rest/v1/events?org_id=eq.${TD}&select=id,start_time&title&limit=100000`,{headers:hg})).json();
const evM=Object.fromEntries(evs.map(e=>[e.id,e.start_time]));
const statuses={}; conf.forEach(c=>statuses[c.status]=(statuses[c.status]||0)+1);
console.log('confirmations total',conf.length,'statuses',statuses);
const pend=conf.filter(c=>c.status==='pending');
const pendUpcoming=pend.filter(c=>evM[c.event_id]&&evM[c.event_id]>=TODAY);
console.log('pending total',pend.length,'| pending upcoming',pendUpcoming.length,'| unique artists(udzial)',new Set(pendUpcoming.map(c=>c.artist_id)).size);
// other two sources
const si=await (await fetch(`${URL}/rest/v1/slot_invites?org_id=eq.${TD}&submitted_at=is.null&select=artist_id`,{headers:hg})).json();
console.log('slot_invites null (dostepnosc) unique',Array.isArray(si)?new Set(si.map(s=>s.artist_id)).size:si);
const am=await (await fetch(`${URL}/rest/v1/actor_messages?org_id=eq.${TD}&direction=eq.to_actor&kind=eq.confirmation_request&read_at=is.null&select=artist_id`,{headers:hg})).json();
console.log('unread confirmation_request (wiadomosci) unique',Array.isArray(am)?new Set(am.map(m=>m.artist_id)).size:am);
// events by month remaining
const bm={}; evs.forEach(e=>{const m=e.start_time.slice(0,7);bm[m]=(bm[m]||0)+1;}); console.log('events by month',bm);
