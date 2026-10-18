import React, { useEffect } from 'react';
import { RefreshCw, Image, Minimize2, Grid, Layers, Terminal, Radio, Dog, Settings } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';
import { BgModeType } from '../../types';

interface DesktopContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

const BG_MODES: { id: BgModeType; name: string }[] = [
  { id: 'nebula', name: '深空星云 (Nebula)' },
  { id: 'wave', name: '霓虹声波 (Wave)' },
  { id: 'rain', name: '数字雨夜 (Rain)' },
  { id: 'minimal', name: '极简深色 (Minimal)' },
  { id: 'matrix', name: '矩阵绿雨 (Matrix)' },
];

export const DesktopContextMenu: React.FC<DesktopContextMenuProps> = ({ x, y, onClose }) => {
  const {
    state,
    windows,
    openWindow,
    minimizeWindow,
    updateWindowPos,
    updateWindowSize,
    setBgMode,
    toggleRadio,
    toggleDesktopPetRoam,
    showAlert,
  } = useGame();

  // Close on outside click or scroll or escape
  useEffect(() => {
    const handleGlobalClick = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('contextmenu', handleGlobalClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('contextmenu', handleGlobalClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Prevent context menu from overflowing the screen
  const menuWidth = 220;
  const menuHeight = 310;
  const safeX = Math.min(x, window.innerWidth - menuWidth - 10);
  const safeY = Math.min(y, window.innerHeight - menuHeight - 10);

  // Actions
  const handleRefresh = () => {
    SoundFX.playKeyClick();
    showAlert('⚡ 桌面数据链路已刷新，矩阵重构完毕！', '系统刷新', '🔄', 'cyan');
    onClose();
  };

  const handleCycleBg = () => {
    const currentIdx = BG_MODES.findIndex((m) => m.id === state.bgMode);
    const next = BG_MODES[(currentIdx + 1) % BG_MODES.length];
    setBgMode(next.id);
    SoundFX.playKeyClick();
    showAlert(`🎨 壁纸模式已切换为：【${next.name}】`, '壁纸切换', '🎨', 'cyan');
    onClose();
  };

  const handleMinimizeAll = () => {
    SoundFX.playKeyClick();
    windows.forEach((w) => {
      if (w.isOpen && !w.isMinimized) {
        minimizeWindow(w.id);
      }
    });
    onClose();
  };

  const handleTileWindows = () => {
    SoundFX.playKeyClick();
    const openWins = windows.filter((w) => w.isOpen && !w.isMinimized);
    if (openWins.length === 0) {
      onClose();
      return;
    }

    const cols = openWins.length <= 2 ? openWins.length : Math.ceil(Math.sqrt(openWins.length));
    const rows = Math.ceil(openWins.length / cols);
    const cellW = Math.floor(window.innerWidth / cols);
    const cellH = Math.floor((window.innerHeight - 80) / rows);

    openWins.forEach((win, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      updateWindowPos(win.id, col * cellW + 10, row * cellH + 40);
      updateWindowSize(win.id, cellW - 20, cellH - 20);
    });
    onClose();
  };

  const handleCascadeWindows = () => {
    SoundFX.playKeyClick();
    const openWins = windows.filter((w) => w.isOpen && !w.isMinimized);
    openWins.forEach((win, index) => {
      const offset = (index % 8) * 35;
      updateWindowPos(win.id, 60 + offset, 50 + offset);
      updateWindowSize(win.id, 600, 520);
    });
    onClose();
  };

  return (
    <div
      style={{ left: safeX, top: safeY }}
      className="fixed z-[99997] w-56 rounded-xl bg-slate-950/95 border border-cyan-500/40 shadow-2xl shadow-cyan-950/80 backdrop-blur-md p-1.5 font-mono text-xs text-slate-200 divide-y divide-slate-800/60 animate-in fade-in zoom-in-95 duration-100 select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="py-1 space-y-0.5">
        <button
          onClick={handleRefresh}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-cyan-950/60 hover:text-cyan-300 text-left transition-colors group cursor-pointer"
        >
          <RefreshCw size={14} className="text-cyan-400 group-hover:rotate-180 transition-transform duration-300" />
          <span>刷新桌面矩阵</span>
        </button>

        <button
          onClick={handleCycleBg}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-cyan-950/60 hover:text-cyan-300 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Image size={14} className="text-purple-400" />
            <span>切换壁纸底色</span>
          </div>
          <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400">{state.bgMode}</span>
        </button>
      </div>

      <div className="py-1 space-y-0.5">
        <button
          onClick={handleMinimizeAll}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-cyan-950/60 hover:text-cyan-300 text-left transition-colors cursor-pointer"
        >
          <Minimize2 size={14} className="text-yellow-400" />
          <span>显示桌面 (最小化全部)</span>
        </button>

        <button
          onClick={handleTileWindows}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-cyan-950/60 hover:text-cyan-300 text-left transition-colors cursor-pointer"
        >
          <Grid size={14} className="text-blue-400" />
          <span>智能平铺全部窗口</span>
        </button>

        <button
          onClick={handleCascadeWindows}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-cyan-950/60 hover:text-cyan-300 text-left transition-colors cursor-pointer"
        >
          <Layers size={14} className="text-teal-400" />
          <span>层叠排列所有窗口</span>
        </button>
      </div>

      <div className="py-1 space-y-0.5">
        <button
          onClick={() => { openWindow('terminal'); onClose(); }}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-cyan-950/60 hover:text-cyan-300 text-left transition-colors cursor-pointer"
        >
          <Terminal size={14} className="text-green-400" />
          <span>启动黑客控制台</span>
        </button>

        <button
          onClick={() => { toggleRadio(); onClose(); }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-cyan-950/60 hover:text-cyan-300 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-pink-400" />
            <span>赛博电台 FM</span>
          </div>
          <span className={`text-[9px] px-1 py-0.2 rounded font-bold ${state.radioEnabled ? 'bg-green-950 text-green-400' : 'bg-slate-800 text-slate-400'}`}>
            {state.radioEnabled ? 'ON' : 'OFF'}
          </span>
        </button>

        <button
          onClick={() => { toggleDesktopPetRoam(); onClose(); }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-cyan-950/60 hover:text-cyan-300 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Dog size={14} className="text-amber-400" />
            <span>桌面放养桌宠</span>
          </div>
          <span className={`text-[9px] px-1 py-0.2 rounded font-bold ${state.pet.roamOnDesktop !== false ? 'bg-amber-950 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
            {state.pet.roamOnDesktop !== false ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>

      <div className="pt-1">
        <button
          onClick={() => { openWindow('system-settings'); onClose(); }}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-cyan-950/60 hover:text-cyan-300 text-left transition-colors cursor-pointer text-slate-400 hover:text-slate-200"
        >
          <Settings size={14} />
          <span>系统与存档配置...</span>
        </button>
      </div>
    </div>
  );
};
