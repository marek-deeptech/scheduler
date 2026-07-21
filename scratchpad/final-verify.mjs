import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TD='22222222-2222-2222-2222-222222222222';
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const CURRENT=["UN-PACKING","WCZORAJ BYŁAŚ ZŁA NA ZIELONO","ZAKLINANIE WĘŻY W GORĄCE WIECZORY","SKOK WZWYŻ","SŁUGA DWÓCH PANÓW","SZCZĘŚLIWE DNI","THE WALL","NASZA KLASA","NASZE CZASY","NINA. WIECZNA KRÓLOWA","PODWÓJNY Z FRYTKAMI","MIŁOŚĆ OD OSTATNIEGO WEJRZENIA","MISTRZ I MAŁGORZATA","MÓJ ROK RELAKSU I ODPOCZYNKU","MUSZENIE","KINKY BOOTS","KRUK Z TOWER","LALKA","MADAME","FERDYDURKE","FOGG 2126","I ŻE CIĘ NIE OPUSZCZĘ","JUBILEUSZ","BĘDZIE TRZEBA, TO PÓJDĘ NA WOJNĘ","CHŁOPAKI PŁACZĄ","DZIWNY PRZYPADEK PSA NOCNĄ PORĄ","ERA WODNIKA","KRÓTKI SPEKTAKL O MATCE I CÓRCE","ANIOŁ ZAGŁADY","ANIOŁY W WARSZAWIE","ANTYGONA W MOLENBEEK"];
const C=new Set(CURRENT);
const prods=await (await fetch(`${URL}/rest/v1/productions?org_id=eq.${TD}&select=title&order=title`,{headers:hg})).json();
const titles=prods.map(p=>p.title);
const extra=titles.filter(t=>!C.has(t)); const missing=CURRENT.filter(t=>!titles.includes(t));
const dup=titles.filter((t,i)=>titles.indexOf(t)!==i);
console.log('CATALOG:',prods.length,'| archival-extra:',extra.length,extra,'| missing:',missing,'| duplicates:',dup);
// events referencing archival
const evs=await (await fetch(`${URL}/rest/v1/events?org_id=eq.${TD}&select=title,production_id&limit=100000`,{headers:hg})).json();
const pAll=await (await fetch(`${URL}/rest/v1/productions?org_id=eq.${TD}&select=id,title&limit=100000`,{headers:hg})).json();
const idT=Object.fromEntries(pAll.map(p=>[p.id,p.title]));
const archEv=evs.filter(e=>e.production_id&&!C.has(idT[e.production_id]));
console.log('EVENTS total',evs.length,'| on archival titles',archEv.length);
// proposals archival check
const props=await (await fetch(`${URL}/rest/v1/repertoire_proposals?org_id=eq.${TD}&select=month,status,proposal_data`,{headers:hg})).json();
for(const pr of props){ const it=pr.proposal_data||[]; const a=it.filter(i=>!C.has(i.production_title)); console.log(`PROP ${pr.month} ${pr.status}: ${it.length} items, archival ${a.length}`, a.length?a.map(x=>x.production_title):''); }
// substitutes/artist_productions archival
const aps=await (await fetch(`${URL}/rest/v1/artist_productions?org_id=eq.${TD}&select=production_id&limit=100000`,{headers:hg})).json();
console.log('artist_productions on archival prods:',aps.filter(a=>!C.has(idT[a.production_id])).length);
const subs=await (await fetch(`${URL}/rest/v1/actor_production_substitutes?org_id=eq.${TD}&select=production_id&limit=100000`,{headers:hg})).json();
console.log('substitutes on archival prods:',subs.filter(s=>!C.has(idT[s.production_id])).length,'| total subs',subs.length);
