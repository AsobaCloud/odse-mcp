#!/usr/bin/env python3
"""ListSupportedOEMs — return OEM keys + odse version from the installed package."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _odse_common import fail, list_supported_oems, ok, require_odse  # noqa: E402


def main() -> None:
    odse, transform, _validate_batch, version = require_odse()
    try:
        oems = list_supported_oems(transform)
    except Exception as e:
        fail(str(e))
        return

    ok(
        {
            "oems": oems,
            "odse_version": version,
            "count": len(oems),
        }
    )


if __name__ == "__main__":
    main()
