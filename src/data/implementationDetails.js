const clipboard = {
  person: {
    layer: "用户入口",
    role: "把一次普通复制动作交给 macOS 系统剪贴板。",
    input: "用户按下 ⌘C，前台应用提供文本、图片或文件引用。",
    process: "源应用将多个可用格式写入 NSPasteboard.general。",
    output: "系统剪贴板 changeCount 增加，等待应用监听。",
    functionName: "系统级复制事件",
    file: null,
    lines: null,
    evidence: "系统行为",
    snippet: "User action → NSPasteboard.general",
    dependencies: ["前台应用", "macOS NSPasteboard"],
    failure: "源应用没有写入支持的类型时，后续监听不会创建历史记录。",
  },
  pasteboard: {
    layer: "系统能力",
    role: "作为应用之间交换内容的系统级临时缓冲区。",
    input: "一组 NSPasteboardItem，每项可能包含多个内容类型。",
    process: "维护当前内容及 changeCount，向读取方暴露类型与二进制数据。",
    output: "可被 Clipboard 监听器读取的 pasteboardItems。",
    functionName: "NSPasteboard.general",
    file: "Maccy/Clipboard.swift",
    lines: "13–39",
    evidence: "真实源码",
    snippet: "private let pasteboard = NSPasteboard.general\nchangeCount = pasteboard.changeCount",
    dependencies: ["AppKit", "NSPasteboardItem"],
    failure: "敏感、临时或不支持的类型会在进入历史模块前被过滤。",
  },
  watcher: {
    layer: "监听与过滤",
    role: "发现剪贴板变化，过滤不应保存的内容，并组装历史记录。",
    input: "pasteboard changeCount、内容类型、来源应用。",
    process: "轮询变化，排除 concealed/transient、忽略应用和空内容，再合并多格式数据。",
    output: "包含 HistoryItemContent 数组的新 HistoryItem。",
    functionName: "Clipboard.checkForChangesInPasteboard()",
    file: "Maccy/Clipboard.swift",
    lines: "149–220",
    evidence: "真实源码",
    snippet: "guard pasteboard.changeCount != changeCount else { return }\nif shouldIgnore(Set(pasteboard.types ?? [])) { return }\nlet historyItem = HistoryItem(contents: contents)",
    dependencies: ["Defaults", "HistoryItemContent", "NSRunningApplication"],
    failure: "轮询间隔过长会延迟入库；过滤规则配置错误可能漏记或误记内容。",
  },
  history: {
    layer: "领域逻辑",
    role: "处理去重、排序、容量限制和固定项规则。",
    input: "监听器创建的 HistoryItem。",
    process: "查找相似项，合并复制次数与元数据，限制未固定记录数量并更新可观察列表。",
    output: "排序后的 HistoryItemDecorator 以及待持久化模型。",
    functionName: "History.add(_:)",
    file: "Maccy/Observables/History.swift",
    lines: "136–197",
    evidence: "真实源码",
    snippet: "if let existingHistoryItem = findSimilarItem(item) {\n  item.numberOfCopies += existingHistoryItem.numberOfCopies\n}\nlimitHistorySize(to: Defaults[.size] - 1)",
    dependencies: ["Sorter", "SwiftData ModelContext", "Defaults"],
    failure: "相似项判断过宽会合并不应合并的内容；容量清理必须排除固定项。",
  },
  storage: {
    layer: "本地持久化",
    role: "把历史模型保存在应用支持目录的 SQLite 文件中。",
    input: "HistoryItem 与关联的 HistoryItemContent。",
    process: "通过 SwiftData ModelContainer 插入、查询、删除并保存事务。",
    output: "本地 Storage.sqlite 数据和可恢复的历史记录。",
    functionName: "Storage.context / History.insertIntoStorage(_:)",
    file: "Maccy/Storage.swift",
    lines: "4–34",
    evidence: "真实源码",
    snippet: "let url = URL.applicationSupportDirectory\n  .appending(path: \"ClipboardHistory/Storage.sqlite\")\ncontainer = try ModelContainer(for: HistoryItem.self, configurations: config)",
    dependencies: ["SwiftData", "ModelContainer", "ModelContext"],
    failure: "数据库初始化失败会阻止应用启动；删除操作需要同步清理关联内容。",
  },
  panel: {
    layer: "界面展示",
    role: "把固定项、普通历史和选择状态组织成可滚动列表。",
    input: "History 中可观察的 pinnedItems 与 unpinnedItems。",
    process: "根据固定位置、搜索结果和窗口状态构建 SwiftUI 列表。",
    output: "可选择、可预览的历史面板。",
    functionName: "HistoryListView.body",
    file: "Maccy/Views/HistoryListView.swift",
    lines: "68–147",
    evidence: "真实源码",
    snippet: "ScrollView {\n  MultipleSelectionListView(items: unpinnedItems) {\n    HistoryItemView(item: item, previous: previous, next: next, index: index)\n  }\n}",
    dependencies: ["SwiftUI", "AppState", "NavigationManager"],
    failure: "大量记录或预览内容可能增加渲染成本，窗口高度需要在列表变化后重新计算。",
  },
  restore: {
    layer: "恢复逻辑",
    role: "把选中的历史项按原有格式重新写回系统剪贴板。",
    input: "一个 HistoryItem，可选移除富文本格式。",
    process: "清空剪贴板，逐个恢复文本/图片格式；文件 URL 使用 writeObjects 单独处理。",
    output: "NSPasteboard 中恢复完成的内容。",
    functionName: "Clipboard.copy(_:removeFormatting:)",
    file: "Maccy/Clipboard.swift",
    lines: "74–110",
    evidence: "真实源码",
    snippet: "pasteboard.clearContents()\nfor content in contents {\n  pasteboard.setData(content.value, forType: NSPasteboard.PasteboardType(content.type))\n}",
    dependencies: ["HistoryItem", "NSPasteboard", "Notifier"],
    failure: "原文件 URL 已失效时只能恢复引用，不能恢复已经移动或删除的文件实体。",
  },
};

