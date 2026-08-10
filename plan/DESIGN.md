# 牛马面板 · 设计与开发文档

> 版本：v0.3（桌面悬浮任务播放器 + 待办/MCP）
> 日期：2026-08-10
> 状态：P0+ 已实现，继续优化 P1
> 技术路线：Electron + Vue 3 + SQLite

---

## 目录

1. 项目概述
2. 产品定义
3. 技术选型
4. 系统架构
5. 数据模型
6. 核心服务设计
7. IPC 接口契约
8. UI 设计规范
9. 关键流程时序
10. 提醒暗号系统
11. 隐私与安全设计
12. 跨平台设计
13. 浏览器完整面板（PC + 手机，同源同码）
14. 分阶段实施计划
15. 测试策略
16. 风险清单与对策
17. 打包与分发
18. 待决策事项

---

## 1. 项目概述

### 1.1 一句话定位

牛马面板是一个常驻系统托盘的桌面工作记录仪：启动器负责常驻服务，桌面悬浮“任务播放器”负责日常开始/切换/完成任务、添加暂停点，浏览器面板负责统计、待办、证据和设置管理。

### 1.2 背景与问题

打工人每天被无数事情打断：一个需求没做完，新的事情又来了。两个真实痛点：

1. **时间去哪了，说不清**。一天结束回想起来全是碎片，没有台账，无法复盘，更无法向自己或他人证明"我这一天干了什么"。
2. **加班事实留不下**。被优化、被约谈时拿不出证据。截图单张没说服力，需要连续时间段的截图、窗口记录、活跃日志构成的证据链。

### 1.3 目标用户

- 长期加班、有被 PUA/优化风险认知的职场人
- 对时间管理有复盘需求但嫌番茄钟麻烦的人
- 需要向公司或仲裁机构证明工作量的场景

### 1.4 核心设计原则

| # | 原则 | 含义 |
|---|------|------|
| 1 | 极低摩擦 | 一切记录动作 2 秒内完成，绝不打断当前工作流 |
| 2 | 数据全本地 | 不上传、不收集、导出由用户主动触发 |
| 3 | 事件驱动 | 快捷键触发才写库，常驻零轮询、近零 CPU |
| 4 | 一次采集两种消费 | 台账与证据共用同一份活动数据 |
| 5 | 默认隐身 | 平时缩在右下角迷你栏，只在用户需要时现身 |
| 6 | 浏览器优先 | 完整面板走浏览器（同一套 UI，桌面壳与网页同源同码），Electron 窗口只是壳 |
| 7 | 开源造福 | MIT 协议开源，内置快捷工具入口，降低使用门槛 |

### 1.5 交互分层（重要，v0.3 更新）

用户接触产品的层级从上到下，摩擦递增、信息密度递增：

```
┌─────────────────────────────────────────────────┐
│ ① 托盘图标        常驻，状态感知（空闲/记录中）    │
├─────────────────────────────────────────────────┤
│ ② 桌面悬浮记录器   可由设置开关控制启动时是否显示          │
│                   紧凑态记录，展开态管理，标签选择再折叠    │
├─────────────────────────────────────────────────┤
│ ③ 浏览器完整面板   报表、标签管理、设置、证据包      │
│                   PC 浏览器 / 手机 H5 同一套代码    │
└─────────────────────────────────────────────────┘
```

设计含义：**启动器是总闸，悬浮记录器是可开关桌面插件**。设置中开启“启动时显示”时，记录器自动浮在桌面；关闭时只保留托盘/服务，需要手动从启动器打开。记录器默认紧凑，只显示当前任务、计时和主动作；展开后才显示切换任务、完成任务、暂停点、打开面板；标签选择继续折叠在第三层。

---

## 2. 产品定义

### 2.1 四个模块 + 一个底座

| 模块 | 向内看 | 对外看 | 汇总 |
|------|--------|--------|------|
| 时间台账 | 我的一天被切成几块 | 我加班到几点、干了什么 | 日报周报 |
| 证据留存 | 我的活跃记录 | 带时间戳的证据包 | 证据链 zip |
| 报表中心 | 天/周/月图表 | 可导出的报告 | 模型总结 |
| 快捷工具 | 一键打开常用站点/工具 | 浏览器直达 | 可配置入口组 |
| 待办中心 | 浏览器管理 todo/doing/done | Agent MCP 写入/查询 | 桌面通知提醒 |

四个模块共享同一个底座：统一快捷键、活动采集器、提醒引擎、模型接入层、快捷工具服务。

### 2.2 核心用户故事

```
US-1 记录一段工作
作为打工人，我按 Ctrl+Shift+1 开始记录，被拉去开会回来按 Ctrl+Shift+2，按 1 选"开会"标签归档，全程不到 2 秒。

US-2 加班证据留存
晚上 8 点系统还在活跃，托盘弹出暗号提醒"到点了，该存档了"。我按 Ctrl+Shift+3 截图存证，连截几张，下班前按 Ctrl+Shift+4 打包证据链。

US-3 复盘一天
睡前打开面板看报表页，今日时间线显示 12 段碎片，标签分布显示"开会 3.2h / 编码 2.1h / 线上排查 1.5h"。点"生成日报"，模型总结成一段可粘贴的文字。

US-4 配置标签
周一早上我在设置页配置本周常用标签：编码(1)、开会(2)、写方案(3)、线上排查(4)、其他(0)。

US-5 证据关联台账
证据包里自动附带当天台账汇总，仲裁时截图、台账、活跃日志三件套齐全。

US-6 迷你栏速览
我瞟一眼右下角，一条细栏显示淡金圆点（记录中）和今日 6.2h。点开浮出卡片：当前窗口标题、最近三段记录、今日碎片数，按钮一键开始/结束记录、截图、开浏览器看报表。

US-7 快捷工具入口
面板里内置一组常用工具（DeepSeek、石墨文档、语雀、内部 OA 等），点一下浏览器直达；我自己也能增删。
```

### 2.3 与竞品差异

| 竞品类型 | 它们的定位 | 我们的差异 |
|----------|-----------|-----------|
| 番茄钟（Forest 等） | 教人自律、专注 | 不教自律，只记录被撕碎的事实 |
| 时间管理 App（Toggl 等） | 团队工时、云同步 | 本地优先、隐私安全、专为打工人设计 |
| 截图工具（Snipaste 等） | 随手截图 | 截图自动归档、水印、可打包成证据链 |

---

## 3. 技术选型

### 3.1 桌面框架：Electron

