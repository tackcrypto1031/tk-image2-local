
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { InfiniteCanvas, CanvasApi } from './components/InfiniteCanvas';
import { ContextMenu } from './components/ContextMenu';
import { DrawingModal } from './components/DrawingModal';
import { ImageEditModal } from './components/ImageEditModal';
import type { CanvasElement, NoteElement, ImageElement, ArrowElement, DrawingElement, Point, ElementType } from './types';
import { useHistoryState } from './useHistoryState';

export const COLORS = [
  { name: '灰色', bg: 'bg-gray-700', text: 'text-gray-700' },
  { name: '紅色', bg: 'bg-red-500', text: 'text-red-500' },
  { name: '橘色', bg: 'bg-orange-500', text: 'text-orange-500' },
  { name: '黃色', bg: 'bg-yellow-500', text: 'text-yellow-500' },
  { name: '綠色', bg: 'bg-green-500', text: 'text-green-500' },
  { name: '藍色', bg: 'bg-blue-600', text: 'text-blue-600' },
  { name: '紫色', bg: 'bg-purple-600', text: 'text-purple-600' },
  { name: '粉紅色', bg: 'bg-pink-500', text: 'text-pink-500' },
];

const INITIAL_ELEMENTS: CanvasElement[] = [
  { id: '1', type: 'note', position: { x: 20, y: -190 }, width: 430, height: 190, rotation: 0, zIndex: 1, content: '[ Codex 圖像畫布 ]\n\n選取便條與圖片，再用本機 Codex CLI imagegen 生成圖片。\n\n桌面模式：npm run dev:electron', color: 'bg-blue-600', textAlign: 'center' },
  { id: '2', type: 'note', position: { x: 250, y: 30 }, width: 250, height: 190, rotation: -10, zIndex: 2, content: '🕹️ 操作：\n\n● 按住 [SPACE] 平移畫布\n\n● 滾動滑鼠縮放\n\n● 右鍵開啟選單', color: 'bg-green-500' },
  { id: '3', type: 'note', position: { x: -200, y: 30 }, width: 250, height: 150, rotation: 5, zIndex: 0, content: '⚡ 快捷鍵：\n\n● [Command+Z] 復原\n\n● [Shift+Command+Z] 重做', color: 'bg-yellow-500' },
];

const LEGACY_TUTORIAL_NOTE_PATTERNS: Record<string, RegExp> = {
  '1': /Codex Image Canvas|Select notes and images/i,
  '2': /CONTROL|Hold \[SPACE\]|Right-click/i,
  '3': /Shortcut|Command\+Z|Undo|Redo/i,
};

const localizeBuiltInTutorialNotes = (savedElements: CanvasElement[]) => savedElements.map((element) => {
  if (element.type !== 'note') {
    return element;
  }
  const localized = INITIAL_ELEMENTS.find(initial => initial.id === element.id && initial.type === 'note') as NoteElement | undefined;
  const legacyPattern = LEGACY_TUTORIAL_NOTE_PATTERNS[element.id];
  if (!localized || !legacyPattern?.test(element.content)) {
    return element;
  }
  return { ...element, content: localized.content };
});

interface ContextMenuData {
    x: number;
    y: number;
    worldPoint: Point;
    elementId: string | null;
}

const getRandomPosition = () => ({
  x: Math.floor(Math.random() * 400) - 200,
  y: Math.floor(Math.random() * 400) - 200
});

const getCodexImageBridge = () => {
  if (!window.codexImage) {
    throw new Error("Codex 圖像生成只能在 Electron 桌面版使用。請用 start.bat 或 npm run dev:electron 啟動。");
  }
  return window.codexImage;
};

const createJobId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const aspectRatioFromDimensions = (width: number, height: number) => {
  const roundedWidth = Math.max(1, Math.round(width));
  const roundedHeight = Math.max(1, Math.round(height));
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(roundedWidth, roundedHeight);
  return `${Math.round(roundedWidth / divisor)}:${Math.round(roundedHeight / divisor)}`;
};

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

export interface OutpaintingState {
  element: ImageElement;
  frame: {
    position: Point;
    width: number;
    height: number;
  };
}

export interface GenerationJob {
  jobId: string;
  anchorElementId: string | null;
  anchorPosition: Point;
  status: string;
  elapsed: number;
  isRunning: boolean;
  resultDataUrl?: string;
  error?: string;
}

type GenerationAnchor = Pick<GenerationJob, 'anchorElementId' | 'anchorPosition'>;
type CodexCliStatusKind = 'checking' | 'ready' | 'missing' | 'login' | 'unsupported' | 'browser' | 'error';

interface CodexCliStatusView {
  kind: CodexCliStatusKind;
  label: string;
  detail: string;
  actionLabel: string;
}

const getCodexCliIssueText = (health: CodexHealthResult | null, error: string | null) => (
  health?.blockingIssues.join('\n') || error || ''
);