const podcast = {
  episode: {
    layer: "用户入口",
    role: "从当前小宇宙节目页发起一次明确的总结任务。",
    input: "当前标签页、用户选择的总结模板和讲解偏好。",
    process: "侧栏确认页面类型后创建 summarize 指令。",
    output: "带 activeTab 标识的总结任务。",
    functionName: "sidepanel.dispatch('summarize')",
    file: null,
    lines: null,
    evidence: "预生成行为模型",
    snippet: "sidepanel → summarize(activeTab)",
    dependencies: ["Chrome Side Panel", "activeTab"],
    failure: "当前页面不是可识别的节目页时，应阻止请求并提示用户切换页面。",
  },
  content: {
    layer: "页面适配",
    role: "从节目页提取标题、简介、章节和可用正文。",
    input: "当前页面 DOM 与节目元信息。",
    process: "使用站点适配器定位字段，清洗空白与重复文本，生成统一 payload。",
    output: "NormalizedEpisodePayload。",
    functionName: "extractEpisodePayload()",
    file: null,
    lines: null,
    evidence: "预生成行为模型",
    snippet: "{ title, description, chapters, transcript? }",
    dependencies: ["Content Script", "站点 DOM 适配器"],
    failure: "页面结构变化会导致字段缺失；缺少正文时需要降级为简介总结。",
  },
  background: {
    layer: "浏览器调度",
    role: "校验跨上下文消息，并把任务路由给本地助手。",
    input: "页面提取结果或设置表单提交的模型配置。",
    process: "校验消息类型、来源标签页与 payload，再建立 Native Messaging 请求。",
    output: "发往 Native Host 的结构化消息。",
    functionName: "background.onMessage / routeNativeRequest",
    file: null,
    lines: null,
    evidence: "预生成行为模型",
    snippet: "content/sidepanel → service worker → native messaging",
    dependencies: ["chrome.runtime", "Native Messaging"],
    failure: "Service Worker 休眠或 Native Host 未安装时，请求必须返回可操作的错误提示。",
  },
  native: {
    layer: "本地安全桥",
    role: "在浏览器外管理敏感配置、标准化接口地址并调用模型。",
    input: "总结 payload、Provider 配置引用和任务 Prompt。",
    process: "读取钥匙串凭据，补全 chat/completions 路径，设置请求头并发起 HTTPS 请求。",
    output: "模型响应或结构化错误。",
    functionName: "NativeHost.handleMessage / normalizeEndpoint",
    file: null,
    lines: null,
    evidence: "预生成行为模型",
    snippet: "baseURL → normalizeEndpoint() → /chat/completions",
    dependencies: ["macOS Keychain", "HTTPS Client", "Provider Adapter"],
    failure: "地址、模型名或密钥无效时，应保留 Provider 返回信息并允许用户重试。",
  },
  keychain: {
    layer: "凭据存储",
    role: "保存 API 密钥，避免明文进入扩展存储或网页上下文。",
    input: "Provider 标识与用户提交的 API Key。",
    process: "以通用密码条目写入 macOS Keychain，需要请求时按服务名读取。",
    output: "仅在 Native Host 内存中短暂存在的凭据。",
    functionName: "Keychain.get / Keychain.set",
    file: null,
    lines: null,
    evidence: "预生成行为模型",
    snippet: "security add-generic-password / find-generic-password",
    dependencies: ["macOS Security Framework"],
    failure: "钥匙串权限被拒绝时不得回退到明文文件，应提示重新授权。",
  },
  model: {
    layer: "外部 AI 服务",
    role: "根据 Prompt 将节目内容转换成结构化总结。",
    input: "messages、model、temperature 与授权请求头。",
    process: "执行兼容 OpenAI Chat Completions 的推理请求。",
    output: "模型生成文本、状态码和可选用量信息。",
    functionName: "POST /chat/completions",
    file: null,
    lines: null,
    evidence: "预生成行为模型",
    snippet: "POST {endpoint}\n{ model, messages, temperature }",
    dependencies: ["用户选择的模型服务", "网络连接"],
    failure: "超时、限流或格式不符合预期时，界面需要展示原因并允许重试。",
  },
  summary: {
    layer: "结果呈现",
    role: "把模型结果解析成摘要、要点、章节和行动项。",
    input: "模型生成文本或设置表单数据。",
    process: "解析输出结构，生成阅读视图和可复制 Markdown。",
    output: "侧栏中的结构化总结与复制内容。",
    functionName: "renderSummary / serializeMarkdown",
    file: null,
    lines: null,
    evidence: "预生成行为模型",
    snippet: "completion → parseSections() → summary view",
    dependencies: ["Side Panel State", "Markdown Serializer"],
    failure: "模型漏掉章节时应保留原始结果，而不是让整个页面渲染失败。",
  },
  clipboard: {
    layer: "系统输出",
    role: "将结构化总结写入系统剪贴板。",
    input: "Markdown Serializer 生成的文本。",
    process: "调用 Clipboard API 写入并更新成功状态。",
    output: "可粘贴到笔记或聊天工具的 Markdown。",
    functionName: "navigator.clipboard.writeText",
    file: null,
    lines: null,
    evidence: "预生成行为模型",
    snippet: "await navigator.clipboard.writeText(markdown)",
    dependencies: ["Clipboard API", "页面焦点与权限"],
    failure: "剪贴板权限被拒绝时，应提供手动选择文本的降级方式。",
  },
};

