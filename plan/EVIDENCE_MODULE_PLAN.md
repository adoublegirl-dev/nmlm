# 牛马联盟证据模块设计方案

> 版本：v0.1  
> 状态：开发前方案  
> 目标：为后续证据模块开发提供目录结构、数据模型、Agent/Skill 流水线、管理页交互与导出规则。

---

## 1. 背景与目标

证据模块的目标不是简单做一个截图相册，而是建立一个本地优先的“证据工作台”。

核心场景：

- 打工人通过快捷键快速截图留证。
- 用户只需要提前设置一个证据存储根路径。
- 截图、文本、PDF、文档等材料自动进入统一证据库。
- 原始证据永久保留，不被覆盖、不被静默修改。
- 后续可以由 Agent / 多模态模型 / OCR / Skill 自动分析材料。
- 人在管理页中复核、修正、确认、锁定。
- 最终生成加班证据链、劳动仲裁材料、项目交付记录等报告。

必须明确边界：

- 系统只能帮助整理、分析、导出材料。
- AI 生成内容是辅助草稿，不等于法律事实。
- 是否作为正式证据使用，需要用户自行判断，必要时结合律师意见。

---

## 2. 最高优先级原则

### 2.1 原始证据不可覆盖

这是证据模块的第一原则。

任何进入证据库的原始材料，包括截图、文本、PDF、Word、Excel、聊天导出、邮件导出等，都必须遵守：

- 不覆盖。
- 不改名后替换。
- 不压缩替换。
- 不在原文件上写入标注。
- 不因重新分析而修改原始文件。
- 不允许 Agent / Skill 直接改原始文件。
- 删除必须二次确认，并建议默认只做“移入回收区/标记删除”，不要物理删除。

原始文件一旦入库，其 `sha256`、文件大小、采集时间、入库时间都要记录。

### 2.2 原件、元数据、分析、人工确认分离

证据库中至少区分四类内容：

| 层级 | 内容 | 是否可被 AI 修改 | 是否可被用户修改 |
|---|---|---:|---:|
| 原始证据 raw | 截图、文本、PDF、文档等原件 | 否 | 不建议，默认否 |
| 基础元数据 meta | 时间、路径、hash、设备、窗口、台账上下文 | 否 | 部分字段可补充，但原始采集字段不可改 |
| AI 分析 analysis | OCR、多模态总结、证据点草稿、风险提示 | 可新增，不覆盖 | 可采纳、拒绝、修订 |
| 用户确认 review | 人工备注、确认标签、证据说明、采纳的 claims | 否 | 是 |

### 2.3 所有结论都要可追溯

报告里的每一句关键结论，最好能追溯到：

- 哪个原始文件。
- 哪条元数据。
- 哪次 Agent 分析。
- 哪次用户确认。

### 2.4 不能处理的材料也要被记录

如果证据库里存在系统暂时无法处理的材料，例如视频、音频、未知格式、损坏文件、加密文件，不能直接忽略。

必须记录：

- 文件路径。
- 文件 hash。
- 文件类型。
- 无法处理原因。
- 建议用户如何处理。

最终报告里需要有“未处理材料说明”。

---

## 3. 证据库目录结构

用户设置里只需要选择一个根目录，例如：

```txt
D:\牛马证据
```

系统自动生成：

```txt
D:\牛马证据\牛马联盟证据库\
```

推荐结构：

```txt
牛马联盟证据库/
├─ _system/
│  ├─ evidence-index.sqlite
│  ├─ device.json
│  ├─ settings.json
│  └─ schema-version.json
│
├─ inbox/
│  ├─ manual-upload/
│  └─ agent-import/
│
├─ captures/
│  └─ 2026/
│     └─ 08/
│        └─ 05/
│           ├─ raw/
│           ├─ meta/
│           └─ thumbs/
│
├─ files/
│  └─ 2026/
│     └─ 08/
│        └─ 05/
│           ├─ raw/
│           ├─ meta/
│           └─ extracted/
│
├─ analysis/
│  └─ 2026/
│     └─ 08/
│        └─ 05/
│           ├─ ocr.jsonl
│           ├─ vision-summary.jsonl
│           ├─ text-summary.jsonl
│           └─ unsupported.jsonl
│
├─ reviews/
│  └─ 2026/
│     └─ 08/
│        └─ 05/
│           └─ review.jsonl
│
├─ cases/
│  ├─ 加班证据链/
│  │  └─ 2026-08/
│  │     ├─ case.json
│  │     ├─ timeline.md
│  │     └─ evidence-list.jsonl
│  └─ 自定义案件/
│
└─ exports/
   └─ 2026-08-05_加班证据链/
      ├─ 证据链说明.md
      ├─ 证据目录.xlsx
      ├─ 原始材料/
      ├─ 分析结果/
      ├─ 未处理材料说明.md
      └─ 打包清单.json
```

