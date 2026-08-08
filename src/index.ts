import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import path from 'node:path'
import { loadToolConfigs } from './loader.js'
import { runTool } from './runner.js'

const workspaceRoot = process.env.ODSE_WORKSPACE ?? process.cwd()
const tools = loadToolConfigs()

const LIVE_FETCH_KEYS = new Set([
  'url',
  'fetch_url',
  'headers',
  'body',
  'request_body',
  'http_method',
])

const server = new Server(
  { name: 'odse-mcp', version: '1.0.1' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Array.from(tools.values()).map(config => ({
    name: config.name,
    description: config.description,
    inputSchema: config.input_schema,
  })),
}))

server.setRequestHandler(CallToolRequestSchema, async request => {
  const toolName = request.params.name
  const rawInput = (request.params.arguments ?? {}) as Record<
    string,
    string | number | boolean | undefined
  >

  const forbidden = Object.keys(rawInput).filter(k => LIVE_FETCH_KEYS.has(k))
  if (forbidden.length > 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Live-fetch conversion is not part of this release. Do not pass url, headers, or request body arguments.',
        },
      ],
      isError: true,
    }
  }

  const config = tools.get(toolName)
  if (!config) {
    return {
      content: [{ type: 'text' as const, text: `Unknown tool: ${toolName}` }],
      isError: true,
    }
  }

  const input = { ...rawInput }
  if (typeof input.payload_file === 'string' && !path.isAbsolute(input.payload_file)) {
    input.payload_file = path.resolve(workspaceRoot, input.payload_file)
  }

  const result = await runTool(config, input, workspaceRoot)

  return {
    content: [{ type: 'text' as const, text: result.content }],
    isError: result.is_error,
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(
  `[odse-mcp] Server ready. Workspace: ${workspaceRoot}. Tools: ${[...tools.keys()].join(', ')}`
)