| 项 | 选择 | 理由 |
|----|------|------|
| 框架 | Electron ^31 | 自带 globalShortcut（全局快捷键）、desktopCapturer（截屏）、Tray（托盘），Node 生态，开发者熟悉 |
| 备选 | Tauri | 体积小，但需 Rust，MVP 周期翻倍，留作后续瘦身选项 |

### 3.2 渲染层：Vue 3 + Vite（一套代码，两种宿主）

- Vue 3 Composition API + Vite 构建，成熟主流，生态完整
- **渲染代码只有一份**，两种宿主加载：
  - Electron 窗口：`loadFile(dist/index.html)`，通过 preload 暴露 `window.niuma`（IPC 直连）
  - 浏览器：主进程内嵌本地 Web 服务托管同一份 dist，页面通过 HTTP + token 访问同一套 API
- 渲染层通过 `api.js` 做宿主适配：有 `window.niuma` 走 IPC，否则走 HTTP fetch。视图代码零感知
- 纯前端视图层，不参与核心逻辑（核心逻辑在主进程，可独立测试）

### 3.3 数据库：better-sqlite3

- 同步 API，简单可靠，无异步地狱
- 原生模块，需 `electron-rebuild` 匹配 ABI
- 单文件数据库，放 `app.getPath('userData')/niuma.db`，用户可自行备份迁移

### 3.4 图表：ECharts 5

- 按需引入，中文文档完善，图表类型覆盖需求（甘特条、环形图、折线、柱状）

### 3.5 窗口标题采集：active-win

- 跨平台获取当前激活窗口标题与进程名
- Windows 下基于 PowerShell 查询，注意调用频率（见 6.2）

### 3.6 截图：desktopCapturer + nativeImage

- Electron 内置，主进程截全屏，保存 PNG（后续可加 WebP 压缩）

### 3.7 模型接入：自定义 HTTP 客户端

- 兼容 Ollama（本地）与 OpenAI 兼容协议（云端）
- 不引入重型 SDK，直接 fetch，支持自定义 baseURL

### 3.8 本地 Web 服务：Express

- 主进程内嵌 Express，托管渲染层 dist + 报表 API
- 默认端口 37129（可改），监听 127.0.0.1 与局域网 IP
- 访问令牌：首次启动生成随机 token，写入 settings；浏览器访问需输入（见 §13）

### 3.9 打包：electron-builder

- Windows NSIS 安装包 + 便携版，macOS dmg，Linux AppImage
- 详细配置见 §17

### 3.9 依赖清单（P0）

```
dependencies:
  better-sqlite3 ^11
  active-win ^9

devDependencies:
  electron ^31
  electron-builder ^24
  electron-rebuild
  vite
  @vitejs/plugin-vue
  vue ^3.4
  echarts ^5
  vitest
```

---

## 4. 系统架构

### 4.1 分层架构

```
┌─────────────────────────────────────────────────┐
│        渲染层（Vue 3，一套代码两种宿主）          │
│  浏览器完整面板 ←──HTTP+token──┐     Electron 窗口  │
│  (PC/手机)                   │    (设置兑底)       │
│  迷你 Dock 栏（右下角）        │                   │
└──────────────┬────────────────┴────────┬──────────┘
               │  IPC / HTTP API          │
┌──────────────┴──────────────────────────┴──────────┐
│                主进程（Electron）                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ 托盘 Tray │ │ 迷你栏窗口│ │ Web服务 Express   │   │
│  │ 窗口管理  │ │ 提醒浮窗  │ │ (托管 dist+API)   │   │
│  └──────────┘ └──────────┘ └──────────────────┘   │
│  ┌────────────────────────────────────────────┐   │
│  │              服务层 services                 │   │
│  │ shortcut │ activity │ ledger │ evidence     │   │
│  │ reminder │ report   │ model  │ settings     │   │
│  │ tools（快捷工具）                             │   │
│  └──────────────────────┬─────────────────────┘   │
│  ┌──────────────────────┴─────────────────────┐   │
│  │        DB 层（better-sqlite3）              │   │
│  │        migrations + 仓储                    │   │
│  └────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────┘
```

### 4.2 进程模型

- **主进程**：承载全部核心逻辑（快捷键、采集、台账、证据、提醒、报表、模型、Web 服务），是唯一的数据与原生能力执行者
- **渲染进程**：迷你栏窗口、提醒窗、标签浮窗等轻量窗口 + 浏览器里的同一套 Vue 代码，通过 `api.js` 双通道（IPC / HTTP）通信
- 核心逻辑不进渲染进程，保证：可单测、UI 崩溃不影响记录、托盘/迷你栏态无需完整 UI 存活

### 4.3 目录结构

```
牛马面板/
├── package.json
├── electron-builder.yml
├── vite.config.js
├── src/
│   ├── main/
│   │   ├── index.js              # 入口：生命周期、单实例锁、app 启动
│   │   ├── tray.js               # 托盘创建与菜单
│   │   ├── windows.js            # 迷你栏 / 提醒窗 / 标签浮窗管理
│   │   ├── ipc.js                # 全部 ipcMain.handle / on 注册
│   │   ├── server/
│   │   │   ├── index.js          # Express 启动、端口/token、路由挂载
│   │   │   ├── auth.js           # token 校验中间件
│   │   │   └── routes/           # api/report.js api/settings.js ...
│   │   ├── db/
│   │   │   ├── index.js          # 打开连接、初始化、迁移执行
│   │   │   ├── migrations.js     # 迁移脚本数组
│   │   │   └── repos/            # 仓储：tags.js / entries.js / screenshots.js ...
│   │   ├── services/
│   │   │   ├── shortcut.js       # 快捷键注册/冲突检测
│   │   │   ├── activity.js       # 活动采集（窗口/活跃）
│   │   │   ├── ledger.js         # 台账状态机与 CRUD
│   │   │   ├── evidence.js       # 截图、归档、证据包打包
│   │   │   ├── reminder.js       # 定时提醒引擎
│   │   │   ├── report.js         # 报表数据聚合
│   │   │   ├── model.js          # 模型接入
│   │   │   ├── tools.js          # 快捷工具入口管理
│   │   │   └── settings.js       # 配置读写
│   │   └── utils/
│   │       ├── time.js           # 日期区间、格式化
│   │       └── window.js         # active-win 封装
│   ├── preload/
│   │   └── index.js              # contextBridge 暴露 window.niuma（Electron 宿主专用）
│   ├── renderer/
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.js
│   │       ├── App.vue
│   │       ├── api.js            # 宿主适配：IPC 或 HTTP 二选一
│   │       ├── styles/           # 主题变量（暗色 + 淡金/浅绿）
│   │       ├── views/
│   │       │   ├── LedgerView.vue
│   │       │   ├── EvidenceView.vue
│   │       │   ├── ReportView.vue
│   │       │   ├── ToolsView.vue  # 快捷工具入口页
│   │       │   └── SettingsView.vue
│   │       ├── mini/
│   │       │   └── MiniDock.vue  # 右下角迷你栏（独立小入口）
│   │       └── components/
│   │           ├── TimelineBar.vue    # 今日时间线
│   │           ├── TagPicker.vue      # 标签选择浮窗
│   │           ├── ReminderPopup.vue  # 提醒弹窗
│   │           └── ChartBox.vue       # ECharts 封装
│   └── shared/
│       ├── constants.js          # IPC 通道名、事件名、默认配置
│       └── schema.js             # 前后端共享的字段校验
└── tests/
    ├── unit/                     # vitest：ledger / reminder / report / evidence
    └── manual/                   # 手动验收清单
```

