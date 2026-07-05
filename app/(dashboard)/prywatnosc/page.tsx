'use client'

import { useOrg } from '@/lib/org-context'

// Klauzula informacyjna (art. 13 RODO) — WZÓR do zatwierdzenia przez administratora/prawnika.
// Miejsca w [nawiasach] uzupełnia administrator (teatr).

export default function PrivacyNoticePage() {
  const { org } = useOrg()
  const admin = (org as any)?.name ?? '[nazwa teatru — administrator danych]'

  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-base font-bold mt-6 mb-2" style={{ color: '#1a1410' }}>{children}</h2>
  )
  const P = ({ children }: { children: React.ReactNode }) => (
    <p className="text-sm leading-relaxed mb-2" style={{ color: '#3e3830' }}>{children}</p>
  )

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <div className="mb-5">
        <h1 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '1.75rem', fontWeight: 700, color: '#1a1410' }}>
          Klauzula informacyjna (RODO)
        </h1>
        <p className="text-xs mt-1" style={{ color: '#a89e92' }}>Informacja o przetwarzaniu danych osobowych w aplikacji repertuarowej</p>
      </div>

      <div className="rounded-xl px-4 py-3 mb-5 text-xs" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
        ⚠ Dokument roboczy (wzór). Ostateczną treść zatwierdza administrator danych i prawnik/IOD. Pola w [nawiasach] wymagają uzupełnienia.
      </div>

      <H>1. Administrator danych</H>
      <P>Administratorem Twoich danych osobowych jest <b>{admin}</b>, [adres], [NIP]. Kontakt: [e-mail], [telefon].</P>
      <P>Inspektor Ochrony Danych (jeśli powołany): [imię i nazwisko / e-mail IOD].</P>

      <H>2. Cele i podstawy prawne przetwarzania</H>
      <P>• <b>Planowanie i realizacja repertuaru</b> (przydział do spektakli/prób, harmonogram, dostępność) — niezbędność do wykonania umowy lub podjęcia działań na Twoje żądanie (art. 6 ust. 1 lit. b RODO) oraz prawnie uzasadniony interes administratora w organizacji pracy teatru (art. 6 ust. 1 lit. f).</P>
      <P>• <b>Komunikacja</b> (powiadomienia o spektaklach, próbach, premierach, prośby o potwierdzenie udziału — e-mail/SMS) — wykonanie umowy oraz prawnie uzasadniony interes (art. 6 ust. 1 lit. b i f).</P>
      <P>• <b>Ewidencja nieobecności/dostępności</b> — prawnie uzasadniony interes oraz obowiązki wynikające z organizacji pracy (art. 6 ust. 1 lit. f; w zakresie danych kadrowych — art. 6 ust. 1 lit. c). Aplikacja rejestruje wyłącznie <b>fakt dostępności/niedostępności</b> w danym dniu, bez informacji o przyczynie.</P>

      <H>3. Kategorie przetwarzanych danych</H>
      <P>Imię i nazwisko, adres e-mail, numer telefonu, rok/data urodzenia, wizerunek (zdjęcie profilowe), przynależność do zespołu, przydział do spektakli i prób, status dostępności w kalendarzu, treść komunikacji w aplikacji.</P>
      <P>Aplikacja <b>nie zbiera danych o stanie zdrowia</b> — nieobecność oznaczana jest neutralnie jako „Niedostępny". Prosimy nie wpisywać danych o zdrowiu ani innych danych szczególnych w polach opisowych.</P>

      <H>4. Odbiorcy danych (podmioty przetwarzające)</H>
      <P>Dane mogą być powierzane dostawcom usług IT działającym na zlecenie administratora: dostawcy aplikacji (operator systemu), hostingu i bazy danych, wysyłki e-mail i SMS, oraz — w zakresie wspomagania planowania — dostawcy usług AI. Pełną listę podmiotów przetwarzających udostępnia administrator.</P>

      <H>5. Przekazywanie poza EOG</H>
      <P>Niektórzy dostawcy mogą przetwarzać dane poza Europejskim Obszarem Gospodarczym. W takim wypadku odbywa się to na podstawie odpowiednich zabezpieczeń (standardowe klauzule umowne / decyzja o adekwatności / EU-US Data Privacy Framework). Szczegóły udostępnia administrator.</P>

      <H>6. Okres przechowywania</H>
      <P>Dane przechowujemy przez okres współpracy oraz przez czas wynikający z przepisów (m.in. rozliczeniowych) i uzasadnionego interesu administratora, po czym są usuwane lub anonimizowane. Szczegółowe okresy określa polityka retencji administratora.</P>

      <H>7. Twoje prawa</H>
      <P>Masz prawo do: dostępu do danych i uzyskania kopii, sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia danych, wniesienia sprzeciwu wobec przetwarzania opartego na uzasadnionym interesie, a także prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych. Żądania kieruj do administratora ([e-mail kontaktowy]).</P>

      <H>8. Dobrowolność i decyzje zautomatyzowane</H>
      <P>Podanie danych kontaktowych jest niezbędne do organizacji pracy i komunikacji. Aplikacja może proponować układ repertuaru (wsparcie planowania), jednak <b>decyzje podejmuje koordynator</b> — nie następuje wyłącznie zautomatyzowane podejmowanie decyzji wywołujące skutki prawne wobec osób.</P>

      <p className="text-[11px] mt-8" style={{ color: '#b8b0a4' }}>Wersja robocza. Data ostatniej aktualizacji: [data]. Zatwierdza: [administrator / IOD].</p>
    </div>
  )
}
