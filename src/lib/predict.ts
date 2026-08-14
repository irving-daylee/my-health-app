import type { DayEntry, ISODate } from '../types'
import { balance, shiftISO, weighIns } from './derive'

const KCAL_PER_KG = 7700
/** Over hoeveel dagen we de lijn door je wegingen leggen. */
const VENSTER = 14

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const dagNummer = (d: ISODate) => new Date(d + 'T12:00:00').getTime() / 86_400_000

/**
 * Kleinste-kwadratenfit met de normaalvergelijkingen, opgelost via Gauss-Jordan.
 * Levert naast de coëfficiënten hun standaardfout, want een schatting zonder
 * onzekerheid is hier niet bruikbaar: we willen juist weten wat we níet mogen
 * geloven. Geeft null als het stelsel niet op te lossen is — twee vlaggen die
 * altijd samen aan staan zijn niet uit elkaar te trekken.
 */
function kleinsteKwadraten(X: number[][], y: number[]): { coef: number[]; se: number[] } | null {
  const n = X.length
  const k = X[0].length
  if (n <= k + 1) return null

  // XtX naast de eenheidsmatrix zetten; na vegen staat links de eenheidsmatrix
  // en rechts de inverse, die we voor de standaardfouten nodig hebben.
  const A = Array.from({ length: k }, (_, i) =>
    Array.from({ length: 2 * k }, (_, j) =>
      j < k ? X.reduce((s, r) => s + r[i] * r[j], 0) : j - k === i ? 1 : 0,
    ),
  )
  const Xty = Array.from({ length: k }, (_, i) => X.reduce((s, r, t) => s + r[i] * y[t], 0))

  for (let c = 0; c < k; c++) {
    let pivot = c
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r
    if (Math.abs(A[pivot][c]) < 1e-10) return null
    ;[A[c], A[pivot]] = [A[pivot], A[c]]
    const d = A[c][c]
    for (let j = 0; j < 2 * k; j++) A[c][j] /= d
    for (let r = 0; r < k; r++) {
      if (r === c) continue
      const f = A[r][c]
      if (f === 0) continue
      for (let j = 0; j < 2 * k; j++) A[r][j] -= f * A[c][j]
    }
  }

  const inv = A.map((r) => r.slice(k))
  const coef = inv.map((r) => r.reduce((s, v, j) => s + v * Xty[j], 0))
  const rss = y.reduce((s, yi, t) => {
    const voorspeld = X[t].reduce((sum, v, j) => sum + v * coef[j], 0)
    return s + (yi - voorspeld) ** 2
  }, 0)
  const sigma2 = rss / (n - k)
  return { coef, se: inv.map((r, i) => Math.sqrt(Math.max(0, sigma2 * r[i]))) }
}

/** Een effect dat de app uit jouw eigen wegingen heeft geleerd. */
export type Effect = {
  key: 'alcohol' | 'voetbal' | 'kracht' | 'ziek'
  label: string
  /** hoeveel kg dit de ochtend erna gemiddeld scheelt bij jou */
  kg: number
  /** aantal dagen mét deze vlag waar dit op rust */
  days: number
}

const FACTOREN: { key: Effect['key']; label: string; op: (d: DayEntry) => boolean }[] = [
  { key: 'alcohol', label: 'Alcohol', op: (d) => d.context.alcohol === true },
  {
    key: 'voetbal',
    label: 'Zaalvoetbal',
    op: (d) =>
      d.context.football === true ||
      d.workouts.some((w) => w.type === 'zaalvoetbal' || w.type === 'training'),
  },
  {
    key: 'kracht',
    label: 'Krachttraining',
    op: (d) => d.workouts.some((w) => w.type === 'krachttraining'),
  },
  { key: 'ziek', label: 'Ziek', op: (d) => d.context.ill === true },
]

