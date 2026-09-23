# CodeStory Backend MVP 终版改造方案

状态：FINAL / READY FOR IMPLEMENTATION
日期：2026-09-23
替代文档：`D:\googledownload\CodeStory_Backend_MVP_Implementation_Spec.md`

## 1. 最终产品决策

本方案已锁定以下决策，开发阶段不得自行改回：

1. 一次性迁移为完整的 `apps/web + apps/server` Monorepo。
2. 分析采用单个异步 Job；系统自动选择最多 3 个证据最强的 Feature，并直接生成 Story，不再等待用户手动选择 Feature。
3. 同时支持 GitHub 仓库和本地文件夹。
4. 本地源码上传到按 Job 隔离的临时磁盘工作区；任务完成或失败后删除，服务启动时清理超时残留。
5. MVP 是单用户、本地或自托管模式，不建设账号、租户和权限系统。
6. 本次交付本地开发、测试和生产构建能力，不负责公网部署或 Docker 化。
7. 生产构建由 Fastify 同源提供 React 静态文件和 `/api`。
8. LLM API Key 由用户在前端输入，由后端加密保存；任何前端存储、API 响应和日志都不得回传明文 Key。
9. 支持范围明确限定为 JavaScript、TypeScript、Python GitHub 仓库及受限本地上传；大仓库要求指定子目录。
10. 预置 Demo 必须继续可离线浏览，后端分析失败不得破坏 Demo Player。

## 2. 原方案的逻辑缺口与终版处理

| 编号 | 原方案缺口 | 风险 | 终版处理 |
|---|---|---|---|
| 1 | 单个 Job 状态机包含生成 Story，但验收流程要求中途选择 Feature | API 与产品流程无法同时成立 | 已决定取消人工选择，自动选择最多 3 个有真实证据的 Feature |
| 2 | 现有产品支持本地文件夹，后端方案只定义 GitHub | 功能回退且无法完成迁移 | 增加本地 multipart 上传入口、限制、路径校验和临时工作区 |
| 3 | 异步任务没有定义源码在请求结束后的存放方式 | Worker 读取不到上传源码，或源码永久残留 | 采用 Job 工作区；终态清理，启动时回收孤儿目录 |
| 4 | 用户自带 LLM Key，但原方案只写服务端环境变量 | 与产品决策冲突，且可能重新暴露到 localStorage | 增加凭据 API、AES-256-GCM 加密存储、日志脱敏和删除能力 |
| 5 | `Project`、`AnalysisJob`、`Story` 缺少关系、时间和终态字段 | 无法恢复任务、定位 Story 或表达失败 | 补齐关系、时间戳、错误码、状态和 Job/Story 唯一关联 |
| 6 | `POST` 只返回 `jobId`，但 Story API 需要 `projectId` | 前端无法拼出 Story URL | 创建任务时同时返回 `jobId` 与 `projectId`；Job 状态也返回二者 |
| 7 | 状态机没有 `failed`，也没有重启恢复规则 | 任务会永久停在 running，用户只看到轮询不结束 | 增加终态、错误契约、启动恢复和缺失工作区处理 |
| 8 | “任意 GitHub repo”与当前语言、文件和 GitHub Tree 限制冲突 | 验收目标不可验证 | 改为“支持边界内的 JS/TS/Python 仓库”，大仓库给出子目录提示 |
| 9 | Story 返回契约只列出四个字段 | 现有 Player 还需要项目元数据、描述、技术栈和证据摘要 | API 返回完整 `RuntimeProject`，保持 `AppV03` 可直接消费 |
| 10 | 没有测试框架和失败路径测试 | 迁移后无法证明密钥、任务和证据逻辑正确 | 建立 server、web 和 E2E 三层测试，覆盖下文全部分支 |
| 11 | GitHub Pages 仍是当前部署方式 | GitHub Pages 无法承载 Fastify/SQLite/Worker | 删除 Pages 作为新版运行路径，生产由 Fastify 同源托管 web build |
| 12 | 当前基线构建已失败 | 容易把旧故障算到迁移头上 | 修正 `testConnection` 错误导入，并用构建回归测试锁定 |

## 3. 目标架构

