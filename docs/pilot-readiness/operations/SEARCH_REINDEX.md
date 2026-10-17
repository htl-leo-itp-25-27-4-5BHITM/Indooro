# Suchindex: Reindex und Alias-Umschaltung

## Zweck

Die Produktsuche bekommt neue Analyzer, Synonyme und Wortteil-Suche (`improve-product-search-quality`). Diese Einstellungen gelten nur für neu angelegte Indizes. Der Bestandsindex `products` bleibt deshalb unverändert, und der neue Stand wird als Versionsindex `products_vN` aufgebaut. Ein Alias schaltet die App darauf um. Der alte Index bleibt bestehen, bis die Umstellung abgenommen ist.

Index-Namen:

| Name | Bedeutung |
|---|---|
| `products` | Bestandsindex, bleibt erhalten (Quelle des Reindex, Rollback-Ziel) |
| `products_vN` | Versionsindex mit neuer Analyse; N = höchste vorhandene Nummer + 1 |
| `products_live` | Alias, auf den das Backend nach der Umstellung liest und schreibt |

Synonyme sind im Index-Setting eingebrannt (`synonyms_de.txt` wird beim Anlegen des Index eingetragen). **Jede Änderung an `synonyms_de.txt` erfordert einen neuen Reindex** (neue Version `products_vN`, dann Umschalten).

## Voraussetzungen

