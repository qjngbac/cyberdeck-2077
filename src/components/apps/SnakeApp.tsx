import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Trophy, Shield, Play, Pause } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';
import { isGachaSeriesComplete, formatCredits } from '../../utils/gameLogic';

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type FoodType = 'bug' | 'ram' | 'gold' | 'magnet';
type SnakeMode = 'classic' | 'speed' | 'maze';

interface Point {
  x: number;
  y: number;
}
interface Food extends Point {
  type: FoodType;
}

const GRID_SIZE = 18;
/** Two buffered turns: a fast UP→LEFT inside a single tick used to swallow the second key. */
const MAX_INPUT_QUEUE = 2;

/** The real spawn bag (5 slots, 'bug' twice) → 40% / 20% / 20% / 20%. The odds panel below is
 *  rendered FROM this array, so the published probabilities can never drift away from the code. */
const FOOD_BAG: FoodType[] = ['bug', 'bug', 'ram', 'gold', 'magnet'];

const FOOD_META: Record<FoodType, { label: string; icon: string; points: number; merit: number; color: string; perk: string }> = {
  bug: { label: '普通 Bug', icon: '🐛', points: 10, merit: 0, color: '#00ff66', perk: '基础得分' },
  ram: { label: '加班拉面', icon: '🍜', points: 25, merit: 0, color: '#b000ff', perk: '中等奖励' },
  gold: { label: '金币数据块', icon: '🟡', points: 50, merit: 50, color: '#ffd700', perk: '额外 +50 功德' },
  magnet: { label: '磁暴护盾', icon: '🧲', points: 30, merit: 0, color: '#ff0055', perk: '一次性撞墙传送' },
};

const OPPOSITE: Record<Direction, Direction> = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: 'UP', w: 'UP', W: 'UP',
  ArrowDown: 'DOWN', s: 'DOWN', S: 'DOWN',
  ArrowLeft: 'LEFT', a: 'LEFT', A: 'LEFT',
  ArrowRight: 'RIGHT', d: 'RIGHT', D: 'RIGHT',
};

const INITIAL_SNAKE: Point[] = [
  { x: 8, y: 8 },
  { x: 8, y: 9 },
  { x: 8, y: 10 },
];

/** Maze walls kept as a pure function: resetGame must hand them straight to spawnFood, because
 *  setObstacles() has not landed yet and the old closure still saw the previous [] (food in a wall). */
const makeObstacles = (mode: SnakeMode): Point[] =>
  mode === 'maze'
    ? [
        { x: 4, y: 4 }, { x: 4, y: 5 }, { x: 4, y: 6 },
        { x: 13, y: 11 }, { x: 13, y: 12 }, { x: 13, y: 13 },
        { x: 8, y: 4 }, { x: 9, y: 4 },
      ]
    : [];

