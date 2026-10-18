import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { SoundFX } from '../../audio/SoundFX';
import { useGame } from '../../context/GameContext';

type TrackType = 'kick' | 'snare' | 'hihat' | 'openhat' | 'synth1' | 'synth2' | 'arp';

interface TrackConfig {
  id: TrackType;
  name: string;
  icon: string;
  activeColor: string;
}

const TRACKS: TrackConfig[] = [
  { id: 'kick', name: 'Kick (底鼓)', icon: '🥁', activeColor: 'bg-red-500 shadow-neon-pink' },
  { id: 'snare', name: 'Snare (军鼓)', icon: '💥', activeColor: 'bg-yellow-400 shadow-neon-gold' },
  { id: 'hihat', name: 'Closed Hat (闭镲)', icon: '🔔', activeColor: 'bg-cyan-400 shadow-neon-cyan' },
  { id: 'openhat', name: 'Open Hat (开镲)', icon: '🌊', activeColor: 'bg-blue-400 shadow-neon-cyan' },
  { id: 'synth1', name: '8Bit Lead (主音)', icon: '🎹', activeColor: 'bg-purple-400 shadow-neon-pink' },
  { id: 'arp', name: 'Arp (快速琶音)', icon: '✨', activeColor: 'bg-pink-400 shadow-neon-pink' },
  { id: 'synth2', name: 'Sub-Bass (重低音)', icon: '🎸', activeColor: 'bg-green-400 shadow-neon-green' },
];

