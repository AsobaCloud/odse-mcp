# @asobacloud/odse-mcp

MCP server for [ODS-E](https://github.com/AsobaCloud/odse) energy telemetry conversion. AI coding/data agents call its tools over the [Model Context Protocol](https://modelcontextprotocol.io/) to convert OEM payloads into ODS-E records and validate them via the published **`odse`** Python package.

[![npm](https://img.shields.io/npm/v/@asobacloud/odse-mcp.svg)](https://www.npmjs.com/package/@asobacloud/odse-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

The installed **`odse`** package is the source of truth for OEM support, transform behavior, and validation semantics.

## Requirements

| Runtime | Required for |
|---------|----------------|
| Node.js ≥ 22 | MCP server |
| Python 3 + [`odse`](https://pypi.org/project/odse/) | All tools (`pip install odse`) |

`python3` on `PATH` must be able to `import odse`.

## Quick start

Optional: set `ODSE_WORKSPACE` to an absolute path used when resolving relative `payload_file` values. If omitted, the server uses its process working directory. The server speaks MCP over **stdio**.

### Cursor

Add to `~/.cursor/mcp.json` or the project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "odse": {
      "command": "npx",
      "args": ["-y", "@asobacloud/odse-mcp"],
      "env": {
        "ODSE_WORKSPACE": "/absolute/path/to/your/data"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add --transport stdio --scope user \
  --env ODSE_WORKSPACE=/absolute/path/to/your/data \
  odse -- npx -y @asobacloud/odse-mcp
```

Or under `mcpServers` in project `.mcp.json` / `~/.claude.json`:

```json
{
  "mcpServers": {
    "odse": {
      "command": "npx",
      "args": ["-y", "@asobacloud/odse-mcp"],
      "env": {
        "ODSE_WORKSPACE": "/absolute/path/to/your/data"
      }
    }
  }
}
```

### Codex

```bash
codex mcp add odse --env ODSE_WORKSPACE=/absolute/path/to/your/data -- npx -y @asobacloud/odse-mcp
```

Or in `~/.codex/config.toml`:

```toml
[mcp_servers.odse]
command = "npx"
args = ["-y", "@asobacloud/odse-mcp"]

[mcp_servers.odse.env]
ODSE_WORKSPACE = "/absolute/path/to/your/data"
```

### Run directly

```bash
pip install odse
npx -y @asobacloud/odse-mcp
```

## Tools

| Tool | What it does |
|------|----------------|
| `ListSupportedOEMs` | Returns OEM source keys from the installed `odse` transformer registry, plus `odse.__version__`. |
| `ConvertToODSE` | Calls `odse.transformer.transform`. Pass `payload` text and/or `payload_file`. Optional `source`, `asset_id`, `timezone`, `timeout`. If `source` is omitted, OEM is auto-detected from payload **content** only. |
| `ValidateODSERecord` | Calls `odse.validate_batch` on a JSON **array** of records. |

### ConvertToODSE arguments

- `payload` — raw CSV/JSON text
- `payload_file` — path to a file (relative paths resolve against `ODSE_WORKSPACE`)
- `source` — OEM key (e.g. `huawei`); omit to auto-detect
- `asset_id` / `timezone` — forwarded to `odse.transform`
- `timeout` — ms (default `120000`, max `600000`)

Live-fetch arguments (`url`, `headers`, `body`, …) are rejected: not part of this release.

### Validation notes (odse-canonical)

`ValidateODSERecord` uses **`odse.validate_batch`**, not a separate JSON Schema checker. Behavior follows the installed package (for example, extra properties may be accepted; negative `kWh` rules follow `odse`, not a stricter schema interpretation).

## Local development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install odse
npm install
npm run build
npm test
```

## Publish

CI runs build + E2E on every push/PR (Node 22 + `pip install odse`). To publish:

1. Bump `version` in `package.json`
2. Create a GitHub Release
3. `.github/workflows/publish.yml` publishes to npm (Trusted Publisher / OIDC, or `NPM_TOKEN`)

## License

MIT — see [LICENSE](LICENSE).
