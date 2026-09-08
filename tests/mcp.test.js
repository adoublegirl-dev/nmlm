import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'module'
import { spawn } from 'child_process'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const { buildProfiles } = require('../src/main/services/mcpProfiles')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const children = new Set()
const servers = new Set()

afterEach(async () => {
  for (const child of children) child.kill()
  children.clear()
  await Promise.all([...servers].map((server) => new Promise((resolve) => server.close(resolve))))
  servers.clear()
})

describe('MCP compatibility', () => {
  it('builds platform wrappers from one direct stdio launcher without PowerShell', () => {
    const launcher = { command: 'C:\\Program Files\\Niuma\\牛马联盟.exe', args: ['C:\\Users\\测试\\mcp\\server.mjs'], env: { ELECTRON_RUN_AS_NODE: '1', NMLM_API: 'http://127.0.0.1:37129/api/call' } }
    const profiles = buildProfiles(launcher)

    expect(profiles.map((item) => item.id)).toEqual(['mcpServers', 'vscode', 'stdio'])
    expect(profiles[0].config.mcpServers['nmlm-todo']).toEqual(launcher)
    expect(profiles[1].config.servers['nmlm-todo']).toMatchObject({ type: 'stdio', ...launcher })
    expect(profiles[2].config).toMatchObject({ transport: 'stdio', ...launcher })
    expect(profiles.every((item) => !item.configJson.toLowerCase().includes('powershell'))).toBe(true)
  })

  it('completes initialize, tools/list and a real desktop API tool call over stdio', async () => {
    const apiServer = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        const request = JSON.parse(body)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(request.channel === 'ledger:current'
          ? { ok: true, entry: null }
          : { ok: false, error: 'unexpected channel' }))
      })
    })
    servers.add(apiServer)
    await new Promise((resolve) => apiServer.listen(0, '127.0.0.1', resolve))
    const { port } = apiServer.address()

    const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'mcp', 'server.mjs')], {
      env: { ...process.env, NMLM_API: `http://127.0.0.1:${port}/api/call` },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    children.add(child)

    const messages = await new Promise((resolve, reject) => {
      const received = []
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => reject(new Error(`MCP test timed out${stderr ? `: ${stderr}` : ''}`)), 5000)
      child.on('error', reject)
      child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8')
        const lines = stdout.split(/\r?\n/)
        stdout = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          received.push(JSON.parse(line))
          if (received.some((item) => item.id === 3)) {
            clearTimeout(timer)
            resolve(received)
          }
        }
      })
      const requests = [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nmlm_task_current', arguments: {} } }
      ]
      // Windows PowerShell 管道可能在第一行前附带 UTF-8 BOM，服务端也应兼容。
      child.stdin.write(`\uFEFF${requests.map((item) => JSON.stringify(item)).join('\n')}\n`)
    })

    expect(messages.find((item) => item.id === 1)?.result).toMatchObject({ protocolVersion: '2024-11-05', serverInfo: { name: 'nmlm' } })
    expect(messages.find((item) => item.id === 2)?.result.tools.length).toBeGreaterThanOrEqual(10)
    expect(messages.find((item) => item.id === 3)?.result.isError).toBeUndefined()
    expect(JSON.parse(messages.find((item) => item.id === 3).result.content[0].text)).toEqual({ ok: true, entry: null })
  })
})
