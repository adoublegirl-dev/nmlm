# 牛马联盟 · 集成/部署/调试备忘（活的文档）

> 每进入一个新 Phase 前先读此文档回顾注意事项。
> 更新记录见文末。

## 一、当前状态（2026-08-05）

**P0+ 完成并冒烟通过**：台账闭环 + 独立桌面记录器 + 浏览器面板 + 快捷工具 + 待办 + MCP 桥 + Express 服务。

已验证：
- 15 个单元测试全绿（ledger 状态机 / report 聚合 / time 工具）
- Electron 启动无报错，`http://127.0.0.1:37129` 面板/recorder/tagpicker 页面均 200
- API 通道正常：server:info、tools:list（6 个默认工具）、ledger:current、todos:list
- 新增：任务播放器 switchTask/complete/pausePoint，待办 CRUD，MCP server（src/mcp/server.mjs）

待开发（P1）：截图水印文字、提醒引擎挂载、TagPicker 窗口实弹验证、快捷键录制热重载。

## 二、坑点速查（已踩过的坑，勿再踩）

| # | 坑 | 表现 | 对策 |
|---|-----|------|------|
| 1 | better-sqlite3 版本 | Node 24 下 v11 编译失败 | 必须 v12+（有 Node 24 prebuilt） |
| 2 | Electron ABI 不匹配 | `NODE_MODULE_VERSION 137 vs 125` | 装完依赖后跑 `npx electron-rebuild -f -w better-sqlite3` |
| 3 | 残留 electron 进程 | 新实例秒退（单实例锁被占） | 调试前 `Get-Process electron \| Stop-Process -Force` |
| 4 | 多入口构建无 index.html | 根路径 404 | server 已加 `GET /` 重定向 `/panel.html`，勿删 |
| 5 | window.js 缓存返回对象 | `.catch is not a function` | 缓存必须存 Promise（契约：永远返回 Promise） |
| 6 | vi.mock 对原生 require 无效 | mock 不生效 | 测试用 `createRequire` + 在 beforeEach monkey-patch 模块属性；ledger/evidence 调用窗口采集必须走 `winUtil.getActiveWindow()` 对象引用，不能解构 |
| 7 | 测试造数据用 startOfDay 当 start_time | duration 变成 20+ 小时 | 用 `insert` + `finish` 手工指定 durationSec |
| 8 | whenReady 回调内 await | `await is only valid in async functions` | 回调必须 `async () => {}` |
| 9 | 双 ABI 切换 | electron-rebuild 后 node 测试挂（125 vs 137），npm rebuild 源码编译必败 | 用 prebuild-install 下载对应 ABI：`npm run rebuild`（electron 31.7.7）切运行；`npm run rebuild:node` 切测试。`npm test` / `npm run dev` 的 pre 脚本已自动处理 |
| 10 | desktopCapturer thumbnailSize=0 | 截图存了但图是空的 | 必须传真实屏幕尺寸：`screen.getPrimaryDisplay().size` |
| 11 | 迷你栏拖拽漂移 | 鼠标动一点点窗口跑很远 | 用 mousedown 快照 + 绝对位移，禁止在 mousemove 里同步 window.screenX 基准 |
| 12 | electron-builder 打包 EBUSY | better_sqlite3.node 被残留 electron 进程锁住，prebuild/node-gyp 都覆盖不了 | 打包前 `Get-Process electron \| Stop-Process -Force` 确认无残留；git 仓库里**不要提交 node_modules** |

## 三、架构约定（改代码前必读）

