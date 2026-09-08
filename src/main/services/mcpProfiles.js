// 不依赖 Electron 的 MCP 配置外壳生成器，便于不同 Agent 复用与测试。
function buildProfiles(launcher) {
  const server = {
    command: launcher.command,
    args: launcher.args,
    env: launcher.env
  }
  return [
    {
      id: 'mcpServers',
      label: '通用 MCP（Claude / Cursor / Cline 等）',
      config: { mcpServers: { 'nmlm-todo': server } }
    },
    {
      id: 'vscode',
      label: 'VS Code / GitHub Copilot',
      config: { servers: { 'nmlm-todo': { type: 'stdio', ...server } } }
    },
    {
      id: 'stdio',
      label: '标准 stdio 参数（其他 Agent）',
      config: { name: 'nmlm-todo', transport: 'stdio', ...server }
    }
  ].map((profile) => ({ ...profile, configJson: JSON.stringify(profile.config, null, 2) }))
}

module.exports = { buildProfiles }
