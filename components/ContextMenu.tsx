
import React, { useRef, useEffect, useState } from 'react';
import type { Point, ElementType } from '../types';
import { COLORS } from '../App';

interface ContextMenuData {
    x: number;
    y: number;
    worldPoint: Point;
    elementId: string | null;
}

interface ContextMenuProps {
  menuData: ContextMenuData;
  onClose: () => void;
  actions: {
    addNote: (position: Point) => void;
    addArrow: (position: Point) => void;
    addDrawing: (position: Point) => void;
    editDrawing: (elementId: string) => void;
    startImageEdit: (elementId: string) => void;
    startOutpainting: (elementId: string) => void;
    addImage: (position: Point) => void;
    deleteElement: () => void;
    bringToFront: () => void;
    sendToBack: () => void;
    changeColor: (color: string) => void;
    downloadImage: (elementId: string) => void;
  };
  canChangeColor: boolean;
  elementType: ElementType | null;
}

const MenuItem: React.FC<{ onClick: () => void; children: React.ReactNode; disabled?: boolean }> = ({ onClick, children, disabled }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className="context-sketch-item w-full px-4 py-2 text-left text-sm disabled:bg-transparent"
    >
        {children}
    </button>
);

export const ContextMenu: React.FC<ContextMenuProps> = ({ menuData, onClose, actions, canChangeColor, elementType }) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [colorSubMenuVisible, setColorSubMenuVisible] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        // Use timeout to prevent the same click event that opened the menu from closing it
        setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);
    
    const handleAction = (action: Function) => {
        action();
        onClose();
    };
    
    const handleColorSubMenu = (e: React.MouseEvent) => {
        if (!canChangeColor) return;
        e.stopPropagation();
        setColorSubMenuVisible(true);
    };

    const menuStyle: React.CSSProperties = {
        position: 'absolute',
        left: `${menuData.x}px`,
        top: `${menuData.y}px`,
        zIndex: 50,
    };
    
    const colorSubMenuStyle: React.CSSProperties = {
        position: 'absolute',
        left: '100%',
        top: 0,
        zIndex: 51,
    }

    return (
        <div
            ref={menuRef}
            style={menuStyle}
            className="context-sketch-menu w-48 py-1 focus:outline-none"
            onClick={(e) => e.stopPropagation()} // Prevent clicks inside from closing the menu via the main app listener
        >
            {menuData.elementId ? (
                // Element Menu
                <>
                    {elementType === 'image' && (
                         <>
                            <MenuItem onClick={() => handleAction(() => actions.startImageEdit(menuData.elementId!))}>
                                移除或編輯物件
                            </MenuItem>
                            <MenuItem onClick={() => handleAction(() => actions.startOutpainting(menuData.elementId!))}>
                                擴展圖片
                            </MenuItem>
                             <div className="sketch-divider my-1 border-t" />
                        </>
                    )}
                    {elementType === 'drawing' && (
                         <>
                            <MenuItem onClick={() => handleAction(() => actions.editDrawing(menuData.elementId!))}>
                                編輯繪圖
                            </MenuItem>
                             <div className="sketch-divider my-1 border-t" />
                        </>
                    )}
                    {(elementType === 'image' || elementType === 'drawing') && (
                        <>
                            <MenuItem onClick={() => handleAction(() => actions.downloadImage(menuData.elementId!))}>
                                下載圖片
                            </MenuItem>
                            <div className="sketch-divider my-1 border-t" />
                        </>
                    )}
                    <div className="relative" onMouseLeave={() => setColorSubMenuVisible(false)}>
                        <button
                            onMouseEnter={handleColorSubMenu}
                            disabled={!canChangeColor}
                            className="context-sketch-item flex w-full items-center justify-between px-4 py-2 text-left text-sm disabled:bg-transparent"
                        >
                            <span>變更顏色</span>
                            <span className="text-xs">▶</span>
                        </button>
                         {colorSubMenuVisible && canChangeColor && (
                             <div 
                                style={colorSubMenuStyle}
                                className="context-sketch-menu w-48 py-1 focus:outline-none"
                             >
                                 <div className="p-2 grid grid-cols-5 gap-2">
                                     {COLORS.map(color => (
                                         <button
                                             key={color.name}
                                             onClick={() => handleAction(() => actions.changeColor(color.bg))}
                                             className={`color-dot h-6 w-6 ${color.bg}`}
                                             aria-label={`改成${color.name}`}
                                         />
                                     ))}
                                 </div>
                             </div>
                         )}
                    </div>
                    <div className="sketch-divider my-1 border-t" />
                    <MenuItem onClick={() => handleAction(actions.bringToFront)}>↑ 移到最上層</MenuItem>
                    <MenuItem onClick={() => handleAction(actions.sendToBack)}>↓ 移到最下層</MenuItem>
                    <div className="sketch-divider my-1 border-t" />
                    <MenuItem onClick={() => handleAction(actions.deleteElement)}>刪除</MenuItem>
                </>
            ) : (
                // Canvas Menu
                <>
                    <MenuItem onClick={() => handleAction(() => actions.addNote(menuData.worldPoint))}>新增便條</MenuItem>
                    <MenuItem onClick={() => handleAction(() => actions.addArrow(menuData.worldPoint))}>新增箭頭</MenuItem>
                    <MenuItem onClick={() => handleAction(() => actions.addDrawing(menuData.worldPoint))}>新增繪圖</MenuItem>
                    <MenuItem onClick={() => handleAction(() => actions.addImage(menuData.worldPoint))}>新增圖片</MenuItem>
                </>
            )}
        </div>
    );
};
