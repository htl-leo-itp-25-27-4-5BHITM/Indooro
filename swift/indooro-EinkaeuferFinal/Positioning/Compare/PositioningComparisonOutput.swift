import Foundation
import simd

extension PositioningComparisonResult {
    // MARK: - JSON (`indooro-position-comparison/1`)

    /// JSON for `tools/beacon-lab` (`src/data/positionComparison.ts`): two methods on the same epochs.
    /// Positions are metres (layout units, 1 cell = 1 m), rounded to 1e-6. `position: null` means the pipeline
    /// displayed nothing in that epoch (an outage when truth exists). Keys are sorted, so equal input gives equal bytes.
    public func json() throws -> Data {
        func point(_ x: Double, _ y: Double) -> [String: Any] {
            ["x": Self.round6(x), "y": Self.round6(y)]
        }
        func point(_ p: SIMD2<Float>?) -> Any {
            p.map { point(Double($0.x), Double($0.y)) } ?? NSNull()
        }

        var methods: [[String: Any]] = []
        for method in PositioningMethod.allCases {
            methods.append(["id": method.rawValue, "label": method.label])
        }

        var rows: [[String: Any]] = []
        rows.reserveCapacity(epochs.count)
        for epoch in epochs {
            var row: [String: Any] = [
                "t": Self.round6(epoch.t),
                "truth": epoch.truth.map { point($0.x, $0.y) } ?? NSNull(),
            ]
            for method in PositioningMethod.allCases {
                let tick = epoch.tick(method)
                row[method.rawValue] = [
                    "position": point(tick.displayed),
                    "raw": point(tick.solved),
                    "confidence": Self.round6(Double(tick.confidence)),
                    "beacons": tick.beaconsUsed,
                    "trusted": tick.trusted,
                ] as [String: Any]
            }
            rows.append(row)
        }

        var summary: [String: Any] = [:]
        for method in PositioningMethod.allCases {
            summary[method.rawValue] = Self.metricsDictionary(metrics(method))
        }

        let sessionObject: Any = session.map {
            [
                "schema": $0.schema,
                "app": $0.app,
                "deviceModel": $0.deviceModel,
                "os": $0.os,
                "scenario": $0.scenario?.rawValue ?? NSNull(),
                "role": $0.role?.rawValue ?? NSNull(),
            ] as [String: Any]
        } ?? NSNull()

        let object: [String: Any] = [
            "schema": PositioningComparison.schema,
            "origin": isSynthetic ? "synthetic" : "field",
            "unit": "m",
            "recording": [
                "name": recordingName,
                "lines": recordingLineCount,
                "sha256": recordingSHA256,
            ] as [String: Any],
            "session": sessionObject,
            "layout": [
                "shopName": layout.shopName,
                "gridWidth": layout.gridSize.width,
                "gridHeight": layout.gridSize.height,
            ] as [String: Any],
            "config": [
                "updateIntervalSeconds": config.beacon.updateIntervalSeconds,
                "warmupSeconds": config.beacon.warmupSeconds,
                "lowConfidenceThreshold": Double(config.confidence.lowThreshold),
                "motionAided": false,
            ] as [String: Any],
            "methods": methods,
            "epochs": rows,
            "summary": summary,
            "warnings": warnings,
        ]
        return try JSONSerialization.data(
            withJSONObject: object,
            options: [.sortedKeys, .withoutEscapingSlashes]
        ) + Data("\n".utf8)
    }

    private static func metricsDictionary(_ m: PathMetrics) -> [String: Any] {
        func v(_ value: Double?) -> Any { value.map { round6($0) } ?? NSNull() }
        return [
            "epochs": m.epochs,
            "epochsWithTruth": m.epochsWithTruth,
            "validEstimates": m.validEstimates,
            "failedEstimates": m.failedEstimates,
            "outageRate": v(m.outageRate),
            "mean": v(m.mean),
            "median": v(m.median),
            "rmse": v(m.rmse),
            "p90": v(m.p90),
            "p95": v(m.p95),
            "max": v(m.max),
            "within2": v(m.within2),
            "within3": v(m.within3),
            "within5": v(m.within5),
            "pairs": m.pairs,
            "jumps": m.jumps,
            "jumpRate": v(m.jumpRate),
        ]
    }

