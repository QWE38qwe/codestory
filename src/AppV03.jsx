import { useEffect, useMemo, useRef, useState } from "react";
import { Background, Handle, Position, ReactFlow } from "@xyflow/react";
import {
  Activity, AlertTriangle, ArrowDown, ArrowRight, Box, Check, CheckCheck,
  ChevronRight, ClipboardCopy, CircleCheck, Clipboard, Cloud, Code2, Database,
  FileCode2, GitBranch, GripVertical, Layers3, Monitor, PackageOpen, Pause, Play,
  Plus, Radio, RotateCcw, Server, ShieldCheck, Sparkles, UserRound,
} from "lucide-react";
import { audienceLevels, projects as demoProjects } from "./data/projects";
import { getImplementationDetail } from "./data/implementationDetails";
import RepositoryImporter from "./components/RepositoryImporter";

const kindIcons = { person: UserRound, system: Server, logic: Code2, storage: Database, screen: Monitor, service: Cloud };

function StoryNode({ data }) {
  const Icon = kindIcons[data.kind] || Box;
  const canInspect = data.pathOrder !== undefined;
  return (
    <div className={["story-node", `story-node--${data.state}`, data.selected ? "story-node--selected" : "", canInspect ? "story-node--inspectable" : ""].join(" ")}>
      <Handle type="target" position={Position.Left} />
      <div className="story-node__sequence">{canInspect ? String(data.pathOrder + 1).padStart(2, "0") : "·"}</div>
      <div className="story-node__icon"><Icon size={20} strokeWidth={1.8} /></div>
      <div className="story-node__copy"><strong>{data.label}</strong><span>{data.detail}</span></div>
      {data.state === "done" && <Check className="story-node__check" size={15} />}
      {data.state === "active" && <span className="story-node__pulse" />}
      {canInspect && <span className="story-node__inspect">查看实现</span>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { story: StoryNode };

function DetailField({ label, children, accent = false }) {
  return <div className={`detail-field ${accent ? "detail-field--accent" : ""}`}><span>{label}</span><p>{children}</p></div>;
}

function getDetail(project, action, nodeId) {
  return project.implementationDetails?.[action.id]?.[nodeId] || getImplementationDetail(project.id, action.id, nodeId);
}

function InlineCodeBlock({ detail }) {
  const [copied, setCopied] = useState(false);
  const code = detail.codeBlock?.code || detail.snippet || "";
  const startLine = detail.codeBlock?.startLine || 1;
  const language = detail.codeBlock?.language || "text";
  const copyCode = async () => {
    await navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <section className="inline-code">
      <header className="inline-code__header">
        <div><strong>{detail.functionName}</strong><span>{detail.file || "无直接源码证据"}{detail.lines ? ` · 第 ${detail.lines} 行` : ""}</span></div>
        <div className="inline-code__actions"><span>{language}</span><button onClick={copyCode}>{copied ? <CheckCheck size={16}/> : <ClipboardCopy size={16}/>} {copied ? "已复制" : "复制"}</button></div>
      </header>
      <div className="inline-code__body"><ol className="code-lines" start={startLine}>{code.split("\n").map((line, index) => <li key={`${index}-${line}`}><code>{line || " "}</code></li>)}</ol></div>
    </section>
  );
}

function ImplementationPanel({ project, action, stepIndex, onStepChange }) {
  const step = action.steps[stepIndex];
  const node = project.nodes.find((item) => item.id === step.nodeId);
  const detail = getDetail(project, action, step.nodeId);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [project.id, action.id, stepIndex]);
  const real = detail.evidenceType === "SOURCE" || detail.evidence === "真实源码";

  return (
    <aside className="implementation-panel">
      <div className="implementation-panel__heading">
        <div><span className="eyebrow"><Layers3 size={15}/> 第三层 · 技术实现</span><h2>{node?.label}</h2></div>
        <span className={`evidence-badge ${real ? "evidence-badge--real" : ""}`}>{real ? <CircleCheck size={14}/> : <PackageOpen size={14}/>} {detail.evidence}</span>
      </div>

      <nav className="step-navigator">
        {action.steps.map((item, index) => <button key={item.nodeId} className={index === stepIndex ? "is-active" : ""} onClick={() => onStepChange(index)}>{index + 1}</button>)}
      </nav>

      <section className="detail-section"><span className="detail-section__title">它负责什么</span><p className="detail-role">{detail.role}</p><span className="layer-chip">{detail.layer}</span></section>
      <section className="io-flow">
        <DetailField label="输入">{detail.input}</DetailField><ArrowDown size={18}/>
        <DetailField label="处理" accent>{detail.process}</DetailField><ArrowDown size={18}/>
        <DetailField label="输出">{detail.output}</DetailField>
      </section>

      <section className="detail-section">
        <span className="detail-section__title"><Code2 size={15}/> 关键实现</span>
        <strong className="function-name">{detail.functionName}</strong>
        {detail.file && <div className="source-location"><FileCode2 size={17}/><div><strong>{detail.file}</strong><span>第 {detail.lines} 行</span></div></div>}
        <pre><code>{detail.snippet}</code></pre>
        {detail.codeBlock && <button className="open-code-button" onClick={() => setExpanded((value) => !value)}><FileCode2 size={17}/>{expanded ? "收起源码" : "展开源码"}<span>{detail.codeBlock.code.split("\n").length} 行</span></button>}
        {expanded && detail.codeBlock && <InlineCodeBlock detail={detail}/>}
      </section>

      <section className="detail-section">
        <span className="detail-section__title"><GitBranch size={15}/> 依赖与边界</span>
        <div className="dependency-list">{(detail.dependencies || []).map((item) => <span key={item}>{item}</span>)}</div>
        <div className="failure-callout"><AlertTriangle size={17}/><div><strong>失败路径</strong><p>{detail.failure}</p></div></div>
      </section>

      {!real && <p className="model-disclaimer">这一步没有通过真实源码定位校验，已降级为{detail.evidence || "推断"}，不会冒充源码事实。</p>}
    </aside>
  );
}

export default function AppV03() {
  const [runtimeProjects, setRuntimeProjects] = useState([]);
  const allProjects = useMemo(() => [...runtimeProjects, ...demoProjects], [runtimeProjects]);
  const [projectId, setProjectId] = useState(demoProjects[0].id);
  const project = allProjects.find((item) => item.id === projectId) || allProjects[0];
  const [actionId, setActionId] = useState(project.actions[0].id);
  const action = project.actions.find((item) => item.id === actionId) || project.actions[0];
  const [audience, setAudience] = useState("beginner");
  const [activeStep, setActiveStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [importerOpen, setImporterOpen] = useState(false);
  const playbackTimerRef = useRef(null);

  useEffect(() => {
    setActionId(project.actions[0].id);
    setActiveStep(0);
    setPlaying(true);
  }, [project.id]);

  useEffect(() => {
    if (!playing) return undefined;
    playbackTimerRef.current = setTimeout(() => {
      if (activeStep >= action.steps.length - 1) setPlaying(false);
      else setActiveStep((value) => value + 1);
    }, 1700);
    return () => clearTimeout(playbackTimerRef.current);
  }, [playing, activeStep, action]);

  const selectAction = (id) => { setActionId(id); setActiveStep(0); setPlaying(true); };
  const inspectStep = (index) => { setPlaying(false); setActiveStep(index); };

  const flowNodes = useMemo(() => {
    const order = new Map(action.steps.map((item, index) => [item.nodeId, index]));
    return project.nodes.map((node) => {
      const pathOrder = order.get(node.id);
      const state = pathOrder === undefined ? "dim" : pathOrder < activeStep ? "done" : pathOrder === activeStep ? "active" : "waiting";
      return { ...node, type: "story", data: { ...node, pathOrder, state, selected: pathOrder === activeStep } };
    });
  }, [project, action, activeStep]);

  const flowEdges = useMemo(() => {
    const order = new Map(action.steps.map((item, index) => [item.edgeId, index]).filter(([id]) => id));
    return project.edges.map((edge) => {
      const edgeOrder = order.get(edge.id);
      const active = edgeOrder === activeStep;
      const done = edgeOrder !== undefined && edgeOrder < activeStep;
      const onPath = edgeOrder !== undefined;
      return { ...edge, type: "smoothstep", animated: active, style: { stroke: active || done ? project.accent : onPath ? "#8a9690" : "#d9dfdb", strokeWidth: active ? 3.5 : done ? 2.5 : 1.5 } };
    });
  }, [project, action, activeStep]);

  const currentStep = action.steps[activeStep];
  const currentNode = project.nodes.find((node) => node.id === currentStep.nodeId);
  const progress = ((activeStep + 1) / action.steps.length) * 100;

  const addRuntimeProject = (next) => {
    setRuntimeProjects((current) => [next, ...current]);
    setProjectId(next.id);
  };

  return (
    <div className="app-shell" style={{ "--project-accent": project.accent, "--left-panel-width": "300px", "--right-panel-width": "390px" }}>
      <header className="topbar">
        <div className="brand"><div className="brand__mark"><Radio size={19}/></div><div><strong>CodeStory</strong><span>理解 Vibe Coding 项目怎么真正运行</span></div></div>
        <div className="breadcrumb"><span>{project.name}</span><ChevronRight size={15}/><span>{action.verb}</span><ChevronRight size={15}/><strong>{currentNode?.label}</strong></div>
        <div className="topbar-actions">
          <div className="privacy-status"><ShieldCheck size={17}/> 代码证据可追溯</div>
          <button className="analyze-button" onClick={() => setImporterOpen(true)}><Plus size={17}/> 解读仓库</button>
        </div>
      </header>

      <main className="workspace">
        <aside className="navigation-rail">
          <div className="navigation-rail__toolbar"><span>项目与功能</span><Sparkles size={17}/></div>
          <div className="rail-section">
            <span className="eyebrow">第一层 · 选择项目</span>
            <div className="project-list">
              {allProjects.map((item) => (
                <button className={`project-card ${item.id === project.id ? "project-card--active" : ""}`} key={item.id} onClick={() => setProjectId(item.id)}>
                  <span className="project-card__icon">{item.id === "clipboard" ? <Clipboard size={21}/> : <Sparkles size={21}/>}</span>
                  <span><strong>{item.name}</strong><small>{item.category}</small></span><ChevronRight size={18}/>
                </button>
              ))}
            </div>
          </div>
          <div className="rail-section rail-section--actions">
            <span className="eyebrow">第二层 · 核心功能</span>
            <div className="action-list">
              {project.actions.map((item, index) => (
                <button key={item.id} className={item.id === action.id ? "is-active" : ""} onClick={() => selectAction(item.id)}>
                  <span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.verb}</strong><small>{item.meta}</small></div><ArrowRight size={17}/>
                </button>
              ))}
            </div>
          </div>
          <div className="project-summary"><span>{project.source}</span><strong>{project.tech}</strong><p>{project.description}</p></div>
        </aside>

        <section className="story-workbench">
          <div className="workbench-heading">
            <div><span className="eyebrow"><Activity size={15}/> 功能实现 Story</span><h1>“{action.verb}”如何一步步发生？</h1><p>主路径只保留关键环节；点击节点可查看真实源码或推断证据。</p></div>
            <div className="playback"><span>{activeStep + 1} / {action.steps.length}</span><button onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={17}/> : <Play size={17}/>} {playing ? "暂停" : "继续"}</button><button onClick={() => { setActiveStep(0); setPlaying(true); }}><RotateCcw size={17}/> 重播</button></div>
          </div>
          <div className="flow-progress"><span style={{ width: `${progress}%` }}/></div>
          <div className="flow-canvas">
            <ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.14 }} minZoom={0.55} maxZoom={1.4} nodesDraggable={false} nodesConnectable={false} proOptions={{ hideAttribution: true }} onNodeClick={(_, node) => { const index = action.steps.findIndex((item) => item.nodeId === node.id); if (index >= 0) inspectStep(index); }}>
              <Background color="#d8dfda" gap={28} size={1.2}/>
            </ReactFlow>
          </div>
          <div className="narration-panel">
            <div className="narration-panel__step"><span>步骤 {String(activeStep + 1).padStart(2, "0")}</span><strong>{currentNode?.label}</strong></div>
            <p>{currentStep.narration[audience]}</p>
            <div className="audience-switcher">{audienceLevels.map((level) => <button key={level.id} className={audience === level.id ? "is-active" : ""} onClick={() => setAudience(level.id)}>{level.label}</button>)}</div>
          </div>
        </section>

        <div className="panel-resizer" aria-hidden="true"><span><GripVertical size={17}/></span></div>
        <ImplementationPanel project={project} action={action} stepIndex={activeStep} onStepChange={inspectStep}/>
      </main>

      <RepositoryImporter open={importerOpen} onClose={() => setImporterOpen(false)} onProjectReady={addRuntimeProject}/>
    </div>
  );
}
