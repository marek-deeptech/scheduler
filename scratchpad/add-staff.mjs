import fs from 'fs';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const URL=env.NEXT_PUBLIC_SUPABASE_URL,KEY=env.SUPABASE_SERVICE_ROLE_KEY,TD='22222222-2222-2222-2222-222222222222';
const hg={apikey:KEY,Authorization:`Bearer ${KEY}`};
const hp={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:'return=representation'};
const TECH='fa505adf-11c8-4290-8d40-b5ac0799edb4', WARD='b603ef8b-976a-4c56-855f-9e6eb6270a09';
const email=n=>`marek+td${n.toLowerCase().normalize('NFD').replace(/[^a-z]/g,'').slice(0,12)}@veryniceworks.com`;
const mk=(name,role,team)=>({name,role,team_id:team,org_id:TD,status:'Dostępny',actor_type:'zewnętrzny',email:email(name)});
// real TD technical staff (public kontakt page)
const staff=[
  mk('Tomasz Grzegorek','Kierownik działu technicznego',TECH),
  mk('Jacek Błażejewski','Szef rekwizytorów',TECH),
  mk('Maksymilian Widera','Rekwizytor',TECH),
  mk('Mariusz Paradowski','Specjalista ds. BHP',TECH),
  mk('Anna Skoczek','Magazyny teatralne',TECH),
  mk('Bożena Borowska','Garderoba / archiwum',WARD),
];
// skip if already present
const ex=await (await fetch(`${URL}/rest/v1/artists?org_id=eq.${TD}&select=name&team_id=in.("${TECH}","${WARD}")`,{headers:hg})).json();
const have=new Set((Array.isArray(ex)?ex:[]).map(a=>a.name));
const toAdd=staff.filter(s=>!have.has(s.name));
if(toAdd.length){ const r=await fetch(`${URL}/rest/v1/artists`,{method:'POST',headers:hp,body:JSON.stringify(toAdd)}); const j=await r.json(); console.log('add staff:',r.status, Array.isArray(j)?j.map(x=>x.name+' ['+x.role+']'):JSON.stringify(j).slice(0,200)); }
else console.log('staff already present');
// verify team counts
const tech=await (await fetch(`${URL}/rest/v1/artists?org_id=eq.${TD}&team_id=eq.${TECH}&select=name,role`,{headers:hg})).json();
const ward=await (await fetch(`${URL}/rest/v1/artists?org_id=eq.${TD}&team_id=eq.${WARD}&select=name,role`,{headers:hg})).json();
console.log('Technique:',tech.length,tech.map(x=>x.name));
console.log('Wardrobe:',ward.length,ward.map(x=>x.name));
// app_settings keys
const st=await (await fetch(`${URL}/rest/v1/app_settings?org_id=eq.${TD}&select=key,value`,{headers:hg})).json();
console.log('app_settings keys:',st.map(s=>`${s.key}=${String(s.value).slice(0,40)}`));
