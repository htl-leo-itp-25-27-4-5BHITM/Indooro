# Indooro Motion Graphics V1 — Projektübergabe

**Stand:** 29. September 2026 · **Repository:** `Indooro` · **Branch:** `main` · **V1-Tag:** `indooro-motion-v1` (annotiert, auf dem abschließenden Handover-Commit). Diese Datei beschreibt den tatsächlich vorhandenen V1-Stand. Für V2 ist eine neue Konzeption nötig; die V1-OpenSpec-Dokumente sind keine fertige V2-Vorgabe.

## 1. Produkt, Auftrag und Geltungsbereich

Indooro ist ein Projekt der HTL Leonding für Orientierung und Produktsuche im Supermarkt. Die iOS-App soll Produkte auffindbar machen und einen Weg im Ladenplan anzeigen. Der größere Projektkontext enthält Indoor-Positionierung per BLE und weiteren Signalen, A*-Routing auf begehbaren Flächen, lokale Einkaufsplanung und eine Admin-Oberfläche zur Pflege von Ladenlayouts und Produktpositionen. Produktgrundlagen stehen im Repository-`README.md` und in `openspec/specs/`, besonders `project-overview`, `product-catalog-search`, `ios-store-map-experience`, `mobile-positioning-navigation`, `ios-product-planning` und `store-layout-management`.

V1 war als **65 Sekunden langer, deutsch beschrifteter, editierbarer Full-HD-Motion-Graphics-Film** für neue Zuschauer, Technikinteressierte, mögliche Partner, Lehrende und Website-Besucher angelegt. Der ursprüngliche Auftrag verlangte OpenSpec-Planung vor Implementierung, ein isoliertes Remotion-Projekt, acht Szenen, Musik und Effekte, Vorschau, Finalexport, Poster und Produktionsbericht. Die detaillierte ursprüngliche Aufgabenstellung wurde dem ersten Chat als Textdatei angehängt; alle für die Weiterarbeit maßgeblichen Produktionsentscheidungen stehen im aktuellen OpenSpec-Change.

Der Film verwendet **illustrative** App-, Karten- und Admin-Oberflächen, keine Screen-Aufnahmen und keinen echten Supermarktgrundriss. Weder eine SPAR-Partnerschaft noch gemessene Ortungsgenauigkeit, reale Zeitersparnis oder ein produktiv ausgerollter Dienst werden behauptet. Die lokale Tour ist ein Rechenbeispiel; die Kernnavigation und die größeren Produktpläne dürfen nicht miteinander verwechselt werden.

## 2. Ursprüngliches Konzept und tatsächlich umgesetzter Film

Die V1-Creative-Direction heißt „A route becomes clarity“: Eine mintfarbene Linie soll aus der schwierigen Suche zu einem klaren Weg führen. Dunkles Navy, Teal/Mint für aktive Navigation, sparsam Amber für Umwege, Off-White-Typografie, Inter und ein selbst gestaltetes Routen-Glyph bilden die visuelle Sprache. Das Storyboard sieht fließende Objekttransformationen vor. Die vorhandene Komposition verwendet überwiegend **15-Frame-Überblendungen** sowie wiederkehrende Karten-, Telefon- und Linienmotive. Die exakten Unterschiede zwischen Plan und Film sind in `openspec/changes/indooro-motion-graphics-film/implementation-notes.md` dokumentiert; das ursprüngliche Storyboard wurde nicht rückwirkend umgeschrieben.

| Szene | Globaler Framebereich / Zeit | Tatsächlicher Inhalt |
|---|---|---|
| 01 Problem | 0–179 / 0–6 s | Regalraster, absichtlich umständliche amberfarbene Linie, Frage nach Milch. |
| 02 Reveal | 180–389 / 6–13 s | Indooro-Glyph und Wortmarke, Support-Claim, illustriertes Telefon. |
| 03 Search | 390–689 / 13–23 s | Sucheingabe „Milch“, Ergebnis und Wechsel zu einer Kartenansicht im Telefon. |
| 04 Position | 690–1019 / 23–34 s | Beacon-Ringe, bewegter Positionspunkt auf dem begehbaren Korridor, Route. |
| 05 Route | 1020–1289 / 34–43 s | Graphknoten-Welle und per A* berechnete Milch-Route. Die Welle ist keine echte A*-Suchspur. |
| 06 List | 1290–1559 / 43–52 s | Vier Produkte, ineffiziente und verbesserte lokale Beispielroute; 59 gegenüber 31 Gitterschritten. |
| 07 Admin | 1560–1769 / 52–59 s | Illustrativer Layout-Editor mit Regalmarkierung und Produktzuordnung. |
| 08 Hero | 1770–1949 / 59–65 s | Wortmarke, „Finde deinen Weg.“, Telefon, Projektcredit. Der vollständig ruhige Schluss umfasst 85 Frames. |

