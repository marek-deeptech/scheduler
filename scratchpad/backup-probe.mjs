import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TD = '22222222-2222-2222-2222-222222222222';
const h = {apikey:KEY, Authorization:`Bearer ${KEY}`};
const get = async (t,q='')=> { const r=await fetch(`${URL}/rest/v1/${t}?${q}`,{headers:h}); if(!r.ok) return {__err:r.status, __msg:await r.text()}; return r.json(); };
const dir='scratchpad/backup-td';
fs.mkdirSync(dir,{recursive:true});
// Backups scoped by org where possible
const tables = ['productions','events','repertoire_proposals','artist_productions','actor_production_substitutes','event_confirmations','event_artists','calendar_invites','gcal_event_map','repertoire_slots'];
for(const t of tables){
  // try org-scoped first
  let data = await get(t, `org_id=eq.${TD}&limit=100000`);
  let scoped='org';
  if(data.__err){ data = await get(t, `limit=5`); scoped='NO-org-col(sample)'; }
  fs.writeFileSync(`${dir}/${t}.json`, JSON.stringify(data,null,0));
  const n = Array.isArray(data)?data.length:('ERR '+JSON.stringify(data));
  const cols = Array.isArray(data)&&data[0]?Object.keys(data[0]).join(','):'-';
  console.log(`${t}: ${n} rows [${scoped}]  cols: ${cols}`);
}
