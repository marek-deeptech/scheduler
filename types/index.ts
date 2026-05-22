export type Team = {
  id: string
  name: string
  created_at: string
}

export type Artist = {
  id: string
  name: string
  email: string
  phone: string | null
  team_id: string | null
  role: string | null
  status: string | null
  avatar_url: string | null
  created_at: string
  teams?: Team
}

export type Theatre = {
  id: string
  name: string
}

export type Room = {
  id: string
  theatre_id: string
  name: string
  theatres?: Theatre
}

export type Production = {
  id: string
  title: string
  start_date: string | null
  end_date: string | null
  theatre_id: string | null
  created_at: string
  theatres?: Theatre
}

export type Event = {
  id: string
  production_id: string | null
  title: string
  type: string | null
  start_time: string
  end_time: string
  location: string | null
  theatre_id: string | null
  room_id: string | null
  created_at: string
  productions?: Production
  theatres?: Theatre
  rooms?: Room
  event_artists?: { artist_id: string; artists: Artist }[]
}

export type Availability = {
  id: string
  artist_id: string
  start_time: string
  end_time: string
  type: string
  note: string | null
}

export const EVENT_TYPE_CATEGORIES: Record<string, string[]> = {
  'Próby': [
    'Próba stolikowa',
    'Próba sytuacyjna',
    'Próba techniczna',
    'Próba muzyczna',
    'Próba choreograficzna',
    'Próba kostiumowa',
    'Próba generalna',
    'Próba z publicznością',
  ],
  'Przygotowania': [
    'Przymiarki kostiumowe',
    'Charakteryzacja',
    'Montaż scenografii',
    'Sesja zdjęciowa',
    'Nagrania',
  ],
  'Spektakle': [
    'Premiera',
    'Spektakl',
    'Spektakl gościnny',
    'Spektakl dla dzieci',
  ],
  'Media / PR': [
    'Konferencja prasowa',
    'Pokaz dla prasy',
    'Wywiad',
  ],
  'Organizacyjne': [
    'Zebranie zespołu',
    'Spotkanie z widzami',
    'Warsztaty',
    'Wyjazd',
  ],
}

export const EVENT_TYPES: string[] = Object.values(EVENT_TYPE_CATEGORIES).flat()

export const REHEARSAL_TYPES = new Set(EVENT_TYPE_CATEGORIES['Próby'])
export const SHOW_TYPES      = new Set(EVENT_TYPE_CATEGORIES['Spektakle'])
