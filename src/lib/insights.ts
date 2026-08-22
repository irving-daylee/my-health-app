import type { DayEntry, Profile } from '../types'
import {
  afgeslotenDagen,
  burned,
  laatsteDagen,
  logPeriode,
  lastMealMinutes,
  intakeKcal,
  intakeProtein,
  sleepHours,
  weighIns,
  weightTrend,
  workoutMinutes,
} from './derive'

export type Insight = {
  tag: 'positive' | 'warning' | 'neutral'
  tagText: string
  title: string
  body: string
}

export type Section = { title: string; insights: Insight[] }

/** Ongeveer 7700 kcal per kilo lichaamsvet — de standaard vuistregel. */
const KCAL_PER_KG = 7700

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const stdev = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d
const nf = (n: number, d = 1) => round(n, d).toLocaleString('nl-NL')
const s = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Over hoeveel weken rekenen we een 'per week'-cijfer uit?
 *
 * Niet over alle dagen die je in de app hebt staan. Importeer je een jaar aan
 * wegingen uit je weegschaal, dan komen daar honderden dagen bij zonder ook maar
 * een training erin — en dan zou 'twee keer per week' vanzelf verwateren tot
 * 'nul komma twee keer per week', zonder dat je iets anders bent gaan doen.
 *
 * Daarom rekenen we over het bereik waarin je dit onderdeel daadwerkelijk hebt
 * bijgehouden: van de eerste tot de laatste dag met een invoer. Dat is het
 * venster waarover de uitspraak geldt, en dat hoort er ook bij te staan.
 */
function periode(dagen: DayEntry[]) {
  if (dagen.length === 0) return null
  const eerste = dagen[0].date
  const laatste = dagen[dagen.length - 1].date
  const spanDagen =
    (new Date(laatste + 'T12:00:00').getTime() - new Date(eerste + 'T12:00:00').getTime()) /
      86_400_000 +
    1
  return { weken: Math.max(spanDagen / 7, 1), dagen: Math.round(spanDagen), gelogd: dagen.length }
}

/** Bedtijden na middernacht doortellen, zodat 00:30 naast 23:45 valt en niet 23 uur ervan af. */
function bedtimeMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  const mins = h * 60 + m
  return mins < 12 * 60 ? mins + 24 * 60 : mins
}

/** kg per week, uit de helling van het voortschrijdend gemiddelde. */
/**
 * Het tempo van je huidige lijn, niet van je hele geschiedenis. Over een
 * geimporteerde weeggeschiedenis van meer dan een jaar middelt elke beweging
 * zichzelf weg en luidt de uitkomst "je gewicht staat stil", ook als je al
 * weken daalt.
 */
const TREND_VENSTER_DAGEN = 42

function trendSlopePerWeek(days: DayEntry[]): number | null {
  const t = laatsteDagen(weightTrend(days), TREND_VENSTER_DAGEN)
  if (t.length < 4) return null
  const first = t[0]
  const last = t[t.length - 1]
  const spanDays =
    (new Date(last.date + 'T12:00:00').getTime() - new Date(first.date + 'T12:00:00').getTime()) /
    86_400_000
  if (spanDays < 7) return null
  return ((last.value - first.value) / spanDays) * 7
}

export function generateInsights(days: DayEntry[], profile: Profile): Section[] {
  return [
    { title: 'Gewicht', insights: weightInsights(days, profile) },
    { title: 'Energie en voeding', insights: nutritionInsights(days) },
    { title: 'Gewoontes', insights: habitInsights(days, profile) },
  ].filter((sec) => sec.insights.length > 0)
}

/* ------------------------------ gewicht ------------------------------ */

