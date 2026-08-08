#!/usr/bin/env python3
"""ValidateODSERecord — validate ODS-E records via odse.validate_batch."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _odse_common import fail, ok, require_odse  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate ODS-E records")
    parser.add_argument("--records", required=True, help="JSON array of ODS-E records")
    parser.add_argument("--level", default="schema", help="odse validation level")
    args = parser.parse_args()

    _odse, _transform, validate_batch, version = require_odse()

    try:
        data = json.loads(args.records)
    except json.JSONDecodeError as e:
        fail(f"records must be valid JSON: {e}")
        return

    if not isinstance(data, list):
        fail("Expected shape is an array of records (JSON array of objects)")
        return
    if not all(isinstance(item, dict) for item in data):
        fail("Expected shape is an array of records (JSON array of objects)")
        return

    try:
        batch = validate_batch(data, level=args.level)
    except Exception as e:
        fail(f"Validation failed: {e}", odse_version=version)
        return

    errors = []
    for index, err in batch.errors:
        path = getattr(err, "path", None) or ""
        field = path[2:] if path.startswith("$.") else path
        errors.append(
            {
                "index": index,
                "field": field or None,
                "path": path,
                "message": getattr(err, "message", str(err)),
                "code": getattr(err, "code", None),
            }
        )

    ok(
        {
            "valid": batch.invalid == 0,
            "total": batch.total,
            "valid_count": batch.valid,
            "invalid_count": batch.invalid,
            "errors": errors,
            "summary": batch.summary,
            "level": args.level,
            "odse_version": version,
            "schema": "odse.validate_batch",
        }
    )


if __name__ == "__main__":
    main()