```text
Browser
  |
  | same-origin HTTP
  v
Fastify Server
  ├── /api/settings/llm       凭据配置、测试、掩码展示
  ├── /api/projects/analyze/* 创建 GitHub / Local Job
  ├── /api/jobs/:jobId        查询状态与错误
  ├── /api/projects/:id/story 获取兼容 Story
  └── /*                       React 静态资源与 SPA fallback
          |
          v
     Persistent Job Runner (concurrency = 1)
          |
          ├── Repository Adapter
          │     ├── GitHub REST tree/blob reader
          │     └── Local workspace reader
          ├── Digest + Structural Index
          ├── Feature Discovery
          ├── Evidence-aware auto selection (top 3)
          ├── Story Generation
          ├── Evidence Validation
          └── Prisma + SQLite
                ├── projects
                ├── analysis_jobs
                ├── stories
                └── llm_credentials (encrypted)

Temporary source lifecycle
Upload/Fetch -> var/workspaces/{jobId} -> Analyze -> terminal cleanup
                                         |
                              startup stale-workspace sweep
```

### 架构边界

- Web 只负责输入、上传、轮询、错误展示和播放 Story。
- Server 是 GitHub、文件过滤、LLM、证据校验和持久化的唯一执行方。
- Job Runner 与 Fastify 在同一 Node 进程内运行，但以数据库 Job 为事实来源；不得把 Job 只保存在内存。
- MVP 明确只支持单进程、单实例、并发 1 个分析 Job。SQLite 与此边界匹配。
- 不增加 Redis、BullMQ、消息队列、微服务或共享 contracts package。

## 4. Monorepo 目录

```text
codestory-work/
├── package.json                    # npm workspaces 与统一脚本
├── package-lock.json
├── .env.example                    # 只有占位符，无真实秘密
├── .gitignore
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   ├── vite.config.js          # dev 代理 /api，生产 base=/
│   │   ├── index.html
│   │   └── src/
│   │       ├── AppV03.jsx          # 保留 Player，接入异步项目
│   │       ├── components/RepositoryImporter.jsx
│   │       ├── api/client.js
│   │       ├── data/               # Demo 数据原样保留
│   │       └── ...                 # 现有样式与 UI
│   └── server/
│       ├── package.json
│       ├── tsconfig.json
│       ├── prisma/
│       │   └── schema.prisma
│       ├── src/
│       │   ├── app.ts              # 可注入依赖，供 Fastify.inject 测试
│       │   ├── server.ts           # listen 与生命周期
│       │   ├── config.ts
│       │   ├── api/
│       │   │   ├── settings.routes.ts
│       │   │   ├── projects.routes.ts
│       │   │   ├── jobs.routes.ts
│       │   │   └── stories.routes.ts
│       │   ├── schemas/
│       │   │   ├── api.ts
│       │   │   ├── generated.ts
│       │   │   └── story.ts
│       │   ├── domain/ingest/      # 从现有 src/ingest 迁移并 TypeScript 化
│       │   ├── services/
│       │   │   ├── github.service.ts
│       │   │   ├── local-upload.service.ts
│       │   │   ├── workspace.service.ts
│       │   │   ├── analysis.service.ts
│       │   │   ├── llm.service.ts
│       │   │   ├── credential.service.ts
│       │   │   └── story.service.ts
│       │   ├── worker/job-runner.ts
│       │   └── db/prisma.ts
│       └── test/
├── e2e/
└── docs/
```

### 根脚本

```json
{
  "scripts": {
    "dev": "concurrently ...web... ...server...",
    "build": "npm run build --workspace @codestory/web && npm run build --workspace @codestory/server",
    "start": "npm run start --workspace @codestory/server",
    "test": "npm run test --workspaces --if-present",
    "test:e2e": "playwright test"
  }
}
```

实际命令由实现按 workspace 名称填写，不得依赖全局安装。

## 5. API 契约

所有响应使用 JSON。成功创建任务返回 HTTP `202`。错误统一为：

```json
{
  "error": {
    "code": "LLM_CREDENTIAL_REQUIRED",
    "message": "请先配置模型 API Key。",
    "retryable": false
  }
}
```