function weightInsights(days: DayEntry[], profile: Profile): Insight[] {
  const out: Insight[] = []
  const trend = weightTrend(days)
  if (trend.length < 2) return out

  const current = trend[trend.length - 1].value
  const slope = trendSlopePerWeek(days)
  const toGo = current - profile.targetWeightKg

  if (slope != null && Math.abs(slope) >= 0.1) {
    const losing = slope < 0
    const helping = losing === toGo > 0
    out.push({
      tag: helping ? 'positive' : 'warning',
      tagText: 'Trend',
      title: `${losing ? '−' : '+'}${nf(Math.abs(slope), 2)} kg per week`,
      body: `Je voortschrijdend gemiddelde staat op ${nf(current, 1)} kg en ${
        losing ? 'daalt' : 'stijgt'
      } gestaag. Dat is de lijn om op te sturen — losse wegingen schommelen makkelijk een kilo door vocht en darminhoud.`,
    })

    if (helping && Math.abs(toGo) > 0.3) {
      const weeks = Math.abs(toGo / slope)
      if (weeks < 130) {
        const eta = new Date()
        eta.setDate(eta.getDate() + Math.round(weeks * 7))
        out.push({
          tag: 'neutral',
          tagText: 'Prognose',
          title: `Streefgewicht rond ${eta.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}`,
          body: `Nog ${nf(Math.abs(toGo), 1)} kg te gaan. Op dit tempo is dat ongeveer ${s(
            Math.round(weeks),
            'week',
            'weken',
          )}. Een rechte lijn doortrekken is optimistisch — het tempo zakt bijna altijd naarmate je dichterbij komt.`,
        })
      }
    }

    if (!helping) {
      out.push({
        tag: 'warning',
        tagText: 'Richting',
        title: 'De trend loopt de verkeerde kant op',
        body: `Je zit ${nf(Math.abs(toGo), 1)} kg ${
          toGo > 0 ? 'boven' : 'onder'
        } je streefgewicht en beweegt daar verder vandaan. Kijk naar je caloriebalans hieronder voordat je aan je training sleutelt — dat is meestal waar het zit.`,
      })
    }
  } else if (slope != null && laatsteDagen(trend, TREND_VENSTER_DAGEN).length >= 10) {
    out.push({
      tag: 'neutral',
      tagText: 'Stabiel',
      title: 'Je gewicht staat stil',
      body: `Minder dan 0,1 kg verandering per week over ${s(
        laatsteDagen(trend, TREND_VENSTER_DAGEN).length,
        'weging',
        'wegingen',
      )} in de afgelopen zes weken. Prima als dat je doel is; wil je wél bewegen, dan is een kleiner of groter calorieverschil de knop.`,
    })
  }

  // vetmassa vs vetvrije massa — het punt van de hele exercitie
  const comp = laatsteDagen(
    weighIns(days).filter((d) => d.body.fatMassKg != null && d.body.weightKg != null),
    90,
  )
  if (comp.length >= 4) {
    const half = Math.max(1, Math.floor(comp.length / 3))
    const early = comp.slice(0, half)
    const late = comp.slice(-half)
    const fatΔ = mean(late.map((d) => d.body.fatMassKg!)) - mean(early.map((d) => d.body.fatMassKg!))
    const leanΔ =
      mean(late.map((d) => d.body.weightKg! - d.body.fatMassKg!)) -
      mean(early.map((d) => d.body.weightKg! - d.body.fatMassKg!))

    if (Math.abs(fatΔ) >= 0.3 || Math.abs(leanΔ) >= 0.3) {
      const goodCut = fatΔ < -0.2 && leanΔ > -0.3
      out.push({
        tag: goodCut ? 'positive' : leanΔ < -0.5 ? 'warning' : 'neutral',
        tagText: 'Samenstelling',
        title: goodCut
          ? 'Je verliest vet, geen spier'
          : leanΔ < -0.5
            ? 'Je verliest ook vetvrije massa'
            : `Vetmassa ${fatΔ < 0 ? '−' : '+'}${nf(Math.abs(fatΔ), 1)} kg`,
        body: `Vetmassa ${fatΔ < 0 ? 'daalde' : 'steeg'} met ${nf(
          Math.abs(fatΔ),
          1,
        )} kg, vetvrije massa ${leanΔ < 0 ? 'daalde' : 'steeg'} met ${nf(Math.abs(leanΔ), 1)} kg.${
          goodCut
            ? ' Dit is precies wat je wilt zien: het gewicht dat verdwijnt is vet.'
            : leanΔ < -0.5
              ? ' Meer eiwit en krachttraining remmen dat af. Een te groot calorietekort versnelt het juist.'
              : ' Let op: bio-impedantie-weegschalen zijn hier onnauwkeurig — kijk naar de richting over weken, niet naar losse metingen.'
        }`,
      })
    }
  }

  return out
}

