import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TD='22222222-2222-2222-2222-222222222222', TH='22222222-0000-0000-0000-000000000010';
const h={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:'return=representation'};
const artists=await (await fetch(`${URL}/rest/v1/artists?org_id=eq.${TD}&select=id,name,role&order=name`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}})).json();
console.log('TD artists:',artists.length);
const pick=(names)=>names.map(n=>artists.find(a=>a.name.toUpperCase().includes(n.toUpperCase()))).filter(Boolean);
// choose plausible casts from roster (fallback: first N)
const some=(n,off=0)=>artists.slice(off,off+n);
const base=(title,stage,favLevel)=>({
  title, theatre_id:TH, org_id:TD, stage, status:'Bieżące',
  director:'—', location_type:'Na miejscu', is_favourite:false,
  price_category:'standard', price_normal:70, price_reduced:60, price_last_minute:30,
  assumed_attendance:0.75, fixed_cost:16000, favourite_level:0, hit_level:0,
  setup_days:0, teardown_days:0,
});
const nina={id:'22222222-0000-0000-0005-000000000201', ...base('NINA. WIECZNA KRÓLOWA','przodownik')};
const fogg={id:'22222222-0000-0000-0005-000000000202', ...base('FOGG 2126','duza')};
const ins=await fetch(`${URL}/rest/v1/productions`,{method:'POST',headers:h,body:JSON.stringify([nina,fogg])});
console.log('insert productions:',ins.status, (await ins.text()).slice(0,200));
// casts: NINA small (4), FOGG medium (7)
const ninaCast=some(4,0).map(a=>({artist_id:a.id,production_id:nina.id,org_id:TD}));
const foggCast=some(7,10).map(a=>({artist_id:a.id,production_id:fogg.id,org_id:TD}));
const ac=await fetch(`${URL}/rest/v1/artist_productions`,{method:'POST',headers:h,body:JSON.stringify([...ninaCast,...foggCast])});
console.log('insert cast:',ac.status,(await ac.text()).slice(0,120));
console.log('NINA cast:',ninaCast.length,'FOGG cast:',foggCast.length);
