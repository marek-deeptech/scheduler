import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TD='22222222-2222-2222-2222-222222222222';
const h={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:'return=representation'};
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const CURRENT = new Set(["UN-PACKING","WCZORAJ BYŁAŚ ZŁA NA ZIELONO","ZAKLINANIE WĘŻY W GORĄCE WIECZORY","SKOK WZWYŻ","SŁUGA DWÓCH PANÓW","SZCZĘŚLIWE DNI","THE WALL","NASZA KLASA","NASZE CZASY","NINA. WIECZNA KRÓLOWA","PODWÓJNY Z FRYTKAMI","MIŁOŚĆ OD OSTATNIEGO WEJRZENIA","MISTRZ I MAŁGORZATA","MÓJ ROK RELAKSU I ODPOCZYNKU","MUSZENIE","KINKY BOOTS","KRUK Z TOWER","LALKA","MADAME","FERDYDURKE","FOGG 2126","I ŻE CIĘ NIE OPUSZCZĘ","JUBILEUSZ","BĘDZIE TRZEBA, TO PÓJDĘ NA WOJNĘ","CHŁOPAKI PŁACZĄ","DZIWNY PRZYPADEK PSA NOCNĄ PORĄ","ERA WODNIKA","KRÓTKI SPEKTAKL O MATCE I CÓRCE","ANIOŁ ZAGŁADY","ANIOŁY W WARSZAWIE","ANTYGONA W MOLENBEEK"]);
// live fetch to be safe
const prods=await (await fetch(`${URL}/rest/v1/productions?org_id=eq.${TD}&select=id,title`,{headers:hg})).json();
const archProds=prods.filter(p=>!CURRENT.has(p.title));
const archIds=archProds.map(p=>p.id);
console.log('archival productions to delete:',archIds.length,'(catalog now',prods.length,')');
const evs=await (await fetch(`${URL}/rest/v1/events?org_id=eq.${TD}&select=id,production_id`,{headers:hg})).json();
const archEvIds=evs.filter(e=>archIds.includes(e.production_id)).map(e=>e.id);
console.log('archival events:',archEvIds.length);
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
async function del(table,col,ids){ if(!ids.length)return 0; let total=0; for(const c of chunk(ids,40)){ const q=`${col}=in.(${c.map(x=>`"${x}"`).join(',')})&org_id=eq.${TD}`; const r=await fetch(`${URL}/rest/v1/${table}?${q}`,{method:'DELETE',headers:h}); if(!r.ok){console.log('ERR',table,r.status,(await r.text()).slice(0,150));throw new Error('stop');} const d=await r.json(); total+=d.length; } return total; }
console.log('del event_confirmations:', await del('event_confirmations','event_id',archEvIds));
console.log('del event_artists:', await del('event_artists','event_id',archEvIds));
console.log('del events:', await del('events','id',archEvIds));
console.log('del artist_productions:', await del('artist_productions','production_id',archIds));
console.log('del actor_production_substitutes:', await del('actor_production_substitutes','production_id',archIds));
console.log('del repertoire_slots:', await del('repertoire_slots','production_id',archIds));
console.log('del productions:', await del('productions','id',archIds));
// verify
const after=await (await fetch(`${URL}/rest/v1/productions?org_id=eq.${TD}&select=id`,{headers:hg})).json();
console.log('CATALOG NOW:',after.length);
