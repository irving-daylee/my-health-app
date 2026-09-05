import type { Body, DayEntry, ISODate, Profile } from '../types'
import { ageAt, derivedBody, voetbalDag, weighIns } from './derive'

/**
 * Vergelijking van je weging van vanochtend met de vorige, plus wat die
 * verschillen betekenen.
 *
 * Het uitgangspunt: op één dag verandert je lichaamssamenstelling nauwelijks.
 * Wat de weegschaal aan verschil laat zien is grotendeels vocht en meetruis.
 * Een bio-impedantieweegschaal schat spier- en botmassa uit de weerstand die
 * je lichaam geeft, en die weerstand hangt sterk af van hoeveel vocht je
 * vasthoudt. Daarom zetten we elk verschil af tegen de ruis die jouw eigen
 * metingen laten zien, in plaats van elk getal serieus te nemen.
 */

export type MetriekKey =
  | 'weightKg'
  | 'bodyFatPct'
  | 'fatMassKg'
  | 'muscleMassKg'
  | 'boneMassKg'
  | 'proteinPct'
  | 'waterMassKg'
  | 'waterPct'
  | 'visceralFat'

type Meta = {
  label: string
  unit: string
  decimalen: number
  /** hoeveel verschil op één dag fysiologisch mogelijk is */
  aard: 'echt' | 'vocht' | 'traag'
  /** terugval als er nog te weinig metingen zijn om je eigen ruis te bepalen */
  standaardRuis: number
}

export const METRIEKEN: Record<MetriekKey, Meta> = {
  weightKg: { label: 'Gewicht', unit: 'kg', decimalen: 2, aard: 'vocht', standaardRuis: 0.6 },
  bodyFatPct: { label: 'Lichaamsvet', unit: '%', decimalen: 1, aard: 'traag', standaardRuis: 0.4 },
  fatMassKg: { label: 'Vetmassa', unit: 'kg', decimalen: 1, aard: 'traag', standaardRuis: 0.4 },
  muscleMassKg: { label: 'Spiermassa', unit: 'kg', decimalen: 1, aard: 'traag', standaardRuis: 0.6 },
  boneMassKg: { label: 'Botmassa', unit: 'kg', decimalen: 1, aard: 'traag', standaardRuis: 0.2 },
  proteinPct: { label: 'Eiwit', unit: '%', decimalen: 1, aard: 'traag', standaardRuis: 0.2 },
  waterMassKg: { label: 'Watergewicht', unit: 'kg', decimalen: 1, aard: 'vocht', standaardRuis: 0.4 },
  waterPct: { label: 'Lichaamswater', unit: '%', decimalen: 1, aard: 'vocht', standaardRuis: 0.2 },
  visceralFat: { label: 'Visceraal vet', unit: '', decimalen: 1, aard: 'traag', standaardRuis: 0.5 },
}

export const METRIEK_VOLGORDE: MetriekKey[] = [
  'weightKg',
  'bodyFatPct',
  'fatMassKg',
  'muscleMassKg',
  'boneMassKg',
  'proteinPct',
  'waterMassKg',
  'waterPct',
  'visceralFat',
]

const gemiddelde = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

/** Minimum aantal aaneengesloten dagparen voordat een spreiding iets voorstelt. */
const MIN_DAGPAREN = 15

/**
 * Hoe groot een normale dagsprong bij jou is: de standaardafwijking van de
 * verschillen tussen opeenvolgende dagen.
 *
 * Uit je eigen metingen en niet uit een tabel, want dit verschilt per persoon
 * en per weegschaal. Null zolang er te weinig aaneengesloten dagparen zijn --
 * dan is er niets te zeggen en tonen we liever niets dan een drempel die we
 * hebben verzonnen.
 */
export function dagruis(days: DayEntry[], veld: MetriekKey): number | null {
  const punten = weighIns(days)
    .map((d) => ({ date: d.date, waarde: d.body[veld] }))
    .filter((p): p is { date: ISODate; waarde: number } => p.waarde != null)

  const verschillen: number[] = []
  for (let i = 1; i < punten.length; i++) {
    // Alleen aaneengesloten dagen: over een gat van een week zegt een verschil
    // iets heel anders dan over één nacht.
    if (dagenTussen(punten[i - 1].date, punten[i].date) === 1) {
      verschillen.push(punten[i].waarde - punten[i - 1].waarde)
    }
  }
  if (verschillen.length < MIN_DAGPAREN) return null

  const m = gemiddelde(verschillen)
  const sd = Math.sqrt(gemiddelde(verschillen.map((v) => (v - m) ** 2)))
  return Math.round(sd * 1000) / 1000
}

