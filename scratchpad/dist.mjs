import fs from 'fs';
const d=JSON.parse(fs.readFileSync('scratchpad/backup-td/events.json'));
const prods=JSON.parse(fs.readFileSync('scratchpad/backup-td/productions.json'));
const conf=JSON.parse(fs.readFileSync('scratchpad/backup-td/event_confirmations.json'));
const CURRENT = new Set(["UN-PACKING","WCZORAJ BYŁAŚ ZŁA NA ZIELONO","ZAKLINANIE WĘŻY W GORĄCE WIECZORY","SKOK WZWYŻ","SŁUGA DWÓCH PANÓW","SZCZĘŚLIWE DNI","THE WALL","NASZA KLASA","NASZE CZASY","NINA. WIECZNA KRÓLOWA","PODWÓJNY Z FRYTKAMI","MIŁOŚĆ OD OSTATNIEGO WEJRZENIA","MISTRZ I MAŁGORZATA","MÓJ ROK RELAKSU I ODPOCZYNKU","MUSZENIE","KINKY BOOTS","KRUK Z TOWER","LALKA","MADAME","FERDYDURKE","FOGG 2126","I ŻE CIĘ NIE OPUSZCZĘ","JUBILEUSZ","BĘDZIE TRZEBA, TO PÓJDĘ NA WOJNĘ","CHŁOPAKI PŁACZĄ","DZIWNY PRZYPADEK PSA NOCNĄ PORĄ","ERA WODNIKA","KRÓTKI SPEKTAKL O MATCE I CÓRCE","ANIOŁ ZAGŁADY","ANIOŁY W WARSZAWIE","ANTYGONA W MOLENBEEK"]);
const byId=Object.fromEntries(prods.map(p=>[p.id,p.title]));
const isArch=(pid)=>pid&&!CURRENT.has(byId[pid]);
// events by month current/archival
const m={};
for(const e of d){ const mo=e.start_time.slice(0,7); const k=isArch(e.production_id)?'arch':'cur'; (m[mo]=m[mo]||{cur:0,arch:0})[k]++; }
console.log('EVENTS by month (cur/arch):');
for(const mo of Object.keys(m).sort()) console.log(`  ${mo}: cur=${m[mo].cur} arch=${m[mo].arch}`);
// confirmations: map event->prod
const evById=Object.fromEntries(d.map(e=>[e.id,e]));
let cCur=0,cArch=0,cNoEv=0; const statusCur={};
for(const c of conf){ const e=evById[c.event_id]; if(!e){cNoEv++;continue;} if(isArch(e.production_id)){cArch++;} else {cCur++; statusCur[c.status]=(statusCur[c.status]||0)+1;} }
console.log(`\nCONFIRMATIONS total=${conf.length}: onCurrentEv=${cCur} onArchivalEv=${cArch} noEvent=${cNoEv}`);
console.log('  status breakdown on CURRENT events:', statusCur);
// which current events have confirmations (the 12 unconfirmed hook?)
