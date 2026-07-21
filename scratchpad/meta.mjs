import fs from 'fs';
const prods=JSON.parse(fs.readFileSync('scratchpad/backup-td/productions.json'));
const CURRENT = new Set(["UN-PACKING","WCZORAJ BYŁAŚ ZŁA NA ZIELONO","ZAKLINANIE WĘŻY W GORĄCE WIECZORY","SKOK WZWYŻ","SŁUGA DWÓCH PANÓW","SZCZĘŚLIWE DNI","THE WALL","NASZA KLASA","NASZE CZASY","NINA. WIECZNA KRÓLOWA","PODWÓJNY Z FRYTKAMI","MIŁOŚĆ OD OSTATNIEGO WEJRZENIA","MISTRZ I MAŁGORZATA","MÓJ ROK RELAKSU I ODPOCZYNKU","MUSZENIE","KINKY BOOTS","KRUK Z TOWER","LALKA","MADAME","FERDYDURKE","FOGG 2126","I ŻE CIĘ NIE OPUSZCZĘ","JUBILEUSZ","BĘDZIE TRZEBA, TO PÓJDĘ NA WOJNĘ","CHŁOPAKI PŁACZĄ","DZIWNY PRZYPADEK PSA NOCNĄ PORĄ","ERA WODNIKA","KRÓTKI SPEKTAKL O MATCE I CÓRCE","ANIOŁ ZAGŁADY","ANIOŁY W WARSZAWIE","ANTYGONA W MOLENBEEK"]);
// stage distribution among current
const stages={}; prods.filter(p=>CURRENT.has(p.title)).forEach(p=>stages[p.stage]=(stages[p.stage]||0)+1);
console.log('theatre_id:', prods[0].theatre_id);
console.log('stages (current prods):', stages);
// full sample row of a current production
const s=prods.find(p=>p.title==='LALKA');
console.log('LALKA row:', JSON.stringify(s,null,1));