/**
 * Wat een biertje of een avond zaalvoetbal bij *jou* op de weegschaal doet, de
 * ochtend erna. Geen coëfficiënten uit een studie: het verschil tussen de dagen
 * mét en de dagen zonder, in jouw eigen wegingen.
 *
 * De maat is de afwijking van elke weging ten opzichte van de wegingen die
 * eraan voorafgingen. Alle factoren worden in één regressie tegelijk geschat, zodat een
 * biertje op de avond na zaalvoetbal niet twee keer wordt geteld — stuk voor
 * stuk rekenen schrijft zulke samenvallende gewoontes aan allebei toe.
 *
 * Het effect wordt naar nul getrokken zolang er weinig dagen zijn (`n/(n+5)`),
 * en het haalt de lijst alleen als het zijn eigen standaardfout ruim overstijgt.
 * Met zes keer alcohol weet je nog niet half zo zeker wat het doet als met
 * dertig keer, en dat hoort in het getal terug te komen in plaats van in een
 * voetnoot.
 *
 * Wat dit niet is: een oorzaak. Dit is wat er bij jou samenvalt, gemeten op een
 * handvol dagen. Twee sterretjes in de statistiek maken van een gewoonte nog
 * geen mechanisme.
 */
export function learnEffects(days: DayEntry[], upto: ISODate): Effect[] {
  // Niets van na `upto` meenemen: anders leert de terugtoets van de toekomst en
  // klopt hij zichzelf rijk.
  const tot = days.filter((d) => d.date <= upto)
  const perDatum = new Map(tot.map((d) => [d.date, d]))
  const wegingen = weighIns(tot)

  // De weging van vanochtend hoort bij de dag ervoor: wat je gisteren deed zie
  // je vandaag op de weegschaal.
  //
  // Waar leggen we die weging naast? Niet naast het voortschrijdend gemiddelde:
  // dat telt de weging zelf mee, dus een zevende van het effect dat we zoeken
  // zit al in de meetlat verwerkt en meten we structureel te laag. De basislijn
  // is daarom het gemiddelde van de wegingen ervóór. Die ligt door je trend een
  // vast stukje hoger of lager, maar dat is voor alle dagen gelijk en vangt de
  // constante in de regressie op.
  const waarnemingen = wegingen
    .map((d, i) => {
      const eerder = wegingen.slice(Math.max(0, i - 6), i)
      const vorige = perDatum.get(shiftISO(d.date, -1))
      if (eerder.length < 3 || !vorige) return null
      const basis = mean(eerder.map((e) => e.body.weightKg!))
      return { rest: d.body.weightKg! - basis, vorige }
    })
    .filter((w): w is { rest: number; vorige: DayEntry } => w != null)

  if (waarnemingen.length < 20) return []

  // Alleen factoren die vaak genoeg beide kanten op gaan; een vlag die altijd
  // aan staat of maar twee keer voorkomt valt niet van de rest te scheiden.
  const bruikbaar = FACTOREN.filter((f) => {
    const met = waarnemingen.filter((w) => f.op(w.vorige)).length
    return met >= 5 && waarnemingen.length - met >= 5
  })
  if (bruikbaar.length === 0) return []

  // Alle factoren in één keer schatten, niet stuk voor stuk. Drink je vooral op
  // de avond na zaalvoetbal, dan zou apart rekenen het biertje deels aan de
  // sport toeschrijven en andersom; samen schatten deelt het toe aan wat het
  // beste verklaart. De eerste kolom is een constante, die de rest opvangt van
  // wat er systematisch in de residuen zit.
  const X = waarnemingen.map((w) => [1, ...bruikbaar.map((f) => (f.op(w.vorige) ? 1 : 0))])
  const y = waarnemingen.map((w) => w.rest)
  const fit = kleinsteKwadraten(X, y)
  if (!fit) return []

  const out: Effect[] = []
  bruikbaar.forEach((factor, i) => {
    const coef = fit.coef[i + 1]
    const fout = fit.se[i + 1]
    // Alleen effecten die hun eigen onzekerheid ruim overstijgen. De rest is
    // ruis met een naam, en die op je scherm zetten is erger dan zwijgen.
    if (!Number.isFinite(fout) || fout === 0 || Math.abs(coef) < 2 * fout) return

    const dagen = waarnemingen.filter((w) => factor.op(w.vorige)).length
    const krimp = dagen / (dagen + 5)
    const kg = Math.round(coef * krimp * 100) / 100
    // Onder de vijftig gram maakt het voor je weging niets uit.
    if (Math.abs(kg) < 0.05) return
    out.push({ key: factor.key, label: factor.label, kg, days: dagen })
  })
  return out.sort((a, b) => Math.abs(b.kg) - Math.abs(a.kg))
}

