
import React, { useState, useRef, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import type { Point, CanvasElement, ImageElement } from '../types';
import type { GenerationJob, OutpaintingState } from '../App';
import { TransformableElement } from './TransformableElement';

interface OutpaintingFrameProps {
  outpaintingState: OutpaintingState;
  zoom: number;
  onUpdateFrame: (newFrame: { position: Point; width: number; height: number; }) => void;
}

const OutpaintingFrame: React.FC<OutpaintingFrameProps> = ({ outpaintingState, zoom, onUpdateFrame }) => {
    const interactionRef = useRef<{
        type: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
        startFrame: OutpaintingState['frame'];
        startPoint: Point;
    } | null>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent, type: NonNullable<typeof interactionRef.current>['type']) => {
        e.stopPropagation();
        interactionRef.current = {
            type,
            startFrame: outpaintingState.frame,
            startPoint: { x: e.clientX, y: e.clientY },
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, [outpaintingState.frame]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!interactionRef.current) return;
        const { type, startFrame, startPoint } = interactionRef.current;
        const dx = (e.clientX - startPoint.x) / zoom;
        const dy = (e.clientY - startPoint.y) / zoom;
        
        let { position, width, height } = startFrame;
        let newPos = { ...position };
        let newWidth = width;
        let newHeight = height;

        if (type.includes('e')) {
            newWidth = Math.max(outpaintingState.element.width, width + dx);
        }
        if (type.includes('w')) {
            newWidth = Math.max(outpaintingState.element.width, width - dx);
        }
        if (type.includes('s')) {
            newHeight = Math.max(outpaintingState.element.height, height + dy);
        }
        if (type.includes('n')) {
            newHeight = Math.max(outpaintingState.element.height, height - dy);
        }

        const dw = newWidth - width;
        const dh = newHeight - height;
        
        if (type.includes('e')) newPos.x += dw/2;
        if (type.includes('w')) newPos.x -= dw/2;
        if (type.includes('s')) newPos.y += dh/2;
        if (type.includes('n')) newPos.y -= dh/2;

        onUpdateFrame({ position: newPos, width: newWidth, height: newHeight });

    }, [zoom, onUpdateFrame, outpaintingState.element]);

    const handleMouseUp = useCallback(() => {
        interactionRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }, []);

    const frameStyle: React.CSSProperties = {
      position: 'absolute',
      left: outpaintingState.frame.position.x,
      top: outpaintingState.frame.position.y,
      width: outpaintingState.frame.width,
      height: outpaintingState.frame.height,
      transform: `translate(-50%, -50%)`,
    };

    return (
        <>
            <div style={frameStyle} className="outpaint-frame pointer-events-none"></div>
            
            {/* Handles */}
            <div style={frameStyle} className="pointer-events-auto">
                {['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(dir => (
                    <div
                        key={dir}
                        onMouseDown={e => handleMouseDown(e, dir as any)}
                        className={`transform-handle absolute h-4 w-4
                            ${dir.includes('n') ? 'top-0 -translate-y-1/2' : ''}
                            ${dir.includes('s') ? 'bottom-0 translate-y-1/2' : ''}
                            ${dir.includes('e') ? 'right-0 translate-x-1/2' : ''}
                            ${dir.includes('w') ? 'left-0 -translate-x-1/2' : ''}
                            ${!dir.includes('n') && !dir.includes('s') ? 'top-1/2 -translate-y-1/2' : ''}
                            ${!dir.includes('e') && !dir.includes('w') ? 'left-1/2 -translate-x-1/2' : ''}
                            cursor-${dir}-resize`}
                    />
                ))}
            </div>
        </>
    );
};


interface InfiniteCanvasProps {
  elements: CanvasElement[];
  selectedElementIds: string[];
  onSelectElement: (id: string | null, shiftKey: boolean) => void;
  onMarqueeSelect: (ids: string[], shiftKey: boolean) => void;
  onUpdateElement: (element: CanvasElement, dragDelta?: Point) => void;
  onInteractionEnd: () => void;
  setResetViewCallback: (callback: () => void) => void;
  onGenerate: (selectedElements: CanvasElement[]) => void;
  onContextMenu: (e: React.MouseEvent, worldPoint: Point, elementId: string | null) => void;
  onEditDrawing: (elementId: string) => void;
  imageStyle: string;
  onSetImageStyle: (style: string) => void;
  imageAspectRatio: string;
  onSetImageAspectRatio: (ratio: string) => void;
  outpaintingState: OutpaintingState | null;
  onUpdateOutpaintingFrame: (newFrame: { position: Point; width: number; height: number; }) => void;
  onCancelOutpainting: () => void;
  onOutpaintingGenerate: (prompt: string) => void;
  onAutoPromptGenerate: (state: OutpaintingState) => Promise<string>;
  generationJobs: GenerationJob[];
  onCancelGeneration: (jobId: string) => void;
  onAddGeneratedImage: (imageUrl: string, anchorPoint?: Point) => void;
  onDownloadGeneratedImage: (imageUrl: string) => void;
  onDismissGenerationResult: (jobId: string) => void;
}