1. **渲染层永远走 http 加载**（`loadURL(http://127.0.0.1:port/xxx.html)`），不用 loadFile。端口从 settings 读，先起 server 再建窗口。
2. **IPC 通道名集中在 `src/shared/constants.js`**，主进程 handler 注册表在 `ipc.js`，HTTP `/api/call` 复用同一注册表（`ipc.call`），禁止另起一套。
3. **服务层全部 CJS、可单测**：依赖注入经 require 模块，测试用内存库 `db.init(':memory:')`。
4. **截图 webPath**：`evidence.listByRange` 返回 `/shots/<相对路径>`，渲染层 `s.webPath` 直接当 img src，禁止拼本地绝对路径。
5. **设置读写一律走 settings 服务**（deepMerge 默认值），禁止散落魔法值。
6. **端口占用自动递增**（最多 +10），实际端口写回 settings.server.port。
7. **截图目录**：`evidence.screenshotsDir()` 统一出口（userData/screenshots 或设置值），server 的 /shots 静态指向同一函数。

## 四、测试命令

```powershell
npm test                    # vitest 全量
npm run build:renderer      # 构建渲染层（dist/）
npm run dev                 # 构建后启动 electron
# 冒烟：Start-Process electron，Invoke-RestMethod 打 /api/call，最后清 electron 进程
```

## 五、启动/调试流程

1. `npm install`（首次）
2. `npx electron-rebuild -f -w better-sqlite3`（依赖变更后）
3. `npm run build:renderer`
4. `npm run dev` 或手动 `node_modules\.bin\electron.cmd .`
5. 浏览器开 `http://127.0.0.1:37129` 看面板
6. 调试结束清理：`Get-Process electron | Stop-Process -Force`

## 六、路径动态化清单（禁止硬编码）

- 数据库：`app.getPath('userData')/niuma.db`（db/index.js init 时传入）
- 截图：`evidence.screenshotsDir()`
- 渲染层：`http://127.0.0.1:${settings.server.port}`
- 端口：settings.server.port（默认 37129，占用自动递增）

## 七、待办/待验证（P1 及以后）

- [ ] 截图水印：P0 未加文字水印（nativeImage 不能直接绘图），P1 用 canvas/sharp 方案
- [x] 待办提醒基础版：到期待办走系统 Notification（单次运行内不重复）
- [ ] 提醒引擎挂载：reminder.js 逻辑已写好（evaluate 可单测），P1 在 index.js 启动定时器 + 弹窗
- [ ] TagPicker 窗口实际弹出验证（键盘事件在无边框窗口的焦点行为）
- [ ] 快捷键录制热重载（设置变更 → shortcut.unregisterAll + registerAll）
- [ ] 崩溃恢复提示 UI（当前启动自动归档 + console 日志，无用户提示）
- [ ] panel chunk 1.1MB：ECharts 全量引入，P1 按需 import 或 CDN 内联
- [ ] active-win 原生依赖评估（P0 用 PowerShell 方案已够）
- [ ] 打包验证：electron-builder portable

## 八、更新记录

