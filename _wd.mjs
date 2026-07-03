import { createClient } from '@supabase/supabase-js'; import fs from 'fs'
const env=fs.readFileSync('.env.local','utf8'); const get=k=>(env.match(new RegExp('^'+k+'=(.+)$','m'))||[])[1]?.trim()
const sb=createClient(get('NEXT_PUBLIC_SUPABASE_URL'),get('SUPABASE_SERVICE_ROLE_KEY'))
const TD='22222222-2222-2222-2222-222222222222'
const {data:artists}=await sb.from('artists').select('id,name,birth_date').eq('org_id',TD)
// targets = brak pełnej daty (null lub YYYY-01-01)
const targets=artists.filter(a=>!a.birth_date || a.birth_date.endsWith('-01-01'))
const yearOf=a=>a.birth_date&&a.birth_date.endsWith('-01-01')?a.birth_date.slice(0,4):null
console.log('celów (bez pełnej daty):',targets.length)
const UA={'User-Agent':'theater-scheduler-demo/1.0 (marek@veryniceworks.com)'}
const ACTOR_OCC=new Set(['Q33999','Q10800557','Q2259451','Q2405480']) // actor, film actor, stage actor, voice actor
const pad=n=>String(Math.abs(n)).padStart(2,'0')
async function wd(name, tdYear){
  // 1) search entities
  const s=await (await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=pl&uselang=pl&format=json&limit=6&origin=*`,{headers:UA})).json()
  const cands=(s.search||[]).map(x=>({id:x.id,desc:(x.description||'')}))
  if(!cands.length) return null
  // fetch entities
  const ids=cands.map(c=>c.id).join('|')
  const e=await (await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=claims|descriptions&languages=pl|en&format=json&origin=*`,{headers:UA})).json()
  const results=[]
  for(const c of cands){
    const ent=e.entities?.[c.id]; if(!ent) continue
    const occ=(ent.claims?.P106||[]).map(x=>x.mainsnak?.datavalue?.value?.id)
    const isActor=occ.some(o=>ACTOR_OCC.has(o)) || /aktor/i.test(c.desc)
    const p569=ent.claims?.P569?.[0]?.mainsnak?.datavalue?.value
    if(!p569) continue
    if((p569.precision??11)<11) continue // trzeba dnia
    const m=p569.time.match(/^\+(\d{4})-(\d{2})-(\d{2})/); if(!m) continue
    const date=`${m[1]}-${m[2]}-${m[3]}`
    results.push({id:c.id,date,year:+m[1],isActor,desc:c.desc})
  }
  if(!results.length) return null
  // wybór: zgodność roku z TD > aktor > pierwszy
  let pick
  if(tdYear) pick=results.find(r=>String(r.year)===String(tdYear)&&r.isActor)||results.find(r=>String(r.year)===String(tdYear))
  if(!pick) pick=results.find(r=>r.isActor)
  if(!pick) return null
  const conf = tdYear ? (String(pick.year)===String(tdYear)?'HIGH(rok✓)':'LOW(rok≠'+tdYear+')') : (pick.isActor?'MED(aktor)':'LOW')
  return {...pick,conf}
}
const found=[]
for(const a of targets){
  const ty=yearOf(a)
  const r=await wd(a.name,ty)
  if(r) found.push({name:a.name,id:a.id,tdYear:ty,...r})
  await new Promise(res=>setTimeout(res,120))
}
// odrzuć LOW gdy mamy rok TD i się nie zgadza
const accepted=found.filter(f=>!f.conf.startsWith('LOW(rok'))
console.log(`\nWikidata dopasowania: ${found.length} | zaakceptowane: ${accepted.length}`)
for(const f of accepted) console.log(`  ${f.date}  ${f.name}  [${f.conf}] — ${f.desc}`)
const rej=found.filter(f=>f.conf.startsWith('LOW(rok'))
if(rej.length){console.log('\nODRZUCONE (rok≠TD, prawdop. inna osoba):'); for(const f of rej)console.log(`  ${f.date} ${f.name} [${f.conf}] — ${f.desc}`)}
fs.writeFileSync('.wd.json',JSON.stringify(accepted,null,0))
