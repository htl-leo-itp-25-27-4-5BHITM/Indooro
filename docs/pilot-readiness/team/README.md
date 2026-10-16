# Pilot-Team: Aufteilung, Branches, Ablauf

Stand: 16.10.2026 · Grundlage: Audit `docs/pilot-readiness/01–08`, Branch-Stand nach `git fetch` am 16.10.2026.

## 1. Branch-Stand heute

| Branch | Stand | Bedeutung für den Pilot |
|---|---|---|
| `main` (`99b802b`) | live auf LeoCloud | Basis für Backend, wird später den Admin-Neubau enthalten |
| `codex/stabilize-ios-navigation` (`2956fe6`) | stabilisierte Navigation, 77 Tests grün | **ist jetzt in `pilot/first-store` enthalten** |
| `codex/admin-platform-rebuild` (`9ec0885`, lokal 4 Commits vor `origin`) | Admin-Agent arbeitet noch (34/39 Tasks von `rebuild-admin-platform`) | wird nach Fertigstellung in `main` gemergt; bis dahin fasst **niemand** `backend/**`, `admin-ui/**`, `keycloak/**` an |
| `claude/ar-alignment-experiment` | AR-Experiment | nicht im Pilot |
| `codex/indooro-v2-*`, `feature/indooro-ad-v2-concept`, `codex/android-parity-plan` | Werbefilm, Android-Plan | nicht im Pilot |
| `origin/website` | Website | nicht im Pilot |

## 2. Pilot-Branches

```
main ──────────────────────────────●───────────────▶ (Admin-Neubau gemergt)
   \                               │                 \
    codex/stabilize-ios-navigation  │                  pilot/backend-hardening (Person C, Phase 2) ──PR──▶ main
      \                            ▼
       pilot/first-store  ◀── PR ── pilot/erik-guided-tour   (Erik)
                          ◀── PR ── pilot/ios-pilot-build    (Person A)
                          ◀── PR ── pilot/field-measurement  (Person B)
                          ◀── PR ── pilot/store-operations   (Person C, Phase 1)
                          ◀── merge main (Erik, nach Admin-Merge)
```

- `pilot/first-store` = Integrationsbranch. Nur Erik mergt dort hinein (Pull Requests).
- Jede Person arbeitet auf **ihrem** Branch, holt täglich `origin/pilot/first-store` herein.
- Alle Branches sind auf GitHub gepusht, damit alle (und ihre Agenten) daran arbeiten können.

## 3. Wer macht was

| Person | Rolle | OpenSpec-Change | Branch | Zusätzlich übernommene Tasks |
|---|---|---|---|---|
| **Erik** | Integration, Navigation, Release, Partner-Erstkontakt | `add-pilot-guided-tour-fallbacks` | `pilot/erik-guided-tour` | `fix-ios-contract-and-spec-drift` 7.1–7.4, 8.1–8.4; Merge Admin-Neubau → Pilot |
| **Person A** (Vorschlag: David Berghahn, App) | iOS UX & Pilot-Build | `prepare-pilot-ios-build` | `pilot/ios-pilot-build` | `fix-ios-contract-and-spec-drift` 3, 4, 5, 6, 10 |
| **Person B** (Vorschlag: Michael Stelzmüller, Ortungshardware) | Positionierung, Hardware, Messungen | `establish-pilot-field-measurement` | `pilot/field-measurement` | `stabilize-ios-navigation-pipeline` 10.4, 12.1–12.5, 13.6 |
| **Person C** (Vorschlag: Fabian Joos oder Niilo Rieser, Server) | Daten, Betrieb, Sicherheit, Pilot-Kit | `prepare-pilot-store-operations` | `pilot/store-operations`, später `pilot/backend-hardening` | `harden-platform-security-baseline` 5.1, 5.2, 5.5, 8.2; `protect-legacy-write-endpoints` komplett (Phase 2); `fix-ios-contract-and-spec-drift` 2.x |

