# CodeStory

CodeStory 把 vibe coding 作品翻译成可播放的调用故事，并下钻到技术实现与代码证据。

当前版本除两个预置示例外，已支持 **解读 GitHub 仓库或本地文件夹**。你可以自己配置模型 API Key。

## 运行

```bash
npm install
npm run dev
```

打开终端里的地址，默认是 `http://127.0.0.1:5173/codestory/`。

开发服务器内置了模型请求代理（`/__codestory/llm/*`），用来绕过浏览器 CORS。请用 `npm run dev` 做解读，不要只打开静态 `dist/`。

## 怎么解读仓库

1. 右上角 **设置 Key**：选 OpenRouter / OpenAI / Anthropic / 自定义接口，填 Key 和模型名。可点「测试连接」。
2. 左侧切到 **解读仓库**。
3. 粘贴 GitHub 链接，或选择本地文件夹。
4. 先点 **扫描仓库**（不花模型钱），确认读到的文件。
5. 再点 **生成故事**。勾选要看的功能后，进入现有播放器。

密钥和 GitHub Token 只存在本机 `localStorage`，不会发到 CodeStory 服务器。模型请求会发往你填写的服务商。

私有仓需要在设置里额外填只读权限的 GitHub Token。

第一期语言范围：JavaScript / TypeScript / Python。

## 预置示例

- Clipboard History：基于真实 Swift 代码结构整理。
- 小宇宙 AI 助手：预生成行为模型。

## 构建

```bash
npm run build
npm run preview
```

静态托管可以继续播两个示例。解读仓库依赖开发代理和用户自己的 Key，适合本地使用。