错误响应、日志和 Job `errorMessage` 必须经过秘密脱敏。

### 5.1 LLM 凭据

#### `GET /api/settings/llm`

```json
{
  "configured": true,
  "baseUrl": "https://api.example.com/v1",
  "model": "model-name",
  "maskedKey": "••••abcd"
}
```

不得返回 ciphertext、IV、auth tag 或完整 Key。

#### `PUT /api/settings/llm`

```json
{
  "baseUrl": "https://api.example.com/v1",
  "model": "model-name",
  "apiKey": "user-secret"
}
```

处理顺序：校验 URL -> 用一次最小请求测试连接 -> 成功后加密替换当前凭据 -> 返回掩码配置。测试失败不得覆盖旧的可用凭据。

#### `DELETE /api/settings/llm`

删除加密凭据和配置，返回 `204`。

### 5.2 GitHub 分析

#### `POST /api/projects/analyze/github`

```json
{
  "repoUrl": "https://github.com/owner/repo",
  "branch": "main",
  "subdir": "apps/web"
}
```

响应：

```json
{
  "jobId": "job_xxx",
  "projectId": "project_xxx",
  "status": "queued"
}
```

- 只接受 `github.com` 的 repository URL 或 `owner/repo`。
- `branch` 和 `subdir` 可选。
- 私有仓由服务端可选 `GITHUB_TOKEN` 访问；前端不再接收或保存 GitHub Token。

### 5.3 本地文件夹分析

#### `POST /api/projects/analyze/local`

使用 `multipart/form-data`：

- `metadata`：JSON，包含 `projectName` 和 `files: [{ index, path }]`。
- `files`：每个文件以数字 index 作为上传 filename，真实相对路径只从 metadata 读取。

硬限制：

- 最多 400 个上传文件。
- 单文件最多 200 KiB。
- 请求总文件内容最多 25 MiB。
- 只接收当前支持的 JS/TS/Python/Markdown/JSON 扩展名。
- 拒绝绝对路径、`..`、NUL、重复路径和规范化后逃逸工作区的路径。
- 超限时返回 `413`，路径或 metadata 非法时返回 `400`，不得创建半成品 Job。

上传完整且验证通过后，创建 Project 和 Job，再返回与 GitHub 分析相同的 `202` 响应。

### 5.4 Job 状态

#### `GET /api/jobs/:jobId`

```json
{
  "jobId": "job_xxx",
  "projectId": "project_xxx",
  "status": "running",
  "stage": "discovering_features",
  "progress": 55,
  "storyReady": false,
  "error": null,
  "createdAt": "2026-09-23T00:00:00.000Z",
  "updatedAt": "2026-09-23T00:00:02.000Z"
}
```

终态为 `completed` 或 `failed`。不存在的 Job 返回 `404`。

### 5.5 Story

#### `GET /api/projects/:projectId/story`

- 未完成返回 `409 STORY_NOT_READY`。
- 不存在返回 `404 PROJECT_NOT_FOUND`。
- 完成后返回完整、经过 schema 校验的 `RuntimeProject`：

```text
RuntimeProject
├── id, name, category, tech, source, description, accent
├── nodes[]
├── edges[]
├── actions[]
├── implementationDetails{}
└── repoMeta { origin, commit, stats, generatedAt, evidenceSummary }
```

`nodes`、`edges`、`actions`、`implementationDetails` 的字段和语义必须兼容现有 `AppV03.jsx`，不在前端建立第二套适配模型。

## 6. Job 状态机与恢复

```text
                         process restart
                         ┌──────────────┐
                         v              |
QUEUED -> RUNNING/FETCHING_REPOSITORY   |
             |                          |
             v                          |
          SCANNING                      |
             |                          |
             v                          |
      BUILDING_STRUCTURE                |
             |                          |
             v                          |
      DISCOVERING_FEATURES              |
             |                          |
             v                          |
       SELECTING_FEATURES               |
             |                          |
             v                          |
       GENERATING_STORY                 |
             |                          |
             v                          |
          VALIDATING                    |
             |                          |
             v                          |
          PERSISTING -> COMPLETED ------┴-> cleanup workspace
             |
             └-----------------------> FAILED -> cleanup workspace
```