### 4.4 模块职责表

| 模块 | 职责 | 不负责 |
|------|------|--------|
| shortcut.js | 注册/注销全局快捷键、冲突检测与上报 | 业务逻辑 |
| activity.js | 轮询采集窗口标题、判定空闲 | 存储（只上报给 ledger/evidence） |
| ledger.js | 台账状态机、记录 CRUD、碎片判定 | UI |
| evidence.js | 截图、存证、打包证据链 | 台账数据（只读取） |
| reminder.js | 定时检查、触发提醒、联动台账阈值 | 提醒内容渲染（渲染进程负责） |
| report.js | 聚合天/周/月数据、生成图表数据结构 | 图表绘制 |
| model.js | 调模型生成日报/周报/截图描述 | 数据准备（来自 report） |
| tools.js | 快捷工具入口 CRUD、一键打开浏览器 | 其他 |
| settings.js | 配置读写、默认值合并 | 其他 |

---

## 5. 数据模型

### 5.1 ER 关系

```
tags ──1:N── time_entries ──0:1── screenshots
                     │
                     └──N:1── evidence_packs
```

- `time_entries.related_entry_id` 与截图的关系在 `screenshots.entry_id`
- 证据包通过 `date_range` 关联，不存外键，打包时按日期区间查询

### 5.2 完整 DDL（SQLite）

```sql
-- 标签表
CREATE TABLE IF NOT EXISTS tags (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE,        -- 标签名，如"编码"
  color         TEXT    NOT NULL DEFAULT '#D4AF6A', -- 展示色
  shortcut_key  INTEGER,                        -- 数字键 1-9，0 表示"其他"
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_break      INTEGER NOT NULL DEFAULT 0,     -- 1=摸鱼/吃饭，统计有效工时剔除
  created_at    INTEGER NOT NULL                -- 毫秒时间戳
);

-- 台账记录表
CREATE TABLE IF NOT EXISTS time_entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  start_time     INTEGER NOT NULL,              -- 开始毫秒时间戳
  end_time       INTEGER,                       -- 结束毫秒时间戳，NULL=进行中
  duration_sec   INTEGER,                       -- 持续秒数，结束时写入
  tag_id         INTEGER REFERENCES tags(id),
  detail         TEXT,                          -- 备注
  window_title   TEXT,                          -- 结束时激活窗口标题
  is_fragment    INTEGER NOT NULL DEFAULT 0,    -- 1=碎片（<15min）
  created_at     INTEGER NOT NULL
);

-- 截图证据表
CREATE TABLE IF NOT EXISTS screenshots (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path      TEXT    NOT NULL,              -- 实际图片路径
  taken_at       INTEGER NOT NULL,              -- 截图时间
  window_title   TEXT,                          -- 当时激活窗口
  process_name   TEXT,
  entry_id       INTEGER REFERENCES time_entries(id), -- 关联台账（可空）
  pack_id        INTEGER REFERENCES evidence_packs(id), -- 所属证据包（可空）
  created_at     INTEGER NOT NULL
);

-- 证据包表
CREATE TABLE IF NOT EXISTS evidence_packs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  date_start     INTEGER NOT NULL,              -- 包含范围起
  date_end       INTEGER NOT NULL,              -- 包含范围止
  zip_path       TEXT    NOT NULL,
  summary        TEXT,                          -- 自动生成摘要
  ntp_offset_ms  INTEGER DEFAULT 0,             -- 生成时与 NTP 的时间偏差
  created_at     INTEGER NOT NULL
);

-- 活动日志表（低频率采样，供证据链佐证与报表活跃度）
CREATE TABLE IF NOT EXISTS activity_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             INTEGER NOT NULL,              -- 采样时间
  window_title   TEXT,
  process_name   TEXT,
  is_idle        INTEGER NOT NULL DEFAULT 0     -- 1=空闲超阈值
);
CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_log(ts);

-- 设置表（key-value）
CREATE TABLE IF NOT EXISTS settings (
  key            TEXT PRIMARY KEY,
  value          TEXT NOT NULL                  -- JSON 序列化
);
```

### 5.3 关键字段说明

| 字段 | 说明 | 设计理由 |
|------|------|----------|
| `time_entries.end_time` 可空 | 进行中的记录 end_time 为 NULL | 崩溃恢复时可识别"未完成记录" |
| `is_fragment` | 结束时按 duration < 900s 判定 | 碎片统计不依赖查询时计算 |
| `is_break` | 标签级标记摸鱼/吃饭 | 有效工时 = 总时长 - break 标签时长 |
| `activity_log` 独立采样 | 不塞进 time_entries | 台账是用户主动记录，活动日志是客观事实，两者独立、可交叉印证 |
| `ntp_offset_ms` | 打包证据时记录联网时间偏差 | 佐证时间可信度，不加密但透明 |

### 5.4 数据生命周期与清理

- 截图默认保留 30 天，设置可调（7/30/90 天/永久）
- 清理策略：超过保留期的**未打包**截图自动删除（已入包的保留，包内是副本）
- 台账与活动日志默认永久保留（体积小，KV 级）
- 用户可手动"清空某日数据"，二次确认

---

## 6. 核心服务设计

### 6.1 快捷键服务（shortcut.js）

默认键位（全部可自定义）：

| 动作 | 默认键 | 说明 |
|------|--------|------|
| 开始/暂停记录 | `Ctrl+Shift+1` | 记录中再按 = 暂停（保留现场） |
| 结束记录并选标签 | `Ctrl+Shift+2` | 触发标签浮窗 |
| 快捷截图 | `Ctrl+Shift+3` | 立即截全屏入证据库 |
| 打包证据链 | `Ctrl+Shift+4` | 弹日期选择浮窗，确认后打包 |
| 打开浏览器面板 | `Ctrl+Shift+0` | 拉起系统浏览器访问本地面板 |

