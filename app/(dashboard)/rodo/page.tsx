'use client'

import { useOrg } from '@/lib/org-context'

// Rejestr Czynności Przetwarzania (art. 30 RODO) — WZÓR dla administratora.
// Wypełniony na bazie zakresu danych aplikacji; do zatwierdzenia przez administratora/IOD.

const ACTIVITIES = [
  {
    name: 'Planowanie repertuaru i obsady',
    purpose: 'Układanie harmonogramu spektakli/prób, przydział aktorów, zapobieganie konfliktom',
    basis: 'Art. 6 ust. 1 lit. b i f RODO',
    categories: 'Imię i nazwisko, przydział do spektakli/prób, dostępność, zespół',
    retention: 'Okres współpracy + okres wynikający z przepisów',
  },
  {
    name: 'Komunikacja z aktorami (e-mail/SMS)',
    purpose: 'Powiadomienia o spektaklach, próbach, premierach; prośby o potwierdzenie udziału',
    basis: 'Art. 6 ust. 1 lit. b i f RODO',
    categories: 'Imię i nazwisko, e-mail, telefon, treść komunikacji',
    retention: 'Okres współpracy + [X] mies. archiwum komunikacji',
  },
  {
    name: 'Ewidencja dostępności / nieobecności',
    purpose: 'Ustalenie, czy osoba jest dostępna w danym dniu (bez przyczyny nieobecności)',
    basis: 'Art. 6 ust. 1 lit. f (oraz lit. c w zakresie kadrowym)',
    categories: 'Imię i nazwisko, status dostępności (Dostępny/Niedostępny/Urlop), data',
    retention: 'Okres współpracy + okres kadrowy wynikający z przepisów',
  },
  {
    name: 'Profile aktorów',
    purpose: 'Prezentacja obsady, dane kontaktowe, wizerunek',
    basis: 'Art. 6 ust. 1 lit. b i f RODO',
    categories: 'Imię i nazwisko, e-mail, telefon, rok/data urodzenia, wizerunek',
    retention: 'Okres współpracy',
  },
  {
    name: 'Powiadomienia cykliczne (automatyczne)',
    purpose: 'Regularne przypomnienia o repertuarze/próbach/premierach',
    basis: 'Art. 6 ust. 1 lit. b i f RODO',
    categories: 'Imię i nazwisko, e-mail, telefon, log wysyłek',
    retention: '[X] mies. (log doręczeń)',
  },
]

const SUBPROCESSORS = [
  ['Operator aplikacji (dostawca SaaS)', 'Utrzymanie i rozwój systemu', '[UE/poza EOG — uzupełnić]'],
  ['Hosting bazy danych i plików', 'Przechowywanie danych aplikacji', '[region — zalecane UE]'],
  ['Hosting aplikacji (compute)', 'Uruchamianie aplikacji', '[UE / SCC / DPF]'],
  ['Dostawca e-mail', 'Wysyłka powiadomień e-mail', '[SCC / DPF]'],
  ['Dostawca SMS', 'Wysyłka powiadomień SMS', 'PL / EOG'],
  ['Dostawca usług AI (wsparcie planowania)', 'Propozycje układu repertuaru', '[SCC / DPF / zero-retention]'],
  ['Dostawca kalendarza (opcjonalnie)', 'Eksport wydarzeń do kalendarza', '[DPF]'],
]

export default function RopaPage() {
  const { org } = useOrg()
  const admin = (org as any)?.name ?? '[nazwa teatru]'

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <div className="mb-5">
        <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410' }}>
          Rejestr czynności przetwarzania
        </h1>
        <p className="text-xs mt-1" style={{ color: '#a89e92' }}>Art. 30 RODO — administrator: <b>{admin}</b></p>
      </div>

      <div className="rounded-xl px-4 py-3 mb-5 text-xs" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
        ⚠ Dokument roboczy (wzór), przygotowany na bazie zakresu danych aplikacji. Do zatwierdzenia i uzupełnienia przez administratora/IOD (pola w [nawiasach]).
      </div>

      <h2 className="text-base font-bold mb-2" style={{ color: '#1a1410' }}>Czynności przetwarzania</h2>
      <div className="overflow-x-auto rounded-2xl border border-[#e4ddd4] mb-8">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#faf8f5' }}>
              {['Czynność', 'Cel', 'Podstawa', 'Kategorie danych', 'Retencja'].map(h => (
                <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: '#7a7068', borderBottom: '1px solid #e4ddd4' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ACTIVITIES.map((a, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f2ede6' }}>
                <td className="px-3 py-2 font-semibold" style={{ color: '#1a1410' }}>{a.name}</td>
                <td className="px-3 py-2" style={{ color: '#3e3830' }}>{a.purpose}</td>
                <td className="px-3 py-2" style={{ color: '#3e3830' }}>{a.basis}</td>
                <td className="px-3 py-2" style={{ color: '#3e3830' }}>{a.categories}</td>
                <td className="px-3 py-2" style={{ color: '#3e3830' }}>{a.retention}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-base font-bold mb-2" style={{ color: '#1a1410' }}>Podmioty przetwarzające (subprocesorzy)</h2>
      <div className="overflow-x-auto rounded-2xl border border-[#e4ddd4] mb-8">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#faf8f5' }}>
              {['Podmiot / rola', 'Zakres', 'Lokalizacja / transfer'].map(h => (
                <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: '#7a7068', borderBottom: '1px solid #e4ddd4' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f2ede6' }}>
                {r.map((c, j) => <td key={j} className="px-3 py-2" style={{ color: '#3e3830' }}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-base font-bold mb-2" style={{ color: '#1a1410' }}>Środki bezpieczeństwa (art. 32)</h2>
      <ul className="text-sm space-y-1 mb-6" style={{ color: '#3e3830' }}>
        <li>• Izolacja danych per organizacja (RLS „deny-by-default" + serwerowy proxy z kontrolą dostępu).</li>
        <li>• Szyfrowanie transmisji (HTTPS/TLS); szyfrowanie danych w spoczynku po stronie dostawcy bazy.</li>
        <li>• Hasła przechowywane w postaci skrótów (hash), a nie jawnie.</li>
        <li>• Kontrola dostępu wg roli (koordynator / aktor); rozdział danych między teatrami.</li>
        <li>• Minimalizacja: brak zbierania danych o zdrowiu (nieobecność bez przyczyny).</li>
      </ul>

      <p className="text-[11px]" style={{ color: '#b8b0a4' }}>Wersja robocza. Aktualizacja: [data]. Zatwierdza: [administrator / IOD].</p>
    </div>
  )
}