Die acht Intervalle ergeben **1.950 Frames bei 30 fps**, also exakt 65,000 s Bildspur. Die AAC-Kodierung verlängert die MP4-Containerdauer geringfügig auf etwa 65,045 s. Die eigens registrierten Szenen und das Poster können unabhängig in Remotion Studio geöffnet werden.

## 3. Architektur und wichtige Dateien

`indooro-motion/` ist ein eigenständiges React-/TypeScript-Projekt mit **Remotion 4.0.530**. Die Abhängigkeiten stehen in `package.json` und `package-lock.json`; für Film oder Render ist weder der Indooro-Server noch die iOS-App nötig. Die Arbeitsumgebung benötigt Node 20+ und npm. Für den Film werden SVG, HTML/CSS, Remotion-Frame-Interpolation, die Remotion CLI und deren FFmpeg-basierte Ausgabepipeline eingesetzt. Es gibt kein 3D-Framework, keine externen Netzwerkassets während des Renderns und keinen Voiceover-Dienst.

| Pfad | Funktion |
|---|---|
| `indooro-motion/src/index.ts`, `src/Root.tsx` | Registrieren `IndooroFilm`, acht `IndooroScene*`-Kompositionen und `IndooroPoster`. |
| `indooro-motion/src/Film.tsx` | Fügt Szenen über `Sequence` zusammen, blendet 15 Frames über und bindet die WAV-Audiospur ein. |
| `indooro-motion/src/scenes/Scenes.tsx` | Enthält die acht editierbaren Szenen sowie die Poster-Komposition. |
| `indooro-motion/src/components/Visuals.tsx` | `Atmosphere`, Headline/Eyebrow, Konzeptlabel, Routen-Glyph/Wortmarke, `MapGraphic`, `Phone`. |
| `indooro-motion/src/design/tokens.ts` | Farbpalette, 30-fps-Konstante und genaue Szenenintervalle. |
| `indooro-motion/src/utils/motion.ts` | Geklemmte `interpolate`-Hilfen mit Cubic-Bezier-Easing. |
| `indooro-motion/src/data/store.ts` | Fester 18×11-Beispielgrundriss, Regalhindernisse, Produktzugänge, A*, Tourlänge, Nearest Neighbor und 2-opt. |
| `indooro-motion/src/data/store.test.ts` | Zwei Tests für begehbare Route und kürzere Beispiel-Tour. |
| `indooro-motion/scripts/generate-audio.mjs` | Reproduzierbare prozedurale Synthese der 65-s-Stereo-WAV. |
| `indooro-motion/remotion.config.ts` | Rspack, PNG-Zwischenbilder, Überschreiben lokaler Renderausgaben. |
| `indooro-motion/AGENTS.md`, `rules.md`, `README.md` | Projektkonventionen und Reproduktionsbefehle. |
| `openspec/changes/indooro-motion-graphics-film/` | Proposal, Design, Tasks, sechs Capability-Spezifikationen, Storyboard, Creative Direction, Pläne und V1-Abweichungen. |

Die Oberfläche im Film ist statisch beziehungsweise framebasiert und arbeitet mit Testdaten. `MapGraphic` zeichnet SVG-Regale, Gangraster, Marker und Linien. Die echte A*-Funktion in `store.ts` findet den dargestellten Einzelzielweg. Die in Szene 05 aufleuchtenden Punkte werden dagegen nach Manhattan-Abstand animiert; sie geben **nicht** die tatsächlich von A* expandierten Knoten wieder. In Szene 06 optimiert ein deterministischer Nearest-Neighbor/2-opt-Ablauf nur das lokale Beispiel. Die App-Oberfläche kommt aus `Phone` und erhält Daten nicht über Produkt-APIs.

