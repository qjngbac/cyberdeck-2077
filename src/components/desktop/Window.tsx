import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { WindowState } from '../../types';
import { useGame } from '../../context/GameContext';

interface WindowProps {
  win: WindowState;
  children: React.ReactNode;
}

type SnapZone = 'left' | 'right' | 'top' | null;

export const Window: React.FC<WindowProps> = ({ win, children }) => {
  const {
    focusWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    updateWindowPos,
    updateWindowSize,
  } = useGame();

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [snapZone, setSnapZone] = useState<SnapZone>(null);

  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0,
  });
  const resizeStartRef = useRef<{ startX: number; startY: number; initW: number; initH: number }>({
    startX: 0,
    startY: 0,
    initW: 0,
    initH: 0,
  });

  // Pointer Events cover mouse, touch and pen with one path. The old split
  // mouse/touch listeners left a lifted finger unable to end the gesture
  // (no touchcancel), so `isDragging` stuck on and the window kept following
  // the pointer after the touch was interrupted.
  const beginDrag = (e: React.PointerEvent) => {
    if (win.isMaximized || e.button !== 0) return;
    if ((e.target as HTMLElement)?.closest('button, [data-window-control]')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    focusWindow(win.id);
    setIsDragging(true);
    dragStartRef.current = { startX: e.clientX, startY: e.clientY, initX: win.x, initY: win.y };
  };

  const beginResize = (e: React.PointerEvent) => {
    if (win.isMaximized || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    focusWindow(win.id);
    setIsResizing(true);
    resizeStartRef.current = { startX: e.clientX, startY: e.clientY, initW: win.width, initH: win.height };
  };

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (isDragging) {
        const dx = clientX - dragStartRef.current.startX;
        const dy = clientY - dragStartRef.current.startY;
        const newX = Math.max(0, Math.min(window.innerWidth - 100, dragStartRef.current.initX + dx));
        const newY = Math.max(32, Math.min(window.innerHeight - 80, dragStartRef.current.initY + dy));
        updateWindowPos(win.id, newX, newY);

        // Aero Snap edge detection
        if (clientX <= 15) {
          setSnapZone('left');
        } else if (clientX >= window.innerWidth - 15) {
          setSnapZone('right');
        } else if (clientY <= 38) {
          setSnapZone('top');
        } else {
          setSnapZone(null);
        }
      } else if (isResizing) {
        const dw = clientX - resizeStartRef.current.startX;
        const dh = clientY - resizeStartRef.current.startY;
        const minW = win.minWidth || 360;
        const minH = win.minHeight || 300;
        const newW = Math.max(minW, Math.min(window.innerWidth, resizeStartRef.current.initW + dw));
        const newH = Math.max(minH, Math.min(window.innerHeight - 40, resizeStartRef.current.initH + dh));
        updateWindowSize(win.id, newW, newH);
      }
    },
    [isDragging, isResizing, win.id, win.minWidth, win.minHeight, updateWindowPos, updateWindowSize]
  );

  const handlePointerUp = useCallback(() => {
    if (isDragging && snapZone) {
      if (snapZone === 'top') {
        maximizeWindow(win.id);
      } else if (snapZone === 'left') {
        updateWindowPos(win.id, 0, 36);
        updateWindowSize(win.id, Math.floor(window.innerWidth / 2), window.innerHeight - 84);
      } else if (snapZone === 'right') {
        const half = Math.floor(window.innerWidth / 2);
        updateWindowPos(win.id, half, 36);
        updateWindowSize(win.id, half, window.innerHeight - 84);
      }
      setSnapZone(null);
    }
    setIsDragging(false);
    setIsResizing(false);
  }, [isDragging, snapZone, win.id, maximizeWindow, updateWindowPos, updateWindowSize]);

  useEffect(() => {
    if (isDragging || isResizing) {
      const onMove = (e: PointerEvent) => handlePointerMove(e.clientX, e.clientY);
      const onEnd = () => handlePointerUp();

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);

      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
      };
    }
  }, [isDragging, isResizing, handlePointerMove, handlePointerUp]);

  if (!win.isOpen) return null;

  const style: React.CSSProperties = win.isMaximized
    ? {
        position: 'fixed',
        top: 36,
        left: 0,
        width: '100vw',
        height: 'calc(100vh - 84px)',
        zIndex: win.zIndex,
        display: win.isMinimized ? 'none' : 'flex',
      }
    : {
        position: 'absolute',
        top: `${win.y}px`,
        left: `${win.x}px`,
        width: `${win.width}px`,
        height: `${win.height}px`,
        zIndex: win.zIndex,
        display: win.isMinimized ? 'none' : 'flex',
      };

  return (
    <>
      {/* Aero Snap Ghost Preview Box */}
      {isDragging && snapZone && (
        <div
          style={{
            position: 'fixed',
            top: snapZone === 'top' ? 36 : 36,
            left: snapZone === 'right' ? '50vw' : 0,
            width: snapZone === 'top' ? '100vw' : '50vw',
            height: 'calc(100vh - 84px)',
            zIndex: 99990,
          }}
          className="pointer-events-none rounded-xl border-2 border-dashed border-cyan-400 bg-cyan-950/30 backdrop-blur-xs shadow-neon-cyan animate-pulse"
        />
      )}

      {/* Main Window Frame */}
      <div
        data-window-id={win.id}
        style={{
          ...style,
          borderColor: 'var(--theme-border)',
          boxShadow: '0 0 20px var(--theme-glow)',
        }}
        onClick={() => focusWindow(win.id)}
        className={`flex flex-col rounded-lg overflow-hidden border shadow-2xl transition-shadow duration-200 ${
          win.isMaximized ? 'rounded-none' : ''
        } bg-slate-950/90 backdrop-blur-md`}
      >
        {/* Window Header */}
        <div
          onPointerDown={beginDrag}
          onDoubleClick={() => maximizeWindow(win.id)}
          style={{
            background: 'var(--theme-header-bg)',
            borderBottomColor: 'var(--theme-border)',
          }}
          className="flex items-center justify-between px-3 py-2 border-b cursor-move select-none touch-none"
        >
          <div
            style={{ color: 'var(--theme-title-color)' }}
            className="flex items-center gap-2 font-bold text-xs tracking-wider truncate text-glow-theme"
          >
            <span className="text-base">{win.icon}</span>
            <span className="truncate">{win.title}</span>
          </div>

          {/* Window Controls */}
          <div
            data-window-control="true"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 ml-2 cursor-default select-none relative z-30"
          >
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                minimizeWindow(win.id);
              }}
              title="最小化"
              className="w-6 h-6 flex items-center justify-center rounded bg-slate-800/80 hover:bg-cyan-900/60 text-slate-400 hover:text-cyan-300 border border-slate-700/60 transition-colors cursor-pointer"
            >
              <Minus size={12} className="pointer-events-none" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                maximizeWindow(win.id);
              }}
              title={win.isMaximized ? '还原' : '最大化'}
              className="w-6 h-6 flex items-center justify-center rounded bg-slate-800/80 hover:bg-cyan-900/60 text-slate-400 hover:text-cyan-300 border border-slate-700/60 transition-colors cursor-pointer"
            >
              <Square size={10} className="pointer-events-none" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                closeWindow(win.id);
              }}
              title="关闭"
              className="w-6 h-6 flex items-center justify-center rounded bg-slate-800/80 hover:bg-red-900/80 text-slate-400 hover:text-red-300 border border-slate-700/60 transition-colors cursor-pointer"
            >
              <X size={12} className="pointer-events-none" />
            </button>
          </div>
        </div>

        {/* Window Body */}
        <div className="flex-1 overflow-auto relative p-3 text-slate-200">{children}</div>

        {/* Resize Handle */}
        {!win.isMaximized && (
          <div
            onPointerDown={beginResize}
            className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-center justify-center text-cyan-500/50 hover:text-cyan-400 select-none z-20 touch-none"
          >
            <svg width="12" height="12" viewBox="0 0 10 10">
              <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" />
              <line x1="9" y1="5" x2="5" y2="9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
        )}
      </div>
    </>
  );
};
