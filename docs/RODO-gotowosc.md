# Plan gotowości RODO — aplikacja repertuarowa (theater-scheduler)

> Dokument roboczy dla przeglądu prawnika teatru. **Nie jest opinią prawną.**
> Cel: uporządkować techniczne i organizacyjne aspekty przetwarzania danych, tak
> by prawnik/IOD mógł szybko potwierdzić zgodność (lub wskazać braki do domknięcia).

## 0. Role i model przetwarzania (punkt wyjścia)

- **Administrator (controller):** teatr / organizacja (Fundacja KJ dla Polonia+Och; Teatr Dramatyczny) — to on decyduje o celach i środkach przetwarzania danych aktorów/pracowników.
- **Podmiot przetwarzający (processor):** dostawca aplikacji (VeryNiceWorks / operator SaaS) — przetwarza dane **w imieniu** teatru.
- **Konsekwencja:** wymagana **umowa powierzenia przetwarzania (art. 28 RODO)** teatr ↔ dostawca. To najważniejszy dokument, którego prawnik będzie oczekiwał. Reszta planu dostarcza materiał do tej umowy (mapa danych, lista subprocesorów, opis zabezpieczeń).

---

## 1. Mapa danych osobowych w aplikacji (RoPA — art. 30)

| Kategoria danych | Gdzie (tabela/pole) | Wrażliwość | Uwaga |
|---|---|---|---|
| Imię i nazwisko | `artists.name` | zwykłe | — |
| E-mail | `artists.email`, `app_settings.*_email` | zwykłe | podstawa: umowa/uzasadniony interes |
| Telefon | `artists.phone` | zwykłe | do SMS |
| Data urodzenia | `artists.birth_date` | zwykłe | **minimalizacja: czy pełna data potrzebna, czy wystarczy rok?** |
| Wizerunek (zdjęcie) | `artists.avatar_url` | zwykłe | prawa autorskie + wizerunek; źródło (patrz §7) |
| **Status „Choroba"** | `actor_day_status.status` | **SZCZEGÓLNA (art. 9 — zdrowie)** | ⚠ **kluczowy punkt — patrz §2** |
| Urlop / niedostępność | `actor_day_status.status` | zwykłe | dane o dostępności/nieobecności |
| Notatka do dnia | `actor_day_status.note` (free text) | **potencjalnie szczególna** | pole swobodne — może zawierać dane o zdrowiu/życiu prywatnym |
| Obsada / zaangażowanie | `artist_productions`, `event_artists` | zwykłe | kto w czym gra (dane pracownicze/kontraktowe) |
| Treść komunikacji | `actor_messages`, `notification_deliveries` | zwykłe | wiadomości do/od aktorów |
| Potwierdzenia udziału | `event_confirmations` | zwykłe | + tokeny dostępowe |
| Przynależność do zespołu | `artists.team_id` (Cast/Technika/Wardrobe) | zwykłe | — |
| Hasła organizacji | `organizations.coord_password`, `actor_password` | **poufne** | ⚠ **plaintext — patrz §3** |
| Tokeny Google OAuth | `google_accounts` / gcal | **poufne** | dostęp do konta Google |

**Do zrobienia:** wygenerować z tej mapy formalny **Rejestr Czynności Przetwarzania** (mogę przygotować szkielet automatycznie ze schematu bazy).

---

## 2. ⚠ PRIORYTET 0 — dane o zdrowiu (art. 9): status „Choroba"

To najczęstszy powód, dla którego prawnik zatrzyma projekt. „Choroba" = dane o zdrowiu (kategoria szczególna), a pole `note` może to pogłębiać.

