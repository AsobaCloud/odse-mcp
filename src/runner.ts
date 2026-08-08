import { spawn } from 'node:child_process'
import fs from 'node:fs'
import type { ToolConfig, ToolResult } from './types.js'
import { resolveScriptPath } from './loader.js'

const OUTPUT_CAP = 1_048_576 // 1MB

/**
 * Execute a declarative tool config.
 * Handles argument interpolation, timeout, and exit-code → is_error mapping.
 */
export async function runTool(
  config: ToolConfig,
  input: Record<string, string | number | boolean | undefined>,
  cwd: string
): Promise<ToolResult> {
  const scriptPath = resolveScriptPath(config)

  if (!fs.existsSync(scriptPath)) {
    return {
      content: `Script not found: ${scriptPath}`,
      is_error: true,
    }
  }

  const spawnArgs: string[] = []
  const templateArgs = config.execution.args ?? []
  for (let i = 0; i < templateArgs.length; i++) {
    const arg = templateArgs[i]
    if (arg.startsWith('{{') && arg.endsWith('}}')) {
      const key = arg.slice(2, -2)
      const val = input[key]
      if (val !== undefined) spawnArgs.push(String(val))
    } else {
      const next = templateArgs[i + 1]
      if (next?.startsWith('{{') && next?.endsWith('}}')) {
        const key = next.slice(2, -2)
        if (input[key] === undefined) {
          i++
          continue
        }
      }
      spawnArgs.push(arg)
    }
  }

  const cmd = config.execution.runtime
  const timeoutMs = Math.min(
    (typeof input.timeout === 'number' ? input.timeout : null) ??
      config.execution.default_timeout ??
      120_000,
    config.execution.max_timeout ?? 600_000
  )

  return new Promise(resolve => {
    const child = spawn(cmd, [scriptPath, ...spawnArgs], {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    child.stdout.on('data', (d: Buffer) => {
      if (stdout.length < OUTPUT_CAP) stdout += d.toString('utf8')
    })
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < OUTPUT_CAP) stderr += d.toString('utf8')
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.on('close', code => {
      clearTimeout(timer)

      if (timedOut) {
        resolve({
          content: `Operation timed out after ${timeoutMs}ms`,
          is_error: true,
        })
        return
      }

      if (code !== 0 && code !== 1) {
        resolve({
          content: stderr || `${config.name} exited with code ${code}`,
          is_error: true,
        })
        return
      }
      if (code === 1 && !stdout.trim()) {
        resolve({
          content: stderr || `${config.name} exited with code 1 and no output`,
          is_error: true,
        })
        return
      }
      resolve({ content: stdout, is_error: code === 1 })
    })

    child.on('error', e => {
      clearTimeout(timer)
      resolve({ content: String(e instanceof Error ? e.message : e), is_error: true })
    })
  })
}