    static func round6(_ value: Double) -> Double {
        (value * 1_000_000).rounded() / 1_000_000
    }

    // MARK: - Warnings

    /// Limits of this result that a reader must see next to the numbers.
    var warnings: [String] {
        var list: [String] = []
        if isSynthetic {
            list.append("SYNTHETISCH: erzeugte Daten, keine Messung. Die Zahlen zeigen nur, dass die Kette laeuft.")
        }
        list.append(
            "Beide Pfade nutzen dieselbe PositioningPipeline (Messspeicher, Solver, Schaetzer, Projektion). "
            + "Verglichen wird die Orchestrierung der Engine (Zuordnung der Samples, Aufwaermphase, Tick-Takt), "
            + "nicht die Funkschicht (CoreLocationBeaconRadio gegen BeaconManager)."
        )
        list.append(
            "Referenz: zwischen zwei Wahrheitsmarken linear interpoliert (Annahme: konstante Gehgeschwindigkeit), "
            + "bei gleicher Position in aufeinanderfolgenden Marken Haltepunkt. Die Referenz ist selbst unsicher."
        )
        if session == nil {
            list.append("Keine session-Zeile (Format 1): Rolle und Szenario sind unbekannt.")
        } else if session?.role == .calibration {
            list.append("Rolle calibration: diese Aufnahme zaehlt nicht zur Bewertung (POSITIONING_DECISION.md).")
        } else if session?.role == nil {
            list.append("Die session-Zeile nennt keine Rolle: unklar, ob Kalibrierung oder Bewertung.")
        }
        if !hasEvaluableEpochs {
            list.append("Keine Epoche mit Referenz: es sind keine Kennzahlen berechenbar.")
        } else {
            let smallest = min(currentMetrics.validEstimates, engineMetrics.validEstimates)
            if smallest < 100 {
                list.append("Weniger als 100 gueltige Epochen: P90 und P95 sind explorativ.")
            }
        }
        if unmappedEngineMeasurements > 0 {
            list.append(
                "\(unmappedEngineMeasurements) Messungen konnte der BeaconCatalog der Engine nicht dem aufgezeichneten Beacon "
                + "zuordnen (Layout ohne UUID/Major/Minor?); die aktuelle Pipeline hat sie genutzt."
            )
        }
        list.append("Eine Aufnahme ist ein Lauf. Die Entscheidungsregel verlangt mindestens 3 Bewertungslaeufe.")
        return list
    }

    // MARK: - Text summary

