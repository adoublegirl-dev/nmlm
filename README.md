# 牛马联盟

> 一款本地优先的时间台账与工作记录工具：常驻托盘、悬浮记录器与浏览器后台协同工作，帮助你记录工作过程、管理待办，并沉淀可追溯的加班证据。

## 产品功能

- **悬浮记录器与时间轴**：在桌面上开始、查看和结束记录；记录过程中可打关键帧、切分时间段并调整工作类型。
- **台账浏览**：在浏览器后台按今天、昨天或日历查看记录，回看时间段和关键帧。
- **待办管理**：后台集中创建和维护待办的状态、优先级与截止时间；记录器内可快速查看、刷新并跳转到待办页。
- **证据沉淀**：支持快捷截图与加班证据链整理，方便保留工作过程。
- **快捷入口与提醒**：常用网站一键打开，到期事项可在桌面提醒。
- **本地数据**：记录、待办和证据保存在本机 SQLite 数据库中，不依赖云端账号。

## 快速操作

1. 启动应用后，从系统托盘打开记录器或浏览器后台；首次记录前选择工作类型。
2. 按 **F8** 开始记录；记录进行中再次按 **F8** 会打一个关键帧，不会暂停计时。
3. 按 **F9** 停止并保存当前记录；在时间轴上点击具体时间段，可调整该段的工作类型。
4. 在记录器顶部打开“待办”可查看近期未完成事项；点击“新建待办”会跳转到后台待办页进行创建和编辑。
5. 需要查看历史时，从托盘打开后台面板，在“台账”“待办”“证据”等页面继续处理。

## 开发与维护

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
| `npm run dev:utf8` | UTF-8 安全启动应用，Windows 中文日志不乱码 |
| `npm test` | 单元测试（自动切 Node ABI） |
| `npm run build:renderer` | 构建渲染层到 dist/ |
| `npm run dist` | electron-builder 打包 Windows 安装程序（发布用） |
| `npm run mcp` | 启动 MCP 待办工具服务（需桌面服务正在运行） |
| `npm run mcp:utf8` | UTF-8 安全启动 MCP 服务 |
| `npm run junction` | 创建 `C:\nmlm` 无中文路径入口 |
| `npm run rebuild` / `rebuild:node` | 手动切 ABI（一般不需要） |

## Agent MCP 工具注册

MCP 服务通过本地 HTTP 调用桌面启动器，因此**必须先运行桌面程序**：

```powershell
cd "D:\Hanako的空间\牛马联盟"
npm run dev:utf8
```

默认 API：`http://127.0.0.1:37129/api/call`。

### 推荐：先创建无中文路径入口

部分 MCP 客户端/旧 PowerShell 对中文路径兼容一般。推荐执行一次：

```powershell
cd "D:\Hanako的空间\牛马联盟"
npm run junction
```

成功后会得到：

```txt
C:\nmlm -> D:\Hanako的空间\牛马联盟
```

### MCP 客户端配置

推荐配置为：

```json
{
  "mcpServers": {
    "nmlm-todo": {
      "command": "powershell",
      "args": [
        "-ExecutionPolicy", "Bypass",
        "-NoProfile",
        "-File", "C:\\nmlm\\scripts\\mcp.ps1"
      ],
      "env": {
        "NMLM_API": "http://127.0.0.1:37129/api/call"
      }
    }
  }
}
```

如果不创建 junction，也可以直接用中文路径：

```json
{
  "mcpServers": {
    "nmlm-todo": {
      "command": "node",
      "args": ["D:\\Hanako的空间\\牛马联盟\\src\\mcp\\server.mjs"],
      "env": {
        "NMLM_API": "http://127.0.0.1:37129/api/call"
      }
    }
  }
}
```

### PowerShell 中文乱码

Windows PowerShell 5.1 可能把 UTF-8 输出按旧编码显示，出现 `蹇嵎...` 这类乱码。功能通常不受影响；建议用 `scripts/dev.ps1` / `scripts/mcp.ps1` 启动，它们会自动设置：

```powershell
chcp 65001
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
```

提供工具：

- `nmlm_todo_add`：新增待办
- `nmlm_todo_list`：查看待办
- `nmlm_todo_update`：更新待办
- `nmlm_todo_close`：完成待办
- `nmlm_todo_reopen`：重开待办
- `nmlm_todo_delete`：删除待办
- `nmlm_todo_due`：查看已到期待办
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