### 3.1 captures

专门放系统截图产生的图片。

```txt
captures/YYYY/MM/DD/raw/
```

截图文件命名：

```txt
20260805_214533_126_screen_f8a3c1.png
```

字段含义：

```txt
20260805       日期
214533_126     时分秒毫秒
screen         来源类型
f8a3c1         sha256 短码
```

### 3.2 files

放用户上传或 Agent 导入的非截图类文件。

支持类型建议：

- `.txt`
- `.md`
- `.csv`
- `.json`
- `.html`
- `.pdf`
- `.docx`
- `.xlsx`
- `.png`
- `.jpg`
- `.jpeg`
- `.webp`

暂不处理但可入库的类型：

- `.mp3`
- `.wav`
- `.mp4`
- `.mov`
- `.mkv`
- `.zip`
- `.rar`
- 其他未知格式

这些材料可以进入证据库，但分析时会标记为 unsupported 或 pending_manual。

### 3.3 inbox

用于临时导入。

- `manual-upload/`：管理页上传材料时先进入这里。
- `agent-import/`：Agent 或 MCP 工具导入材料时先进入这里。

导入服务扫描 inbox 后，计算 hash，生成证据 ID，再移动到正式 raw 目录。

---

## 4. 数据模型

### 4.1 Evidence 基础记录

建议 SQLite 表：`evidence_items`

核心字段：

```txt
id                      TEXT PRIMARY KEY
type                    TEXT  -- screenshot/text/pdf/docx/xlsx/image/audio/video/archive/unknown
source                  TEXT  -- screenshot/manual_upload/agent_import
status                  TEXT  -- captured/imported/analyzed_draft/reviewed/locked/exported/unsupported
original_path           TEXT
relative_path           TEXT
sha256                  TEXT
size_bytes              INTEGER
mime_type               TEXT
created_at              INTEGER  -- 文件原始创建/截图时间
imported_at             INTEGER  -- 入库时间
captured_at             INTEGER  -- 截图时间，可为空
device_id               TEXT
ledger_entry_id          INTEGER nullable
tag_id                  INTEGER nullable
title                   TEXT nullable
user_note               TEXT nullable
unsupported_reason      TEXT nullable
is_deleted              INTEGER default 0
```

### 4.2 基础元数据

表：`evidence_metadata`

```txt
id              INTEGER PRIMARY KEY
evidence_id     TEXT
key             TEXT
value_json      TEXT
source          TEXT -- system/user/agent
created_at      INTEGER
```

截图时系统自动写入：

- active app
- window title
- display id
- screen size
- timezone
- hostname
- OS
- ledger context
- after hours flag

这些系统字段默认只读。

### 4.3 Agent 分析结果

表：`evidence_analyses`

```txt
id              TEXT PRIMARY KEY
evidence_id     TEXT
agent_name      TEXT
skill_name      TEXT
model_name      TEXT
analysis_type   TEXT -- vision/ocr/text/file_scan/case_build
summary         TEXT
claims_json     TEXT
risk_notes_json TEXT
confidence      REAL
status          TEXT -- draft/superseded/accepted/rejected
created_at      INTEGER
```

### 4.4 用户复核记录

表：`evidence_reviews`

```txt
id                  TEXT PRIMARY KEY
evidence_id          TEXT
review_status        TEXT -- pending/reviewed/locked/rejected
confirmed_title      TEXT
confirmed_summary    TEXT
confirmed_tags_json  TEXT
accepted_claims_json TEXT
user_note            TEXT
created_at           INTEGER
updated_at           INTEGER
```

### 4.5 修订历史

表：`evidence_revisions`

```txt
id              TEXT PRIMARY KEY
evidence_id     TEXT
actor           TEXT -- user/system/agent
action          TEXT -- edit_note/edit_title/accept_claim/reject_claim/lock/unlock/delete
changes_json    TEXT
created_at      INTEGER
```

---

## 5. 截图入库流程

F10 截图流程：

```txt
1. 用户按 F10
2. Electron 截屏
3. 写入临时文件
4. 计算 sha256
5. 生成 evidence_id
6. 移动到 captures/YYYY/MM/DD/raw/
7. 生成 meta JSON
8. 生成缩略图 thumbs
9. 写入 SQLite evidence_items / metadata
10. 记录器提示“已落盘”
```

关键要求：

- 如果同一毫秒发生冲突，文件名追加序号。
- 如果 hash 相同，也不能覆盖旧文件，可以标记 duplicate_of。
- 写文件要尽量用临时文件 + rename，避免半文件。
- 截图成功后再写数据库；数据库失败时要有修复扫描机制。

