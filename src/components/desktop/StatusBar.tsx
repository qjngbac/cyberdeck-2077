import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Monitor, Cpu, Sparkles, Zap, Search, Radio } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { ThemeType } from '../../types';
import { SoundFX } from '../../audio/SoundFX';
import { CyberRadio } from '../../audio/CyberRadio';

export const StatusBar: React.FC = () => {
  const { state, toggleSound, toggleCrt, toggleRadio, setTheme, setBgMode } = useGame();
  const [time, setTime] = useState<string>('');

  // Sync CyberRadio playback with state.radioEnabled
  useEffect(() => {
    if (state.radioEnabled) {
      CyberRadio.start();
    } else {
      CyberRadio.stop();
    }
  }, [state.radioEnabled]);

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const themes: { id: ThemeType; label: string; color: string }[] = [
    { id: 'cyberpunk', label: '霓虹', color: 'bg-cyan-500' },
    { id: 'matrix', label: '矩阵', color: 'bg-green-500' },
    { id: 'synthwave', label: '复古', color: 'bg-pink-500' },
    { id: 'gold', label: '帝王', color: 'bg-amber-400' },
  ];

  return (
    <header
      style={{
        backgroundColor: 'var(--theme-bar-bg)',
        borderBottomColor: 'var(--theme-border)',
      }}
      className="h-9 px-3 border-b flex items-center justify-between text-xs backdrop-blur-md select-none z-50 fixed top-0 left-0 right-0 transition-colors duration-300"
    >
      {/* Left: OS Title & Slogan */}
      <div className="flex items-center gap-3">
        <div
          style={{ color: 'var(--theme-title-color)' }}
          className="flex items-center gap-1.5 font-black tracking-wider text-glow-theme transition-colors"
        >
          <Zap size={15} className="text-yellow-400 animate-pulse" />
          <span>CYBERDECK 2077</span>
          <span
            style={{
              borderColor: 'var(--theme-border)',
              color: 'var(--theme-title-color)',
            }}
            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900/80 border font-bold"
          >
            v2.7
          </span>
        </div>

        {/* Pet Quick Glance */}
        <div className="hidden md:flex items-center gap-2 px-2 py-0.5 rounded bg-slate-900/80 border border-slate-800 text-slate-300 text-[11px]">
          <span>🐕 {state.pet.name} (Lv.{state.pet.level})</span>
          <span className="text-yellow-400">🔋{state.pet.energy}%</span>
          <span className="text-orange-400">🍖{state.pet.hunger}%</span>
        </div>
      </div>

      {/* Center: Global Currency Stats */}
      <div className="flex items-center gap-3 md:gap-5 font-mono">
        {/* Merit */}
        <div className="flex items-center gap-1.5 text-yellow-300 bg-yellow-950/30 px-2 py-0.5 rounded border border-yellow-500/30 shadow-sm">
          <Sparkles size={13} className="text-yellow-400" />
          <span className="font-bold">{state.merit.toLocaleString()}</span>
          <span className="text-[10px] text-yellow-400/80">功德</span>
          {state.autoMeritPerSec > 0 && (
            <span className="text-[10px] text-green-400">+{state.autoMeritPerSec}/s</span>
          )}
        </div>

        {/* Credits */}
        <div className="flex items-center gap-1.5 text-cyan-300 bg-cyan-950/30 px-2 py-0.5 rounded border border-cyan-500/30 shadow-sm">
          <span className="w-4 h-4 rounded-full bg-cyan-500/20 border border-cyan-400/80 flex items-center justify-center text-cyan-300 font-black text-[11px] leading-none shadow-neon-cyan select-none shrink-0">
            ₵
          </span>
          <span className="font-bold font-mono tracking-tight">{state.credits.toLocaleString()}</span>
          <span className="text-[10px] text-cyan-400/80">赛博币</span>
        </div>

        {/* Hashrate */}
        <div className="hidden lg:flex items-center gap-1.5 text-purple-300 bg-purple-950/30 px-2 py-0.5 rounded border border-purple-500/30">
          <Cpu size={13} className="text-purple-400" />
          <span className="font-bold">{state.hashrate} GH/s</span>
        </div>
      </div>

      {/* Right: Controls & Time */}
      <div className="flex items-center gap-2">
        {/* Theme Picker (4 Color Balls) */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 px-2 py-0.5 rounded-lg border border-slate-800 shadow-sm">
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                SoundFX.playKeyClick();
                setTheme(t.id);
              }}
              title={`切换为【${t.label}】主题`}
              className={`w-4 h-4 rounded-full ${t.color} transition-all cursor-pointer ${
                state.theme === t.id
                  ? 'scale-125 ring-2 ring-white shadow-lg'
                  : 'opacity-50 hover:opacity-100 hover:scale-110'
              }`}
            />
          ))}
        </div>

        {/* Background Mode */}
        <button
          onClick={() => {
            const modes: ('nebula' | 'wave' | 'rain' | 'minimal' | 'matrix')[] = ['nebula', 'wave', 'rain', 'minimal', 'matrix'];
            const nextIdx = (modes.indexOf(state.bgMode as any) + 1) % modes.length;
            setBgMode(modes[nextIdx]);
          }}
          title="切换护眼背景特效 (深空星云/数码波/细雨/纯黑/矩阵)"
          className="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700 hover:border-cyan-400 text-[10px] text-cyan-300 transition-colors"
        >
          🌌 BG: {state.bgMode.toUpperCase()}
        </button>

        {/* CRT toggle */}
        <button
          onClick={() => {
            SoundFX.playKeyClick();
            toggleCrt();
          }}
          title={state.crtEffect ? "复古 CRT 扫描线 [已开启 - 点击关闭]" : "复古 CRT 扫描线 [已关闭 - 点击开启]"}
          className={`p-1.5 rounded transition-all cursor-pointer ${
            state.crtEffect
              ? 'text-green-300 bg-green-500/25 border border-green-400/80 shadow-neon-green scale-105'
              : 'text-slate-500 hover:text-slate-300 bg-slate-900/60 border border-slate-800'
          }`}
        >
          <Monitor size={14} />
        </button>

        {/* Cyber Radio FM Toggle */}
        <button
          onClick={() => {
            SoundFX.playKeyClick();
            toggleRadio();
          }}
          title={state.radioEnabled ? '📻 赛博电台 FM [播放中 - 点击暂停]' : '📻 赛博电台 FM [已暂停 - 点击播放 80s 极客合成波]'}
          className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all cursor-pointer ${
            state.radioEnabled
              ? 'text-pink-300 bg-pink-950/80 border border-pink-500/70 shadow-neon-pink animate-pulse'
              : 'text-slate-500 hover:text-slate-300 bg-slate-900/60 border border-slate-800'
          }`}
        >
          <Radio size={13} />
          <span className="text-[10px] font-bold hidden sm:inline">FM 2077</span>
        </button>

        {/* Global Command Palette Trigger */}
        <button
          onClick={() => {
            SoundFX.playKeyClick();
            window.dispatchEvent(new CustomEvent('open-command-palette'));
          }}
          title="呼出全局指令台 (快捷键: Ctrl + K)"
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700 hover:border-cyan-400 text-cyan-300 hover:text-cyan-200 text-[10px] font-bold transition-all shadow-sm cursor-pointer"
        >
          <Search size={12} />
          <span className="hidden sm:inline">Ctrl+K</span>
        </button>

        {/* Sound toggle */}
        <button
          onClick={toggleSound}
          title="静音/开启音效"
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            state.soundEnabled ? 'text-yellow-400 bg-yellow-950/60 border border-yellow-500/40' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          {state.soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>

        {/* Digital Clock */}
        <div
          style={{ color: 'var(--theme-title-color)' }}
          className="font-mono font-bold tracking-widest pl-1 border-l border-slate-800 text-[11px]"
        >
          {time}
        </div>
      </div>
    </header>
  );
};