**Rekomendowane opcje (do wyboru z prawnikiem):**
1. **Abstrakcja (najczystsze):** w aplikacji nie rozróżniać powodu nieobecności — jeden status „Niedostępny" zamiast „Choroba"/„Urlop". Aplikacja i tak potrzebuje tylko „czy dostępny", nie „dlaczego". Eliminuje przetwarzanie danych o zdrowiu u dostawcy.
2. **Zachować, ale uzasadnić i zabezpieczyć:** podstawa z prawa pracy (art. 9 ust. 2 lit. b RODO + Kodeks pracy — ewidencja nieobecności), ograniczony dostęp (tylko KPA/kadry), szyfrowanie, krótka retencja, wpis w RoPA + DPIA.

**Dodatkowo:** pole `note` (swobodny tekst) — dodać ostrzeżenie w UI „nie wpisuj danych o zdrowiu" lub ograniczyć/usunąć.

*Mogę zaimplementować wariant 1 (scalić „Choroba"→„Niedostępny") w kodzie — decyzja należy do teatru/prawnika.*

---

## 3. PRIORYTET 0 — bezpieczeństwo dostępu (art. 32)

- **Hasła współdzielone w plaintext** (`organizations.coord_password/actor_password`). Prawnik/audytor to wskaże. Minimum: **hashowanie (bcrypt/argon2)**. Docelowo: konta imienne per użytkownik (rozliczalność — kto co zmienił).
- **Rotacja klucza `service_role`** (był wklejany w trakcie prac) — wygenerować nowy w Supabase, podmienić w env.
- **Model dostępu — mocna strona:** RLS deny-by-default + proxy z `service_role` + izolacja per organizacja (org_id wstrzykiwany). To dobrze udokumentować dla prawnika (świadczy o „privacy by design").
- **TEST MODE** (przekierowania e-mail→marek@, SMS→jeden numer) i **dane demo z realnymi/zescrapowanymi kontaktami** — przed produkcją: wyłączyć TEST MODE i wyczyścić dane demo (§7).

---

## 4. PRIORYTET 0 — subprocesorzy i transfery poza EOG

Każdy zewnętrzny dostawca = **subprocesor** (wymaga zgody administratora + własnej umowy powierzenia + zabezpieczeń transferu).

| Usługa | Rola | Lokalizacja / transfer | Do domknięcia |
|---|---|---|---|
| Supabase | baza + storage (zdjęcia) | **sprawdzić region projektu** (wybrać EU) | DPA + region UE |
| Vercel | hosting/compute | US (spółka); możliwy region UE | DPA + SCC/DPF |
| Resend | wysyłka e-mail | US | DPA + SCC/DPF |
| SMSAPI | wysyłka SMS | **PL (EOG) — plus** | DPA (polski dostawca) |
| Anthropic (Claude) | `/api/chat`, `/api/planning/generate` | US | DPA + SCC/DPF + **zero-retention / brak treningu na danych** |
| Google | Kalendarz (OAuth) | US | zakres uprawnień + DPF |

**Do zrobienia:** (1) potwierdzić region Supabase = UE; (2) zebrać linki do DPA/SCC każdego dostawcy; (3) sporządzić **listę subprocesorów** jako załącznik do umowy powierzenia; (4) dla Anthropic potwierdzić brak retencji/treningu (istotne — do generatora repertuaru trafiają nazwiska/obsada).

---

## 5. PRIORYTET 1 — minimalizacja, retencja, prawa podmiotów

- **Minimalizacja (art. 5):** data urodzenia (rok vs pełna), telefon/e-mail tylko gdy potrzebne, notatki swobodne.
- **Retencja:** zdefiniować okresy (np. dane nieobecności — zgodnie z prawem pracy; komunikaty — X mies.; logi — Y mies.) + **mechanizm usuwania** (dziś dane rosną bez limitu). *Mogę dodać zadanie czyszczące (cron) po ustaleniu okresów.*
- **Prawa podmiotów (art. 15–20):** dostęp, sprostowanie, usunięcie, przenoszenie. Potrzebny proces (może być półautomatyczny) + funkcje: **eksport danych aktora** i **usunięcie/anonimizacja**. *Mogę dodać endpointy „eksport JSON aktora" i „anonimizuj aktora".*
- **Klauzula informacyjna (art. 13):** krótka informacja dla aktorów: kto administruje, po co, na jakiej podstawie, jak długo, jakie prawa, subprocesorzy. *Mogę przygotować draft.*

---

## 6. PRIORYTET 1 — DPIA i naruszenia

- **DPIA (art. 35):** przy danych o zdrowiu + systematycznym monitorowaniu dostępności/zaangażowania warto przeprowadzić lekką ocenę skutków. Jeśli wybierzemy §2 wariant 1 (bez danych o zdrowiu), ryzyko i potrzeba DPIA maleją.
- **Procedura naruszeń (art. 33/34):** zgłoszenie do administratora ≤ bez zbędnej zwłoki; dostawca (processor) informuje administratora niezwłocznie. Do opisania w umowie powierzenia + prosta procedura wewnętrzna.

---

## 7. PRIORYTET 1 — dane demo i źródło danych TD

- Dane aktorów TD (nazwiska, **zdjęcia**, roczniki) zaimportowano z publicznej strony **teatrdramatyczny.pl** na potrzeby **dema dla dyrekcji TD** (czyli administratora tych danych). To zazwyczaj obronne, ale prawnik zapyta o: podstawę, **prawa autorskie do zdjęć** (obecnie `avatar_url` może wskazywać na cudze pliki), zakres.
- **Przed produkcją:** potwierdzić podstawę z teatrem, uzyskać/hostować zdjęcia legalnie (lub usunąć), wyczyścić przykładowe kontakty (`marek+slug@…`), wyłączyć TEST MODE.

---

## 8. Cookies / komunikacja

- **Cookie:** tylko techniczny, `httpOnly` (sesja) — niezbędny, bez zgody, ale wspomnieć w klauzuli. Potwierdzić brak analityki/trackerów third-party.
- **Zgody na komunikację (SMS/e-mail):** ustalić podstawę — dla powiadomień służbowych zwykle umowa/uzasadniony interes; dla treści marketingowych — zgoda. Cykliczne powiadomienia (moduł „Automatyczne") = służbowe → uzasadniony interes/umowa; udokumentować.

---

## 9. Pakiet do przekazania prawnikowi (checklist)

- [ ] **Mapa danych / RoPA** (§1) — szkielet z aplikacji
- [ ] **Lista subprocesorów** + ich DPA/SCC/DPF (§4)
- [ ] **Opis zabezpieczeń** (RLS, proxy, izolacja org, szyfrowanie, hasła — po naprawie §3)
- [ ] **Wzór klauzuli informacyjnej** (art. 13) — draft
- [ ] **Umowa powierzenia (art. 28)** — do sporządzenia przez prawnika na bazie powyższych
- [ ] **Polityka retencji** + procedura praw podmiotów (§5)
- [ ] **Decyzja ws. „Choroba"** (§2) + ewentualne DPIA (§6)

---

## 10. Co mogę zrobić w kodzie od ręki (żeby ułatwić „OK")

1. **Scalić „Choroba" → „Niedostępny"** (usunąć kategorię zdrowia) — jeśli teatr się zgodzi.
2. **Hashowanie haseł** organizacji (bcrypt) + instrukcja rotacji `service_role`.
3. **Eksport danych aktora (JSON)** i **anonimizacja/usunięcie aktora** (prawa podmiotów).
4. **Czyszczenie retencyjne** (cron) po ustaleniu okresów.
5. **Szkielet RoPA** + **draft klauzuli informacyjnej** jako pliki w repo.
6. **Ostrzeżenie w UI** przy polu `note` („nie wpisuj danych o zdrowiu").
7. **Twardy pre-prod checklist:** TEST MODE off, dane demo wyczyszczone, region Supabase = UE.

> Kolejność rekomendowana: §2 (Choroba) → §3 (hasła/rotacja) → §4 (subprocesorzy/region) → §1/§9 (dokumenty dla prawnika) → §5 (retencja/prawa).
