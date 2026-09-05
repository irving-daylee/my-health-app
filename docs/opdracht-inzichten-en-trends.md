# Opdracht: lichaamssamenstelling-vergelijking en grafieken bij Trends

Deze opdracht is zelfstandig te lezen. Alles wat je nodig hebt staat erin; de
context komt uit een eerdere sessie met dezelfde gebruiker.

## Over wie dit gaat

Man, 35 jaar, 1,74 m, ~77 kg, streefgewicht 74,0 kg. Weegt zich vrijwel elke
ochtend nuchter op een Fitdays-weegschaal en typt de waarden over. Ruim 400
wegingen in de app, van april 2025 tot nu. Zaalvoetbal 3x per week in het
seizoen (september t/m mei), nu net weer begonnen. Baby van acht maanden, dus
slaapt kort (~6,2 uur) en dat is geen knop die hij vrij kan draaien.

Hij wil geen aanmoediging maar cijfers die kloppen, inclusief wanneer ze niets
zeggen. Hou de toon nuchter en schrijf in het Nederlands, zoals de rest van de
codebase.

## Deel 1 — Nieuwe kaart onder Inzichten: lichaamssamenstelling van vanochtend

Vergelijk de weegschaalwaarden van vanochtend met die van gisterochtend, over
alle negen velden: gewicht, lichaamsvet %, vetmassa, spiermassa, botmassa,
eiwit %, watergewicht, lichaamswater %, visceraal vet.

### De valkuil die je moet vermijden

Negen verschillen met bij elk een conclusie levert elke ochtend negen
zelfverzekerde verhalen over ruis. Dat mag niet gebeuren, om twee redenen:

1. **Een halve kilo vet is 3850 kcal.** Wat je tussen twee ochtenden ziet
   bewegen is vocht en glycogeen, ook als de weegschaal het "vetmassa" of
   "spiermassa" noemt.
2. **De weegschaal meet via elektrische weerstand,** en die hangt aan het
   vochtgehalte. Uitgedroogd na een wedstrijd lijkt het vetpercentage juist
   hoger terwijl er niets veranderd is.

Gemeten in zijn eigen data is de dagruis op gewicht een standaardafwijking van
**0,46 kg**. Een kilo verschil met gisteren is bij hem dus een gewone dinsdag.

### De oplossing: elk verschil naast zijn eigen dagruis

Bereken per meting uit de historie hoe groot een normale dagsprong is
(standaardafwijking van de verschillen tussen opeenvolgende dagen, alleen over
aaneengesloten dagen). Licht alleen uit wat daar duidelijk bovenuit komt —
bijvoorbeeld meer dan tweemaal die spreiding. De rest toon je wel, maar gedempt
en met "binnen je normale schommeling". Toon niets zolang er te weinig
aaneengesloten dagparen zijn om die spreiding te schatten.

### Opbouw van de kaart

1. **Vanochtend vs gisterochtend** — de negen waarden met hun verschil,
   opvallende sprongen uitgelicht, de rest gedempt.
2. **Wat dit betekent** — één alinea, niet negen. Op deze termijn is het
   antwoord bijna altijd vocht; zeg dat dan ook. Ging het gewicht omlaag terwijl
   het vetpercentage omhoog ging, benoem dat als het uitdrogingspatroon en niet
   als verlies of winst. Verwijs voor de richting naar de trend.
3. **Waar sta je** — hier is "te veel of te kort" wél te beantwoorden, maar niet
   tegen gisteren. Tegen referentiewaarden en op het **gemiddelde van de laatste
   zeven dagen**, niet op één ochtend. Relevante velden: vetpercentage,
   visceraal vet, lichaamswater, eiwit, spiermassa.
4. **Aanbevelingen** — gekoppeld aan dat niveau, niet aan de sprong van
   vannacht, en alleen waar de data ze draagt.

### Openstaand punt: de grenswaarden

Zijn Fitdays-app toont per meting "Hoog", "Standaard", "Laag" of "Uitstekend".
Vraag hem die drempels (of een screenshot) en gebruik die, zodat de app niet iets
anders zegt dan zijn weegschaal. Heb je ze niet, val dan terug op algemene
referenties voor volwassen mannen en zeg er expliciet bij dat het algemene
waarden zijn en geen medisch oordeel.

## Deel 2 — Trends uitbreiden: slaap, water, verbranding

Trends heeft nu grafieken voor gewicht en voor vetmassa vs. vetvrije massa, plus
een kaart "Gemiddelden over deze periode" met vier kale getallen (caloriebalans,
slaap, verbrand, water) in `src/screens/Trends.tsx`. Die getallen staan er zonder
duiding.

Voeg conclusies toe voor **slaap**, **water** en **caloriebalans/verbranding**.
Caloriebalans en verbranding staan er al als getal; die hebben vooral context
nodig, geen nieuw cijfer.

Let hierbij op twee dingen die in deze codebase al eerder zijn misgegaan:

- **Deel niet door alle dagen in de app.** Er zit een geïmporteerde
  weeggeschiedenis in van honderden dagen zonder voeding, water of slaap.
  Gebruik `logPeriode` en `wekenSpan` uit `src/lib/derive.ts`, en noem in de
  tekst over welke periode gerekend is (zie de inzichten over beweging en
  krachttraining als voorbeeld).
- **Vandaag is een halve dag.** Een lopend dagtotaal mag niet als volledige dag
  meetellen in een gemiddelde.

## Belangrijke context over de bestaande code

- `src/lib/predict.ts` — voorspelling van de weging van morgen, plus
  `learnEffects` (leert uit eigen data wat alcohol, zaalvoetbal, de dag na
  zaalvoetbal, krachttraining en ziek zijn op de weegschaal doen) en `backtest`
  (kijkt de voorspelling na op de eigen historie). Lees de commentaarblokken
  daar: ze leggen uit waarom de trendhelling bewust niet meetelt in een
  eendaagse voorspelling en waarom de band uit werkelijke fouten komt.
- `src/lib/derive.ts` — afgeleide waarden. `weighIns` filtert op nuchtere
  ochtendwegingen; alleen die tellen mee in trends. `derivedBody` rekent
  percentage en massa naar elkaar om, dus vraag niet wat je kunt afleiden.
- `src/lib/insights.ts` — alle bestaande inzichten, met `generateInsights` als
  ingang. Volg de bestaande `Insight`-vorm (tag, tagText, title, body).
- Getallen in Nederlandse notatie via `nl`, `fmt` en `signed` uit `derive.ts`.

## Werkafspraken van deze gebruiker

- Ontwikkel op `main` en **deploy direct na elke wijziging**; hij wil niet
  gevraagd worden. De workflow `.github/workflows/deploy.yml` draait op elke push
  naar `main` en zet de app op GitHub Pages. Controleer daarna of de run slaagt.
- Hoog het versienummer in `package.json` op bij een functionele wijziging. Dat
  nummer stuurt ook de cachenaam van de service worker en staat onderin het
  scherm, dus zonder ophoging kan hij niet zien of hij de nieuwe versie heeft.
- Draai `npx tsc --noEmit`, `npm run build` en `npm run test-import` voor je
  commit.
- Schrijf commitberichten die uitleggen *waarom*, inclusief wat er misging als je
  onderweg een fout vond.
- Zeg het als iets niet klopt of niet kan, in plaats van een getal te verzinnen.
  Dat is bij dit project meerdere keren de meest waardevolle uitkomst geweest.