接口：

```js
// 注册全部快捷键，返回 { ok, failed: [{ accelerator, reason }] }
async function registerAll(settings) {}

// 单个注册（含冲突检测：electron 会返回 false 表示被占用）
function register(accelerator, handler) {}

// 设置变更时热重载：全部注销后按新配置重注册
async function reloadFromSettings() {}
```

冲突处理：注册失败时，托盘弹通知"快捷键 Ctrl+Shift+2 被其他程序占用"，设置页对应输入框标红提示。

### 6.2 活动采集服务（activity.js）

- 轮询间隔默认 30s（设置可调 10s~5min）
- 每轮取激活窗口标题、进程名；连续 2 轮无输入且窗口未变，标记 is_idle=1（MVP 用简化判定：窗口标题无变化 + 距上次快照超过阈值；Windows 后续可接 GetLastInputInfo）
- 采集结果写 `activity_log`，同时广播给台账（记录中时，若检测到空闲 > 10min，托盘提示"是否结束当前记录？"）
- active-win 在 Windows 上调用 PowerShell 有开销，间隔不得低于 10s

### 6.3 台账服务（ledger.js）

状态机：

```
idle ──start()──▶ recording ──pause()──▶ paused
 ▲                  │  │                  │
 │                  │  └──stop(tagId)─────┘
 └───────start()────┘        │
                          tagging ──选标签──▶ idle
```

- `start()`：创建 end_time=NULL 记录，广播 `ledger:state-changed`
- `pause()`/`resume()`：同一条记录拆多段（MVP 简化：pause 即归档为一段并新建，不搞复杂分段，保持数据简单）
- `stop(tagId, detail?)`：写 end_time、duration、窗口标题；duration<900s 标 is_fragment；归档后立即弹标签浮窗
- 崩溃恢复：启动时若有 end_time=NULL 记录，弹提示"检测到未完成记录，是否按上次结束时间归档？"
- 提供 `listByRange(start, end)` 供报表与证据打包用

### 6.4 证据服务（evidence.js）

截图流程：

1. `capture()`：desktopCapturer 截全屏 → nativeImage 转 PNG
2. 命名：`YYYYMMDD_HHmmss_<窗口摘要>.png`（窗口摘要去非法字符，最长 20 字符）
3. 保存到 `userData/screenshots/YYYY/MM/`
4. 右下角叠加时间戳水印（`YYYY-MM-DD HH:mm:ss`，半透明白字）
5. 写 screenshots 表；若正在记录中，自动关联 entry_id

证据包打包流程（见 9.4 时序）：

```
证据包 zip 结构：
evidence-YYYY-MM-DD~YYYY-MM-DD.zip
├── manifest.json        # 生成时间、范围、ntp_offset、文件清单、sha256
├── screenshots/         # 范围内全部截图（含水印原图）
├── ledger.csv           # 台账汇总（时间、标签、时长、窗口）
├── activity.csv         # 活跃采样摘要（每 5min 一条聚合）
└── README.txt           # 使用说明与证据自述
```

打包在后台队列执行，完成托盘通知"证据包已生成：路径"。

### 6.5 提醒引擎（reminder.js）

配置项（settings 默认值）：

```json
{
  "reminder": {
    "enabled": true,
    "checkStart": "19:00",     // 检测窗口起
    "checkEnd": "23:30",       // 检测窗口止
    "checkIntervalMin": 30,    // 每 30 分钟检测一次
    "idleThresholdSec": 300,   // 系统空闲 > 5min 视为不在用，不提醒
    "workHoursThreshold": 10,  // 今日有效工时超过此值，文案升级
    "message": "到点了，该存档了",  // 暗号文案，见 §10
    "actions": ["ledger", "screenshot"],  // 弹窗提供的快捷动作
    "dndStart": null,          // 免打扰时段（可选）
    "dndEnd": null
  }
}
```

检测逻辑（每次 tick）：

```
tick:
  当前时间不在 [checkStart, checkEnd] → 跳过
  处于免打扰时段 → 跳过
  近 5min 系统空闲 → 跳过（人不在电脑前，不打扰）
  今日已提醒过 → 跳过（同一时段只提醒一次）
  今日有效工时 > workHoursThreshold → 文案升级版
  触发提醒弹窗（无边框置顶小窗，30s 无操作自动关闭）
```

提醒弹窗动作按钮：`开始记录加班`（进入台账 recording）、`截图存证`（立即截图）、`忽略`。

### 6.6 报表服务（report.js）

聚合接口（全部纯函数，输入日期范围，输出图表数据）：

```js
dailyTimeline(date)        // → [{ start, end, tagName, color, detail }] 甘特条
tagDistribution(range)     // → [{ tagName, color, totalSec, count }] 环形图
dailyTrend(month)          // → [{ date, totalSec, effectiveSec, fragmentCount }] 折线
tagComparison(range)       // → [{ tagName, totalSec }] 柱状
fragmentStats(date)        // → { fragmentCount, fragmentTotalSec, avgSec }
effectiveHours(date)       // → 总时长 - break 标签时长（供提醒引擎复用）
```

### 6.7 模型服务（model.js）

配置：

```json
{
  "model": {
    "enabled": false,
    "provider": "ollama",            // ollama | openai
    "baseURL": "http://127.0.0.1:11434",
    "model": "qwen2.5:7b",
    "apiKey": "",                    // openai 用，可选
    "timeoutSec": 60
  }
}
```

接口：

```js
generateDailyReport(date)   → string   // 日报文字
generateWeeklyReport(weekStart) → string // 周报文字（可粘贴到公司周报）
describeScreenshot(path)   → string   // 可选：截图内容描述
```

Prompt 模板（shared/prompts.js，集中管理）：

```
日报模板：
你是打工人时间台账分析助手。基于以下数据生成一段简洁的日报总结，
包含：主要事项、耗时分布、碎片化程度、一句建议。语气客观，不评价。
数据：{tags JSON} {entries JSON}
```

未配置模型时，报表页"生成报告"按钮置灰并提示配置路径。模型请求全部在主进程发，key 不出本机。

### 6.8 设置服务（settings.js）

- 读写 settings 表，值 JSON 序列化
- `getAll()` 合并默认值与存储值；`set(key, value)` 单键写入
- 变更广播 `settings:changed`，快捷键、提醒引擎热重载

### 6.9 快捷工具服务（tools.js）

定位：内置一组常用工具/站点入口，一键调开浏览器，降低用户的日常摩擦。用户自己也能增删改。

数据结构（存 settings 表 `tools` 键，JSON 数组）：