const PRESETS: Record<string, boolean[][]> = {
  cyberpunk: [
    [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
    [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
    [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
    [true, false, true, false, false, true, false, true, true, false, true, false, false, true, true, false],
    [false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true],
    [true, false, false, true, false, false, true, false, true, false, false, true, false, false, true, false],
  ],
  moyu: [
    [true, false, false, false, false, false, true, false, true, false, false, false, false, false, true, false],
    [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    [false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true],
    [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    [true, false, false, true, false, true, false, false, true, false, false, true, false, false, false, false],
    [false, false, true, false, false, false, true, false, false, false, true, false, false, false, false, false],
    [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
  ],
  boss: [
    [true, true, false, false, true, true, false, false, true, true, false, false, true, true, false, false],
    [false, false, true, true, false, false, true, true, false, false, true, true, false, false, true, true],
    [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
    [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
    [true, true, false, true, true, false, true, true, false, true, true, false, true, true, false, true],
    [true, false, true, true, false, true, true, false, true, false, true, true, false, true, true, false],
    [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
  ],
  nightrain: [
    [true, false, false, false, false, false, true, false, false, false, false, false, true, false, false, false],
    [false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    [false, true, false, false, true, false, false, true, false, true, false, false, true, false, false, true],
    [false, false, false, true, false, false, true, false, false, false, false, true, false, false, true, false],
    [false, false, false, false, true, false, false, false, false, false, true, false, false, false, false, true],
    [false, false, true, false, false, false, false, false, false, false, false, false, false, true, false, false],
    [true, false, false, false, false, false, false, true, false, false, false, false, true, false, false, false],
  ],
  quantum: [
    [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, false],
    [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [true, true, false, false, true, true, false, false, true, true, false, false, true, true, false, false],
    [true, false, true, true, false, true, true, false, true, false, true, true, false, true, true, false],
    [true, false, false, true, false, false, true, false, true, false, false, true, false, false, true, false],
  ],
  vaporwave: [
    [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, true],
    [false, false, false, true, false, false, false, false, false, false, false, true, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, true, false, false],
    [true, false, false, false, false, true, false, false, true, false, false, false, false, true, false, false],
    [false, false, true, false, false, false, false, true, false, false, true, false, false, false, false, true],
    [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
  ],
};

const PIANO_KEYS = [
  { note: 'C4', freq: 261.63, key: 'A', isBlack: false },
  { note: 'C#4', freq: 277.18, key: 'W', isBlack: true },
  { note: 'D4', freq: 293.66, key: 'S', isBlack: false },
  { note: 'D#4', freq: 311.13, key: 'E', isBlack: true },
  { note: 'E4', freq: 329.63, key: 'D', isBlack: false },
  { note: 'F4', freq: 349.23, key: 'F', isBlack: false },
  { note: 'F#4', freq: 369.99, key: 'T', isBlack: true },
  { note: 'G4', freq: 392.00, key: 'G', isBlack: false },
  { note: 'G#4', freq: 415.30, key: 'Y', isBlack: true },
  { note: 'A4', freq: 440.00, key: 'H', isBlack: false },
  { note: 'A#4', freq: 466.16, key: 'U', isBlack: true },
  { note: 'B4', freq: 493.88, key: 'J', isBlack: false },
  { note: 'C5', freq: 523.25, key: 'K', isBlack: false },
  { note: 'C#5', freq: 554.37, key: 'O', isBlack: true },
  { note: 'D5', freq: 587.33, key: 'L', isBlack: false },
  { note: 'D#5', freq: 622.25, key: 'P', isBlack: true },
  { note: 'E5', freq: 659.25, key: ';', isBlack: false },
];

export const SynthwaveApp: React.FC = () => {
  const { activeWindowId, state, setPrefs } = useGame();
  const isMainWindow = activeWindowId === 'synthwave';
  // The edited pattern & bpm live in the global save — your track survives reloads
  const [grid, setGrid] = useState<boolean[][]>(state.prefs.synthGrid);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(state.prefs.synthBpm);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [activePianoNote, setActivePianoNote] = useState<string | null>(null);

  const stepRef = useRef<number>(0);
  // Latest grid for the sequencer loop — keeps the beat phase stable while editing cells
  const gridRef = useRef(grid);
  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);

  const toggleCell = (trackIdx: number, stepIdx: number) => {
    SoundFX.playDrum(TRACKS[trackIdx].id, stepIdx * 20);
    // setPrefs() used to sit inside the setGrid updater — StrictMode runs updaters
    // twice, so every click wrote the global save twice.
    const next = gridRef.current.map((row) => [...row]);
    next[trackIdx][stepIdx] = !next[trackIdx][stepIdx];
    setGrid(next);
    setPrefs({ synthGrid: next });
  };

  const clearGrid = () => {
    const empty = Array.from({ length: TRACKS.length }, () => new Array(16).fill(false));
    setGrid(empty);
    setPrefs({ synthGrid: empty });
  };

  const randomizeGrid = () => {
    // README advertises 「随机生成」; only presets and a clear button existed.
    const density: Record<string, number> = { kick: 0.3, snare: 0.18, hihat: 0.5, lead: 0.28, bass: 0.3 };
    const next = TRACKS.map((t) =>
      Array.from({ length: 16 }, (_, step) => Math.random() < (density[t.id] ?? 0.25) || (t.id === 'kick' && step % 4 === 0)),
    );
    setGrid(next);
    setPrefs({ synthGrid: next });
    SoundFX.playLevelUp();
  };

  const loadPreset = (name: string) => {
    if (PRESETS[name]) {
      setGrid(PRESETS[name]);
      setPrefs({ synthGrid: PRESETS[name] });
      SoundFX.playLevelUp();
    }
  };

  const playPiano = (keyObj: (typeof PIANO_KEYS)[0]) => {
    SoundFX.playPianoNote(keyObj.freq, 'square');
    setActivePianoNote(keyObj.note);
    setTimeout(() => setActivePianoNote(null), 200);
  };

  // Keyboard shortcut for piano (only while this window is the active one)
  useEffect(() => {
    if (!isMainWindow) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // A-G are piano keys, so typing them into the todo list, the terminal or the
      // save-code field used to play the instrument on every keystroke.
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      const matched = PIANO_KEYS.find((k) => k.key.toLowerCase() === e.key.toLowerCase());
      if (matched) playPiano(matched);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMainWindow]);

  // Audio Sequencer Loop
  useEffect(() => {
    if (!isPlaying) {
      setCurrentStep(0);
      stepRef.current = 0;
      return;
    }

    const intervalMs = (60 / bpm / 4) * 1000;
    const timer = setInterval(() => {
      const step = stepRef.current;
      setCurrentStep(step);

      gridRef.current.forEach((row, trackIdx) => {
        if (row[step]) {
          const trackType = TRACKS[trackIdx].id;
          const pitch = (step % 8) * 35;
          SoundFX.playDrum(trackType, pitch);
        }
      });

      stepRef.current = (step + 1) % 16;
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, bpm]);

  return (
    <div className="flex flex-col h-full space-y-2 font-mono text-xs select-none">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/80 border border-cyan-500/30">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all ${
              isPlaying ? 'bg-red-500 text-white shadow-neon-pink' : 'bg-cyan-500 text-slate-950 shadow-neon-cyan'
            }`}
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
            <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
          </button>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold">{bpm} BPM</span>
            <input
              type="range"
              min={70}
              max={180}
              value={bpm}
              onChange={(e) => {
                const v = Number(e.target.value);
                setBpm(v);
                setPrefs({ synthBpm: v });
              }}
              className="w-16 accent-cyan-400 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => loadPreset('cyberpunk')} className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 text-[9px]">
            霓虹朋克
          </button>
          <button onClick={() => loadPreset('moyu')} className="px-2 py-0.5 rounded bg-pink-950 border border-pink-500/40 text-pink-300 text-[9px]">
            摸鱼LoFi
          </button>
          <button onClick={() => loadPreset('boss')} className="px-2 py-0.5 rounded bg-purple-950 border border-purple-500/40 text-purple-300 text-[9px]">
            Boss战斗
          </button>
          <button onClick={() => loadPreset('nightrain')} className="px-2 py-0.5 rounded bg-blue-950 border border-blue-500/40 text-blue-300 text-[9px]">
            赛博夜雨
          </button>
          <button onClick={() => loadPreset('quantum')} className="px-2 py-0.5 rounded bg-green-950 border border-green-500/40 text-green-300 text-[9px]">
            量子跃迁
          </button>
          <button onClick={() => loadPreset('vaporwave')} className="px-2 py-0.5 rounded bg-amber-950 border border-amber-500/40 text-amber-300 text-[9px]">
            蒸汽波
          </button>
          <button onClick={randomizeGrid} className="px-2 py-0.5 rounded bg-fuchsia-950 border border-fuchsia-500/40 text-fuchsia-300 text-[9px]" title="按各轨道密度随机生成一段节奏">
            🎲 随机生成
          </button>
          <button onClick={clearGrid} className="p-1 rounded bg-slate-800 text-slate-400">
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* 7 Tracks Sequencer Grid */}
      <div className="flex-1 p-2 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between overflow-x-auto space-y-1">
        <div className="space-y-1.5 min-w-[480px]">
          {TRACKS.map((track, trackIdx) => (
            <div key={track.id} className="flex items-center gap-2">
              <div className="w-24 flex items-center gap-1 text-slate-300 font-bold truncate">
                <span>{track.icon}</span>
                <span className="text-[10px] truncate">{track.name.split('(')[0]}</span>
              </div>

              <div className="flex-1 grid grid-cols-16 gap-1">
                {grid[trackIdx]?.map((active, stepIdx) => {
                  const isCurrent = isPlaying && currentStep === stepIdx;
                  const isQuarter = stepIdx % 4 === 0;

                  return (
                    <button
                      key={stepIdx}
                      onClick={() => toggleCell(trackIdx, stepIdx)}
                      className={`h-6 rounded transition-all border ${
                        active
                          ? track.activeColor
                          : isQuarter
                          ? 'bg-slate-900 border-slate-700 hover:border-cyan-400'
                          : 'bg-slate-950 border-slate-800'
                      } ${isCurrent ? 'ring-2 ring-white scale-110 z-10 brightness-150' : ''}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Piano Keyboard (Bottom) */}
      <div className="p-2 rounded-xl bg-slate-900/90 border border-cyan-500/30">
        <div className="text-[10px] text-slate-400 mb-1 flex items-center justify-between">
          <span>🎹 实时弹奏电子琴 (两个八度，键盘 A W S E D F T G Y H U J K O L P ;):</span>
          {activePianoNote && <span className="text-yellow-400 font-bold">{activePianoNote}</span>}
        </div>
        <div className="flex items-center justify-center gap-1 h-14">
          {PIANO_KEYS.map((k) => (
            <button
              key={k.note}
              onClick={() => playPiano(k)}
              className={`h-full rounded-b transition-all flex flex-col items-center justify-end pb-1 font-bold ${
                k.isBlack
                  ? 'w-7 bg-slate-950 text-cyan-400 border border-cyan-500/40 shadow-sm text-[9px] hover:bg-slate-900 -mx-1 z-10'
                  : 'w-9 bg-slate-200 text-slate-950 border border-slate-400 text-[10px] hover:bg-white shadow-md'
              } ${activePianoNote === k.note ? 'scale-95 bg-cyan-400 text-slate-950 ring-2 ring-yellow-400' : ''}`}
            >
              <span>{k.note.replace('4', '').replace('5', '')}</span>
              <span className="text-[8px] opacity-60">[{k.key}]</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