/**
 * Een sprong valt pas op boven twee standaardafwijkingen. Daaronder is het
 * gewoon een dinsdag: bij deze gebruiker is de dagruis op gewicht ongeveer een
 * halve kilo, dus een kilo verschil met gisteren is niets bijzonders.
 */
const OPVALLEND_FACTOR = 2

export const dagenTussen = (van: ISODate, tot: ISODate) =>
  Math.round(
    (new Date(tot + 'T12:00:00').getTime() - new Date(van + 'T12:00:00').getTime()) / 86_400_000,
  )

export type Regel = {
  key: MetriekKey
  label: string
  unit: string
  decimalen: number
  nu: number
  toen: number
  delta: number
  /** meer dan tweemaal je normale dagspreiding */
  opvallend: boolean
  ruis: number
}

export type Vergelijking = {
  datum: ISODate
  vorige: ISODate
  dagenErtussen: number
  regels: Regel[]
  /** dat wat er echt uitspringt, gebruikt voor de conclusie */
  uitschieters: Regel[]
  /** de gemeten dagspreiding op gewicht, om in de uitleg te noemen */
  gewichtRuis: number
}

/**
 * Zet de weging van `datum` naast de vorige nuchtere weging. Geeft null zodra
 * er niets te vergelijken valt.
 */
export function vergelijkWegingen(days: DayEntry[], datum: ISODate): Vergelijking | null {
  const wegingen = weighIns(days)
  const idx = wegingen.findIndex((d) => d.date === datum)
  if (idx < 1) return null

  // Zonder een geschatte dagspreiding weten we niet wat een sprong voorstelt.
  // Dan is zwijgen beter dan negen zelfverzekerde verhalen over ruis.
  const gewichtRuis = dagruis(days, 'weightKg')
  if (gewichtRuis == null) return null

  const nu = wegingen[idx].body
  const toen = wegingen[idx - 1].body

  const regels: Regel[] = []
  for (const key of METRIEK_VOLGORDE) {
    const a = nu[key]
    const b = toen[key]
    if (a == null || b == null) continue
    const ruis = dagruis(days, key)
    if (ruis == null) continue
    const delta = Math.round((a - b) * 100) / 100
    regels.push({
      key,
      label: METRIEKEN[key].label,
      unit: METRIEKEN[key].unit,
      decimalen: METRIEKEN[key].decimalen,
      nu: a,
      toen: b,
      delta,
      ruis,
      opvallend: Math.abs(delta) > ruis * OPVALLEND_FACTOR,
    })
  }
  if (regels.length === 0) return null

  return {
    datum,
    vorige: wegingen[idx - 1].date,
    dagenErtussen: dagenTussen(wegingen[idx - 1].date, datum),
    regels,
    uitschieters: regels.filter((r) => r.opvallend),
    gewichtRuis,
  }
}

const nf = (n: number, d: number) =>
  n.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d })

/**
 * Wat de combinatie van verschillen betekent. Losse getallen zeggen weinig; de
 * vraag is of gewicht en vocht dezelfde kant op bewegen. Doen ze dat, dan is
 * het vocht -- en dat is verreweg de meest voorkomende verklaring voor een
 * sprong op de weegschaal.
 */