const overrides = {
  "clipboard.restore.storage": {
    role: "从 SwiftData 加载历史记录并恢复排序。",
    input: "Storage.context 中的全部 HistoryItem。",
    process: "执行 FetchDescriptor 查询，排序后包装为可观察项，并按容量限制清理。",
    output: "History.all 与当前可见的 History.items。",
    functionName: "History.load()",
    file: "Maccy/Observables/History.swift",
    lines: "104–118",
    snippet: "let results = try Storage.shared.context.fetch(descriptor)\nall = sorter.sort(results).map { HistoryItemDecorator($0) }",
  },
  "clipboard.clear.panel": {
    role: "提供清理普通历史与清理全部历史两个明确入口。",
    input: "底部清理按钮及当前修饰键状态。",
    process: "根据快捷键状态在 clear 与 clearAll 动作间切换。",
    output: "交给 History 的清理命令。",
    functionName: "FooterView.body",
    file: "Maccy/Views/FooterView.swift",
    lines: "21–60",
    snippet: "FooterItemView(item: footer.items[0])\nFooterItemView(item: footer.items[1])",
  },
  "clipboard.clear.history": {
    role: "删除所有未固定记录，同时保留固定项。",
    input: "内存中的 History.all 与 SwiftData 数据。",
    process: "清理未固定项、会话日志和关联内容，并在事务中持久化删除。",
    output: "仅保留固定项的新历史列表。",
    functionName: "History.clear()",
    file: "Maccy/Observables/History.swift",
    lines: "212–243",
    snippet: "all.removeAll(where: \\.isUnpinned)\ntry? Storage.shared.context.delete(\n  model: HistoryItem.self, where: #Predicate { $0.pin == nil }\n)",
  },
  "clipboard.clear.storage": {
    role: "在同一事务中删除未固定模型及其关联内容。",
    input: "pin == nil 的 HistoryItem 和 HistoryItemContent。",
    process: "执行谓词删除、处理挂起变化并保存 context。",
    output: "不包含普通历史项的本地数据库。",
    functionName: "ModelContext.transaction",
    file: "Maccy/Observables/History.swift",
    lines: "224–235",
    snippet: "try? Storage.shared.context.transaction {\n  try? Storage.shared.context.delete(model: HistoryItem.self, where: predicate)\n}",
  },
  "podcast.configure.summary": {
    role: "收集 Base URL、模型名与 API Key，并明确哪些字段会离开浏览器。",
    input: "用户填写的 Provider 配置。",
    process: "进行必填校验后把敏感字段交给 Native Host。",
    output: "待本地安全保存的 ProviderConfig。",
    functionName: "settings.submitProviderConfig",
    snippet: "{ baseURL, model, apiKey } → native host",
  },
  "podcast.configure.native": {
    role: "识别 Base URL 或完整路径，并统一补全为可调用端点。",
    input: "用户配置的服务地址。",
    process: "移除尾部斜杠，识别已有 chat/completions，按 Provider 规则补全路径。",
    output: "规范化的请求 URL。",
    functionName: "normalizeChatCompletionsEndpoint",
    snippet: "https://host/v1 → https://host/v1/chat/completions",
  },
  "podcast.copy.summary": {
    role: "把当前总结序列化成保留标题与列表层级的 Markdown。",
    input: "结构化摘要、章节和行动项。",
    process: "按模板拼接标题、段落、列表和来源信息。",
    output: "可移植的 Markdown 字符串。",
    functionName: "serializeSummaryToMarkdown",
    snippet: "summary sections → Markdown Serializer → text",
  },
};

