## Admin Pilot-Cut

Bereitet den Admin-Branch für `main` und den ersten Supermarkt-Pilot vor. Neun Routen nutzen lokal den neuen React/Vite-Admin: Dashboard, Regionen, Stores, Store-Detail, Beacons, Produkte, Kategorien, Rezepte und Diagnostik. Der Layout-Editor bleibt über `editor: false` auf Legacy; der Candidate ist weiterhin als geschützter Direktlink erreichbar. Produkt-/Kategorie-Bulk-Import bleibt bei Review ohne Commit.

Die neue [Pilot-Übergabe](PILOT_CUT.md) nennt Pilot-Pfade, bekannte Lücken, Route-Flags/Rollback und Deployment-Konfigurationsnamen ohne Secret-Werte. Die noch fehlenden vollständigen Paritätsnachweise stehen ehrlich in `rebuild-admin-platform` Tasks 1.2, 3.10 und 5.4 und als neue Folge-Change `complete-admin-parity-evidence`. Der historisch verpasste Vorab-Review 1.1 bleibt offen; `rebuild-admin-platform` wird für den Pilot nicht archiviert. Der experimentelle Swift-Rotationsfix ist nicht in diesem Branch und gehört zu `add-pilot-guided-tour-fallbacks`.

### Prüfungen nach `origin/main`

- `sh ./mvnw test`: 142/142 Backend-Tests bestanden. Der Wrapper hat kein Execute-Bit; `./mvnw test` meldet deshalb „permission denied“.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`: bestanden; 69/69 Unit-Tests.
- `npm run test:browser`: 111/111 Browser-Tests bestanden, einschließlich frischer Candidate-Paketierung und Verifikation.
- `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`: 42/42 bestanden.
- `git fetch origin && git merge origin/main`: bereits aktuell, keine Konflikte.

### Vor Merge und Rollout

Erik erstellt das Datenbank-Backup, prüft den PR und merged selbst. Kein Produktions-Deployment ist Teil dieses PR. Für einzelne Routen setzt ein Rollback den betreffenden Schlüssel in `route-cutover.js` auf `false`; der Editor ist bereits aus. Physische Beacon-/iPhone-Navigation und der vollständige Editor-Aktions-/Zustandsvergleich sind offen. Der Katalog-Import-Commit bleibt gesperrt. Details und frühere lokale Live-Belege stehen in `docs/admin-rebuild/PILOT_CUT.md`, `ROUTE_PARITY_MATRIX.md` und `RELEASE_EVIDENCE.md`.