export function conclusie(
  v: Vergelijking,
  vorigeDag: DayEntry | undefined,
): { kop: string; tekst: string; toon: 'positive' | 'warning' | 'neutral' } {
  const pak = (k: MetriekKey) => v.regels.find((r) => r.key === k)
  const gewicht = pak('weightKg')
  const waterKg = pak('waterMassKg')
  const waterPct = pak('waterPct')
  const vetPct = pak('bodyFatPct')

  const oorzaken: string[] = []
  if (vorigeDag?.context.alcohol) oorzaken.push('je had alcohol gedronken')
  if (voetbalDag(vorigeDag)) oorzaken.push('je had zaalvoetbal')
  else if (vorigeDag?.workouts.length) oorzaken.push('je had getraind')
  if (vorigeDag?.context.travel) oorzaken.push('het was een reisdag')
  if (vorigeDag?.context.ill) oorzaken.push('je was ziek')
  const staart = oorzaken.length
    ? ` De dag ervoor ${oorzaken.join(' en ')} — dat verschuift makkelijk een kilo vocht.`
    : ''

  // De vaste voetnoot: op deze termijn is het antwoord bijna altijd vocht.
  const vocht =
    'Een halve kilo vet is 3850 kcal, dus die kan er tussen twee ochtenden niet bij of af. Wat je hier ziet bewegen is vocht en glycogeen, ook waar de weegschaal het vetmassa of spiermassa noemt.'

  if (!gewicht) {
    return { toon: 'neutral', kop: 'Geen gewicht om mee te vergelijken', tekst: vocht }
  }

  // Het uitdrogingspatroon: lichter én een hoger vetpercentage. De weegschaal
  // meet via elektrische weerstand, en die loopt op als je vocht kwijt bent --
  // waarna hij een hoger vetpercentage rapporteert zonder dat er iets veranderd
  // is. Dit is precies het geval waarin de cijfers het tegenovergestelde
  // suggereren van wat er gebeurde.
  const droog =
    gewicht.delta < 0 &&
    vetPct != null &&
    vetPct.delta > 0 &&
    (gewicht.opvallend || vetPct.opvallend)
  if (droog) {
    return {
      toon: 'neutral',
      kop: 'Lichter, maar een hoger vetpercentage',
      tekst: `Je woog ${nf(Math.abs(gewicht.delta), 2)} kg minder en tegelijk staat je vetpercentage ${nf(
        Math.abs(vetPct.delta),
        1,
      )} punt hoger. Dat is het uitdrogingspatroon: minder vocht betekent meer weerstand, en daar leest deze weegschaal een hoger vetpercentage uit. Het is geen verlies en geen winst. Kijk naar je trend bij Trends.${staart}`,
    }
  }

  if (v.uitschieters.length === 0) {
    return {
      toon: 'neutral',
      kop: 'Binnen je normale schommeling',
      tekst: `Geen enkel verschil komt boven je gewone dagruis uit — op gewicht is dat bij jou ${nf(
        v.gewichtRuis,
        2,
      )} kg. ${vocht} De richting lees je af aan je trend, niet aan vanochtend.${staart}`,
    }
  }

  const water = waterKg ?? waterPct
  const gewichtSprong = gewicht.opvallend

  if (gewichtSprong && water && Math.sign(water.delta) === Math.sign(gewicht.delta)) {
    const omlaag = gewicht.delta < 0
    return {
      toon: 'neutral',
      kop: omlaag ? 'Vooral vocht kwijt' : 'Vooral vocht erbij',
      tekst: `Je gewicht ging ${nf(Math.abs(gewicht.delta), 2)} kg ${
        omlaag ? 'omlaag' : 'omhoog'
      } en je ${water.label.toLowerCase()} bewoog dezelfde kant op. ${vocht}${staart}`,
    }
  }

  if (gewichtSprong) {
    const omlaag = gewicht.delta < 0
    return {
      toon: 'neutral',
      kop: `Gewicht ${nf(Math.abs(gewicht.delta), 2)} kg ${omlaag ? 'omlaag' : 'omhoog'}`,
      tekst: `Dat is meer dan je gewone dagruis van ${nf(v.gewichtRuis, 2)} kg, maar je vochtwaarden bewegen niet mee. ${vocht} Eén ochtend zegt hier niets over de richting.${staart}`,
    }
  }

  return {
    toon: 'neutral',
    kop: 'Alleen de afgeleide waarden springen',
    tekst: `Je gewicht bleef binnen je normale schommeling; wat eruit springt is ${v.uitschieters
      .map((r) => r.label.toLowerCase())
      .join(', ')}. Die waarden schat de weegschaal uit je vochtgehalte, dus ze bewegen het hardst zonder dat er aan je lichaam iets verandert. ${vocht}${staart}`,
  }
}

/* ------------------------- waar sta je: te veel of te weinig ------------------------- */

export type Oordeel = 'laag' | 'goed' | 'grens' | 'hoog'

export type Peiling = {
  label: string
  waarde: string
  oordeel: Oordeel
  bereik: string
  uitleg: string
}

/**
 * Je huidige waardes tegen de gangbare referentiebereiken. Dit is een
 * niveauvraag en geen dagvraag: waar je stáát verandert niet tussen gisteren en
 * vandaag.
 *
 * De bereiken zijn richtlijnen uit de literatuur en van de fabrikanten van
 * dit soort weegschalen, geen medische norm. Een bio-impedantiemeting wijkt
 * bovendien makkelijk een paar procent af van een echte meting.
 */