---

## 6. 用户上传 / Agent 导入流程

管理页可以支持上传材料：

```txt
1. 用户在证据模块点击“导入材料”
2. 选择文件
3. 文件进入 inbox/manual-upload
4. 系统计算 hash 和类型
5. 按日期移动到 files/YYYY/MM/DD/raw
6. 生成基础 meta
7. 写入 SQLite
8. 管理页显示为“待分析 / 待复核”
```

Agent / MCP 导入类似：

```txt
1. Agent 调用 nmlm_evidence_import
2. 传入文件路径或 session file
3. 文件进入 inbox/agent-import
4. 系统完成入库
```

禁止 Agent 直接写正式 raw 目录。

---

## 7. Agent / Skill 处理流水线

### 7.1 Skill 定位

建议设计 Skill：`nmlm-evidence-analyst`

职责：

- 扫描证据库或指定证据 ID。
- 判断证据类型。
- 对能处理的材料生成分析草稿。
- 对不能处理的材料生成无法处理说明。
- 生成案件证据链草稿。

Skill 不能：

- 覆盖原始文件。
- 修改系统采集元数据。
- 直接把草稿标记为 reviewed / locked。

### 7.2 处理前先盘点

Agent 每次处理前必须先生成 inventory：

```json
{
  "scan_id": "scan_20260805_220000",
  "root": "D:/牛马证据/牛马联盟证据库",
  "items": [
    {
      "evidence_id": "xxx",
      "type": "screenshot",
      "path": "captures/.../raw/xxx.png",
      "processable": true,
      "processor": "vision"
    },
    {
      "evidence_id": "yyy",
      "type": "mp4",
      "path": "files/.../raw/yyy.mp4",
      "processable": false,
      "reason": "当前版本暂不支持视频内容解析"
    }
  ]
}
```

### 7.3 类型分流

| 类型 | 处理方式 | 当前建议 |
|---|---|---|
| png/jpg/webp 截图 | 多模态视觉 + OCR | P2 |
| txt/md | 直接读取文本摘要 | P1/P2 |
| csv/json | 结构化读取 | P2 |
| html | 提取正文/标题 | P2 |
| pdf | 文本抽取，扫描件暂不 OCR | P2 |
| docx | 文本抽取 | P2 |
| xlsx | 表格摘要 | P2 |
| mp3/wav | 暂不处理，记录原因 | P1 |
| mp4/mov/mkv | 暂不处理，记录原因 | P1 |
| zip/rar | 暂不处理或仅列清单 | P2/P3 |
| unknown | 记录原因 | P1 |

### 7.4 处理输出

能处理的输出：

```json
{
  "evidence_id": "xxx",
  "analysis_type": "vision",
  "summary": "截图显示用户在 21:45 处理工单系统。",
  "claims": [
    {
      "type": "work_activity",
      "text": "截图显示正在处理工单。",
      "basis": ["窗口标题包含工单详情", "页面出现提交记录"],
      "confidence": 0.78
    }
  ],
  "risk_notes": [
    "截图只能证明该时刻屏幕显示内容，建议结合聊天记录或任务记录。"
  ]
}
```

不能处理的输出：

```json
{
  "evidence_id": "yyy",
  "analysis_type": "unsupported",
  "summary": "该文件已入库但未解析。",
  "reason": "当前版本暂不支持视频内容解析。",
  "suggestion": "可以手动补充说明，或后续接入视频转帧/语音识别能力。"
}
```

---

## 8. 管理页证据模块设计

证据模块不是单纯图库，而是“证据审阅台”。

### 8.1 总览

展示：

- 今日新增证据。
- 待分析。
- 待复核。
- 已确认。
- 已锁定。
- 未处理材料。

### 8.2 筛选

支持：

- 日期范围。
- 类型：截图、文本、PDF、图片、文档、未知。
- 状态：待分析、待复核、已确认、已锁定、无法处理。
- 标签：加班、任务、沟通、考勤、系统记录、自定义。
- 是否关联台账。

### 8.3 列表 / 时间线

两种视图：

1. 列表视图：适合批量筛选。
2. 时间线视图：适合看某天证据链。

时间线应和台账联动：

```txt
20:13 开始工作记录
21:04 截图
21:45 文本导入
22:18 截图
22:46 停止记录
```

### 8.4 详情页

建议左右结构：

```txt
左侧：原始材料预览
右侧：元数据 / Agent 草稿 / 人工复核
```

不同类型预览：

- 图片：图片预览，可放大。
- 文本/Markdown：文本预览。
- PDF/DOCX/XLSX：提取文本预览 + 打开原文件。
- 音频/视频/未知：显示文件信息和无法处理说明。

### 8.5 人工复核

用户可以：

