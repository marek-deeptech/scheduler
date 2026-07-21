import fs from 'fs';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const URL=env.NEXT_PUBLIC_SUPABASE_URL,KEY=env.SUPABASE_SERVICE_ROLE_KEY,TD='22222222-2222-2222-2222-222222222222';
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const norm=s=>s.toLowerCase().replace(/\./g,'').replace(/\s+/g,' ').trim();
const artists=await (await fetch(`${URL}/rest/v1/artists?org_id=eq.${TD}&select=id,name,role&limit=1000`,{headers:hg})).json();
const byNorm={}; artists.forEach(a=>byNorm[norm(a.name)]=a);
const prods=await (await fetch(`${URL}/rest/v1/productions?org_id=eq.${TD}&select=id,title,stage&limit=1000`,{headers:hg})).json();
const prodByTitle={}; prods.forEach(p=>prodByTitle[p.title]=p);
const aps=await (await fetch(`${URL}/rest/v1/artist_productions?org_id=eq.${TD}&select=artist_id,production_id&limit=100000`,{headers:hg})).json();
const curCast={}; aps.forEach(a=>(curCast[a.production_id]=curCast[a.production_id]||new Set()).add(a.artist_id));
const cast=JSON.parse(fs.readFileSync('scratchpad/td-real/titles-cast.json'));
const slugs=JSON.parse(fs.readFileSync('scratchpad/td-real/titles-slugs.json'));
const slugToTitle=Object.fromEntries(slugs.map(s=>[s.slug,s.title]));
console.log('App artists:',artists.length);
const unmatched=new Set(); let totalAdd=0,totalRem=0;
const sceneMap={"Duża Scena":"duza","Mała scena":"mala","Scena Przodownik":"przodownik","Scena im. H. Mikołajskiej":"mikolajska"};
console.log('\n=== per title: real cast size | matched | to-add | to-remove | stage(app→real) ===');
for(const [slug,d] of Object.entries(cast)){
  const title=slugToTitle[slug]; const prod=prodByTitle[title];
  if(!prod){console.log(`!! no prod for ${title}`);continue;}
  const realIds=new Set(); const miss=[];
  for(const nm of d.cast){ const a=byNorm[norm(nm)]; if(a)realIds.add(a.id); else {miss.push(nm);unmatched.add(nm);} }
  const cur=curCast[prod.id]||new Set();
  const toAdd=[...realIds].filter(id=>!cur.has(id));
  const toRem=[...cur].filter(id=>!realIds.has(id));
  totalAdd+=toAdd.length; totalRem+=toRem.length;
  const realStage=sceneMap[d.scene]||('?'+d.scene);
  const stageFlag=prod.stage!==realStage?` STAGE ${prod.stage}→${realStage}`:'';
  console.log(`${title}: real ${d.cast.length} | matched ${realIds.size} | +${toAdd.length} -${toRem.length}${stageFlag}${miss.length?' | MISS: '+miss.join(', '):''}`);
}
console.log('\nTOTAL artist_productions to add:',totalAdd,'to remove:',totalRem);
console.log('UNMATCHED names ('+unmatched.size+'):',[...unmatched].join(' | '));