- 2026-08-05：P0 完成。坑点 1-8 记录。设计文档 DESIGN.md v0.2。
- 2026-08-05（补丁）：迷你栏提亮（高对比边框/实背景/投影，解决浅色壁纸下看不见）；实现拖拽（mousedown/mousemove 区分点击与拖动，IPC mini:setPos 带屏幕边界 clamp）；面板主题提亮一档（--bg-deep #1a1d23）。
- 2026-08-05（补丁2）：修四件事：① 截图空图（thumbnailSize 传真实屏幕尺寸）；② 设置页补标签管理分区（增删改/数字键/颜色/摸鱼标记）；③ 台账记录点击可编辑（改标签 + 写备注 detail，走 ledger:retag）；④ 迷你栏拖拽漂移（去掉 mousemove 基准同步）；⑤ ABI 切换方案改为 prebuild-install，npm test/dev 自动切换。
- 2026-08-10：按新思路改为“桌面悬浮任务播放器”：开始/切换任务会自动切段，完成任务结束当前段，暂停点写 pause_points；新增 todos 表、待办浏览器管理页、到期桌面通知、MCP server（nmlm_todo_add/list/update/close/current）。19 个单元测试全绿，Electron 冒烟通过。
- 2026-08-10（补丁）：悬浮记录器重新分层：默认紧凑态只显示当前任务/计时/主动作/更多，展开态才展示切换、完成、暂停点、打开面板，标签选择为第三层。新增设置项 mini.enabled，控制启动时是否自动显示悬浮记录器；关闭后可从托盘/启动器手动显示。暂停点在记录器中显示数量，台账页显示暂停点 chip 和时间点。快捷键先尝试过 CommandOrControl+Shift+数字，但 Windows 上 Shift+数字存在键盘布局解释问题，最终改用 CommandOrControl+Alt+数字并迁移旧配置，启动日志输出注册成功/失败，失败时弹 Notification。
- 2026-08-10（记录器重做）：用户明确记录器只承担记录职能，废弃“任务播放器/复杂面板”形态。桌面记录器改为小秒表：标题仅“记录器”，显示 HH:MM:SS、标签下拉、开始/暂停/停止按钮、关闭隐藏到托盘并继续服务、窗口原生拖拽。快捷键 start/stop 改为主进程直接写 ledger，不再依赖记录器窗口 JS：Ctrl+Alt+1 按 mini.selectedTagId 或第一个标签直接 ledger.start，Ctrl+Alt+2 ledger.complete；记录器通过 ledger 事件刷新。
- 2026-08-10（快捷键变大修复）：用户反馈快捷键后没有记录但桌面记录器变大。根因是旧“任务选择器/播放器”通道残留：second-instance 调 resizeMini、IPC MINI_RESIZE、windows.showTaskPicker/send mini:open-task-picker、mini 端监听 mini:open-task-picker。已全部删除，grep 确认无 showTaskPicker / mini:open-task-picker / MINI_RESIZE / resizeMini。记录器窗口固定 280×160，快捷键不再触发任何窗口 resize。
- 2026-08-10（硬切重写）：用户仍反馈会放大，评估后停止修补旧 mini，新增完全独立 recorder.html + src/renderer/src/recorder/，Vite 入口从 mini 改为 recorder，旧 mini.html/src/mini 删除；windows.js 重写为 recorderWin/createRecorder/showRecorder/hideRecorder，不再存在 resize API；设置从 recorder.enabled/selectedTagId/position 读取，保留 mini 仅兼容旧数据。快捷键改用 F8/F9/F10，避免 Ctrl+Alt+数字撞桌面/显卡热键：F8 开始/暂停，F9 停止，F10 截图；F12 因常被浏览器/开发工具占用，openPanel 默认不注册快捷键，面板从托盘打开。
- 2026-08-10（记录器 UI 精简）：用户确认核心功能可用后，要求记录器更横向精简。窗口宽度改为 380；布局压成两行，主行包含 HH:MM:SS、开始/暂停合一按钮、停止按钮、最右侧窄标签下拉；按钮为图标式，title 悬浮提示名称。标签下拉改为自定义 dropdown：平时按钮宽 112，展开菜单宽 250，长标签单行省略不换行；菜单作为透明窗口承载层里的外层浮层显示在记录器上方，不再撑大记录器视觉框子。
- 2026-08-10（记录器自动收缩）：新增 5 秒无操作自动收缩为“时间胶囊”状态，仅显示 HH:MM:SS；鼠标移入自动恢复完整记录器。收缩态窗口实际缩到 176×54，完整态恢复 380×260，保持右下角不漂移。菜单打开时禁止自动收缩。视觉动效包括内容淡出、胶囊圆角、淡金呼吸光效、时间居中与尺寸过渡。
- 2026-08-10（收缩态 bug 修复）：修复 F8 触发后窗口尺寸展开但前端 collapsed 样式未同步、以及胶囊态鼠标移入无法恢复的问题。新增 EVENTS.RECORDER_EXPAND，windows.setRecorderCollapsed(false) 时向 recorder 页面发送 recorder:expand；前端收到后仅更新 DOM 状态不反向同步窗口，避免循环。collapsed 态取消 -webkit-app-region: drag，优先保证 mouseenter/mousedown 可唤醒。
- 2026-08-10（F8 不唤醒 + 胶囊边角）：用户反馈胶囊态按 F8 仍会变长，且透明窗口四角有浅/深脏边。修复：F8 start/pause 分支不再调用 showRecorder，快捷键只改记录状态，不唤醒 UI；主 recorder BrowserWindow 增加 backgroundColor '#00000000'。
- 2026-08-10（胶囊漏边修复）：用户反馈 inset 后从漏角变成漏边。改为 native window shape：收缩态恢复 176×54，使用 BrowserWindow.setShape 逐行矩形近似圆角胶囊裁剪窗口本身，完整态 setShape([]) 恢复。CSS 收缩态不再留透明 inset，去除外阴影/边框，背景改纯 #202329，保留轻微 filter 呼吸光效，避免透明窗口边缘合成脏边。
- 2026-08-10（台账页与暂停点整理）：后台台账页改为默认今天、支持今天/昨天快捷和 date picker（最大今天），列表默认按开始时间倒序。列表展示日期、时间范围、开始时间、标签、时长、暂停点数量。pause_points 新增 tag_id（migration v3）。暂停点语义：记录原标签为第一段标签；每个暂停点 tag_id 表示“从该暂停点开始到下一个暂停点/记录结束”的标签。后台编辑记录时可为每个暂停点选标签；若不同于原记录标签，保存时统一确认后 ledger.applyPausePointPlan 会按暂停点拆分 time_entries，并自动合并连续同标签；旧 pause_points 被消费删除。若只改暂停点文字或同标签，则仅保存 pause_points.detail/tag_id，不拆分也不消费暂停点。进行中记录暂不支持拆分。新增 2 个单测覆盖拆分与同标签文字保存。
- 2026-08-10（F8 暂停语义收敛）：F8/start 语义改为：无记录→开始；记录中→暂停并写 pause_point，不归档当前 time_entry；暂停中→继续。暂停中继续时若标签未变，沿用原记录，不产生断档，暂停点保留供后台编辑；若标签变化，则从 paused_at 切开，旧记录 end_time=paused_at，新记录 start_time=paused_at，消费本次暂停点，确保两段连续无空白。F9/complete 若处于暂停态，则结束时间取 paused_at 并删除本次末端暂停点。ledger.current() 会返回 paused/paused_at/pause_point_id，记录器据此显示暂停态并冻结计时。服务关闭/崩溃期间仍属于真实断档，由 recover 归档残留。新增单测覆盖：pause 不归档、同标签 resume 不断档、换标签 resume 连续切段。
- 2026-08-10（待办完整闭环）：todos 新增 migration v4：reminded_at、snooze_until，用于持久提醒去重/稍后提醒。todos 服务层补 status/priority/source/dueAt/remindedAt/snoozeUntil 校验，不存在 id 返回错误；支持 reopen、snooze、markReminded。浏览器待办页重做：状态可编辑（todo/doing/done）、开始做/转 todo、完成、重开、删除、已到期过滤、过期高亮、截止时间显示到分钟，并修正 datetime-local 编辑时使用本地时间而不是 toISOString UTC。提醒服务改为持久 reminded_at 去重，Notification 点击打开 panel.html#todos。MCP 升级到 v0.2：add/list/update/close/reopen/delete/due/current，并增强桌面服务未启动错误提示。测试扩展到 25 个，覆盖 CRUD/reopen/delete、校验、due/reminded/snooze。
- 2026-08-10（Windows/MCP 启动兼容）：为 Windows 中文路径与 PowerShell 乱码补脚本：scripts/dev.ps1、scripts/mcp.ps1 会设置 chcp 65001、OutputEncoding、Console Input/OutputEncoding、PYTHONIOENCODING；scripts/create-junction.ps1 创建默认 C:\\nmlm -> 当前项目目录，给不喜欢中文路径的 MCP 客户端使用。package.json 新增 dev:utf8、mcp:utf8、junction。README 补完整 MCP 安装配置，推荐 MCP command=powershell -File C:\\nmlm\\scripts\\mcp.ps1，并显式传 NMLM_API。
