import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TD = '22222222-2222-2222-2222-222222222222';
const h = {apikey:KEY, Authorization:`Bearer ${KEY}`};
const CURRENT = new Set(["UN-PACKING","WCZORAJ BYŁAŚ ZŁA NA ZIELONO","ZAKLINANIE WĘŻY W GORĄCE WIECZORY","SKOK WZWYŻ","SŁUGA DWÓCH PANÓW","SZCZĘŚLIWE DNI","THE WALL","NASZA KLASA","NASZE CZASY","NINA. WIECZNA KRÓLOWA","PODWÓJNY Z FRYTKAMI","MIŁOŚĆ OD OSTATNIEGO WEJRZENIA","MISTRZ I MAŁGORZATA","MÓJ ROK RELAKSU I ODPOCZYNKU","MUSZENIE","KINKY BOOTS","KRUK Z TOWER","LALKA","MADAME","FERDYDURKE","FOGG 2126","I ŻE CIĘ NIE OPUSZCZĘ","JUBILEUSZ","BĘDZIE TRZEBA, TO PÓJDĘ NA WOJNĘ","CHŁOPAKI PŁACZĄ","DZIWNY PRZYPADEK PSA NOCNĄ PORĄ","ERA WODNIKA","KRÓTKI SPEKTAKL O MATCE I CÓRCE","ANIOŁ ZAGŁADY","ANIOŁY W WARSZAWIE","ANTYGONA W MOLENBEEK"]);
const prods = await (await fetch(`${URL}/rest/v1/productions?org_id=eq.${TD}&select=id,title`, {headers:h})).json();
const present = new Set(prods.map(p=>p.title));
console.log('Prod catalog: total', prods.length, '| current-present', prods.filter(p=>CURRENT.has(p.title)).length, '| archival', prods.filter(p=>!CURRENT.has(p.title)).length);
console.log('Current titles MISSING from catalog:', [...CURRENT].filter(t=>!present.has(t)));
// duplicates
const seen={}; prods.forEach(p=>seen[p.title]=(seen[p.title]||0)+1);
console.log('Duplicate titles:', Object.entries(seen).filter(([,n])=>n>1));

const props = await (await fetch(`${URL}/rest/v1/repertoire_proposals?org_id=eq.${TD}&select=month,status,proposal_data`, {headers:h})).json();
for(const pr of props){ const items=Array.isArray(pr.proposal_data)?pr.proposal_data:[]; const arch=items.filter(i=>!CURRENT.has(i.production_title)); const at=new Set(arch.map(i=>i.production_title)); console.log(`prop ${pr.month} ${pr.status}: ${items.length} items, ${arch.length} archival items (${at.size} archival titles)`); }
const evs = await (await fetch(`${URL}/rest/v1/events?org_id=eq.${TD}&select=production_id,start_time`, {headers:h})).json();
const byId=Object.fromEntries(prods.map(p=>[p.id,p.title]));
const archEv=evs.filter(e=>e.production_id&&!CURRENT.has(byId[e.production_id]));
console.log('Events: total', evs.length, '| on archival titles', archEv.length);