推荐进度映射：`queued=0`、`fetching/scanning=10-25`、`building=35`、`discovering=55`、`selecting=65`、`generating=80`、`validating=92`、`persisting=97`、`completed=100`。进度只能单调增加。

### Runner 规则

1. Server ready 后启动一个并发度为 1 的 Runner。
2. Runner 从 SQLite 按 `createdAt` 领取最早的 `queued` Job。
3. 每次 stage 切换先持久化，再执行该阶段。
4. 服务启动时把遗留 `running` Job 重新置为 `queued`：
   - GitHub Job 可重新抓取固定 ref。
   - Local Job 仅在工作区仍存在时重跑；缺失则置为 `failed/SOURCE_WORKSPACE_MISSING`。
5. Job 终态写入后在 `finally` 中清理工作区；清理失败写结构化错误日志，但不得把成功 Job 改成失败。
6. 启动清理只删除不属于 queued/running Job 且超过 24 小时的工作区。
7. MVP 不支持取消、优先级、跨进程 claim 或多实例并发。

## 7. 数据模型

字段名可按 Prisma 语法微调，但语义不得减少：

```prisma
model Project {
  id         String   @id @default(cuid())
  name       String
  sourceType String
  repoUrl    String?
  branch     String?
  subdir     String?
  commitSha  String?
  status     String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  jobs       AnalysisJob[]
  stories    Story[]
}

model AnalysisJob {
  id           String    @id @default(cuid())
  projectId    String
  status       String
  stage        String
  progress     Int       @default(0)
  errorCode    String?
  errorMessage String?
  startedAt    DateTime?
  completedAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  project      Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  story        Story?

  @@index([status, createdAt])
  @@index([projectId])
}

model Story {
  id        String      @id @default(cuid())
  projectId String
  jobId     String      @unique
  content   Json
  createdAt DateTime    @default(now())
  project   Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  job       AnalysisJob @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@index([projectId, createdAt])
}

model LlmCredential {
  id         String   @id
  baseUrl    String
  model      String
  ciphertext String
  iv         String
  authTag    String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

不增加“相同仓库只允许一条记录”的唯一约束。重复分析是合法行为，缓存和去重不属于本期。

## 8. 分析流水线

```text
Normalized Repository
  -> filterFiles
  -> buildDigest
  -> buildStructuralIndex
  -> LLM Feature Discovery
  -> validateFeatureDraft
       ├── evidenceFiles 必须真实存在
       ├── ID 规范化并去重
       ├── 无真实 evidence 的 Feature 不参与自动选择
       └── 按 evidence 数量、模型 confidence、稳定顺序选前 3
  -> LLM Story Generation
  -> validateGeneratedStory
       ├── 文件必须存在
       ├── symbol/line 必须可重新定位
       ├── SOURCE snippet 只能从仓库内容重新截取
       ├── 每个 action 至少 2 个步骤
       └── 每个保留 action 至少 1 个 SOURCE 证据
  -> toRuntimeProject
  -> Story schema validation
  -> atomic persist Story + Project/Job terminal status