Das System zeichnet Pfade über SVG-`strokeDashoffset`, blendet Text/Karten über framebasierte Opazität ein und bewegt 2D-Ebenen mit Skalierung und Rotation. Beacon-Ringe verwenden den aktuellen Frame. `Sequence` gibt jeder Szene einen lokalen Frame; keine Wandzeit-Animationen oder ungesetzte Zufallswerte bestimmen die Bildausgabe. Zwei unabhängige Render desselben Frames 810 hatten denselben SHA-256-Wert.

## 4. Assets, Lizenzen und fertige Dateien

Die Inter-Schrift kommt aus `@fontsource/inter`; die SIL-Open-Font-License ist in `indooro-motion/public/fonts/INTER-LICENSE.txt` abgelegt. Logo/Glyph, Karte, Telefon und UI sind mit Code gezeichnet. Die ursprünglich vorhandenen Indooro-Rasterlogos unter `logos/` dienten nur als Referenz; kein SPAR-Logo oder fremdes Bild wurde eingearbeitet. Die Musik stammt ausschließlich aus Oszillatoren und prozeduralem Rauschen in `scripts/generate-audio.mjs`, ohne Samples. Es gibt **keine Sprecherstimme**. Die Synthese legt lokal `indooro-motion/public/audio/indooro-original-score.wav` an und `Film.tsx` spielt diese mit Faktor 0,8 ab.

Die folgenden Medien liegen **lokal im ursprünglichen Workspace** `/Users/erikbergi/Documents/htl/Indooro/`, sind aber bewusst **nicht in Git**. Git LFS ist auf diesem Rechner nicht installiert; Git enthält ihre Quellen und `indooro-motion/exports/MANIFEST.sha256`, aber keine MP4-, Poster-PNG- oder WAV-Binärdaten. In einem separaten Git-Worktree oder einem frischen Checkout fehlen sie zunächst. Sie bleiben beim Chatwechsel im ursprünglichen Workspace verfügbar. Bei einem Wechsel auf einen anderen Rechner müssen die Binärdateien separat kopiert oder aus dem Tag neu gerendert werden.

| Datei | Stand / Verwendung |
|---|---|
| `indooro-motion/exports/indooro-motion-graphics-final.mp4` | Fertiger V1-Film, 1920×1080, H.264/yuv420p, 30 fps, 1.950 Frames, AAC 48 kHz; ca. 8,3 MB. |
| `indooro-motion/exports/indooro-motion-graphics-preview.mp4` | 960×540-Vorschau derselben Komposition; ca. 4,5 MB. |
| `indooro-motion/exports/indooro-poster.png` | 1920×1080-Still der Posterkomposition; ca. 364 KB. |
| `indooro-motion/public/audio/indooro-original-score.wav` | Lokal generierter 65-s-Stereo-PCM-Mix; ca. 11 MB. |
| `indooro-motion/exports/indooro-storyboard.md` | Gelieferte Kopie des **geplanten** Storyboards, nicht Shot-für-Shot-Abnahme. |
| `indooro-motion/exports/indooro-production-report.md` | Produktionsdaten, Prüfnachweise und Einschränkungen. |
| `indooro-motion/previews/` | Lokale Standbilder, Übergangsproben, Logs und Kontaktprüfungen; ebenfalls aus Git ausgeschlossen. |

Die tatsächlichen Binärhashes stehen in `indooro-motion/exports/MANIFEST.sha256`. Innerhalb von `indooro-motion/` des ursprünglichen Workspace prüft `shasum -a 256 -c exports/MANIFEST.sha256` die vier lokalen Dateien. Der WAV-Generator schreibt bei jedem Lauf dieselbe Quelldatei neu; bei Änderungen an Generator, Node-Version oder Code vor einem Manifestvergleich neu prüfen.

## 5. Arbeiten, prüfen und rendern

Vom Repository-Root aus:

```bash
cd indooro-motion
npm ci
npm run audio
npm run lint
npm run routes:test
npm run dev
```

Remotion Studio zeigt die Masterkomposition, acht Einzel-Szenen und das Poster. Für reine TypeScript-Prüfung dient `npm run typecheck`. Für die Lieferung wurden folgende Skripte verwendet:

```bash
npm run render:preview
npm run render:final
npm run render:poster
```

