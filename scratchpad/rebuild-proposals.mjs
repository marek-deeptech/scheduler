import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TD='22222222-2222-2222-2222-222222222222';
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const hp={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:'return=representation'};

const prods=await (await fetch(`${URL}/rest/v1/productions?org_id=eq.${TD}&select=id,title,stage,is_favourite,favourite_level`,{headers:hg})).json();
const aps=await (await fetch(`${URL}/rest/v1/artist_productions?org_id=eq.${TD}&select=artist_id,production_id&limit=100000`,{headers:hg})).json();
const castByProd={}; aps.forEach(a=>(castByProd[a.production_id]=castByProd[a.production_id]||new Set()).add(a.artist_id));
const byStage={duza:[],mala:[],przodownik:[]};
prods.forEach(p=>{ if(byStage[p.stage]) byStage[p.stage].push(p); });
// order each stage: favourites first (more frequent), then rest; we rotate
for(const s in byStage) byStage[s].sort((a,b)=>(b.favourite_level||0)-(a.favourite_level||0)||a.title.localeCompare(b.title));
const ROOM={duza:{id:'22222222-0000-0000-0003-000000000011',name:'Duża Scena'},mala:{id:'22222222-0000-0000-0003-000000000013',name:'Mała Scena'},przodownik:{id:'22222222-0000-0000-0003-000000000014',name:'Scena Przodownik'}};
const stageOfRoom={'Duża Scena':'duza','Mała Scena':'mala','Scena Przodownik':'przodownik'};
const hm=t=>t.slice(0,5);
const overlap=(s1,e1,s2,e2)=>s1<e2&&s2<e1;

function rebuild(items){
  // drop Scena na Woli
  const kept=items.filter(i=>i.room_name!=='Scena na Woli').map(i=>({...i}));
  // per-day busy: [{start,end,artists:Set, stage}]
  const dayBusy={}; const ptr={duza:0,mala:0,przodownik:0}; const usedTitleDay={};
  const out=[];
  // process in date/time order for stable conflict logic
  kept.sort((a,b)=>a.date.localeCompare(b.date)||a.start_time.localeCompare(b.start_time));
  for(const it of kept){
    const stage=stageOfRoom[it.room_name]; if(!stage){continue;}
    const list=byStage[stage]; const s=hm(it.start_time),e=hm(it.end_time);
    dayBusy[it.date]=dayBusy[it.date]||[];
    usedTitleDay[it.date]=usedTitleDay[it.date]||new Set();
    // find a title of this stage: not used same day, no room-time clash, no cast-time clash
    let chosen=null;
    for(let k=0;k<list.length;k++){
      const cand=list[(ptr[stage]+k)%list.length];
      if(usedTitleDay[it.date].has(cand.id)) continue;
      const cast=castByProd[cand.id]||new Set();
      let clash=false;
      for(const b of dayBusy[it.date]){
        if(!overlap(s,e,b.start,b.end)) continue;
        if(b.room===ROOM[stage].name){clash=true;break;} // same room same time
        for(const a of cast){ if(b.artists.has(a)){clash=true;break;} }
        if(clash)break;
      }
      if(!clash){chosen=cand; ptr[stage]=(ptr[stage]+k+1)%list.length; break;}
    }
    if(!chosen){ // relax: allow (last resort) first not-used-today, ignore cast
      chosen=list.find(c=>!usedTitleDay[it.date].has(c.id))||list[0];
      ptr[stage]=(ptr[stage]+1)%list.length;
    }
    usedTitleDay[it.date].add(chosen.id);
    dayBusy[it.date].push({start:s,end:e,room:ROOM[stage].name,artists:castByProd[chosen.id]||new Set()});
    out.push({date:it.date,type:it.type||'spektakl',room_id:ROOM[stage].id,room_name:ROOM[stage].name,start_time:it.start_time,end_time:it.end_time,production_id:chosen.id,production_title:chosen.title});
  }
  return out;
}

const props=await (await fetch(`${URL}/rest/v1/repertoire_proposals?org_id=eq.${TD}&month=in.(2026-10,2026-11)&select=id,month,status,proposal_data`,{headers:hg})).json();
const CURRENT=new Set(prods.map(p=>p.title));
for(const pr of props){
  const nu=rebuild(pr.proposal_data);
  const arch=nu.filter(i=>!CURRENT.has(i.production_title));
  fs.writeFileSync(`scratchpad/rebuilt-${pr.month}.json`,JSON.stringify(nu,null,0));
  console.log(`${pr.month} ${pr.status}: rebuilt ${nu.length} items (was ${pr.proposal_data.length}), archival-left=${arch.length}`);
  // stage histogram
  const h={}; nu.forEach(i=>h[i.room_name]=(h[i.room_name]||0)+1); console.log('   rooms:',h);
}
console.log('\n(no DB write yet — dry run)');
