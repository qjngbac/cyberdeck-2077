import React, { useState, useEffect, useCallback } from 'react';
import { Shield, HelpCircle, Eye, Award } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';
import { InventoryItem } from '../../types';
import { describeItemEffect, getSellPrice, formatCredits } from '../../utils/gameLogic';

type Difficulty = 'easy' | 'medium' | 'hard';

interface DifficultyConfig {
  name: string;
  rows: number;
  cols: number;
  mines: number;
  rewardCredits: number;
  rewardMerit: number;
}

const CONFIGS: Record<Difficulty, DifficultyConfig> = {
  easy: { name: '初级探针', rows: 8, cols: 8, mines: 10, rewardCredits: 80, rewardMerit: 30 },
  medium: { name: '中级渗透', rows: 12, cols: 12, mines: 22, rewardCredits: 260, rewardMerit: 100 },
  hard: { name: '高危矩阵', rows: 14, cols: 14, mines: 36, rewardCredits: 800, rewardMerit: 300 },
};

interface Cell {
  row: number;
  col: number;
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  neighborMines: number;
}

const revealEmptyNeighbors = (board: Cell[][], r: number, c: number, rows: number, cols: number) => {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        const neighbor = board[nr][nc];
        if (!neighbor.isRevealed && !neighbor.isFlagged) {
          neighbor.isRevealed = true;
          if (neighbor.neighborMines === 0) {
            revealEmptyNeighbors(board, nr, nc, rows, cols);
          }
        }
      }
    }
  }
};

/** 通关掉落传说法宝的真实概率——每个难度各自独立掷骰，不再被 hard 短路成必掉。 */
const LEGENDARY_DROP_CHANCE: Record<Difficulty, number> = { easy: 0.2, medium: 0.45, hard: 0.6 };

const cloneGrid = (board: Cell[][]) => board.map((row) => row.map((cell) => ({ ...cell })));

/** 搬雷之后必须整盘重算邻雷数，否则数字全是错的。 */
const recalcNeighborMines = (board: Cell[][], rows: number, cols: number) => {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].isMine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].isMine) count++;
        }
      }
      board[r][c].neighborMines = count;
    }
  }
};

const forEachNeighbor = (r: number, c: number, rows: number, cols: number, fn: (nr: number, nc: number) => void) => {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) fn(nr, nc);
    }
  }
};

const revealAllMines = (board: Cell[][]) => {
  board.forEach((row) => row.forEach((cell) => { if (cell.isMine) cell.isRevealed = true; }));
};

/** 掉落文案与核心层的 ITEM_EFFECTS / 回收价保持一致（冷钱包已下调为使用 $800、回收 $1050）。 */
const dropCopy = (name: string) => {
  const rarity: InventoryItem['rarity'] = 'legendary';
  const effect = describeItemEffect({ id: '', name, icon: '', desc: '', rarity, count: 1 });
  return `${effect}，或在赛博交易所回收 ${formatCredits(getSellPrice(name, rarity))}`;
};

