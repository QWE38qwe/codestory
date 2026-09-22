import { useMemo, useState } from "react";
import { FolderOpen, Github, KeyRound, LoaderCircle, Search, Sparkles, X } from "lucide-react";
import { discoverFeatures, generateStories, scanRepository } from "../ingest/runIngest";
import { getProvider, loadLlmSettings, PROVIDERS, saveLlmSettings, testConnection } from "../settings/llmSettings";

const defaultLanguages = { js: true, python: true };

export default function RepositoryImporter({ open, onClose, onProjectReady }) {
  const [sourceType, setSourceType] = useState("github");
  const [githubUrl, setGithubUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [subdir, setSubdir] = useState("");
  const [localFiles, setLocalFiles] = useState(null);
  const [settings, setSettings] = useState(() => loadLlmSettings());
  const [scan, setScan] = useState(null);
  const [featureResult, setFeatureResult] = useState(null);
  const [selected, setSelected] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const provider = useMemo(() => getProvider(settings.provider), [settings.provider]);

  if (!open) return null;

  const updateProvider = (id) => {
    const nextProvider = getProvider(id);
    setSettings((current) => ({
      ...current,
      provider: id,
      baseUrl: nextProvider.defaultBaseUrl,
      model: nextProvider.defaultModel,
    }));
  };

  const runScan = async () => {
    setBusy(true); setError(""); setFeatureResult(null); setSelected([]);
    try {
      const result = await scanRepository({
        sourceType,
        githubUrl,
        branch,
        subdir,
        files: localFiles,
        languages: defaultLanguages,
        githubToken: settings.githubToken,
      }, setStatus);
      setScan(result);
      setStatus("扫描完成，可以识别核心功能");
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const runDiscover = async () => {
    if (!scan) return;
    setBusy(true); setError("");
    try {
      const saved = saveLlmSettings(settings);
      const result = await discoverFeatures({ ...scan, settings: saved }, setStatus);
      setFeatureResult(result);
      setSelected(result.features.map((item) => item.id));
      setStatus("选择要理解的功能，再生成 Story");
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const runGenerate = async () => {
    if (!scan || !featureResult) return;
    const features = featureResult.features.filter((item) => selected.includes(item.id));
    if (!features.length) { setError("至少选择一个功能。"); return; }
    setBusy(true); setError("");
    try {
      const saved = saveLlmSettings(settings);
      const result = await generateStories({
        ...scan,
        settings: saved,
        features,
        featureDraft: featureResult.featureDraft,
      }, setStatus);
      onProjectReady(result.project);
      onClose();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true); setError("");
    try {
      const saved = saveLlmSettings(settings);
      await testConnection(saved);
      setStatus("模型连接成功");
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="repo-importer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="repo-importer">
        <header>
          <div><span>NEW PROJECT</span><h2>解读你的 Vibe Coding 项目</h2><p>先扫描真实代码，再选择一个核心功能生成可播放 Story。</p></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button>
        </header>

        <div className="source-switch">
          <button className={sourceType === "github" ? "is-active" : ""} onClick={() => setSourceType("github")}><Github size={17}/> GitHub</button>
          <button className={sourceType === "local" ? "is-active" : ""} onClick={() => setSourceType("local")}><FolderOpen size={17}/> 本地文件夹</button>
        </div>

        {sourceType === "github" ? (
          <div className="form-grid">
            <label className="span-2">GitHub 仓库<input value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/owner/repo" /></label>
            <label>Branch（可选）<input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" /></label>
            <label>子目录（可选）<input value={subdir} onChange={(e) => setSubdir(e.target.value)} placeholder="apps/web" /></label>
          </div>
        ) : (
          <label className="folder-picker">
            <FolderOpen size={23}/>
            <strong>{localFiles?.length ? `已选择 ${localFiles.length} 个文件` : "选择项目文件夹"}</strong>
            <span>源码先在本地读取，只把分析上下文发送给你配置的模型。</span>
            <input type="file" webkitdirectory="" directory="" multiple onChange={(e) => setLocalFiles(e.target.files)} />
          </label>
        )}

        <div className="settings-card">
          <div className="settings-card__title"><KeyRound size={17}/><strong>模型与私有仓设置</strong></div>
          <div className="form-grid">
            <label>Provider<select value={settings.provider} onChange={(e) => updateProvider(e.target.value)}>{PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label>Model<input value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} /></label>
            <label className="span-2">Base URL<input value={settings.baseUrl} onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })} /></label>
            <label>API Key<input type="password" value={settings.apiKey} onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })} placeholder="仅保存在当前浏览器" /></label>
            <label>GitHub Token<input type="password" value={settings.githubToken} onChange={(e) => setSettings({ ...settings, githubToken: e.target.value })} placeholder="私有仓需要只读 Token" /></label>
          </div>
          <div className="settings-card__footer">
            <button className="secondary-button" disabled={busy || !settings.apiKey} onClick={test}>测试模型连接</button>
            <small>{provider.label} · Key 不进入 Prompt</small>
          </div>
        </div>

        <div className="import-actions">
          <button className="secondary-button" disabled={busy} onClick={runScan}><Search size={17}/> 扫描仓库</button>
          <button className="secondary-button" disabled={busy || !scan || !settings.apiKey} onClick={runDiscover}><Sparkles size={17}/> 识别核心功能</button>
        </div>

        {scan && (
          <div className="scan-report">
            <strong>{scan.repo.name}</strong>
            <span>{scan.repo.stats.loaded} 个已读取文件 / {scan.repo.stats.scanned} 个候选文件 · 约 {scan.tokenEstimate.toLocaleString()} tokens</span>
            {scan.repo.stats.truncated && <em>仓库较大，本轮优先读取高相关文件；建议按子目录分析以提高准确率。</em>}
          </div>
        )}

        {featureResult && (
          <div className="feature-picker">
            <div><strong>选择你想理解的核心功能</strong><span>生成后每一步都会标记真实源码 / 源码推断 / 模型解释。</span></div>
            {featureResult.features.map((feature) => (
              <label key={feature.id}>
                <input type="checkbox" checked={selected.includes(feature.id)} onChange={() => setSelected((current) => current.includes(feature.id) ? current.filter((id) => id !== feature.id) : [...current, feature.id])} />
                <span><strong>{feature.verb}</strong><small>{feature.description}</small></span>
                <em>{feature.confidence || "medium"}</em>
              </label>
            ))}
            <button className="primary-button" disabled={busy || !selected.length} onClick={runGenerate}><Sparkles size={17}/> 生成 CodeStory</button>
          </div>
        )}

        {(status || busy) && <div className="import-status">{busy && <LoaderCircle className="spin" size={16}/>} {status}</div>}
        {error && <div className="import-error">{error}</div>}
      </section>
    </div>
  );
}
