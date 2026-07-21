import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TD = '22222222-2222-2222-2222-222222222222';
const h = {apikey:KEY, Authorization:`Bearer ${KEY}`};

const CURRENT = new Set(["UN-PACKING","WCZORAJ BYŁAŚ ZŁA NA ZIELONO","ZAKLINANIE WĘŻY W GORĄCE WIECZORY","SKOK WZWYŻ","SŁUGA DWÓCH PANÓW","SZCZĘŚLIWE DNI","THE WALL","NASZA KLASA","NASZE CZASY","NINA. WIECZNA KRÓLOWA","PODWÓJNY Z FRYTKAMI","MIŁOŚĆ OD OSTATNIEGO WEJRZENIA","MISTRZ I MAŁGORZATA","MÓJ ROK RELAKSU I ODPOCZYNKU","MUSZENIE","KINKY BOOTS","KRUK Z TOWER","LALKA","MADAME","FERDYDURKE","FOGG 2126","I ŻE CIĘ NIE OPUSZCZĘ","JUBILEUSZ","BĘDZIE TRZEBA, TO PÓJDĘ NA WOJNĘ","CHŁOPAKI PŁACZĄ","DZIWNY PRZYPADEK PSA NOCNĄ PORĄ","ERA WODNIKA","KRÓTKI SPEKTAKL O MATCE I CÓRCE","ANIOŁ ZAGŁADY","ANIOŁY W WARSZAWIE","ANTYGONA W MOLENBEEK"]);

const prods = await (await fetch(`${URL}/rest/v1/productions?org_id=eq.${TD}&select=id,title`, {headers:h})).json();
const byId = Object.fromEntries(prods.map(p=>[p.id,p.title]));
const evs = await (await fetch(`${URL}/rest/v1/events?org_id=eq.${TD}&select=production_id,start_time`, {headers:h})).json();
const range = {};
for (const e of evs){ if(!e.production_id) continue; const d=e.start_time.slice(0,10); const r=range[e.production_id]||(range[e.production_id]={min:d,max:d,n:0}); if(d<r.min)r.min=d; if(d>r.max)r.max=d; r.n++; }

// Archival WITH events (future-facing risk)
console.log('=== ARCHIVAL productions that HAVE events ===');
for (const p of prods){ if(CURRENT.has(p.title)) continue; const r=range[p.id]; if(r) console.log(`${r.n} ev | ${r.min}..${r.max} | ${p.title}`); }

// Proposals
console.log('\n=== repertoire_proposals ===');
const props = await (await fetch(`${URL}/rest/v1/repertoire_proposals?org_id=eq.${TD}&select=id,month,status,theatre_id,proposal_data,stats`, {headers:h})).json();
for (const pr of props){
  const pd = pr.proposal_data;
  let titles = new Set();
  const walk = (o)=>{ if(!o) return; if(Array.isArray(o)) o.forEach(walk); else if(typeof o==='object'){ for(const[k,v] of Object.entries(o)){ if(k==='title'&&typeof v==='string') titles.add(v); else walk(v);} } };
  walk(pd);
  const arch=[...titles].filter(t=>!CURRENT.has(t));
  console.log(`prop ${pr.month} status=${pr.status} titles=${titles.size} archivalTitles=${arch.length}`);
  if(arch.length) console.log('   archival in proposal:', arch.join(' | '));
}
