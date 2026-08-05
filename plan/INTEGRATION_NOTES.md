# 牛马联盟 · 集成/部署/调试备忘（活的文档）

> 每进入一个新 Phase 前先读此文档回顾注意事项。
> 更新记录见文末。

## 一、当前状态（2026-08-05）

**P0 完成并冒烟通过**：台账闭环 + 迷你栏 + 浏览器面板 + 快捷工具 + Express 服务。

已验证：
- 15 个单元测试全绿（ledger 状态机 / report 聚合 / time 工具）
- Electron 启动无报错，`http://127.0.0.1:37129` 面板/mini/tagpicker 页面均 200
- API 通道正常：server:info、tools:list（6 个默认工具）、ledger:current

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