- **Katalog-Migration zuerst.** Die Produkte werden laut `CATALOG_MIGRATION.md` im Index `products` migriert, einschließlich Schritt 6 (Legacy-Dokumente entfernen) und Schritt 8 (Pilotmarkt-Produkte). Erst danach läuft der Reindex. Sonst fehlen die Produkte im neuen Index bzw. liegen nach der Umschaltung nur im alten Index.
- **Schreibsperre für den Katalog** vom Reindex bis zum Backend-Rollout (Schritt 5). Produkte, die in dieser Zeit in `products` geschrieben werden, sind nicht in `products_vN`. Die Zählung in Schritt 2 erkennt nur Abweichungen bei der Anzahl, nicht bei geänderten Inhalten.
- **Backup** vor dem Reindex: Produkt-Export mit `scripts/ops/export_products.py` (Branch `pilot/release-backend`, PR #123). Die Datei liegt in `backups/` und wird nie committet.
- **Admin-Token** in der Umgebungsvariable `INDOORO_ADMIN_TOKEN`. Der Token wird verdeckt eingelesen, nie ausgegeben, nie in eine Datei geschrieben und nach dem Lauf entfernt:

  ```bash
  read -s INDOORO_ADMIN_TOKEN && export INDOORO_ADMIN_TOKEN
  BASE=https://it220209.cloud.htl-leonding.ac.at
  ```

- Das Release-Vorgehen (Image-Tag, Manifeste, Smoke-Check) steht im `RELEASE_RUNBOOK.md` (Branch `pilot/release-backend`, PR #123).

## Schritte

### 1) Reindex starten

```bash
curl -s -X POST "$BASE/api/admin/index/reindex" \
  -H "Authorization: Bearer $INDOORO_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

Die Antwort nennt Quelle, Ziel und beide Dokumentzahlen (Beispiel):

```json
{"source":"products","target":"products_v1","sourceCount":153,"targetCount":153,"status":"OK"}
```

Der Index wird angelegt, die Dokumente werden kopiert und die Zahlen verglichen. `products` wird nicht verändert, nichts gelöscht, der Alias bleibt unverändert.

### 2) Zahlen prüfen

- `sourceCount` und `targetCount` müssen gleich sein und zur Zahl aus dem Export bzw. Dry-Run der Migration passen.
- Bei Abweichung antwortet der Server mit `500` und der Meldung „Reindex unvollständig …“. Das Ziel bleibt liegen, der Alias ist unverändert. Ursache klären (meist Schreibvorgänge während des Reindex) und Schritt 1 erneut ausführen. Das Ergebnis ist dann `products_v(N+1)`; das fehlerhafte `products_vN` nicht umschalten.
- Ein Ziel, das schon existiert, meldet `409`.

### 3) Qualitätsprüfung

Die Suchqualität wird gegen einen lokalen OpenSearch geprüft, nicht gegen LeoCloud (kein Port-Forward nötig). Voraussetzung ist ein lokaler OpenSearch 2.9.0 auf Port 9201, z. B. über `docker-compose.yml`.

```bash
cd backend/indooro_server
SEARCH_QUALITY_PORT=9201 SEARCH_QUALITY_MIN_HIT=0.85 sh ./mvnw -B test -Dtest=SearchQualityTest
```

Das Gate liegt bei hit@3 ≥ 0,85 auf dem Demo-Katalog (`demoproducts.ndjson`). Der Test verwendet nur den Testindex `products_quality_test`. Die Ergebnisse gelten für den Demo-Katalog. Für den Pilotbestand bleibt der Smoke-Check in Schritt 6 maßgeblich.

### 4) Alias auf den neuen Index umschalten

```bash
curl -s -X POST "$BASE/api/admin/index/activate?index=products_vN" \
  -H "Authorization: Bearer $INDOORO_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

`products_vN` ersetzen (z. B. `products_v1`). Die Antwort nennt den bisherigen Index:

```json
{"alias":"products_live","index":"products_v1","previous":[]}
```

Die Umschaltung läuft in einem einzigen atomaren Schritt. Der Index wird nicht gelöscht. Nur Namen der Form `products_v<Nummer>` werden akzeptiert (sonst `400`), unbekannte Namen geben `404`.

**Dokumentzahl-Prüfung vor der Umschaltung.** Vor dem Umschalten aktualisiert der Server Ziel und Quelle (Refresh) und zählt die Dokumente in `products_vN` und im Index, den das Backend heute liest (`opensearch.index`, also `products` bis zur Umstellung auf den Alias). Stimmen die Zahlen überein, wird umgeschaltet. Weichen sie ab, antwortet der Server mit `409` und nennt beide Zahlen. Der Alias bleibt dann unverändert. Die Abweichung entsteht durch Schreibvorgänge zwischen Reindex und Umschaltung, die im Ziel fehlen:

```json
{"status":409,"error":"Dokumentzahlen weichen ab: Quelle products hat 153 Dokumente, Ziel products_v1 hat 154. writes happened between reindex and activate; re-run reindex (oder force=true, um trotzdem umzuschalten). Alias unverändert."}
```

Dann Schritt 1 erneut ausführen. Das Ergebnis ist `products_v(N+1)`, das abweichende `products_vN` wird nicht umgeschaltet.

Nur wenn die Abweichung bewusst in Kauf genommen wird, schaltet `force=true` trotzdem um. Der Parameter gehört nicht in den Normalfall und wird im Log als Warnung vermerkt:

```bash
curl -s -X POST "$BASE/api/admin/index/activate?index=products_vN&force=true" \
  -H "Authorization: Bearer $INDOORO_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

Ohne `force` gilt: Die Zählung findet nur bei gleichen Zahlen statt, und der Alias wird nur dann geschrieben. Das `409` kommt vor jeder Änderung am Alias.

### 5) Backend mit dem Alias ausrollen

Im Backend-Deployment die Umgebungsvariable setzen. Der Eintrag gehört in `k8s/backend.yaml` (Block `env`):

```yaml
- name: OPENSEARCH_INDEX
  value: "products_live"
```

Das Release läuft nach `RELEASE_RUNBOOK.md` (fester Image-Tag, Manifeste anwenden, Pod-Start abwarten). Ab diesem Moment liest und schreibt das Backend über `products_live`.

### 6) Smoke-Check

```bash
curl -s "$BASE/api/products/search?q=milch"
```

Erwartet: Treffer mit Produkten aus dem Bestand. Zusätzlich `python3 scripts/ops/pilot_smoke.py` (PR #123), wenn verfügbar.

### 7) Rollback

Der Rollback ist nur sauber, solange seit Schritt 5 keine Katalog-Schreibvorgänge stattgefunden haben.

- **Auf den Bestandsindex zurück:** Im Deployment `OPENSEARCH_INDEX` auf `products` setzen und das Backend neu ausrollen. `products` ist unverändert. Schreibvorgänge nach Schritt 5 fehlen dann im Bestand.
- **Auf eine frühere Version zurück:** `POST /api/admin/index/activate?index=products_vM` mit dem Namen der früheren Version aus `previous` der letzten Umschaltung. Vor der allerersten Umschaltung gibt es keine solche Version; dann gilt der Bestandsindex-Weg oben. Die Aktivierung akzeptiert nur `products_v<Nummer>`, nicht `products`. Für den Bestandsindex ist daher die Umgebungsvariable der Weg.
- Der Index `products` bleibt bestehen, bis die manuelle Freigabe erfolgt. Diese Anleitung löscht keine Indizes.

## Hinweise

- `DELETE /api/admin/index` löscht den Index unter `opensearch.index`. Mit `OPENSEARCH_INDEX=products_live` schlägt das fehl, weil `products_live` ein Alias ist. Das ist gewollt. Versionsindizes werden nicht über die App gelöscht.
- Nach dem Umschalten bleibt `products` als eingefrorener Stand stehen. Wer Speicherplatz freigibt, löscht ihn erst nach der manuellen Freigabe.
- Neue Synonyme: `synonyms_de.txt` ändern, Backend-Release, dann Reindex (Schritte 1–5). Ein bloßes Umschalten reicht nicht.
- **Subfelder `name.prefix` und `name.parts`:** Die Suche liest beim ersten Aufruf das Mapping von `opensearch.index` und merkt sich das Ergebnis höchstens 60 Sekunden lang. Die Präfix- und Wortteil-Klauseln werden nur dann verwendet, wenn das Feld `name` diese Subfelder hat. Ein Altindex ohne Reindex funktioniert deshalb weiter. Volltext und Tippfehler über `name` greifen, aber ohne Synonyme und ohne deutsche Analyse, und `backp` findet nicht „Backpulver“. Erst `products_vN` mit neuem Mapping bringt diese Treffer. Nach einer Umschaltung übernimmt das Backend den neuen Stand spätestens nach 60 Sekunden, auf jeder Instanz. Schlägt die Mapping-Abfrage fehl, sucht das Backend ohne die beiden Klauseln und fragt bei der nächsten Suche erneut an.
