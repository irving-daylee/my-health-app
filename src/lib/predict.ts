import type { DayEntry, ISODate } from '../types'
import { balance, shiftISO, weighIns } from './derive'

const KCAL_PER_KG = 7700
/** Over hoeveel dagen we de lijn door je wegingen leggen. */
const VENSTER = 14

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const dagNummer = (d: ISODate) => new Date(d + 'T12:00:00').getTime() / 86_400_000

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
    .filter((d) => d.date !== from)
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

  const level = lijn(dagNummer(from))
  const expected = lijn(dagNummer(doel)) + (balancePart ?? 0)
  const af = (n: number) => Math.round(n * 100) / 100

  return {
    date: doel,
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