```json
[
  { "id": "deepseek", "name": "DeepSeek", "url": "https://chat.deepseek.com", "icon": "", "group": "效率" },
  { "id": "shimo", "name": "石墨文档", "url": "https://shimo.im", "icon": "", "group": "协作" }
]
```

默认内置分组：效率（AI 对话、翻译、文档）、协作（石墨/语雀/飞书/腾讯文档网页版）、摸鱼（非工作向，用户自加）。

接口：

```js
listTools()                 // → tool[]
openTool(id)                // → shell.openExternal(url)
createTool({ name, url, group })  // 校验 url 协议必须 http/https
updateTool(id, patch)
deleteTool(id)
```

安全：`openTool` 走 `shell.openExternal` 且仅限 http/https 协议，杜绝协议注入。

---

## 7. IPC 接口契约

preload 暴露 `window.niuma`，所有通道名集中在 `shared/constants.js`，前后端共用，杜绝魔法字符串。

### 7.1 invoke/handle 通道（renderer → main）

| 通道 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `ledger:start` | - | `{ ok, entry }` | 开始记录 |
| `ledger:stop` | `{ tagId, detail? }` | `{ ok, entry }` | 结束并归档 |
| `ledger:pause` | - | `{ ok, entry }` | 暂停（归档为新段） |
| `ledger:current` | - | `entry \| null` | 查询进行中记录 |
| `ledger:list` | `{ start, end }` | `entry[]` | 区间查询 |
| `tags:list` | - | `tag[]` | 全部标签 |
| `tags:create` | `{ name, color, shortcutKey, isBreak }` | `tag` | 新建 |
| `tags:update` | `{ id, ...patch }` | `tag` | 更新 |
| `tags:delete` | `{ id }` | `{ ok }` | 删除（有记录的标签转为"未分类"） |
| `evidence:capture` | - | `{ ok, screenshot }` | 立即截图 |
| `evidence:list` | `{ start, end }` | `screenshot[]` | 区间查询 |
| `evidence:pack` | `{ start, end }` | `{ ok, pack }` | 打包证据链（后台队列） |
| `evidence:packStatus` | - | `{ running, current? }` | 打包进度 |
| `report:dailyTimeline` | `{ date }` | `segments[]` | 见 6.6 |
| `report:tagDistribution` | `{ start, end }` | `data[]` | 见 6.6 |
| `report:dailyTrend` | `{ month }` | `data[]` | 见 6.6 |
| `report:effectiveHours` | `{ date }` | `number` | 有效工时 |
| `model:generateReport` | `{ scope: 'daily'\|'weekly', date }` | `string` | 生成报告 |
| `settings:getAll` | - | `object` | 全部配置 |
| `settings:set` | `{ key, value }` | `{ ok }` | 单键写入 |
| `app:openScreenshotsDir` | - | `{ ok }` | 打开截图目录 |
| `app:quit` | - | - | 退出应用 |
| `tools:list` | - | `tool[]` | 快捷工具列表 |
| `tools:open` | `{ id }` | `{ ok }` | 浏览器打开工具 |
| `tools:create` | `{ name, url, group }` | `tool` | 新增入口 |
| `tools:update` | `{ id, ...patch }` | `tool` | 更新入口 |
| `tools:delete` | `{ id }` | `{ ok }` | 删除入口 |
| `server:info` | - | `{ port, token, urls }` | 浏览器面板地址与 token |
| `server:openBrowser` | - | `{ ok }` | 系统浏览器打开面板 |

### 7.2 事件推送（main → renderer）

| 事件 | 载荷 | 触发时机 |
|------|------|----------|
| `ledger:state-changed` | `{ state, entry }` | 开始/暂停/结束 |
| `reminder:triggered` | `{ message, upgraded, actions }` | 提醒触发 |
| `capture:done` | `{ ok, screenshot }` | 截图完成（托盘通知） |
| `pack:done` | `{ ok, zipPath }` | 证据包完成 |
| `settings:changed` | `{ key, value }` | 配置变更 |
| `shortcut:conflict` | `{ accelerator, reason }` | 快捷键注册失败 |

---

## 8. UI 设计规范

### 8.1 视觉基调

贴合打工人工具定位：**暗色为主、克制的淡金强调、浅绿辅助、毛玻璃质感**。

```
--bg-deep:   #14161A     主背景（深灰黑）
--bg-panel:  rgba(255,255,255,0.05)  面板（毛玻璃）
--bg-hover:  rgba(255,255,255,0.08)
--text-main: #E8E6E1     主文字
--text-dim:  #8F8A82     次级文字
--gold:      #D4AF6A     强调色（淡金）
--green:     #7FA98C     辅助色（浅绿，成功/正向）
--danger:    #C25B4E     危险（删除/警告）
--border:    rgba(255,255,255,0.08)
```

- 圆角 8px，阴影克制（0 8px 24px rgba(0,0,0,0.35)）
- 字体：系统字体栈 + 数字用 tabular-nums
- 无花哨动效，仅 opacity 过渡 ≤150ms

### 8.2 托盘菜单

```
牛马面板
────────────
● 记录中：编码 12:03    （记录中才显示，可点击结束）
开始/暂停记录  Ctrl+Shift+1
结束记录      Ctrl+Shift+2
快捷截图      Ctrl+Shift+3
────────────
打开浏览器面板  Ctrl+Shift+0
生成证据包
────────────
设置
退出
```

托盘图标：状态感知（空闲=灰色牛角，记录中=淡金牛角，可加呼吸但不闪）。

### 8.3 浏览器面板布局（完整 UI，宽屏优先）

```
┌─────────────────────────────────────────────┐
│ 牛马面板        [● 记录中 编码 12:03]  [设置] │  顶栏
├────────┬────────────────────────────────────┤
│ 今日    │  【今日时间线】 甘特条              │  台账页
│ 台账    │  08:30─10:10 编码 ████████ 1h40m  │
│ 证据    │  10:10─10:35 开会 ████ 25m(碎片)  │
│ 报表    │  10:35─12:00 编码 █████████ 1h25m │
│ 工具    │  [开始记录] [结束记录]             │
├────────┴────────────────────────────────────┤
│ 底部状态栏：今日有效 6.2h · 碎片 5 次         │
└─────────────────────────────────────────────┘
```

左侧导航四个入口：台账 / 证据 / 报表 / 设置，另加工具页入口（工具也常驻顶部快捷条）。

该面板在 PC 浏览器（127.0.0.1:37129）与手机（局域网 IP）访问同一套代码；Electron 壳不再单独开大窗口（详见 §13）。

### 8.4 台账页（LedgerView）

