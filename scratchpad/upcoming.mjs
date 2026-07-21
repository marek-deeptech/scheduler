import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TD='22222222-2222-2222-2222-222222222222';
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const evs=await (await fetch(`${URL}/rest/v1/events?org_id=eq.${TD}&select=title,start_time&order=start_time&limit=100000`,{headers:hg})).json();
const jul=evs.filter(e=>e.start_time>='2026-07-01'&&e.start_time<'2026-08-01');
console.log('July events:',jul.length);
console.log('July date range:',jul[0]?.start_time.slice(0,10),'..',jul.at(-1)?.start_time.slice(0,10));
const upc=evs.filter(e=>e.start_time>='2026-07-20T00:00:00'&&e.start_time<='2026-08-03T23:59');
console.log('Upcoming (Jul20-Aug3):',upc.length, upc.slice(0,10).map(e=>e.start_time.slice(0,10)+' '+e.title));
// distribution july by day
const days={}; jul.forEach(e=>{const d=e.start_time.slice(8,10);days[d]=(days[d]||0)+1;});
console.log('July by day:',Object.keys(days).sort().map(d=>d+':'+days[d]).join(' '));
