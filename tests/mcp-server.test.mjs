/**
 * End-to-end validation of odse-mcp.
 *
 * Uses the real MCP Client + StdioClientTransport against the built server.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SERVER = path.join(ROOT, 'dist', 'index.js')
const FIXTURES = path.join(__dirname, 'fixtures')

const REQUIRED_TOOLS = ['ListSupportedOEMs', 'ConvertToODSE', 'ValidateODSERecord']

function textOf(result) {
  assert.ok(Array.isArray(result.content), 'tool result must include content[]')
  const text = result.content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n')
  assert.ok(text.length > 0, 'tool result text must be non-empty')
  return text
}

function parseJson(result) {
  return JSON.parse(textOf(result))
}

function assertOk(result) {
  assert.ok(!result.isError, `expected success, got: ${textOf(result)}`)
}

function assertErr(result) {
  assert.equal(result.isError, true, `expected isError, got: ${textOf(result)}`)
}

function pythonPath() {
  const venvBin = path.join(ROOT, '.venv', 'bin')
  const parts = [venvBin, process.env.PATH ?? ''].filter(Boolean)
  return parts.join(path.delimiter)
}

async function withClient(workspace, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: {
      ...getDefaultEnvironment(),
      ODSE_WORKSPACE: workspace,
      PATH: pythonPath(),
    },
    stderr: 'pipe',
  })

  const client = new Client({ name: 'odse-mcp-test', version: '1.0.0' })
  await client.connect(transport)

  try {
    return await fn(client)
  } finally {
    await client.close().catch(() => {})
  }
}

async function runTests() {
  console.log('\nE2E: odse-mcp via real MCP Client\n')

  assert.ok(fs.existsSync(SERVER), `Build missing: ${SERVER} (run npm run build)`)

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'odse-mcp-e2e-'))
  fs.copyFileSync(path.join(FIXTURES, 'huawei.csv'), path.join(workspace, 'huawei.csv'))
  fs.copyFileSync(path.join(FIXTURES, 'enphase.json'), path.join(workspace, 'enphase.json'))
  fs.copyFileSync(path.join(FIXTURES, 'huawei_kpi.csv'), path.join(workspace, 'huawei_kpi.csv'))

  await withClient(workspace, async client => {
    let step = 0
    const next = label => {
      step += 1
      console.log(`${step}. ${label}...`)
    }

    next('listTools returns the three bundled tools')
    const listed = await client.listTools()
    const names = listed.tools.map(t => t.name).sort()
    assert.deepEqual(names, [...REQUIRED_TOOLS].sort())
    console.log('   ✓ ListSupportedOEMs, ConvertToODSE, ValidateODSERecord')

    next('ListSupportedOEMs returns OEM keys and odse version')
    const oemsResult = await client.callTool({ name: 'ListSupportedOEMs', arguments: {} })
    assertOk(oemsResult)
    const oemsBody = parseJson(oemsResult)
    assert.ok(Array.isArray(oemsBody.oems) && oemsBody.oems.length > 0)
    assert.ok(oemsBody.oems.includes('huawei'))
    assert.equal(typeof oemsBody.odse_version, 'string')
    assert.ok(oemsBody.odse_version.length > 0)
    console.log(`   ✓ ${oemsBody.count} OEMs, odse ${oemsBody.odse_version}`)

    next('ConvertToODSE with explicit huawei source')
    const huaweiPayload = fs.readFileSync(path.join(workspace, 'huawei.csv'), 'utf8')
    const convert = await client.callTool({
      name: 'ConvertToODSE',
      arguments: { payload: huaweiPayload, source: 'huawei' },
    })
    assertOk(convert)
    const converted = parseJson(convert)
    assert.equal(converted.source, 'huawei')
    assert.ok(converted.count >= 1)
    const rec = converted.records[0]
    assert.ok(rec.timestamp && typeof rec.kWh === 'number' && rec.error_type)
    assert.equal(typeof converted.odse_version, 'string')
    console.log('   ✓ records include timestamp, kWh, error_type')

    next('ConvertToODSE rejects unsupported source')
    const badSource = await client.callTool({
      name: 'ConvertToODSE',
      arguments: { payload: huaweiPayload, source: 'acme-inverter' },
    })
    assertErr(badSource)
    const badSourceText = textOf(badSource)
    assert.match(badSourceText, /acme-inverter/i)
    assert.match(badSourceText, /huawei/)
    console.log('   ✓ unsupported source names OEM and lists supported keys')

    next('ConvertToODSE rejects empty payload')
    const empty = await client.callTool({
      name: 'ConvertToODSE',
      arguments: { payload: '   ' },
    })
    assertErr(empty)
    assert.match(textOf(empty), /empty/i)
    console.log('   ✓ empty payload isError')

    next('ConvertToODSE auto-detects enphase from content')
    const enphasePayload = fs.readFileSync(path.join(workspace, 'enphase.json'), 'utf8')
    const detected = await client.callTool({
      name: 'ConvertToODSE',
      arguments: { payload: enphasePayload },
    })
    assertOk(detected)
    const detectedBody = parseJson(detected)
    assert.equal(detectedBody.detected_source, 'enphase')
    assert.ok(detectedBody.count >= 1)
    console.log('   ✓ detected_source=enphase')

    next('ConvertToODSE resolves relative payload_file')
    const fromFile = await client.callTool({
      name: 'ConvertToODSE',
      arguments: { payload_file: 'huawei.csv', source: 'huawei' },
    })
    assertOk(fromFile)
    assert.ok(parseJson(fromFile).count >= 1)
    console.log('   ✓ relative payload_file resolved')

    next('ConvertToODSE maps per-phase Huawei KPI columns (odse 0.11.0)')
    const kpiPayload = fs.readFileSync(path.join(workspace, 'huawei_kpi.csv'), 'utf8')
    const kpi = await client.callTool({
      name: 'ConvertToODSE',
      arguments: { payload: kpiPayload, source: 'huawei' },
    })
    assertOk(kpi)
    const kpiBody = parseJson(kpi)
    assert.ok(kpiBody.count >= 1)
    const kpiRec = kpiBody.records[0]
    // SEP-051: FusionSolar KPI columns map to per-phase + DC + power fields
    assert.ok(kpiRec.voltage_ac_l1 !== undefined && typeof kpiRec.voltage_ac_l1 === 'number')
    assert.ok(kpiRec.voltage_ac_l2 !== undefined && typeof kpiRec.voltage_ac_l2 === 'number')
    assert.ok(kpiRec.voltage_ac_l3 !== undefined && typeof kpiRec.voltage_ac_l3 === 'number')
    assert.equal(kpiRec.voltage_dc, 580.3)
    assert.equal(kpiRec.kW, 12.05)
    console.log('   ✓ a_u/b_u/c_u → voltage_ac_l1/l2/l3, pv1_u → voltage_dc, active_power → kW')

    next('ValidateODSERecord accepts conformant array')
    const validRecs = JSON.stringify([
      { timestamp: '2024-01-01T12:00:00Z', kWh: 1.0, error_type: 'normal' },
    ])
    const valid = await client.callTool({
      name: 'ValidateODSERecord',
      arguments: { records: validRecs },
    })
    assertOk(valid)
    const validBody = parseJson(valid)
    assert.equal(validBody.valid, true)
    assert.equal(typeof validBody.odse_version, 'string')
    console.log('   ✓ valid=true with odse_version')

    next('ValidateODSERecord flags missing error_type')
    const missing = await client.callTool({
      name: 'ValidateODSERecord',
      arguments: {
        records: JSON.stringify([
          { timestamp: '2024-01-01T12:00:00Z', kWh: 1.0, error_type: 'normal' },
          { timestamp: '2024-01-01T12:00:00Z', kWh: 1.0 },
        ]),
      },
    })
    assertOk(missing)
    const missingBody = parseJson(missing)
    assert.equal(missingBody.valid, false)
    assert.ok(missingBody.errors.some(e => e.index === 1 && /error_type/.test(e.field || e.message)))
    console.log('   ✓ invalid with index + field')

    next('ValidateODSERecord rejects non-array input')
    const notArray = await client.callTool({
      name: 'ValidateODSERecord',
      arguments: {
        records: JSON.stringify({
          timestamp: '2024-01-01T12:00:00Z',
          kWh: 1.0,
          error_type: 'normal',
        }),
      },
    })
    assertErr(notArray)
    assert.match(textOf(notArray), /array of records/i)
    console.log('   ✓ non-array isError')

    next('Live-fetch args are rejected')
    const live = await client.callTool({
      name: 'ConvertToODSE',
      arguments: { payload: huaweiPayload, url: 'https://example.com/data' },
    })
    assertErr(live)
    assert.match(textOf(live), /live-fetch/i)
    console.log('   ✓ live-fetch not part of this release')

    next('Unknown tool returns isError without crashing the session')
    const unknown = await client.callTool({ name: 'NotARealTool', arguments: {} })
    assertErr(unknown)
    assert.match(textOf(unknown), /Unknown tool/)
    const stillOk = await client.listTools()
    assert.ok(stillOk.tools.length >= 3)
    console.log('   ✓ session still healthy')
  })

  fs.rmSync(workspace, { recursive: true, force: true })
  console.log('\n✓ All E2E MCP validations passed\n')
}

runTests().catch(err => {
  console.error('\n✗ E2E failed:', err)
  process.exit(1)
})
