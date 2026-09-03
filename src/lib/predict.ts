import type { DayEntry, ISODate } from '../types'
import { balance, shiftISO, voetbalDag, weighIns } from './derive'

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
  key: 'alcohol' | 'voetbal' | 'naVoetbal' | 'kracht' | 'ziek'
  label: string
  /** hoeveel kg dit de ochtend erna gemiddeld scheelt bij jou */
  kg: number
  /** aantal dagen mét deze vlag waar dit op rust */
  days: number
}

/**
 * Waar een factor naar kijkt. `gisteren` is de dag voor de weging — wat je
 * gisteren deed zie je vanochtend. `eergisteren` is er voor effecten die een
 * dag later pas komen: de terugslag na zaalvoetbal is niet de ochtend erna maar
 * die daarna, als het vocht en glycogeen weer aangevuld zijn.
 */
type Dagen = { gisteren: DayEntry; eergisteren?: DayEntry }

const FACTOREN: { key: Effect['key']; label: string; op: (d: Dagen) => boolean }[] = [
  { key: 'alcohol', label: 'Alcohol', op: (d) => d.gisteren.context.alcohol === true },
  { key: 'voetbal', label: 'Zaalvoetbal', op: (d) => voetbalDag(d.gisteren) },
  {
    key: 'naVoetbal',
    label: 'Dag na zaalvoetbal',
    // De tweede ochtend: gisteren was zelf de dag na de wedstrijd. Dit is de
    // terugslag, en die hoort apart geteld — anders middelt hij weg tegen de dip.
    //
    // Een voetbaldag wordt niet uitgesloten: bij twee wedstrijden achter elkaar
    // gelden beide vlaggen, en de regressie telt hun effecten dan gewoon bij
    // elkaar op. Dat is precies wat er die ochtend ook gebeurt.
    op: (d) => voetbalDag(d.eergisteren),
  },
  {
    key: 'kracht',
    label: 'Krachttraining',
    op: (d) => d.gisteren.workouts.some((w) => w.type === 'krachttraining'),
  },
  { key: 'ziek', label: 'Ziek', op: (d) => d.gisteren.context.ill === true },
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
      const gisteren = perDatum.get(shiftISO(d.date, -1))
      if (eerder.length < 3 || !gisteren) return null
      const basis = mean(eerder.map((e) => e.body.weightKg!))
      const dagen: Dagen = { gisteren, eergisteren: perDatum.get(shiftISO(d.date, -2)) }
      return { rest: d.body.weightKg! - basis, dagen }
    })
    .filter((w): w is { rest: number; dagen: Dagen } => w != null)

  if (waarnemingen.length < 20) return []

  // Alleen factoren die vaak genoeg beide kanten op gaan; een vlag die altijd
  // aan staat of maar twee keer voorkomt valt niet van de rest te scheiden.
  const bruikbaar = FACTOREN.filter((f) => {
    const met = waarnemingen.filter((w) => f.op(w.dagen)).length
    return met >= 5 && waarnemingen.length - met >= 5
  })
  if (bruikbaar.length === 0) return []

  // Alle factoren in één keer schatten, niet stuk voor stuk. Drink je vooral op
  // de avond na zaalvoetbal, dan zou apart rekenen het biertje deels aan de
  // sport toeschrijven en andersom; samen schatten deelt het toe aan wat het
  // beste verklaart. De eerste kolom is een constante, die de rest opvangt van
  // wat er systematisch in de residuen zit.
  const X = waarnemingen.map((w) => [1, ...bruikbaar.map((f) => (f.op(w.dagen) ? 1 : 0))])
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

    const dagen = waarnemingen.filter((w) => factor.op(w.dagen)).length
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
  /** je niveau nu volgens de lijn, ontdaan van dagruis */
  level: number
  /** het stuk van je laatste weging dat naar verwachting blijft hangen, in kg */
  carryPart: number | null
  /** welk deel van een afwijking bij jou een dag later nog over is (0-0,8) */
  carryShare: number
  /** je trend in kg per week — context, geen onderdeel van de verwachting */
  trendPerWeek: number
  /** correctie voor hoe vandaag afwijkt van je gemiddelde dag, in kg */
  balancePart: number | null
  /** wat vandaag verder nog telt: alcohol, zaalvoetbal — geleerd uit je eigen data */
  effects: Effect[]
  /** hoe ver deze voorspelling er in het verleden gemiddeld naast zat (spreiding) */
  noise: number
  /** aantal wegingen waar dit op rust */
  basis: number
}

