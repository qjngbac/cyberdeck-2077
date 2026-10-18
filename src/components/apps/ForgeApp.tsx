import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Flame, RefreshCw, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';
import { DAILY_LIMITS, FORGE_TIERS, formatCredits, getSellPrice } from '../../utils/gameLogic';

const GRID_SIZE = 4;
const MAX_TIER = FORGE_TIERS.length; // 只有 8 阶，两枚 8 阶再合就「超脱」
const TRANSCEND_MERIT = 1200;
const TRANSCEND_CREDITS = 600;
const FORGE_LIMIT = DAILY_LIMITS.forge; // soft:10 / tail:0 —— 出炉满 10 件后只给功德不入包

/** 投料概率（界面公示）：期望回收价低于矿石本身，不再能脚本化套利。 */
const ORE_ODDS: { lvl: number; p: number }[] = [
  { lvl: 1, p: 0.5 },
  { lvl: 2, p: 0.4 },
  { lvl: 3, p: 0.1 },
];

type Dir = 'left' | 'right' | 'up' | 'down';

const rarityOf = (lvl: number): 'common' | 'rare' | 'epic' | 'legendary' =>
  lvl >= 7 ? 'legendary' : lvl >= 5 ? 'epic' : lvl >= 3 ? 'rare' : 'common';

const oreEv = Math.round(ORE_ODDS.reduce((acc, o) => acc + o.p * getSellPrice(FORGE_TIERS[o.lvl - 1].name, rarityOf(o.lvl)), 0));
const oreSell = getSellPrice('九天玄晶矿石', 'rare');

/* 出炉额度与历史最佳必须活过「关窗即卸载」，所以落到 localStorage；
   核心层的 daily.counters.forge 一旦被别的入口写入，这里也会一并计入（取较大值）。 */
const LS_DAILY_KEY = 'CYBERDECK_OS_2077_FORGE_DAILY';
const LS_BEST_KEY = 'CYBERDECK_OS_2077_FORGE_BEST';
const todayKey = () => new Date().toDateString();

interface ForgeDaily { date: string; count: number }
interface ForgeBest { score: number; tier: number; forged: number }

function readLS(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLS(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储不可用：额度退回「本会话有效」，不阻塞玩法
  }
}

function readDailyMint(): number {
  const raw = readLS(LS_DAILY_KEY) as ForgeDaily | null;
  if (!raw || raw.date !== todayKey() || !Number.isFinite(raw.count)) return 0;
  return Math.max(0, Math.floor(raw.count));
}

function readBest(): ForgeBest {
  const raw = readLS(LS_BEST_KEY) as Partial<ForgeBest> | null;
  const whole = (v: unknown, max?: number) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(v)))
      : 0;
  return { score: whole(raw?.score), tier: Math.max(1, whole(raw?.tier, MAX_TIER)), forged: whole(raw?.forged) };
}

function createInitialBoard(): number[][] {
  const b = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0));
  const r1 = Math.floor(Math.random() * GRID_SIZE);
  const c1 = Math.floor(Math.random() * GRID_SIZE);
  b[r1][c1] = 1;
  let r2 = Math.floor(Math.random() * GRID_SIZE);
  let c2 = Math.floor(Math.random() * GRID_SIZE);
  while (r2 === r1 && c2 === c1) {
    r2 = Math.floor(Math.random() * GRID_SIZE);
    c2 = Math.floor(Math.random() * GRID_SIZE);
  }
  b[r2][c2] = 1;
  return b;
}

/** 还有没有一步可走：有空位，或存在相邻同值（8 阶同值走「超脱」也算可合）。 */
function canMove(b: number[][]): boolean {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (b[r][c] === 0) return true;
      if (c + 1 < GRID_SIZE && b[r][c] === b[r][c + 1]) return true;
      if (r + 1 < GRID_SIZE && b[r][c] === b[r + 1][c]) return true;
    }
  }
  return false;
}