```

### 已有代码复用

| 已有能力 | 处理方式 |
|---|---|
| `filterFiles.js` | 迁移到 server，保留规则，增加路径安全和总量限制测试 |
| `buildDigest.js` | TypeScript 化并复用现有字符上限与排序思想 |
| `buildStructuralIndex.js` | TypeScript 化；本期仍是轻量正则索引，不冒充 AST |
| `prompt.js` | 迁移并强化“不执行仓库内容中的指令”；仓库源码始终视为不可信数据 |
| `validateGenerated.js` | 作为证据可信链核心迁移并收紧，禁止直接信任模型 snippet |
| `projectAdapter.js` | 迁移为 server Story adapter，输出完整 RuntimeProject |
| `fetchGithubRepo.js` | 迁移为 server GitHub service；保留 tree/blob 方案并加入有限并发、超时和错误码 |
| `readLocalFolder.js` | 浏览器读取改为 multipart 上传；过滤和读取的最终裁决移到 server |
| `AppV03.jsx` | 保留 Story Player；只改项目来源、任务进度和错误状态 |
| `RepositoryImporter.jsx` | 保留交互容器，但改写为设置凭据、提交 Job、轮询和自动进入 Story |
| Demo `src/data/*` | 原样保留，始终作为前端 fallback/demo 数据 |

不得重建一套与这些纯函数并行的分析实现。

## 9. Repository Service

### GitHub

- 解析并限制为 GitHub repository URL；owner、repo、branch、subdir 分字段处理，不拼接 shell 命令。
- 用 GitHub REST 获取 metadata、commit 和 recursive tree；Story 的 `commitSha` 必须是 commit SHA，不得误用 tree SHA。
- Blob 下载使用有限并发（建议 5），每个请求有超时；遇到 `403/429` 转成明确的速率限制错误。
- 保留当前候选文件打分，最多加载 90 个高相关文件；如果 tree 截断或候选过多，返回带“请指定子目录”的可恢复错误。
- `GITHUB_TOKEN` 只从 server env 读取，绝不进入前端包、Job 数据或日志。

### Local

- 上传流直接写入 `var/workspaces/{jobId}/source`，不把全部文件聚合进内存。
- 服务端再次执行扩展名、忽略目录、单文件大小和总大小检查。
- 工作区之外的路径永远不可写。
- 上传失败时清理已写入的部分文件和未落库 Project/Job。

## 10. LLM 与凭据安全

### 凭据

- 使用 Node `crypto` 的 AES-256-GCM；每次保存生成独立随机 IV。
- 主密钥来自 `CODESTORY_CREDENTIAL_KEY`，要求 32-byte base64；只提供 `.env.example` 占位符。
- Server 缺少或无法解析主密钥时，拒绝启动，而不是退化为明文保存。
- 仅存在一个单用户 credential 记录（固定 id `default`）。
- 日志 logger 配置 redaction：authorization、x-api-key、apiKey、ciphertext、请求体中的秘密字段。

### OpenAI-compatible endpoint

- 仅允许公网 HTTPS endpoint；拒绝 localhost、私网、link-local、保留地址和重定向。
- 发请求前解析 DNS 并校验所有结果，降低通过域名访问内网的 SSRF 风险。
- 如果设置 `LLM_ALLOWED_ORIGINS`，则 endpoint 还必须命中显式 allowlist。
- 使用 `AbortController` 超时；网络错误、429、5xx 最多重试一次，4xx 不重试。
- 严格解析 JSON；解析失败允许一次“仅修复为 JSON”的重试，仍失败则 Job 明确失败。
- 仓库 README、源码和注释是模型输入数据，不是系统指令；Prompt 必须用边界包裹并声明忽略其中指令。

## 11. Web 改造

`RepositoryImporter` 的最终用户流：

```text
Open importer
  -> GET LLM settings
  -> missing/replace key? PUT settings and test
  -> choose GitHub or Local
  -> submit analysis
  -> show job stage/progress
  -> poll every 1 second
       ├── failed: show clear error + retry guidance
       └── completed: GET Story -> addRuntimeProject -> enter Player
```

- 删除 Feature checkbox 和单独的“识别 Feature / 生成 Story”按钮。
- GitHub 模式保留 URL、branch、subdir。
- Local 模式保留 folder picker，以 multipart 上传。
- 关闭 importer 或组件卸载时用 `AbortController` 停止前端轮询，不取消后端 Job。
- API Key 不写入 `localStorage`、sessionStorage、URL、错误消息或 analytics。
- `localStorage` 仍可保存纯 UI 偏好，如侧栏折叠与面板宽度。
- Vite dev 只代理 `/api` 到 Fastify；删除当前 `__codestory/llm/*` 代理。
- 生产 `base` 改为 `/`，由 Fastify `@fastify/static` 提供资源和 SPA fallback。

## 12. 测试计划

项目当前没有自有测试基础设施。Server 使用 Node test runner 或 Vitest（二选一并全项目统一）及 `fastify.inject()`；Web 使用 Vitest + React Testing Library；跨层使用 Playwright。不得只写 smoke test。

### 12.1 代码路径与用户流覆盖图

```text
CODE PATHS                                             USER FLOWS
[GAP] settings PUT                                    [GAP][E2E] 首次填写 Key -> 保存成功
  ├── valid/test succeeds -> encrypt                     ├── maskedKey 可见，明文不可回读
  ├── invalid endpoint / private IP                      └── 测试失败保留旧凭据
  └── provider failure -> keep old credential

[GAP] GitHub create job                               [GAP][E2E] GitHub URL -> progress -> Story Player
  ├── valid public/private repo                           ├── 成功生成最多 3 个 actions
  ├── 404 / 403 / rate limit                              ├── 失败显示可恢复提示
  ├── truncated tree / subdir                             └── Demo 在失败后仍能播放
  └── no supported files

[GAP] Local multipart                                 [GAP][E2E] 选择本地文件夹 -> progress -> Story
  ├── valid manifest/files                               ├── 上传状态可见
  ├── traversal / duplicate / unsupported                └── 任务终态后源码工作区被删除
  ├── per-file / count / total limit
  └── partial stream failure -> cleanup

[GAP] Job runner                                      [GAP] 页面关闭后重开，按 jobId 继续轮询
  ├── FIFO claim, concurrency 1
  ├── each stage persisted
  ├── restart requeue GitHub/local
  ├── missing local workspace -> failed
  └── terminal cleanup + startup sweep

[GAP] Analysis
  ├── no evidenced Feature -> failed
  ├── top 3 deterministic selection
  ├── LLM timeout / 429 / 5xx retry once
  ├── malformed JSON repair once
  ├── evidence relocation and SOURCE snippet
  └── zero valid actions -> failed, no Story persisted

[REGRESSION] Existing web build
  ├── fix wrong testConnection import
  ├── AppV03 still renders both demos
  └── RuntimeProject still plays all action steps
```

### 12.2 必须实现的测试文件/类别

#### Server unit

- GitHub URL/branch/subdir parsing and rejection.
- `filterFiles`、digest 截断、结构索引。
- 本地 path normalization、逃逸、重复、数量和大小限制。
- credential encrypt/decrypt、错误 master key、mask、redaction。
- LLM endpoint public-IP validation、timeout、retry、JSON parse/repair。
- Feature evidence filtering、stable ordering、top 3。
- Story evidence relocation、SOURCE/INFERRED/MODEL 分类和完整 schema。
- Job stage transition、progress monotonicity、终态不可逆。

#### Server integration

- 使用临时 SQLite 和临时 workspace。
- `PUT/GET/DELETE settings`，断言任何响应不含完整 Key。
- 两种 create-job API 的成功和所有 4xx/413 分支。
- `GET job` queued/running/completed/failed。
- `GET story` 的 404、409、200。
- Runner 成功、LLM 失败、重启恢复、工作区缺失、cleanup 失败。
- 原子性：Story 写入失败时 Job 不得显示 completed。

#### Web component

- settings masked state、保存失败、旧凭据保留提示。
- GitHub/local 表单校验。
- queued -> running -> completed -> Story load。
- failed Job 显示后端 message，但不泄露内部 stack 或 Key。
- unmount 停止 polling。
- Demo 数据和 Story Player 回归。

#### Playwright E2E

使用测试注入的 fake GitHub/LLM adapter，不访问真实外网：

1. 配置凭据 -> GitHub 分析 -> 自动生成 3 个以内 Feature -> 进入 Story Player。
2. 本地文件夹上传 -> 完成 -> 进入 Story Player。
3. LLM 失败 -> 明确错误 -> Demo 仍可使用。

不新增纯数字 coverage gate；验收以本节列出的每条行为和错误分支都有测试为准。

## 13. 生产故障模式

| 路径 | 真实故障 | 测试 | 处理 | 用户是否看得见 |
|---|---|---|---|---|
| GitHub metadata/tree/blob | 404、权限、限流、超时 | 必须 | Job failed，映射稳定错误码 | 是，给出权限/子目录/重试提示 |
| Local upload | 超限、路径逃逸、流中断 | 必须 | 请求失败并清理部分文件 | 是，400/413 明确说明 |
| Credential save | Key 无效或测试超时 | 必须 | 不覆盖旧凭据 | 是，可重试 |
| Credential decrypt | master key 变化 | 必须 | 拒绝使用并要求重新配置 | 是，不输出密文细节 |
| LLM discovery | malformed JSON / prompt injection | 必须 | 一次修复；仍失败则 Job failed | 是 |
| Feature selection | 没有真实 evidence file | 必须 | `NO_EVIDENCED_FEATURES` | 是，建议缩小目录或换仓库 |
| Story validation | 所有 actions 均无 SOURCE | 必须 | 不持久化无证据 Story | 是 |
| Server restart | Job 留在 running | 必须 | 启动重置 queued 并恢复或明确失败 | 是，进度重新开始 |
| DB persist | Story 与 completed 状态部分成功 | 必须 | Prisma transaction 回滚 | 是，Job failed |
| Workspace cleanup | 文件被占用 | 必须 | 记录脱敏日志，启动 sweep 重试 | Story 仍成功；维护日志可见 |
| Frontend polling | 网络暂时断开 | 必须 | 有限退避并允许手动重试 | 是，不静默卡死 |

终版没有“无测试、无错误处理、且静默失败”的关键路径。

## 14. 性能与资源边界

- Job 并发固定为 1，避免单用户机器上 LLM、GitHub 和 SQLite 争抢资源。
- GitHub blob 下载并发固定为 5，不使用无界 `Promise.all`。
- 延续 digest 80,000 字符、单文件摘要 8,000 字符的上限；所有限制集中在 config/constants，测试引用同一配置。
- 最多加载 90 个高相关文件；上传允许更多候选文件，但分析前统一排序裁剪。
- multipart 全程流式落盘，禁止把 25 MiB 请求整体转成 Buffer。
- Story JSON 可存 SQLite `Json`；API 返回时不附带原始仓库全文。
- 前端轮询 1 秒；连续网络失败后退避至最多 5 秒，完成/失败/卸载立即停止。
- SQLite 为 `AnalysisJob(status, createdAt)`、`AnalysisJob(projectId)`、`Story(projectId, createdAt)` 建索引。

## 15. 实施顺序

### Phase 0：机械迁移与基线修复

1. 建立 npm workspaces，将现有 Vite 应用移动到 `apps/web`。
2. 保持 `main.jsx -> AppV03.jsx`，Demo 数据和样式路径不变。
3. 修正当前 `testConnection` 错误导入，确保 `npm run build --workspace @codestory/web` 通过。
4. 根脚本可以独立运行 web，避免在 server 尚未完成时失去可验证基线。

### Phase 1：Server 骨架与数据库

1. Fastify TypeScript app/server 分离。
2. Config 校验、logger redaction、统一错误契约。
3. Prisma schema、migration、临时数据库测试工厂。
4. `/api/health` 与静态文件服务。

### Phase 2：迁移纯分析能力

1. 先迁移 filter、digest、structural index、prompt、validator、adapter。
2. 为每个模块补齐 unit tests，再接入外部 I/O。
3. 增加 Feature 校验/自动选择和完整 RuntimeProject schema。

### Phase 3：Repository、Workspace 与 Credential

1. GitHub reader、错误映射和有限并发。
2. Local multipart、manifest/path 校验和流式工作区。
3. Credential 加密、测试后替换和 API。
4. 所有秘密字段日志脱敏测试。

### Phase 4：Job Runner 与 API

1. Job 状态机、stage 持久化和单并发 Runner。
2. GitHub/local create routes、job route、story route。
3. 重启恢复、事务落库和工作区清理。
4. `fastify.inject` 集成测试全部通过。

### Phase 5：Web 接入

1. 新增 `api/client.js`。
2. 改写 RepositoryImporter 为配置 -> 提交 -> 轮询 -> Story。
3. 删除浏览器 LLM/GitHub 直接调用与秘密 localStorage。
4. 保持 Demo 与 Player 数据结构。
5. Web component tests 通过。

### Phase 6：E2E、文档与最终验收

1. Playwright 三条主流程。
2. README、运行说明、架构说明和 `.env.example`。
3. 根目录 `npm run build`、`npm test`、`npm run test:e2e`。
4. 用 `rg` 验证 web 源码不再出现 GitHub API、LLM endpoint、Authorization/API Key 持久化逻辑。

## 16. 依赖与执行方式

| Step | Modules touched | Depends on |
|---|---|---|
| Monorepo migration | root, apps/web | — |
| Server scaffold/DB | apps/server, root | Monorepo migration |
| Analysis port | apps/server/domain | Server scaffold |
| Repositories/credentials | apps/server/services | Server scaffold |
| Job/API | apps/server/worker, apps/server/api | Analysis port + repositories/credentials |
| Web integration | apps/web | Job/API |
| E2E/docs | e2e, docs, root | Web integration |

顺序实施，不做 worktree 并行：当前源码快照没有 Git 元数据，且 Monorepo 迁移会改变几乎所有后续路径；并行会制造路径冲突和重复修复。

## 17. NOT in scope

- 多用户登录、租户隔离、角色权限：MVP 已明确单用户。
- GitHub OAuth：私有仓暂由 server `GITHUB_TOKEN` 覆盖。
- Docker、公网平台和 CI/CD 发布：本次只保证本地生产构建。
- Redis/BullMQ/外部 Worker/多实例：SQLite 单进程边界足够。
- Job 取消、优先级、并行分析：不阻塞核心闭环。
- 相同 commit 的缓存、去重和复用：避免引入额外唯一约束与失效规则。
- Tree-sitter、AST、Call Graph、Symbol Graph：保留给下一阶段 Code Intelligence。
- JS/TS/Python 之外语言：避免“任意仓库”的不可验证承诺。
- 长期保存或下载原始源码：与临时源码隐私决策冲突。
- 本地/私网 LLM endpoint：公网 HTTPS 限制用于防止 server 被用作内网请求代理。
- 重写 Story Player、视觉重设计和 Demo 数据重构：与后端 MVP 无关。

## 18. Definition of Done

- [ ] 根目录成为可运行的 npm workspaces，包含 `apps/web` 与 `apps/server`。
- [ ] `npm run build` 同时构建 web/server，Fastify 可提供 web 静态产物。
- [ ] `npm test` 和 `npm run test:e2e` 全部通过。
- [ ] 当前错误的 `testConnection` 导入已修复，迁移前基线构建故障不再存在。
- [ ] Web 不直接访问 GitHub API 或 LLM endpoint。
- [ ] Web 不保存 API Key 或 GitHub Token；后端响应和日志不泄露 Key。
- [ ] 用户可安全保存、替换和删除自己的 OpenAI-compatible API Key。
- [ ] GitHub 和本地文件夹都能创建异步 Job。
- [ ] Job 状态可轮询，失败必有稳定错误码和用户可理解提示。
- [ ] 系统自动选择最多 3 个有真实代码证据的 Feature 并生成 Story。
- [ ] Story JSON 通过 schema 校验并与现有 `AppV03` Player 兼容。
- [ ] 每个输出 action 至少包含一个由服务端重新定位的 SOURCE 证据。
- [ ] Story 与 Job 完成状态在同一事务中持久化。
- [ ] 本地源码工作区在任务终态后删除，启动时能回收遗留目录。
- [ ] 服务重启后 queued/running Job 不会永久卡死。
- [ ] 两个预置 Demo 在无后端分析结果时仍可正常播放。
- [ ] README 明确支持语言、文件限制、大仓库子目录要求和单用户边界。

## 19. 最终审查结论

- Architecture Review：发现并闭合 8 个架构问题；无未决产品决策。
- Code Quality Review：要求迁移现有纯函数而不是复制；修复 1 个已验证构建回归。
- Test Review：当前项目测试覆盖为 0；终版已列出所有新路径、用户流和错误路径。
- Performance Review：使用单 Job 并发、GitHub 有限并发、流式上传和固定上下文预算。
- Security Review：凭据加密、日志脱敏、上传路径限制、公开 HTTPS LLM endpoint 和 Prompt 数据边界已纳入。
- What already exists：现有 ingest、validator、adapter、AppV03 和 Demo 均复用。
- Parallelization：顺序实施，无安全的并行 worktree 机会。
- Unresolved decisions：0。
- Status：READY FOR LUNA IMPLEMENTATION。
