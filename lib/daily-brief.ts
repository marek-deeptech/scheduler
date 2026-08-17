// Dane do ekranu powitalnego KPA: wschód/zachód słońca (liczone lokalnie),
// imieniny i „kartka z kalendarza" (fakty warszawskie). Pogoda dociągana
// osobno w /api/daily-brief (Open-Meteo) — reszta działa bez internetu.

export const WARSAW = { lat: 52.2297, lon: 21.0122, tz: 'Europe/Warsaw' }

/* ── Wschód/zachód słońca — algorytm NOAA (bez zależności) ────────────── */

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5
}
function fromJulian(j: number): Date {
  return new Date((j - 2440587.5) * 86400000)
}

/** Zwraca { sunrise, sunset } jako Date (UTC) dla podanej daty i pozycji. */
export function sunTimes(date: Date, lat = WARSAW.lat, lon = WARSAW.lon): { sunrise: Date | null; sunset: Date | null } {
  const n = Math.round(julianDay(date) - 2451545.0 + 0.0008)
  const Jstar = n - lon / 360                                  // południe słoneczne
  const M = (357.5291 + 0.98560028 * Jstar) % 360              // anomalia średnia
  const C = 1.9148 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(2 * M)) + 0.0003 * Math.sin(rad(3 * M))
  const lambda = (M + C + 180 + 102.9372) % 360                // długość ekliptyczna
  const Jtransit = 2451545.0 + Jstar + 0.0053 * Math.sin(rad(M)) - 0.0069 * Math.sin(rad(2 * lambda))
  const sinDec = Math.sin(rad(lambda)) * Math.sin(rad(23.44))
  const dec = Math.asin(sinDec)
  const cosOmega =
    (Math.sin(rad(-0.833)) - Math.sin(rad(lat)) * sinDec) / (Math.cos(rad(lat)) * Math.cos(dec))
  if (cosOmega > 1 || cosOmega < -1) return { sunrise: null, sunset: null }   // noc/dzień polarny
  const omega = deg(Math.acos(cosOmega))
  return {
    sunrise: fromJulian(Jtransit - omega / 360),
    sunset: fromJulian(Jtransit + omega / 360),
  }
}

export function fmtWarsawTime(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleTimeString('pl-PL', { timeZone: WARSAW.tz, hour: '2-digit', minute: '2-digit' })
}

/* ── Pogoda: kody WMO → opis po polsku ────────────────────────────────── */

export function weatherText(code: number): string {
  if (code === 0) return 'bezchmurnie'
  if (code === 1) return 'przeważnie słonecznie'
  if (code === 2) return 'częściowe zachmurzenie'
  if (code === 3) return 'pochmurno'
  if (code === 45 || code === 48) return 'mgła'
  if (code >= 51 && code <= 57) return 'mżawka'
  if (code >= 61 && code <= 67) return 'deszcz'
  if (code >= 71 && code <= 77) return 'śnieg'
  if (code >= 80 && code <= 82) return 'przelotne opady'
  if (code === 85 || code === 86) return 'opady śniegu'
  if (code >= 95) return 'burza'
  return 'zmiennie'
}

/* ── Imieniny (kalendarz polski) ──────────────────────────────────────── */

