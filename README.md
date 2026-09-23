# CodeStory

CodeStory 将用户功能与可重新定位的源码证据组合成可播放 Story。Web Player 保留两个离线 Demo；GitHub 或本地项目通过 Fastify 后端异步分析。

## 本地运行

需要 Node.js 22.12 或更高版本。启动时使用 Node 内置 SQLite 执行仓库中已提交的 migration，业务数据访问仍由 Prisma Client 完成。

```powershell
npm install
Copy-Item .env.example .env
```

在 `.env` 中设置独立的 32 字节 Base64 凭据主密钥。可以运行下面的命令生成一个值，再把输出粘贴到 `CODESTORY_CREDENTIAL_KEY`；不要提交 `.env`：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

生成 Prisma Client。开发和生产启动命令会通过 `db:init` 自动执行尚未应用的 migration：

```powershell
npm run db:generate --workspace @codestory/server
npm run dev
```

开发页面默认在 `http://127.0.0.1:5173`，Fastify API 在 `http://127.0.0.1:3000`。生产模式使用 `npm run build` 后运行 `npm start`；Fastify 会同源托管 React 页面和 `/api`。

可选环境变量：`GITHUB_TOKEN` 供后端读取私有仓；`LLM_ALLOWED_ORIGINS` 可填写逗号分隔的精确 HTTPS origin 白名单。LLM API Key 在导入器输入后由后端连接测试并使用 AES-256-GCM 加密保存在 SQLite，页面、响应和日志不会回传明文。更换 `CODESTORY_CREDENTIAL_KEY` 后需重新设置 LLM Key。

## 支持范围

- GitHub `github.com` 仓库，以及受限的本地文件夹上传。
- JavaScript、TypeScript、Python 源码；Markdown 和 JSON 可作为说明上下文。
- 本地上传上限为 400 个文件、每个文件 200 KiB、总内容 25 MiB。上传源码写入每个 Job 的临时工作区，Job 终态后删除；启动时回收超过 24 小时的孤儿目录。
- GitHub 大仓库或被截断的文件树需要指定更小的子目录。分析最多加载 90 个高相关文件。
- 单用户、单进程、单个分析任务并发；不包含登录、多实例或公网部署。

## 分析流程

```text
GitHub / 本地文件夹 -> 异步 Job -> 服务端扫描与结构索引
-> 自动选择最多 3 个有真实文件证据的 Feature -> 生成并校验 Story -> Player
```

Story 中的 `SOURCE` 片段由服务端从实际文件重新定位并截取。每个保留的 Action 至少要包含一个源码证据，否则不保存 Story。仓库 README、注释和源代码始终视为不可信输入，不视为模型指令。

## 验证

```powershell
npm run build
npm test
npm run test:e2e
```

`npm run test:e2e` 验证离线 Demo Player 可用，不需要模型凭据或真实外网。普通启动使用可重复执行的 `db:init`。当前 Windows 验证机上的 Prisma schema engine 在 `migrate dev/deploy` 时会无详情失败，因此发布路径不依赖该引擎；新增数据库变更时应同时更新 `schema.prisma` 和 `prisma/migrations/<timestamp>_<name>/migration.sql`，并在空库及已迁移库上各执行一次 `npm run db:init --workspace @codestory/server`。`db:migrate`、`db:deploy` 仅保留给 Prisma engine 可正常运行的开发环境。