export type WeightPrediction = {
  /** de ochtend waarvoor dit geldt */
  date: ISODate
  /** verwachte weging in kg */
  expected: number
  /** band waarbinnen je weging normaal gesproken valt */
  low: number
  high: number
  /** je huidige niveau volgens de lijn, ontdaan van dagruis */
  level: number
  /** wat de lijn er van vandaag op morgen bij doet, in kg */
  trendPart: number
  /** correctie voor hoe vandaag afwijkt van je gemiddelde dag, in kg */
  balancePart: number | null
  /** wat vandaag verder nog telt: alcohol, zaalvoetbal — geleerd uit je eigen data */
  effects: Effect[]
  /** typische dagruis: hoe ver een losse weging normaal van de lijn afligt */
  noise: number
  /** aantal wegingen waar dit op rust */
  basis: number
}

/**
 * Wat de weegschaal morgenochtend waarschijnlijk aanwijst.
 *
 * De basis is een rechte lijn door je wegingen van de afgelopen twee weken,
 * doorgetrokken naar morgen. Bewust niet het 7-daags gemiddelde dat de app
 * verder overal toont: dat gemiddelde loopt een paar dagen achter — het is het
 * midden van het venster erachter — en dat is precies de fout die je niet wilt
 * als je vooruit rekent. Val je een ons per dag af, dan zou het gemiddelde je
 * morgen structureel drie ons te zwaar voorspellen.
 *
 * Daar komt bij wat de lijn nog niet kan weten: at je vandaag meer of minder
 * dan je gemiddelde dag, dan telt alleen dat *verschil* mee. Het gemiddelde
 * zelf zit al in de helling verwerkt, dus dat er nog eens bij optellen zou
 * dubbelop zijn.
 *
 * De band eromheen is geen slag om de arm maar het eigenlijke antwoord. Wat de
 * weegschaal 's ochtends aanwijst is voor een groot deel vocht: zout, glycogeen
 * na een zware training, een biertje, hoe laat je at. Dat is al gauw enkele
 * honderden grammen op en neer, terwijl het echte vetverschil van één dag
 * zelden boven de honderd gram komt. De breedte komt daarom uit jouw eigen
 * wegingen: hoe ver die normaal van de lijn liggen.
 */
export function predictNextWeight(days: DayEntry[], from: ISODate): WeightPrediction | null {
  const punten = weighIns(days)
    .filter((d) => d.date <= from)
    .map((d) => ({ x: dagNummer(d.date), y: d.body.weightKg! }))
  const recent = punten.filter((p) => p.x > dagNummer(from) - VENSTER)
  // Vier wegingen over minstens een week: minder is geen lijn maar een gok.
  if (recent.length < 4) return null

  const x = recent.map((p) => p.x)
  const y = recent.map((p) => p.y)
  if (x[x.length - 1] - x[0] < 7) return null

  const mx = mean(x)
  const my = mean(y)
  const noemer = x.reduce((s, xi) => s + (xi - mx) ** 2, 0)
  if (noemer === 0) return null
  const helling = x.reduce((s, xi, i) => s + (xi - mx) * (y[i] - my), 0) / noemer
  const lijn = (dag: number) => my + helling * (dag - mx)

  const doel = shiftISO(from, 1)
  const laatsteWeging = x[x.length - 1]
  // Is je laatste weging al een tijd geleden, dan wordt doortrekken gokken.
  if (dagNummer(doel) - laatsteWeging > 7) return null

  // Alleen de dag waar we vandaan rekenen kan nog niet in de lijn zitten.
  const vandaag = days.find((d) => d.date === from)
  const vandaagBalans = vandaag ? balance(vandaag) : null
  const eerdereBalansen = days
    .filter((d) => d.date < from)
    .map(balance)
    .filter((b): b is number => b != null)
  const balancePart =
    vandaagBalans != null && eerdereBalansen.length >= 3
      ? (vandaagBalans - mean(eerdereBalansen)) / KCAL_PER_KG
      : null

  // De spreiding rond de lijn, en alleen binnen het venster waarop die lijn is
  // gefit: wegingen van een maand terug liggen ver van deze lijn omdat je toen
  // een ander gewicht had, niet omdat je dagruis zo groot is.
  const restanten = recent.map((p) => p.y - lijn(p.x))
  if (restanten.length < 5) return null
  // Delen door n−2: de lijn is zelf uit deze punten getrokken en ligt er dus per
  // constructie dichterbij dan bij een volgende weging het geval zal zijn.
  const spreiding = Math.sqrt(
    restanten.reduce((s, r) => s + r * r, 0) / (restanten.length - 2),
  )
  // Minstens 200 gram: bij weinig wegingen komt de spreiding onrealistisch laag
  // uit, en dan suggereert de band een zekerheid die er niet is.
  const noise = Math.max(spreiding, 0.2)

  // Wat je vandaag hebt gedaan zie je morgenochtend op de weegschaal.
  const effects = vandaag
    ? learnEffects(days, from).filter((e) => FACTOREN.find((f) => f.key === e.key)!.op(vandaag))
    : []

  const level = lijn(dagNummer(from))
  const expected =
    lijn(dagNummer(doel)) + (balancePart ?? 0) + effects.reduce((s, e) => s + e.kg, 0)
  const af = (n: number) => Math.round(n * 100) / 100

  return {
    date: doel,
    effects,
    expected: af(expected),
    low: af(expected - noise),
    high: af(expected + noise),
    level: af(level),
    trendPart: af(helling),
    balancePart: balancePart == null ? null : af(balancePart),
    noise: af(noise),
    basis: restanten.length,
  }
}