Die Renderbefehle überschreiben die entsprechenden Dateien in `exports/`; vor einer V2-Arbeit, die die V1-Exporte erhalten soll, die MP4s und das Poster-PNG nicht versehentlich mit neuen Rendern ersetzen. Ein gezieltes Still kann mit `npx remotion still IndooroPoster previews/poster-smoke.png` geprüft werden. Vom Repository-Root aus validiert `npx -y @fission-ai/openspec@1.3.1 validate --all --strict` die OpenSpec-Daten; in der V1-Produktion waren 39 Einträge gültig.

Die Remotion-Skills wurden lokal unter `.agents/skills/` installiert. Diese Kopien sind aus Git ausgeschlossen; `skills-lock.json` dokumentiert Quellen und Hashes. Falls sie in einer neuen Umgebung gebraucht werden, den offiziellen Satz erneut installieren. Die Arbeit am Motion-Projekt benötigt die Skills nicht zur Laufzeit.

## 6. Prüfstand, offene OpenSpec-Aufgaben und technische Grenzen

In der V1-Produktion bestanden ein sauberer `npm ci`, ESLint/TypeScript, beide Routentests, ein Poster-Smoke-Render, identische Renderhashes für Frame 810 und OpenSpec-Strict-Validation. Mehrere Stills aus allen Szenen sowie Bilder vor, an und nach allen sieben Schnittgrenzen wurden geprüft. Ein Textüberlappungsfehler in Szene 06 und ein sprunghafter Linien-Dash in der Eröffnung wurden im Quellstand korrigiert. Das finale MP4 und die Vorschau wurden per Media-Probe auf Auflösung, Codec, Pixel-Format, Bildrate, Framezahl, Laufzeit und Audiostream geprüft. Der WAV-Peak wurde mit −6,48 dBFS vor Remotion-Lautstärke gemessen; das ist ein **Signalwert, kein Hörurteil**.

Bei dieser Übergabe wurden `npm ci`, `npm run lint`, `npm run routes:test`, `npx remotion compositions`, ein frisches Poster-Testbild unter `previews/handover-poster-smoke.png`, OpenSpec Strict Validation (39/39) und alle vier SHA-256-Manifestprüfungen erneut erfolgreich ausgeführt. Beide MP4s wurden erneut mit Remotions gebündeltem `ffprobe` untersucht: Final 1920×1080, Vorschau 960×540, jeweils H.264/yuv420p, 30/1 fps, 1.950 Video-Frames, AAC 48 kHz, Container 65,045333 s. Das System-`ffprobe` ist auf diesem Mac nicht im Pfad; vom Projektordner aus funktioniert das gebündelte Tool mit `DYLD_LIBRARY_PATH="$PWD/node_modules/@remotion/compositor-darwin-arm64" node_modules/@remotion/compositor-darwin-arm64/ffprobe <datei>`.

Im OpenSpec-Change sind nach der abschließenden Quellcodeprüfung **vier Tasks offen**:

1. **6.5 A*-Erklärung:** Die angezeigte Suchwelle entspricht nicht der tatsächlichen A*-Expansion. Der finale Weg ist korrekt berechnet. Für V2 entweder eine echte Search-Trace-Animation erstellen oder die illustrative Welle bewusst anders spezifizieren.
2. **6.8 Hero-Haltezeit:** Der Projektcredit erscheint bis lokalem Frame 95; vollständig gesetzt hält das Schlussbild 85 statt der geplanten 90 Frames. Das Poster existiert.
3. **8.2 Audio hören:** Anfang, Mitte, Ende und hörbare Übergänge wurden nicht vollständig angehört. Signalpegel und Hüllkurve wurden technisch geprüft.
4. **9.1 Gesamtsichtung:** Stills, Kontakte und MP4-Metadaten liegen vor, aber das komplette 65-s-Video wurde in der damaligen Umgebung nicht fortlaufend mit und ohne Ton angesehen. Daher sind Pacing und Gesamtwirkung nicht abgenommen.

Die OpenSpec-Taskliste steht in `openspec/changes/indooro-motion-graphics-film/tasks.md`; `quality-checklist.md` markiert die dazugehörigen subjektiven und visuellen Prüfpunkte ebenfalls offen. `implementation-notes.md` nennt weitere konkrete Planabweichungen: keine physischen Line-/Map-Morphs, Suchscreen-Wechsel statt Auswahlpuls, keine Unsicherheitswolke, Crossfade statt sichtbarer Listenumsortierung und statischer Admin-Speicherstatus. Für die V2-Neukonzeption sind dies Ausgangsbefunde, keine Aufforderung zu einem stillen V1-Fix.

