// ============================================================
// MCP Client — 基于官方 @modelcontextprotocol/sdk
// 支持 stdio + SSE 两种传输方式
// ============================================================
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { McpServerConfig, ToolDefinition } from '../../shared/types'
import { registerTool, unregisterToolsBySource, type ToolHandler, type ToolContext } from '../tools/registry'
import { log } from '../llm/provider'

interface ActiveConnection {
  client: Client
  config: McpServerConfig
}

const connections = new Map<string, ActiveConnection>()

/**
 * 连接一个 MCP Server，注册其所有工具
 */
export async function connectMcpServer(config: McpServerConfig): Promise<void> {
  if (!config.enabled) {
    log('info', `MCP server "${config.name}" is disabled, skipping`)
    return
  }

  // 如果已存在先断开
  await disconnectMcpServer(config.id)

  try {
    // ---- 解析 command/args ----
    let cmd = config.command!
    let cmdArgs = config.args || []

    // 如果 command 含空格且没有单独的 args，自动拆分
    if (!cmdArgs.length && cmd.includes(' ')) {
      const parts = cmd.split(/\s+/)
      cmd = parts[0]
      cmdArgs = parts.slice(1)
    }

    // Windows: npx/npm 等 .cmd 脚本需要通过 cmd /c 调用
    if (process.platform === 'win32') {
      if (cmd === 'npx' || cmd === 'npm' || cmd === 'node' || cmd.endsWith('.cmd')) {
        cmdArgs = ['/c', cmd, ...cmdArgs]
        cmd = 'cmd'
      }
    }

    const transport = config.type === 'stdio'
      ? new StdioClientTransport({
          command: cmd,
          args: cmdArgs,
          env: { ...process.env, ...(config.env || {}) } as Record<string, string>
        })
      : new SSEClientTransport(new URL(config.url!), {
          requestInit: {
            headers: config.headers || {}
          }
        })

    const client = new Client(
      { name: 'mini-agent', version: '0.1.0' },
      { capabilities: {} }
    )

    await client.connect(transport)
    connections.set(config.id, { client, config })

    // 发现工具
    const toolsList = await client.listTools()
    const sourceTag = `mcp:${config.id}`
    unregisterToolsBySource(sourceTag)

    for (const tool of toolsList.tools) {
      const handler: ToolHandler = {
        definition: {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || `MCP tool from ${config.name}`,
            parameters: tool.inputSchema || { type: 'object', properties: {} }
          }
        },
        // MCP 工具默认 normal 权限（autoApprove 时自动放行，否则弹窗确认）
        permission: 'normal',
        async execute(args: Record<string, unknown>, ctx: ToolContext) {
          try {
            const result = await client.callTool({ name: tool.name, arguments: args })
            const text = result.content
              ?.map((c: any) => c.type === 'text' ? c.text : JSON.stringify(c))
              .join('\n') || '(no output)'
            return text
          } catch (err) {
            return `MCP tool error: ${(err as Error).message}`
          }
        }
      }
      registerTool(tool.name, handler, sourceTag)
    }

    log('info', `MCP "${config.name}" connected, ${toolsList.tools.length} tools registered`)
  } catch (err) {
    log('error', `Failed to connect MCP "${config.name}": ${(err as Error).message}`)
    throw err
  }
}

/**
 * 断开某个 MCP Server
 */
export async function disconnectMcpServer(id: string): Promise<void> {
  const conn = connections.get(id)
  if (!conn) return
  try {
    await conn.client.close()
    unregisterToolsBySource(`mcp:${id}`)
    connections.delete(id)
    log('info', `MCP "${conn.config.name}" disconnected`)
  } catch (err) {
    log('warn', `Error disconnecting MCP "${conn.config.name}": ${(err as Error).message}`)
  }
}

/**
 * 重连所有配置中的 MCP Servers
 */
export async function reconnectAllMcpServers(configs: McpServerConfig[]): Promise<void> {
  for (const config of configs) {
    try {
      await connectMcpServer(config)
    } catch {
      // 单个失败不阻塞其他
    }
  }
}

/**
 * 获取所有活跃连接状态
 */
export function getMcpStatus(): { id: string; name: string; connected: boolean }[] {
  return Array.from(connections.values()).map(c => ({
    id: c.config.id,
    name: c.config.name,
    connected: true
  }))
}
