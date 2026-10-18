import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useGame } from '../../context/GameContext';
import { Window } from './Window';
import { BackgroundCanvas } from './BackgroundCanvas';
import { StatusBar } from './StatusBar';
import { Taskbar } from './Taskbar';
import { StickyNotes } from './StickyNotes';
import { CommandPalette } from './CommandPalette';
import { DesktopContextMenu } from './DesktopContextMenu';
import { DesktopPet } from './DesktopPet';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { X } from 'lucide-react';

// Code-splitting via React.lazy for all 18 applications
const WoodenFishApp = React.lazy(() => import('../apps/WoodenFishApp').then((m) => ({ default: m.WoodenFishApp })));
const WheelLifeApp = React.lazy(() => import('../apps/WheelLifeApp').then((m) => ({ default: m.WheelLifeApp })));
const SnakeApp = React.lazy(() => import('../apps/SnakeApp').then((m) => ({ default: m.SnakeApp })));
const CyberPetApp = React.lazy(() => import('../apps/CyberPetApp').then((m) => ({ default: m.CyberPetApp })));
const DungeonApp = React.lazy(() => import('../apps/DungeonApp').then((m) => ({ default: m.DungeonApp })));
const StockMarketApp = React.lazy(() => import('../apps/StockMarketApp').then((m) => ({ default: m.StockMarketApp })));
const SynthwaveApp = React.lazy(() => import('../apps/SynthwaveApp').then((m) => ({ default: m.SynthwaveApp })));
const TerminalApp = React.lazy(() => import('../apps/TerminalApp').then((m) => ({ default: m.TerminalApp })));
const AmbienceApp = React.lazy(() => import('../apps/AmbienceApp').then((m) => ({ default: m.AmbienceApp })));
const FishingApp = React.lazy(() => import('../apps/FishingApp').then((m) => ({ default: m.FishingApp })));
const MarketApp = React.lazy(() => import('../apps/MarketApp').then((m) => ({ default: m.MarketApp })));
const DouDizhuApp = React.lazy(() => import('../apps/DouDizhuApp').then((m) => ({ default: m.DouDizhuApp })));
const MinesweeperApp = React.lazy(() => import('../apps/MinesweeperApp').then((m) => ({ default: m.MinesweeperApp })));
const ForgeApp = React.lazy(() => import('../apps/ForgeApp').then((m) => ({ default: m.ForgeApp })));
const GachaApp = React.lazy(() => import('../apps/GachaApp').then((m) => ({ default: m.GachaApp })));
const DailyReportApp = React.lazy(() => import('../apps/DailyReportApp').then((m) => ({ default: m.DailyReportApp })));
const TrophyHallApp = React.lazy(() => import('../apps/TrophyHallApp').then((m) => ({ default: m.TrophyHallApp })));
const SystemSettingsApp = React.lazy(() => import('../apps/SystemSettingsApp').then((m) => ({ default: m.SystemSettingsApp })));