- 修改证据标题。
- 添加人工备注。
- 修改标签。
- 关联台账记录。
- 采纳 / 拒绝 Agent claims。
- 标记“可用于加班证据链”。
- 标记“无效材料”。
- 确认。
- 锁定。

所有修改写入 review / revision，不覆盖原始文件和系统元数据。

### 8.6 锁定机制

锁定后：

- 不允许修改标题、备注、标签、claims。
- 如需修改，必须解锁，并记录 revision。
- 锁定状态用于导出正式证据包。

---

## 9. 报告生成

报告生成前先选择：

- 日期范围。
- 证据类型。
- 包含状态：已确认 / 已锁定 / 包含待复核。
- 输出格式：Markdown / PDF / DOCX / ZIP。

报告必须包含：

```txt
1. 概览
2. 时间线
3. 已确认材料列表
4. 每份材料的说明
5. 关联台账记录
6. Agent 分析摘要，明确标注为辅助分析
7. 未处理材料说明
8. 文件清单与 hash
```

### 9.1 未处理材料说明

报告中必须有单独章节：

```md
## 未处理材料说明

以下材料已入库，但当前版本未能自动解析：

| 文件 | 类型 | 原因 | 建议 |
|---|---|---|---|
| 20260805_220100_meeting.mp4 | video/mp4 | 当前版本暂不支持视频解析 | 可手动补充说明，或后续转成截图/文字材料 |
```

这能避免材料被无声忽略。

---

## 10. MCP / Agent 工具建议

未来可以提供 MCP 工具：

```txt
nmlm_evidence_import       导入证据材料
nmlm_evidence_list         列出证据
nmlm_evidence_get          读取证据元数据
nmlm_evidence_analyze      触发分析
nmlm_evidence_review       写入用户确认，默认需要管理页确认
nmlm_evidence_build_case   生成证据链草稿
nmlm_evidence_export       导出材料包
```

安全原则：

- Agent 默认只能新增分析和导入材料。
- Agent 不能修改 raw。
- Agent 不能直接锁定证据。
- 涉及删除、锁定、导出正式包，应由用户在管理页确认。

---

## 11. 分阶段开发计划

### P1：原始证据库与管理页基础

目标：先把“证据不丢、不覆盖、能管理”做稳。

任务：

- 设置证据根目录。
- 自动生成证据库结构。
- F10 截图写入 captures/YYYY/MM/DD/raw。
- 生成基础 meta JSON。
- 生成 sha256。
- 写入 SQLite 索引。
- 管理页展示证据列表。
- 支持图片预览、文本预览、文件信息预览。
- 支持用户手动导入文件。
- 支持人工标题、备注、标签、关联台账。
- 支持状态：待复核 / 已确认 / 无法处理。
- 支持当日加班证据链 Markdown 导出。

### P2：Agent / Skill 分析草稿

目标：让 AI 成为证据整理助手。

任务：

- 设计 `nmlm-evidence-analyst` Skill。
- 证据 inventory 扫描。
- 图片 OCR / 多模态摘要。
- 文本 / PDF / DOCX / XLSX 内容抽取。
- claims + basis + risk_notes 结构化输出。
- 不能处理材料输出 reason。
- 管理页展示 Agent 分析草稿。
- 用户采纳 / 拒绝 claims。

### P3：锁定、修订、案件包

目标：形成严谨的证据链工作流。

任务：

- 证据锁定 / 解锁。
- 修订历史。
- 案件包 cases。
- 证据链时间线。
- 导出 ZIP。
- 导出 DOCX / PDF。
- 导出证据目录 Excel。
- MCP 工具开放给其他 Agent。

---

## 12. 开发注意事项

1. 先做文件安全，再做 AI 分析。
2. 原始文件保护优先级高于所有体验优化。
3. 所有写入都要考虑失败恢复。
4. 截图落盘要使用临时文件，成功后 rename。
5. 数据库和文件系统要能互相修复。
6. 删除、覆盖、锁定、导出正式包都应有确认。
7. Agent 输出永远是草稿，用户确认后才进入 reviewed。
8. 不支持的材料不能忽略，要写入 unsupported。
9. 报告不能夸大 AI 结论。
10. 管理页文案要避免制造“稳赢仲裁”的幻觉。

---

## 13. 推荐结论

证据模块的底层定位：

```txt
本地证据工作台 = 原件保险柜 + 元数据索引 + Agent 分析草稿 + 人工复核 + 证据链导出
```

最先开发的重点不是 AI，而是：

```txt
原始证据安全入库
文件不覆盖
路径结构清晰
管理页可复核
报告能说明已处理与未处理材料
```

只要这套地基稳，后续接 OCR、多模态模型、Agent Skill、劳动仲裁模板，都会比较顺。