const getCodexCliStatusView = ({
  hasBridge,
  health,
  error,
  isChecking,
  isLaunching,
  setupMessage,
}: {
  hasBridge: boolean;
  health: CodexHealthResult | null;
  error: string | null;
  isChecking: boolean;
  isLaunching: boolean;
  setupMessage: string | null;
}): CodexCliStatusView => {
  if (!hasBridge) {
    return {
      kind: 'browser',
      label: '瀏覽器模式',
      detail: '請用桌面版啟動才可檢測 Codex CLI。',
      actionLabel: '桌面版限定',
    };
  }
  if (isLaunching) {
    return {
      kind: 'checking',
      label: '檢測中',
      detail: setupMessage || '正在開啟安裝 / 登入視窗。',
      actionLabel: '開啟中',
    };
  }
  if (isChecking && !health) {
    return {
      kind: 'checking',
      label: '檢測中',
      detail: '正在檢查本機 Codex CLI。',
      actionLabel: '檢測中',
    };
  }
  if (health?.ok) {
    return {
      kind: 'ready',
      label: '已登入',
      detail: health.checks.codexVersion || health.checks.authStatus || 'Codex CLI 可用。',
      actionLabel: '重新檢測',
    };
  }

  const issueText = getCodexCliIssueText(health, error);
  if (/unavailable|enoent|not recognized|找不到|無法辨識/i.test(issueText)) {
    return {
      kind: 'missing',
      label: '未安裝',
      detail: setupMessage || '找不到 codex 指令。',
      actionLabel: '安裝 / 登入',
    };
  }
  if (/does not expose|required --image|output-last-message|flags/i.test(issueText)) {
    return {
      kind: 'unsupported',
      label: '版本不支援',
      detail: setupMessage || '目前版本缺少 imagegen 需要的功能。',
      actionLabel: '更新 / 登入',
    };
  }
  if (/login status failed|not logged|not authenticated|login/i.test(issueText)) {
    return {
      kind: 'login',
      label: '未登入',
      detail: setupMessage || 'Codex CLI 尚未完成登入。',
      actionLabel: '登入',
    };
  }
  return {
    kind: 'error',
    label: '未登入',
    detail: setupMessage || issueText || 'Codex CLI 狀態檢測失敗。',
    actionLabel: '安裝 / 登入',
  };
};

const CODEX_CLI_STATUS_STYLES: Record<CodexCliStatusKind, { shell: string; dot: string; action: string }> = {
  checking: {
    shell: 'border-gray-300 bg-white/90 text-gray-800',
    dot: 'bg-gray-400 animate-pulse',
    action: 'bg-gray-100 text-gray-700',
  },
  ready: {
    shell: 'border-emerald-200 bg-emerald-50/95 text-emerald-950',
    dot: 'bg-emerald-500',
    action: 'bg-emerald-100 text-emerald-800',
  },
  missing: {
    shell: 'border-red-200 bg-red-50/95 text-red-950',
    dot: 'bg-red-500',
    action: 'bg-red-600 text-white',
  },
  login: {
    shell: 'border-amber-200 bg-amber-50/95 text-amber-950',
    dot: 'bg-amber-500',
    action: 'bg-amber-500 text-white',
  },
  unsupported: {
    shell: 'border-orange-200 bg-orange-50/95 text-orange-950',
    dot: 'bg-orange-500',
    action: 'bg-orange-500 text-white',
  },
  browser: {
    shell: 'border-gray-300 bg-white/90 text-gray-700',
    dot: 'bg-gray-400',
    action: 'bg-gray-100 text-gray-500',
  },
  error: {
    shell: 'border-red-200 bg-red-50/95 text-red-950',
    dot: 'bg-red-500',
    action: 'bg-red-600 text-white',
  },
};

const CodexCliStatusBadge: React.FC<{
  view: CodexCliStatusView;
  disabled: boolean;
  onClick: () => void;
}> = ({ view, disabled, onClick }) => {
  const styles = CODEX_CLI_STATUS_STYLES[view.kind];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`cli-status absolute bottom-4 left-4 z-30 flex max-w-[min(420px,calc(100vw-2rem))] items-center gap-3 px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-80 ${styles.shell}`}
      aria-label={`Codex CLI ${view.label}`}
    >
      <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${styles.dot}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-5">Codex CLI：{view.label}</span>
        <span className="block truncate text-xs leading-4 opacity-80">{view.detail}</span>
      </span>
      <span className={`cli-action flex-shrink-0 px-2 py-1 text-[11px] font-semibold leading-4 ${styles.action}`}>
        {view.actionLabel}
      </span>
    </button>
  );
};

const getRotatedElementCorners = (element: CanvasElement): Point[] => {
  const { x, y } = element.position;
  const { width, height, rotation } = element;
  const rad = rotation * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map(corner => ({
    x: x + corner.x * cos - corner.y * sin,
    y: y + corner.x * sin + corner.y * cos,
  }));
};

const getGenerationAnchor = (selectedElements: CanvasElement[]): GenerationAnchor => {
  const noteAnchor = selectedElements.find((element): element is NoteElement => element.type === 'note');
  if (noteAnchor) {
    return {
      anchorElementId: noteAnchor.id,
      anchorPosition: {
        x: noteAnchor.position.x + noteAnchor.width / 2 + 24,
        y: noteAnchor.position.y - noteAnchor.height / 2,
      },
    };
  }

  const corners = selectedElements.flatMap(getRotatedElementCorners);
  if (corners.length === 0) {
    return { anchorElementId: null, anchorPosition: { x: 0, y: 0 } };
  }

  return {
    anchorElementId: null,
    anchorPosition: {
      x: Math.max(...corners.map(corner => corner.x)) + 24,
      y: Math.min(...corners.map(corner => corner.y)),
    },
  };
};

