// Dane administratora danych per organizacja — do klauzuli informacyjnej (/prywatnosc)
// i rejestru czynności (/rodo). Uzupełniane z oficjalnych źródeł administratora.

export interface RodoAdmin {
  name: string
  address: string
  nip?: string
  regon?: string
  register?: string
  email?: string
  iod?: string
  phone?: string
  updated?: string
  noEogTransfer?: boolean   // administrator deklaruje brak transferu poza EOG
}

export const RODO_ADMIN: Record<string, RodoAdmin> = {
  // Źródło: teatrdramatyczny.pl/kontakt oraz /rodo (stan 2026-07-06)
  'teatr-dramatyczny': {
    name: 'Teatr Dramatyczny im. Gustawa Holoubka',
    address: 'Pałac Kultury i Nauki, pl. Defilad 1, 00-901 Warszawa',
    nip: '525-25-44-475',
    regon: '146463327',
    register: 'RIA/1/2013 — Rejestr Instytucji Kultury m.st. Warszawy',
    email: 'kontakt@teatrdramatyczny.pl',
    iod: 'iod@teatrdramatyczny.pl',
    phone: '721 223 372 (Biuro Obsługi Widzów)',
    updated: '6 lipca 2026',
    noEogTransfer: true,
  },
}

export function rodoAdminFor(slug?: string | null): RodoAdmin | null {
  return (slug && RODO_ADMIN[slug]) || null
}