    /// Short German summary for the team: both pipelines side by side.
    public func summaryText() -> String {
        var out: [String] = []
        out.append("POSITIONSVERGLEICH: aktuelle App-Pipeline gegen PositioningEngine")
        if isSynthetic {
            out.append("")
            out.append("*** SYNTHETISCH, KEINE MESSUNG. Diese Zahlen nie als Messergebnis zitieren. ***")
        }
        out.append("")
        out.append("Aufnahme: \(recordingName) (\(recordingLineCount) Zeilen, SHA-256 \(recordingSHA256.prefix(12)))")
        out.append("Layout:   \(layout.shopName), Raster \(Int(layout.gridSize.width)) x \(Int(layout.gridSize.height)), Einheit m (1 Zelle = 1 m)")
        if let session {
            let scenario = session.scenario?.rawValue ?? "unbekannt"
            let role = session.role?.rawValue ?? "unbekannt"
            out.append("Lauf:     Rolle \(role), Szenario \(scenario), \(session.deviceModel), \(session.os), App \(session.app)")
        } else {
            out.append("Lauf:     keine session-Zeile (Format 1), Rolle und Szenario unbekannt")
        }
        out.append(
            "Takt:     Tick \(Self.num(config.beacon.updateIntervalSeconds, 2)) s, Aufwaermphase "
            + "\(Self.num(config.beacon.warmupSeconds, 1)) s (beide Pfade gleich), Bewegungsmodell aus"
        )
        out.append(
            "Epochen:  \(epochs.count) Ticks nach der Aufwaermphase, davon \(currentMetrics.epochsWithTruth) mit Referenz"
        )
        out.append("")

        guard hasEvaluableEpochs else {
            out.append("Keine Epoche mit Referenz (Wahrheitsmarken fehlen oder liegen ausserhalb): keine Kennzahlen.")
            appendFooter(to: &out)
            return out.joined(separator: "\n") + "\n"
        }

        let rows: [(String, (PathMetrics) -> String, (PathMetrics, PathMetrics) -> String)] = [
            ("Median (m)", { Self.num($0.median, 3) }, { Self.delta($0.median, $1.median, 3) }),
            ("P90 (m)", { Self.num($0.p90, 3) }, { Self.delta($0.p90, $1.p90, 3) }),
            ("P95 (m)", { Self.num($0.p95, 3) }, { Self.delta($0.p95, $1.p95, 3) }),
            ("Anteil <= 2 m", { Self.percent($0.within2) }, { Self.deltaPercent($0.within2, $1.within2) }),
            ("Anteil <= 3 m", { Self.percent($0.within3) }, { Self.deltaPercent($0.within3, $1.within3) }),
            ("Anteil <= 5 m", { Self.percent($0.within5) }, { Self.deltaPercent($0.within5, $1.within5) }),
            ("Ausfallrate", { Self.percent($0.outageRate) }, { Self.deltaPercent($0.outageRate, $1.outageRate) }),
            ("Sprungrate", { Self.percent($0.jumpRate) }, { Self.deltaPercent($0.jumpRate, $1.jumpRate) }),
        ]
        let labelWidth = 16
        let columnWidth = 14
        func pad(_ text: String, _ width: Int) -> String {
            text.count >= width ? text : text + String(repeating: " ", count: width - text.count)
        }
        out.append(pad("Kennzahl", labelWidth) + pad("Aktuell", columnWidth) + pad("Engine", columnWidth) + "Engine minus Aktuell")
        for (label, format, difference) in rows {
            out.append(
                pad(label, labelWidth) + pad(format(currentMetrics), columnWidth)
                + pad(format(engineMetrics), columnWidth) + difference(currentMetrics, engineMetrics)
            )
        }
        out.append("")
        out.append(
            "Gueltige Schaetzungen: aktuell \(currentMetrics.validEstimates), Engine \(engineMetrics.validEstimates) "
            + "von \(currentMetrics.epochsWithTruth) Epochen mit Referenz; Sprung-Paare: \(currentMetrics.pairs) / \(engineMetrics.pairs)."
        )
        let agreement = agreement
        out.append(
            "Uebereinstimmung: in \(agreement.equalEpochs) von \(epochs.count) Epochen zeigen beide Pfade dieselbe Position "
            + "(groesste Abweichung \(Self.num(agreement.maxDistanceMeters, 3)) m)."
        )
        appendFooter(to: &out)
        return out.joined(separator: "\n") + "\n"
    }

    private func appendFooter(to out: inout [String]) {
        out.append("")
        out.append("Hinweise:")
        for warning in warnings { out.append("- " + warning) }
        out.append("- Definitionen der Kennzahlen: tools/beacon-lab/docs/METRICS.md. Entscheidungsregel: docs/pilot-readiness/hardware/POSITIONING_DECISION.md.")
    }

    // MARK: - Formatting

    private static func num(_ value: Double?, _ digits: Int) -> String {
        guard let value, value.isFinite else { return "n. b." }
        return String(format: "%.\(digits)f", value)
    }

    private static func percent(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "n. b." }
        return String(format: "%.1f %%", value * 100)
    }

    private static func delta(_ current: Double?, _ engine: Double?, _ digits: Int) -> String {
        guard let current, let engine else { return "n. b." }
        return String(format: "%+.\(digits)f", engine - current)
    }

    private static func deltaPercent(_ current: Double?, _ engine: Double?) -> String {
        guard let current, let engine else { return "n. b." }
        return String(format: "%+.1f Prozentpunkte", (engine - current) * 100)
    }
}