- 今日时间线：甘特条，标签色块，碎片段右侧标"碎片"小标
- 按天切换（← 昨天 / 今天 / 明天 →）
- 每段可点开编辑 detail、改标签
- 顶部快捷操作：开始记录 / 结束记录按钮（与快捷键等价）

### 8.5 证据页（EvidenceView）

- 截图网格：缩略图 + 时间 + 窗口标题，点击放大预览
- 顶部：日期范围选择 + "打包证据链"按钮 + 打包进度条
- 筛选：全部 / 已入包 / 未入包

### 8.6 报表页（ReportView）

- 日期维度切换：日 / 周 / 月
- 四个图表卡片：时间线（日）、标签分布（周）、趋势（月）、标签对比（周）
- 指标行：有效工时、总时长、碎片次数、平均段长
- "生成日报 / 周报"按钮 + 报告文字展示区（可复制）
- 导出：图表 PNG、台账 CSV

### 8.7 设置页（SettingsView）

分区：通用 / 快捷键 / 提醒 / 证据 / 标签 / 模型 / 隐私

- 通用：开机自启、语言
- 快捷键：每个动作一行，点击录制（按 Esc 取消，冲突红字提示）
- 提醒：开关、检测时段、阈值、暗号文案、动作勾选
- 证据：截图目录、保留天数、水印开关
- 标签：增删改、数字键绑定、颜色、break 标记
- 模型：provider、baseURL、model、apiKey、测试连接按钮
- 隐私：模糊化开关（P2 生效）、数据导出、数据清空

### 8.8 标签选择浮窗（TagPicker）

- 无边框小窗，出现在屏幕右下角
- 主体是标签大按钮网格（1-9 数字键高亮），底部一个"备注"输入框 + "其他"标签
- 按数字键立即归档关闭；Esc 取消（该段标记"未分类"）；Enter 用当前输入备注归档
- 3 秒无操作不自动关闭（等用户），但可 Esc

### 8.9 提醒弹窗（ReminderPopup）

- 无边框置顶小窗，居中偏右下
- 显示暗号大标题 + 一行说明 + 动作按钮
- 30s 无操作自动关闭，关闭前 5s 变暗提示
- 升级文案时标题换色（淡金 → 浅红警示）

### 8.10 迷你 Dock 栏（MiniDock，核心交互）

这是用户日常接触最多的界面，设计要求：**收起来不碍事，点开一眼懂**。

**收起态（常态）**：

- 贴屏幕右下角边缘的一条细栏，约 `180×34px`，毛玻璃深底
- 内容（从左到右）：状态点（空闲=灰 / 记录中=淡金）、今日有效工时（`6.2h`）、展开箭头
- 无边框、置顶、不抢焦点（`skipTaskbar` + `focusable:false`），鼠标移开 3s 自动收起
- 可拖拽到屏幕四角（设置记忆位置），也可完全隐藏回托盘（设置项）

**展开态（悬停/点击）**：

向上浮出一张卡片 `320×260px`，内容分四块：

```
┌─────────────────────────────────────┐
│ ● 记录中 编码 12:03      [结束]      │  当前状态 + 快捷动作
│ 当前窗口：需求文档_v3.2.docx - Word  │  活动采集实时
├─────────────────────────────────────┤
│ 今日 6.2h · 碎片 5 次 · 3 段          │  关键指标
│ 08:30 编码 1h40m                    │  最近 3 段摘要
│ 10:10 开会 25m · 10:35 编码 1h25m    │
├─────────────────────────────────────┤
│ [开始/结束] [截图] [打包] [报表]     │  动作按钮
│ [DeepSeek] [石墨] [语雀] [+ 工具]    │  快捷工具（一行 3 个）
└─────────────────────────────────────┘
```

- `[报表]` 调 `server:openBrowser` 开浏览器完整面板
- `[+ 工具]` 进工具管理
- 卡片 30s 无操作自动收起

**实现要点**：

- 独立 BrowserWindow：`frameless` + `transparent` + `alwaysOnTop` + `skipTaskbar`
- 鼠标移出卡片 300ms 后收起（防抖），移回取消
- 状态点数据来自 `ledger:state-changed` 与 `report:effectiveHours` 推送，收起态不轮询

---

## 9. 关键流程时序

### 9.1 记录一段时间的完整流程

```
用户按 Ctrl+Shift+1
  → shortcut.js 触发 ledger.start()
  → DB 插入 end_time=NULL 记录
  → 广播 ledger:state-changed（托盘图标变色）
用户被拉去开会，回来按 Ctrl+Shift+2
  → shortcut.js 触发 ledger.stop({})
  → 计算 duration，写窗口标题，判定 is_fragment
  → 广播状态变化
  → 打开 TagPicker 浮窗（渲染进程）
用户按数字键 2
  → TagPicker 调 ledger:stop 补充 tag_id
  → 归档完成，关闭浮窗
```

### 9.2 快捷截图流程

```
用户按 Ctrl+Shift+3
  → evidence.capture()
  → desktopCapturer 截屏 → 加水印 → 存 PNG
  → 查询 ledger.current()，进行中则关联 entry_id
  → 写 screenshots 表
  → 托盘通知"已存证 20260805_200103_需求文档.png"
```

### 9.3 每晚提醒流程

```
reminder tick（每 30min）
  → 通过检查链（时段/免打扰/空闲/已提醒）
  → report.effectiveHours(today) > 10h ?
     是 → upgraded 文案
  → 广播 reminder:triggered
  → 渲染进程打开 ReminderPopup
用户点"开始记录加班"
  → ledger.start()，弹窗关闭，托盘进入记录状态
```

### 9.4 证据包生成流程

```
用户选日期范围 → 确认打包
  → evidence.pack() 入队列（标记 running）
  → 查询范围内 screenshots + time_entries + activity_log 聚合
  → 生成 manifest（含 ntp 同步偏差、sha256 清单）
  → 逐文件写入 zip（后台，进度上报）
  → 完成：更新 pack_id 关联，写 evidence_packs，托盘通知
  → 失败：通知并保留现场，可重试
```

### 9.5 日报生成流程

```
用户在报表页点"生成日报"
  → report 聚合当日数据（复用图表数据源）
  → model.generateDailyReport(date)
  → 若模型未配置：按钮置灰（前置判断）
  → 返回文字展示，可一键复制
```

---

## 10. 提醒暗号系统

暗号是这个工具的"灵魂细节"：不说加班，但每个打工人都懂。

### 10.1 设计原则

- 暗号不是广告语，是**只有使用者自己懂的密语**，避免同事瞥见尴尬
- 默认文案可改，设置页提供"暗号文案"输入框
- 升级文案（超工时）自动切换，不单独配置

### 10.2 默认暗号候选

