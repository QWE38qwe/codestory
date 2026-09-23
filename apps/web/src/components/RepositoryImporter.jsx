import { useEffect, useRef, useState } from "react";
import { FolderOpen, Github, KeyRound, LoaderCircle, Sparkles, X } from "lucide-react";
import { createGithubJob, createLocalJob, deleteLlmSettings, getJob, getLlmSettings, getStory, saveLlmSettings } from "../api/client";

const initialSettings = { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", apiKey: "", configured: false, maskedKey: "" };
const stageNames = { queued: "等待分析", fetching_repository: "读取项目", building_structure: "建立代码索引", discovering_features: "识别核心功能", generating_story: "生成 Story", validating: "校验源码证据", persisting: "保存 Story", completed: "已完成", failed: "分析失败" };

export default function RepositoryImporter({ open, onClose, onProjectReady }) {
  const [sourceType, setSourceType] = useState("github");
  const [githubUrl, setGithubUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [subdir, setSubdir] = useState("");
  const [localFiles, setLocalFiles] = useState([]);
  const [settings, setSettings] = useState(initialSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState(null);
  const pollController = useRef(null);
  const settingsController = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    settingsController.current = controller;
    setSettingsLoaded(false);
    getLlmSettings(controller.signal).then((value) => setSettings({
      ...initialSettings,
      ...value,
      baseUrl: value.baseUrl || initialSettings.baseUrl,
      model: value.model || initialSettings.model,
    }))
      .catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); })
      .finally(() => setSettingsLoaded(true));
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!job?.jobId || !open) return undefined;
    const controller = new AbortController();
    pollController.current = controller;
    let delay = 1000;
    const poll = async () => {
      while (!controller.signal.aborted) {
        try {
          const next = await getJob(job.jobId, controller.signal);
          setJob(next);
          setStatus(`${stageNames[next.stage] || "正在分析"} · ${next.progress}%`);
          if (next.status === "failed") { setError(next.error?.message || "分析失败，请重试。"); setBusy(false); return; }
          if (next.status === "completed") {
            const project = await getStory(next.projectId, controller.signal);
            onProjectReady(project);
            onClose();
            return;
          }
          delay = 1000;
        } catch (reason) {
          if (controller.signal.aborted) return;
          if (reason.code) { setError(reason.message); setBusy(false); return; }
          delay = Math.min(5000, delay * 2);
          setStatus("连接暂时中断，正在重试…");
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    };
    void poll();
    return () => controller.abort();
  }, [job?.jobId, open, onClose, onProjectReady]);

  if (!open) return null;

  const uploadLocalFiles = async () => {
    if (!localFiles.length) throw new Error("请先选择本地项目文件夹。");
    const rootName = localFiles[0].webkitRelativePath?.split("/")[0] || "local-project";
    const candidates = localFiles.filter((file) => {
      const path = file.webkitRelativePath || file.name;
      const ignoredFolder = /(^|\/)(\.git|node_modules|dist|build|coverage|\.next|vendor|__pycache__)(\/|$)/i.test(path);
      return !ignoredFolder && !/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock|\.env(?:\.local)?|\.ds_store)$/i.test(path) && !/\.min\.js$/i.test(path) && /\.(js|jsx|mjs|cjs|ts|tsx|py|md|json)$/i.test(file.name);
    });
    if (!candidates.length) throw new Error("文件夹中没有支持的 JS、TS、Python、Markdown 或 JSON 文件。");
    const form = new FormData();
    const files = candidates.map((file, index) => ({ index, path: (file.webkitRelativePath || file.name).split("/").slice(1).join("/") || file.name }));
    form.append("metadata", JSON.stringify({ projectName: rootName, files }));
    candidates.forEach((file, index) => form.append("files", file, String(index)));
    return createLocalJob(form);
  };

  const submit = async () => {
    setBusy(true); setError(""); setJob(null);
    try {
      if (settings.apiKey.trim()) {
        const saved = await saveLlmSettings({ baseUrl: settings.baseUrl.trim(), model: settings.model.trim(), apiKey: settings.apiKey.trim() });
        setSettings({ ...saved, apiKey: "" });
      } else if (!settings.configured) {
        throw new Error("请先填写模型 API Key 并保存连接设置。");
      }
      const created = sourceType === "github"
        ? await createGithubJob({ repoUrl: githubUrl, branch: branch || undefined, subdir: subdir || undefined })
        : await uploadLocalFiles();
      setJob(created);
      setStatus("任务已排队…");
    } catch (reason) {
      setError(reason.message || "无法创建分析任务。");
      setBusy(false);
    }
  };

  const close = () => {
    pollController.current?.abort();
    settingsController.current?.abort();
    setSettings((current) => ({ ...current, apiKey: "" }));
    onClose();
  };

  const removeCredential = async () => {
    setBusy(true); setError("");
    try {
      await deleteLlmSettings();
      setSettings({ ...initialSettings, configured: false });
    } catch (reason) { setError(reason.message || "无法删除模型配置。"); }
    finally { setBusy(false); }
  };

  return (
    <div className="repo-importer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="repo-importer">
        <header>
          <div><span>NEW PROJECT</span><h2>解读你的 Vibe Coding 项目</h2><p>服务端会自动识别最多 3 个有源码证据的功能并生成 Story。</p></div>
          <button className="icon-button" onClick={close} aria-label="关闭"><X size={19} /></button>
        </header>

        <div className="source-switch">
          <button className={sourceType === "github" ? "is-active" : ""} onClick={() => setSourceType("github")}><Github size={17}/> GitHub</button>
          <button className={sourceType === "local" ? "is-active" : ""} onClick={() => setSourceType("local")}><FolderOpen size={17}/> 本地文件夹</button>
        </div>

        {sourceType === "github" ? (
          <div className="form-grid">
            <label className="span-2">GitHub 仓库<input value={githubUrl} onChange={(event) => setGithubUrl(event.target.value)} placeholder="https://github.com/owner/repo" /></label>
            <label>Branch（可选）<input value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="main" /></label>
            <label>子目录（可选）<input value={subdir} onChange={(event) => setSubdir(event.target.value)} placeholder="apps/web" /></label>
          </div>
        ) : (
          <label className="folder-picker">
            <FolderOpen size={23}/><strong>{localFiles.length ? `已选择 ${localFiles.length} 个文件` : "选择项目文件夹"}</strong>
            <span>源码会临时上传到本机服务端，任务结束后删除。</span>
            <input type="file" webkitdirectory="" directory="" multiple onChange={(event) => setLocalFiles(Array.from(event.target.files || []))} />
          </label>
        )}

        <div className="settings-card">
          <div className="settings-card__title"><KeyRound size={17}/><strong>模型连接</strong></div>
          <div className="form-grid">
            <label>Model<input value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} /></label>
            <label className="span-2">OpenAI-compatible Base URL<input value={settings.baseUrl} onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })} /></label>
            <label className="span-2">API Key<input type="password" value={settings.apiKey} onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })} placeholder={settings.configured ? `已保存 ${settings.maskedKey}；填写新 Key 可替换` : "只发送到本机服务端并加密保存"} /></label>
          </div>
          <div className="settings-card__footer"><small>{settingsLoaded ? settings.configured ? `已配置 · ${settings.model}` : "尚未配置模型" : "正在读取模型配置…"}</small>{settings.configured && <button className="secondary-button" disabled={busy} onClick={removeCredential}>删除已保存的 Key</button>}</div>
        </div>

        {job && <div className="import-status">{busy && <LoaderCircle className="spin" size={16}/>} {status}</div>}
        {error && <div className="import-error">{error}</div>}
        {!job && <div className="import-actions"><button className="primary-button" disabled={busy || !settingsLoaded} onClick={submit}><Sparkles size={17}/>{busy ? "正在提交…" : "自动分析并生成 Story"}</button></div>}
        {job?.status === "failed" && <div className="import-actions"><button className="secondary-button" onClick={() => { setJob(null); setBusy(false); }}>重试</button></div>}
      </section>
    </div>
  );
}
