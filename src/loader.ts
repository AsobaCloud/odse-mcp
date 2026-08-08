import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ToolConfig } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BUNDLED_RULES_DIR = path.join(__dirname, '..', 'rules')

/** Load tool configs from the bundled rules directory. */
export function loadToolConfigs(): Map<string, ToolConfig> {
  const tools = new Map<string, ToolConfig>()

  if (!fs.existsSync(BUNDLED_RULES_DIR)) {
    return tools
  }

  for (const file of fs.readdirSync(BUNDLED_RULES_DIR)) {
    if (!file.endsWith('.json')) continue
    try {
      const config: ToolConfig = JSON.parse(
        fs.readFileSync(path.join(BUNDLED_RULES_DIR, file), 'utf8')
      )
      tools.set(config.name, config)
    } catch (e) {
      console.error(`[odse-mcp] Failed to load bundled rule: ${file}`, e)
    }
  }

  return tools
}

/** Resolve the absolute script path for a tool config (relative to package root). */
export function resolveScriptPath(config: ToolConfig): string {
  const scriptPath = config.execution.script
  if (path.isAbsolute(scriptPath)) return scriptPath
  return path.resolve(__dirname, '..', scriptPath)
}