interface MarqueeRect {
  start: Point;
  end: Point;
}

interface BoundingBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
}

export interface CanvasApi {
  screenToWorld: (screenPoint: Point) => Point;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

export const InfiniteCanvas = forwardRef<CanvasApi, InfiniteCanvasProps>(({ 
  elements, 
  selectedElementIds, 
  onSelectElement,
  onMarqueeSelect, 
  onUpdateElement, 
  onInteractionEnd,
  setResetViewCallback,
  onGenerate,
  onContextMenu,
  onEditDrawing,
  imageStyle,
  onSetImageStyle,
  imageAspectRatio,
  onSetImageAspectRatio,
  outpaintingState,
  onUpdateOutpaintingFrame,
  onCancelOutpainting,
  onOutpaintingGenerate,
  onAutoPromptGenerate,
  generationJobs,
  onCancelGeneration,
  onAddGeneratedImage,
  onDownloadGeneratedImage,
  onDismissGenerationResult,
}, ref) => {
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState<Point>({ x: 0, y: 0 });
  const [isSpacebarPressed, setIsSpacebarPressed] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [outpaintingPrompt, setOutpaintingPrompt] = useState('');
  const [isAutoPrompting, setIsAutoPrompting] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  
  const screenToWorld = useCallback((screenPoint: Point): Point => {
    return {
      x: (screenPoint.x - pan.x) / zoom,
      y: (screenPoint.y - pan.y) / zoom,
    };
  }, [pan, zoom]);

  useImperativeHandle(ref, () => ({
    screenToWorld,
  }), [screenToWorld]);

  useEffect(() => {
    if (outpaintingState) {
        setOutpaintingPrompt('');
    }
  }, [outpaintingState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable) {
            return; // Don't prevent default for text inputs
        }
        e.preventDefault();
        setIsSpacebarPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacebarPressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.transform-handle, .element-body, .generate-controls, .generation-job-panel')) return;

    if (isSpacebarPressed || outpaintingState) {
      if (isSpacebarPressed) {
        e.preventDefault();
        setIsPanning(true);
        setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    } else {
      onSelectElement(null, e.shiftKey);
      setMarqueeRect({ start: { x: e.clientX, y: e.clientY }, end: { x: e.clientX, y: e.clientY } });
    }
  }, [isSpacebarPressed, pan, onSelectElement, outpaintingState]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    setIsPanning(false);
    if (marqueeRect) {
        const startWorld = screenToWorld(marqueeRect.start);
        const endWorld = screenToWorld(marqueeRect.end);

        const selectionBox = {
            minX: Math.min(startWorld.x, endWorld.x),
            maxX: Math.max(startWorld.x, endWorld.x),
            minY: Math.min(startWorld.y, endWorld.y),
            maxY: Math.max(startWorld.y, endWorld.y),
        };

        const selectedIds = elements.filter(el => 
            el.position.x >= selectionBox.minX &&
            el.position.x <= selectionBox.maxX &&
            el.position.y >= selectionBox.minY &&
            el.position.y <= selectionBox.maxY
        ).map(el => el.id);

        if (selectedIds.length > 0) {
            onMarqueeSelect(selectedIds, e.shiftKey);
        }
        setMarqueeRect(null);
    }
  }, [marqueeRect, screenToWorld, elements, onMarqueeSelect]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    } else if (marqueeRect) {
      setMarqueeRect(prev => prev ? { ...prev, end: { x: e.clientX, y: e.clientY } } : null);
    }
  }, [isPanning, startPan, marqueeRect]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;

