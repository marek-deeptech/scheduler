import fs from 'fs';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const URL=env.NEXT_PUBLIC_SUPABASE_URL,KEY=env.SUPABASE_SERVICE_ROLE_KEY,TD='22222222-2222-2222-2222-222222222222';
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const hp={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:'return=representation'};
const norm=s=>s.toLowerCase().replace(/\./g,'').replace(/\s+/g,' ').trim();

let artists=await (await fetch(`${URL}/rest/v1/artists?org_id=eq.${TD}&select=id,name,team_id&limit=1000`,{headers:hg})).json();
// most common team_id
const tc={}; artists.forEach(a=>{if(a.team_id)tc[a.team_id]=(tc[a.team_id]||0)+1;});
const teamId=Object.entries(tc).sort((a,b)=>b[1]-a[1])[0][0];
const existNorm=new Set(artists.map(a=>norm(a.name)));
const newArtists=[['Anna Stela','Aktorka'],['Zdzisław Wardejn','Aktor'],['Łukasz Lewandowski','Aktor'],['Mariusz Wojciechowski','Aktor']];
const toAdd=newArtists.filter(([n])=>!existNorm.has(norm(n))).map(([name,role],i)=>({
  id:`22222222-0000-0000-0004-0000000002${String(i+10).padStart(2,'0')}`,
  name, role, org_id:TD, team_id:teamId, status:'Dostępny', actor_type:'zewnętrzny',
  email:`marek+td${name.toLowerCase().replace(/[^a-z]/g,'').slice(0,10)}@veryniceworks.com`
}));
if(toAdd.length){ const r=await fetch(`${URL}/rest/v1/artists`,{method:'POST',headers:hp,body:JSON.stringify(toAdd)}); const j=await r.json(); console.log('add artists:',r.status, Array.isArray(j)?j.map(x=>x.name):JSON.stringify(j).slice(0,200)); }
else console.log('artists already present');
artists=await (await fetch(`${URL}/rest/v1/artists?org_id=eq.${TD}&select=id,name&limit=1000`,{headers:hg})).json();
const byNorm={}; artists.forEach(a=>byNorm[norm(a.name)]=a.id);
console.log('roster now:',artists.length);

const prods=await (await fetch(`${URL}/rest/v1/productions?org_id=eq.${TD}&select=id,title,stage&limit=1000`,{headers:hg})).json();
const prodByTitle={}; prods.forEach(p=>prodByTitle[p.title]=p);
const slugs=JSON.parse(fs.readFileSync('scratchpad/td-real/titles-slugs.json'));
const slugToTitle=Object.fromEntries(slugs.map(s=>[s.slug,s.title]));
const cast=JSON.parse(fs.readFileSync('scratchpad/td-real/titles-cast.json'));
const sceneMap={"Duża Scena":"duza","Mała scena":"mala","Scena Przodownik":"przodownik","Scena im. H. Mikołajskiej":"mikolajska"};
for(const [slug,d] of Object.entries(cast)){
  const p=prodByTitle[slugToTitle[slug]]; const realStage=sceneMap[d.scene];
  if(p&&realStage&&p.stage!==realStage){ await fetch(`${URL}/rest/v1/productions?id=eq.${p.id}`,{method:'PATCH',headers:hp,body:JSON.stringify({stage:realStage})}); console.log(`stage ${p.title}: ${p.stage}->${realStage}`); p.stage=realStage; }
}

const aps=await (await fetch(`${URL}/rest/v1/artist_productions?org_id=eq.${TD}&select=artist_id,production_id&limit=100000`,{headers:hg})).json();
const curCast={}; aps.forEach(a=>(curCast[a.production_id]=curCast[a.production_id]||new Set()).add(a.artist_id));
let addRows=[], remOps=[], stillMiss=new Set();
for(const [slug,d] of Object.entries(cast)){
  const p=prodByTitle[slugToTitle[slug]]; if(!p)continue;
  const realIds=new Set(); for(const nm of d.cast){ const id=byNorm[norm(nm)]; if(id)realIds.add(id); else stillMiss.add(nm); }
  const cur=curCast[p.id]||new Set();
  for(const id of realIds) if(!cur.has(id)) addRows.push({artist_id:id,production_id:p.id,org_id:TD});
  for(const id of cur) if(!realIds.has(id)) remOps.push({production_id:p.id,artist_id:id});
}
console.log('to add:',addRows.length,'to remove:',remOps.length,'still missing:',[...stillMiss]);
for(const r of remOps){ await fetch(`${URL}/rest/v1/artist_productions?production_id=eq.${r.production_id}&artist_id=eq.${r.artist_id}&org_id=eq.${TD}`,{method:'DELETE',headers:hp}); }
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
let added=0; for(const c of chunk(addRows,50)){ const r=await fetch(`${URL}/rest/v1/artist_productions`,{method:'POST',headers:hp,body:JSON.stringify(c)}); if(r.ok)added+=(await r.json()).length; else console.log('add err',r.status,(await r.text()).slice(0,150)); }
console.log('applied adds:',added,'removes:',remOps.length);
const aps2=await (await fetch(`${URL}/rest/v1/artist_productions?org_id=eq.${TD}&select=production_id&limit=100000`,{headers:hg})).json();
console.log('artist_productions total now:',aps2.length);