| 场景 | 默认文案 | 风格 |
|------|----------|------|
| 常规提醒 | `到点了，该存档了` | 游戏存档隐喻，打工人的进度条 |
| 超工时升级 | `今天进度拉满，存个档再走` | 同一隐喻的强化版 |

用户可自定义任意文案，如"牛马该回栏了"。暗号与动作按钮（开始记录/截图存证/忽略）搭配，形成"存档"的完整动作语义。

---

## 11. 隐私与安全设计

### 11.1 数据本地性

- 全部数据在 `userData` 目录，无任何自动上传
- 模型调用仅在用户显式触发报告生成时发生，且是用户自己配置的端点
- 数据导出由用户主动操作（CSV / 证据包 / 设置备份）

### 11.2 截图隐私（P2 实现）

- 设置项"敏感窗口模糊化"：开启后，截图时若激活窗口属于浏览器/聊天类进程（白名单：chrome/edge/wechat/dingtalk 等），图片对应区域高斯模糊
- MVP 不做自动识别，先提供"截图前 3s 倒计时 + 提示"的轻量方案（用户可自行遮挡）
- 证据包默认不含浏览器无痕内容，README 提示用户检查

### 11.3 杀毒误报对策

全局热键 + 截屏在 Windows 上极易被 360/Defender 报毒。对策：

1. **代码签名**：发布版购买/使用免费 OSS 签名证书（如 certum OSS），显著降低误报
2. **开源**：仓库公开，README 写明"可审查、无后门"，并在设置页提供"本地审计"入口（导出全部数据清单）
3. 首次启动时向用户明示行为：托盘提示"本应用会注册全局快捷键并支持截屏，用途见设置页隐私说明"

### 11.4 传输安全

- 与模型端点通信仅走用户配置的 HTTPS/本地地址
- 证据包内 manifest 记录 sha256，用户可自行核验文件未被篡改

---

## 12. 跨平台设计

### 12.1 平台差异点

| 能力 | Windows | macOS | Linux |
|------|---------|-------|-------|
| 全局快捷键 | globalShortcut ✅ | 需辅助功能授权 | X11 ✅ / Wayland 受限 |
| 截屏 | desktopCapturer ✅ | 需屏幕录制授权 | 同上 |
| 窗口标题 | active-win（PowerShell） | active-win（AppleScript） | active-win（X11） |
| 开机自启 | 注册表 / Squirrel | LaunchAgents | autostart desktop 文件 |
| 打包 | NSIS | dmg（需签名） | AppImage |

### 12.2 抽象层

- `utils/window.js` 统一 `getActiveWindow()` 接口，各平台实现内部切换
- `services/autostart.js` 统一开关接口，平台差异内聚
- 采集间隔在 macOS 上默认调大（辅助功能 API 开销）

---

## 13. 浏览器完整面板（PC + 手机，同源同码）

### 13.1 定位

浏览器面板是产品的**第三层交互**（也是最完整的界面）：看报表、管标签、配设置、打包证据。PC 浏览器和手机浏览器访问的是**同一套 Vue 代码**，由主进程内嵌的 Express 托管。

```
PC 浏览器  → http://127.0.0.1:37129    本地访问，免 token
手机      → http://<电脑局域网IP>:37129  需输入 token
```

### 13.2 架构

- 主进程内嵌 Express：托管渲染层 dist（静态）+ `/api/*` 数据接口
- **API 双通道**：渲染层 `api.js` 优先走 `window.niuma`（Electron 窗口内 IPC），浏览器里自动降级为 HTTP fetch + token，视图代码零感知
- token：首次启动生成 16 字节随机串存 settings；手机首次访问输入后存 localStorage
- 局域网地址发现：迷你栏展开卡显示当前访问地址 + 二维码（方便手机扫码），一键复制
- 路由：`/` 面板首页、`/mini` 迷你栏专用入口（若需独立）、`/api/*` 数据接口

### 13.3 安全

- 服务只在应用运行时存在，退出即关闭
- 默认绑定 127.0.0.1 + 局域网 IP，非本机请求全部走 token 校验中间件
- 手机端报表页不含截图内容，只有统计数字（截图太敏感，不上手机）
- token 泄露处置：设置页一键重置 token
- 可选高级版（P3）：走用户自己的 Tailscale/公网隧道远程访问（用户有 lzy121 与 Tailscale 基础设施，可复用）

---

## 14. 分阶段实施计划

### 14.1 P0 台账闭环 + 迷你栏 + 浏览器面板骨架（预计 1 周）

目标：Windows 上能跑通的完整台账闭环，以及用户日常接触的①②③三层交互骨架。

任务拆解：

- [ ] 工程初始化：Vite + Vue3 + Electron + better-sqlite3 + electron-rebuild
- [ ] DB 层：migrations（tags / time_entries / settings）
- [ ] 托盘 + 单实例锁
- [ ] 迷你栏：收起态细栏 + 展开卡片 + 位置记忆/自动收起（核心交互）
- [ ] 快捷键服务：开始/结束/打开浏览器面板
- [ ] 台账状态机：start / stop / pause / 崩溃恢复
- [ ] 标签 CRUD + 数字键绑定
- [ ] TagPicker 浮窗（数字键选标签、备注、Esc 取消）
- [ ] Express 服务：托管 dist + token 中间件 + 基础 API 路由
- [ ] 渲染层 api.js 双通道适配（IPC / HTTP）
- [ ] 浏览器面板：台账页（今日时间线甘特条 + 按天切换）
- [ ] 快捷工具服务 + 工具入口页（默认内置 6 个常用工具）
- [ ] 单元测试：ledger 状态机、时间计算

**P0 验收标准**：

```
1. 双击启动，托盘出现图标，无控制台窗口
2. 右下角迷你栏显示状态点 + 今日工时，展开卡片能看当前窗口与最近记录
3. Ctrl+Shift+1 开始，状态点变淡金；Ctrl+Shift+2 结束，弹出标签浮窗，按数字键 1 秒内归档
4. 浏览器打开 http://127.0.0.1:37129，台账页显示完整时间线，标签颜色正确，碎片段有标记
5. 迷你栏点 [报表] 能拉起系统浏览器打开面板
6. 工具入口：点 DeepSeek 图标直接打开浏览器
7. 重启应用，数据保留，无未完成记录报错
```

### 14.2 P1 证据留存 + 提醒（+1 周）