const NAMEDAYS: Record<string, string> = {
  '01-01': 'Mieczysława, Marii', '01-02': 'Bazylego, Grzegorza', '01-03': 'Danuty, Genowefy',
  '01-04': 'Anieli, Eugeniusza', '01-05': 'Edwarda, Hanny', '01-06': 'Kacpra, Melchiora, Baltazara',
  '01-07': 'Juliana, Lucjana', '01-08': 'Seweryna, Mścisława', '01-09': 'Adriana, Marceliny',
  '01-10': 'Wilhelma, Dobrosława', '01-11': 'Honoraty, Matyldy', '01-12': 'Benedykta, Arkadiusza',
  '01-13': 'Bogumiła, Weroniki', '01-14': 'Feliksa, Niny', '01-15': 'Pawła, Arnolda',
  '01-16': 'Marcelego, Włodzimierza', '01-17': 'Antoniego, Rościsława', '01-18': 'Piotra, Małgorzaty',
  '01-19': 'Henryka, Marty', '01-20': 'Fabiana, Sebastiana', '01-21': 'Agnieszki, Jarosława',
  '01-22': 'Anastazego, Wincentego', '01-23': 'Ildefonsa, Rajmunda', '01-24': 'Felicji, Rafała',
  '01-25': 'Pawła, Miłosza', '01-26': 'Tymoteusza, Pauliny', '01-27': 'Przybysława, Jerzego',
  '01-28': 'Radomira, Tomasza', '01-29': 'Zdzisława, Franciszka', '01-30': 'Martyny, Macieja',
  '01-31': 'Marceli, Ludwiki',
  '02-01': 'Brygidy, Ignacego', '02-02': 'Marii, Joanny', '02-03': 'Błażeja, Oskara',
  '02-04': 'Andrzeja, Weroniki', '02-05': 'Agaty, Adelajdy', '02-06': 'Doroty, Bogdana',
  '02-07': 'Ryszarda, Romualda', '02-08': 'Hieronima, Sebastiana', '02-09': 'Apolonii, Cyryla',
  '02-10': 'Scholastyki, Jacka', '02-11': 'Lucjana, Olgierda', '02-12': 'Modesta, Damiana',
  '02-13': 'Grzegorza, Katarzyny', '02-14': 'Cyryla, Walentego', '02-15': 'Faustyna, Jowity',
  '02-16': 'Danuty, Julianny', '02-17': 'Zbigniewa, Aleksego', '02-18': 'Szymona, Konstancji',
  '02-19': 'Konrada, Arnolda', '02-20': 'Leona, Ludomira', '02-21': 'Eleonory, Roberta',
  '02-22': 'Marty, Małgorzaty', '02-23': 'Romany, Damiana', '02-24': 'Macieja, Bogusza',
  '02-25': 'Wiktora, Cezarego', '02-26': 'Mirosława, Aleksandra', '02-27': 'Gabriela, Anastazji',
  '02-28': 'Romana, Ludomira', '02-29': 'Lecha, Antoniny',
  '03-01': 'Antoniny, Radosława', '03-02': 'Halszki, Heleny', '03-03': 'Kunegundy, Maryna',
  '03-04': 'Kazimierza, Łucji', '03-05': 'Fryderyka, Adriana', '03-06': 'Róży, Wiktora',
  '03-07': 'Tomasza, Perpetuy', '03-08': 'Beaty, Wincentego', '03-09': 'Franciszki, Dominika',
  '03-10': 'Cypriana, Marcelego', '03-11': 'Ludosława, Konstantyna', '03-12': 'Grzegorza, Justyna',
  '03-13': 'Bożeny, Krystyny', '03-14': 'Leona, Matyldy', '03-15': 'Longina, Klemensa',
  '03-16': 'Izabeli, Hilarego', '03-17': 'Patryka, Zbigniewa', '03-18': 'Cyryla, Edwarda',
  '03-19': 'Józefa, Bogdana', '03-20': 'Klaudii, Eufemii', '03-21': 'Benedykta, Lubomiry',
  '03-22': 'Katarzyny, Bogusława', '03-23': 'Pelagii, Feliksa', '03-24': 'Marka, Gabriela',
  '03-25': 'Marioli, Ireneusza', '03-26': 'Larysy, Emanuela', '03-27': 'Lidii, Ernesta',
  '03-28': 'Anieli, Jana', '03-29': 'Wiktoryna, Eustachego', '03-30': 'Amelii, Anieli',
  '03-31': 'Beniamina, Balbiny',
  '04-01': 'Grażyny, Zbigniewa', '04-02': 'Franciszka, Władysława', '04-03': 'Ryszarda, Pankracego',
  '04-04': 'Izydora, Wacława', '04-05': 'Ireny, Wincentego', '04-06': 'Wilhelma, Celestyna',
  '04-07': 'Rufina, Donata', '04-08': 'Cezaryny, Dionizego', '04-09': 'Marii, Dymitra',
  '04-10': 'Michała, Makarego', '04-11': 'Filipa, Leona', '04-12': 'Juliusza, Lubosława',
  '04-13': 'Przemysława, Idy', '04-14': 'Justyny, Waleriana', '04-15': 'Anastazji, Wacławy',
  '04-16': 'Kseni, Bernadety', '04-17': 'Rudolfa, Roberta', '04-18': 'Bogusławy, Apoloniusza',
  '04-19': 'Adolfa, Tymona', '04-20': 'Czesława, Agnieszki', '04-21': 'Anzelma, Bartosza',
  '04-22': 'Kai, Łukasza', '04-23': 'Jerzego, Wojciecha', '04-24': 'Horacego, Feliksa',
  '04-25': 'Marka, Jarosława', '04-26': 'Marzeny, Klaudiusza', '04-27': 'Zyty, Teofila',
  '04-28': 'Piotra, Walerii', '04-29': 'Rity, Katarzyny', '04-30': 'Mariana, Katarzyny',
  '05-01': 'Józefa, Jeremiasza', '05-02': 'Zygmunta, Atanazego', '05-03': 'Marii, Aleksandra',
  '05-04': 'Moniki, Floriana', '05-05': 'Ireny, Waldemara', '05-06': 'Judyty, Filipa',
  '05-07': 'Gizeli, Ludmiły', '05-08': 'Stanisława, Wiktora', '05-09': 'Grzegorza, Bożydara',
  '05-10': 'Izydora, Antoniny', '05-11': 'Igi, Miry', '05-12': 'Pankracego, Dominika',
  '05-13': 'Serwacego, Roberta', '05-14': 'Bonifacego, Macieja', '05-15': 'Zofii, Nadziei',
  '05-16': 'Andrzeja, Szymona', '05-17': 'Weroniki, Sławomira', '05-18': 'Eryka, Feliksa',
  '05-19': 'Piotra, Mikołaja', '05-20': 'Bazylego, Bernardyna', '05-21': 'Tymoteusza, Wiktora',
  '05-22': 'Heleny, Julii', '05-23': 'Iwony, Dezyderiusza', '05-24': 'Joanny, Zuzanny',
  '05-25': 'Grzegorza, Magdaleny', '05-26': 'Filipa, Pauliny', '05-27': 'Juliusza, Augustyna',
  '05-28': 'Jaromira, Wilhelma', '05-29': 'Magdaleny, Bogusławy', '05-30': 'Ferdynanda, Joanny',
  '05-31': 'Anieli, Petroneli',
  '06-01': 'Jakuba, Konrada', '06-02': 'Erazma, Marianny', '06-03': 'Leszka, Tamary',
  '06-04': 'Karola, Franciszka', '06-05': 'Bonifacego, Waltera', '06-06': 'Norberta, Bogumiła',
  '06-07': 'Roberta, Wiesława', '06-08': 'Medarda, Maksyma', '06-09': 'Pelagii, Felicjana',
  '06-10': 'Bogumiła, Małgorzaty', '06-11': 'Barnaby, Feliksa', '06-12': 'Janiny, Onufrego',
  '06-13': 'Antoniego, Lucjana', '06-14': 'Bazylego, Elizy', '06-15': 'Wita, Jolanty',
  '06-16': 'Aliny, Justyny', '06-17': 'Laury, Marcjana', '06-18': 'Marka, Elżbiety',
  '06-19': 'Gerwazego, Romualda', '06-20': 'Bogny, Florentyny', '06-21': 'Alicji, Alojzego',
  '06-22': 'Pauliny, Tomasza', '06-23': 'Wandy, Zenona', '06-24': 'Jana, Danuty',
  '06-25': 'Wilhelma, Łucji', '06-26': 'Jana, Pawła', '06-27': 'Maryli, Władysława',
  '06-28': 'Ireneusza, Leona', '06-29': 'Piotra, Pawła', '06-30': 'Emilii, Lucyny',
  '07-01': 'Haliny, Marianny', '07-02': 'Marii, Urbana', '07-03': 'Anatola, Tomasza',
  '07-04': 'Elżbiety, Malwiny', '07-05': 'Marii, Karoliny', '07-06': 'Dominiki, Gotarda',
  '07-07': 'Cyryla, Metodego', '07-08': 'Elżbiety, Eugeniusza', '07-09': 'Weroniki, Zenona',
  '07-10': 'Filipa, Amelii', '07-11': 'Olgi, Benedykta', '07-12': 'Jana, Brunona',
  '07-13': 'Andrzeja, Małgorzaty', '07-14': 'Kamila, Bonawentury', '07-15': 'Henryka, Włodzimierza',
  '07-16': 'Marii, Stefana', '07-17': 'Aleksego, Bogdana', '07-18': 'Szymona, Kamila',
  '07-19': 'Wincentego, Wodzisława', '07-20': 'Czesława, Hieronima', '07-21': 'Daniela, Wawrzyńca',
  '07-22': 'Marii Magdaleny, Bolesławy', '07-23': 'Bogny, Brygidy', '07-24': 'Kingi, Krystyny',
  '07-25': 'Jakuba, Krzysztofa', '07-26': 'Anny, Joachima', '07-27': 'Julii, Natalii',
  '07-28': 'Innocentego, Wiktora', '07-29': 'Marty, Olafa', '07-30': 'Julity, Piotra',
  '07-31': 'Ignacego, Heleny',
  '08-01': 'Justyna, Nadii', '08-02': 'Gustawa, Kariny', '08-03': 'Lidii, Augusta',
  '08-04': 'Dominika, Protazego', '08-05': 'Marii, Oswalda', '08-06': 'Sławy, Jakuba',
  '08-07': 'Doroty, Kajetana', '08-08': 'Cypriana, Dominika', '08-09': 'Romana, Ryszarda',
  '08-10': 'Wawrzyńca, Filomeny', '08-11': 'Zuzanny, Klary', '08-12': 'Klary, Lecha',
  '08-13': 'Diany, Hipolita', '08-14': 'Alfreda, Maksymiliana', '08-15': 'Marii, Napoleona',
  '08-16': 'Stefana, Rocha', '08-17': 'Jacka, Mirona', '08-18': 'Ilony, Heleny',
  '08-19': 'Bolesława, Juliana', '08-20': 'Bernarda, Sobiesława', '08-21': 'Joanny, Kazimiery',
  '08-22': 'Cezarego, Marii', '08-23': 'Apolinarego, Filipa', '08-24': 'Bartłomieja, Jerzego',
  '08-25': 'Ludwika, Luizy', '08-26': 'Marii, Aleksandra', '08-27': 'Moniki, Cezarego',
  '08-28': 'Augustyna, Patrycji', '08-29': 'Sabiny, Jana', '08-30': 'Róży, Szczęsnego',
  '08-31': 'Bogdana, Rajmunda',
  '09-01': 'Bronisławy, Idziego', '09-02': 'Stefana, Juliana', '09-03': 'Szymona, Grzegorza',
  '09-04': 'Rozalii, Idziego', '09-05': 'Doroty, Wawrzyńca', '09-06': 'Beaty, Eugeniusza',
  '09-07': 'Reginy, Melchiora', '09-08': 'Marii, Adrianny', '09-09': 'Piotra, Sergiusza',
  '09-10': 'Łukasza, Mikołaja', '09-11': 'Prota, Jacka', '09-12': 'Marii, Gwidona',
  '09-13': 'Eugenii, Jana', '09-14': 'Bernarda, Roksany', '09-15': 'Albina, Nikodema',
  '09-16': 'Edyty, Kornela', '09-17': 'Franciszka, Roberta', '09-18': 'Stanisława, Irmy',
  '09-19': 'Januarego, Konstancji', '09-20': 'Filipiny, Eustachego', '09-21': 'Mateusza, Jonasza',
  '09-22': 'Tomasza, Maurycego', '09-23': 'Bogusława, Tekli', '09-24': 'Gerarda, Teodora',
  '09-25': 'Aurelii, Władysława', '09-26': 'Kosmy, Damiana', '09-27': 'Wincentego, Damiana',
  '09-28': 'Wacława, Marka', '09-29': 'Michała, Michaliny', '09-30': 'Wery, Hieronima',
  '10-01': 'Danuty, Remigiusza', '10-02': 'Teofila, Dionizego', '10-03': 'Teresy, Heliodora',
  '10-04': 'Rozalii, Franciszka', '10-05': 'Igora, Apolinarego', '10-06': 'Artura, Brunona',
  '10-07': 'Marii, Marka', '10-08': 'Pelagii, Brygidy', '10-09': 'Arnolda, Dionizego',
  '10-10': 'Danieli, Pauliny', '10-11': 'Aldony, Emila', '10-12': 'Maksymiliana, Edwina',
  '10-13': 'Edwarda, Geralda', '10-14': 'Kaliksta, Liwii', '10-15': 'Jadwigi, Teresy',
  '10-16': 'Gawła, Ambrożego', '10-17': 'Wiktora, Małgorzaty', '10-18': 'Juliana, Łukasza',
  '10-19': 'Piotra, Pawła', '10-20': 'Ireny, Kleopatry', '10-21': 'Urszuli, Hilarego',
  '10-22': 'Halki, Filipa', '10-23': 'Marleny, Seweryna', '10-24': 'Marcina, Rafała',
  '10-25': 'Ingi, Wilhelminy', '10-26': 'Lucjana, Ewarysta', '10-27': 'Iwony, Sabiny',
  '10-28': 'Szymona, Tadeusza', '10-29': 'Wioletty, Euzebii', '10-30': 'Zenobii, Przemysława',
  '10-31': 'Urbana, Saturnina',
  '11-01': 'Wszystkich Świętych', '11-02': 'Bohdana, Tobiasza', '11-03': 'Sylwii, Huberta',
  '11-04': 'Karola, Olgierda', '11-05': 'Elżbiety, Sławomira', '11-06': 'Feliksa, Ziemowita',
  '11-07': 'Antoniego, Ernesta', '11-08': 'Sewera, Bogdana', '11-09': 'Teodora, Ursyna',
  '11-10': 'Leny, Ludomira', '11-11': 'Marcina, Bartłomieja', '11-12': 'Renaty, Witolda',
  '11-13': 'Mikołaja, Stanisława', '11-14': 'Rogera, Serafina', '11-15': 'Alberta, Leopolda',
  '11-16': 'Gertrudy, Edmunda', '11-17': 'Grzegorza, Salomei', '11-18': 'Romana, Karoliny',
  '11-19': 'Elżbiety, Seweryny', '11-20': 'Feliksa, Rafała', '11-21': 'Janusza, Konrada',
  '11-22': 'Cecylii, Marka', '11-23': 'Klemensa, Adeli', '11-24': 'Emmy, Flory',
  '11-25': 'Katarzyny, Erazma', '11-26': 'Delfiny, Konrada', '11-27': 'Waleriana, Maksyma',
  '11-28': 'Zdzisława, Lesława', '11-29': 'Błażeja, Saturnina', '11-30': 'Andrzeja, Konstantego',
  '12-01': 'Natalii, Eligiusza', '12-02': 'Balbiny, Pauliny', '12-03': 'Franciszka, Ksawerego',
  '12-04': 'Barbary, Krystiana', '12-05': 'Sabiny, Krystyny', '12-06': 'Mikołaja, Jaremy',
  '12-07': 'Ambrożego, Marcina', '12-08': 'Marii, Wirginii', '12-09': 'Wiesława, Leokadii',
  '12-10': 'Julii, Danieli', '12-11': 'Damazego, Waldemara', '12-12': 'Dagmary, Aleksandra',
  '12-13': 'Łucji, Otylii', '12-14': 'Alfreda, Izydora', '12-15': 'Niny, Celiny',
  '12-16': 'Albiny, Zdzisławy', '12-17': 'Olimpii, Łazarza', '12-18': 'Gracjana, Bogusława',
  '12-19': 'Gabrieli, Dariusza', '12-20': 'Bogumiły, Dominika', '12-21': 'Tomasza, Seweryna',
  '12-22': 'Zenona, Honoraty', '12-23': 'Wiktorii, Sławomiry', '12-24': 'Adama, Ewy',
  '12-25': 'Anastazji, Eugenii', '12-26': 'Szczepana, Dionizego', '12-27': 'Jana, Żanety',
  '12-28': 'Teofili, Cezarego', '12-29': 'Dawida, Tomasza', '12-30': 'Rainera, Eugeniusza',
  '12-31': 'Sylwestra, Melanii',
}

