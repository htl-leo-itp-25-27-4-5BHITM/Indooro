"""Loader for the shared beacon coverage rule (same JSON the Java CoverageRule reads).

Validation mirrors backend CoverageRule: min > 0, min <= max, radius within [min, max],
minBeaconsPerCell >= 1, maxLowCoverageShare within [0, 1].
"""
from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass

DEFAULT_RULE_PATH = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "backend", "indooro_server", "src", "main", "resources", "readiness", "coverage-rule.json",
))


class RuleError(Exception):
    """The coverage rule file is missing, unreadable or invalid."""


@dataclass(frozen=True)
class CoverageRule:
    radius_m: float
    min_radius_m: float
    max_radius_m: float
    min_beacons_per_cell: int
    max_low_coverage_share: float


def _number(root: dict, field: str) -> float:
    value = root.get(field)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise RuleError(f"Feld '{field}' fehlt oder ist keine Zahl.")
    return float(value)


def _integer(root: dict, field: str) -> int:
    value = root.get(field)
    if isinstance(value, bool) or not isinstance(value, int):
        raise RuleError(f"Feld '{field}' fehlt oder ist keine ganze Zahl.")
    return value


def parse_rule(document: object) -> CoverageRule:
    """Builds and validates a rule from an already decoded JSON document."""
    if not isinstance(document, dict):
        raise RuleError("Abdeckungsregel muss ein JSON-Objekt sein.")
    rule = CoverageRule(
        radius_m=_number(document, "radiusMeters"),
        min_radius_m=_number(document, "minRadiusMeters"),
        max_radius_m=_number(document, "maxRadiusMeters"),
        min_beacons_per_cell=_integer(document, "minBeaconsPerCell"),
        max_low_coverage_share=_number(document, "maxLowCoverageShare"),
    )
    if not rule.min_radius_m > 0 or rule.min_radius_m > rule.max_radius_m:
        raise RuleError("minRadiusMeters muss groesser als 0 und kleiner oder gleich maxRadiusMeters sein.")
    if not rule.min_radius_m <= rule.radius_m <= rule.max_radius_m:
        raise RuleError(f"radiusMeters muss zwischen {rule.min_radius_m} und {rule.max_radius_m} liegen.")
    if rule.min_beacons_per_cell < 1:
        raise RuleError("minBeaconsPerCell muss mindestens 1 sein.")
    if not 0.0 <= rule.max_low_coverage_share <= 1.0:
        raise RuleError("maxLowCoverageShare muss zwischen 0 und 1 liegen.")
    return rule


def load_rule(path: str | None = None) -> CoverageRule:
    """Reads and validates the rule file; defaults to the backend resource."""
    rule_path = path or DEFAULT_RULE_PATH
    try:
        with open(rule_path, encoding="utf-8") as handle:
            document = json.load(handle)
    except FileNotFoundError as missing:
        raise RuleError(f"Regeldatei nicht gefunden: {rule_path}") from missing
    except json.JSONDecodeError as broken:
        raise RuleError(f"Regeldatei ist kein gueltiges JSON: {broken}") from broken
    except OSError as unreadable:
        raise RuleError(f"Regeldatei kann nicht gelesen werden: {unreadable}") from unreadable
    return parse_rule(document)