- [ ] 截图服务：desktopCapturer + 水印 + 归档命名
- [ ] 快捷截图快捷键（Ctrl+Shift+3）
- [ ] 提醒引擎：时段检测、空闲判定、暗号弹窗、联动有效工时
- [ ] 证据页：截图网格、预览、日期筛选
- [ ] 活动采集器：窗口标题轮询 + activity_log
- [ ] 设置页（浏览器）：快捷键录制、提醒配置、截图目录、token 重置
- [ ] 迷你栏升级：截图/打包快捷按钮
- [ ] 测试：reminder 检查链、evidence 命名/水印

**验收**：8 点后活跃会被提醒；快捷键截图即时入库并显示；设置修改快捷键即时生效；迷你栏可直接截图。

### 14.3 P2 证据包 + 模型 + 工具完善（+1 周）

- [ ] 证据包打包：zip 结构、manifest、sha256、后台队列与进度
- [ ] 台账 CSV / 活跃 CSV 导出
- [ ] 报表页四图表 + 指标行 + 导出 PNG
- [ ] 模型服务：Ollama/openai 兼容、prompt 模板、日报周报
- [ ] 隐私：截图模糊化开关（白名单进程）
- [ ] 数据清理策略（保留天数）
- [ ] 快捷工具：分组、图标、默认清单完善

**验收**：打包出的 zip 结构完整、manifest 可读；模型配置后日报生成可用；模糊化开启后浏览器截图模糊。

### 14.4 P3 跨平台 + 移动端完善（机动）

- [ ] macOS / Linux 适配（授权引导、自启）
- [ ] 手机 H5 完整验证（token、二维码、触屏适配）
- [ ] 可选：Tailscale/隧道远程查看
- [ ] 图标、安装包、签名、发布渠道
- [ ] 开源仓库整理：README、行为说明、审计入口

---

## 15. 测试策略

### 15.1 单元测试（vitest）

| 模块 | 用例要点 |
|------|----------|
| ledger | 状态机迁移合法/非法、duration 计算、碎片判定、崩溃恢复 |
| reminder | 时段/免打扰/空闲/已提醒 全检查链、文案升级阈值 |
| report | 聚合正确性（break 剔除、碎片统计）、空数据边界 |
| evidence | 命名规则、水印绘制、zip 结构、manifest 完整性 |
| settings | 默认值合并、非法值回退 |

### 15.2 集成测试（手动）

- 快捷键注册冲突：先开一个占用 Ctrl+Shift+1 的程序，验证提示
- 崩溃恢复：记录中杀进程，重启验证提示归档
- 截图权限：首次截图时 Windows 权限弹窗流程
- 打包大日期范围：10 天截图量，验证进度与完成通知

### 15.3 手动验收清单（tests/manual/）

每阶段验收标准即清单条目，逐条打勾，出问题记入 INTEGRATION_NOTES。

---

## 16. 风险清单与对策

| # | 风险 | 影响 | 对策 | 阶段 |
|---|------|------|------|------|
| 1 | 杀毒误报 | 用户装不上 | 代码签名 + 开源 + 行为明示 | P2 前 |
| 2 | 快捷键冲突 | 核心交互失效 | 冲突检测 + 提示 + 可自定义 | P0 |
| 3 | better-sqlite3 ABI | 装不上/崩溃 | electron-rebuild 固化脚本 + 打包前验证 | P0 |
| 4 | active-win 性能 | Windows 高占用 | 间隔 ≥10s + 采集独立节流 | P1 |
| 5 | 存储膨胀 | 磁盘告急 | WebP（P3）+ 保留天数清理 | P2 |
| 6 | 用户忘了记录 | 台账空洞 | 活动采集补"空闲提示" + 提醒引擎兜底 | P1 |
| 7 | 记录摩擦太大 | 弃用 | 所有动作 ≤2s、浮窗极简、可 Esc | P0 |
| 8 | 隐私翻车 | 口碑崩 | 本地优先、截图模糊化、导出审计 | P2 |
| 9 | 模型误判 | 报告不可用 | 报告标注"AI 生成仅供参考"、可重新生成 | P2 |

---

## 17. 打包与分发

### 17.1 electron-builder 要点

```yaml
appId: com.niuma.panel
productName: 牛马面板
win:
  target:
    - nsis        # 安装版
    - portable    # 便携版（先发布这个，降低门槛）
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
files:
  - dist/**       # 渲染进程产物
  - src/main/**   # 主进程（构建后）
  - src/preload/**
  - src/shared/**
```

- 原生模块处理：`electron-builder install-app-deps` 代替手写 electron-rebuild
- Windows 图标：256px ico；托盘图标另备 16/32 多尺寸

### 17.2 更新机制

- MVP 不做自动更新，官网/发布页手动下载
- P3 评估 electron-updater（需要签名，成本高，暂缓）

---

## 18. 待决策事项

| # | 事项 | 状态 | 决定 | 影响 |
|---|------|------|------|------|
| 1 | 是否开源 | **已定** | 开源，MIT 协议，造福打工人 | 仓库、README、行为说明 |
| 2 | 应用名 | 待定 | 候选：牛马面板 / 牛马阵线 / 牛马工作台 | 品牌 |
| 3 | 默认暗号文案 | 待定 | 先用"到点了，该存档了"，可随时改 | 产品调性 |
| 4 | 云端同步 | 待定 | 暂不做，本地优先；后续可复用用户自己的服务器 | 架构 |
| 5 | 代码签名证书 | 待定 | 先用 OSS 免费，误报再升级商业 | 分发 |
| 6 | 快捷工具默认清单 | 待定 | 候选：DeepSeek、石墨文档、语雀、腾讯文档、飞书、GitHub | 首屏体验 |
| 7 | 迷你栏默认位置 | 待定 | 右下角，可拖到四角 | 交互 |
| 8 | 手机端是否含截图 | 待定 | 不含（敏感），只统计数字 | 安全 |

### 18.1 已确认决策摘要（用户拍板）

- **开源**：完全没问题，这工具就是造福打工人用的。MIT 协议，代码公开可审查，天然对冲杀毒误报（见 §11.3）
- **本地调试**：先本地开发调试跑通，再考虑分发
- **内置快捷工具入口**：面板里放常用工具/站点，一键调开浏览器
- **交互分层**：右下角迷你 Dock 栏（可收起/展开看关键信息）+ 浏览器完整面板（更方便看报表）

---

## 附：开发前必读（对应炸飞机项目 INTEGRATION_NOTES 经验）

1. 每个 Phase 开工前重读本文档对应章节与验收清单
2. 核心逻辑（ledger/reminder/report）全部主进程纯函数化，保证可单测
3. 截图/采集相关代码改动后必须跑全量单测再进 UI 联调
4. 路径一律 `app.getPath('userData')` 动态拼接，禁止硬编码绝对路径
5. 快捷键、时间阈值等全部走 settings，禁止散落魔法值
