import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TD='22222222-2222-2222-2222-222222222222';
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const hp={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:'return=representation'};

const prods=await (await fetch(`${URL}/rest/v1/productions?org_id=eq.${TD}&select=id,title,stage,favourite_level`,{headers:hg})).json();
const aps=await (await fetch(`${URL}/rest/v1/artist_productions?org_id=eq.${TD}&select=artist_id,production_id&limit=100000`,{headers:hg})).json();
const castByProd={}; aps.forEach(a=>(castByProd[a.production_id]=castByProd[a.production_id]||[]).push(a.artist_id));
const castByTitle=new Map(); prods.forEach(p=>castByTitle.set(p.title,new Set(castByProd[p.id]||[])));
const byStage={duza:[],mala:[],przodownik:[]};
prods.forEach(p=>byStage[p.stage]&&byStage[p.stage].push(p));
for(const s in byStage) byStage[s].sort((a,b)=>(b.favourite_level||0)-(a.favourite_level||0)||a.title.localeCompare(b.title));
const stageRoom={duza:{id:'22222222-0000-0000-0003-000000000011',name:'Duża Scena'},mala:{id:'22222222-0000-0000-0003-000000000013',name:'Mała Scena'},przodownik:{id:'22222222-0000-0000-0003-000000000014',name:'Scena Przodownik'}};
const stageOfRoom={'Duża Scena':'duza','Mała Scena':'mala','Scena Przodownik':'przodownik'};
const hm=t=>t.slice(0,5), overlap=(s1,e1,s2,e2)=>s1<e2&&s2<e1;

function rebuild(items){
  const kept=items.filter(i=>i.room_name!=='Scena na Woli');
  kept.sort((a,b)=>a.date.localeCompare(b.date)||a.start_time.localeCompare(b.start_time));
  const dayBusy={}, ptr={duza:0,mala:0,przodownik:0}, usedTitleDay={};
  const out=[]; let dropped=0;
  for(const it of kept){
    const stage=stageOfRoom[it.room_name]; if(!stage)continue;
    const list=byStage[stage]; const s=hm(it.start_time),e=hm(it.end_time);
    dayBusy[it.date]=dayBusy[it.date]||[]; usedTitleDay[it.date]=usedTitleDay[it.date]||new Set();
    let chosen=null;
    for(let k=0;k<list.length;k++){ const cand=list[(ptr[stage]+k)%list.length];
      if(usedTitleDay[it.date].has(cand.id))continue;
      const cast=castByTitle.get(cand.title); let clash=false;
      for(const b of dayBusy[it.date]){ if(!overlap(s,e,b.start,b.end))continue;
        if(b.room===stageRoom[stage].name){clash=true;break;}
        for(const a of cast){ if(b.artists.has(a)){clash=true;break;} } if(clash)break; }
      if(!clash){chosen=cand; ptr[stage]=(ptr[stage]+k+1)%list.length; break;} }
    if(!chosen){dropped++;continue;} // drop slot rather than force a clash
    usedTitleDay[it.date].add(chosen.id);
    dayBusy[it.date].push({start:s,end:e,room:stageRoom[stage].name,artists:castByTitle.get(chosen.title)});
    out.push({date:it.date,type:it.type||'spektakl',room_id:stageRoom[stage].id,room_name:stageRoom[stage].name,start_time:it.start_time,end_time:it.end_time,production_id:chosen.id,production_title:chosen.title});
  }
  return {out,dropped};
}
function countConflicts(items){ let n=0,pairs=[];
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j];
    if(a.date!==b.date||a.production_title===b.production_title)continue;
    if(a.start_time>=b.end_time||b.start_time>=a.end_time)continue;
    let sh=false; for(const x of castByTitle.get(a.production_title)||[]) if((castByTitle.get(b.production_title)||new Set()).has(x)){sh=true;break;}
    if(sh){n++;pairs.push(`${a.date} ${a.production_title}|${b.production_title}`);} }
  return {n,pairs};
}

const props=await (await fetch(`${URL}/rest/v1/repertoire_proposals?org_id=eq.${TD}&month=in.(2026-10,2026-11)&select=month,proposal_data`,{headers:hg})).json();
const origById=Object.fromEntries(props.map(p=>[p.month,p.proposal_data]));
// NOTE: proposals were already overwritten in prev step; reload ORIGINAL skeleton from backup for clean rebuild
const bkOct=JSON.parse(fs.readFileSync('scratchpad/backup-td/repertoire_proposals.json')).find(p=>p.month==='2026-10').proposal_data;
const bkNov=JSON.parse(fs.readFileSync('scratchpad/backup-td/repertoire_proposals.json')).find(p=>p.month==='2026-11').proposal_data;

const rOct=rebuild(bkOct); console.log('OCT rebuilt',rOct.out.length,'dropped',rOct.dropped,'conflicts',countConflicts(rOct.out).n);
let {out:nov}=rebuild(bkNov); console.log('NOV rebuilt',nov.length,'conflicts(base)',countConflicts(nov).n);

// inject exactly 5 into NOV, each adding exactly 1 conflict
const novDates=[...new Set(nov.map(i=>i.date))].sort();
let injected=0;
for(const d of novDates){ if(injected>=5)break;
  const day=nov.filter(i=>i.date===d);
  const anchor=day.find(i=>i.start_time>='18:00:00'&&i.start_time<='19:30:00'); if(!anchor)continue;
  const aCast=castByTitle.get(anchor.production_title);
  const titlesToday=new Set(day.map(i=>i.production_title));
  let done=false;
  for(const p of prods){ if(done)break; if(titlesToday.has(p.title)||p.title===anchor.production_title)continue;
    if(stageRoom[p.stage].name===anchor.room_name)continue;
    if(![...castByTitle.get(p.title)].some(x=>aCast.has(x)))continue;
    const inj={date:d,type:'spektakl',room_id:stageRoom[p.stage].id,room_name:stageRoom[p.stage].name,start_time:anchor.start_time,end_time:anchor.end_time,production_id:p.id,production_title:p.title};
    const before=countConflicts(nov).n; const after=countConflicts([...nov,inj]).n;
    if(after-before===1){ nov.push(inj); injected++; done=true; console.log(`  +conflict ${injected}: ${d} ${anchor.production_title} x ${p.title}`); } }
}
nov.sort((a,b)=>a.date.localeCompare(b.date)||a.start_time.localeCompare(b.start_time));
const cf=countConflicts(nov); console.log('NOV final items',nov.length,'conflicts',cf.n);
console.log('  pairs:',cf.pairs.join(' ; '));

// verify current-only
const CUR=new Set(prods.map(p=>p.title));
console.log('archival-left OCT',rOct.out.filter(i=>!CUR.has(i.production_title)).length,'NOV',nov.filter(i=>!CUR.has(i.production_title)).length);

// WRITE
async function setProp(month,data){ const r=await fetch(`${URL}/rest/v1/repertoire_proposals?org_id=eq.${TD}&month=eq.${month}`,{method:'PATCH',headers:hp,body:JSON.stringify({proposal_data:data})}); console.log(`PATCH ${month}:`,r.status,(await r.json()).length); }
await setProp('2026-10',rOct.out);
await setProp('2026-11',nov);
console.log('DONE');