Die Namen sind Vorschläge nach der Rollenverteilung im README. Das Team entscheidet.

Prompts für die Agenten: [PROMPT_ERIK.md](PROMPT_ERIK.md), [PROMPT_PERSON_A_IOS.md](PROMPT_PERSON_A_IOS.md), [PROMPT_PERSON_B_POSITIONING.md](PROMPT_PERSON_B_POSITIONING.md), [PROMPT_PERSON_C_OPERATIONS.md](PROMPT_PERSON_C_OPERATIONS.md). Gemeinsame Regeln: [AGENT_RULES.md](AGENT_RULES.md).

## 4. Aufgaben, die kein Agent erledigen kann (Menschen)

| Wer | Aufgabe | Bis |
|---|---|---|
| Erik | Termin mit Betreuung (Budget 12 Beacons, Schulbrief, Versicherung, Code-Rechte) | Woche 1 |
| Erik | Klären, welcher Markt „SPAR Posttraße“ ist und wer dort Kontakt hat | Woche 1 |
| Erik | Erste 2–3 Gespräche mit Märkten (persönlich/Brief/Vermittlung, siehe `06_BUSINESS_OUTREACH.md`) | Woche 2–4 |
| Erik | LeoCloud-Zugang: Backup ziehen, Secrets rotieren, Rollout (nach Anleitung von Person C) | Woche 2–3 |
| Person A | Modelle und iOS-Versionen aller Test-iPhones sammeln; Pilot-Build auf echtem iPhone installieren | Woche 1–3 |
| Person B | Beacon-Modell bestellen (nach Freigabe); Testraum vermessen; Messläufe aufnehmen; größeren Raum mit Regalen organisieren | Woche 1–4 |
| Person C | Kontaktliste mit 8–12 Märkten (außerhalb des Repos); Kit drucken; mit Erik zu Gesprächen | Woche 2–4 |

## 5. Zeitplan (Kurzfassung von `07_ACTION_PLAN.md`)

| Woche | Erik | Person A | Person B | Person C |
|---|---|---|---|---|
| 1 (19.–23.10.) | Route-Fallback (Abschn. 2), Betreuung, Markt klären | Setup, Environment, Profil (Abschn. 1–3) | Beacon-Standard, Auswahl, Bestellung (Abschn. 2) | Konventionen, CSV-Tool (Abschn. 2–3) |
| 2 (26.–30.10.) | Regaltext, „Ich bin hier“ (4–5) | Suche, Fehlerzustände (4) | Testraum-Layout, Protokoll, Trockenlauf (3–4) | Backup, Smoke, Secrets in k8s (4–5) |
| 3 (02.–06.11.) | Layout-Cache (6), PR | Texte, Intro, Berechtigungen, Icon (5–6), PR | Aufnahmen Testraum (5.1–5.2), PR | Pilot-Kit (6), PR |
| 4 (09.–13.11.) | Admin-Merge integrieren (7), Gate „bereit für Markt“ | Gerätetest (7.3) | großer Raum, 17-m-Analyse (5.3–6.1) | Phase 2 Backend-Härtung, falls Admin gemergt |
| 5–8 | Pilot im Markt (siehe `07_ACTION_PLAN.md`) | Fixes aus Tests | Kalibrierung, Markt-Messung (6–7) | Datenerfassung Pilotbereich, Sitzungen |

## 6. Pull-Request-Regeln

- Ziel: `pilot/first-store` (Ausnahme `pilot/backend-hardening` → `main`).
- Inhalt: Change-Name, erledigte Task-Nummern, Ausgabe der Prüfungen, Screenshots bei UI.
- Review: Erik (oder eine zweite Person, wenn Erik selbst Autor ist).
- Merge nur mit grünen Prüfungen aus `AGENT_RULES.md` Abschnitt 4.

## 7. Status

Laufender Stand: [STATUS.md](STATUS.md). Jede Person aktualisiert ihre Zeile am Ende jeder Arbeitssitzung.
