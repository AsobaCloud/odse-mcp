"""Shared helpers for odse-mcp Python tool scripts."""

from __future__ import annotations

import ast
import json
import re
import sys
from typing import Any, List


def require_odse():
    try:
        import odse
        from odse.transformer import transform
        from odse import validate_batch
    except ImportError:
        fail(
            "The 'odse' Python package is required but not installed. "
            "Install it with: pip install odse"
        )
    return odse, transform, validate_batch, odse.__version__


def ok(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, default=str), flush=True)
    sys.exit(0)


def fail(message: str, **extra: Any) -> None:
    body = {"error": message, **extra}
    print(json.dumps(body, default=str), flush=True)
    sys.exit(1)


def list_supported_oems(transform) -> List[str]:
    """Return OEM keys from the installed odse package transformer registry."""
    try:
        transform("x", source="__odse_mcp_probe__")
    except ValueError as e:
        match = re.search(r"Supported sources:\s*(\[.*\])", str(e), re.DOTALL)
        if not match:
            raise RuntimeError(f"Could not parse supported OEM list from odse: {e}") from e
        keys = ast.literal_eval(match.group(1))
        if not isinstance(keys, list) or not all(isinstance(k, str) for k in keys):
            raise RuntimeError(f"Unexpected OEM list shape from odse: {keys!r}") from e
        return keys
    raise RuntimeError("odse probe unexpectedly succeeded for unknown source")


def extract_payload_fields(text: str) -> set[str]:
    """Extract field/column names from CSV or JSON payload content (no path heuristics)."""
    text = text.strip()
    if not text:
        return set()

    # JSON object or array
    if text[0] in "{[":
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = None
        if data is not None:
            return _json_fields(data)

    # CSV: use header row
    first_line = text.splitlines()[0]
    if "," in first_line or "\t" in first_line:
        delim = "\t" if "\t" in first_line and first_line.count("\t") >= first_line.count(",") else ","
        return {c.strip().strip('"').strip("'") for c in first_line.split(delim) if c.strip()}

    return set()


def _json_fields(data: Any, prefix: str = "") -> set[str]:
    fields: set[str] = set()
    if isinstance(data, dict):
        for key, value in data.items():
            fields.add(str(key))
            if isinstance(value, (dict, list)):
                fields |= _json_fields(value, prefix=str(key))
    elif isinstance(data, list) and data:
        # Sample up to a few items for field discovery
        for item in data[:5]:
            fields |= _json_fields(item, prefix=prefix)
    return fields


# Distinctive content signatures for primary OEMs (aliases collapse to one primary).
# Matching is content-only; scored by how many signature tokens appear in field names.
OEM_SIGNATURES: dict[str, set[str]] = {
    "huawei": {
        "Active Power(kW)",
        "Inverter State",
        "Running State",
        "Run State",
        "PV Yield(kWh)",
        "Daily Yield(kWh)",
    },
    "enphase": {"end_at", "wh_del", "devices_reporting", "production"},
    "fronius": {"Head", "Body", "PAC", "TOTAL_ENERGY"},
    "solaredge": {"energyDetails", "meters", "siteCurrentPowerFlow", "overview"},
    "sma": {"normalized", "channel", "severity"},
    "sungrow": {"device_status", "total_energy", "ps_key", "point_id"},
    "solis": {"dataList", "records", "energyToday"},
    "solarman": {"deviceList", "dataList", "inversionVoltage"},
    "vestas": {"rotor_rpm", "wind_speed_ms", "nacelle"},
    "nordex": {"nordex", "rotor_rpm"},
    "siemens_gamesa": {"sgre", "siemens_gamesa"},
    "byd_bess": {"soc", "soh", "byd"},
    "sungrow_bess": {"powertitan", "soc", "soh"},
    "eskom_portal": {"eskom", "nrs049"},
    "eskom_amr": {"amr", "nrs049"},
    "terraco": {"terraco", "historian"},
    "higeco": {"higeco"},
    "switch": {"switch"},
    "solaxcloud": {"solax"},
    "fimer": {"auroravision", "fimer"},
}


def detect_oem(fields: set[str], supported: List[str]) -> List[str]:
    """Return supported OEM keys whose signatures match the payload fields."""
    field_lower = {f.lower() for f in fields}
    field_exact = fields

    scores: dict[str, int] = {}
    for oem, tokens in OEM_SIGNATURES.items():
        if oem not in supported and oem.replace("_", "-") not in supported:
            # only score OEMs odse actually supports (primary or alias)
            aliases = [oem, oem.replace("_", "-")]
            if not any(a in supported for a in aliases):
                continue
        score = 0
        for token in tokens:
            if token in field_exact or token.lower() in field_lower:
                score += 1
            else:
                # substring match for compound headers
                if any(token.lower() in f.lower() for f in fields):
                    score += 1
        if score > 0:
            # Prefer the key as it appears in supported list
            key = oem if oem in supported else next(
                (a for a in (oem, oem.replace("_", "-")) if a in supported), oem
            )
            scores[key] = max(scores.get(key, 0), score)

    if not scores:
        return []

    best = max(scores.values())
    return sorted(k for k, v in scores.items() if v == best)