export function nameDay(date: Date): string {
  const key = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return NAMEDAYS[key] ?? '—'
}

/* ── Kartka z kalendarza: fakty o Warszawie ───────────────────────────── */

const WARSAW_FACTS: string[] = [
  '1596 — Zygmunt III Waza przeniósł dwór królewski z Krakowa do Warszawy; miasto zaczęło pełnić rolę stolicy.',
  '1727 — Ogród Saski otwarto dla mieszkańców jako jeden z pierwszych publicznych parków w Europie.',
  '1765 — Stanisław August Poniatowski powołał Teatr Narodowy — pierwszy publiczny teatr w Polsce.',
  '1791 — Sejm Czteroletni uchwalił na Zamku Królewskim Konstytucję 3 maja.',
  '1833 — otwarto Teatr Wielki przy placu Teatralnym, projektu Antonia Corazziego.',
  '1866 — ruszyła pierwsza linia tramwaju konnego, łącząca dworce kolejowe.',
  '1867 — przy ulicy Freta urodziła się Maria Skłodowska-Curie.',
  '1901 — na Powiślu uruchomiono stację filtrów Williama Lindleya, do dziś zasilającą miasto.',
  '1914 — oddano do użytku Most Poniatowskiego, wtedy jeden z najnowocześniejszych w Europie.',
  '1918 — 11 listopada Warszawa świętowała odzyskanie niepodległości.',
  '1926 — otwarto Muzeum Narodowe w gmachu przy Alejach Jerozolimskich.',
  '1939 — we wrześniu miasto broniło się przez trzy tygodnie; radio nadawało hejnał jako sygnał obrony.',
  '1944 — 1 sierpnia o godzinie 17:00 („godzina W") wybuchło Powstanie Warszawskie.',
  '1945 — ruszyła odbudowa Starego Miasta, prowadzona m.in. na podstawie obrazów Canaletta.',
  '1955 — oddano do użytku Pałac Kultury i Nauki, w którym mieści się Teatr Dramatyczny.',
  '1955 — w Pałacu Kultury zainaugurował działalność Teatr Dramatyczny m.st. Warszawy.',
  '1980 — warszawska Starówka trafiła na Listę Światowego Dziedzictwa UNESCO.',
  '1989 — przy Okrągłym Stole rozpoczęły się obrady, które zmieniły ustrój Polski.',
  '1995 — 7 kwietnia otwarto pierwszy odcinek metra: z Kabat na Politechnikę.',
  '2000 — po odbudowie otwarto Most Świętokrzyski, pierwszy podwieszany most w mieście.',
  '2004 — otwarto Muzeum Powstania Warszawskiego przy ulicy Grzybowskiej.',
  '2012 — Stadion Narodowy gościł mecz otwarcia Mistrzostw Europy w piłce nożnej.',
  '2015 — uruchomiono centralny odcinek drugiej linii metra pod Wisłą.',
  'Herbem miasta jest Syrenka — jej pomnik na Rynku Starego Miasta odsłonięto w 1855 roku.',
]

/** Deterministyczny wybór faktu na dany dzień (ten sam przez cały dzień). */
export function warsawFact(date: Date): string {
  const dayNum = Math.floor(date.getTime() / 86400000)
  return WARSAW_FACTS[Math.abs(dayNum) % WARSAW_FACTS.length]
}

/** „poniedziałek, 20 lipca" */
export function longDatePl(date: Date): string {
  return date.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
}
