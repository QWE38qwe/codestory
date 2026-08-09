export const audienceLevels = [
  { id: "beginner", label: "给小白" },
  { id: "product", label: "给产品" },
  { id: "engineer", label: "给工程师" },
];

const clipboardNodes = [
  { id: "person", label: "你按下复制", detail: "一次用户动作", kind: "person", position: { x: 20, y: 170 } },
  { id: "pasteboard", label: "系统剪贴板", detail: "macOS NSPasteboard", kind: "system", position: { x: 260, y: 55 } },
  { id: "watcher", label: "变化监听器", detail: "Clipboard.checkForChanges", kind: "logic", position: { x: 500, y: 55 } },
  { id: "history", label: "历史整理器", detail: "History.add / 去重", kind: "logic", position: { x: 740, y: 55 } },
  { id: "storage", label: "本地仓库", detail: "SwiftData / SQLite", kind: "storage", position: { x: 980, y: 55 } },
  { id: "panel", label: "历史面板", detail: "HistoryListView", kind: "screen", position: { x: 740, y: 285 } },
  { id: "restore", label: "恢复到剪贴板", detail: "Clipboard.copy", kind: "logic", position: { x: 500, y: 285 } },
];

const clipboardEdges = [
  ["person-pasteboard", "person", "pasteboard"],
  ["pasteboard-watcher", "pasteboard", "watcher"],
  ["watcher-history", "watcher", "history"],
  ["history-storage", "history", "storage"],
  ["storage-panel", "storage", "panel"],
  ["panel-history", "panel", "history"],
  ["panel-restore", "panel", "restore"],
  ["restore-pasteboard", "restore", "pasteboard"],
].map(([id, source, target]) => ({ id, source, target }));

const podcastNodes = [
  { id: "episode", label: "你打开一期播客", detail: "小宇宙节目页", kind: "person", position: { x: 20, y: 170 } },
  { id: "content", label: "页面读取器", detail: "Content Script", kind: "screen", position: { x: 260, y: 55 } },
  { id: "background", label: "扩展调度台", detail: "Background Worker", kind: "logic", position: { x: 500, y: 55 } },
  { id: "native", label: "本地助手", detail: "Native Host", kind: "system", position: { x: 740, y: 55 } },
  { id: "keychain", label: "钥匙串", detail: "macOS Keychain", kind: "storage", position: { x: 980, y: 55 } },
  { id: "model", label: "总结模型", detail: "Chat Completions", kind: "service", position: { x: 980, y: 285 } },
  { id: "summary", label: "总结侧栏", detail: "结构化内容", kind: "screen", position: { x: 500, y: 285 } },
  { id: "clipboard", label: "系统剪贴板", detail: "复制 Markdown", kind: "system", position: { x: 260, y: 285 } },
];

const podcastEdges = [
  ["episode-content", "episode", "content"],
  ["content-background", "content", "background"],
  ["background-native", "background", "native"],
  ["native-keychain", "native", "keychain"],
  ["keychain-model", "keychain", "model"],
  ["native-model", "native", "model"],
  ["model-summary", "model", "summary"],
  ["summary-background", "summary", "background"],
  ["summary-clipboard", "summary", "clipboard"],
].map(([id, source, target]) => ({ id, source, target }));

const step = (nodeId, edgeId, beginner, product, engineer) => ({
  nodeId,
  edgeId,
  narration: { beginner, product, engineer },
});

