# P5b Legacy-Web: Deploy-Prüfung

Stand: Prüfung gegen `main` (bf5abef8).

## Ergebnis

Keine Seite unter `app/**` ist deployt. Deshalb gab es keine GUI-Politur bei 375 px und 1440 px und keine Screenshots. Alle Seiten sind als Legacy in `app/README.md` markiert.

## Geprüfte Auslieferungswege

| Weg | Befund |
| --- | --- |
| `backend/indooro_server/src/main/resources/META-INF/resources/` | Enthält nur `index.html`, `admin/`, `customer/`, `assets/`, `images/`, `media/`-Pfade. Kein Verweis auf `app/`. |
| `backend/.../application.properties` (`public-static`) | Öffnet nur `/`, `/index.html`, `/assets/*`, `/media/*`, `/logos/*`, `/api/mobile/*`. Keine Route für `app/`. |
| `k8s/**` | Nur Backend, Keycloak, Postgres, OpenSearch, Ingress. Kein Static-Host für `app/`. |
| `docs/` (GitHub Pages, CNAME `www.indooro.at`) | Kein Link auf `app/`. |
| `.github/workflows/*` | Kein Schritt baut oder kopiert `app/`. |
| Verweise in Code und Docs | `docs/audit/SYSTEM_MAP.md` und `docs/pilot-readiness/01_PROJECT_AUDIT.md` führen `app/` als nicht deployt. Einziger Querverweis: `app/uploadPdf/index.html` auf `../launch_supermarkt/admin/index.html`. |

## Create-Responses

`app/launch_supermarkt/admin/editor.js` (POST auf den Layout-Endpunkt) und `app/uploadPdf/index.html` (POST `/api/convert/pdf-to-csv`) lesen keinen Create-Response-Body. Die Anpassung auf 201 + `Location` entfällt, weil keine der Seiten deployt ist.
