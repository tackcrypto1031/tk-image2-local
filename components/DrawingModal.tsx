import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { DrawingElement, Point } from '../types';

interface DrawingModalProps {
  element: DrawingElement;
  onSave: (elementId: string, dataUrl: string) => void;
  onClose: () => void;
}

const BRUSH_SIZES = [2, 5, 10, 20, 30];
const COLORS = ['#2d2a26', '#e84a3a', '#d97825', '#d9a91f', '#4fb585', '#4a86e0', '#8b5bb7', '#e8779e'];

// Use a large, fixed-size canvas for a better drawing experience
const CANVAS_INTERNAL_WIDTH = 1200;
const CANVAS_INTERNAL_HEIGHT = 900;


export const DrawingModal: React.FC<DrawingModalProps> = ({ element, onSave, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
  const [color, setColor] = useState('#2d2a26');
  const [brushSize, setBrushSize] = useState(5);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Undo/Redo state
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const saveHistoryState = useCallback(() => {
    const context = contextRef.current;
    if (!context) return;
    const imageData = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
    
    setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        return [...newHistory, imageData];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const undo = useCallback(() => {
    if (canUndo) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        if (contextRef.current && history[newIndex]) {
            contextRef.current.putImageData(history[newIndex], 0, 0);
        }
    }
  }, [canUndo, history, historyIndex]);

  const redo = useCallback(() => {
    if (canRedo) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        if (contextRef.current && history[newIndex]) {
            contextRef.current.putImageData(history[newIndex], 0, 0);
        }
    }
  }, [canRedo, history, historyIndex]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set a fixed internal resolution for the canvas
    canvas.width = CANVAS_INTERNAL_WIDTH;
    canvas.height = CANVAS_INTERNAL_HEIGHT;

    const context = canvas.getContext('2d');
    if (!context) return;
    
    context.lineCap = 'round';
    context.lineJoin = 'round';
    contextRef.current = context;

    const loadAndInitialize = () => {
        context.fillStyle = '#fbf6ee';
        context.fillRect(0, 0, canvas.width, canvas.height);

        if (element.src) {
            const img = new Image();
            img.onload = () => {
                context.drawImage(img, 0, 0, canvas.width, canvas.height);
                saveHistoryState();
            };
            img.src = element.src;
        } else {
            saveHistoryState();
        }
    };
    
    loadAndInitialize();
  }, [element.src]); // eslint-disable-line react-hooks/exhaustive-deps

    // Keyboard shortcuts for undo/redo
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

            if (isCtrlOrCmd && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            } else if (isCtrlOrCmd && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [undo, redo]);


  const getCanvasPoint = useCallback((e: React.MouseEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent) => {
    const point = getCanvasPoint(e);
    const context = contextRef.current;
    if (!point || !context) return;

    context.strokeStyle = color;
    context.lineWidth = brushSize;
    context.globalCompositeOperation = tool === 'pencil' ? 'source-over' : 'destination-out';
    context.beginPath();
    context.moveTo(point.x, point.y);
    setIsDrawing(true);
  }, [tool, color, brushSize, getCanvasPoint]);

  const finishDrawing = useCallback(() => {
    if (isDrawing) {
      contextRef.current?.closePath();
      setIsDrawing(false);
      saveHistoryState();
    }
  }, [isDrawing, saveHistoryState]);

  const draw = useCallback((e: React.MouseEvent) => {
    if (!isDrawing) return;
    const point = getCanvasPoint(e);
    const context = contextRef.current;
    if (!point || !context) return;
    
    context.lineTo(point.x, point.y);
    context.stroke();
  }, [isDrawing, getCanvasPoint]);
  
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (canvas && context) {
      context.fillStyle = '#fbf6ee';
      context.fillRect(0, 0, canvas.width, canvas.height);
      saveHistoryState();
    }
  };

  const handleSave = () => {
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      onSave(element.id, dataUrl);
    }
  };
  
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setColor(e.target.value);
  }

  return (
    <div className="modal-scrim absolute inset-0 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="sketch-modal flex h-[95vh] w-full max-w-7xl flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-800">繪圖板</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-2 border-b flex flex-wrap items-center gap-4 bg-gray-100 flex-shrink-0">
            {/* Tools */}
            <div className="flex items-center gap-2">
                <button onClick={() => setTool('pencil')} className={`p-2 ${tool === 'pencil' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 hover:bg-gray-200'}`}>鉛筆</button>
                <button onClick={() => setTool('eraser')} className={`p-2 ${tool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 hover:bg-gray-200'}`}>橡皮擦</button>
            </div>
            {/* Undo/Redo */}
            <div className="flex items-center gap-2 pl-2 border-l border-gray-300">
                <button onClick={undo} disabled={!canUndo} className={`p-2 rounded ${!canUndo ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white text-gray-800 hover:bg-gray-200'}`}>復原</button>
                <button onClick={redo} disabled={!canRedo} className={`p-2 rounded ${!canRedo ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white text-gray-800 hover:bg-gray-200'}`}>重做</button>
            </div>
            {/* Brush Size */}
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">尺寸：</span>
                {BRUSH_SIZES.map(size => (
                    <button key={size} onClick={() => setBrushSize(size)} className={`w-8 h-8 rounded-full flex items-center justify-center ${brushSize === size ? 'ring-2 ring-blue-500' : ''} bg-gray-200`}>
                        <span className="block rounded-full bg-black" style={{ width: size, height: size }}></span>
                    </button>
                ))}
            </div>
            {/* Color */}
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">顏色：</span>
                {COLORS.map(c => (
                     <button key={c} onClick={() => setColor(c)} className={`w-8 h-8 rounded-full border-2 ${color === c ? 'ring-2 ring-blue-500 ring-offset-1' : 'border-gray-300'}`} style={{ backgroundColor: c }} />
                ))}
                <div className="relative">
                    <button onClick={() => setShowColorPicker(!showColorPicker)} className="w-8 h-8 rounded-full border-2 border-gray-300" style={{ backgroundColor: color }} />
                     {showColorPicker && (
                        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-10">
                            <input type="color" value={color} onChange={handleColorChange} className="w-12 h-12 p-0 border-none cursor-pointer" />
                        </div>
                    )}
                </div>
            </div>
             <button onClick={clearCanvas} className="ml-auto p-2 rounded bg-red-500 text-white hover:bg-red-600">清除</button>
        </div>
        
        <div className="flex-grow p-4 bg-gray-200 flex items-center justify-center overflow-auto">
            <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseUp={finishDrawing}
                onMouseLeave={finishDrawing}
                onMouseMove={draw}
                className="bg-white shadow-lg cursor-crosshair max-w-full max-h-full"
            />
        </div>

        <div className="p-4 border-t flex justify-end gap-2 bg-gray-50 rounded-b-lg flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">取消</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">儲存繪圖</button>
        </div>
      </div>
    </div>
  );
};
