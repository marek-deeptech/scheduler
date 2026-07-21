import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TD='22222222-2222-2222-2222-222222222222';
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const hp={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:'return=representation'};
// distinct types in existing events
const evs=await (await fetch(`${URL}/rest/v1/events?org_id=eq.${TD}&select=type&limit=100000`,{headers:hg})).json();
const t={}; evs.forEach(e=>t[e.type]=(t[e.type]||0)+1); console.log('event types:',t);
// fix my lowercase 'spektakl' -> 'Spektakl'
const r=await fetch(`${URL}/rest/v1/events?org_id=eq.${TD}&type=eq.spektakl`,{method:'PATCH',headers:hp,body:JSON.stringify({type:'Spektakl'})});
console.log('fixed lowercase->Spektakl:',(await r.json()).length);
// verify upcoming shows now
const up=await (await fetch(`${URL}/rest/v1/events?org_id=eq.${TD}&select=start_time,type&type=eq.Spektakl&start_time=gte.2026-07-20T00:00:00&start_time=lte.2026-08-03T23:59&limit=1000`,{headers:hg})).json();
console.log('Upcoming Spektakl (Jul20-Aug3):',up.length);
