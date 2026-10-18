import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Coffee, Droplets, Eye } from 'lucide-react';
import { SoundFX } from '../../audio/SoundFX';
import { useGame } from '../../context/GameContext';
import confetti from 'canvas-confetti';

interface AmbienceTrack {
  id: string;
  name: string;
  icon: string;
  active: boolean;
  volume: number;
}

/** Completion reward per focus mode — the pomodoro used to give nothing at all,
 *  while a health check-in paid $50, so the timer had no reason to exist. */
const TIMER_REWARD: Record<'focus' | 'rest' | 'moyu', { credits: number; merit: number; label: string }> = {
  focus: { credits: 120, merit: 120, label: '25 分钟深度专注' },
  rest: { credits: 40, merit: 40, label: '5 分钟小憩' },
  moyu: { credits: 70, merit: 70, label: '15 分钟带薪摸鱼' },
};

export const AmbienceApp: React.FC = () => {
  const { addCredits, addMerit, state, setHealthCheckIn, setPrefs, notify } = useGame();
  // The volume mix is remembered in the save (active toggles are session-only —
  // browsers can't auto-resume audio without a user gesture anyway)
  const savedVolumes = state.prefs.ambienceVolumes ?? {};
  const [tracks, setTracks] = useState<AmbienceTrack[]>([
    { id: 'rain', name: '雨夜霓虹', icon: '🌧️', active: false, volume: savedVolumes.rain ?? 0.6 },
    { id: 'server', name: '机房蜂鸣', icon: '🖥️', active: false, volume: savedVolumes.server ?? 0.5 },
    { id: 'neon', name: '深空脉冲', icon: '🌌', active: false, volume: savedVolumes.neon ?? 0.4 },
    { id: 'cafe', name: '赛博咖啡', icon: '☕', active: false, volume: savedVolumes.cafe ?? 0.5 },
    { id: 'fire', name: '篝火噼啪', icon: '🔥', active: false, volume: savedVolumes.fire ?? 0.5 },
    { id: 'ocean', name: '量子海浪', icon: '🌊', active: false, volume: savedVolumes.ocean ?? 0.5 },
  ]);

  const [timerMinutes, setTimerMinutes] = useState<number>(25);
  const [secondsLeft, setSecondsLeft] = useState<number>(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [mode, setMode] = useState<'focus' | 'rest' | 'moyu'>('focus');
  // Wall-clock deadline: counting down by "-1 per tick" stretched a 25 minute
  // focus block to 40+ minutes once the browser throttled the hidden tab.
  const timerEndAtRef = useRef<number>(0);

  // Health Check-in (persisted in the global save, auto-resets each day)
  const today = new Date().toDateString();
  const checkIns = state.healthCheckIns.date === today
    ? state.healthCheckIns
    : { date: today, water: false, eyes: false, stretch: false };

  const toggleTrack = (id: string) => {
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const nextActive = !t.active;
          SoundFX.setAmbienceTrack(t.id, nextActive, t.volume);
          return { ...t, active: nextActive };
        }
        return t;
      })
    );
  };

  const updateTrackVolume = (id: string, vol: number) => {
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          if (t.active) SoundFX.setAmbienceTrack(t.id, true, vol);
          return { ...t, volume: vol };
        }
        return t;
      })
    );
    setPrefs((prev) => ({ ...prev, ambienceVolumes: { ...prev.ambienceVolumes, [id]: vol } }));
  };

  const setTimerMode = (newMode: 'focus' | 'rest' | 'moyu') => {
    setMode(newMode);
    const mins = newMode === 'focus' ? 25 : newMode === 'rest' ? 5 : 15;
    setTimerMinutes(mins);
    setSecondsLeft(mins * 60);
    setIsTimerRunning(false);
    timerEndAtRef.current = 0;
  };

  useEffect(() => {
    if (!isTimerRunning) return;

    const tick = () => {
      const left = Math.max(0, Math.ceil((timerEndAtRef.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left > 0) return;

      setIsTimerRunning(false);
      timerEndAtRef.current = 0;
      const reward = TIMER_REWARD[mode];
      const gained = addCredits(reward.credits);
      addMerit(reward.merit);
      SoundFX.playLevelUp();
      confetti({ particleCount: 70, spread: 80 });
      notify({
        title: `⏰ ${reward.label}完成`,
        body: gained > 0 ? `奖励已到账：+${gained} 赛博币、+${reward.merit} 功德。起来走走吧！` : '计时完成，起来走走吧！',
        icon: '☕',
        tone: 'success',
      });
    };

    tick();
    const id = setInterval(tick, 1000);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isTimerRunning, mode, addCredits, addMerit, notify]);

  const toggleTimer = () => {
    if (isTimerRunning) {
      // pause: freeze the remaining seconds and drop the deadline
      setSecondsLeft(Math.max(0, Math.ceil((timerEndAtRef.current - Date.now()) / 1000)));
      timerEndAtRef.current = 0;
      setIsTimerRunning(false);
      return;
    }
    const remaining = secondsLeft > 0 ? secondsLeft : timerMinutes * 60;
    if (remaining <= 0) return;
    timerEndAtRef.current = Date.now() + remaining * 1000;
    setIsTimerRunning(true);
  };

  useEffect(() => {
    return () => {
      SoundFX.stopAllAmbience();
    };
  }, []);

  const handleCheckIn = (type: 'water' | 'eyes' | 'stretch') => {
    if (checkIns[type]) return;
    SoundFX.playCash();
    setHealthCheckIn(type);

    const next = { ...checkIns, [type]: true };
    if (next.water && next.eyes && next.stretch) {
      SoundFX.playLevelUp();
      confetti({ particleCount: 60, spread: 70 });
      addCredits(50);
      addMerit(50);
      notify({ title: '🎉 今日健康打卡全部完成', body: '奖励已到账：+₵50 赛博币与 +50 功德。', icon: '💧', tone: 'success' });
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full space-y-2.5 font-mono text-xs select-none">
      {/* 6-Track Ambience Mixer */}
      <div className="p-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30">
        <div className="text-[11px] font-bold text-cyan-300 mb-2 flex items-center justify-between">
          <span>🎚️ 6 轨道声学白噪音混音台 (多轨道叠加混合)</span>
          <span className="text-[9px] text-slate-400">已激活 {tracks.filter((t) => t.active).length} 轨</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {tracks.map((t) => (
            <div
              key={t.id}
              className={`p-2 rounded-lg border transition-all flex flex-col justify-between ${
                t.active ? 'bg-cyan-950/60 border-cyan-400 shadow-neon-cyan' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <button
                  onClick={() => toggleTrack(t.id)}
                  className="flex items-center gap-1.5 font-bold text-[11px] text-slate-200 hover:text-cyan-300"
                >
                  <span className="text-base">{t.icon}</span>
                  <span>{t.name}</span>
                </button>
                <button
                  onClick={() => toggleTrack(t.id)}
                  className={`w-3 h-3 rounded-full border ${t.active ? 'bg-green-400 shadow-neon-green' : 'bg-slate-700'}`}
                />
              </div>

              <div className="flex items-center gap-1.5 mt-2">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={t.volume}
                  onChange={(e) => updateTrackVolume(t.id, Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer h-1"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pomodoro Timer */}
      <div className="flex-1 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col items-center justify-between">
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button onClick={() => setTimerMode('focus')} className={`px-2.5 py-1 rounded text-xs font-bold ${mode === 'focus' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}>
            💻 深度专注 (25m)
          </button>
          <button onClick={() => setTimerMode('rest')} className={`px-2.5 py-1 rounded text-xs font-bold ${mode === 'rest' ? 'bg-green-600 text-white' : 'text-slate-400'}`}>
            ☕ 小憩放松 (5m)
          </button>
          <button onClick={() => setTimerMode('moyu')} className={`px-2.5 py-1 rounded text-xs font-bold ${mode === 'moyu' ? 'bg-yellow-600 text-white' : 'text-slate-400'}`}>
            📿 带薪摸鱼 (15m)
          </button>
        </div>

        <div className="text-5xl font-black text-cyan-300 font-mono tracking-widest text-glow-cyan my-1">
          {formatTime(secondsLeft)}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTimer}
            className={`px-5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 ${
              isTimerRunning ? 'bg-red-600 text-white shadow-neon-pink' : 'bg-cyan-500 text-slate-950 shadow-neon-cyan'
            }`}
          >
            {isTimerRunning ? <Pause size={13} /> : <Play size={13} />}
            <span>{isTimerRunning ? '暂停计时' : '开始计时'}</span>
          </button>
          <button
            onClick={() => { setIsTimerRunning(false); timerEndAtRef.current = 0; setSecondsLeft(timerMinutes * 60); }}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300"
          >
            <RotateCcw size={13} />
          </button>
        </div>

        {/* Health Check-ins */}
        <div className="w-full grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-[10px] text-center">
          <button
            onClick={() => handleCheckIn('water')}
            className={`p-1.5 rounded flex items-center justify-center gap-1 border transition-colors ${
              checkIns.water ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Droplets size={12} className={checkIns.water ? 'text-cyan-400' : ''} />
            <span>喝水打卡 {checkIns.water ? '✓' : ''}</span>
          </button>

          <button
            onClick={() => handleCheckIn('eyes')}
            className={`p-1.5 rounded flex items-center justify-center gap-1 border transition-colors ${
              checkIns.eyes ? 'bg-green-950 border-green-500 text-green-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye size={12} className={checkIns.eyes ? 'text-green-400' : ''} />
            <span>远眺打卡 {checkIns.eyes ? '✓' : ''}</span>
          </button>

          <button
            onClick={() => handleCheckIn('stretch')}
            className={`p-1.5 rounded flex items-center justify-center gap-1 border transition-colors ${
              checkIns.stretch ? 'bg-yellow-950 border-yellow-500 text-yellow-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Coffee size={12} className={checkIns.stretch ? 'text-yellow-400' : ''} />
            <span>拉伸打卡 {checkIns.stretch ? '✓' : ''}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