## 7. Kritik an V1 und Richtung für V2

**Direktes Feedback des Auftraggebers in diesem Chat:** Das Video ist insgesamt zu lang und zu wenig dynamisch; die nächste Fassung soll deutlich actionreicher und hochwertiger sein. Ein Mensch, der Indooro verwendet, kommt zu wenig vor. Die Geschichte soll stärker aus Nutzersicht erzählt werden. Das bisherige Sounddesign ist unbefriedigend; eine professionelle, natürliche **deutsche Sprecherstimme** fehlt. V2 soll eher ein **kurzer Premium-Werbespot** als ein technisches Erklärvideo werden. Dieses Feedback hat Vorrang vor der V1-Länge und dem im V1-Design ausdrücklich gewählten Verzicht auf Narration.

**Aus V1-Code und Artefakten überprüfbar:** Die Bildspur ist 65 Sekunden lang; alle acht Szenen setzen vor allem auf abstrahierte UI, Karte, Telefon und technische Beschriftungen. Es gibt keinen gefilmten oder animierten Menschen, keine Person im Supermarkt und keinen Voiceover-Track. Mehrere Übergänge sind Opazitätsblenden statt der im Storyboard skizzierten Objekttransformationen. Die Audioquelle ist prozedural und wiederholt ein zurückhaltendes Pattern. Diese Befunde erklären, warum der Film für die gewünschte Werbewirkung möglicherweise zu erklärend wirkt; eine abschließende Aussage über **gehörte** Soundqualität oder **erlebtes** Pacing ist mangels durchgehender Abnahme nicht technisch verifiziert.

**Empfohlener Startpunkt im nächsten Chat:** Vor einer Änderung die vorhandene V1-MP4 mit Ton vollständig sichten, Story und Laufzeit für V2 neu festlegen, eine Perspektive des einkaufenden Menschen konzipieren und Sprechertext/-aufnahme samt Rechten und Mischkonzept planen. Szenen, Karte, Wortmarke und Routing können selektiv wiederverwendet werden. Die V1-OpenSpec-Aufgaben sollten nicht automatisch als V2-Abnahme übernommen werden. Der Nutzer hat für diesen Chat ausdrücklich keine neuen Videofunktionen und keine kreative V2-Überarbeitung beauftragt.

## 8. Git- und Übergabestatus

Vor dieser V1-Sicherung war der letzte bestehende Commit `501e2f7 Stop tracking Xcode user state and record repository cleanup`; der gesamte Motion-Change lag ungetrackt vor. Die anschließenden Commits ordnen **den tatsächlich vorliegenden Endstand** in sachliche Gruppen. Sie behaupten keine rekonstruierte zeitliche Entwicklung und schreiben die vorherige Historie nicht um. Ein parallel entstandener V1-Rückblick steht zusätzlich in `docs/v1-production-history.md`. Der annotierte Tag `indooro-motion-v1` bezeichnet den abschließenden Handover-Commit auf `main`. Es wurde nichts gepusht.

Das lokale, bereits vor der Sicherung ungetrackte `documentation/LEOCLOUD_HOSTING_GUIDE_GENERAL.md` gehört nicht zum Motion-Projekt und wurde weder verändert noch in diese Commits aufgenommen. Ein anderer Arbeitszweig hat während der Übergabe zusätzlich `openspec/changes/indooro-premium-ad-v2/` angelegt; auch dieser V2-Ordner gehört nicht zum V1-Tag. `git status` im gemeinsam genutzten Checkout kann diese fremden Arbeiten anzeigen. Lokale Render- und Skill-Dateien sind per `.gitignore` ausgeschlossen und bleiben auf diesem Rechner erhalten.

Für Wiederverwendung: zuerst Tag oder Branch prüfen, dann `indooro-motion/README.md` und den OpenSpec-Change lesen; `Film.tsx`/`Scenes.tsx` liefern die Schnittstruktur, `Visuals.tsx` die wiederverwendbaren visuellen Bausteine und `store.ts` die Beispielgeometrie. Für eine neue Story kann dieselbe Architektur als Basis dienen, aber die V1-Komposition, der Storyboard-Zeitplan und die Klangästhetik sollten nicht ungeprüft übernommen werden.
