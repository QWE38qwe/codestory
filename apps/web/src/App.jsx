import { useEffect, useMemo, useRef, useState } from "react";
import { Background, Handle, Position, ReactFlow } from "@xyflow/react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Box,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardCopy,
  CircleCheck,
  Clipboard,
  Cloud,
  Code2,
  Database,
  FileCode2,
  GitBranch,
  GripVertical,
  Layers3,
  Monitor,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Server,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { audienceLevels, projects } from "./data/projects";
import { getImplementationDetail } from "./data/implementationDetails";

const kindIcons = {
  person: UserRound,
  system: Server,
  logic: Code2,
  storage: Database,
  screen: Monitor,
  service: Cloud,
};

function StoryNode({ data }) {
  const Icon = kindIcons[data.kind] || Box;
  const canInspect = data.pathOrder !== undefined;

  return (
    <div
      className={[
        "story-node",
        `story-node--${data.state}`,
        data.selected ? "story-node--selected" : "",
        canInspect ? "story-node--inspectable" : "",
      ].join(" ")}
    >
      <Handle type="target" position={Position.Left} />
      <div className="story-node__sequence">
        {canInspect ? String(data.pathOrder + 1).padStart(2, "0") : "·"}
      </div>
      <div className="story-node__icon">
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <div className="story-node__copy">
        <strong>{data.label}</strong>
        <span>{data.detail}</span>
      </div>
      {data.state === "done" && <Check className="story-node__check" size={15} />}
      {data.state === "active" && <span className="story-node__pulse" />}
      {canInspect && <span className="story-node__inspect">查看实现</span>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { story: StoryNode };
const DEFAULT_RIGHT_PANEL_WIDTH = 390;

function readStoredBoolean(key, fallback) {
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === "true";
}

function readStoredNumber(key, fallback) {
  const storedValue = window.localStorage.getItem(key);
  if (storedValue === null) return fallback;
  const value = Number(storedValue);
  return Number.isFinite(value) ? value : fallback;
}

function DetailField({ label, children, accent = false }) {
  return (
    <div className={`detail-field ${accent ? "detail-field--accent" : ""}`}>
      <span>{label}</span>
      <p>{children}</p>
    </div>
  );
}

function InlineCodeBlock({ detail, id }) {
  const [copied, setCopied] = useState(false);
  const code = detail.codeBlock?.code || detail.snippet;
  const startLine = detail.codeBlock?.startLine || 1;
  const language = detail.codeBlock?.language || "text";

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="inline-code" id={id} aria-label="具体代码块">
      <header className="inline-code__header">
        <div>
          <strong>{detail.functionName}</strong>
          <span>
            {detail.file || "预生成行为模型"}
            {detail.lines ? ` · 第 ${detail.lines} 行` : ""}
          </span>
        </div>
        <div className="inline-code__actions">
          <span>{language}</span>
          <button onClick={copyCode}>
            {copied ? <CheckCheck size={16} /> : <ClipboardCopy size={16} />}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      </header>
      <div className="inline-code__body">
        <ol className="code-lines" start={startLine}>
          {code.split("\n").map((line, index) => (
            <li key={`${startLine + index}-${line}`}>
              <code>{line || " "}</code>
            </li>
          ))}
        </ol>
      </div>
      <footer>
        <span className={`evidence-badge ${detail.evidence === "真实源码" ? "evidence-badge--real" : ""}`}>
          {detail.evidence}
        </span>
        <p>
          {detail.evidence === "真实源码"
            ? "来自工作区源码，行号以当前文件为准。"
            : "用于解释调用关系的伪代码，不代表真实文件。"}
        </p>
      </footer>
    </section>
  );
}

function ImplementationPanel({
  project,
  action,
  stepIndex,
  onStepChange,
  onPreparePause,
  onPause,
}) {
  const step = action.steps[stepIndex];
  const node = project.nodes.find((item) => item.id === step.nodeId);
  const detail = getImplementationDetail(project.id, action.id, step.nodeId);
  const isRealSource = detail.evidence === "真实源码";
  const codeBlockKey = `${project.id}-${action.id}-${stepIndex}`;
  const codeBlockId = `code-block-${codeBlockKey}`;
  const [expandedCodeKey, setExpandedCodeKey] = useState(null);
  const showCodeBlock = expandedCodeKey === codeBlockKey;

  return (
    <aside className="implementation-panel" aria-label="技术实现详情">
      <div className="implementation-panel__heading">
        <div>
          <span className="eyebrow"><Layers3 size={15} /> 第三层 · 技术实现</span>
          <h2>{node.label}</h2>
        </div>
        <span className={`evidence-badge ${isRealSource ? "evidence-badge--real" : ""}`}>
          {isRealSource ? <CircleCheck size={14} /> : <PackageOpen size={14} />}
          {detail.evidence}
        </span>
      </div>

      <nav className="step-navigator" aria-label="调用步骤">
        {action.steps.map((item, index) => {
          const itemNode = project.nodes.find((candidate) => candidate.id === item.nodeId);
          return (
            <button
              key={`${item.nodeId}-${index}`}
              className={index === stepIndex ? "is-active" : ""}
              onClick={() => onStepChange(index)}
              title={itemNode.label}
            >
              {index + 1}
            </button>
          );
        })}
      </nav>

      <section className="detail-section">
        <span className="detail-section__title">它负责什么</span>
        <p className="detail-role">{detail.role}</p>
        <span className="layer-chip">{detail.layer}</span>
      </section>

      <section className="io-flow" aria-label="输入处理输出">
        <DetailField label="输入">{detail.input}</DetailField>
        <ArrowDown size={18} />
        <DetailField label="处理" accent>{detail.process}</DetailField>
        <ArrowDown size={18} />
        <DetailField label="输出">{detail.output}</DetailField>
      </section>

      <section className="detail-section">
        <span className="detail-section__title"><Code2 size={15} /> 关键实现</span>
        <strong className="function-name">{detail.functionName}</strong>
        {detail.file && (
          <div className="source-location">
            <FileCode2 size={17} />
            <div>
              <strong>{detail.file}</strong>
              <span>第 {detail.lines} 行</span>
            </div>
          </div>
        )}
        <pre><code>{detail.snippet}</code></pre>
        <button
          className="open-code-button"
          onPointerDown={onPreparePause}
          onClick={() => {
            onPause();
            setExpandedCodeKey(showCodeBlock ? null : codeBlockKey);
          }}
          aria-expanded={showCodeBlock}
          aria-controls={codeBlockId}
        >
          <FileCode2 size={17} />
          {showCodeBlock ? "收起完整代码" : "展开完整代码"}
          <span>{detail.codeBlock?.code.split("\n").length || 1} 行</span>
        </button>
        {showCodeBlock && <InlineCodeBlock detail={detail} id={codeBlockId} />}
      </section>

      <section className="detail-section">
        <span className="detail-section__title"><GitBranch size={15} /> 依赖与边界</span>
        <div className="dependency-list">
          {detail.dependencies.map((item) => <span key={item}>{item}</span>)}
        </div>
        <div className="failure-callout">
          <AlertTriangle size={17} />
          <div>
            <strong>失败路径</strong>
            <p>{detail.failure}</p>
          </div>
        </div>
      </section>

      {!isRealSource && (
        <p className="model-disclaimer">
          该项目未在当前工作区发现源码。这里展示的是产品行为级技术模型，不作为真实文件证据。
        </p>
      )}
    </aside>
  );
}

function App() {
  const [projectId, setProjectId] = useState(projects[0].id);
  const project = projects.find((item) => item.id === projectId) || projects[0];
  const [actionId, setActionId] = useState(project.actions[0].id);
  const action = project.actions.find((item) => item.id === actionId) || project.actions[0];
  const [audience, setAudience] = useState("beginner");
  const [activeStep, setActiveStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [leftCollapsed, setLeftCollapsed] = useState(() => (
    readStoredBoolean("codestory:left-collapsed", false)
  ));
  const [rightPanelWidth, setRightPanelWidth] = useState(() => (
    readStoredNumber("codestory:right-panel-width", DEFAULT_RIGHT_PANEL_WIDTH)
  ));
  const [resizing, setResizing] = useState(false);
  const playbackTimerRef = useRef(null);
  const resizeCleanupRef = useRef(null);

  useEffect(() => {
    window.localStorage.setItem("codestory:left-collapsed", String(leftCollapsed));
  }, [leftCollapsed]);

  useEffect(() => {
    window.localStorage.setItem("codestory:right-panel-width", String(rightPanelWidth));
  }, [rightPanelWidth]);

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  useEffect(() => {
    setActionId(project.actions[0].id);
    setActiveStep(0);
    setPlaying(true);
  }, [project.id]);

  useEffect(() => {
    if (!playing) {
      window.clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
      return undefined;
    }
    playbackTimerRef.current = window.setTimeout(() => {
      if (activeStep >= action.steps.length - 1) {
        setPlaying(false);
      } else {
        setActiveStep((index) => index + 1);
      }
    }, 1600);
    return () => {
      window.clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    };
  }, [playing, activeStep, action]);

  const cancelPlaybackTimer = () => {
    window.clearTimeout(playbackTimerRef.current);
    playbackTimerRef.current = null;
  };

  const pauseStory = () => {
    cancelPlaybackTimer();
    setPlaying(false);
  };

  const selectAction = (nextActionId) => {
    setActionId(nextActionId);
    setActiveStep(0);
    setPlaying(true);
  };

  const inspectStep = (index) => {
    pauseStory();
    setActiveStep(index);
  };

  const clampRightPanelWidth = (width) => {
    const leftWidth = leftCollapsed ? 72 : 300;
    const available = window.innerWidth - leftWidth - 540;
    const maxWidth = Math.max(320, Math.min(640, available));
    return Math.min(maxWidth, Math.max(320, width));
  };

  useEffect(() => {
    const keepPanelWithinViewport = () => {
      if (window.innerWidth > 1180) {
        setRightPanelWidth((width) => clampRightPanelWidth(width));
      }
    };

    keepPanelWithinViewport();
    window.addEventListener("resize", keepPanelWithinViewport);
    return () => window.removeEventListener("resize", keepPanelWithinViewport);
  }, [leftCollapsed]);

  const startResizing = (event) => {
    if (window.innerWidth <= 1180) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = rightPanelWidth;
    setResizing(true);

    const handleMove = (moveEvent) => {
      setRightPanelWidth(clampRightPanelWidth(startWidth + startX - moveEvent.clientX));
    };

    const stopResizing = () => {
      setResizing(false);
      document.body.classList.remove("is-resizing-panel");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopResizing);
      resizeCleanupRef.current = null;
    };

    document.body.classList.add("is-resizing-panel");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopResizing);
    resizeCleanupRef.current = stopResizing;
  };

  const resizeWithKeyboard = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") {
      setRightPanelWidth(clampRightPanelWidth(DEFAULT_RIGHT_PANEL_WIDTH));
      return;
    }
    const delta = event.key === "ArrowLeft" ? 16 : -16;
    setRightPanelWidth((width) => clampRightPanelWidth(width + delta));
  };

  const flowNodes = useMemo(() => {
    const stepOrder = new Map(action.steps.map((item, index) => [item.nodeId, index]));
    return project.nodes.map((node) => {
      const pathOrder = stepOrder.get(node.id);
      let state = "dim";
      if (pathOrder !== undefined) {
        state = pathOrder < activeStep ? "done" : pathOrder === activeStep ? "active" : "waiting";
      }
      return {
        ...node,
        type: "story",
        data: {
          ...node,
          pathOrder,
          state,
          selected: pathOrder === activeStep,
        },
      };
    });
  }, [project, action, activeStep]);

  const flowEdges = useMemo(() => {
    const edgeOrder = new Map(
      action.steps.map((item, index) => [item.edgeId, index]).filter(([edgeId]) => edgeId),
    );
    return project.edges.map((edge) => {
      const order = edgeOrder.get(edge.id);
      const isActive = order === activeStep;
      const isDone = order !== undefined && order < activeStep;
      const onPath = order !== undefined;
      return {
        ...edge,
        type: "smoothstep",
        animated: isActive,
        className: isActive ? "flow-edge--active" : isDone ? "flow-edge--done" : onPath ? "flow-edge--waiting" : "flow-edge--dim",
        style: {
          stroke: isActive || isDone ? project.accent : onPath ? "#8a9690" : "#d9dfdb",
          strokeWidth: isActive ? 3.5 : isDone ? 2.5 : 1.5,
        },
      };
    });
  }, [project, action, activeStep]);

  const currentStep = action.steps[activeStep];
  const currentNode = project.nodes.find((node) => node.id === currentStep.nodeId);
  const progress = ((activeStep + 1) / action.steps.length) * 100;

  return (
    <div
      className={`app-shell ${leftCollapsed ? "app-shell--left-collapsed" : ""} ${resizing ? "app-shell--resizing" : ""}`}
      style={{
        "--project-accent": project.accent,
        "--left-panel-width": leftCollapsed ? "72px" : "300px",
        "--right-panel-width": `${rightPanelWidth}px`,
      }}
    >
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark"><Radio size={19} /></div>
          <div>
            <strong>CodeStory</strong>
            <span>从作品故事，下钻到真实实现</span>
          </div>
        </div>
        <div className="breadcrumb">
          <span>{project.name}</span><ChevronRight size={15} />
          <span>{action.verb}</span><ChevronRight size={15} />
          <strong>{currentNode.label}</strong>
        </div>
        <div className="privacy-status"><ShieldCheck size={17} /> 本地演示数据</div>
      </header>

      <main className="workspace">
        <aside className="navigation-rail" aria-label="作品与动作导航">
          <div className="navigation-rail__toolbar">
            <span>导航</span>
            <button
              onClick={() => setLeftCollapsed((value) => !value)}
              aria-label={leftCollapsed ? "展开左侧面板" : "折叠左侧面板"}
              title={leftCollapsed ? "展开左侧面板" : "折叠左侧面板"}
            >
              {leftCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            </button>
          </div>
          <div className="rail-section">
            <span className="eyebrow">第一层 · 选择作品</span>
            <div className="project-list">
              {projects.map((item) => (
                <button
                  className={`project-card ${item.id === project.id ? "project-card--active" : ""}`}
                  key={item.id}
                  onClick={() => setProjectId(item.id)}
                >
                  <span className="project-card__icon">
                    {item.id === "clipboard" ? <Clipboard size={21} /> : <Sparkles size={21} />}
                  </span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.category}</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          </div>

          <div className="rail-section rail-section--actions">
            <span className="eyebrow">第二层 · 用户动作</span>
            <div className="action-list">
              {project.actions.map((item, index) => (
                <button
                  key={item.id}
                  className={item.id === action.id ? "is-active" : ""}
                  onClick={() => selectAction(item.id)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{item.verb}</strong><small>{item.meta}</small></div>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
          </div>

          <div className="project-summary">
            <span>{project.source}</span>
            <strong>{project.tech}</strong>
            <p>{project.description}</p>
          </div>
        </aside>

        <section className="story-workbench">
          <div className="workbench-heading">
            <div>
              <span className="eyebrow"><Activity size={15} /> 动态调用路径</span>
              <h1>“{action.verb}”如何一步步发生？</h1>
              <p>点击路径中的任一节点，查看它的输入、处理、输出与代码证据。</p>
            </div>
            <div className="playback">
              <span>{activeStep + 1} / {action.steps.length}</span>
              <button onClick={() => (playing ? pauseStory() : setPlaying(true))}>
                {playing ? <Pause size={17} /> : <Play size={17} />}
                {playing ? "暂停" : "继续"}
              </button>
              <button onClick={() => { setActiveStep(0); setPlaying(true); }}>
                <RotateCcw size={17} /> 重播
              </button>
            </div>
          </div>

          <div className="flow-progress"><span style={{ width: `${progress}%` }} /></div>

          <div className="flow-canvas">
            <ReactFlow
              key={project.id}
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.14 }}
              minZoom={0.6}
              maxZoom={1.3}
              nodesDraggable={false}
              nodesConnectable={false}
              proOptions={{ hideAttribution: true }}
              onNodeClick={(_, node) => {
                const index = action.steps.findIndex((item) => item.nodeId === node.id);
                if (index >= 0) inspectStep(index);
              }}
            >
              <Background color="#d8dfda" gap={28} size={1.2} />
            </ReactFlow>
          </div>

          <div className="narration-panel">
            <div className="narration-panel__step">
              <span>步骤 {String(activeStep + 1).padStart(2, "0")}</span>
              <strong>{currentNode.label}</strong>
            </div>
            <p key={`${action.id}-${activeStep}-${audience}`}>{currentStep.narration[audience]}</p>
            <div className="audience-switcher" aria-label="讲解深度">
              {audienceLevels.map((level) => (
                <button
                  key={level.id}
                  className={audience === level.id ? "is-active" : ""}
                  onClick={() => setAudience(level.id)}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div
          className="panel-resizer"
          role="separator"
          aria-label="调整技术实现面板宽度"
          aria-orientation="vertical"
          aria-valuemin={320}
          aria-valuemax={640}
          aria-valuenow={rightPanelWidth}
          tabIndex={0}
          onPointerDown={startResizing}
          onDoubleClick={() => setRightPanelWidth(clampRightPanelWidth(DEFAULT_RIGHT_PANEL_WIDTH))}
          onKeyDown={resizeWithKeyboard}
          title="拖动调整宽度，双击恢复默认"
        >
          <span><GripVertical size={17} /></span>
        </div>

        <ImplementationPanel
          project={project}
          action={action}
          stepIndex={activeStep}
          onStepChange={inspectStep}
          onPreparePause={cancelPlaybackTimer}
          onPause={pauseStory}
        />
      </main>
    </div>
  );
}

export default App;