/** Niveau en helling uit een kleinste-kwadratenfit, gemeten op de laatste dag. */
function niveauEnHelling(punten: { x: number; y: number }[]) {
  const x = punten.map((p) => p.x)
  const y = punten.map((p) => p.y)
  const mx = mean(x)
  const my = mean(y)
  const noemer = x.reduce((s, xi) => s + (xi - mx) ** 2, 0)
  if (noemer === 0) return null
  const helling = x.reduce((s, xi, i) => s + (xi - mx) * (y[i] - my), 0) / noemer
  const laatste = x[x.length - 1]
  return { niveau: my + helling * (laatste - mx), helling }
}

/**
 * Elke dag uit je historie waarvoor we destijds een voorspelling hadden kunnen
 * doen: het niveau van dat moment, de weging van die dag, en wat de weegschaal
 * de ochtend erna werkelijk aanwees. Hiermee valt zowel te kiezen hoe zwaar de
 * weging van vandaag moet meetellen als hoe breed de band hoort te zijn.
 */
function oefenrondes(punten: { x: number; y: number }[]) {
  const uit: { niveau: number; vandaag: number; morgen: number }[] = []
  for (let i = 0; i < punten.length - 1; i++) {
    if (punten[i + 1].x - punten[i].x !== 1) continue
    const venster = punten.filter((p) => p.x > punten[i].x - VENSTER && p.x <= punten[i].x)
    if (venster.length < 4 || venster[venster.length - 1].x - venster[0].x < 7) continue
    const f = niveauEnHelling(venster)
    if (!f) continue
    uit.push({ niveau: f.niveau, vandaag: punten[i].y, morgen: punten[i + 1].y })
  }
  return uit
}

/**
 * Hoeveel van een afwijking blijft er bij jou een dag later nog over? Sta je
 * vanochtend een halve kilo boven je niveau, dan is dat morgen zelden helemaal
 * verdwenen: vocht en darminhoud verlopen over dagen, niet over uren.
 *
 * We meten dat niet aan de samenhang tussen opeenvolgende afwijkingen maar aan
 * wat het in voorspellen oplevert: welk aandeel had je eigen wegingen het beste
 * voorspeld? Dat scheelt, want een afwijking ten opzichte van een lijn over een
 * lange periode bevat ook echte niveauverschuivingen — een blessure, een
 * verhuizing — en die zouden het aandeel kunstmatig richting één duwen.
 *
 * Het dal is breed: tussen 0,4 en 0,7 maakt het nauwelijks verschil. Vandaar
 * een grof raster; net doen alsof we dit op twee decimalen weten zou de
 * nauwkeurigheid overdrijven.
 */
function besteAandeel(rondes: { niveau: number; vandaag: number; morgen: number }[]): number {
  let beste = 0.5
  let besteFout = Infinity
  for (let share = 0; share <= 0.9; share += 0.1) {
    const fout = mean(
      rondes.map((r) => Math.abs(r.niveau + share * (r.vandaag - r.niveau) - r.morgen)),
    )
    if (fout < besteFout) {
      besteFout = fout
      beste = share
    }
  }
  return Math.round(beste * 10) / 10
}

/**
 * Wat de weegschaal morgenochtend waarschijnlijk aanwijst.
 *
 * Twee dingen bepalen het getal. Je niveau — een lijn door je wegingen van de
 * afgelopen twee weken, wat er overblijft als je de dagruis wegdenkt. En het
 * deel van je laatste weging dat naar verwachting blijft hangen: stond je
 * vanochtend een halve kilo hoog, dan is daar morgen meestal nog iets van over.
 *
 * Wat er bewust *niet* in zit is je trend. Dat lijkt tegennatuurlijk, maar over
 * één dag is die trend vrijwel niets waard: een stevig tempo van een halve kilo
 * per week is 0,07 kg per dag, en dat verdwijnt volledig in de onzekerheid
 * waarmee je die helling überhaupt meet. Je koopt een verwaarloosbare correctie
 * met een flinke schatfout. Op de historie van deze app gemeten maakte het de
 * voorspelling telkens slechter, hoe hard we de helling ook krompen. De trend
 * blijft wel staan als informatie — voor de vraag waar je over een maand staat
 * is hij juist het enige dat telt.
 *
 * De band komt niet uit de spreiding rond de lijn maar uit de fouten die deze
 * voorspelling in het verleden echt maakte. Dat scheelt: een band gebouwd op de
 * spreiding rond de lijn is te krap, want hij vergeet dat het niveau van morgen
 * zelf ook nog onzeker is.
 */
