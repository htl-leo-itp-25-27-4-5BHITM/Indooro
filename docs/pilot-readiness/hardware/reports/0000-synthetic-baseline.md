# Report 0000: synthetischer Replay-Stand (keine Messung)

- Datum: 2026-10-16
- Branch: `pilot/field-replay` (Basis `origin/pilot/first-store`, `46b9ad1`)
- Befehl: `cd swift/indooro-EinkaeuferFinal && swift test 2>&1 | grep '^REPLAY'`
- Quelle: synthetische Aufnahmen auf `layout-demosupermarkt.json` (SplitMix64, feste Seeds). **Keine echten Messdaten.** Dient nur als Vergleichswert für spätere Aufnahmen (`establish-pilot-field-measurement` 1.2).

```text
REPLAY determinism ticks=73 duration=25.3s reroutes=1 reroutesPerMin=2.37 stopChanges=0 jumps=1 maxStep=17.13 lagMean=2.41 lagP95=17.14 offRouteDelays=[6.90] lowConfToggles=2 planning=1x
REPLAY dropout ticks=73 duration=25.5s reroutes=0 reroutesPerMin=0.00 stopChanges=0 jumps=1 maxStep=5.64 lagMean=3.60 lagP95=5.68 offRouteDelays=[] lowConfToggles=2 planning=1x
REPLAY events ticks=71 duration=24.6s reroutes=0 reroutesPerMin=0.00 stopChanges=0 jumps=1 maxStep=3.77 lagMean=1.00 lagP95=2.86 offRouteDelays=[] lowConfToggles=0 planning=2x
REPLAY longBlackout ticks=84 duration=29.1s reroutes=0 reroutesPerMin=0.00 stopChanges=0 jumps=0 maxStep=1.48 lagMean=2.76 lagP95=4.12 offRouteDelays=[] lowConfToggles=2 planning=1x
REPLAY rssiOnly ticks=57 duration=19.8s reroutes=0 reroutesPerMin=0.00 stopChanges=0 jumps=0 maxStep=0.13 lagMean=0.12 lagP95=0.20 offRouteDelays=[] lowConfToggles=0 planning=1x
REPLAY stationary60s ticks=171 duration=59.6s reroutes=0 reroutesPerMin=0.00 stopChanges=0 jumps=0 maxStep=0.14 lagMean=0.09 lagP95=0.15 offRouteDelays=[] lowConfToggles=0 planning=1x
REPLAY walkClean ticks=68 duration=23.5s reroutes=0 reroutesPerMin=0.00 stopChanges=0 jumps=2 maxStep=3.91 lagMean=3.22 lagP95=5.02 offRouteDelays=[] lowConfToggles=0 planning=1x
REPLAY walkOutliers ticks=68 duration=23.5s reroutes=0 reroutesPerMin=0.00 stopChanges=0 jumps=2 maxStep=3.97 lagMean=3.08 lagP95=4.93 offRouteDelays=[] lowConfToggles=0 planning=1x
REPLAY wrongAisle ticks=101 duration=35.1s reroutes=1 reroutesPerMin=1.71 stopChanges=0 jumps=1 maxStep=17.16 lagMean=1.50 lagP95=17.14 offRouteDelays=[6.55] lowConfToggles=2 planning=1x
```

Hinweise:

- `maxStep ≈ 17 m` in `determinism` und `wrongAisle`: Szenario-Artefakt, siehe `NavigationFixtures/BASELINE.md` („Nach Task 6.1“).
- Die Werte hängen leicht von Tie-Breaks im Graphen ab (siehe `BASELINE.md`); Abweichungen im Nachkommabereich sind kein Befund.