/* --------------------------- energie en voeding --------------------------- */

function nutritionInsights(days: DayEntry[]): Insight[] {
  const out: Insight[] = []

  // Vandaag is nog niet af: die dag hoort niet in een daggemiddelde.
  const afgerond = afgeslotenDagen(days)
  const fullDays = afgerond.filter((d) => burned(d) > 0 && intakeKcal(d) > 0)
  if (fullDays.length >= 3) {
    const balances = fullDays.map((d) => intakeKcal(d) - burned(d))
    const avg = mean(balances)
    const perWeek = (avg * 7) / KCAL_PER_KG
    out.push({
      tag: Math.abs(avg) < 100 ? 'neutral' : avg < 0 ? 'positive' : 'warning',
      tagText: 'Balans',
      title: `Gemiddeld ${avg < 0 ? '−' : '+'}${Math.abs(Math.round(avg))} kcal per dag`,
      body: `Over ${s(fullDays.length, 'volledig gelogde dag', 'volledig gelogde dagen')}. Dat komt ruwweg neer op ${nf(
        Math.abs(perWeek),
        2,
      )} kg ${perWeek < 0 ? 'verlies' : 'aankomst'} per week.`,
    })

    const slope = trendSlopePerWeek(days)
    if (slope != null && Math.abs(perWeek) > 0.05) {
      const gap = slope - perWeek
      if (Math.abs(gap) > 0.25) {
        out.push({
          tag: 'warning',
          tagText: 'Discrepantie',
          title: 'Je balans en je weegschaal vertellen niet hetzelfde',
          body: `Je caloriebalans voorspelt ${nf(perWeek, 2)} kg per week, je gemeten trend doet ${nf(
            slope,
            2,
          )} kg. Meestal betekent dit dat er porties onder- of overschat worden, of dat er dagen niet volledig gelogd zijn. De weegschaal heeft vrijwel altijd gelijk.`,
        })
      }
    }
  }

  const intakeDays = afgerond.filter((d) => intakeKcal(d) > 0)
  if (intakeDays.length >= 5) {
    const kcals = intakeDays.map(intakeKcal)
    const spread = stdev(kcals)
    out.push({
      tag: spread > 500 ? 'warning' : 'neutral',
      tagText: 'Inname',
      title: `Gemiddeld ${Math.round(mean(kcals))} kcal per dag`,
      body:
        spread > 500
          ? `Je dagen lopen sterk uiteen — van ${Math.round(Math.min(...kcals))} tot ${Math.round(
              Math.max(...kcals),
            )} kcal. Grote uitschieters maken het lastig te zien of je gemiddelde klopt; een gelijkmatiger week is makkelijker te sturen.`
          : `Redelijk constant over ${s(intakeDays.length, 'gelogde dag', 'gelogde dagen')} — dat maakt de balans hierboven betrouwbaarder.`,
    })
  }

  // eiwit is naast krachttraining de belangrijkste rem op spierverlies
  const eiwitDagen = afgerond.filter((d) => intakeProtein(d) > 0)
  const gewicht = weighIns(days).slice(-1)[0]?.body.weightKg
  if (eiwitDagen.length >= 3 && gewicht) {
    const gemiddeld = mean(eiwitDagen.map(intakeProtein))
    const perKg = gemiddeld / gewicht
    const laag = perKg < 1.6
    out.push({
      tag: laag ? 'warning' : 'positive',
      tagText: 'Eiwit',
      title: `${Math.round(gemiddeld)} g per dag — ${nf(perKg, 1)} g per kilo`,
      body: laag
        ? `Aan de lage kant terwijl je in een tekort zit. Voor spierbehoud wordt 1,6 tot 2,2 g per kilo aangehouden; voor jou is dat ${Math.round(
            gewicht * 1.6,
          )} tot ${Math.round(gewicht * 2.2)} g per dag. Dit is samen met krachttraining de belangrijkste rem op spierverlies.`
        : 'Ruim voldoende voor spierbehoud tijdens een tekort. Dit is waarschijnlijk waarom je vetvrije massa het goed houdt.',
    })
  }

  return out
}