const App: React.FC = () => {
  const { 
    state: elements, 
    setState: setElements, 
    undo, 
    redo, 
    canUndo, 
    canRedo 
  } = useHistoryState<CanvasElement[]>(INITIAL_ELEMENTS);

  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [resetView, setResetView] = useState<() => void>(() => () => {});
  const [generationJobs, setGenerationJobs] = useState<GenerationJob[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);
  const [editingDrawing, setEditingDrawing] = useState<DrawingElement | null>(null);
  const [editingImage, setEditingImage] = useState<ImageElement | null>(null);
  const [outpaintingState, setOutpaintingState] = useState<OutpaintingState | null>(null);
  const [imageStyle, setImageStyle] = useState<string>('Default');
  const [imageAspectRatio, setImageAspectRatio] = useState<string>('1:1');
  const [isMenuCollapsed, setIsMenuCollapsed] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [codexCliHealth, setCodexCliHealth] = useState<CodexHealthResult | null>(null);
  const [codexCliError, setCodexCliError] = useState<string | null>(null);
  const [codexCliSetupMessage, setCodexCliSetupMessage] = useState<string | null>(null);
  const [isCheckingCodexCli, setIsCheckingCodexCli] = useState(() => Boolean(window.codexImage));
  const [isLaunchingCodexCliSetup, setIsLaunchingCodexCliSetup] = useState(false);
  const [codexCliPollUntil, setCodexCliPollUntil] = useState<number | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const canvasApiRef = useRef<CanvasApi>(null);
  const lastImagePosition = useRef<Point | null>(null);
  const zIndexCounter = useRef(INITIAL_ELEMENTS.length);
  const dragCounter = useRef(0);
  const autosaveReadyRef = useRef(false);
  const autosaveTimerRef = useRef<number | null>(null);

  const updateGenerationJob = useCallback((jobId: string, update: (job: GenerationJob) => GenerationJob) => {
    setGenerationJobs(prevJobs => prevJobs.map(job => job.jobId === jobId ? update(job) : job));
  }, []);

  const refreshCodexCliHealth = useCallback(async ({ showChecking = true } = {}) => {
    const bridge = window.codexImage;
    if (!bridge) {
      setCodexCliHealth(null);
      setCodexCliError(null);
      setIsCheckingCodexCli(false);
      return null;
    }
    if (showChecking) {
      setIsCheckingCodexCli(true);
    }
    try {
      const health = await bridge.health();
      setCodexCliHealth(health);
      setCodexCliError(null);
      if (health.ok) {
        setCodexCliSetupMessage(null);
        setCodexCliPollUntil(null);
      }
      return health;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCodexCliHealth(null);
      setCodexCliError(message);
      return null;
    } finally {
      setIsCheckingCodexCli(false);
    }
  }, []);

  const handleSetupCodexCli = useCallback(async () => {
    const bridge = window.codexImage;
    if (!bridge) return;
    setIsLaunchingCodexCliSetup(true);
    setCodexCliError(null);
    setCodexCliSetupMessage(null);
    try {
      const result = await bridge.setupCodexCli();
      if (result.ok) {
        setCodexCliSetupMessage(result.message);
        setCodexCliPollUntil(Date.now() + 3 * 60 * 1000);
        await refreshCodexCliHealth({ showChecking: false });
      } else {
        setCodexCliError(result.message);
      }
    } catch (error) {
      setCodexCliError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLaunchingCodexCliSetup(false);
    }
  }, [refreshCodexCliHealth]);

  const handleCodexCliStatusClick = useCallback(() => {
    if (!window.codexImage || isCheckingCodexCli || isLaunchingCodexCliSetup) return;
    if (codexCliHealth?.ok) {
      refreshCodexCliHealth();
      return;
    }
    handleSetupCodexCli();
  }, [codexCliHealth?.ok, handleSetupCodexCli, isCheckingCodexCli, isLaunchingCodexCliSetup, refreshCodexCliHealth]);

  useEffect(() => {
    refreshCodexCliHealth();
  }, [refreshCodexCliHealth]);

  useEffect(() => {
    if (!codexCliPollUntil || !window.codexImage) return;
    if (codexCliHealth?.ok) {
      setCodexCliPollUntil(null);
      return;
    }
    const poll = () => {
      if (Date.now() > codexCliPollUntil) {
        setCodexCliPollUntil(null);
        return;
      }
      refreshCodexCliHealth({ showChecking: false });
    };
    poll();
    const timer = window.setInterval(poll, 5000);
    return () => window.clearInterval(timer);
  }, [codexCliHealth?.ok, codexCliPollUntil, refreshCodexCliHealth]);

  const runCodexImageGeneration = useCallback(async (
    request: Omit<CodexGenerateRequest, 'jobId'>,
    anchor: GenerationAnchor = { anchorElementId: null, anchorPosition: { x: 0, y: 0 } },
  ): Promise<CodexGeneratedImage> => {
    const bridge = getCodexImageBridge();
    const jobId = createJobId(request.mode || 'generate');
    setGenerationJobs(prevJobs => [
      ...prevJobs,
      {
        jobId,
        anchorElementId: anchor.anchorElementId,
        anchorPosition: anchor.anchorPosition,
        status: '正在啟動 Codex imagegen...',
        elapsed: 0,
        isRunning: true,
      },
    ]);
    try {
      updateGenerationJob(jobId, job => ({
        ...job,
        status: '正在使用 Codex CLI imagegen 生成圖片...',
      }));
      const result = await bridge.generate({ ...request, jobId });
      updateGenerationJob(jobId, job => ({
        ...job,
        status: '生成完成',
        isRunning: false,
        resultDataUrl: result.dataUrl,
      }));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isCancelled = /cancelled/i.test(message);
      updateGenerationJob(jobId, job => ({
        ...job,
        status: isCancelled ? '已取消生成' : '生成失敗',
        isRunning: false,
        error: isCancelled ? undefined : message,
      }));
      throw error;
    }
  }, [updateGenerationJob]);

  const handleCancelGeneration = useCallback((jobId: string) => {
    if (!window.codexImage) return;
    updateGenerationJob(jobId, job => ({
      ...job,
      status: '正在取消 Codex imagegen...',
    }));
    window.codexImage.cancel(jobId).catch((error) => {
      console.error("Failed to cancel generation:", error);
    });
  }, [updateGenerationJob]);

  const hasRunningGenerationJobs = generationJobs.some(job => job.isRunning);
  useEffect(() => {
    if (!hasRunningGenerationJobs) return;
    const timer = window.setInterval(() => {
      setGenerationJobs(prevJobs => prevJobs.map(job => (
        job.isRunning ? { ...job, elapsed: job.elapsed + 1 } : job
      )));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasRunningGenerationJobs]);

  useEffect(() => {
    let cancelled = false;
    const bridge = window.codexImage;
    if (!bridge) {
      autosaveReadyRef.current = true;
      return;
    }
    bridge.loadCanvas()
      .then((savedElements) => {
        if (cancelled || !Array.isArray(savedElements)) return;
        const savedCanvasElements = localizeBuiltInTutorialNotes(savedElements as CanvasElement[]);
        setElements(savedCanvasElements);
        const maxZ = Math.max(0, ...savedCanvasElements.map(el => Number(el.zIndex) || 0));
        zIndexCounter.current = maxZ + 1;
      })
      .catch((error) => console.warn("Failed to load autosaved canvas:", error))
      .finally(() => {
        autosaveReadyRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [setElements]);

  useEffect(() => {
    const bridge = window.codexImage;
    if (!autosaveReadyRef.current || !bridge) return;
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      bridge.saveCanvas(elements).catch((error) => console.warn("Failed to autosave canvas:", error));
    }, 500);
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [elements]);

  const addElement = useCallback((newElement: Omit<NoteElement, 'id' | 'zIndex'> | Omit<ImageElement, 'id' | 'zIndex'> | Omit<ArrowElement, 'id' | 'zIndex'> | Omit<DrawingElement, 'id' | 'zIndex'>) => {
    const elementWithId: CanvasElement = {
        ...newElement,
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        zIndex: zIndexCounter.current++,
    } as CanvasElement;
     setElements(prev => [...prev, elementWithId]);
  }, [setElements]);

  const addNote = useCallback((position?: Point) => {
    addElement({
      type: 'note',
      position: position || getRandomPosition(),
      width: 150,
      height: 100,
      rotation: 0,
      content: '新增便條',
      color: COLORS[Math.floor(Math.random() * COLORS.length)].bg,
    });
  }, [addElement]);
  
  const addDrawing = useCallback((position?: Point) => {
    addElement({
      type: 'drawing',
      position: position || getRandomPosition(),
      width: 400,
      height: 300,
      rotation: 0,
      src: '',
    });
  }, [addElement]);
  
  const handleEditDrawing = useCallback((elementId: string) => {
      const element = elements.find(el => el.id === elementId);
      if (element && element.type === 'drawing') {
          setEditingDrawing(element);
      }
  }, [elements]);
  
  const handleSaveDrawing = (elementId: string, dataUrl: string) => {
      setElements(prev => prev.map(el =>
          el.id === elementId ? { ...el, src: dataUrl } : el
      ));
      setEditingDrawing(null);
  };
    
  const handleStartImageEdit = useCallback((elementId: string) => {
      const element = elements.find(el => el.id === elementId);
      if (element && element.type === 'image') {
          setEditingImage(element);
      }
  }, [elements]);

  const handleSaveImageEdit = (elementId: string, newSrc: string) => {
      setElements(prev => prev.map(el =>
          el.id === elementId && el.type === 'image' ? { ...el, src: newSrc } : el
      ));
      setEditingImage(null);
  };

    const handleStartOutpainting = useCallback((elementId: string) => {
        const element = elements.find(el => el.id === elementId && el.type === 'image') as ImageElement | undefined;
        if (element) {
            setOutpaintingState({
                element,
                frame: {
                    position: { ...element.position },
                    width: element.width,
                    height: element.height,
                }
            });
            setSelectedElementIds([]); // Deselect to hide default controls
            setContextMenu(null);
        }
    }, [elements]);

    const handleUpdateOutpaintingFrame = useCallback((newFrame: { position: Point; width: number; height: number; }) => {
        setOutpaintingState(prev => prev ? { ...prev, frame: { ...prev.frame, ...newFrame } } : null);
    }, []);

    const handleCancelOutpainting = () => {
        setOutpaintingState(null);
    };

    const handleOutpaintingGenerate = useCallback(async (prompt: string) => {
        if (!outpaintingState) return;

        const { element, frame } = outpaintingState;

        try {
            const taskCanvas = document.createElement('canvas');
            taskCanvas.width = Math.ceil(frame.width);
            taskCanvas.height = Math.ceil(frame.height);
            const ctx = taskCanvas.getContext('2d');
            if (!ctx) throw new Error('Could not create canvas context');

            const originalImage = new Image();
            originalImage.src = element.src;
            await new Promise<void>((resolve, reject) => {
                originalImage.onload = () => resolve();
                originalImage.onerror = reject;
            });

            const drawX = (frame.width / 2) + (element.position.x - frame.position.x) - (element.width / 2);
            const drawY = (frame.height / 2) + (element.position.y - frame.position.y) - (element.height / 2);
            ctx.drawImage(originalImage, drawX, drawY, element.width, element.height);

            const taskImageB64 = taskCanvas.toDataURL('image/png');
            const finalPrompt = `This is an outpainting task. The existing image is part of a larger scene. Fill the surrounding transparent areas to naturally and seamlessly extend the image. User guidance: "${prompt || 'Continue the scene naturally.'}"`;
            const result = await runCodexImageGeneration({
                mode: 'outpaint',
                prompt: finalPrompt,
                aspectRatio: aspectRatioFromDimensions(frame.width, frame.height),
                images: [{ dataUrl: taskImageB64 }]
            }, {
                anchorElementId: element.id,
                anchorPosition: {
                    x: frame.position.x + frame.width / 2 + 24,
                    y: frame.position.y - frame.height / 2,
                },
            });

            const updatedElement: ImageElement = { ...element, src: result.dataUrl, position: { ...frame.position }, width: frame.width, height: frame.height };
            setElements(prev => prev.map(el => el.id === element.id ? updatedElement : el));
        } catch (error) {
            console.error("Error during outpainting:", error);
        } finally {
            setOutpaintingState(null);
        }
    }, [outpaintingState, runCodexImageGeneration, setElements]);

    const handleAutoPromptGenerate = useCallback(async (state: OutpaintingState): Promise<string> => {
        const { element, frame } = state;

        const taskCanvas = document.createElement('canvas');
        taskCanvas.width = Math.ceil(frame.width);
        taskCanvas.height = Math.ceil(frame.height);
        const ctx = taskCanvas.getContext('2d');
        if (!ctx) throw new Error('Could not create canvas context');

        const originalImage = new Image();
        originalImage.src = element.src;
        await new Promise<void>((resolve, reject) => {
            originalImage.onload = () => resolve();
            originalImage.onerror = reject;
        });

        const drawX = (frame.width / 2) + (element.position.x - frame.position.x) - (element.width / 2);
        const drawY = (frame.height / 2) + (element.position.y - frame.position.y) - (element.height / 2);
        ctx.drawImage(originalImage, drawX, drawY, element.width, element.height);

        const taskImageB64 = taskCanvas.toDataURL('image/png');
        return getCodexImageBridge().autoOutpaintPrompt({
            jobId: createJobId('auto-outpaint'),
            image: taskImageB64,
            prompt: 'Generate a concise, direct prompt for filling the transparent or empty expansion area.'
        });
    }, []);


  const addArrow = useCallback((position?: Point) => {
    const start = position || getRandomPosition();
    const end = { x: start.x + 150, y: start.y };

    const dx = end.x - start.x;
    const dy = end.y - start.y;

    const width = Math.sqrt(dx * dx + dy * dy);
    const rotation = Math.atan2(dy, dx) * (180 / Math.PI);
    const centerPosition = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

    addElement({
      type: 'arrow',
      start,
      end,
      position: centerPosition,
      width,
      height: 30,
      rotation,
      color: 'text-red-500',
    });
  }, [addElement]);
  
  const triggerImageUpload = (position?: Point) => {
    lastImagePosition.current = position || null;
    imageInputRef.current?.click();
  };

  const getCenterOfViewport = useCallback((): Point => {
    if (canvasApiRef.current) {
        const screenCenter: Point = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
        };
        return canvasApiRef.current.screenToWorld(screenCenter);
    }
    return getRandomPosition();
  }, []);

  const addImagesToCanvas = useCallback((files: File[], basePosition: Point) => {
    const imagePromises = files.map((file, index) => {
      return new Promise<Omit<ImageElement, 'id' | 'zIndex'> | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const src = e.target?.result as string;
          if (!src) return resolve(null);

          const img = new Image();
          img.onload = () => {
            const MAX_DIMENSION = 300;
            let { width, height } = img;
            if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
              if (width > height) {
                height = (height / width) * MAX_DIMENSION;
                width = MAX_DIMENSION;
              } else {
                width = (width / height) * MAX_DIMENSION;
                height = MAX_DIMENSION;
              }
            }
            const position = { x: basePosition.x + index * 20, y: basePosition.y + index * 20 };
            resolve({ type: 'image', position, src, width, height, rotation: 0 });
          };
          img.onerror = () => resolve(null);
          img.src = src;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(imagePromises).then(results => {
      const newElements = results.filter((el): el is Omit<ImageElement, 'id' | 'zIndex'> => el !== null);
      if (newElements.length > 0) {
        setElements(prev => [
          ...prev,
          ...newElements.map(el => ({
            ...el,
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            zIndex: zIndexCounter.current++,
          } as CanvasElement))
        ]);
      }
    });
  }, [setElements]);

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const position = lastImagePosition.current || getCenterOfViewport();
    addImagesToCanvas(Array.from(files), position);

    if (imageInputRef.current) {
        imageInputRef.current.value = "";
    }
  }, [addImagesToCanvas, getCenterOfViewport]);
  
  const handleGenerate = useCallback(async (selectedElements: CanvasElement[]) => {
    const imageElements = selectedElements.filter(el => el.type === 'image' || el.type === 'drawing') as (ImageElement | DrawingElement)[];
    const noteElements = selectedElements.filter(el => el.type === 'note') as NoteElement[];

    if (imageElements.length === 0 && noteElements.length === 0) {
        alert("請至少選取一張圖片、一個繪圖或一張便條，作為生成參考。");
        return;
    }

    try {
      const instructions = noteElements.map(note => note.content).join(' \n');
      let finalInstructions = instructions;
      if (imageStyle && imageStyle !== 'Default') {
          finalInstructions = instructions ? `${instructions}, ${imageStyle} Style` : `${imageStyle} Style`;
      }

      const promptText = imageElements.length > 0
        ? (finalInstructions || "Creatively reimagine and enhance the image(s).")
        : `Generate a completely new image based on this description: "${finalInstructions}"`;
      const result = await runCodexImageGeneration({
        mode: imageElements.length > 0 ? 'edit' : 'generate',
        prompt: promptText,
        style: imageStyle,
        aspectRatio: imageAspectRatio,
        images: imageElements.filter(el => el.src).map(el => ({ dataUrl: el.src }))
      }, getGenerationAnchor(selectedElements));
      console.info("Codex image generated:", result.filePath);

    } catch (error) {
      console.error("Error generating image:", error);
    }
  }, [imageStyle, imageAspectRatio, runCodexImageGeneration]);


  const handleSelectElement = useCallback((id: string | null, shiftKey: boolean) => {
    if (contextMenu) setContextMenu(null);

    if (id === null) {
      if (!shiftKey) setSelectedElementIds([]);
      return;
    }
    
    setSelectedElementIds(prevIds => {
      if (shiftKey) {
        return prevIds.includes(id) ? prevIds.filter(prevId => prevId !== id) : [...prevIds, id];
      } else {
        return prevIds.includes(id) ? prevIds : [id];
      }
    });
  }, [contextMenu]);

  const handleMarqueeSelect = useCallback((ids: string[], shiftKey: boolean) => {
    setSelectedElementIds(prevIds => {
      if (shiftKey) {
        const newIds = ids.filter(id => !prevIds.includes(id));
        return [...prevIds, ...newIds];
      } else {
        return ids;
      }
    });
  }, []);


  const updateElements = useCallback((updatedElement: CanvasElement, dragDelta?: Point) => {
    setElements(prevElements => {
      if (dragDelta && selectedElementIds.length > 1 && selectedElementIds.includes(updatedElement.id)) {
        const selectedSet = new Set(selectedElementIds);
        return prevElements.map(el => {
          if (el.id === updatedElement.id) {
            return updatedElement;
          }
          if (selectedSet.has(el.id)) {
             return { ...el, position: { x: el.position.x + dragDelta.x, y: el.position.y + dragDelta.y } };
          }
          return el;
        });
      } else {
        return prevElements.map(el => (el.id === updatedElement.id ? updatedElement : el));
      }
    }, { addToHistory: false });
  }, [selectedElementIds, setElements]);

  const handleInteractionEnd = useCallback(() => {
    setElements(currentElements => currentElements, { addToHistory: true });
  }, [setElements]);

  const deleteElement = useCallback(() => {
    if (selectedElementIds.length === 0) return;
    const selectedSet = new Set(selectedElementIds);
    setElements(prev => prev.filter(el => !selectedSet.has(el.id)));
    setSelectedElementIds([]);
  }, [selectedElementIds, setElements]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If a modal is open, let it handle its own keyboard shortcuts.
      if (editingDrawing || editingImage || outpaintingState) {
        return;
      }

      const target = e.target as HTMLElement;
      const isEditingText = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditingText) {
        e.preventDefault();
        deleteElement();
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      if (isCtrlOrCmd && !isEditingText) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [deleteElement, undo, redo, editingDrawing, editingImage, outpaintingState]);
  
  useEffect(() => {
    const preventDefaults = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDragEnter = (e: DragEvent) => {
        preventDefaults(e);
        dragCounter.current++;
        if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
            if (Array.from(e.dataTransfer.items).some(item => item.kind === 'file' && item.type.startsWith('image/'))) {
                 setIsDraggingOver(true);
            }
        }
    };
    
    const handleDragLeave = (e: DragEvent) => {
        preventDefaults(e);
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDraggingOver(false);
        }
    };
    
    const handleDrop = (e: DragEvent) => {
        preventDefaults(e);
        dragCounter.current = 0;
        setIsDraggingOver(false);

        const files = e.dataTransfer?.files;
        if (files && files.length > 0 && canvasApiRef.current) {
            const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));

            if (imageFiles.length > 0) {
                const dropPoint = { x: e.clientX, y: e.clientY };
                const worldPoint = canvasApiRef.current.screenToWorld(dropPoint);
                addImagesToCanvas(imageFiles, worldPoint);
            }
        }
    };
    
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', preventDefaults);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
        window.removeEventListener('dragenter', handleDragEnter);
        window.removeEventListener('dragover', preventDefaults);
        window.removeEventListener('dragleave', handleDragLeave);
        window.removeEventListener('drop', handleDrop);
    };
  }, [addImagesToCanvas]);

  const bringToFront = useCallback(() => {
    if (selectedElementIds.length === 0) return;
    const maxZ = Math.max(...elements.map(el => el.zIndex), 0);
    const selectedSet = new Set(selectedElementIds);
    setElements(prev => prev.map(el => selectedSet.has(el.id) ? { ...el, zIndex: maxZ + 1 } : el));
    zIndexCounter.current = maxZ + 2;
  }, [selectedElementIds, elements, setElements]);

  const sendToBack = useCallback(() => {
    if (selectedElementIds.length === 0) return;
    const minZ = Math.min(...elements.map(el => el.zIndex), 0);
    const selectedSet = new Set(selectedElementIds);
    setElements(prev => prev.map(el => selectedSet.has(el.id) ? { ...el, zIndex: minZ - 1 } : el));
  }, [selectedElementIds, elements, setElements]);

  const getResetViewCallback = useCallback((callback: () => void) => {
    setResetView(() => callback);
  }, []);

  const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
  const canChangeColor = selectedElements.some(el => el.type === 'note' || el.type === 'arrow');
  const showImageEditInMenu = selectedElements.length === 1 && selectedElements[0].type === 'image';

  const handleColorChange = (newColor: string) => {
      if (!canChangeColor) return;
      const selectedSet = new Set(selectedElementIds);
      setElements(prev => prev.map(el => {
          if (selectedSet.has(el.id)) {
              if (el.type === 'note') return { ...el, color: newColor };
              if (el.type === 'arrow') {
                  const newTextColor = newColor.replace('bg-', 'text-');
                  return { ...el, color: newTextColor };
              }
          }
          return el;
      }));
  };
  
  const downloadGeneratedImage = (imageUrl: string) => {
      if (!imageUrl) return;
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `generated-canvas-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const addGeneratedImageToCanvas = useCallback((imageUrl: string, anchorPoint?: Point) => {
    if (!imageUrl) return;

    const src = imageUrl;
    const img = new Image();
    img.onload = () => {
      const MAX_DIMENSION = 400;
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = (height / width) * MAX_DIMENSION;
          width = MAX_DIMENSION;
        } else {
          width = (width / height) * MAX_DIMENSION;
          height = MAX_DIMENSION;
        }
      }
      addElement({
        type: 'image',
        position: anchorPoint || getCenterOfViewport(),
        src,
        width,
        height,
        rotation: 0,
      });
    };
    img.src = src;
  }, [addElement, getCenterOfViewport]);

  const dismissGenerationResult = useCallback((jobId: string) => {
    setGenerationJobs(prevJobs => prevJobs.filter(job => job.jobId !== jobId));
  }, []);

  const downloadImage = useCallback((elementId: string) => {
    if (!elementId) return;
    const element = elements.find(el => el.id === elementId);
    if (element && (element.type === 'image' || element.type === 'drawing') && element.src) {
        const link = document.createElement('a');
        link.href = element.src;
        const mimeType = element.src.match(/data:(.*);base64/)?.[1] || 'image/png';
        const extension = mimeType.split('/')[1] || 'png';
        link.download = `canvas-image-${Date.now()}.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  }, [elements]);

  const handleContextMenu = useCallback((e: React.MouseEvent, worldPoint: Point, elementId: string | null) => {
      e.preventDefault();
      
      if (elementId && !selectedElementIds.includes(elementId)) {
        handleSelectElement(elementId, false);
      }
      
      setContextMenu({ x: e.clientX, y: e.clientY, worldPoint, elementId });
  }, [selectedElementIds, handleSelectElement]);
  
  const handleExportCanvas = () => {
    const dataStr = JSON.stringify(elements, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.download = 'codex-圖像畫布-匯出.json';
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportCanvas = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const result = e.target?.result;
            if (typeof result !== 'string') {
                throw new Error("無法以文字讀取檔案。");
            }
            const importedElements = JSON.parse(result) as CanvasElement[];
            
            // Basic validation
            if (!Array.isArray(importedElements) || (importedElements.length > 0 && !importedElements[0].id)) {
                throw new Error("檔案格式無效。");
            }
            
            setElements(importedElements);
            const maxZ = Math.max(0, ...importedElements.map(el => el.zIndex || 0));
            zIndexCounter.current = maxZ + 1;

            alert('畫布已成功匯入。');
        } catch (error) {
            console.error("Error importing canvas:", error);
            alert("匯入畫布失敗。檔案可能已損毀，或格式不正確。");
        }
    };
    reader.onerror = () => {
        alert("讀取檔案時發生錯誤。");
    };
    reader.readAsText(file);

    if (event.target) {
        event.target.value = "";
    }
  };

  const contextMenuElement = contextMenu?.elementId ? elements.find(el => el.id === contextMenu.elementId) : null;
  const codexCliStatusView = getCodexCliStatusView({
    hasBridge: Boolean(window.codexImage),
    health: codexCliHealth,
    error: codexCliError,
    isChecking: isCheckingCodexCli,
    isLaunching: isLaunchingCodexCliSetup,
    setupMessage: codexCliSetupMessage,
  });
  const isCodexCliStatusDisabled = !window.codexImage || isCheckingCodexCli || isLaunchingCodexCliSetup;

  return (
    <main className="app-shell relative w-screen h-screen font-sans" onClick={() => setContextMenu(null)}>
      <div 
        className={`sketch-panel tool-panel absolute top-4 left-4 z-20 flex flex-col gap-4 p-4 transition-transform duration-300 ease-in-out ${isMenuCollapsed ? '-translate-x-full' : 'translate-x-0'}`}
      >
        <div>
          <span className="scribble-tag">image sketchbook</span>
          <h1 className="panel-title text-xl font-bold">無限畫布</h1>
          <p className="panel-copy mt-1 text-sm">選取物件後即可調整或生成。</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
            <button onClick={() => addNote()} className="btn-sketch btn-yellow col-span-1 px-3 py-2 text-sm">新增便條</button>
            <button onClick={() => addArrow()} className="btn-sketch btn-green col-span-1 px-3 py-2 text-sm">新增箭頭</button>
            <button onClick={() => addDrawing()} className="btn-sketch btn-purple col-span-2 px-3 py-2 text-sm">新增繪圖</button>
            <label className="btn-sketch btn-orange col-span-2 cursor-pointer px-3 py-2 text-center text-sm">
                新增圖片
                <input type="file" accept="image/*" ref={imageInputRef} className="hidden" onChange={handleImageUpload} multiple />
            </label>
        </div>

        {showImageEditInMenu && (
            <div className="sketch-section flex flex-col gap-2">
                <h2 className="section-title mb-1">圖片編輯</h2>
                <button
                    onClick={() => handleStartImageEdit(selectedElementIds[0])}
                    className="btn-sketch btn-blue w-full px-3 py-2 text-sm"
                >
                    移除或編輯物件
                </button>
                <button
                    onClick={() => handleStartOutpainting(selectedElementIds[0])}
                    className="btn-sketch btn-green w-full px-3 py-2 text-sm"
                >
                    擴展圖片
                </button>
            </div>
        )}

        {selectedElementIds.length > 0 && canChangeColor && (
            <div className="sketch-section">
                <h2 className="section-title mb-2">顏色</h2>
                <div className="grid grid-cols-8 gap-1.5">
                    {COLORS.map(color => {
                        const isNoteSelected = selectedElements.some(el => el.type === 'note');
                        const colorClass = isNoteSelected ? color.bg : color.text;
                        const finalColor = isNoteSelected ? color.bg : color.bg;
                        return (
                            <button
                                key={color.name}
                                onClick={() => handleColorChange(finalColor)}
                                className={`color-dot h-6 w-6 ${color.bg}`}
                                aria-label={`改成${color.name}`}
                            />
                        )
                    })}
                </div>
            </div>
        )}

         <div className="sketch-section flex flex-col gap-2">
            <h2 className="section-title">控制</h2>
             <div className="grid grid-cols-2 gap-2">
                <button onClick={undo} disabled={!canUndo} className="btn-sketch btn-neutral px-3 py-2 text-sm">復原</button>
                <button onClick={redo} disabled={!canRedo} className="btn-sketch btn-neutral px-3 py-2 text-sm">重做</button>
                 <button onClick={handleExportCanvas} className="btn-sketch btn-green px-3 py-2 text-sm">匯出</button>
                <label className="btn-sketch btn-green cursor-pointer px-3 py-2 text-center text-sm">
                    匯入
                    <input type="file" accept=".json" ref={importInputRef} className="hidden" onChange={handleImportCanvas} />
                </label>
            </div>
             <button onClick={bringToFront} disabled={selectedElementIds.length === 0} className="btn-sketch btn-neutral px-3 py-2 text-sm">↑ 移到最上層</button>
             <button onClick={sendToBack} disabled={selectedElementIds.length === 0} className="btn-sketch btn-neutral px-3 py-2 text-sm">↓ 移到最下層</button>
             <button onClick={deleteElement} disabled={selectedElementIds.length === 0} className="btn-sketch btn-red px-3 py-2 text-sm">刪除</button>
            <button onClick={resetView} className="btn-sketch btn-neutral px-3 py-2 text-sm">重設視圖</button>
        </div>
      </div>
      
      <button
        onClick={() => setIsMenuCollapsed(!isMenuCollapsed)}
        className="btn-icon-sketch absolute top-4 z-20 p-2 transition-all duration-300 ease-in-out"
        style={{ left: isMenuCollapsed ? '1rem' : 'calc(1rem + 17rem + 0.75rem)' }}
        aria-label={isMenuCollapsed ? '展開選單' : '收合選單'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {isMenuCollapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            )}
        </svg>
      </button>

      <InfiniteCanvas 
        ref={canvasApiRef}
        elements={elements} 
        selectedElementIds={selectedElementIds}
        onSelectElement={handleSelectElement}
        onMarqueeSelect={handleMarqueeSelect}
        onUpdateElement={updateElements}
        onInteractionEnd={handleInteractionEnd}
        setResetViewCallback={getResetViewCallback} 
        onGenerate={handleGenerate}
        onContextMenu={handleContextMenu}
        onEditDrawing={handleEditDrawing}
        imageStyle={imageStyle}
        onSetImageStyle={setImageStyle}
        imageAspectRatio={imageAspectRatio}
        onSetImageAspectRatio={setImageAspectRatio}
        outpaintingState={outpaintingState}
        onUpdateOutpaintingFrame={handleUpdateOutpaintingFrame}
        onCancelOutpainting={handleCancelOutpainting}
        onOutpaintingGenerate={handleOutpaintingGenerate}
        onAutoPromptGenerate={handleAutoPromptGenerate}
        generationJobs={generationJobs}
        onCancelGeneration={handleCancelGeneration}
        onAddGeneratedImage={addGeneratedImageToCanvas}
        onDownloadGeneratedImage={downloadGeneratedImage}
        onDismissGenerationResult={dismissGenerationResult}
      />
      
      {editingDrawing && (
        <DrawingModal 
          element={editingDrawing}
          onSave={handleSaveDrawing}
          onClose={() => setEditingDrawing(null)}
        />
      )}

      {editingImage && (
        <ImageEditModal
          element={editingImage}
          onSave={handleSaveImageEdit}
          onClose={() => setEditingImage(null)}
        />
      )}

      {contextMenu && (
        <ContextMenu
          menuData={contextMenu}
          onClose={() => setContextMenu(null)}
          actions={{
            addNote,
            addArrow,
            addDrawing,
            editDrawing: handleEditDrawing,
            startImageEdit: handleStartImageEdit,
            startOutpainting: handleStartOutpainting,
            addImage: triggerImageUpload,
            deleteElement,
            bringToFront,
            sendToBack,
            changeColor: handleColorChange,
            downloadImage,
          }}
          canChangeColor={canChangeColor}
          elementType={contextMenuElement?.type || null}
        />
      )}

      {isDraggingOver && (
        <div className="drag-overlay pointer-events-none absolute inset-0 z-[100] flex items-center justify-center">
          <div className="drag-card border-4 border-dashed p-8 text-2xl font-bold">
            放開滑鼠加入圖片
          </div>
        </div>
      )}

      <CodexCliStatusBadge
        view={codexCliStatusView}
        disabled={isCodexCliStatusDisabled}
        onClick={handleCodexCliStatusClick}
      />
    </main>
  );
};

export default App;
