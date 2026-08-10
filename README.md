# 牛马联盟

打工人时间台账与加班证据记录仪。常驻托盘 + 右下角迷你栏 + 浏览器面板。

- 台账：桌面悬浮记录器开始/暂停/停止计时，标签归类，天/周/月可视化
- 悬浮记录器：小秒表形态，标签下拉 + HH:MM:SS + 开始/暂停/停止；可在设置中控制启动时是否显示
- 暂停点：任务进行中可随手打 marker，记录被打断/临时插队，并在台账时间线显示
- 待办：浏览器管理 + 桌面提醒 + Agent MCP 工具写入/查询
- 证据：快捷截图存证，生成加班证据链（P2）
- 工具：内置常用站点入口，一键打开
- 数据全本地（SQLite），MIT 开源

## 技术栈

Electron 31 + Vue 3 + Vite + better-sqlite3 + Express + ECharts

## 环境要求

- Node.js 20 LTS 或更高（本机开发用 24.12.0）
- Windows 10/11（macOS/Linux 适配在 P3）
- 无需安装 VS Build Tools：better-sqlite3 走 prebuild-install 下载预编译，一般不触发源码编译

## 换电脑继续开发（重要）

源码不能直接拷 `node_modules`（原生模块 ABI 绑定当前机器的 Node/Electron 版本），新电脑按下面步骤：

```powershell
# 1. 装 Node.js（https://nodejs.org，LTS 即可）

# 2. 拿源码二选一：
git clone <你的仓库地址>         # 推荐：用 Git，改动可回退
# 或解压源码包（排除 node_modules / dist / release）

# 3. 装依赖（Electron 二进制已配置 npmmirror 镜像，见 .npmrc）
cd 牛马联盟
npm install

# 4. 跑测试 / 开发
npm test            # 自动切 better-sqlite3 到 Node ABI
npm run dev         # 自动切到 Electron ABI 并启动应用
```

> ABI 说明：better-sqlite3 是原生模块，测试（Node）和运行（Electron）需要不同编译版本。本项目用 `prebuild-install` 下载对应版本，npm 脚本自动切换，无需手动干预，也无需编译工具链。

## 数据在哪（要搬数据时拷这个目录）

- 数据库 + 截图：`%APPDATA%\牛马联盟\`（即 `app.getPath('userData')`）
- 换电脑想带走台账/证据：把整个目录拷到新电脑同名位置即可

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动应用（自动切 Electron ABI） |
| `npm test` | 单元测试（自动切 Node ABI） |
| `npm run build:renderer` | 构建渲染层到 dist/ |
| `npm run dist` | electron-builder 打包便携 exe（发布用） |
| `npm run mcp` | 启动 MCP 待办工具服务（需桌面服务正在运行） |
| `npm run rebuild` / `rebuild:node` | 手动切 ABI（一般不需要） |

## Agent MCP 工具注册

MCP 服务通过本地 HTTP 调用桌面启动器，因此**必须先运行 `npm run dev` 或打包后的桌面程序**。

示例配置（路径按实际位置调整）：

```json
{
  "mcpServers": {
    "nmlm-todo": {
      "command": "node",
      "args": ["D:/Hanako的空间/牛马联盟/src/mcp/server.mjs"]
    }
  }
}
```

提供工具：

- `nmlm_todo_add`：新增待办
- `nmlm_todo_list`：查看待办
- `nmlm_todo_update`：更新待办
- `nmlm_todo_close`：完成待办
- `nmlm_task_current`：查看当前正在记录的任务片段

## 目录速览

```
src/main/       主进程（服务层、DB、Express、托盘、迷你栏窗口）
src/preload/    contextBridge（window.niuma）
src/renderer/   Vue 3 面板 + 迷你栏 + TagPicker（一套代码，浏览器/Electron 双宿主）
src/shared/     IPC 通道名 / 默认配置（前后端共用）
plan/           DESIGN.md（设计文档）+ INTEGRATION_NOTES.md（坑点备忘）
tests/          vitest 单元测试
```

## 开发注意事项

详见 `plan/INTEGRATION_NOTES.md`（每个 Phase 开工前先读）。核心几条：

- 渲染层统一走 `http://127.0.0.1:<port>` 加载，不用 loadFile
- IPC 通道名集中在 `src/shared/constants.js`，HTTP `/api/call` 与 IPC 共用 handler 注册表
- 路径一律动态化（`app.getPath('userData')`），禁止硬编码
- 打包前确保无 electron 进程残留（`.node` 文件被锁会导致打包失败）
