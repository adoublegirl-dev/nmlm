# 牛马联盟安装、升级、恢复与发布规范

> appId：`com.niuma.union`（正式发布后禁止修改）
>
> productName：`牛马联盟`（正式发布后禁止修改）

## 1. 数据边界

```text
程序目录        用户安装时选择，只放程序文件
AppData         %APPDATA%/牛马联盟/niuma.db、设置、备份、更新缓存
证据库          用户指定父目录/牛马联盟证据库
发行工作区      源码相邻的 牛马联盟-发行工作区，只放资源和二进制产物
```

升级只替换程序文件，不扫描硬盘，不移动 AppData 和证据库。

## 2. 启动模式

- `first-install`：数据库不存在，创建数据库并展示首次设置向导。
- `upgrade`：应用版本或 schema 向前变化，迁移前自动备份数据库。
- `normal`：版本与 schema 已匹配，直接启动。
- `downgrade blocked`：数据库由更高应用版本或 schema 写入，停止写入并提示。

数据库 `app_metadata` 记录：

- `last_app_version`
- `schema_version`
- `last_start_mode`
- `installed_at`
- `last_upgraded_at`

## 3. 升级安全

1. 单实例锁确保旧进程不同时写数据库。
2. 升级前调用 SQLite backup API 写入 `%APPDATA%/牛马联盟/backups/`。
3. 每条 migration 独立事务执行。
4. migration 失败时保留升级前备份，并安排下次启动恢复。
5. 默认最多保留 12 个自动备份；恢复前备份不参与即时裁剪。
6. 数据库完整性可在“系统”页运行和导出。

## 4. 证据库失联

配置了自定义证据库后，如果磁盘未连接或目录不存在：

- 禁止自动创建同名空库。
- 截图、导入等写操作失败并提示。
- 启动时发送系统通知。
- 用户可在“系统”页重新定位已有证据库。
- 重新定位后按 `relative_path` 修正索引路径，并从 meta 补建缺失索引。

只有未配置自定义路径时，程序才允许创建默认空证据库。

## 5. 配置迁移与换机

“系统”页支持导出/导入配置 JSON。配置文件不包含：

- API/访问 Token
- SQLite 数据库
- 证据原件
- 窗口位置

换机建议：复制 `niuma.db` 或通过备份恢复；连接/复制证据库；导入配置；重新定位证据库并重建索引。

## 6. 卸载与重装

- 覆盖更新不删除 AppData。
- 手动卸载时安装器询问是否删除本地设置和台账数据库。
- 外置证据库永远不由卸载器删除。
- 默认选择保留数据。
- 重装后检测已有数据库，沿用原配置。

## 7. 应用更新

“系统”页支持：

1. 通过 HTTPS 检查 GitHub Release/自定义 JSON manifest。
2. 比较语义版本。
3. 展示版本和更新说明。
4. 下载到 AppData `updates/`。
5. 强制 SHA256 校验；没有可信 SHA256 时拒绝安装。
6. 用户确认后启动安装器并退出当前程序。

GitHub Release 必须上传：

```text
牛马联盟-Setup-X.Y.Z.exe
牛马联盟-Setup-X.Y.Z.exe.sha256
```

当前默认检查：`https://api.github.com/repos/adoublegirl-dev/nmlm/releases/latest`。仓库没有 Release 时返回 404 属于预期状态。

## 8. 正式发布流程

```powershell
npm version X.Y.Z --no-git-tag-version
npm test
npm run build:renderer
npm run release:preflight
npm run dist:release
```

验证：

- `40 tests passed`
- preflight 通过
- ASAR 中无 db/sqlite/screenshots/证据库/log
- `win-unpacked/牛马联盟.exe` 启动并通过 `lifecycle:diagnostics`
- 人工验证 assisted NSIS 的安装路径、进度、首次向导、覆盖升级和卸载提示

随后创建 GitHub Release `vX.Y.Z`，上传安装器和 `.sha256`。

## 9. 已知发布边界

- 当前安装器未做商业代码签名，Windows SmartScreen 可能提示未知发布者。
- 自动更新采用“下载校验后启动安装器”，不做静默替换。
- 不允许跳过 SHA256。
- exe、blockmap、win-unpacked 不提交 Git 仓库。