const codeBlocks = {
  "clipboard.person": {
    language: "text",
    startLine: 1,
    code: "用户按下 ⌘C\n  ↓\n前台应用写入 NSPasteboard.general\n  ↓\npasteboard.changeCount 增加",
  },
  "clipboard.pasteboard": {
    language: "swift",
    startLine: 13,
    code: `private let pasteboard = NSPasteboard.general

private var timer: Timer?

private var sourceApp: NSRunningApplication? {
  NSWorkspace.shared.frontmostApplication
}

init() {
  changeCount = pasteboard.changeCount
}`,
  },
  "clipboard.watcher": {
    language: "swift",
    startLine: 149,
    code: `@objc
@MainActor
func checkForChangesInPasteboard() {
  guard pasteboard.changeCount != changeCount else {
    return
  }

  changeCount = pasteboard.changeCount

  if shouldIgnore(Set(pasteboard.types ?? [])) {
    return
  }

  var contents = [HistoryItemContent]()
  pasteboard.pasteboardItems?.forEach { item in
    item.types.forEach { type in
      contents.append(
        HistoryItemContent(type: type.rawValue, value: item.data(forType: type))
      )
    }
  }

  guard !contents.isEmpty else { return }
  let historyItem = HistoryItem(contents: contents)
  onNewCopyHooks.forEach { $0(historyItem) }
}`,
  },
  "clipboard.history": {
    language: "swift",
    startLine: 136,
    code: `@discardableResult
@MainActor
func add(_ item: HistoryItem) -> HistoryItemDecorator {
  if #available(macOS 15.0, *) {
    try? History.shared.insertIntoStorage(item)
  }

  if let existingHistoryItem = findSimilarItem(item) {
    item.firstCopiedAt = existingHistoryItem.firstCopiedAt
    item.numberOfCopies += existingHistoryItem.numberOfCopies
    item.pin = existingHistoryItem.pin
    Storage.shared.context.delete(existingHistoryItem)
  }

  limitHistorySize(to: Defaults[.size] - 1)
  let itemDecorator = HistoryItemDecorator(item)
  items = all
  return itemDecorator
}`,
  },
  "clipboard.storage": {
    language: "swift",
    startLine: 18,
    code: `private let url = URL.applicationSupportDirectory
  .appending(path: "ClipboardHistory/Storage.sqlite")

init() {
  var config = ModelConfiguration(url: url)

  #if DEBUG
  if CommandLine.arguments.contains("enable-testing") {
    config = ModelConfiguration(isStoredInMemoryOnly: true)
  }
  #endif

  do {
    container = try ModelContainer(
      for: HistoryItem.self,
      configurations: config
    )
  } catch let error {
    fatalError("Cannot load database: \\(error.localizedDescription).")
  }
}`,
  },
  "clipboard.panel": {
    language: "swift",
    startLine: 97,
    code: `ScrollView {
  ScrollViewReader { proxy in
    MultipleSelectionListView(items: unpinnedItems) {
      previous, item, next, index in

      HistoryItemView(
        item: item,
        previous: previous,
        next: next,
        index: index
      )
    }
    .padding(.top, scrollTopPadding)
    .padding(.bottom, scrollBottomPadding)
  }
}`,
  },
  "clipboard.restore": {
    language: "swift",
    startLine: 74,
    code: `@MainActor
func copy(_ item: HistoryItem?, removeFormatting: Bool = false) {
  guard let item else { return }

  pasteboard.clearContents()
  var contents = item.contents

  if removeFormatting {
    contents = clearFormatting(contents)
  }

  for content in contents {
    guard content.type != NSPasteboard.PasteboardType.fileURL.rawValue else {
      continue
    }
    pasteboard.setData(
      content.value,
      forType: NSPasteboard.PasteboardType(content.type)
    )
  }

  pasteboard.setString("", forType: .fromMaccy)
  sync()
}`,
  },
  "podcast.episode": {
    language: "typescript · 行为模型",
    startLine: 1,
    code: `async function summarizeActiveEpisode() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  assertEpisodePage(activeTab.url);
  return chrome.runtime.sendMessage({
    type: "SUMMARIZE_EPISODE",
    tabId: activeTab.id,
  });
}`,
  },
  "podcast.content": {
    language: "typescript · 行为模型",
    startLine: 1,
    code: `function extractEpisodePayload(document: Document) {
  return {
    title: readTitle(document),
    description: readDescription(document),
    chapters: readChapters(document),
    transcript: readTranscript(document) ?? null,
  };
}`,
  },
  "podcast.background": {
    language: "typescript · 行为模型",
    startLine: 1,
    code: `chrome.runtime.onMessage.addListener(async (message, sender) => {
  validateMessage(message, sender);

  return nativeBridge.request({
    type: message.type,
    payload: message.payload,
    sourceTabId: sender.tab?.id,
  });
});`,
  },
  "podcast.native": {
    language: "python · 行为模型",
    startLine: 1,
    code: `def handle_message(message):
    config = load_provider_config(message["provider"])
    api_key = keychain.get(config.credential_id)
    endpoint = normalize_chat_completions(config.base_url)

    return http.post(
        endpoint,
        headers={"Authorization": f"Bearer {api_key}"},
        json=build_completion_payload(message),
    )`,
  },
  "podcast.keychain": {
    language: "python · 行为模型",
    startLine: 1,
    code: `def save_api_key(provider_id, api_key):
    keychain.set(
        service="xiaoyuzhou-ai-assistant",
        account=provider_id,
        password=api_key,
    )

def load_api_key(provider_id):
    return keychain.get(
        service="xiaoyuzhou-ai-assistant",
        account=provider_id,
    )`,
  },
  "podcast.model": {
    language: "http · 行为模型",
    startLine: 1,
    code: `POST /v1/chat/completions
Authorization: Bearer <key-from-keychain>
Content-Type: application/json

{
  "model": "<configured-model>",
  "messages": [
    { "role": "system", "content": "<summary-contract>" },
    { "role": "user", "content": "<episode-payload>" }
  ]
}`,
  },
  "podcast.summary": {
    language: "typescript · 行为模型",
    startLine: 1,
    code: `function renderSummary(completion: string) {
  const sections = parseSections(completion);

  return {
    overview: sections.overview ?? completion,
    highlights: sections.highlights ?? [],
    chapters: sections.chapters ?? [],
    actions: sections.actions ?? [],
  };
}`,
  },
  "podcast.clipboard": {
    language: "typescript · 行为模型",
    startLine: 1,
    code: `async function copySummary(summary: Summary) {
  const markdown = serializeSummaryToMarkdown(summary);
  await navigator.clipboard.writeText(markdown);
  return { copied: true };
}`,
  },
};

export function getImplementationDetail(projectId, actionId, nodeId) {
  const base = projectId === "clipboard" ? clipboard[nodeId] : podcast[nodeId];
  const override = overrides[`${projectId}.${actionId}.${nodeId}`];
  const codeBlock = codeBlocks[`${projectId}.${nodeId}`];
  return { ...base, ...override, codeBlock };
}