export const Desktop: React.FC = () => {
  const {
    state,
    windows,
    openWindow,
    clampAllWindows,
    dialog,
    closeDialog,
    notifications,
    dismissNotification,
    visualEffect,
  } = useGame();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Pre-calculate stable positions for particles to prevent render-phase impure jitter
  const visualEffectId = visualEffect?.id;
  const visualEffectType = visualEffect?.type;

  const lanternParticles = useMemo(() => {
    if (visualEffectType !== 'lantern' || !visualEffectId) return [];
    return Array.from({ length: 18 }).map((_, i) => ({
      id: i,
      left: `${(i * 5.5 + ((i * 13) % 4)) % 100}%`,
      duration: 5 + (i % 5),
      delay: i * 0.25,
    }));
  }, [visualEffectId, visualEffectType]);

  const meteorParticles = useMemo(() => {
    if (visualEffectType !== 'meteor' || !visualEffectId) return [];
    return Array.from({ length: 14 }).map((_, i) => ({
      id: i,
      top: `${(i * 7) % 60}%`,
      right: `${(i * 7) % 80}%`,
      duration: 1.8 + (i % 3) * 0.4,
      delay: i * 0.2,
    }));
  }, [visualEffectId, visualEffectType]);

  // Bring windows back inside the viewport when the screen shrinks (monitor swap,
  // browser window resize, phone rotation) — persisted coordinates could otherwise
  // park a window entirely off-screen with no way to grab it.
  useEffect(() => {
    window.addEventListener('resize', clampAllWindows);
    clampAllWindows();
    return () => window.removeEventListener('resize', clampAllWindows);
  }, [clampAllWindows]);

  // Global Ctrl+K / Cmd+K listener & custom event
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        // Terminal and the save-code textarea need Ctrl+K for their own editing;
        // the taskbar's ⌘K button still opens the palette.
        const el = e.target as HTMLElement | null;
        const tag = el?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    const handleOpenPalette = () => setIsCommandPaletteOpen(true);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-command-palette', handleOpenPalette);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-command-palette', handleOpenPalette);
    };
  }, []);

  const desktopIcons = [
    { id: 'wooden-fish', title: '赛博木鱼', icon: '📿' },
    { id: 'wheel-life', title: '转盘修仙', icon: '🎡' },
    { id: 'snake-arcade', title: '街机贪吃蛇', icon: '🕹️' },
    { id: 'cyber-pet', title: '机甲宠物', icon: '🐕' },
    { id: 'dungeon', title: '代码肉鸽', icon: '⚔️' },
    { id: 'stock-market', title: '赛博股市', icon: '📈' },
    { id: 'fishing', title: '赛博钓鱼', icon: '🎣' },
    { id: 'market', title: '赛博交易所', icon: '🏪' },
    { id: 'doudizhu', title: '赛博斗地主', icon: '🃏' },
    { id: 'minesweeper', title: '量子扫雷', icon: '👾' },
    { id: 'forge', title: '八卦炼宝', icon: '🔮' },
    { id: 'gacha', title: '盲盒扭蛋', icon: '🎁' },
    { id: 'daily-report', title: '摸鱼日报', icon: '📄' },
    { id: 'trophy-hall', title: '成就殿堂', icon: '🏆' },
    { id: 'synthwave', title: '8Bit编曲', icon: '🎹' },
    { id: 'terminal', title: '黑客终端', icon: '💻' },
    { id: 'ambience', title: '白噪音专注', icon: '☕' },
    { id: 'system-settings', title: '系统设置', icon: '⚙️' },
  ] as const;

  const renderAppContent = (id: string) => {
    return (
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center h-full text-cyan-400 font-mono text-xs gap-2 select-none">
            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span>⚡ 正在加载量子模块...</span>
          </div>
        }
      >
        {(() => {
          switch (id) {
            case 'wooden-fish':
              return <WoodenFishApp />;
            case 'wheel-life':
              return <WheelLifeApp />;
            case 'snake-arcade':
              return <SnakeApp />;
            case 'cyber-pet':
              return <CyberPetApp />;
            case 'dungeon':
              return <DungeonApp />;
            case 'stock-market':
              return <StockMarketApp />;
            case 'synthwave':
              return <SynthwaveApp />;
            case 'terminal':
              return <TerminalApp />;
            case 'ambience':
              return <AmbienceApp />;
            case 'fishing':
              return <FishingApp />;
            case 'market':
              return <MarketApp />;
            case 'doudizhu':
              return <DouDizhuApp />;
            case 'minesweeper':
              return <MinesweeperApp />;
            case 'forge':
              return <ForgeApp />;
            case 'gacha':
              return <GachaApp />;
            case 'daily-report':
              return <DailyReportApp />;
            case 'trophy-hall':
              return <TrophyHallApp />;
            case 'system-settings':
              return <SystemSettingsApp />;
            default:
              return null;
          }
        })()}
      </Suspense>
    );
  };

  return (
    <div
      data-theme={state.theme}
      onContextMenu={(e) => {
        // Only the bare desktop gets the OS menu. preventDefault on the container
        // used to swallow right-click inside every window — no paste in the terminal,
        // no undo in the save-code field.
        const el = e.target as HTMLElement | null;
        if (el?.closest('[data-window-id]')) return;
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
      className="relative w-screen h-screen overflow-hidden select-none bg-[var(--theme-bg)] transition-colors duration-300 font-mono"
    >
      {/* Eye-Friendly Nebula / Wave Background */}
      <BackgroundCanvas />

      {/* Retro CRT Scanlines Overlay */}
      {state.crtEffect && <div className="crt-overlay" />}

      {/* Top Status Bar */}
      <StatusBar />

      {/* Desktop Sticky Notes Widget */}
      <StickyNotes />

      {/* Desktop Workspace & Shortcuts */}
      <main className="absolute inset-0 top-10 bottom-12 p-4 grid grid-flow-col grid-rows-5 auto-cols-[96px] gap-3 z-10 pointer-events-none">
        {desktopIcons.map((item) => (
          <button
            key={item.id}
            onClick={() => openWindow(item.id as any)}
            className="pointer-events-auto flex flex-col items-center justify-center p-2 rounded-xl bg-slate-950/40 hover:bg-slate-900/80 border border-slate-800/60 hover:border-cyan-500/50 hover:shadow-neon-cyan transition-all group w-22 h-22 text-center cursor-pointer"
          >
            <div className="text-3xl mb-1 transform group-hover:scale-115 transition-transform duration-200">
              {item.icon}
            </div>
            <div className="text-[11px] font-semibold text-slate-300 group-hover:text-cyan-300 line-clamp-1 leading-tight">
              {item.title}
            </div>
          </button>
        ))}
      </main>

      {/* Render All Open Windows */}
      {windows.map((win) => (
        <Window key={win.id} win={win}>
          <ErrorBoundary fallbackTitle={`${win.title} 运行故障`}>
            {renderAppContent(win.id)}
          </ErrorBoundary>
        </Window>
      ))}

      {/* In-app Toast Notifications (Top Right) */}
      <div className="fixed top-11 right-4 z-[99990] flex flex-col gap-2 max-w-sm pointer-events-none">
        {notifications.map((n) => {
          const toneClass =
            n.tone === 'gold'
              ? 'border-yellow-400 bg-amber-950/90 text-yellow-300 shadow-neon-gold'
              : n.tone === 'error' || n.tone === 'warn'
              ? 'border-red-500 bg-red-950/90 text-red-200 shadow-neon-pink'
              : 'border-cyan-400 bg-cyan-950/90 text-cyan-200 shadow-neon-cyan';
          return (
            <div
              key={n.id}
              className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-xl border backdrop-blur-md transition-all animate-in slide-in-from-right-4 duration-200 ${toneClass}`}
            >
              <span className="text-xl shrink-0 mt-0.5">{n.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-xs">{n.title}</div>
                {n.body && <div className="text-[10px] opacity-85 mt-0.5 whitespace-pre-wrap">{n.body}</div>}
              </div>
              <button
                onClick={() => dismissNotification(n.id)}
                className="opacity-60 hover:opacity-100 p-0.5 rounded hover:bg-white/10 cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Cyber In-App Modal Dialog (Replaces native browser alert & confirm) */}
      {dialog && (
        <div className="fixed inset-0 z-[99995] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150 select-none">
          <div
            className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl bg-gradient-to-b from-slate-900 to-slate-950 text-slate-100 animate-in zoom-in-95 duration-200 ${
              dialog.tone === 'red'
                ? 'border-red-500/70 shadow-neon-pink'
                : dialog.tone === 'gold'
                ? 'border-yellow-500/70 shadow-neon-gold'
                : dialog.tone === 'green'
                ? 'border-green-500/70 shadow-neon-green'
                : dialog.tone === 'pink'
                ? 'border-pink-500/70 shadow-neon-pink'
                : 'border-cyan-500/70 shadow-neon-cyan'
            }`}
          >
            <div className="flex items-start gap-3 mb-3">
              <span className="text-3xl shrink-0">{dialog.icon || '💬'}</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-black text-sm tracking-wide text-cyan-300">{dialog.title}</h3>
                <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap leading-relaxed">{dialog.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              {dialog.onCancel && (
                <button
                  onClick={() => {
                    dialog.onCancel?.();
                    closeDialog();
                  }}
                  className="px-4 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
                >
                  {dialog.cancelText || '取消'}
                </button>
              )}
              <button
                onClick={() => {
                  dialog.onConfirm?.();
                  closeDialog();
                }}
                className="px-5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black text-xs shadow-neon-cyan transition-all cursor-pointer"
              >
                {dialog.confirmText || '确定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Roaming Desktop Pet */}
      <DesktopPet />

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />

      {/* Desktop Context Menu */}
      {contextMenu && (
        <DesktopContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Full-screen Emotional Visual Effect Overlays */}
      {visualEffect && (
        <div key={visualEffect.id} className="fixed inset-0 pointer-events-none z-[99992] overflow-hidden">
          {visualEffect.type === 'lantern' && (
            <div className="absolute inset-0">
              {lanternParticles.map((p) => (
                <div
                  key={p.id}
                  style={{
                    left: p.left,
                    bottom: '-80px',
                    animation: `floatUp ${p.duration}s cubic-bezier(0.2, 0.8, 0.4, 1) ${p.delay}s forwards`,
                  }}
                  className="absolute text-4xl filter drop-shadow-[0_0_15px_#ff9900]"
                >
                  🏮
                </div>
              ))}
            </div>
          )}

          {visualEffect.type === 'meteor' && (
            <div className="absolute inset-0">
              {meteorParticles.map((p) => (
                <div
                  key={p.id}
                  style={{
                    top: p.top,
                    right: p.right,
                    animation: `shootingStar ${p.duration}s ease-in-out ${p.delay}s forwards`,
                  }}
                  className="absolute text-3xl filter drop-shadow-[0_0_20px_#00ffff]"
                >
                  💫
                </div>
              ))}
            </div>
          )}

          {visualEffect.type === 'golden_merit' && (
            <div className="absolute inset-0 flex items-center justify-center animate-in zoom-in-50 fade-in duration-300">
              <div className="p-8 rounded-3xl bg-yellow-500/20 border-2 border-yellow-400/80 backdrop-blur-md text-center shadow-neon-gold animate-pulse">
                <div className="text-6xl mb-2">📿✨</div>
                <div className="text-2xl font-black text-yellow-300 tracking-wider">大 乘 功 德 佛 光 普 照</div>
                <div className="text-xs text-yellow-200 mt-1 font-mono">诸邪避退 · 全服 Bug 消除 · 善哉善哉</div>
              </div>
            </div>
          )}

          {visualEffect.type === 'chicken' && (
            <div className="absolute inset-0 flex items-center justify-center animate-bounce">
              <div className="text-9xl filter drop-shadow-[0_0_50px_#ffd700] animate-spin">
                🐔
              </div>
            </div>
          )}

          {visualEffect.type === 'unicorn' && (
            <div className="absolute top-1/3 left-0 w-full flex items-center justify-center animate-bounce">
              <div className="text-8xl animate-pulse filter drop-shadow-[0_0_40px_#ff0055]">
                🦄🌈✨
              </div>
            </div>
          )}
        </div>
      )}

      {/* Keyframe styles for sky lanterns & meteors */}
      <style>{`
        @keyframes floatUp {
          0% { transform: translateY(0) scale(0.8); opacity: 0; }
          15% { opacity: 1; }
          90% { opacity: 0.9; }
          100% { transform: translateY(-110vh) scale(1.1); opacity: 0; }
        }
        @keyframes shootingStar {
          0% { transform: translate(0, 0) scale(0.6); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translate(-80vw, 60vh) scale(1.2); opacity: 0; }
        }
      `}</style>

      {/* Bottom Taskbar */}
      <Taskbar />
    </div>
  );
};
