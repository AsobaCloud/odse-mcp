#!/usr/bin/env python3
"""ConvertToODSE — convert OEM telemetry to ODS-E records via odse.transformer.transform."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _odse_common import (  # noqa: E402
    detect_oem,
    extract_payload_fields,
    fail,
    list_supported_oems,
    ok,
    require_odse,
)


def _load_payload(payload: str | None, payload_file: str | None) -> str:
    if payload_file:
        path = Path(payload_file)
        if not path.is_file():
            fail(f"payload_file not found: {payload_file}")
        return path.read_text(encoding="utf-8")
    if payload is None:
        fail("payload is empty: provide payload text or payload_file")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert OEM telemetry to ODS-E")
    parser.add_argument("--payload", default=None)
    parser.add_argument("--payload-file", default=None)
    parser.add_argument("--source", default=None)
    parser.add_argument("--asset-id", default=None)
    parser.add_argument("--timezone", default=None)
    args = parser.parse_args()

    odse, transform, _validate_batch, version = require_odse()
    supported = list_supported_oems(transform)

    text = _load_payload(args.payload, args.payload_file)
    if not text.strip():
        fail("payload is empty")

    source = args.source
    detected = None

    if source:
        if source.lower() not in {s.lower() for s in supported}:
            fail(
                f"Unsupported source '{source}'. Supported OEM keys: {supported}",
                supported_oems=supported,
                odse_version=version,
            )
    else:
        fields = extract_payload_fields(text)
        candidates = detect_oem(fields, supported)
        if not candidates:
            fail(
                "No OEM could be detected from payload content. "
                f"Supply source explicitly. Supported OEM keys: {supported}",
                supported_oems=supported,
                odse_version=version,
            )
        if len(candidates) > 1:
            fail(
                f"OEM detection is ambiguous; candidates: {candidates}. "
                "Supply source explicitly.",
                candidates=candidates,
                odse_version=version,
            )
        source = candidates[0]
        detected = source

    kwargs = {}
    if args.asset_id:
        kwargs["asset_id"] = args.asset_id
    if args.timezone:
        kwargs["timezone"] = args.timezone

    try:
        records = transform(text, source=source, **kwargs)
    except Exception as e:
        fail(
            f"Conversion failed: {e}",
            source=source,
            odse_version=version,
        )
        return

    result = {
        "records": records,
        "count": len(records),
        "source": source,
        "odse_version": version,
    }
    if detected is not None:
        result["detected_source"] = detected
    ok(result)


if __name__ == "__main__":
    main()
