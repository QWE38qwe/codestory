# CodeStory

CodeStory 把 Vibe Coding 项目翻译成**可播放、可追溯源码证据的功能实现 Story**。目标用户不是专业开发者，而是已经用 AI 做出项目、但想真正理解“这个功能到底是怎么被代码实现的”用户。

## v0.3 核心链路

```text
GitHub / Local Folder
→ Repository Scan
→ Structural Index
→ Core Feature Discovery
→ Select Feature
→ Generate Story
→ Evidence Validation
→ Story Player
```

与单纯的代码架构图不同，CodeStory 以“用户功能”为入口，例如“上传文件并解析”“生成 AI 总结”，每个 Story 控制在 4–8 个关键步骤，并提供小白 / 产品 / 工程师三档解释。

### 证据等级

- **真实源码 / SOURCE**：文件真实存在，且系统根据 symbol 或行号重新定位并截取代码，不直接采用模型生成的 snippet。
- **源码推断 / INFERRED**：模型识别到相关文件，但未能定位到可靠代码位置。
- **模型解释 / MODEL**：缺少可验证源码证据，只作为理解辅助，不冒充源码事实。

## 使用

```bash
npm install
npm run dev
```

默认地址：`http://127.0.0.1:5173/codestory/`

打开后点击右上角 **解读仓库**：

1. 粘贴 GitHub 仓库 URL，或选择本地文件夹。
2. 私有仓可填写只读 GitHub Token。
3. 配置 OpenRouter / OpenAI / Anthropic / 自定义 OpenAI 兼容模型。
4. 点击 **扫描仓库**，先确认文件规模和扫描结果。
5. 点击 **识别核心功能**，选择希望理解的功能。
6. 点击 **生成 CodeStory**，进入功能实现播放器。
7. 点击任一步骤查看输入、处理、输出、依赖、失败路径和代码证据。

## 当前语言范围

- JavaScript / TypeScript
- Python
- Markdown / JSON 会作为项目说明和配置上下文读取

## 隐私与安全

- 本地文件夹在浏览器本地读取。
- API Key 和 GitHub Token 当前保存在本机 `localStorage`，不会进入 CodeStory 的 Prompt 文本。
- 模型请求只发送本轮分析所需的代码上下文到用户配置的 Provider。
- `.env`、构建目录、依赖目录和常见二进制文件默认忽略。
- 开发代理只接受 POST，并拒绝 localhost / 常见私网地址作为转发目标。

> 当前版本适合本地个人使用。若未来部署成多人在线服务，需要把凭据存储进一步迁移到服务端安全凭据系统。

## 当前实现策略

v0.3 使用“轻量结构索引 + LLM 解释 + 程序证据校验”的方案，优先把产品闭环和可信度跑通。它还不是完整 AST / IDE 级 Call Graph，因此复杂动态调用、反射、运行时注入和大型 Monorepo 仍可能需要按子目录分析。

## 预置 Demo

- Clipboard History：真实 Swift 项目调用链演示
- 小宇宙 AI 助手：预生成行为模型演示