export function predictNextWeight(days: DayEntry[], from: ISODate): WeightPrediction | null {
  const alle = weighIns(days)
    .filter((d) => d.date <= from)
    .map((d) => ({ x: dagNummer(d.date), y: d.body.weightKg! }))
  const recent = alle.filter((p) => p.x > dagNummer(from) - VENSTER)
  // Vier wegingen over minstens een week: minder is geen lijn maar een gok.
  if (recent.length < 4) return null
  if (recent[recent.length - 1].x - recent[0].x < 7) return null

  const fit = niveauEnHelling(recent)
  if (!fit) return null

  const doel = shiftISO(from, 1)
  const laatste = recent[recent.length - 1]
  // Is je laatste weging al een tijd geleden, dan wordt doortrekken gokken.
  if (dagNummer(doel) - laatste.x > 7) return null

  // Hoeveel van de weging van vandaag blijft er morgen hangen, en hoe ver zit
  // deze voorspelling er bij jou normaal naast? Allebei uit dezelfde oefening:
  // wat zou dit recept in je eigen historie hebben gedaan?
  const rondes = oefenrondes(alle)
  if (rondes.length < 10) return null
  const share = besteAandeel(rondes)

  // Persistentie dooft uit: van twee dagen terug is nog maar het kwadraat over.
  const gat = dagNummer(doel) - laatste.x
  const carryShare = share ** gat
  const carryPart = carryShare * (laatste.y - fit.niveau)

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

  // Wat je vandaag hebt gedaan zie je morgenochtend op de weegschaal.
  const gisteren = days.find((d) => d.date === shiftISO(from, -1))
  const effects = vandaag
    ? learnEffects(days, from).filter((e) =>
        FACTOREN.find((f) => f.key === e.key)!.op({ gisteren: vandaag, eergisteren: gisteren }),
      )
    : []

  const noise = bandbreedte(rondes, share)

  const expected =
    fit.niveau + carryPart + (balancePart ?? 0) + effects.reduce((s, e) => s + e.kg, 0)
  const af = (n: number) => Math.round(n * 100) / 100

  return {
    date: doel,
    effects,
    expected: af(expected),
    low: af(expected - noise),
    high: af(expected + noise),
    level: af(fit.niveau),
    carryPart: af(carryPart),
    carryShare: Math.round(carryShare * 100) / 100,
    trendPerWeek: af(fit.helling * 7),
    balancePart: balancePart == null ? null : af(balancePart),
    noise: af(noise),
    basis: alle.length,
  }
}

/**
 * De spreiding van de fouten die deze voorspelling in het verleden maakte. Dit
 * is wat de band eerlijk maakt: niet hoe dicht de lijn bij je oude wegingen
 * ligt, maar hoe ver de voorspelling er de volgende ochtend naast bleek te
 * zitten. Een band op de eerste maat is stelselmatig te krap — hij vergeet dat
 * het niveau van morgen zelf ook nog onzeker is.
 */
function bandbreedte(
  rondes: { niveau: number; vandaag: number; morgen: number }[],
  share: number,
): number {
  const fouten = rondes.map((r) => r.morgen - (r.niveau + share * (r.vandaag - r.niveau)))
  const m = mean(fouten)
  const sd = Math.sqrt(mean(fouten.map((f) => (f - m) ** 2)))
  // Minstens 200 gram: bij weinig wegingen komt de spreiding onrealistisch laag
  // uit, en dan suggereert de band een zekerheid die er niet is.
  return Math.max(sd, 0.2)
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
