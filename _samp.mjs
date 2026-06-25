import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const CAST='8c426841-7c11-4e3b-a181-62e036d0e6db', POL='96187687-13eb-4b49-ab60-cc587f58119e'
const names=['Małgorzata Kożuchowska','Krystyna Janda','Daniel Olbrychski','Marcin Jahr']
const { data } = await sb.from('artists').select('name,avatar_url').eq('team_id',CAST).in('name',names)
for(const a of data) console.log(a.name+'|'+a.avatar_url)
const { data: dk } = await sb.from('productions').select('poster_url').eq('theatre_id',POL).eq('title','Depresja Komika').single()
console.log('POSTER_DK|'+dk.poster_url)