// Slide and merge one row to the left
function slideRow(row: number[]) {
  const nonZero = row.filter((x) => x !== 0);
  const newRow: number[] = [];
  let scoreGained = 0;
  let maxNew = 0;
  let transcend = 0;
  const mergedArtifacts: number[] = [];

  for (let i = 0; i < nonZero.length; i++) {
    if (i + 1 < nonZero.length && nonZero[i] === nonZero[i + 1]) {
      if (nonZero[i] >= MAX_TIER) {
        // 两枚顶阶真器一起化掉：腾出两格换功德与赛博币，否则 8 阶永远占位把炉子堵死
        transcend += 1;
        scoreGained += MAX_TIER * 120;
        i++;
      } else {
        const nextLevel = nonZero[i] + 1;
        newRow.push(nextLevel);
        scoreGained += nextLevel * 50;
        if (nextLevel > maxNew) maxNew = nextLevel;
        mergedArtifacts.push(nextLevel);
        i++; // Skip merged partner
      }
    } else {
      newRow.push(nonZero[i]);
    }
  }
  while (newRow.length < GRID_SIZE) {
    newRow.push(0);
  }
  return { newRow, scoreGained, maxNew, mergedArtifacts, transcend };
}

export const ForgeApp: React.FC = () => {
  const { state, addMerit, addCredits, addInventoryItem, spendItem, showAlert, notify, getDailyCount, recordDailyUse, activeWindowId } = useGame();
  const [board, setBoard] = useState<number[][]>(() => createInitialBoard());
  const [score, setScore] = useState(0);
  const [sessionTier, setSessionTier] = useState(1);
  const [sessionForged, setSessionForged] = useState(0);
  const [transcended, setTranscended] = useState(0);
  const [over, setOver] = useState(false);
  const [best, setBest] = useState<ForgeBest>(() => readBest());
  const [mintedToday, setMintedToday] = useState(() => Math.max(readDailyMint(), getDailyCount(FORGE_LIMIT.key)));

  // 棋盘/计数的 ref 是「同帧多次按键」的唯一真相：move 闭包不能再用可能滞后的 state
  const boardRef = useRef(board);
  const overRef = useRef(over);
  const scoreRef = useRef(0);
  const forgedRef = useRef(0);
  const tierRef = useRef(1);
  const bestRef = useRef(best);
  // 超上限的提示只说一次，面板上常驻的「今日出炉额度」才是长期可见的信息
  const capNoticeRef = useRef(mintedToday >= FORGE_LIMIT.soft);

  const oreItem = state.inventory.find((i) => i.name === '九天玄晶矿石' && i.count > 0);

  const applyBoard = useCallback((next: number[][]) => {
    boardRef.current = next;
    setBoard(next);
  }, []);

  const saveBest = useCallback(() => {
    const next = {
      score: Math.max(bestRef.current.score, scoreRef.current),
      tier: Math.max(bestRef.current.tier, tierRef.current),
      forged: Math.max(bestRef.current.forged, forgedRef.current),
    };
    if (next.score === bestRef.current.score && next.tier === bestRef.current.tier && next.forged === bestRef.current.forged) return;
    bestRef.current = next;
    writeLS(LS_BEST_KEY, next);
    setBest(next);
  }, []);

  // Add random tile (usually 1, occasionally 2)
  const spawnRandomTile = useCallback((currentBoard: number[][]) => {
    const emptyCells: { r: number; c: number }[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (currentBoard[r][c] === 0) {
          emptyCells.push({ r, c });
        }
      }
    }
    if (emptyCells.length === 0) return currentBoard;

    const picked = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    const val = Math.random() < 0.85 ? 1 : 2;
    const next = currentBoard.map((row) => [...row]);
    next[picked.r][picked.c] = val;
    return next;
  }, []);

  // Initialize board — 只清本局统计，今日出炉额度与历史最佳是跨会话的
  const initGame = useCallback(() => {
    const fresh = createInitialBoard();
    boardRef.current = fresh;
    overRef.current = false;
    scoreRef.current = 0;
    forgedRef.current = 0;
    tierRef.current = 1;
    setBoard(fresh);
    setScore(0);
    setSessionTier(1);
    setSessionForged(0);
    setTranscended(0);
    setOver(false);
    SoundFX.playKeyClick();
  }, []);

  // Generic move handler (direction: up, down, left, right)
  const move = useCallback(
    (dir: Dir) => {
      if (overRef.current) return;
      let changed = false;
      let scoreAdd = 0;
      let highestMerged = 0;
      let transcendCount = 0;
      const allMerged: number[] = [];
      const current = boardRef.current.map((r) => [...r]);

      if (dir === 'left') {
        for (let r = 0; r < GRID_SIZE; r++) {
          const { newRow, scoreGained, maxNew, mergedArtifacts, transcend } = slideRow(current[r]);
          if (newRow.some((val, idx) => val !== current[r][idx])) changed = true;
          current[r] = newRow;
          scoreAdd += scoreGained;
          if (maxNew > highestMerged) highestMerged = maxNew;
          allMerged.push(...mergedArtifacts);
          transcendCount += transcend;
        }
      } else if (dir === 'right') {
        for (let r = 0; r < GRID_SIZE; r++) {
          const reversed = [...current[r]].reverse();
          const { newRow, scoreGained, maxNew, mergedArtifacts, transcend } = slideRow(reversed);
          newRow.reverse();
          if (newRow.some((val, idx) => val !== current[r][idx])) changed = true;
          current[r] = newRow;
          scoreAdd += scoreGained;
          if (maxNew > highestMerged) highestMerged = maxNew;
          allMerged.push(...mergedArtifacts);
          transcendCount += transcend;
        }
      } else if (dir === 'up') {
        for (let c = 0; c < GRID_SIZE; c++) {
          const col = [current[0][c], current[1][c], current[2][c], current[3][c]];
          const { newRow, scoreGained, maxNew, mergedArtifacts, transcend } = slideRow(col);
          if (newRow.some((val, idx) => val !== current[idx][c])) changed = true;
          for (let r = 0; r < GRID_SIZE; r++) current[r][c] = newRow[r];
          scoreAdd += scoreGained;
          if (maxNew > highestMerged) highestMerged = maxNew;
          allMerged.push(...mergedArtifacts);
          transcendCount += transcend;
        }
      } else if (dir === 'down') {
        for (let c = 0; c < GRID_SIZE; c++) {
          const col = [current[3][c], current[2][c], current[1][c], current[0][c]];
          const { newRow, scoreGained, maxNew, mergedArtifacts, transcend } = slideRow(col);
          newRow.reverse();
          if (newRow.some((val, idx) => val !== current[idx][c])) changed = true;
          for (let r = 0; r < GRID_SIZE; r++) current[r][c] = newRow[r];
          scoreAdd += scoreGained;
          if (maxNew > highestMerged) highestMerged = maxNew;
          allMerged.push(...mergedArtifacts);
          transcendCount += transcend;
        }
      }

      if (!changed) return;
      // 音效与外部写入全部在 updater 之外，StrictMode 双调用不会重播
      SoundFX.playKeyClick();
      const nextBoard = spawnRandomTile(current);
      applyBoard(nextBoard);
      scoreRef.current += scoreAdd;
      setScore(scoreRef.current);

      // Process synthesized artifacts into global inventory!
      // 每步重新读一次额度：跨过午夜要归零，核心层哪天开始自己累加也接得上
      let minted = Math.max(readDailyMint(), getDailyCount(FORGE_LIMIT.key));
      let mintedNow = 0;
      let cappedOut = false;
      allMerged.forEach((lvl) => {
        const tier = FORGE_TIERS.find((t) => t.level === lvl);
        if (!tier || lvl < 2) return;
        forgedRef.current += 1;
        setSessionForged(forgedRef.current);
        addMerit(lvl * 15);
        if (lvl < 3) return;

        // Reward into inventory for Lv.3 and higher — 今日出炉额度用满后只给功德
        if (minted < FORGE_LIMIT.soft) {
          minted += 1;
          mintedNow += 1;
          addInventoryItem({
            id: `forge-${tier.name}-${Date.now()}-${Math.random()}`,
            name: tier.name,
            icon: tier.icon,
            desc: `八卦炼宝炉【${tier.level}阶】淬炼而成的极品法宝，可温养神魂提供巨额功德，亦可在交易所售出天价！`,
            rarity: rarityOf(lvl),
            count: 1,
          });
          SoundFX.playLevelUp();
          showAlert(
            `🔮 八卦炉道纹共鸣！成功炼制出【${tier.level}阶法宝 · ${tier.name}】并收入全局背包！（今日出炉 ${minted}/${FORGE_LIMIT.soft} 件）`,
            '法宝大成',
            tier.icon,
            'gold'
          );
        } else {
          cappedOut = true;
          addMerit(lvl * 50);
        }
      });
      if (mintedNow > 0) {
        writeLS(LS_DAILY_KEY, { date: todayKey(), count: minted });
        recordDailyUse(FORGE_LIMIT.key, mintedNow);
        setMintedToday(minted);
      }

      if (transcendCount > 0) {
        setTranscended((t) => t + transcendCount);
        addMerit(TRANSCEND_MERIT * transcendCount);
        addCredits(TRANSCEND_CREDITS * transcendCount);
        SoundFX.playLevelUp();
        notify({
          title: '⚔️ 极道真器双双超脱',
          body: `两枚 ${MAX_TIER} 阶【${FORGE_TIERS[MAX_TIER - 1].name}】在炉中化为灰烬，腾出阵位：功德 +${TRANSCEND_MERIT * transcendCount}，赛博币 +${formatCredits(TRANSCEND_CREDITS * transcendCount)}。`,
          icon: FORGE_TIERS[MAX_TIER - 1].icon,
          tone: 'gold',
        });
      }

      if (highestMerged > tierRef.current) {
        tierRef.current = highestMerged;
        setSessionTier(highestMerged);
      }
      saveBest();

      if (!canMove(nextBoard)) {
        overRef.current = true;
        setOver(true);
        SoundFX.playAlert();
        notify({
          title: '💥 炉火熄灭',
          body: `阵法已满、再无同阶可合。本局炼宝道行 ${scoreRef.current}，出炉 ${forgedRef.current} 件。`,
          icon: '🔥',
          tone: 'error',
        });
      } else if (cappedOut && !capNoticeRef.current) {
        capNoticeRef.current = true;
        notify({
          title: '🛑 今日炼宝出炉已达上限',
          body: `${FORGE_LIMIT.label}每日 ${FORGE_LIMIT.soft} 件封顶，继续合炼只返功德，不再产出可交易的法宝。`,
          icon: '🔮',
          tone: 'warn',
        });
      }
    },
    [addMerit, addCredits, addInventoryItem, showAlert, notify, getDailyCount, recordDailyUse, applyBoard, spawnRandomTile, saveBest]
  );

  // Keyboard navigation — strictly active only when Forge is the focused window
  useEffect(() => {
    if (activeWindowId !== 'forge') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // 长按连发约 30 次/秒，会吞掉中间那一步
      if (e.ctrlKey || e.metaKey || e.altKey) return; // 别吃掉浏览器与系统的组合快捷键
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const dir: Dir | null =
        e.code === 'ArrowLeft' || e.code === 'KeyA' ? 'left'
        : e.code === 'ArrowRight' || e.code === 'KeyD' ? 'right'
        : e.code === 'ArrowUp' || e.code === 'KeyW' ? 'up'
        : e.code === 'ArrowDown' || e.code === 'KeyS' ? 'down'
        : null;
      if (!dir) return;
      if (overRef.current) return; // 熄火后不再吞方向键，交还给页面滚动
      e.preventDefault();
      move(dir);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move, activeWindowId]);

  // 触摸滑动手势（移动端没有键盘，D-pad 之外再给一条顺手的路）
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  };

  // Cross-App Synergy: Inject "九天玄晶矿石"
  const injectOre = () => {
    if (!oreItem) return;
    if (over) {
      showAlert('八卦炉已经熄火，先重起炉灶再投料！', '炉火熄灭', '💥', 'red');
      return;
    }
    const grid = boardRef.current;
    const emptyCells: { r: number; c: number }[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (grid[r][c] === 0) emptyCells.push({ r, c });
      }
    }
    if (emptyCells.length === 0) {
      showAlert('八卦炉内阵位已满，无法投入新矿石！', '炉火炽热', '🔥', 'red');
      return;
    }

    spendItem(oreItem.id, 1);
    const picked = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    const roll = Math.random();
    let bonusLvl = 1;
    let acc = 0;
    for (const o of ORE_ODDS) {
      acc += o.p;
      if (roll < acc) {
        bonusLvl = o.lvl;
        break;
      }
    }
    const next = grid.map((row) => [...row]);
    next[picked.r][picked.c] = bonusLvl;
    applyBoard(next);
    SoundFX.playLevelUp();
    showAlert(`💎 投料成功！【九天玄晶矿石】化作 ${bonusLvl} 阶【${FORGE_TIERS[bonusLvl - 1].name}】胚子直接降临阵法！`, '玄晶入炉', '💎', 'gold');
    // 投料可能正好填满最后一格，同样要判死
    if (!canMove(next)) {
      overRef.current = true;
      setOver(true);
      saveBest();
      SoundFX.playAlert();
    }
  };

  const mintLeft = Math.max(0, FORGE_LIMIT.soft - mintedToday);

  return (
    <div className="flex flex-col h-full bg-slate-950/95 text-slate-200 font-mono select-none overflow-y-auto p-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="text-xl">🔮</div>
          <div>
            <div className="text-xs font-black text-amber-300 tracking-wider flex items-center gap-1.5">
              <span>CYBER_ARTIFACT_FORGE</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950 border border-amber-500/40 text-amber-300">
                八卦神炉
              </span>
            </div>
            <div className="text-[10px] text-slate-400">滑动阵法两两合成 · 产出高阶本命法宝至全局背包</div>
          </div>
        </div>

        {/* Cross-App Synergy Ore Injection */}
        {oreItem ? (
          <button
            onClick={injectOre}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/80 border border-yellow-500/60 hover:bg-amber-900 text-yellow-300 text-xs font-bold transition-all shadow-neon-gold cursor-pointer"
            title={`投入 1 个【九天玄晶矿石】：${ORE_ODDS.map((o) => `${Math.round(o.p * 100)}% ${o.lvl}阶`).join(' / ')}，期望回收约 ${formatCredits(oreEv)}（矿石本身回收 ${formatCredits(oreSell)}）`}
          >
            <Flame size={13} className="text-amber-400 animate-pulse" />
            <span>注入玄晶矿 ({oreItem.count})</span>
          </button>
        ) : (
          <div className="text-[10px] text-slate-500">
            敲击木鱼概率掉落「九天玄晶矿石」
          </div>
        )}
      </div>

      {/* Dashboard & Score */}
      <div className="flex items-center justify-between gap-2 py-2 shrink-0">
        <div className="flex items-center gap-3 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800">
          <div>
            <div className="text-[9px] text-slate-400">本局炼宝道行</div>
            <div className="text-sm font-black text-yellow-400">{score.toLocaleString()}</div>
          </div>
          <div className="border-l border-slate-700 pl-3">
            <div className="text-[9px] text-slate-400">本局最高法宝</div>
            <div className="text-xs font-bold text-cyan-300 flex items-center gap-1">
              <span>{FORGE_TIERS[sessionTier - 1]?.icon}</span>
              <span>{FORGE_TIERS[sessionTier - 1]?.name}</span>
            </div>
          </div>
          <div className="border-l border-slate-700 pl-3">
            <div className="text-[9px] text-slate-400">本局已炼</div>
            <div className="text-xs font-bold text-purple-300">{sessionForged} 件</div>
          </div>
        </div>

        <button
          onClick={initGame}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold cursor-pointer transition-colors"
          title="熄灭重炼"
        >
          <RefreshCw size={12} />
          <span>重起炉灶</span>
        </button>
      </div>

      {/* 历史战绩 + 今日出炉额度 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400 shrink-0 pb-1">
        <span>
          🏆 历史最佳：道行 <span className="text-yellow-300 font-bold">{best.score.toLocaleString()}</span> ·{' '}
          <span className="text-cyan-300 font-bold">{FORGE_TIERS[best.tier - 1]?.name}</span> · 单局出炉{' '}
          <span className="text-purple-300 font-bold">{best.forged}</span> 件
        </span>
        <span className={mintLeft === 0 ? 'text-red-400 font-bold' : 'text-emerald-300'}>
          🔮 今日出炉额度 {mintedToday}/{FORGE_LIMIT.soft}
          {mintLeft === 0 && '（超出部分只给功德，不入背包）'}
        </span>
        {transcended > 0 && (
          <span className="text-amber-300">⚔️ 本局超脱 {transcended} 次</span>
        )}
      </div>

      {/* 4x4 Grid Board */}
      <div className="flex-1 flex items-center justify-center p-2 min-h-[220px]">
        <div
          className="relative w-full max-w-[340px] aspect-square"
          style={{ touchAction: 'none' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="grid grid-cols-4 gap-2 p-3 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.15)] w-full h-full">
            {board.map((row, r) =>
              row.map((val, c) => {
                const tier = val > 0 ? FORGE_TIERS[val - 1] : null;
                return (
                  <div
                    key={`${r}-${c}`}
                    className={`rounded-xl border flex flex-col items-center justify-center p-1 transition-all select-none ${
                      tier ? `${tier.bg} ${tier.border} shadow-md` : 'bg-slate-950/60 border-slate-800/80'
                    }`}
                  >
                    {tier && (
                      <>
                        <span className="text-xl sm:text-2xl filter drop-shadow">{tier.icon}</span>
                        <span className={`text-[10px] font-bold ${tier.color} line-clamp-1 leading-tight mt-0.5`}>
                          {tier.name}
                        </span>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* GAME OVER 结算层：满盘又无同阶相邻时不再静默吞键 */}
          {over && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-slate-950/92 border border-red-500/60 text-center p-3 backdrop-blur-sm">
              <div className="text-3xl">💥</div>
              <div className="text-sm font-black text-red-300">炉火熄灭 · 阵法已满</div>
              <div className="text-[10px] text-slate-400 leading-relaxed">
                本局产出：道行 <span className="text-yellow-300 font-bold">{score.toLocaleString()}</span> · 出炉{' '}
                <span className="text-purple-300 font-bold">{sessionForged} 件</span> · 最高{' '}
                <span className="text-cyan-300 font-bold">{FORGE_TIERS[sessionTier - 1]?.name}</span>
                {transcended > 0 && <> · 超脱 {transcended} 次</>}
              </div>
              <div className="text-[10px] text-slate-500">
                历史最佳道行 <span className="text-yellow-300 font-bold">{best.score.toLocaleString()}</span>
              </div>
              <button
                onClick={initGame}
                className="mt-1 px-5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-xs shadow-neon-gold cursor-pointer"
              >
                🔥 重起炉灶
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Virtual D-Pad for Touch/Mouse */}
      <div className="flex items-center justify-center gap-2 py-1 shrink-0">
        <button
          onClick={() => move('left')}
          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 active:scale-95 cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => move('up')}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 active:scale-95 cursor-pointer"
          >
            <ArrowUp size={16} />
          </button>
          <button
            onClick={() => move('down')}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 active:scale-95 cursor-pointer"
          >
            <ArrowDown size={16} />
          </button>
        </div>
        <button
          onClick={() => move('right')}
          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 active:scale-95 cursor-pointer"
        >
          <ArrowRight size={16} />
        </button>
      </div>

      {/* Footer Instructions */}
      <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800 space-y-0.5 shrink-0">
        <div>支持键盘 WASD / 方向键、移动端在阵法上直接滑动；合成 Lv.3 及以上法宝自动进入背包</div>
        <div>
          ⚔️ 两枚 {MAX_TIER} 阶【{FORGE_TIERS[MAX_TIER - 1].name}】相合即「超脱」：腾出两格，功德 +{TRANSCEND_MERIT}、赛博币 +{formatCredits(TRANSCEND_CREDITS)}
        </div>
        <div>
          💎 投料概率 {ORE_ODDS.map((o) => `${Math.round(o.p * 100)}%→${o.lvl}阶`).join(' / ')}，期望回收约 {formatCredits(oreEv)}（低于矿石本身回收 {formatCredits(oreSell)}）
        </div>
        <div className="text-amber-400">法宝可在交易所高价卖出 · 每日出炉上限 {FORGE_LIMIT.soft} 件（关窗口不清零）</div>
      </div>
    </div>
  );
};