export const MinesweeperApp: React.FC = () => {
  const { addCredits, addMerit, addInventoryItem, spendItem, showAlert, state, windows } = useGame();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [gameState, setGameState] = useState<'playing' | 'won' | 'lost'>('playing');
  const [flagMode, setFlagMode] = useState(false);
  const [timer, setTimer] = useState(0);
  const [probesUsed, setProbesUsed] = useState(0);
  // 计时从首次翻开格子起算，可手动暂停；应用窗口最小化时视同暂停（后台 setInterval 不可信）
  const [isStarted, setIsStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const cfg = CONFIGS[difficulty];
  const dropChance = LEGENDARY_DROP_CHANCE[difficulty];
  const probeItem = state.inventory.find((i) => i.name === '量子探针' && i.count > 0);
  const isWindowMinimized = windows.find((w) => w.id === 'minesweeper')?.isMinimized ?? false;
  const isHalted = isPaused || isWindowMinimized;

  // Initialize board
  const initBoard = useCallback((diff: Difficulty) => {
    const c = CONFIGS[diff];
    const newGrid: Cell[][] = [];

    // Create empty cells
    for (let r = 0; r < c.rows; r++) {
      const row: Cell[] = [];
      for (let col = 0; col < c.cols; col++) {
        row.push({
          row: r,
          col,
          isMine: false,
          isRevealed: false,
          isFlagged: false,
          neighborMines: 0,
        });
      }
      newGrid.push(row);
    }

    // Plant mines
    let planted = 0;
    while (planted < c.mines) {
      const r = Math.floor(Math.random() * c.rows);
      const col = Math.floor(Math.random() * c.cols);
      if (!newGrid[r][col].isMine) {
        newGrid[r][col].isMine = true;
        planted++;
      }
    }

    // Calculate neighbor mines
    recalcNeighborMines(newGrid, c.rows, c.cols);

    setGrid(newGrid);
    setGameState('playing');
    setTimer(0);
    setProbesUsed(0);
    setIsStarted(false);
    setIsPaused(false);
  }, []);

  useEffect(() => {
    initBoard(difficulty);
  }, [difficulty, initBoard]);

  // Timer tick — 首击起算，暂停或窗口最小化时停表
  useEffect(() => {
    if (gameState !== 'playing' || !isStarted || isHalted) return;
    const interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [gameState, isStarted, isHalted]);

  // Check win condition
  const checkWin = useCallback((board: Cell[][]) => {
    let unrevealedNonMines = 0;
    for (let r = 0; r < cfg.rows; r++) {
      for (let c = 0; c < cfg.cols; c++) {
        if (!board[r][c].isMine && !board[r][c].isRevealed) {
          unrevealedNonMines++;
        }
      }
    }
    if (unrevealedNonMines === 0) {
      setGameState('won');
      SoundFX.playLevelUp();
      addCredits(cfg.rewardCredits);
      addMerit(cfg.rewardMerit);

      // Synergy Drops! 每个难度独立掷骰；旧的 `difficulty === 'hard' ||` 把概率门短路了，
      // hard 变成 100% 必掉，而且内层又复用了同一个 rand。
      if (Math.random() < dropChance) {
        const dayCopy = dropCopy('0-Day 漏洞特征码');
        const walletCopy = dropCopy('量子加密冷钱包');
        if (Math.random() < 0.5) {
          addInventoryItem({
            id: `item-0day-${Date.now()}`,
            name: '0-Day 漏洞特征码',
            icon: '👾',
            desc: `量子扫雷排查漏洞所得！在黑客终端中入侵企业可 100% 成功并掠夺双倍赏金；${dayCopy}`,
            rarity: 'legendary',
            count: 1,
          });
          showAlert(`🎉 扫雷大捷！从排查出的高危系统中截获【0-Day 漏洞特征码】已收入背包！\n可在黑客终端渗透时使用，也可直接开启：${dayCopy}`, '高危漏洞截获', '👾', 'gold');
        } else {
          addInventoryItem({
            id: `item-wallet-${Date.now()}`,
            name: '量子加密冷钱包',
            icon: '🔐',
            desc: `扫雷深度排查发现的远古冷钱包！${walletCopy}`,
            rarity: 'legendary',
            count: 1,
          });
          showAlert(`💰 奇遇！在排雷过程中挖掘出遗弃的【量子加密冷钱包】！\n${walletCopy}`, '古老冷钱包出土', '🔐', 'gold');
        }
      }
    }
  }, [cfg, dropChance, addCredits, addMerit, addInventoryItem, showAlert]);

  const toggleFlag = useCallback((r: number, c: number, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (gameState !== 'playing' || isHalted) return;
    const cell = grid[r][c];
    if (cell.isRevealed) return;

    SoundFX.playKeyClick();
    const nextGrid = cloneGrid(grid);
    nextGrid[r][c].isFlagged = !nextGrid[r][c].isFlagged;
    setGrid(nextGrid);
  }, [gameState, grid, isHalted]);

  const handleClickCell = useCallback((r: number, c: number) => {
    if (gameState !== 'playing') return;
    const cell = grid[r][c];

    if (flagMode) {
      toggleFlag(r, c);
      return;
    }

    if (isHalted) return;
    if (cell.isFlagged || cell.isRevealed) return;

    SoundFX.playKeyClick();
    const isFirstClick = grid.every((row) => row.every((item) => !item.isRevealed));
    const nextGrid = cloneGrid(grid);

    if (isFirstClick) {
      // 经典首点保护：点击格连同周围 3×3 都不留雷，否则首屏必出一圈数字、永远没有开阔区
      const inSafeZone = (rr: number, cc: number) => Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1;
      let displaced = 0;
      for (let rr = 0; rr < cfg.rows; rr++) {
        for (let cc = 0; cc < cfg.cols; cc++) {
          if (inSafeZone(rr, cc) && nextGrid[rr][cc].isMine) {
            nextGrid[rr][cc].isMine = false;
            displaced++;
          }
        }
      }
      if (displaced > 0) {
        const candidates: { r: number; c: number }[] = [];
        for (let cr = 0; cr < cfg.rows; cr++) {
          for (let cc = 0; cc < cfg.cols; cc++) {
            // 不要把雷搬到玩家已经插旗的格子里
            if (!nextGrid[cr][cc].isMine && !nextGrid[cr][cc].isFlagged && !inSafeZone(cr, cc)) {
              candidates.push({ r: cr, c: cc });
            }
          }
        }
        for (let i = 0; i < displaced && candidates.length > 0; i++) {
          const dest = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
          nextGrid[dest.r][dest.c].isMine = true;
        }
        // 搬雷之后整盘重算邻雷数
        recalcNeighborMines(nextGrid, cfg.rows, cfg.cols);
      }
    }

    const target = nextGrid[r][c];

    if (target.isMine) {
      // Hit a mine -> Game Over
      target.isRevealed = true;
      // Reveal all mines
      revealAllMines(nextGrid);
      setGrid(nextGrid);
      setGameState('lost');
      SoundFX.playSlash();
      return;
    }

    setIsStarted(true);
    target.isRevealed = true;
    if (target.neighborMines === 0) {
      revealEmptyNeighbors(nextGrid, r, c, cfg.rows, cfg.cols);
    }

    setGrid(nextGrid);
    checkWin(nextGrid);
  }, [gameState, grid, flagMode, isHalted, toggleFlag, cfg, checkWin]);

  // 经典和弦：双击已翻开的数字格，若周围旗数与数字相符则一次展开其余格
  const handleChord = useCallback((r: number, c: number) => {
    if (gameState !== 'playing' || isHalted) return;
    const cell = grid[r][c];
    if (!cell.isRevealed || cell.neighborMines === 0) return;

    let flags = 0;
    forEachNeighbor(r, c, cfg.rows, cfg.cols, (nr, nc) => {
      if (grid[nr][nc].isFlagged) flags++;
    });
    if (flags !== cell.neighborMines) return;

    SoundFX.playKeyClick();
    const nextGrid = cloneGrid(grid);
    let hitMine = false;
    forEachNeighbor(r, c, cfg.rows, cfg.cols, (nr, nc) => {
      const n = nextGrid[nr][nc];
      if (n.isFlagged || n.isRevealed) return;
      n.isRevealed = true;
      if (n.isMine) {
        hitMine = true;
        return;
      }
      if (n.neighborMines === 0) revealEmptyNeighbors(nextGrid, nr, nc, cfg.rows, cfg.cols);
    });

    if (hitMine) {
      revealAllMines(nextGrid);
      setGrid(nextGrid);
      setGameState('lost');
      SoundFX.playSlash();
      return;
    }
    setGrid(nextGrid);
    checkWin(nextGrid);
  }, [gameState, grid, isHalted, cfg, checkWin]);

  // Cross-App Synergy: Consume "量子探针" to reveal 1 safe mine
  const useQuantumProbe = () => {
    if (!probeItem || gameState !== 'playing' || isHalted) return;
    // Find an unflagged mine
    const unflaggedMines: Cell[] = [];
    grid.forEach((row) =>
      row.forEach((cell) => {
        if (cell.isMine && !cell.isFlagged) unflaggedMines.push(cell);
      })
    );
    if (unflaggedMines.length === 0) {
      showAlert('当前所有地雷均已标记或已探明！', '探针提示', '🔮', 'cyan');
      return;
    }
    const picked = unflaggedMines[Math.floor(Math.random() * unflaggedMines.length)];
    spendItem(probeItem.id, 1);
    setProbesUsed((p) => p + 1);

    const nextGrid = grid.map((row) => row.map((cell) => ({ ...cell })));
    nextGrid[picked.row][picked.col].isFlagged = true;
    setGrid(nextGrid);
    SoundFX.playLevelUp();
    showAlert(`🔮 量子探针穿透防火墙！成功在 [第${picked.row + 1}行, 第${picked.col + 1}列] 标记出 1 颗高危木马地雷！`, '透视成功', '🛡️', 'gold');
  };

  const flaggedCount = grid.flat().filter((c) => c.isFlagged).length;
  // 经典扫雷允许超量插旗，这里如实显示负数而不是用 Math.max 抹平
  const remainingMines = cfg.mines - flaggedCount;
  const mineCounter = `${remainingMines < 0 ? '-' : ''}${String(Math.abs(remainingMines)).padStart(2, '0')}`;

  const getNumberColor = (n: number) => {
    switch (n) {
      case 1: return 'text-cyan-400';
      case 2: return 'text-green-400';
      case 3: return 'text-yellow-400';
      case 4: return 'text-purple-400';
      case 5: return 'text-red-400';
      case 6: return 'text-pink-400';
      default: return 'text-amber-300';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/95 text-slate-200 font-mono select-none overflow-y-auto p-3">
      {/* Top Header & Synergy Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="text-xl">👾</div>
          <div>
            <div className="text-xs font-black text-cyan-300 tracking-wider flex items-center gap-1.5">
              <span>QUANTUM_MINESWEEPER</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                v2.0
              </span>
            </div>
            <div className="text-[10px] text-slate-400">防火墙木马漏洞排查 · 捕获 0-Day 漏洞</div>
          </div>
        </div>

        {/* Cross-app probe badge */}
        {probeItem ? (
          <button
            onClick={useQuantumProbe}
            disabled={gameState !== 'playing'}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-950/80 border border-purple-500/60 hover:bg-purple-900 text-purple-300 text-xs font-bold transition-all shadow-neon-pink cursor-pointer disabled:opacity-40"
            title="消耗 1 个背包里的【量子探针】，透视并标记 1 颗地雷"
          >
            <Eye size={13} className="text-purple-400 animate-pulse" />
            <span>量子探针透视 ({probeItem.count})</span>
          </button>
        ) : (
          <div className="text-[10px] text-slate-500 flex items-center gap-1">
            <HelpCircle size={12} />
            <span>钓鱼/宠物探索可获得「量子探针」</span>
          </div>
        )}
      </div>

      {/* Control Bar: Difficulty & Game Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2 shrink-0">
        <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800 text-xs">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`px-2 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                difficulty === d
                  ? 'bg-cyan-500 text-slate-950 shadow-neon-cyan'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {CONFIGS[d].name}
            </button>
          ))}
        </div>

        {/* Dashboard: Mines, Face Button, Timer, Pause, Probes */}
        <div className="flex items-center gap-3 bg-slate-900/90 px-3 py-1 rounded-lg border border-slate-800">
          <div className="text-xs font-bold text-red-400 flex items-center gap-1" title="剩余地雷 = 地雷总数 − 已插旗数（超量插旗会显示负数）">
            <Shield size={13} />
            <span>{mineCounter}</span>
          </div>

          <button
            onClick={() => initBoard(difficulty)}
            className="text-lg hover:scale-115 transition-transform cursor-pointer"
            title="重新启动矩阵"
          >
            {gameState === 'won' ? '😎' : gameState === 'lost' ? '💥' : '🤖'}
          </button>

          <div className="text-xs font-bold text-cyan-300" title="首次翻开格子才开始计时">
            {isStarted ? `⏱️ ${String(timer).padStart(3, '0')}s` : '⏱️ 首击起算'}
          </div>

          <button
            onClick={() => setIsPaused((p) => !p)}
            disabled={!isStarted || gameState !== 'playing' || isWindowMinimized}
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isHalted
                ? 'bg-green-500/20 text-green-300 border-green-500/60'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-cyan-500/50'
            }`}
            title={
              isWindowMinimized
                ? '窗口最小化中已停表，恢复窗口后可继续'
                : isHalted
                ? '继续计时'
                : '暂停计时（暂停期间无法操作矩阵）'
            }
          >
            {isHalted ? '▶ 继续' : '⏸ 暂停'}
          </button>

          {probesUsed > 0 && (
            <div className="text-xs font-bold text-amber-300" title={`已使用 ${probesUsed} 个探针`}>
              🔮 {probesUsed}
            </div>
          )}
        </div>

        {/* Mobile / Quick Flag Mode Toggle */}
        <button
          onClick={() => setFlagMode(!flagMode)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
            flagMode
              ? 'bg-red-500/20 text-red-300 border-red-500 shadow-neon-pink'
              : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500'
          }`}
        >
          <span>🚩 标记模式</span>
          <span className="text-[10px] opacity-75">({flagMode ? '开' : '关'})</span>
        </button>
      </div>

      {/* Minesweeper Grid Canvas */}
      <div className="flex-1 flex items-center justify-center p-2 min-h-[220px]">
        <div
          className={`grid gap-1 p-2 rounded-xl bg-slate-900/80 border border-slate-800 shadow-inner max-w-full overflow-auto ${
            isHalted ? 'opacity-30 blur-[2px] pointer-events-none' : ''
          }`}
          style={{
            gridTemplateColumns: `repeat(${cfg.cols}, minmax(0, 1fr))`,
          }}
        >
          {grid.map((row, r) =>
            row.map((cell, c) => (
              <button
                key={`${r}-${c}`}
                onClick={() => handleClickCell(r, c)}
                onDoubleClick={() => handleChord(r, c)}
                onContextMenu={(e) => toggleFlag(r, c, e)}
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded flex items-center justify-center font-bold text-xs transition-all select-none cursor-pointer border ${
                  cell.isRevealed
                    ? cell.isMine
                      ? 'bg-red-600 border-red-400 text-white shadow-neon-pink animate-pulse'
                      : 'bg-slate-950/70 border-slate-800/80'
                    : cell.isFlagged
                    ? 'bg-amber-950/50 border-yellow-500/60 text-yellow-300 shadow-neon-gold'
                    : 'bg-slate-800 hover:bg-slate-700/90 border-slate-700/80 hover:border-cyan-500/50 active:scale-95'
                }`}
              >
                {cell.isRevealed ? (
                  cell.isMine ? (
                    '💣'
                  ) : cell.neighborMines > 0 ? (
                    <span className={getNumberColor(cell.neighborMines)}>{cell.neighborMines}</span>
                  ) : null
                ) : cell.isFlagged ? (
                  '🚩'
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Game Result Banner & Synergy Drops */}
      {gameState === 'won' && (
        <div className="p-3 rounded-xl bg-green-950/80 border border-green-500/60 shadow-neon-green text-center space-y-1 animate-in zoom-in-95 shrink-0 my-1">
          <div className="font-black text-sm text-green-300 flex items-center justify-center gap-1.5">
            <Award size={16} />
            <span>【矩阵防火墙全面排查通过】！</span>
          </div>
          <div className="text-[11px] text-slate-300">
            获得排障赏金：<span className="text-green-400 font-bold">+{formatCredits(cfg.rewardCredits)} 赛博币</span> ·{' '}
            <span className="text-yellow-400 font-bold">+{cfg.rewardMerit} 功德</span>
          </div>
          <div className="text-[10px] text-slate-400">
            「{cfg.name}」通关掉落传说法宝的真实概率为 {Math.round(dropChance * 100)}%，
            命中后 0-Day 漏洞特征码 / 量子加密冷钱包 各 50%
          </div>
        </div>
      )}

      {gameState === 'lost' && (
        <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-500/50 text-center space-y-1 animate-in zoom-in-95 shrink-0 my-1">
          <div className="font-bold text-xs text-red-300">💥 遭遇深层量子逻辑地雷，矩阵触发熔断保护！</div>
          <button
            onClick={() => initBoard(difficulty)}
            className="px-4 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-neon-pink cursor-pointer"
          >
            重启排查
          </button>
        </div>
      )}

      {/* Bottom Synergy Instruction */}
      <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80 flex items-center justify-between shrink-0">
        <div>左键排查 · 右键插旗 · 双击数字格快速展开；触屏可切「标记模式」</div>
        <div className="text-cyan-400">{cfg.name} 通关掉落传说法宝 {Math.round(dropChance * 100)}%</div>
      </div>
    </div>
  );
};