export function gemiddeldLichaam(days: DayEntry[], datum: ISODate, dagen = 7): Body | null {
  const grens = new Date(new Date(datum + 'T12:00:00').getTime() - (dagen - 1) * 86_400_000)
  const venster = weighIns(days).filter(
    (d) => d.date <= datum && new Date(d.date + 'T12:00:00') >= grens,
  )
  if (venster.length === 0) return null

  const uit: Body = {}
  for (const key of METRIEK_VOLGORDE) {
    const waarden = venster.map((d) => d.body[key]).filter((v): v is number => v != null)
    if (waarden.length) uit[key] = gemiddelde(waarden)
  }
  return uit
}

/** Hoeveel wegingen er in dat venster zaten — bepaalt of het iets voorstelt. */
export function wegingenInVenster(days: DayEntry[], datum: ISODate, dagen = 7): number {
  const grens = new Date(new Date(datum + 'T12:00:00').getTime() - (dagen - 1) * 86_400_000)
  return weighIns(days).filter((d) => d.date <= datum && new Date(d.date + 'T12:00:00') >= grens)
    .length
}

export function peilingen(body: Body, profile: Profile, datum: ISODate): Peiling[] {
  const uit: Peiling[] = []
  const afgeleid = derivedBody(body, profile)
  const leeftijd = ageAt(profile, datum)
  const man = profile.sex !== 'female'

  const pct = (n: number) => `${nf(n, 1)}%`

  if (body.bodyFatPct != null) {
    // Gallagher e.a., bereiken voor mannen en vrouwen van 20 tot 39 jaar.
    const grenzen = man
      ? { laag: 8, hoog: 20 }
      : { laag: 21, hoog: 33 }
    const v = body.bodyFatPct
    uit.push({
      label: 'Lichaamsvet',
      waarde: pct(v),
      oordeel: v < grenzen.laag ? 'laag' : v >= grenzen.hoog ? 'hoog' : 'goed',
      bereik: `${grenzen.laag}–${grenzen.hoog}%`,
      uitleg:
        v >= grenzen.hoog
          ? 'Boven het gezonde bereik voor je leeftijd. Dit is de knop waar een calorietekort het meeste effect heeft.'
          : v < grenzen.laag
            ? 'Onder het gezonde bereik. Zo laag gaat vaak ten koste van je hormoonhuishouding en herstel.'
            : `Binnen het gezonde bereik voor een ${man ? 'man' : 'vrouw'} van ${leeftijd}.`,
    })
  }

  if (body.visceralFat != null) {
    const v = body.visceralFat
    uit.push({
      label: 'Visceraal vet',
      waarde: nf(v, 1),
      oordeel: v >= 13 ? 'hoog' : v >= 10 ? 'grens' : 'goed',
      bereik: 'onder 13',
      uitleg:
        v >= 13
          ? 'Verhoogd. Dit is het vet rond je organen en het weegt zwaarder voor je gezondheid dan je totale vetpercentage.'
          : v >= 10
            ? 'Nog binnen de marge, maar het kruipt richting de grens van 13. Dit daalt mee als je vetpercentage daalt.'
            : 'Ruim binnen de marge.',
    })
  }

  if (body.waterPct != null) {
    const v = body.waterPct
    const grenzen = man ? { laag: 50, hoog: 65 } : { laag: 45, hoog: 60 }
    uit.push({
      label: 'Lichaamswater',
      waarde: pct(v),
      oordeel: v < grenzen.laag ? 'laag' : v > grenzen.hoog ? 'hoog' : 'goed',
      bereik: `${grenzen.laag}–${grenzen.hoog}%`,
      uitleg:
        v < grenzen.laag
          ? 'Aan de lage kant. Dit hangt samen met hoeveel je drinkt, maar ook met je vetpercentage: vetweefsel houdt minder water vast.'
          : 'Normaal. Dit getal zegt vooral iets over je vochtbalans en schommelt per dag flink.',
    })
  }

  if (body.proteinPct != null) {
    const v = body.proteinPct
    uit.push({
      label: 'Eiwit',
      waarde: pct(v),
      oordeel: v < 16 ? 'laag' : v > 20 ? 'hoog' : 'goed',
      bereik: '16–20%',
      uitleg:
        v < 16
          ? 'Onder het gangbare bereik. Meer eiwit eten en krachttraining zijn hier de twee knoppen.'
          : 'Binnen het gangbare bereik — een teken dat je vetvrije massa er goed bij ligt.',
    })
  }

  if (afgeleid?.ffmi != null) {
    const v = afgeleid.ffmi
    uit.push({
      label: 'Vetvrije massa-index',
      waarde: nf(v, 1),
      oordeel: v < 18 ? 'laag' : v > 22 ? 'hoog' : 'goed',
      bereik: '18–22',
      uitleg:
        v < 18
          ? 'Weinig vetvrije massa voor je lengte. Krachttraining is hier belangrijker dan nog een calorie eraf.'
          : v > 22
            ? 'Veel vetvrije massa voor je lengte — bovengemiddeld voor iemand die niet jarenlang zwaar traint.'
            : 'Normaal tot goed voor je lengte. Dit is het getal om vast te houden terwijl je afvalt.',
    })
  }

  if (body.muscleMassKg != null && body.weightKg != null) {
    // Spiermassa in kilo's zegt weinig zonder je lengte erbij; het aandeel van
    // je gewicht is beter te plaatsen. Voor mannen ligt dat rond 70 tot 80%.
    const aandeel = (body.muscleMassKg / body.weightKg) * 100
    uit.push({
      label: 'Spiermassa',
      waarde: `${nf(body.muscleMassKg, 1)} kg`,
      oordeel: aandeel < 70 ? 'laag' : aandeel > 84 ? 'hoog' : 'goed',
      bereik: '70–84% van je gewicht',
      uitleg:
        aandeel < 70
          ? `${nf(aandeel, 0)}% van je gewicht. Aan de lage kant — krachttraining weegt hier zwaarder dan nog een calorie eraf.`
          : `${nf(aandeel, 0)}% van je gewicht, binnen het gangbare bereik. Dit is wat je wilt vasthouden terwijl je afvalt.`,
    })
  }

  return uit
}

