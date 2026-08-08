# <img src="https://raw.githubusercontent.com/AsobaCloud/odse-mcp/master/docs/odse.svg" alt="ODS-E" width="36" height="36" align="bottom" /> ODS-E Conversion

MCP server for [ODS-E](https://github.com/AsobaCloud/odse) energy telemetry conversion. AI coding/data agents call its tools over the [Model Context Protocol](https://modelcontextprotocol.io/) to convert OEM payloads into ODS-E records and validate them via the published [`odse`](https://pypi.org/project/odse/) Python package.

[![npm](https://img.shields.io/npm/v/@asobacloud/odse-mcp.svg)](https://www.npmjs.com/package/@asobacloud/odse-mcp)
[![CI](https://github.com/AsobaCloud/odse-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/AsobaCloud/odse-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

The installed **`odse`** package is the source of truth for OEM support, transform behavior, and validation semantics.

## Quick start

Set `ODSE_WORKSPACE` to an absolute path used when resolving relative `payload_file` values. If omitted, the server uses its process working directory. The server speaks MCP over **stdio** (no HTTP port).

**Prerequisite:** `python3` on `PATH` must be able to `import odse` (`pip install odse`).

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

Restart Cursor (or reload MCP servers), then ask the agent to convert or validate ODS-E data.

### Claude Code

CLI (user scope):

```bash
claude mcp add --transport stdio --scope user \
  --env ODSE_WORKSPACE=/absolute/path/to/your/data \
  odse -- npx -y @asobacloud/odse-mcp
```

Or put the same JSON under `mcpServers` in project `.mcp.json` (team-shared) or `~/.claude.json` (user-wide):

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

Verify with `claude mcp list`. Project `.mcp.json` servers need approval the first time you open the repo in Claude Code.

### Codex

CLI:

```bash
codex mcp add odse --env ODSE_WORKSPACE=/absolute/path/to/your/data -- npx -y @asobacloud/odse-mcp
```

Or edit `~/.codex/config.toml` (or project `.codex/config.toml` in a trusted project):

```toml
[mcp_servers.odse]
command = "npx"
args = ["-y", "@asobacloud/odse-mcp"]

[mcp_servers.odse.env]
ODSE_WORKSPACE = "/absolute/path/to/your/data"
```

Codex CLI, the IDE extension, and the ChatGPT desktop Codex host share this config.

### Run directly

```bash
pip install odse
npx -y @asobacloud/odse-mcp
```

## Tools

| Tool | Runtime | What it does |
|------|---------|----------------|
| `ListSupportedOEMs` | `python3` | Returns OEM source keys from the installed `odse` transformer registry, plus `odse.__version__`. |
| `ConvertToODSE` | `python3` | Calls `odse.transformer.transform` on raw CSV/JSON text or a file. Optional `source`, `asset_id`, `timezone`, `timeout`. If `source` is omitted, OEM is auto-detected from payload **content** only. |
| `ValidateODSERecord` | `python3` | Calls `odse.validate_batch` on a JSON **array** of records. |

### ConvertToODSE

| Argument | Description |
|----------|-------------|
| `payload` | Raw telemetry text (CSV or JSON) |
| `payload_file` | Path to a telemetry file (relative paths resolve against `ODSE_WORKSPACE`) |
| `source` | OEM key (e.g. `huawei`); omit to auto-detect |
| `asset_id` | Optional asset id forwarded to `odse.transform` |
| `timezone` | Optional timezone forwarded to `odse.transform` (e.g. `+02:00`) |
| `timeout` | Timeout in ms (default `120000`, max `600000`) |

Example (explicit source):

```json
{
  "name": "ConvertToODSE",
  "arguments": {
    "source": "huawei",
    "payload": "Time,Active Power(kW),Inverter State\n2024-01-01 12:00:00,12.0,0\n"
  }
}
```

Successful responses are JSON on the tool text channel, for example:

```json
{
  "records": [
    {
      "timestamp": "2024-01-01T12:00:00Z",
      "kWh": 1.0,
      "error_type": "normal",
      "error_code": "0"
    }
  ],
  "count": 1,
  "source": "huawei",
  "odse_version": "0.8.2"
}
```

Live-fetch arguments (`url`, `headers`, `body`, …) are rejected: not part of this release.

### ValidateODSERecord

Pass `records` as a **JSON string** of an array of objects. Optional `level` is forwarded to `odse.validate_batch` (default `schema`).

```json
{
  "name": "ValidateODSERecord",
  "arguments": {
    "records": "[{\"timestamp\":\"2024-01-01T12:00:00Z\",\"kWh\":1.0,\"error_type\":\"normal\"}]"
  }
}
```

Validation follows **`odse.validate_batch`** package semantics (not a separate JSON Schema checker). Extra properties and numeric bounds behave as the installed `odse` version defines them.

Tool exit code `1` becomes `isError: true` on the MCP result. Unexpected crashes are reported as errors.

## Requirements

| Runtime | Required for |
|---------|----------------|
| Node.js ≥ 22 | MCP server |
| Python 3 + [`odse`](https://pypi.org/project/odse/) | All tools (`pip install odse`) |

## Architecture

```
rules/*.json          → tool schemas + execution specs
scripts/*.py          → odse wrappers (list / convert / validate)
src/loader.ts         → bundled rules
src/runner.ts         → spawn, timeouts, exit-code → isError
src/index.ts          → MCP stdio server
bin/cli.js            → npx / bin entrypoint
```

## Development

```bash
git clone https://github.com/AsobaCloud/odse-mcp.git
cd odse-mcp
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install odse
npm install
npm run build
npm test
```

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm test` | E2E via real MCP `Client` + fixture assertions |
| `npm start` | Run the server on stdio |
| `npm run dev` | `node --watch` on `dist/` |

Local MCP config (instead of npx):

```json
{
  "mcpServers": {
    "odse": {
      "command": "node",
      "args": ["/absolute/path/to/odse-mcp/dist/index.js"],
      "env": {
        "ODSE_WORKSPACE": "/absolute/path/to/your/data",
        "PATH": "/absolute/path/to/odse-mcp/.venv/bin:/usr/bin:/bin"
      }
    }
  }
}
```

Ensure the `PATH` (or environment) makes `python3` resolve to an interpreter that can `import odse`.

## Releasing

CI runs build + E2E on every push/PR (Node 22 + `pip install odse`). To publish a new version:

1. Bump `version` in `package.json`
2. Commit, push, and create a GitHub Release (`gh release create vX.Y.Z --generate-notes`)
3. `.github/workflows/publish.yml` publishes to npm (Trusted Publisher / OIDC, or `NPM_TOKEN` if configured)

## License

MIT © [Asoba](https://asoba.co)
