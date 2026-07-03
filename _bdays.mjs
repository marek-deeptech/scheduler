import { createClient } from '@supabase/supabase-js'; import fs from 'fs'
const env=fs.readFileSync('.env.local','utf8'); const get=k=>(env.match(new RegExp('^'+k+'=(.+)$','m'))||[])[1]?.trim()
const sb=createClient(get('NEXT_PUBLIC_SUPABASE_URL'),get('SUPABASE_SERVICE_ROLE_KEY'))
const TD='22222222-2222-2222-2222-222222222222'
const {data:artists}=await sb.from('artists').select('id,name,birth_date').eq('org_id',TD)
const MONTHS={stycznia:1,lutego:2,marca:3,kwietnia:4,maja:5,czerwca:6,lipca:7,sierpnia:8,września:9,wrzesnia:9,października:10,pazdziernika:10,listopada:11,grudnia:12}
const pad=n=>String(n).padStart(2,'0')
async function wiki(name){
  const url=`https://pl.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&redirects=1&format=json&titles=${encodeURIComponent(name)}`
  try{
    const r=await fetch(url,{headers:{'User-Agent':'theater-scheduler-demo/1.0 (marek@veryniceworks.com)'}}); const j=await r.json()
    const pages=j.query?.pages||{}; const pg=Object.values(pages)[0]
    if(!pg||pg.missing!==undefined) return null
    const ex=pg.extract||''
    if(!/aktor|aktorka/i.test(ex.slice(0,400))) return {skip:'not-actor',ex:ex.slice(0,80)}
    const m=ex.match(/ur\.\s*(\d{1,2})\s+([a-ząćęłńóśżź]+)\s+(\d{4})/i)
    if(!m) return {skip:'no-date',ex:ex.slice(0,80)}
    const mm=MONTHS[m[2].toLowerCase()]; if(!mm) return {skip:'bad-month:'+m[2]}
    return {date:`${m[3]}-${pad(mm)}-${pad(+m[1])}`}
  }catch(e){return {skip:'err:'+e.message}}
}
const out=[]
for(const a of artists){
  const res=await wiki(a.name)
  out.push({name:a.name,id:a.id,curYear:a.birth_date?a.birth_date.slice(0,4):null,...res})
  await new Promise(r=>setTimeout(r,150))
}
const found=out.filter(o=>o.date)
console.log(`Znaleziono pełne daty: ${found.length}/${artists.length}`)
for(const o of found) console.log(`  ${o.date}  ${o.name}${o.curYear&&!o.date.startsWith(o.curYear)?'  ⚠ rok TD='+o.curYear:''}`)
console.log('\nBez daty:',out.filter(o=>!o.date).map(o=>o.name).join(', '))
fs.writeFileSync('.bdays.json',JSON.stringify(found,null,0))