export const projects = [
  {
    id: "clipboard",
    name: "Clipboard History",
    category: "macOS 工具",
    tech: "Swift · SwiftUI · SwiftData",
    source: "真实项目调用链",
    description: "它在本机悄悄记住你复制过的内容，需要时再帮你找回来。",
    accent: "#f2c94c",
    nodes: clipboardNodes,
    edges: clipboardEdges,
    actions: [
      {
        id: "capture",
        verb: "记住一次复制",
        meta: "5 个环节 · 全程留在本机",
        steps: [
          step("person", null, "你像平常一样按下复制。", "用户触发一次新的剪贴板写入。", "前台应用写入 NSPasteboard.general。"),
          step("pasteboard", "person-pasteboard", "macOS 先替你接住这段内容。", "系统剪贴板的 changeCount 随内容更新。", "NSPasteboard changeCount 发生变化。"),
          step("watcher", "pasteboard-watcher", "小助手发现：有新东西来了。", "定时监听器读取允许保存的内容类型。", "Clipboard.checkForChangesInPasteboard 过滤 transient 与 concealed 类型。"),
          step("history", "watcher-history", "它检查有没有重复，再整理到最前面。", "历史模块去重、更新复制次数并维持排序。", "History.add 调用 findSimilarItem 并更新 HistoryItem。"),
          step("storage", "history-storage", "最后存在你的 Mac 里，下次还能找到。", "数据写入本地持久化仓库，不经过云端。", "SwiftData ModelContext 保存 HistoryItem 与 contents。"),
        ],
      },
      {
        id: "restore",
        verb: "找回旧内容",
        meta: "4 个环节 · 不会自动粘贴",
        steps: [
          step("storage", null, "历史记录先从本地仓库里醒来。", "应用启动后加载并排序历史内容。", "FetchDescriptor<HistoryItem> 从 SwiftData context 拉取数据。"),
          step("panel", "storage-panel", "你在面板里看到以前复制过的东西。", "历史面板展示文本、图片和文件引用。", "HistoryListView 渲染 HistoryItemDecorator 列表。"),
          step("restore", "panel-restore", "点一下，它准备把这条内容送回去。", "选择动作读取记录中的多种内容格式。", "Clipboard.copy(item:) 遍历 HistoryItemContent。"),
          step("pasteboard", "restore-pasteboard", "内容回到剪贴板，你可以去任何地方粘贴。", "系统剪贴板被重写，但应用不会替用户自动粘贴。", "clearContents 后通过 setData/writeObjects 恢复 NSPasteboard。"),
        ],
      },
      {
        id: "clear",
        verb: "清理历史记录",
        meta: "3 个环节 · 固定项会保留",
        steps: [
          step("panel", null, "你从面板底部发起清理。", "清理操作从历史面板触发。", "FooterView 将 clear 事件交给 History。"),
          step("history", "panel-history", "它只挑出没有固定的普通记录。", "固定项目被排除，避免误删常用内容。", "History.clear 仅遍历 isUnpinned 项。"),
          step("storage", "history-storage", "这些记录从本地仓库移除，固定项留下。", "删除落入本地存储并刷新列表。", "ModelContext.delete 清理记录及关联内容。"),
        ],
      },
    ],
    health: [
      { tone: "good", title: "隐私边界清楚", text: "历史数据默认只保存在本机。" },
      { tone: "warn", title: "轮询有持续开销", text: "监听器按固定间隔检查剪贴板变化。" },
      { tone: "good", title: "有容量上限", text: "普通历史默认最多保留 500 条。" },
    ],
  },
  {
    id: "podcast",
    name: "小宇宙 AI 助手",
    category: "Chrome 扩展",
    tech: "Extension · Native Host · AI",
    source: "预生成演示映射",
    description: "它读取正在浏览的播客信息，在本地安全取用配置，再生成可复制的结构化总结。",
    accent: "#8be0c4",
    nodes: podcastNodes,
    edges: podcastEdges,
    actions: [
      {
        id: "summarize",
        verb: "总结一期播客",
        meta: "7 个环节 · 用户主动触发",
        steps: [
          step("episode", null, "你在节目页点击“生成总结”。", "用户明确发起当前单集的总结任务。", "Side panel dispatches summarize action for active tab."),
          step("content", "episode-content", "页面读取器只拿走总结需要的节目内容。", "内容脚本提取标题、简介与可用正文。", "Content script extracts normalized episode payload."),
          step("background", "content-background", "扩展调度台把内容和任务要求装好。", "后台脚本校验消息并组织请求。", "Service worker validates payload and routes native message."),
          step("native", "background-native", "本地助手接手敏感配置，不把密钥交给网页。", "Native Host 负责请求配置和模型调用。", "Native Messaging bridge resolves provider config locally."),
          step("keychain", "native-keychain", "模型钥匙从 macOS 钥匙串里临时取出。", "API 密钥由系统钥匙串保管。", "Native Host reads credential from macOS Keychain."),
          step("model", "native-model", "内容发给你选择的模型，按指定格式生成总结。", "请求兼容 Base URL 与 chat/completions 路径。", "Provider adapter normalizes endpoint then sends chat completion."),
          step("summary", "model-summary", "总结回到侧栏，原文、要点和行动项一目了然。", "返回结果被结构化展示，失败时保留重试入口。", "Response parser maps model output into summary sections."),
        ],
      },
      {
        id: "configure",
        verb: "配置 AI 模型",
        meta: "4 个环节 · 密钥不进扩展存储",
        steps: [
          step("summary", null, "你在侧栏填入模型地址和密钥。", "用户配置服务地址、模型与凭据。", "Settings form emits provider configuration."),
          step("background", "summary-background", "扩展只负责把配置交给本地助手。", "浏览器侧不长期保存明文密钥。", "Service worker forwards config via Native Messaging."),
          step("native", "background-native", "本地助手检查地址，并补全正确的调用路径。", "Native Host 统一不同服务商的接口格式。", "Endpoint normalizer resolves Base URL to /chat/completions."),
          step("keychain", "native-keychain", "密钥锁进系统钥匙串，需要时才取用。", "凭据交由 macOS 安全存储持久化。", "Credential is persisted as a Keychain generic password."),
        ],
      },
      {
        id: "copy",
        verb: "复制总结",
        meta: "3 个环节 · 保留 Markdown 结构",
        steps: [
          step("model", null, "模型已经交回一份完整总结。", "总结结果包含标题、章节和要点。", "Parsed completion is available in extension state."),
          step("summary", "model-summary", "侧栏把它整理成适合阅读的格式。", "展示层生成结构化 Markdown 文本。", "Summary serializer produces Markdown output."),
          step("clipboard", "summary-clipboard", "点一下复制，就能带去笔记或聊天里。", "浏览器写入系统剪贴板并给出成功反馈。", "navigator.clipboard.writeText commits serialized summary."),
        ],
      },
    ],
    health: [
      { tone: "good", title: "密钥存储合格", text: "API 密钥由 macOS Keychain 保管。" },
      { tone: "warn", title: "外部服务依赖", text: "模型服务不可用时需要明确错误与重试。" },
      { tone: "info", title: "数据会离开本机", text: "生成总结时，节目内容会发送给所选模型。" },
    ],
  },
];