export const SnakeApp: React.FC = () => {
  const { addCredits, addMerit, state, setSnakeHighScore, setPrefs, activeWindowId, notify } = useGame();
  // Skin & mode preferences survive reloads
  const [mode, setMode] = useState<SnakeMode>(state.prefs.snakeMode);
  const [skin, setSkin] = useState(state.prefs.snakeSkin);

  const [snake, setSnake] = useState<Point[]>(INITIAL_SNAKE);
  const [food, setFood] = useState<Food>({ x: 4, y: 4, type: 'bug' });
  const [obstacles, setObstacles] = useState<Point[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [overReason, setOverReason] = useState('');
  const [score, setScore] = useState(0);
  const [hasShield, setHasShield] = useState(false);
  // Score is paid out 1:1 as credits — show what addCredits actually credited
  const [payout, setPayout] = useState<{ requested: number; credited: number }>({ requested: 0, credited: 0 });

  const bestScore = Math.max(state.snakeHighScore, score);

  const snakeRef = useRef<Point[]>(snake);
  const dirRef = useRef<Direction>('UP');
  const inputQueueRef = useRef<Direction[]>([]);
  const foodRef = useRef<Food>(food);
  const obstaclesRef = useRef<Point[]>(obstacles);
  const shieldRef = useRef(false);
  const scoreRef = useRef(0);
  const overRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [boardSize, setBoardSize] = useState(300);

  // Only booleans here — the 1s global tick produces a new `state` object every second, and putting
  // `state`/`score`/`food` straight into the loop deps rebuilt the interval once per second (lost beats).
  const hasCyberSynergy = useMemo(() => isGachaSeriesComplete(state, 'cyber'), [state]);
  const speedTier = Math.floor(score / 50);

  const isActiveWindow = activeWindowId === 'snake-arcade';

  const finishRun = useCallback((reason: string, isWin: boolean = false) => {
    if (overRef.current) return;
    overRef.current = true;
    setGameOver(true);
    setIsPlaying(false);
    setPaused(false);
    setOverReason(reason);
    if (isWin) SoundFX.playLevelUp();
    else SoundFX.playAlert();
  }, []);

  /** Sample uniformly over the FREE cells: no rejection loop, so a nearly full board cannot hang. */
  const spawnFood = useCallback((currentSnake: Point[], blocked: Point[]) => {
    const taken = new Set<string>();
    currentSnake.forEach((p) => taken.add(`${p.x},${p.y}`));
    blocked.forEach((p) => taken.add(`${p.x},${p.y}`));
    const free: Point[] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (!taken.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (free.length === 0) {
      finishRun('🏆 蛇身填满了整张棋盘 —— 完美通关，无食物可放了！', true);
      return;
    }
    const spot = free[Math.floor(Math.random() * free.length)];
    const type = FOOD_BAG[Math.floor(Math.random() * FOOD_BAG.length)];
    const next: Food = { x: spot.x, y: spot.y, type };
    foodRef.current = next;
    setFood(next);
  }, [finishRun]);

  /** Reset the board. `start` decides whether the loop begins immediately (mode switch parks it). */
  const prepareGame = useCallback((nextMode: SnakeMode, start: boolean) => {
    const obs = makeObstacles(nextMode);
    obstaclesRef.current = obs;
    setObstacles(obs);
    snakeRef.current = INITIAL_SNAKE;
    setSnake(INITIAL_SNAKE);
    dirRef.current = 'UP';
    inputQueueRef.current = [];
    shieldRef.current = false;
    setHasShield(false);
    scoreRef.current = 0;
    setScore(0);
    setPayout({ requested: 0, credited: 0 });
    overRef.current = false;
    setGameOver(false);
    setOverReason('');
    setPaused(false);
    spawnFood(INITIAL_SNAKE, obs);
    setIsPlaying(start);
  }, [spawnFood]);

  const resetGame = () => {
    prepareGame(mode, true);
    SoundFX.playKeyClick();
  };

  const switchMode = (next: SnakeMode) => {
    setMode(next);
    setPrefs({ snakeMode: next });
    prepareGame(next, false);
    notify({
      title: `已切换到${next === 'classic' ? '经典' : next === 'speed' ? '极速' : '迷宫'}模式`,
      body: `棋盘已重置并停在一拍之外，得分与护盾清零。极速模式得分 ×2，迷宫模式有 8 堵实体墙。点「开始」出发。`,
      icon: '🕹️',
      tone: 'info',
    });
  };

  const pushDirection = useCallback((next: Direction) => {
    const queue = inputQueueRef.current;
    // Guard against the direction the snake will ACTUALLY be facing when this input lands,
    // i.e. the tail of the queue, not the direction of the previous tick.
    const last = queue.length > 0 ? queue[queue.length - 1] : dirRef.current;
    if (last === next || OPPOSITE[last] === next) return;
    if (queue.length >= MAX_INPUT_QUEUE) return;
    queue.push(next);
  }, []);

  // Keyboard (only while this window is the active one)
  useEffect(() => {
    if (!isActiveWindow) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return; // 别把 Ctrl+D / Cmd+S 之类的浏览器快捷键吃掉
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const next = KEY_TO_DIR[e.key];
      if (!next) return;
      if (!isPlaying || gameOver) return;
      // 方向键默认会滚动窗口内容，操控期间必须吃掉默认行为
      e.preventDefault();
      pushDirection(next);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActiveWindow, isPlaying, gameOver, pushDirection]);

  // Persist a new best score when the run ends
  useEffect(() => {
    if (gameOver && score > 0) setSnakeHighScore(score);
  }, [gameOver, score, setSnakeHighScore]);

  // Main Loop — refs carry food/score/shield/obstacles, so only real rule changes rebuild the timer
  useEffect(() => {
    if (!isPlaying || gameOver || paused || !isActiveWindow) return;

    const baseInterval = mode === 'speed' ? 70 : 130;
    const boosted = hasCyberSynergy ? Math.round(baseInterval * 0.82) : baseInterval;
    const intervalMs = Math.max(50, boosted - speedTier * 8);

    const timer = setInterval(() => {
      const queued = inputQueueRef.current.shift();
      if (queued) dirRef.current = queued;

      const prev = snakeRef.current;
      const head = prev[0];
      const newHead = { ...head };
      const currentDir = dirRef.current;
      if (currentDir === 'UP') newHead.y -= 1;
      if (currentDir === 'DOWN') newHead.y += 1;
      if (currentDir === 'LEFT') newHead.x -= 1;
      if (currentDir === 'RIGHT') newHead.x += 1;

      // Collision with the outer wall — the magnet shield teleports once, and only once
      if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
        if (shieldRef.current) {
          shieldRef.current = false;
          setHasShield(false);
          newHead.x = (newHead.x + GRID_SIZE) % GRID_SIZE;
          newHead.y = (newHead.y + GRID_SIZE) % GRID_SIZE;
          SoundFX.playCash();
          notify({ title: '🧲 磁暴护盾已消耗', body: '护盾把你从墙上弹回了棋盘对角，下一次撞墙就是终点。', icon: '🛡️', tone: 'warn' });
        } else {
          finishRun('💥 一头撞在电子围墙上，赛博蛇当场短路。');
          return;
        }
      }

      // Collision with maze walls or the snake's own body — note: checked BEFORE eating,
      // which is exactly why a food spawned inside a wall used to make the run unscoreable.
      const obs = obstaclesRef.current;
      if (prev.some((seg) => seg.x === newHead.x && seg.y === newHead.y) || obs.some((o) => o.x === newHead.x && o.y === newHead.y)) {
        finishRun(obs.some((o) => o.x === newHead.x && o.y === newHead.y) ? '🧱 撞上了迷宫的防火墙碎片。' : '🌀 咬到了自己的机械尾巴。');
        return;
      }

      const newSnake = [newHead, ...prev];
      const meal = foodRef.current;
      const isEaten = newHead.x === meal.x && newHead.y === meal.y;
      const isAbsorbed = hasCyberSynergy && !isEaten && Math.abs(newHead.x - meal.x) <= 1 && Math.abs(newHead.y - meal.y) <= 1;

      if (isEaten || isAbsorbed) {
        const meta = FOOD_META[meal.type];
        const pts = mode === 'speed' ? meta.points * 2 : meta.points;
        const creditedNow = addCredits(pts);
        if (meta.merit > 0) addMerit(meta.merit);

        scoreRef.current += pts;
        setScore(scoreRef.current);
        setPayout((p) => ({ requested: p.requested + pts, credited: p.credited + creditedNow }));

        if (meal.type === 'magnet') {
          shieldRef.current = true;
          setHasShield(true);
          SoundFX.playLevelUp();
          notify({
            title: '🛡️ 护盾就绪',
            body: 'HUD 上的护盾徽章已点亮：接下来第一次撞墙会被传送回棋盘对角而不是当场结束。',
            icon: '🛡️',
            tone: 'purple',
          });
        } else {
          SoundFX.playLevelUp();
        }

        // 吸附（机甲羁绊）与吃到完全等价：蛇身同样增长
        snakeRef.current = newSnake;
        setSnake(newSnake);
        spawnFood(newSnake, obstaclesRef.current);
      } else {
        const trimmed = newSnake.slice(0, -1);
        snakeRef.current = trimmed;
        setSnake(trimmed);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, gameOver, paused, isActiveWindow, mode, speedTier, hasCyberSynergy, spawnFood, finishRun, addCredits, addMerit, notify]);

  // Fit the board to its container and render at device resolution (was a hardcoded 300px canvas)
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = (entries?: ResizeObserverEntry[]) => {
      const box = entries?.[0]?.contentRect ?? el.getBoundingClientRect();
      const next = Math.max(160, Math.floor(Math.min(box.width, box.height)));
      setBoardSize((prev) => (Math.abs(prev - next) > 2 ? next : prev));
    };
    measure();
    const ro = new ResizeObserver((entries) => measure(entries));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(boardSize * dpr);
    canvas.height = Math.round(boardSize * dpr);
    canvas.style.width = `${boardSize}px`;
    canvas.style.height = `${boardSize}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cellSize = boardSize / GRID_SIZE;

    ctx.fillStyle = '#06080e';
    ctx.fillRect(0, 0, boardSize, boardSize);

    // Draw Grid
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, boardSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(boardSize, i * cellSize);
      ctx.stroke();
    }

    // Draw Obstacles
    obstacles.forEach((obs) => {
      ctx.fillStyle = '#475569';
      ctx.fillRect(obs.x * cellSize + 1, obs.y * cellSize + 1, cellSize - 2, cellSize - 2);
    });

    // Draw Food
    const fx = food.x * cellSize + cellSize / 2;
    const fy = food.y * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.arc(fx, fy, cellSize / 2.3, 0, Math.PI * 2);
    ctx.fillStyle = FOOD_META[food.type].color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = ctx.fillStyle;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Skin colors
    const skinColors = {
      cyan: '#00f0ff',
      gold: '#ffd700',
      green: '#00ff66',
      purple: '#b000ff',
    };
    const primaryColor = skinColors[skin];

    // Draw Snake
    snake.forEach((seg, idx) => {
      const isHead = idx === 0;
      ctx.fillStyle = isHead ? primaryColor : primaryColor + '99';
      ctx.beginPath();
      ctx.roundRect(seg.x * cellSize + 1.5, seg.y * cellSize + 1.5, cellSize - 3, cellSize - 3, 3);
      if (isHead) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = primaryColor;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // A shield you cannot see is not a mechanic — ring the head while it is armed
      if (isHead && hasShield) {
        ctx.beginPath();
        ctx.strokeStyle = '#ff0055';
        ctx.lineWidth = 2;
        ctx.arc(seg.x * cellSize + cellSize / 2, seg.y * cellSize + cellSize / 2, cellSize * 0.85, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    });
  }, [snake, food, obstacles, skin, hasShield, boardSize]);

  return (
    <div className="flex flex-col h-full space-y-2 font-mono text-xs select-none">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-cyan-500/30">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-cyan-300">得分: {score}</span>
          <span className="text-yellow-400 font-bold flex items-center gap-1"><Trophy size={13} /> 最佳: {bestScore}</span>
          <span className="text-green-400 font-bold">已入账: {formatCredits(payout.credited)}</span>
          <span className={`flex items-center gap-1 font-bold ${hasShield ? 'text-pink-400 animate-pulse' : 'text-slate-600'}`}>
            <Shield size={13} /> 护盾: {hasShield ? '就绪' : '无'}
          </span>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-1">
          {(['classic', 'speed', 'maze'] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${mode === m ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}
            >
              {m === 'classic' ? '经典' : m === 'speed' ? '极速' : '迷宫'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-2">
        <div className="flex items-center gap-1.5">
          <button onClick={resetGame} className="px-2.5 py-1 rounded bg-green-500 hover:bg-green-400 text-slate-950 font-bold text-[10px]">
            {isPlaying ? '重开' : '开始'}
          </button>
          <button
            onClick={() => setPaused((p) => !p)}
            disabled={!isPlaying || gameOver}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-[10px] disabled:opacity-40 flex items-center gap-1"
          >
            {paused ? <Play size={11} /> : <Pause size={11} />}
            {paused ? '继续' : '暂停'}
          </button>
        </div>
        <div className="text-right text-[9px] leading-tight text-slate-400">
          <div>一拍 = {Math.max(50, Math.round((mode === 'speed' ? 70 : 130) * (hasCyberSynergy ? 0.82 : 1)) - speedTier * 8)}ms（每 50 分提速 8ms）</div>
          <div>得分 1:1 折算赛博币；极速模式所有分值 ×2</div>
        </div>
      </div>

      {payout.credited < payout.requested && (
        <div className="px-2.5 py-1 rounded-lg bg-red-950/60 border border-red-500/50 text-red-300 text-[10px] font-bold shrink-0">
          ⚠️ 本局应有 {formatCredits(payout.requested)}，实际入账 {formatCredits(payout.credited)}（余额被钳在 0，差额已作废）。
        </div>
      )}

      {hasCyberSynergy && (
        <div className="px-2.5 py-1 rounded-lg bg-pink-950/60 border border-pink-500/50 text-pink-300 text-[10px] font-bold flex items-center justify-between shadow-neon-pink shrink-0">
          <span className="flex items-center gap-1.5">
            <span>🦾</span>
            <span>【荒原机甲羁绊激活】：移动加速 18% + 纳米磁场自动吸附周围所有食物与Bug！</span>
          </span>
          <span className="px-1.5 py-0.2 rounded bg-pink-500 text-white font-black text-[8px]">自动吸附</span>
        </div>
      )}

      {/* Arcade Canvas */}
      <div ref={boardRef} className="flex-1 relative min-h-0 overflow-hidden p-2 bg-slate-950 rounded-xl border border-slate-800">
        <canvas ref={canvasRef} className="absolute inset-0 m-auto rounded-lg shadow-2xl" />

        {!gameOver && isPlaying && !isActiveWindow && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-1">
            <div className="text-lg font-black text-cyan-300">⏸ 窗口未激活，已自动暂停</div>
            <div className="text-[10px] text-slate-400">最小化或点到别的窗口时蛇不会替你去死，回到本窗口即自动继续。</div>
          </div>
        )}

        {!gameOver && paused && isActiveWindow && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-1">
            <div className="text-lg font-black text-yellow-300">⏸ 已暂停</div>
            <button onClick={() => setPaused(false)} className="px-3 py-1 rounded bg-cyan-600 text-slate-950 font-bold text-[10px]">继续</button>
          </div>
        )}

        {!gameOver && !isPlaying && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-1">
            <div className="text-lg font-black text-cyan-300">🕹️ 准备出发</div>
            <div className="text-[10px] text-slate-400">方向键 / WASD 转向，也可用下方十字键。支持 2 格输入缓冲。</div>
            <button onClick={resetGame} className="mt-1 px-4 py-1.5 rounded-xl bg-green-500 text-slate-950 font-bold text-xs">开始</button>
          </div>
        )}

        {gameOver && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center space-y-2">
            <div className="text-2xl font-black text-red-400 text-glow-pink">GAME OVER</div>
            <div className="text-slate-300 text-xs px-3 text-center">{overReason}</div>
            <div className="text-slate-400 text-[10px]">
              本局得分 {score} → 应得 {formatCredits(payout.requested)}，实际入账 {formatCredits(payout.credited)}
            </div>
            <button onClick={resetGame} className="px-4 py-1.5 rounded-xl bg-cyan-600 text-slate-950 font-bold text-xs">
              再次挑战
            </button>
          </div>
        )}
      </div>

      {/* 概率公示 + 分值表：与 FOOD_BAG / FOOD_META 同源，改数值不会和文案打架 */}
      <div className="px-2 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800 text-[9px] space-y-1 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 font-bold">🎲 食物概率公示（每只蛇身长度独立抽取）</span>
          <span className="text-slate-500">迷宫模式：8 堵固定墙</span>
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {(['bug', 'ram', 'gold', 'magnet'] as const).map((t) => {
            const meta = FOOD_META[t];
            const chance = Math.round((FOOD_BAG.filter((x) => x === t).length / FOOD_BAG.length) * 100);
            return (
              <div key={t} className="flex items-center gap-1">
                <span style={{ color: meta.color }}>{meta.icon}</span>
                <span className="text-slate-300">{meta.label}</span>
                <span className="text-yellow-400 font-bold">{chance}%</span>
                <span className="text-slate-400">+{mode === 'speed' ? meta.points * 2 : meta.points}分{meta.merit ? `/${meta.merit}功德` : ''}·{meta.perk}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Skins & D-Pad */}
      <div className="flex items-center justify-between px-2 shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400">皮肤:</span>
          {(['cyan', 'gold', 'green', 'purple'] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setSkin(s); setPrefs({ snakeSkin: s }); }}
              className={`w-4 h-4 rounded-full border ${skin === s ? 'ring-2 ring-white' : 'opacity-60'}`}
              style={{ backgroundColor: s === 'cyan' ? '#00f0ff' : s === 'gold' ? '#ffd700' : s === 'green' ? '#00ff66' : '#b000ff' }}
            />
          ))}
        </div>

        <div className="flex gap-1.5">
          <button onClick={() => pushDirection('UP')} className="px-3 py-1 rounded bg-slate-800 hover:bg-cyan-900 text-cyan-300 font-bold">▲</button>
          <button onClick={() => pushDirection('LEFT')} className="px-3 py-1 rounded bg-slate-800 hover:bg-cyan-900 text-cyan-300 font-bold">◀</button>
          <button onClick={() => pushDirection('DOWN')} className="px-3 py-1 rounded bg-slate-800 hover:bg-cyan-900 text-cyan-300 font-bold">▼</button>
          <button onClick={() => pushDirection('RIGHT')} className="px-3 py-1 rounded bg-slate-800 hover:bg-cyan-900 text-cyan-300 font-bold">▶</button>
        </div>
      </div>
    </div>
  );
};