/**
 * Aanbevelingen volgen uit waar je staat en welke kant je trend op gaat --
 * nooit uit het verschil van één dag, want daar zit niets in om op te sturen.
 */
export function aanbevelingen(peiling: Peiling[], body: Body, profile: Profile): string[] {
  const uit: string[] = []
  const vind = (l: string) => peiling.find((p) => p.label === l)

  const vet = vind('Lichaamsvet')
  const visceraal = vind('Visceraal vet')
  const water = vind('Lichaamswater')
  const eiwit = vind('Eiwit')
  const ffmi = vind('Vetvrije massa-index')

  if (visceraal?.oordeel === 'hoog') {
    uit.push(
      'Zet visceraal vet bovenaan. Dat daalt met een calorietekort en met regelmatig duurwerk; het reageert daar zelfs sneller op dan je totale vetpercentage.',
    )
  }
  if (vet?.oordeel === 'hoog') {
    const teGaan = body.weightKg != null ? body.weightKg - profile.targetWeightKg : null
    uit.push(
      `Je vetpercentage is de knop, niet je gewicht${
        teGaan != null && teGaan > 0 ? ` — je zit ${nf(teGaan, 1)} kg boven je streefgewicht` : ''
      }. Een tekort van 400 tot 550 kcal per dag houdt het tempo op ongeveer een halve kilo per week zonder je spiermassa aan te tasten.`,
    )
  }
  if (ffmi?.oordeel === 'laag' || eiwit?.oordeel === 'laag') {
    uit.push(
      'Twee keer per week krachttraining en genoeg eiwit zijn samen de belangrijkste rem op spierverlies tijdens een tekort. Voor jouw gewicht komt dat neer op ruwweg 1,6 tot 2,2 gram eiwit per kilo per dag.',
    )
  }
  if (water?.oordeel === 'laag') {
    uit.push(
      'Je waterpercentage ligt laag. Meer drinken helpt, maar dit getal stijgt vooral vanzelf als je vetpercentage daalt — vetweefsel bevat nu eenmaal minder water.',
    )
  }
  if (vet?.oordeel === 'goed' && ffmi?.oordeel !== 'laag') {
    uit.push(
      'Je samenstelling ligt er goed bij. Vasthouden wat je doet is hier zinvoller dan een strenger tekort: dat kost meestal spiermassa.',
    )
  }
  return uit
}
