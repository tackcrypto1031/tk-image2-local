
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasElement, Point, ArrowElement, NoteElement } from '../types';

interface TransformableElementProps {
  element: CanvasElement;
  isSelected: boolean;
  isOutpainting: boolean;
  zoom: number;
  onSelect: (id: string, shiftKey: boolean) => void;
  onUpdate: (element: CanvasElement, dragDelta?: Point) => void;
  onInteractionEnd: () => void;
  onContextMenu: (e: React.MouseEvent, elementId: string) => void;
  onEditDrawing: (elementId: string) => void;
}

type Interaction = {
  type: 'drag' | 'resize' | 'rotate' | 'resize-arrow-start' | 'resize-arrow-end';
  startPoint: Point;
  startElement: CanvasElement;
  startAngle?: number;
  center?: Point;
} | null;

export const TransformableElement: React.FC<TransformableElementProps> = ({ element, isSelected, isOutpainting, zoom, onSelect, onUpdate, onInteractionEnd, onContextMenu, onEditDrawing }) => {
  const [interaction, setInteraction] = useState<Interaction>(null);
  const [isEditing, setIsEditing] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isSelected) {
      setIsEditing(false);
    }
  }, [isSelected]);

  const handleInteractionStart = useCallback((e: React.MouseEvent, type: Interaction['type']) => {
      if (e.button !== 0 || isOutpainting) return; // Ignore right/middle clicks or if in outpainting mode
      e.stopPropagation();
      onSelect(element.id, e.shiftKey);

      const startPoint = { x: e.clientX, y: e.clientY };
      let interactionDetails: Interaction = { type, startPoint, startElement: element };

      if (type === 'rotate' && elementRef.current) {
          const rect = elementRef.current.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          interactionDetails.center = { x: centerX, y: centerY };
          interactionDetails.startAngle = Math.atan2(startPoint.y - centerY, startPoint.x - centerX);
      }
      
      setInteraction(interactionDetails);

    }, [element, onSelect, isOutpainting]);
    
    const handleInteractionMove = useCallback((e: MouseEvent) => {
        if (!interaction) return;

        const { type, startPoint, startElement } = interaction;
        const dx = (e.clientX - startPoint.x) / zoom;
        const dy = (e.clientY - startPoint.y) / zoom;

        // FIX: Refactored drag logic to be type-safe. The original code caused a type error
        // by attempting to add properties to a variable of a union type (`CanvasElement`)
        // without ensuring the variable was of the correct member type (`ArrowElement`).
        // This updated logic correctly uses type narrowing.
        if (type === 'drag') {
            const newPosition = { x: startElement.position.x + dx, y: startElement.position.y + dy };
            const delta = { x: newPosition.x - element.position.x, y: newPosition.y - element.position.y };
            
            let updatedElement: CanvasElement;

            if (startElement.type === 'arrow') {
                updatedElement = {
                    ...startElement,
                    position: newPosition,
                    start: { x: startElement.start.x + dx, y: startElement.start.y + dy },
                    end: { x: startElement.end.x + dx, y: startElement.end.y + dy },
                };
            } else {
                updatedElement = { ...startElement, position: newPosition };
            }

            onUpdate(updatedElement, delta);
        } else if (type === 'resize') {
            const rad = startElement.rotation * (Math.PI / 180);
            const cos = Math.cos(-rad);
            const sin = Math.sin(-rad);
            const rotDx = dx * cos - dy * sin;
            const rotDy = dx * sin + dy * cos;

            let newWidth: number;
            let newHeight: number;

            if (startElement.type === 'image') {
                const widthChangeRatio = (startElement.width + rotDx) / startElement.width;
                const heightChangeRatio = (startElement.height + rotDy) / startElement.height;
                const avgRatio = (widthChangeRatio + heightChangeRatio) / 2;
                
                const widthRatioToMin = 20 / startElement.width;
                const heightRatioToMin = 20 / startElement.height;
                const minAllowedRatio = Math.max(widthRatioToMin, heightRatioToMin);
                
                const finalRatio = Math.max(avgRatio, minAllowedRatio);

                newWidth = startElement.width * finalRatio;
                newHeight = startElement.height * finalRatio;
            } else {
                newWidth = Math.max(20, startElement.width + rotDx);
                newHeight = Math.max(20, startElement.height + rotDy);
            }
            
            const dw = newWidth - startElement.width;
            const dh = newHeight - startElement.height;
            const posDx = (dw / 2 * Math.cos(rad)) - (dh / 2 * Math.sin(rad));
            const posDy = (dw / 2 * Math.sin(rad)) + (dh / 2 * Math.cos(rad));

            onUpdate({ 
                ...startElement, 
                width: newWidth, 
                height: newHeight,
                position: {
                    x: startElement.position.x + posDx,
                    y: startElement.position.y + posDy
                }
            });
        } else if (type === 'rotate' && interaction.center && interaction.startAngle !== undefined) {
             const { center, startAngle } = interaction;
             const currentAngle = Math.atan2(e.clientY - center.y, e.clientX - center.x);
             const angleDiff = currentAngle - startAngle;
             onUpdate({ ...startElement, rotation: startElement.rotation + angleDiff * (180 / Math.PI) });
        } else if (type === 'resize-arrow-start' || type === 'resize-arrow-end') {
            const arrowElement = startElement as ArrowElement;
            let { start, end } = arrowElement;

            if (type === 'resize-arrow-start') {
                start = { x: arrowElement.start.x + dx, y: arrowElement.start.y + dy };
            } else {
                end = { x: arrowElement.end.x + dx, y: arrowElement.end.y + dy };
            }
            
            const newDx = end.x - start.x;
            const newDy = end.y - start.y;
            
            const newWidth = Math.max(10, Math.sqrt(newDx * newDx + newDy * newDy));
            const newRotation = Math.atan2(newDy, newDx) * (180 / Math.PI);
            const newPosition = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

            onUpdate({
                ...arrowElement,
                start,
                end,
                position: newPosition,
                width: newWidth,
                rotation: newRotation,
            });
        }
    }, [interaction, onUpdate, zoom, element.position.x, element.position.y]);

    const handleInteractionEnd = useCallback(() => {
        if (interaction) {
          onInteractionEnd();
        }
        setInteraction(null);
    }, [interaction, onInteractionEnd]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        if (isOutpainting) return;
        if (element.type === 'note') {
            e.stopPropagation();
            setIsEditing(true);
            setTimeout(() => {
                textareaRef.current?.focus();
                textareaRef.current?.select();
            }, 0);
        } else if (element.type === 'drawing') {
            e.stopPropagation();
            onEditDrawing(element.id);
        }
    }, [element, onEditDrawing, isOutpainting]);
    
    const handleContextMenu = (e: React.MouseEvent) => {
        e.stopPropagation();
        onContextMenu(e, element.id);
    };

    useEffect(() => {
        if (interaction) {
            window.addEventListener('mousemove', handleInteractionMove);
            window.addEventListener('mouseup', handleInteractionEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleInteractionMove);
            window.removeEventListener('mouseup', handleInteractionEnd);
        };
    }, [interaction, handleInteractionMove, handleInteractionEnd]);
    
    return (
        <div
            ref={elementRef}
            className="absolute"
            style={{
                left: element.position.x,
                top: element.position.y,
                width: element.width,
                height: element.height,
                transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
                cursor: isOutpainting ? 'default' : 'move',
                zIndex: element.zIndex
            }}
            onMouseDown={(e) => handleInteractionStart(e, 'drag')}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
        >
            <div className="element-body w-full h-full">
              {(() => {
                const el = element;
                const style: React.CSSProperties = {
                    width: '100%',
                    height: '100%',
                };

                switch (el.type) {
                    case 'note':
                        const alignmentClass = el.textAlign === 'center' ? 'text-center' : 'text-left';
                        return (
                           <div style={style} className={`rounded-lg shadow-md text-white font-medium flex items-center justify-center ${el.color}`}>
                                <textarea
                                    ref={textareaRef}
                                    value={el.content}
                                    readOnly={!isEditing}
                                    onChange={(e) => onUpdate({ ...el, content: e.target.value })}
                                    onBlur={() => setIsEditing(false)}
                                    onMouseDown={(e) => {
                                      if (e.button !== 0) return;
                                      onSelect(element.id, e.shiftKey);
                                      if (isEditing) {
                                        e.stopPropagation();
                                      }
                                    }}
                                    className={`w-full h-full bg-transparent text-white p-4 resize-none border-none focus:outline-none placeholder-gray-200/70 ${isEditing ? 'cursor-text' : 'cursor-move'} ${alignmentClass}`}
                                    style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
                                    placeholder="輸入內容..."
                                />
                            </div>
                        );
                    case 'image':
                        return (
                            <img src={el.src} alt="使用者上傳圖片" style={style} className="shadow-lg rounded-md object-cover" draggable="false" />
                        );
                    case 'drawing':
                        return (
                            <div style={style} className="bg-white shadow-md rounded-lg flex items-center justify-center border border-gray-200">
                                {el.src ? (
                                    <img src={el.src} alt="使用者繪圖" style={style} className="rounded-lg object-contain" draggable="false" />
                                ) : (
                                    <span className="text-gray-400 p-2 text-center">雙擊開始繪圖</span>
                                )}
                            </div>
                        );
                    case 'arrow':
                         // The SVG viewBox should be independent of the element's width/height to maintain aspect ratio
                        const viewBoxWidth = 150;
                        const viewBoxHeight = 30;
                        return (
                            <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className={el.color}>
                                <svg width="100%" height={viewBoxHeight} viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d={`M0 ${viewBoxHeight / 2} H${viewBoxWidth - 10}`} stroke="currentColor" strokeWidth="4" />
                                    <path d={`M${viewBoxWidth - 20} ${viewBoxHeight / 2 - 10} L${viewBoxWidth - 5} ${viewBoxHeight / 2} L${viewBoxWidth - 20} ${viewBoxHeight / 2 + 10}`} stroke="currentColor" strokeWidth="4" fill="none" />
                                </svg>
                            </div>
                        );
                    default:
                        return null;
                }
              })()}
            </div>

            {isSelected && !isOutpainting && (
                <>
                    <div className="absolute -inset-1 border-2 border-blue-500 border-dashed rounded-lg pointer-events-none" />
                    
                    {element.type === 'arrow' ? (
                        <>
                            <div className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-grab transform-handle"
                                onMouseDown={(e) => handleInteractionStart(e, 'resize-arrow-start')} />
                            <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-grab transform-handle"
                                onMouseDown={(e) => handleInteractionStart(e, 'resize-arrow-end')} />
                        </>
                    ) : (
                        <>
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-5 h-5 bg-blue-500 rounded-full cursor-alias transform-handle"
                                onMouseDown={(e) => handleInteractionStart(e, 'rotate')} />
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-blue-500 pointer-events-none" />

                            <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-blue-500 rounded-sm cursor-se-resize transform-handle"
                                onMouseDown={(e) => handleInteractionStart(e, 'resize')} />
                        </>
                    )}
                </>
            )}
        </div>
    );
};