/* ------------------------------ gewoontes ------------------------------ */

function habitInsights(days: DayEntry[], profile: Profile): Insight[] {
  const out: Insight[] = []

  const afgerond = afgeslotenDagen(days)
  const waterDays = afgerond.filter((d) => d.waterMl != null)
  if (waterDays.length >= 5) {
    const hits = waterDays.filter((d) => d.waterMl! >= profile.waterGoalMl).length
    const pct = Math.round((hits / waterDays.length) * 100)
    out.push({
      tag: pct >= 70 ? 'positive' : 'warning',
      tagText: 'Water',
      title: `Doel gehaald op ${hits} van ${waterDays.length} dagen`,
      body: `Gemiddeld ${Math.round(mean(waterDays.map((d) => d.waterMl!)))} ml per dag, ${pct}% van je dagen op of boven ${profile.waterGoalMl} ml.`,
    })
  }

  const sleepDays = days.filter((d) => sleepHours(d) != null)
  if (sleepDays.length >= 5) {
    const hours = sleepDays.map((d) => sleepHours(d)!)
    const avg = mean(hours)
    const short = hours.filter((h) => h < 7).length
    out.push({
      tag: avg >= 7 ? 'positive' : 'warning',
      tagText: 'Slaap',
      title: `Gemiddeld ${nf(avg, 1)} uur`,
      body: `${s(short, 'nacht', 'nachten')} onder de 7 uur, over ${s(
        sleepDays.length,
        'gelogde nacht',
        'gelogde nachten',
      )}.`,
    })
  }

  const bedtimes = days.map((d) => d.sleep.bedtime).filter((b): b is string => !!b)
  if (bedtimes.length >= 7) {
    const sd = stdev(bedtimes.map(bedtimeMinutes))
    out.push({
      tag: sd <= 45 ? 'positive' : 'neutral',
      tagText: 'Regelmaat',
      title:
        sd <= 45
          ? 'Je gaat consequent rond hetzelfde tijdstip naar bed'
          : `Je bedtijd varieert ruim ${Math.round(sd)} minuten`,
      body:
        sd <= 45
          ? 'Regelmaat hangt sterker samen met gewicht en energie dan slaapduur alleen. Dit is goed nieuws.'
          : 'Een vaste bedtijd doet vaak meer dan een half uur extra slaap. Dit is de goedkoopste aanpassing in de lijst.',
    })
  }

  // slaap versus inname: vergelijk de kortste en langste nachten
  const pairs = days
    .map((d) => ({ sleep: sleepHours(d), kcal: intakeKcal(d) }))
    .filter((p): p is { sleep: number; kcal: number } => p.sleep != null && p.kcal > 0)
  if (pairs.length >= 8) {
    const sorted = [...pairs].sort((a, b) => a.sleep - b.sleep)
    const n = Math.max(3, Math.floor(sorted.length / 3))
    const worst = sorted.slice(0, n)
    const best = sorted.slice(-n)
    const diff = mean(worst.map((p) => p.kcal)) - mean(best.map((p) => p.kcal))
    if (Math.abs(diff) >= 150) {
      out.push({
        tag: diff > 0 ? 'warning' : 'neutral',
        tagText: 'Patroon',
        title: `Na korte nachten eet je ${Math.abs(Math.round(diff))} kcal ${diff > 0 ? 'meer' : 'minder'}`,
        body: `Op je ${n} kortste nachten (gemiddeld ${nf(
          mean(worst.map((p) => p.sleep)),
          1,
        )} uur) at je ${Math.round(mean(worst.map((p) => p.kcal)))} kcal, op je ${n} langste (${nf(
          mean(best.map((p) => p.sleep)),
          1,
        )} uur) ${Math.round(mean(best.map((p) => p.kcal)))} kcal. Een verband, geen bewijs van oorzaak — maar wel iets om op te letten.`,
      })
    }
  }

  // alcohol en de weging van de dag erna
  const alcoholDays = days.filter((d) => d.context.alcohol)
  if (alcoholDays.length >= 3) {
    const after: number[] = []
    const normal: number[] = []
    for (let i = 1; i < days.length; i++) {
      const w = days[i].body.weightKg
      const prevW = days[i - 1].body.weightKg
      if (w == null || prevW == null || days[i].body.fasted === false) continue
      ;(days[i - 1].context.alcohol ? after : normal).push(w - prevW)
    }
    if (after.length >= 3 && normal.length >= 3) {
      const diff = mean(after) - mean(normal)
      if (Math.abs(diff) >= 0.2) {
        out.push({
          tag: 'neutral',
          tagText: 'Alcohol',
          title: `Ochtend na alcohol: ${diff > 0 ? '+' : '−'}${nf(Math.abs(diff), 2)} kg extra`,
          body: `Gemeten over ${s(after.length, 'dag', 'dagen')}. Dit is vrijwel zeker vocht, geen vet — maar het verklaart wel waarom je trend na een weekend lijkt te stagneren.`,
        })
      }
    }
  }

  const move = days.filter((d) => d.exerciseMin != null)
  if (move.length >= 5) {
    // Niet het gemiddelde van de ingevulde dagen maal zeven: dat doet alsof je
    // elke dag beweegminuten logt, en maakt van drie ingevulde sportdagen een
    // torenhoog weekcijfer. Het totaal gedeeld door de weken die je overspant.
    const p = periode(move)!
    const weekly = Math.round(move.reduce((a, d) => a + d.exerciseMin!, 0) / p.weken)
    out.push({
      tag: weekly >= 150 ? 'positive' : 'neutral',
      tagText: 'Beweging',
      title: `Ongeveer ${weekly} minuten per week`,
      body:
        `Gemeten over ${s(p.dagen, 'dag', 'dagen')}, waarvan je er ${p.gelogd} invulde ` +
        `(${move[0].date} tot ${move[move.length - 1].date}). ` +
        (weekly >= 150
          ? 'Boven de 150 minuten die als richtlijn wordt aangehouden.'
          : 'De gangbare richtlijn is 150 minuten per week. Je zit daar nu onder.'),
    })
  }

  // krachttraining is de knop die bepaalt of je spiermassa behoudt tijdens een tekort
  const metTraining = days.filter((d) => d.workouts.length > 0)
  if (metTraining.length >= 5) {
    const p = periode(metTraining)!
    const kracht = metTraining.filter((d) =>
      d.workouts.some((w) => w.type === 'krachttraining'),
    ).length
    const perWeek = Math.round((kracht / p.weken) * 10) / 10
    out.push({
      tag: perWeek >= 2 ? 'positive' : 'warning',
      tagText: 'Krachttraining',
      title: `${nf(perWeek, 1)} keer per week`,
      body:
        `${s(kracht, 'krachtsessie', 'krachtsessies')} in de ${s(p.dagen, 'dag', 'dagen')} ` +
        `tussen je eerste en laatste gelogde training (${metTraining[0].date} tot ` +
        `${metTraining[metTraining.length - 1].date}). ` +
        (perWeek >= 2
          ? 'Twee of meer krachtsessies per week is wat je spiermassa beschermt terwijl je afvalt. Dit is waarschijnlijk waarom je vetvrije massa het goed houdt.'
          : 'Bij afvallen is dit de belangrijkste rem op spierverlies. Twee keer per week is de gangbare ondergrens; met minder verlies je eerder ook vetvrije massa.'),
    })
  }

  // vocht na een zware sessie verklaart een sprong op de weegschaal
  const naKracht: number[] = []
  const naRust: number[] = []
  for (let i = 1; i < days.length; i++) {
    const w = days[i].body.weightKg
    const vorige = days[i - 1].body.weightKg
    if (w == null || vorige == null || days[i].body.fasted === false) continue
    const zwaar = days[i - 1].workouts.some((x) => x.type === 'krachttraining')
    ;(zwaar ? naKracht : naRust).push(w - vorige)
  }
  if (naKracht.length >= 3 && naRust.length >= 3) {
    const verschil = mean(naKracht) - mean(naRust)
    if (verschil >= 0.2) {
      out.push({
        tag: 'neutral',
        tagText: 'Vocht',
        title: `Ochtend na krachttraining: +${nf(verschil, 2)} kg extra`,
        body: `Gemeten over ${s(naKracht.length, 'dag', 'dagen')}. Dat is vocht dat je spieren vasthouden om te herstellen, geen vet. Schrik dus niet van de weegschaal de dag na een zware sessie — kijk naar je trend.`,
      })
    }
  }

  const metMinuten = days.filter((d) => workoutMinutes(d) > 0)
  if (metMinuten.length >= 4) {
    const p = periode(metMinuten)!
    const totaal = metMinuten.reduce((a, d) => a + workoutMinutes(d), 0)
    const perWeek = Math.round(totaal / p.weken)
    out.push({
      tag: perWeek >= 150 ? 'positive' : 'neutral',
      tagText: 'Trainingsduur',
      title: `${perWeek} minuten per week gelogd`,
      body:
        `${totaal} minuten over ${s(p.gelogd, 'trainingsdag', 'trainingsdagen')}, verspreid over ` +
        `${s(p.dagen, 'dag', 'dagen')} (${metMinuten[0].date} tot ${metMinuten[metMinuten.length - 1].date}). ` +
        (perWeek >= 150
          ? 'Boven de richtlijn van 150 minuten matige inspanning per week.'
          : 'De gangbare richtlijn is 150 minuten per week. Dit telt alleen wat je zelf logt — losse beweging zit in je beweegminuten.'),
    })
  }

  // laat eten tegenover hoe je die nacht sliep
  const metTijdEnKwaliteit = days.filter(
    (d) => lastMealMinutes(d) != null && d.sleep.quality != null,
  )
  if (metTijdEnKwaliteit.length >= 8) {
    const laat = metTijdEnKwaliteit.filter((d) => lastMealMinutes(d)! >= 21 * 60 + 30)
    const vroeg = metTijdEnKwaliteit.filter((d) => lastMealMinutes(d)! < 21 * 60 + 30)
    if (laat.length >= 3 && vroeg.length >= 3) {
      const verschil =
        mean(laat.map((d) => d.sleep.quality!)) - mean(vroeg.map((d) => d.sleep.quality!))
      if (Math.abs(verschil) >= 0.5) {
        out.push({
          tag: verschil < 0 ? 'warning' : 'neutral',
          tagText: 'Laat eten',
          title:
            verschil < 0
              ? 'Na laat eten slaap je slechter'
              : 'Laat eten lijkt je slaap niet te storen',
          body: `Op ${s(laat.length, 'avond', 'avonden')} at je na 21:30; die nachten gaf je gemiddeld ${nf(
            mean(laat.map((d) => d.sleep.quality!)),
            1,
          )} van 5, tegen ${nf(
            mean(vroeg.map((d) => d.sleep.quality!)),
            1,
          )} na een vroegere laatste maaltijd. Een verband, geen bewijs — maar wel iets om op te letten.`,
        })
      }
    }
  }

  // Hoe compleet log je eigenlijk? Alleen over de periode dat je zelf logt --
  // een geimporteerde weeggeschiedenis meetellen zou hier altijd 0% opleveren.
  const periode = logPeriode(afgerond)
  if (periode.length >= 7) {
    const complete = periode.filter(
      (d) => d.body.weightKg != null && intakeKcal(d) > 0 && burned(d) > 0,
    ).length
    const pct = Math.round((complete / periode.length) * 100)
    if (pct < 70) {
      out.push({
        tag: 'warning',
        tagText: 'Volledigheid',
        title: `${pct}% van je dagen is volledig gelogd`,
        body: `${complete} van ${periode.length} dagen sinds je begon met loggen hebben gewicht, voeding én verbranding. De verbanden hierboven worden pas betrouwbaar als dat richting de 80% gaat — met gaten weet je niet of een patroon echt is of een meetfout.`,
      })
    }
  }

  return out
}