    const zoomFactor = 1 - e.deltaY * 0.001;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * zoomFactor));

    const newPanX = mouseX - worldX * newZoom;
    const newPanY = mouseY - worldY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [pan, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  const resetView = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      setPan({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });
    } else {
      setPan({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    }
    setZoom(1);
  }, []);
  
  useEffect(() => {
    resetView();
  }, [resetView]);

  useEffect(() => {
    setResetViewCallback(resetView);
  }, [resetView, setResetViewCallback]);
  
  const getRotatedCorners = (el: CanvasElement): Point[] => {
    const { x, y } = el.position;
    const { width, height, rotation } = el;
    const rad = rotation * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const halfW = width / 2;
    const halfH = height / 2;

    const corners = [
        { x: -halfW, y: -halfH }, { x: halfW, y: -halfH },
        { x: halfW, y: halfH },   { x: -halfW, y: halfH }
    ];

    return corners.map(corner => ({
        x: x + corner.x * cos - corner.y * sin,
        y: y + corner.x * sin + corner.y * cos,
    }));
  };
  
  const selectionBbox = useMemo((): BoundingBox | null => {
      const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
      if (selectedElements.length === 0) return null;

      const allCorners = selectedElements.flatMap(getRotatedCorners);

      const minX = Math.min(...allCorners.map(c => c.x));
      const minY = Math.min(...allCorners.map(c => c.y));
      const maxX = Math.max(...allCorners.map(c => c.x));
      const maxY = Math.max(...allCorners.map(c => c.y));
      
      return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [elements, selectedElementIds]);

  const getGenerationPanelPosition = useCallback((job: GenerationJob, index: number): Point => {
      const anchorElement = job.anchorElementId
        ? elements.find(element => element.id === job.anchorElementId)
        : null;
      const worldPoint = anchorElement
        ? {
            x: anchorElement.position.x + anchorElement.width / 2 + 14,
            y: anchorElement.position.y - anchorElement.height / 2,
          }
        : job.anchorPosition;

      return {
        x: worldPoint.x * zoom + pan.x,
        y: worldPoint.y * zoom + pan.y + index * 12,
      };
  }, [elements, pan.x, pan.y, zoom]);

  const getGenerationInsertPoint = useCallback((job: GenerationJob): Point => {
      const anchorElement = job.anchorElementId
        ? elements.find(element => element.id === job.anchorElementId)
        : null;

      if (anchorElement) {
        return {
          x: anchorElement.position.x + anchorElement.width / 2 + 120,
          y: anchorElement.position.y + anchorElement.height / 2 + 80,
        };
      }

      return {
        x: job.anchorPosition.x + 120,
        y: job.anchorPosition.y + 80,
      };
  }, [elements]);

  const selectedHasRunningGeneration = generationJobs.some(job =>
    job.isRunning && job.anchorElementId !== null && selectedElementIds.includes(job.anchorElementId)
  );
   
  const handleGenerateClick = useCallback(() => {
    const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
    if (selectedElements.length > 0) {
      onGenerate(selectedElements);
    }
  }, [elements, selectedElementIds, onGenerate]);

  const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  let cursorClass = 'cursor-default';
  if (isSpacebarPressed) {
    cursorClass = isPanning ? 'cursor-grabbing' : 'cursor-grab';
  } else if (outpaintingState) {
    cursorClass = 'cursor-auto';
  }
  
  const handleCanvasContextMenu = (e: React.MouseEvent) => {
    const worldPoint = screenToWorld({x: e.clientX, y: e.clientY});
    onContextMenu(e, worldPoint, null);
  }

  const IMAGE_STYLES = [
    { value: 'Default', label: '預設' },
    { value: '8-Bit', label: '8 位元像素' },
    { value: 'Botanical Art', label: '植物藝術' },
    { value: 'Comic Book', label: '美式漫畫' },
    { value: 'Cubism', label: '立體派' },
    { value: 'Cyberpunk', label: '賽博龐克' },
    { value: 'Exploded View', label: '爆炸分解圖' },
    { value: 'Glitch Art', label: '故障藝術' },
    { value: 'Isometric', label: '等角視圖' },
    { value: 'Knolling', label: '整齊平鋪' },
    { value: 'Low Poly', label: '低多邊形' },
    { value: 'Mosaic', label: '馬賽克' },
    { value: 'Oil Painting', label: '油畫' },
    { value: 'Pixel Art', label: '像素藝術' },
    { value: 'Playful 3D Art', label: '玩具感 3D' },
    { value: 'Pop Art', label: '普普藝術' },
    { value: 'Photorealism', label: '寫實攝影' },
    { value: 'Surrealism', label: '超現實' },
    { value: 'Vaporwave', label: '蒸氣波' },
    { value: 'Vector Art', label: '向量插畫' },
    { value: 'Watercolor', label: '水彩' },
  ];

  const ASPECT_RATIOS = {
    '橫式': ['21:9', '16:9', '4:3', '3:2', '5:4'],
    '方形': ['1:1'],
    '直式': ['9:16', '3:4', '2:3', '4:5'],
  };
  
  const handleOutpaintingGenerateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOutpaintingGenerate(outpaintingPrompt);
  };

  const handleOutpaintingCancelClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onCancelOutpainting();
  };
  
    const handleAutoPromptClick = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!outpaintingState) return;
      setIsAutoPrompting(true);
      try {
          const prompt = await onAutoPromptGenerate(outpaintingState);
          setOutpaintingPrompt(prompt);
      } catch (error) {
          console.error("Error auto-generating prompt:", error);
          alert("自動產生提示詞失敗，請查看主控台。");
      } finally {
          setIsAutoPrompting(false);
      }
  };

  return (
    <div
      ref={canvasRef}
      className={`paper-canvas relative h-full w-full overflow-hidden
        ${cursorClass}`}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onMouseMove={handleMouseMove}
      onContextMenu={handleCanvasContextMenu}
    >
      <div
        className="transform-gpu select-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {sortedElements.map((el) => (
          <TransformableElement
            key={el.id}
            element={el}
            zoom={zoom}
            isSelected={selectedElementIds.includes(el.id)}
            isOutpainting={outpaintingState?.element.id === el.id}
            onSelect={onSelectElement}
            onUpdate={onUpdateElement}
            onInteractionEnd={onInteractionEnd}
            onContextMenu={(e) => {
              const worldPoint = screenToWorld({x: e.clientX, y: e.clientY});
              onContextMenu(e, worldPoint, el.id);
            }}
            onEditDrawing={onEditDrawing}
          />
        ))}
        {selectionBbox && (
             <div className="selection-sketch pointer-events-none absolute"
                style={{
                    left: selectionBbox.minX,
                    top: selectionBbox.minY,
                    width: selectionBbox.width,
                    height: selectionBbox.height
                }}
             />
        )}
        {outpaintingState && (
            <OutpaintingFrame
                outpaintingState={outpaintingState}
                zoom={zoom}
                onUpdateFrame={onUpdateOutpaintingFrame}
            />
        )}
      </div>

      {outpaintingState && (
        <div
          style={{
            position: 'absolute',
            left: (outpaintingState.frame.position.x * zoom) + pan.x,
            top: (outpaintingState.frame.position.y + outpaintingState.frame.height / 2) * zoom + pan.y + 10,
            transform: 'translateX(-50%)',
            zIndex: 10,
          }}
          className="float-panel flex w-64 flex-col gap-2 p-2"
          onMouseDown={e => e.stopPropagation()}
        >
          <h3 className="section-title text-sm">擴展圖片</h3>
          <div className="relative w-full">
            <input
                type="text"
                value={outpaintingPrompt}
                onChange={(e) => setOutpaintingPrompt(e.target.value)}
                placeholder="描述擴展內容，或自動產生提示詞"
                className="sketch-input w-full py-2 pl-3 pr-8 text-sm"
            />
            <button
                onClick={handleAutoPromptClick}
                disabled={isAutoPrompting}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-[color:var(--hd-pencil)] transition-colors hover:text-[color:var(--hd-red)] disabled:cursor-wait disabled:opacity-40"
                aria-label="自動產生提示詞"
            >
                {isAutoPrompting ? (
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                )}
            </button>
          </div>
          <div className="flex gap-2">
              <button onClick={handleOutpaintingCancelClick} className="btn-sketch btn-neutral flex-1 px-3 py-1.5 text-sm">取消</button>
              <button onClick={handleOutpaintingGenerateClick} className="btn-sketch btn-green flex-1 whitespace-nowrap px-3 py-1.5 text-sm">生成 ✨</button>
          </div>
        </div>
      )}

      {selectionBbox && !outpaintingState && (
        <div
          className="float-panel generate-controls absolute z-10 flex flex-col gap-2 p-2"
          style={{
              left: (selectionBbox.maxX * zoom + pan.x + 10),
              top: (selectionBbox.minY * zoom + pan.y),
              minWidth: '180px'
          }}
        >
          <select
            value={imageStyle}
            onChange={(e) => onSetImageStyle(e.target.value)}
            className="sketch-select w-full px-3 py-2 text-sm"
          >
            {IMAGE_STYLES.map(style => (
              <option key={style.value} value={style.value}>{style.label}</option>
            ))}
          </select>
          
          <select
            value={imageAspectRatio}
            onChange={(e) => onSetImageAspectRatio(e.target.value)}
            className="sketch-select w-full px-3 py-2 text-sm"
          >
            {Object.entries(ASPECT_RATIOS).map(([group, ratios]) => (
                <optgroup label={group} key={group}>
                    {ratios.map(ratio => (
                        <option key={ratio} value={ratio}>{ratio}</option>
                    ))}
                </optgroup>
            ))}
          </select>

          <button 
            onClick={handleGenerateClick}
            disabled={selectedHasRunningGeneration}
            className="btn-sketch btn-purple w-full px-4 py-2 text-sm disabled:cursor-wait"
          >
              {selectedHasRunningGeneration ? '生成中...' : '生成 ✨'}
          </button>
        </div>
      )}

      {generationJobs.map((job, index) => {
        const panelPosition = getGenerationPanelPosition(job, index);
        const insertPoint = getGenerationInsertPoint(job);
        const resultDataUrl = job.resultDataUrl;

        return (
          <div
            key={job.jobId}
            className="generation-job-panel absolute z-20 w-72 max-w-[calc(100vw-1rem)] p-3"
            style={{
              left: panelPosition.x,
              top: panelPosition.y,
            }}
            onMouseDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            aria-live="polite"
          >
            {job.isRunning && (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <svg className="mt-0.5 h-5 w-5 flex-shrink-0 animate-spin text-[color:var(--hd-purple)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[color:var(--hd-ink)]">正在生成圖片</p>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--hd-pencil)]">{job.status}</p>
                    <p className="mt-1 text-xs text-[color:var(--hd-muted)]">已花費 {job.elapsed} 秒。Codex imagegen 可能需要一點時間。</p>
                  </div>
                </div>
                <button
                  onClick={() => onCancelGeneration(job.jobId)}
                  className="btn-sketch btn-neutral self-start px-3 py-1.5 text-xs"
                >
                  取消
                </button>
              </div>
            )}

            {!job.isRunning && resultDataUrl && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="section-title text-sm">生成完成</p>
                  <button
                    onClick={() => onDismissGenerationResult(job.jobId)}
                    className="text-lg leading-none text-[color:var(--hd-pencil)] hover:text-[color:var(--hd-ink)]"
                    aria-label="關閉生成結果"
                  >
                    &times;
                  </button>
                </div>
                <div className="image-sheet flex max-h-44 items-center justify-center overflow-hidden bg-[color:var(--hd-paper)]">
                  <img src={resultDataUrl} alt="Codex 生成圖片" className="max-h-44 w-full object-contain" draggable="false" />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onAddGeneratedImage(resultDataUrl, insertPoint)}
                    className="btn-sketch btn-green flex-1 px-3 py-1.5 text-xs"
                  >
                    加入畫布
                  </button>
                  <button
                    onClick={() => onDownloadGeneratedImage(resultDataUrl)}
                    className="btn-sketch btn-blue flex-1 px-3 py-1.5 text-xs"
                  >
                    下載
                  </button>
                </div>
              </div>
            )}

            {!job.isRunning && !resultDataUrl && (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm font-semibold text-[color:var(--hd-ink)]">{job.status}</p>
                  {job.error && <p className="mt-1 text-xs leading-5 text-[color:var(--hd-red)]">{job.error}</p>}
                </div>
                <button
                  onClick={() => onDismissGenerationResult(job.jobId)}
                  className="btn-sketch btn-neutral self-start px-3 py-1.5 text-xs"
                >
                  關閉
                </button>
              </div>
            )}
          </div>
        );
      })}

      {marqueeRect && (
        <div 
          className="marquee-sketch pointer-events-none absolute"
          style={{
            left: Math.min(marqueeRect.start.x, marqueeRect.end.x),
            top: Math.min(marqueeRect.start.y, marqueeRect.end.y),
            width: Math.abs(marqueeRect.start.x - marqueeRect.end.x),
            height: Math.abs(marqueeRect.start.y - marqueeRect.end.y)
          }}
        />
      )}
    </div>
  );
});

InfiniteCanvas.displayName = "InfiniteCanvas";
