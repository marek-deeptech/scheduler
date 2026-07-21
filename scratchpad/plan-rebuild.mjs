import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TD='22222222-2222-2222-2222-222222222222';
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const prods=await (await fetch(`${URL}/rest/v1/productions?org_id=eq.${TD}&select=id,title,stage,is_favourite,favourite_level&order=title`,{headers:hg})).json();
const aps=await (await fetch(`${URL}/rest/v1/artist_productions?org_id=eq.${TD}&select=artist_id,production_id&limit=100000`,{headers:hg})).json();
const castByProd={}; aps.forEach(a=>(castByProd[a.production_id]=castByProd[a.production_id]||[]).push(a.artist_id));
console.log('=== current productions by stage (title | castSize) ===');
for(const st of ['duza','mala','przodownik']){ console.log('['+st+']'); prods.filter(p=>p.stage===st).forEach(p=>console.log('   '+p.title+' | '+(castByProd[p.id]?.length||0))); }
const noStage=prods.filter(p=>!['duza','mala','przodownik'].includes(p.stage)); if(noStage.length) console.log('NO/other stage:',noStage.map(p=>p.title+':'+p.stage));
// proposal skeletons: room usage
const props=await (await fetch(`${URL}/rest/v1/repertoire_proposals?org_id=eq.${TD}&select=id,month,status,proposal_data`,{headers:hg})).json();
console.log('\n=== proposals ===');
for(const pr of props){ const it=Array.isArray(pr.proposal_data)?pr.proposal_data:[]; const rooms={}; it.forEach(i=>rooms[i.room_name]=(rooms[i.room_name]||0)+1); console.log(`${pr.month} ${pr.status} id=${pr.id} items=${it.length} rooms=`,rooms); }
// room_id <-> room_name <-> stage : derive from proposal items + productions
const oct=props.find(p=>p.month==='2026-10').proposal_data;
const roomMap={}; oct.forEach(i=>roomMap[i.room_name]=i.room_id);
console.log('room_name->room_id:',roomMap);
// confirmations by month
const conf=await (await fetch(`${URL}/rest/v1/event_confirmations?org_id=eq.${TD}&select=id,event_id,status&limit=100000`,{headers:hg})).json();
const evs=await (await fetch(`${URL}/rest/v1/events?org_id=eq.${TD}&select=id,start_time&limit=100000`,{headers:hg})).json();
const evM=Object.fromEntries(evs.map(e=>[e.id,e.start_time.slice(0,7)]));
const cm={}; conf.forEach(c=>{const m=evM[c.event_id]||'??'; (cm[m]=cm[m]||{}); cm[m][c.status]=(cm[m][c.status]||0)+1;});
console.log('confirmations by month/status:',JSON.stringify(cm));
console.log('events remaining total:',evs.length);