/** De uitkomst van het nakijken: hoe goed bleek de voorspelling achteraf? */
export type PredictionCheck = {
  /** aantal wegingen waarop is nagekeken */
  n: number
  /** gemiddelde misser in kg, zonder op richting te letten */
  mae: number
  /** systematische misser: positief = de app voorspelt je structureel te zwaar */
  bias: number
  /** aandeel wegingen dat binnen de band viel; bij een eerlijke band ~0,68 */
  coverage: number
  /** dezelfde misser voor 'morgen weeg je wat je vandaag woog' */
  naiveMae: number
}

/**
 * Kijkt de voorspelling na op je eigen historie. Voor elke weging rekenen we uit
 * wat de app de dag ervoor voorspeld zou hebben — en dan alleen met de gegevens
 * die op dát moment bestonden, dus de weging zelf en alles erna doen niet mee.
 * Anders kijkt het model naar het antwoord terwijl het de som maakt.
 *
 * Naast de eigen misser staat de simpelst denkbare voorspelling: morgen weeg je
 * wat je vandaag woog. Als de app het daar niet van wint, is alle rekenarij
 * versiering.
 */
export function backtest(days: DayEntry[]): PredictionCheck | null {
  const wegingen = weighIns(days)
  const missers: number[] = []
  const getekend: number[] = []
  const naief: number[] = []
  let binnenBand = 0

  for (let i = 1; i < wegingen.length; i++) {
    const echt = wegingen[i]
    const vorige = wegingen[i - 1]
    const dagErvoor = shiftISO(echt.date, -1)
    // Alleen aaneengesloten dagen: over een gat van vier dagen voorspelt de app
    // niet, dus daar moet ze ook niet op afgerekend worden.
    if (vorige.date !== dagErvoor) continue

    const bekend = days.filter((d) => d.date <= dagErvoor)
    const p = predictNextWeight(bekend, dagErvoor)
    if (!p) continue

    const werkelijk = echt.body.weightKg!
    missers.push(Math.abs(p.expected - werkelijk))
    getekend.push(p.expected - werkelijk)
    naief.push(Math.abs(vorige.body.weightKg! - werkelijk))
    if (werkelijk >= p.low && werkelijk <= p.high) binnenBand++
  }

  if (missers.length < 10) return null
  const af = (n: number) => Math.round(n * 100) / 100
  return {
    n: missers.length,
    mae: af(mean(missers)),
    bias: af(mean(getekend)),
    coverage: Math.round((binnenBand / missers.length) * 100) / 100,
    naiveMae: af(mean(naief)),
  }
}
