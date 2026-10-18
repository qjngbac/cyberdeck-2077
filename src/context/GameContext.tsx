import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { GameState, WindowState, AppId, ThemeType, InventoryItem, NewsItem, WheelLifeState, PetState, UiNotification, NotificationTone, CyberDialog } from '../types';
import { loadSavedState, saveState, importSaveData, INITIAL_GAME_STATE, STOCK_ANCHOR } from '../utils/storage';
import {
  ITEM_EFFECTS,
  ESTATE_DEFS,
  ESTATE_PAYOUT_INTERVAL_MS,
  getAchievementMultiplier,
  getGlobalMeritMultiplier,
  getMeritPerTap,
  getSellPrice,
  EMOTIONAL_FLAVOR,
  isGachaSeriesComplete,
  ACHIEVEMENT_MILESTONES,
  getUnlockedAchievementCount,
  getUnlockedAchievementIds,
  RELEASE_OPTIONS,
  getReleaseFactor,
  MERIT_TO_CREDIT_RATE,
  DAILY_LIMITS,
  dailyDecay,
  HASHRATE_CAP,
  HASHRATE_DECAY_PER_PAYOUT,
  getPositionEquity,
  shouldLiquidate,
  getGachaCost,
  pickGachaItem,
  rollGachaRarity,
  getGachaDupeRefund,
} from '../utils/gameLogic';
import type { GachaPullOutcome } from '../utils/gameLogic';
import { SoundFX } from '../audio/SoundFX';

const todayStr = () => new Date().toDateString();

/** Read one of today's action counters (release / arena / train / forge / fish …). */
function dailyCount(state: GameState, key: string): number {
  if (state.daily?.date !== todayStr()) return 0;
  return state.daily.counters[key] ?? 0;
}

/** Increment today's counter — always folded into the same updater as the reward it caps. */
function bumpDaily(state: GameState, key: string, by: number = 1): GameState['daily'] {
  const day = todayStr();
  const base = state.daily?.date === day ? state.daily : { date: day, counters: {} };
  return { date: day, counters: { ...base.counters, [key]: (base.counters[key] ?? 0) + by } };
}

// Items with pure emotional value — consuming them triggers a full-screen treat
const EMOTIONAL_ITEMS: Record<string, 'fireworks' | 'gatling' | 'champagne' | 'golden_merit' | 'chicken' | 'coin_rain' | 'unicorn' | 'lantern' | 'meteor' | 'collectible'> = {
  '赛博烟花礼盒': 'fireworks',
  '赛博加特林连环烟花': 'gatling',
  '赛博香槟王2077': 'champagne',
  '赛博功德金光发生器': 'golden_merit',
  '黄金尖叫鸡': 'chicken',
  '赛博暴富金币雨': 'coin_rain',
  '彩虹独角兽跨屏狂奔': 'unicorn',
  '祈福天灯': 'lantern',
  '量子流星雨使用权': 'meteor',
  '线上Bug装作没看见符': 'collectible',
  '赛博恋爱脑阻断剂': 'collectible',
  '至尊猫屎拿铁': 'collectible',
  '电子招财猫摆件': 'collectible',
  '锦鲤王官方复刻摆件': 'collectible',
  '虚拟电子花束': 'collectible',
  '年度摸鱼先锋奖杯': 'collectible',
};

const INITIAL_WINDOWS: WindowState[] = [
  {
    id: 'wooden-fish',
    title: '赛博修仙 · 电子木鱼 (Cyber Wooden Fish)',
    icon: '📿',
    isOpen: true,
    isMinimized: false,
    isMaximized: false,
    zIndex: 10,
    x: 40,
    y: 35,
    width: 480,
    height: 560,
    minWidth: 380,
    minHeight: 450,
  },
  {
    id: 'wheel-life',
    title: '赛博转盘修仙 · 武魂与机缘 (Wheel of Destiny)',
    icon: '🎡',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 11,
    x: 70,
    y: 45,
    width: 540,
    height: 600,
    minWidth: 420,
    minHeight: 480,
  },
  {
    id: 'snake-arcade',
    title: '赛博街机 · 贪吃蛇 2077 (Cyber Snake Arcade)',
    icon: '🕹️',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 12,
    x: 110,
    y: 65,
    width: 440,
    height: 530,
    minWidth: 360,
    minHeight: 420,
  },
  {
    id: 'cyber-pet',
    title: '机甲电子宠物 (Cyber Familiar)',
    icon: '🐕',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 11,
    x: 100,
    y: 60,
    width: 460,
    height: 580,
    minWidth: 380,
    minHeight: 460,
  },
  {
    id: 'market',
    title: '赛博交易所 · 黑市与回收 (Cyber Exchange)',
    icon: '🏪',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 17,
    x: 620,
    y: 90,
    width: 500,
    height: 560,
    minWidth: 400,
    minHeight: 460,
  },
  {
    id: 'doudizhu',
    title: '赛博斗地主 · 人机对战 (Cyber Fight the Landlord)',
    icon: '🃏',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 18,
    x: 480,
    y: 110,
    width: 700,
    height: 580,
    minWidth: 560,
    minHeight: 500,
  },
  {
    id: 'dungeon',
    title: '霓虹深渊 · 代码肉鸽 (Neon Dungeon Roguelike)',
    icon: '⚔️',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 12,
    x: 140,
    y: 40,
    width: 720,
    height: 600,
    minWidth: 540,
    minHeight: 480,
  },
  {
    id: 'stock-market',
    title: '赛博华尔街 · 韭菜大亨 (Cyber Stonks & Crypto)',
    icon: '📈',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 13,
    x: 80,
    y: 50,
    width: 680,
    height: 560,
    minWidth: 500,
    minHeight: 420,
  },
  {
    id: 'synthwave',
    title: '8-Bit 赛博合成器 & 编曲机 (Synthwave Beat Box)',
    icon: '🎹',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 14,
    x: 120,
    y: 70,
    width: 660,
    height: 520,
    minWidth: 480,
    minHeight: 400,
  },
  {
    id: 'terminal',
    title: '黑客矩阵终端 (Matrix Hacker Terminal)',
    icon: '💻',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 15,
    x: 160,
    y: 90,
    width: 620,
    height: 480,
    minWidth: 420,
    minHeight: 340,
  },
  {
    id: 'ambience',
    title: '赛博白噪音 & 摸鱼专注钟 (Cyber Ambience & Focus)',
    icon: '☕',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 16,
    x: 200,
    y: 80,
    width: 440,
    height: 500,
    minWidth: 360,
    minHeight: 420,
  },
  {
    id: 'fishing',
    title: '赛博钓鱼码头 (Neon Fishing Dock)',
    icon: '🎣',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 16,
    x: 560,
    y: 120,
    width: 470,
    height: 560,
    minWidth: 380,
    minHeight: 460,
  },
  {
    id: 'system-settings',
    title: '系统设置 & 存档管理 (CyberDeck Config)',
    icon: '⚙️',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 17,
    x: 220,
    y: 100,
    width: 480,
    height: 500,
    minWidth: 380,
    minHeight: 400,
  },
  {
    id: 'minesweeper',
    title: '赛博量子扫雷 · 防火墙漏洞排查 (Quantum Minesweeper)',
    icon: '👾',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 18,
    x: 180,
    y: 60,
    width: 650,
    height: 680,
    minWidth: 540,
    minHeight: 560,
  },
  {
    id: 'forge',
    title: '赛博八卦炼宝炉 · 法宝合成 (Artifact Forge 2048)',
    icon: '🔮',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 19,
    x: 240,
    y: 90,
    width: 500,
    height: 580,
    minWidth: 420,
    minHeight: 480,
  },
  {
    id: 'gacha',
    title: '赛博盲盒扭蛋机 · 藏品陈列室 (Cyber Gacha)',
    icon: '🎁',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 20,
    x: 280,
    y: 60,
    width: 620,
    height: 600,
    minWidth: 480,
    minHeight: 480,
  },
  {
    id: 'daily-report',
    title: '大厂黑话 · 赛博摸鱼日报生成器 (Daily Report Generator)',
    icon: '📄',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 21,
    x: 320,
    y: 80,
    width: 540,
    height: 560,
    minWidth: 420,
    minHeight: 460,
  },
  {
    id: 'trophy-hall',
    title: '赛博成就殿堂 · 荣誉展柜 (Cyber Trophy Hall)',
    icon: '🏆',
    isOpen: false,
    isMinimized: false,
    isMaximized: false,
    zIndex: 22,
    x: 260,
    y: 70,
    width: 600,
    height: 580,
    minWidth: 460,
    minHeight: 460,
  },
];

interface GameContextType {
  state: GameState;
  windows: WindowState[];
  activeWindowId: AppId | null;
  
  // Window controls
  openWindow: (id: AppId) => void;
  closeWindow: (id: AppId) => void;
  minimizeWindow: (id: AppId) => void;
  maximizeWindow: (id: AppId) => void;
  focusWindow: (id: AppId) => void;
  updateWindowPos: (id: AppId, x: number, y: number) => void;
  updateWindowSize: (id: AppId, width: number, height: number) => void;
  clampAllWindows: () => void;

  // Economy & Wooden Fish
  tapWoodenFish: (mult?: number) => void;
  buyUpgrade: (key: keyof GameState['upgrades']) => void;
  convertMeritToCredits: (amount: number) => boolean;
  /** Applies a credit delta and returns what was actually credited (0-balance is floored). */
  addCredits: (amount: number) => number;
  addMerit: (amount: number) => void;
  addHashrate: (amount: number) => void;

  // 放生池 — diminishing returns are owned by the state layer, not the UI
  releaseCreature: (id: 'duck' | 'koi' | 'turtle' | 'bug') => { ok: boolean; message: string; meritGained: number };

  // Persisted cooldowns (survive reload / extra tab, unlike the old sessionStorage)
  cooldownRemaining: (key: string) => number;
  startCooldown: (key: string, ms: number) => void;
  /** Today's usage counter for a capped action (release / arena / train / forge / fish). */
  getDailyCount: (key: string) => number;
  /** Consume one unit of a capped action so apps outside the core actions share the same budget. */
  recordDailyUse: (key: string, by?: number) => void;

  // Real Estate
  buyEstate: (estateId: string) => boolean;

  // Inventory
  addInventoryItem: (item: InventoryItem) => void;
  consumeItem: (itemId: string) => string | null;
  spendItem: (itemId: string, count?: number) => boolean;
  sellItem: (itemId: string, count: number) => void;

  // Pet
  feedPet: (food: 'oil' | 'ram' | 'battery') => void;
  petPet: () => void;
  addPetExp: (amount: number) => void;
  installPetChip: (chipId: string, cost: number) => boolean;
  startPetExplore: (durationSec: number) => void;
  claimPetExplore: () => void;

  // Wheel of Destiny (persistent progress)
  setWheelLife: (updater: (prev: WheelLifeState) => WheelLifeState) => void;

  // Stocks
  buyStock: (stockId: string, amount: number, leverage: number, position: 'long' | 'short') => boolean;
  /** Settles the position and returns what was actually credited, or null when there was nothing to close. */
  sellStock: (stockId: string) => { equity: number; pnl: number } | null;

  // Desktop todo & health
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
  clearDoneTodos: () => void;
  setHealthCheckIn: (type: 'water' | 'eyes' | 'stretch') => void;

  // Arcade records
  setSnakeHighScore: (score: number) => void;

  // Fishing dock
  recordCatch: (credits: number, merit: number) => void;

  // Stocks: $100 insider tip → real pump on a random stock; returns the tip message
  buyInsiderTip: () => string | null;

  // Cross-app user preferences
  setPrefs: (patch: Partial<GameState['prefs']> | ((prev: GameState['prefs']) => Partial<GameState['prefs']>)) => void;

  // New App Syndication Helpers
  rollGacha: (count: number, ticketCount: number) => { pulls: GachaPullOutcome[]; spentCredits: number; spentTickets: number } | null;
  claimDailyReportReward: () => boolean;
  claimAchievementMilestone: (id: string) => boolean;
  toggleDesktopPetRoam: () => void;
  toggleRadio: () => void;

  // In-app modal dialog (replaces browser alerts) & notifications
  dialog: CyberDialog | null;
  showDialog: (d: CyberDialog) => void;
  closeDialog: () => void;
  showAlert: (message: string, title?: string, icon?: string, tone?: CyberDialog['tone']) => void;
  notifications: UiNotification[];
  visualEffect: { type: 'lantern' | 'meteor' | 'fireworks' | 'gatling' | 'champagne' | 'golden_merit' | 'chicken' | 'coin_rain' | 'unicorn'; id: number } | null;
  notify: (n: { title: string; body?: string; icon?: string; tone?: NotificationTone }) => void;
  dismissNotification: (id: number) => void;
  triggerEffect: (type: 'lantern' | 'meteor' | 'fireworks' | 'gatling' | 'champagne' | 'golden_merit' | 'chicken' | 'coin_rain' | 'unicorn') => void;

  // System
  setTheme: (theme: ThemeType) => void;
  setBgMode: (mode: GameState['bgMode']) => void;
  toggleCrt: () => void;
  toggleSound: () => void;
  setSoundVolume: (vol: number) => void;
  resetAll: () => void;
  loadStateFromBase64: (code: string) => boolean;
}

// Window stacking band: windows live in [Z_BASE, Z_CEILING) so the z-50 taskbar
// and status bar can never be covered.
const Z_BASE = 10;
const Z_CEILING = 48;

const GameContext = createContext<GameContextType | null>(null);

// Window geometry & open state survive reloads (separate key so resetAll can clear it)
const WINDOW_LAYOUT_KEY = 'CYBERDECK_OS_2077_WINDOWS';

function loadWindowLayout(): WindowState[] {
  try {
    const raw = localStorage.getItem(WINDOW_LAYOUT_KEY);
    if (!raw) return INITIAL_WINDOWS;
    const saved = JSON.parse(raw) as Record<string, Partial<WindowState>>;
    return INITIAL_WINDOWS.map((w) => {
      const s = saved[w.id];
      if (!s) return w;
      let width = Math.max(w.minWidth || 360, s.width ?? w.width);
      let height = Math.max(w.minHeight || 300, s.height ?? w.height);
      if (w.id === 'minesweeper' && (width < 650 || height < 680)) {
        width = 650;
        height = 680;
      }
      return {
        ...w,
        ...s,
        width,
        height,
      };
    });
  } catch {
    return INITIAL_WINDOWS;
  }
}

function saveWindowLayout(windows: WindowState[]) {
  try {
    const layout: Record<string, Partial<WindowState>> = {};
    windows.forEach((w) => {
      layout[w.id] = {
        isOpen: w.isOpen,
        isMinimized: w.isMinimized,
        isMaximized: w.isMaximized,
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height,
      };
    });
    localStorage.setItem(WINDOW_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // storage full/unavailable — layout is cosmetic, ignore
  }
}

// Level the pet up as many times as its exp allows (shared by feeding, exploring, training & items)
function applyPetLevelUps(pet: PetState) {
  while (pet.exp >= pet.maxExp) {
    pet.exp -= pet.maxExp;
    pet.level += 1;
    pet.maxExp = Math.floor(pet.maxExp * 1.5);
    pet.power += 15;
    if (pet.level >= 5 && pet.stage === 1) pet.stage = 2;
    if (pet.level >= 12 && pet.stage === 2) pet.stage = 3;
  }
}

// Upgrade Wooden Fish Configurations
const UPGRADE_COSTS: Record<keyof GameState['upgrades'], { base: number; mult: number; meritGain?: number; autoGain?: number; title: string }> = {
  quantumStriker: { base: 20, mult: 1.6, meritGain: 1, title: '量子敲击器 (Quantum Striker)' },
  antiMatterRobe: { base: 100, mult: 1.8, autoGain: 2, title: '反物质袈裟 (Anti-Matter Robe)' },
  nanoScriptures: { base: 500, mult: 2.0, meritGain: 10, autoGain: 8, title: '纳米经文矩阵 (Nano Scripture)' },
  overclockBeads: { base: 2500, mult: 2.2, meritGain: 50, autoGain: 40, title: '超频舍利佛珠 (Overclock Beads)' },
  aiBodhisattva: { base: 10000, mult: 2.5, meritGain: 200, autoGain: 250, title: 'AI 菩萨云计算 (AI Bodhisattva)' },
};

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GameState>(() => loadSavedState());
  const [windows, setWindows] = useState<WindowState[]>(() => loadWindowLayout());

  // Persist window layout (debounced — dragging fires many updates per second)
  useEffect(() => {
    const t = setTimeout(() => saveWindowLayout(windows), 400);
    return () => clearTimeout(t);
  }, [windows]);
  const [activeWindowId, setActiveWindowId] = useState<AppId | null>('wooden-fish');
  const stateRef = useRef(state);
  const saveFailedRef = useRef(false);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ---- In-app Cyber Dialog modal (replaces native browser alert/confirm) ----
  const [dialog, setDialog] = useState<CyberDialog | null>(null);

  const showDialog = useCallback((d: CyberDialog) => {
    SoundFX.playKeyClick();
    setDialog(d);
  }, []);

  const closeDialog = useCallback(() => {
    setDialog(null);
  }, []);

  const showAlert = useCallback((message: string, title: string = '系统提示', icon: string = '⚡', tone: CyberDialog['tone'] = 'cyan') => {
    setDialog({
      id: `alert-${Date.now()}`,
      title,
      message,
      icon,
      tone,
      confirmText: '确认',
    });
  }, []);

  // Globally intercept window.alert so all existing and future calls render our stylish CyberDialog
  useEffect(() => {
    const origAlert = window.alert;
    window.alert = (msg: string) => {
      let icon = '⚡';
      let tone: CyberDialog['tone'] = 'cyan';
      let title = '系统提示';
      if (msg.includes('不足') || msg.includes('失败') || msg.includes('警告') || msg.includes('无法') || msg.includes('错误') || msg.includes('太低')) {
        icon = '⚠️';
        tone = 'red';
        title = '系统警告';
      } else if (msg.includes('成功') || msg.includes('恭喜') || msg.includes('获得') || msg.includes('购入') || msg.includes('开启') || msg.includes('突破') || msg.includes('完成')) {
        icon = '🎉';
        tone = 'gold';
        title = '操作成功';
      }
      showAlert(msg, title, icon, tone);
    };
    return () => {
      window.alert = origAlert;
    };
  }, [showAlert]);

  // ---- In-app notifications (non-blocking popups) & full-screen treats ----
  const [notifications, setNotifications] = useState<UiNotification[]>([]);
  const [visualEffect, setVisualEffect] = useState<{ type: 'lantern' | 'meteor' | 'fireworks' | 'gatling' | 'champagne' | 'golden_merit' | 'chicken' | 'coin_rain' | 'unicorn'; id: number } | null>(null);

  const dismissNotification = useCallback((id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const notify = useCallback((n: { title: string; body?: string; icon?: string; tone?: NotificationTone }) => {
    const id = Date.now() + Math.random();
    setNotifications((prev) => [...prev.slice(-2), {
      id,
      title: n.title,
      body: n.body ?? '',
      icon: n.icon ?? '🔔',
      tone: n.tone ?? 'info',
    }]);
    setTimeout(() => setNotifications((prev) => prev.filter((x) => x.id !== id)), 4800);
  }, []);

  const triggerEffect = useCallback((type: 'lantern' | 'meteor' | 'fireworks' | 'gatling' | 'champagne' | 'golden_merit' | 'chicken' | 'coin_rain' | 'unicorn') => {
    if (type === 'fireworks') {
      for (let i = 0; i < 7; i++) {
        setTimeout(() => confetti({
          particleCount: 110,
          spread: 130,
          startVelocity: 48,
          origin: { x: 0.18 + Math.random() * 0.64, y: 0.2 + Math.random() * 0.35 },
          colors: ['#ff0055', '#00f0ff', '#ffd700', '#b026ff', '#00ff88'],
        }), i * 380);
      }
      SoundFX.playLevelUp();
      return;
    }
    if (type === 'gatling') {
      for (let i = 0; i < 18; i++) {
        setTimeout(() => {
          confetti({
            particleCount: 45,
            spread: 90,
            startVelocity: 55,
            origin: { x: 0.1 + Math.random() * 0.8, y: 0.4 + Math.random() * 0.3 },
            colors: ['#00f0ff', '#ff0055', '#ffe600', '#00ff66', '#a855f7'],
          });
          SoundFX.playKeyClick();
        }, i * 130);
      }
      SoundFX.playLevelUp();
      return;
    }
    if (type === 'champagne') {
      SoundFX.playChampagnePop();
      confetti({
        particleCount: 140,
        spread: 100,
        startVelocity: 50,
        origin: { x: 0.5, y: 0.6 },
        colors: ['#ffd700', '#fef08a', '#ffffff', '#fbbf24'],
      });
    }
    if (type === 'chicken') {
      SoundFX.playChickenSquawk();
    }
    if (type === 'coin_rain') {
      SoundFX.playCash();
      for (let i = 0; i < 8; i++) {
        setTimeout(() => confetti({
          particleCount: 60,
          spread: 80,
          startVelocity: 40,
          origin: { x: 0.1 + Math.random() * 0.8, y: 0.1 },
          colors: ['#ffd700', '#f59e0b', '#d97706'],
        }), i * 200);
      }
    }
    if (type === 'golden_merit') {
      SoundFX.playWoodenFish(1.4);
      confetti({
        particleCount: 100,
        spread: 120,
        colors: ['#ffd700', '#fef9c3', '#f59e0b'],
      });
    }
    const id = Date.now();
    setVisualEffect({ type, id });
    setTimeout(() => setVisualEffect((cur) => (cur && cur.id === id ? null : cur)), 5200);
  }, []);

  // Persist to LocalStorage on a fixed 10s cycle, reading through the ref.
  // The previous "debounce 3s on [state]" never fired: the 1s tick produces a new
  // state object every second, so the timer was cleared and restarted forever —
  // progress only ever landed on disk at unload, and a crash killed the whole session.
  const flushState = useCallback(() => {
    if (saveState(stateRef.current)) {
      saveFailedRef.current = false;
      return;
    }
    if (!saveFailedRef.current) {
      saveFailedRef.current = true;
      notify({
        title: '存档写入失败',
        body: '浏览器存储已满或被禁用，进度无法保存。请到系统设置导出存档码备份。',
        icon: '⚠️',
        tone: 'error',
      });
    }
  }, [notify]);

  useEffect(() => {
    const timer = setInterval(flushState, 10_000);
    return () => {
      clearInterval(timer);
      flushState();
    };
  }, [flushState]);

  // Flush state immediately on window unload / hide
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveState(stateRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, []);

  // Sync sound settings
  useEffect(() => {
    SoundFX.setMuted(!state.soundEnabled);
    SoundFX.setVolume(state.soundVolume);
  }, [state.soundEnabled, state.soundVolume]);

  // Window Management
  const focusWindow = useCallback((id: AppId) => {
    setActiveWindowId(id);
    setWindows((list) => {
      const maxZ = list.reduce((m, w) => Math.max(m, w.zIndex), 0);
      // z must stay under 50 — the status bar and taskbar are z-50, and an uncapped
      // counter let a heavily-clicked window bury them alive.
      if (maxZ >= Z_CEILING) {
        const order = [...list].sort((a, b) => a.zIndex - b.zIndex);
        const step = Math.max(1, Math.floor((Z_CEILING - Z_BASE) / Math.max(1, order.length)));
        const rebuilt = new Map<string, number>();
        order.forEach((w, i) => rebuilt.set(w.id, Math.min(Z_CEILING - 1, Z_BASE + i * step)));
        return list.map((w) =>
          w.id === id
            ? { ...w, zIndex: Z_CEILING, isMinimized: false }
            : { ...w, zIndex: rebuilt.get(w.id) ?? w.zIndex },
        );
      }
      const nextZ = maxZ + 1;
      return list.map((w) => (w.id === id ? { ...w, zIndex: nextZ, isMinimized: false } : w));
    });
  }, []);

  const openWindow = useCallback((id: AppId) => {
    setWindows((list) =>
      list.map((w) => (w.id === id ? { ...w, isOpen: true, isMinimized: false } : w))
    );
    focusWindow(id);
    SoundFX.playKeyClick();
  }, [focusWindow]);

  const closeWindow = useCallback((id: AppId) => {
    setWindows((list) =>
      list.map((w) => (w.id === id ? { ...w, isOpen: false } : w))
    );
    SoundFX.playKeyClick();
  }, []);

  const minimizeWindow = useCallback((id: AppId) => {
    setWindows((list) =>
      list.map((w) => (w.id === id ? { ...w, isMinimized: true } : w))
    );
    // A minimized window must not keep the keyboard (arrow/WASD games) captive
    setActiveWindowId((prev) => (prev === id ? null : prev));
  }, []);

  const maximizeWindow = useCallback((id: AppId) => {
    setWindows((list) =>
      list.map((w) => (w.id === id ? { ...w, isMaximized: !w.isMaximized } : w))
    );
  }, []);

  /** Pull every window back into the viewport (resize / monitor swap / phone rotation). */
  const clampAllWindows = useCallback(() => {
    setWindows((list) =>
      list.map((w) => {
        const maxX = Math.max(0, window.innerWidth - 120);
        const maxY = Math.max(36, window.innerHeight - 80);
        const x = Math.min(Math.max(0, w.x), maxX);
        const y = Math.min(Math.max(36, w.y), maxY);
        const width = Math.min(w.width, Math.max(240, window.innerWidth));
        const height = Math.min(w.height, Math.max(200, window.innerHeight - 84));
        return x === w.x && y === w.y && width === w.width && height === w.height
          ? w
          : { ...w, x, y, width, height };
      }),
    );
  }, []);

  const updateWindowPos = useCallback((id: AppId, x: number, y: number) => {
    setWindows((list) =>
      list.map((w) => (w.id === id ? { ...w, x, y } : w))
    );
  }, []);

  const updateWindowSize = useCallback((id: AppId, width: number, height: number) => {
    setWindows((list) =>
      list.map((w) => (w.id === id ? { ...w, width, height } : w))
    );
  }, []);

  // Wooden fish clicking (mult > 1 during combo overdrive).
  // The selected scripture changes the tap sound pitch — each one rings differently.
  const tapWoodenFish = useCallback((mult: number = 1) => {
    const cur = stateRef.current;
    const pitch = cur.prefs.scripture.includes('清心咒') ? 1.25 : cur.prefs.scripture.includes('金刚经') ? 0.8 : 1.0;
    SoundFX.playWoodenFish(pitch);
    const meritGain = getMeritPerTap(cur, mult);
    setState((prev) => ({
      ...prev,
      merit: prev.merit + meritGain,
      totalMeritGained: prev.totalMeritGained + meritGain,
      totalClicks: prev.totalClicks + 1,
    }));
  }, []);

  const buyUpgrade = useCallback((key: keyof GameState['upgrades']) => {
    const cur = stateRef.current;
    const cfg = UPGRADE_COSTS[key];
    const curLvl = cur.upgrades[key];
    const cost = Math.floor(cfg.base * Math.pow(cfg.mult, curLvl));
    if (cur.merit < cost) {
      SoundFX.playAlert();
      return false;
    }
    SoundFX.playCash();
    const nextLvl = curLvl + 1;
    const meritPerClick = cur.meritPerClick + (cfg.meritGain || 0);
    const autoMeritPerSec = cur.autoMeritPerSec + (cfg.autoGain || 0);

    setState((prev) => ({
      ...prev,
      merit: prev.merit - cost,
      meritPerClick,
      autoMeritPerSec,
      upgrades: {
        ...prev.upgrades,
        [key]: nextLvl,
      },
    }));
    return true;
  }, []);

  const convertMeritToCredits = useCallback((amount: number) => {
    if (!(amount > 0)) return false;
    const cur = stateRef.current;
    if (cur.merit < amount) {
      SoundFX.playAlert();
      return false;
    }
    SoundFX.playCash();
    const creditGain = Math.floor(amount * MERIT_TO_CREDIT_RATE); // exchange rate
    setState((prev) => ({
      ...prev,
      merit: prev.merit - amount,
      credits: prev.credits + creditGain,
    }));
    return true;
  }, []);

  // 放生池: the merit payout decays with every release made today, so the
  // 放生 → 兑换 round trip stops compounding (see getReleaseFactor).
  const releaseCreature = useCallback((id: 'duck' | 'koi' | 'turtle' | 'bug') => {
    const option = RELEASE_OPTIONS.find((o) => o.id === id);
    if (!option) return { ok: false, message: '未知的放生对象', meritGained: 0 };

    const cur = stateRef.current;
    if (cur.credits < option.cost) {
      SoundFX.playAlert();
      return {
        ok: false,
        message: `赛博币不足！放生【${option.name}】需要 ₵${option.cost} 赛博币！`,
        meritGained: 0,
      };
    }

    const doneToday = dailyCount(cur, 'release');
    const factor = getReleaseFactor(doneToday);
    const meritGained = Math.max(1, Math.floor(option.merit * factor));
    const faded = factor < 0.999;
    const message = faded
      ? `${option.msg}\n今日第 ${doneToday + 1} 次放生，功德已随善念递减：+${meritGained}（满值 ${option.merit}）。当日累计兑换功德超过成本后，放生不再划算。`
      : `${option.msg} 功德 +${meritGained}！`;

    SoundFX.playCash();
    setState((prev) => {
      const stillAffordable = prev.credits >= option.cost;
      if (!stillAffordable) return prev;
      const day = dailyCount(prev, 'release');
      const gain = Math.max(1, Math.floor(option.merit * getReleaseFactor(day)));
      return {
        ...prev,
        credits: prev.credits - option.cost,
        merit: prev.merit + gain,
        totalMeritGained: prev.totalMeritGained + gain,
        daily: bumpDaily(prev, 'release', 1),
      };
    });
    return { ok: true, message, meritGained };
  }, []);

  // Persisted cooldowns: the terminal used to keep these in sessionStorage, so a
  // second tab or a refresh silently reset every money-making timer.
  const cooldownRemaining = useCallback((key: string): number => {
    const until = stateRef.current.cooldowns?.[key] ?? 0;
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  }, []);

  const startCooldown = useCallback((key: string, ms: number) => {
    setState((prev) => ({
      ...prev,
      cooldowns: { ...(prev.cooldowns ?? {}), [key]: Date.now() + ms },
    }));
  }, []);

  const getDailyCount = useCallback((key: string) => dailyCount(stateRef.current, key), []);

  /** Consume one unit of a capped action (arena entries, forge output, dungeon floors …)
   *  so apps that don't pay through a core action can still feed the daily counters. */
  const recordDailyUse = useCallback((key: string, by: number = 1) => {
    setState((prev) => ({ ...prev, daily: bumpDaily(prev, key, Math.max(1, Math.floor(by) || 1)) }));
  }, []);

  const addCredits = useCallback((amount: number): number => {
    if (!Number.isFinite(amount)) return 0;
    // Compute the applied delta from the ref, and keep the ref authoritative for the
    // rest of this frame: React may run the updater lazily (when another update is
    // already queued), and a lazily-captured delta would read back as 0 to the caller.
    const cur = stateRef.current;
    const next = Math.max(0, cur.credits + amount);
    const applied = next - cur.credits;
    if (applied === 0 && amount !== 0) {
      SoundFX.playAlert();
      return 0;
    }
    stateRef.current = { ...cur, credits: next };
    setState((prev) => ({ ...prev, credits: Math.max(0, prev.credits + amount) }));
    return applied;
  }, []);

  const addMerit = useCallback((amount: number) => {
    if (!Number.isFinite(amount)) return;
    setState((prev) => ({
      ...prev,
      merit: Math.max(0, prev.merit + amount),
      totalMeritGained: prev.totalMeritGained + Math.max(0, amount),
    }));
  }, []);

  const addHashrate = useCallback((amount: number) => {
    if (!Number.isFinite(amount)) return;
    setState((prev) => ({ ...prev, hashrate: Math.min(HASHRATE_CAP, Math.max(0, prev.hashrate + amount)) }));
  }, []);

  // Real Estate: buy a property (persisted, pays dividends every cycle in the main loop)
  const buyEstate = useCallback((estateId: string) => {
    const cur = stateRef.current;
    const estate = ESTATE_DEFS.find((e) => e.id === estateId);
    if (!estate || cur.estates.includes(estateId)) return false;
    if (cur.credits < estate.price) {
      SoundFX.playAlert();
      return false;
    }
    SoundFX.playLevelUp();
    setState((prev) => ({
      ...prev,
      credits: prev.credits - estate.price,
      estates: [...prev.estates, estateId],
    }));
    return true;
  }, []);

  // Inventory: merge by NAME so duplicate gacha pulls stack in one slot
  const addInventoryItem = useCallback((item: InventoryItem) => {
    setState((prev) => {
      const idx = prev.inventory.findIndex((i) => i.name === item.name);
      let nextInv = [...prev.inventory];
      if (idx >= 0) {
        nextInv[idx] = { ...nextInv[idx], count: nextInv[idx].count + item.count };
      } else {
        nextInv.push(item);
      }
      return { ...prev, inventory: nextInv };
    });
  }, []);

  const applyItemEffect = (prev: GameState, item: InventoryItem): { next: Partial<GameState>; message: string } => {
    const eff = ITEM_EFFECTS[item.name];
    const pet = { ...prev.pet };
    const next: Partial<GameState> = { pet };

    if (!eff) {
      const flavor = EMOTIONAL_FLAVOR[item.name];
      if (flavor) return { next, message: `${item.icon} 【${item.name}】已激活！${flavor}` };
      return { next, message: `【${item.name}】是稀有收藏品，暂时没有主动效果，好好收藏吧！` };
    }

    const parts: string[] = [];
    if (eff.credits) {
      next.credits = prev.credits + eff.credits;
      parts.push(`赛博币 +₵${eff.credits}`);
    }
    if (eff.merit) {
      const gain = Math.round(eff.merit * getAchievementMultiplier(prev));
      next.merit = prev.merit + gain;
      next.totalMeritGained = prev.totalMeritGained + gain;
      parts.push(`功德 +${gain}`);
    }
    if (eff.petExp) {
      pet.exp += eff.petExp;
      applyPetLevelUps(pet);
      parts.push(`宠物经验 +${eff.petExp}`);
    }
    if (eff.petEnergy) {
      pet.energy = Math.min(100, pet.energy + eff.petEnergy);
      parts.push(`宠物电量 +${eff.petEnergy}`);
    }
    if (eff.petHappiness) {
      pet.happiness = Math.min(100, pet.happiness + eff.petHappiness);
      parts.push(`宠物心情 +${eff.petHappiness}`);
    }
    if (eff.petHunger) {
      pet.hunger = Math.min(100, pet.hunger + eff.petHunger);
      parts.push(`宠物饱食 +${eff.petHunger}`);
    }
    return { next, message: `🎒 使用【${item.name}】成功！${parts.join('，')}！` };
  };

  const consumeItem = useCallback((itemId: string): string | null => {
    const cur = stateRef.current;
    const target = cur.inventory.find((i) => i.id === itemId);
    if (!target || target.count <= 0) return null;

    const kind = EMOTIONAL_ITEMS[target.name];
    if (kind === 'fireworks') triggerEffect('fireworks');
    else if (kind === 'lantern' || kind === 'meteor') triggerEffect(kind);
    else if (kind === 'collectible') SoundFX.playLevelUp();
    else SoundFX.playCash();

    const { next, message } = applyItemEffect(cur, target);

    setState((prev) => {
      const idx = prev.inventory.findIndex((i) => i.id === itemId);
      if (idx < 0 || prev.inventory[idx].count <= 0) return prev;
      const item = prev.inventory[idx];
      const nextInv = [...prev.inventory];
      if (item.count > 1) {
        nextInv[idx] = { ...item, count: item.count - 1 };
      } else {
        nextInv.splice(idx, 1);
      }
      return {
        ...prev,
        ...next,
        inventory: nextInv,
      };
    });
    return message;
  }, [triggerEffect]);

  // Pure deduction without firing item effect (used when spending items as tools or currency)
  const spendItem = useCallback((itemId: string, count: number = 1): boolean => {
    if (count <= 0) return true;
    const cur = stateRef.current;
    const target = cur.inventory.find((i) => i.id === itemId);
    if (!target || target.count < count) return false;

    setState((prev) => {
      const idx = prev.inventory.findIndex((i) => i.id === itemId);
      if (idx < 0 || prev.inventory[idx].count < count) return prev;
      const nextInv = [...prev.inventory];
      if (nextInv[idx].count > count) {
        nextInv[idx] = { ...nextInv[idx], count: nextInv[idx].count - count };
      } else {
        nextInv.splice(idx, 1);
      }
      return { ...prev, inventory: nextInv };
    });
    return true;
  }, []);

  // Cyber Exchange: sell N copies of an inventory item at the 70% buyback price
  const sellItem = useCallback((itemId: string, count: number) => {
    setState((prev) => {
      const idx = prev.inventory.findIndex((i) => i.id === itemId);
      if (idx < 0) return prev;
      const item = prev.inventory[idx];
      const n = Math.max(0, Math.min(count, item.count));
      if (n <= 0) return prev;
      const unit = getSellPrice(item.name, item.rarity);
      const gain = unit * n;
      const nextInv = [...prev.inventory];
      if (item.count > n) nextInv[idx] = { ...item, count: item.count - n };
      else nextInv.splice(idx, 1);
      SoundFX.playCash();
      return { ...prev, credits: prev.credits + gain, inventory: nextInv };
    });
  }, []);

  // Pet Actions
  const feedPet = useCallback((food: 'oil' | 'ram' | 'battery') => {
    setState((prev) => {
      const pet = { ...prev.pet };
      let credits = prev.credits;

      if (food === 'oil') {
        if (credits < 20) {
          SoundFX.playAlert();
          return prev;
        }
        credits -= 20;
        pet.hunger = Math.min(100, pet.hunger + 30);
        pet.happiness = Math.min(100, pet.happiness + 10);
      } else if (food === 'battery') {
        if (credits < 50) {
          SoundFX.playAlert();
          return prev;
        }
        credits -= 50;
        pet.energy = Math.min(100, pet.energy + 40);
        pet.happiness = Math.min(100, pet.happiness + 15);
      } else if (food === 'ram') {
        if (credits < 150) {
          SoundFX.playAlert();
          return prev;
        }
        credits -= 150;
        pet.exp += 60;
        pet.hunger = Math.min(100, pet.hunger + 20);
        pet.happiness = Math.min(100, pet.happiness + 25);
      }

      const wasLevel = pet.level;
      applyPetLevelUps(pet);
      if (pet.level > wasLevel) {
        SoundFX.playLevelUp();
      } else {
        SoundFX.playCash();
      }

      return { ...prev, pet, credits };
    });
  }, []);

  const petPet = useCallback(() => {
    SoundFX.playWoodenFish(1.4);
    setState((prev) => {
      const pet = { ...prev.pet };
      pet.happiness = Math.min(100, pet.happiness + 5);
      pet.exp += 2;
      applyPetLevelUps(pet);
      return { ...prev, pet };
    });
  }, []);

  // Training gives exp for free, so it is capped per day (the $150 DDR7 stick and the
  // shop chips were strictly dominated by spamming the train button).
  const addPetExp = useCallback((amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    let blocked = false;
    setState((prev) => {
      const used = dailyCount(prev, 'train');
      const scale = dailyDecay(used, DAILY_LIMITS.train);
      if (scale === 0) {
        blocked = true;
        return prev;
      }
      const pet = { ...prev.pet };
      pet.exp += Math.max(1, Math.round(amount * scale));
      applyPetLevelUps(pet);
      return { ...prev, pet, daily: bumpDaily(prev, 'train', 1) };
    });
    if (blocked) SoundFX.playAlert();
  }, []);

  const installPetChip = useCallback((chipId: string, cost: number) => {
    const cur = stateRef.current;
    if (cur.petChips.includes(chipId) || cur.credits < cost) {
      SoundFX.playAlert();
      return false;
    }
    SoundFX.playLevelUp();
    setState((prev) => ({
      ...prev,
      credits: prev.credits - cost,
      petChips: [...prev.petChips, chipId],
    }));
    return true;
  }, []);

  const startPetExplore = useCallback((durationSec: number) => {
    const cur = stateRef.current;
    const energyCost = durationSec >= 120 ? 50 : durationSec >= 60 ? 35 : 20;
    if (cur.pet.isExploring || cur.pet.energy < energyCost) {
      SoundFX.playAlert();
      return;
    }
    SoundFX.playCash();
    // Engine chip (反重力离子推进器): exploration takes 30% less time
    const hasEngine = cur.petChips.includes('c3');
    const realDuration = hasEngine ? Math.max(1, Math.round(durationSec * 0.7)) : durationSec;

    setState((prev) => {
      if (prev.pet.isExploring) return prev;
      // Longer trips must pay more: rewards and drop odds scale with duration, and the
      // pet's hunger/happiness now feeds into the payout (they used to have no consumer).
      const stage = prev.pet.stage;
      const minutes = Math.max(1, durationSec / 30);
      const mood = 0.5 + ((prev.pet.hunger + prev.pet.happiness) / 200) * 0.7;
      const rewardBase = Math.round((100 + Math.random() * 100 * stage) * minutes * mood);
      const expBase = Math.round((40 + Math.random() * 40 * stage) * minutes * mood);
      const dropBoost = Math.min(0.45, 0.12 * minutes);

      const pet = {
        ...prev.pet,
        isExploring: true,
        exploreDuration: realDuration,
        exploreRemaining: realDuration,
        exploreEndAt: Date.now() + realDuration * 1000,
        exploreRewardBase: rewardBase,
        exploreExpBase: expBase,
        exploreDropBoost: dropBoost,
        energy: prev.pet.energy - energyCost,
        exploreLogs: [
          `[${new Date().toLocaleTimeString()}] 机甲修狗已出发前往【赛博荒原】探险（消耗 ${energyCost} 电量）...`,
          ...prev.pet.exploreLogs.slice(0, 8),
        ],
      };
      return { ...prev, pet };
    });
  }, []);

  const claimPetExplore = useCallback(() => {
    let claimed = false;
    setState((prev) => {
      if (!prev.pet.isExploring) return prev;
      const endAt = prev.pet.exploreEndAt || 0;
      const remaining = endAt > 0 ? Math.ceil((endAt - Date.now()) / 1000) : prev.pet.exploreRemaining;
      if (remaining > 0) return prev;
      claimed = true;

      const hasBrain = prev.petChips.includes('c1');
      const hasPetSynergy = isGachaSeriesComplete(prev, 'pet');
      const bonus = (hasBrain ? 1.25 : 1) * (hasPetSynergy ? 1.5 : 1);
      const scale = dailyDecay(dailyCount(prev, 'explore'), DAILY_LIMITS.explore);
      const creditGain = Math.max(0, Math.round(prev.pet.exploreRewardBase * bonus * scale));
      const expGain = Math.max(0, Math.round(prev.pet.exploreExpBase * bonus * scale));

      // Synergy: Pet brings back cross-app items!
      const nextInv = [...prev.inventory];
      const roll = Math.random();
      let foundItemMsg = '';
      const dropThreshold = (hasPetSynergy ? 0.7 : 0.45) + (prev.pet.exploreDropBoost || 0);
      if (roll < Math.min(0.95, dropThreshold)) {
        const itemRoll = Math.random();
        const mk = (id: string, name: string, icon: string, desc: string, rarity: InventoryItem['rarity']) =>
          nextInv.push({ id: `${id}-${Date.now()}`, name, icon, desc, rarity, count: 1 });
        if (itemRoll < 0.4) {
          mk('item-probe', '量子探针', '🔮', '宠物荒原探险挖掘出的量子探针！在赛博量子扫雷中可透视并标记 1 颗地雷', 'rare');
          foundItemMsg = '，并刨出了【量子探针】x1！';
        } else if (itemRoll < 0.75) {
          mk('item-ore', '九天玄晶矿石', '💎', '宠物荒原探险挖掘出的灵矿！八卦炼宝炉合成高阶本命法宝的核心原料', 'rare');
          foundItemMsg = '，并带回了【九天玄晶矿石】x1！';
        } else {
          mk('item-ticket', '赛博扭蛋抽奖券', '🎫', '宠物荒原捡回的限定扭蛋券！可在盲盒扭蛋机中免费抽取 1 次珍稀藏品', 'epic');
          foundItemMsg = '，并叼回了【赛博扭蛋抽奖券】x1！';
        }
      }

      const pet = {
        ...prev.pet,
        isExploring: false,
        exp: prev.pet.exp + expGain,
        exploreRemaining: 0,
        exploreEndAt: 0,
        exploreRewardBase: 0,
        exploreExpBase: 0,
        exploreDropBoost: 0,
        // Battery recharge on the way home — energy had no natural regen before,
        // so expeditions were purely a $50-per-run purchase.
        energy: Math.min(100, prev.pet.energy + 15),
        exploreLogs: [
          `[${new Date().toLocaleTimeString()}] 探险归来！带回了 ${creditGain} 赛博币${foundItemMsg}`,
          ...prev.pet.exploreLogs.slice(0, 8),
        ],
      };
      applyPetLevelUps(pet);
      return {
        ...prev,
        pet,
        credits: prev.credits + creditGain,
        inventory: nextInv,
        daily: bumpDaily(prev, 'explore', 1),
      };
    });
    if (claimed) SoundFX.playLevelUp();
  }, []);

  // Wheel of Destiny: persist all progress through global game state
  const setWheelLife = useCallback((updater: (prev: WheelLifeState) => WheelLifeState) => {
    setState((prev) => ({ ...prev, wheelLife: updater(prev.wheelLife) }));
  }, []);

  // Stock trading
  const buyStock = useCallback((stockId: string, amount: number, leverage: number, position: 'long' | 'short') => {
    const cur = stateRef.current;
    const stock = cur.stocks.find((s) => s.id === stockId);
    const safeAmount = Math.floor(Number.isFinite(amount) ? amount : 0);
    const safeLeverage = Math.min(100, Math.max(1, Math.floor(Number.isFinite(leverage) ? leverage : 1)));
    if (!stock || !Number.isFinite(stock.price) || stock.price <= 0 || safeAmount <= 0) return false;
    // Can't stack a short on top of an existing long (or vice versa) — close it first
    if (stock.ownedAmount > 0 && stock.position !== 'none' && stock.position !== position) {
      SoundFX.playAlert();
      return false;
    }
    const margin = (stock.price * safeAmount) / safeLeverage;
    const hasWorkSynergy = isGachaSeriesComplete(cur, 'work');
    const feeRate = hasWorkSynergy ? 0 : 0.01; // 1% stamp duty
    const fee = margin * feeRate;
    const totalRequired = margin + fee;
    if (cur.credits < totalRequired) {
      SoundFX.playAlert();
      return false;
    }
    SoundFX.playCash();

    setState((prev) => {
      const updatedStocks = prev.stocks.map((s) => {
        if (s.id === stockId) {
          const totalShares = s.ownedAmount + safeAmount;
          if (totalShares <= 0) return s;
          const avgCost = ((s.avgCost * s.ownedAmount) + (stock.price * safeAmount)) / totalShares;
          const totalMargin = s.margin + margin;
          const weightedLeverage = totalMargin > 0
            ? ((s.margin * s.leverage) + (margin * safeLeverage)) / totalMargin
            : safeLeverage;
          return {
            ...s,
            ownedAmount: totalShares,
            avgCost,
            leverage: Number(weightedLeverage.toFixed(2)),
            position,
            margin: totalMargin,
          };
        }
        return s;
      });

      const log = `[买入] 以 ₵${stock.price.toFixed(2)} 买入 ${safeAmount} 份 ${stock.symbol} (${safeLeverage}x ${position === 'long' ? '做多' : '做空'}${fee > 0 ? `，印花税 ₵${fee.toFixed(2)}` : '，免税'})`;
      return {
        ...prev,
        credits: prev.credits - totalRequired,
        stocks: updatedStocks,
        tradeLogs: [log, ...prev.tradeLogs.slice(0, 15)],
      };
    });
    return true;
  }, []);

  const sellStock = useCallback((stockId: string) => {
    const settled: { equity: number; pnl: number }[] = [];

    setState((prev) => {
      const held = prev.stocks.find((s) => s.id === stockId);
      // Everything is derived from `held` inside the updater, so a double click in the
      // same frame cannot settle the same position twice.
      if (!held || held.ownedAmount <= 0 || held.margin <= 0) return prev;

      const equity = getPositionEquity(held);
      const pnl = equity - held.margin;
      settled.push({ equity, pnl });

      const updatedStocks = prev.stocks.map((s) =>
        s.id === stockId
          ? { ...s, ownedAmount: 0, avgCost: 0, position: 'none' as const, leverage: 1, margin: 0 }
          : s,
      );

      const log = `[平仓] 卖出 ${held.symbol}，结算返还 ₵${equity.toFixed(2)} (盈亏: ${pnl >= 0 ? '+' : ''}₵${pnl.toFixed(2)})`;
      return {
        ...prev,
        credits: prev.credits + equity,
        stocks: updatedStocks,
        tradeLogs: [log, ...prev.tradeLogs.slice(0, 15)],
      };
    });

    if (settled.length === 0) {
      SoundFX.playAlert();
      return null;
    }
    if (settled[0].pnl >= 0) SoundFX.playLevelUp();
    else SoundFX.playAlert();
    return settled[0];
  }, []);

  // System settings
  const setTheme = useCallback((theme: ThemeType) => {
    setState((prev) => ({ ...prev, theme }));
  }, []);

  // Desktop todo list (persisted)
  const addTodo = useCallback((text: string) => {
    setState((prev) => ({
      ...prev,
      todos: [...prev.todos, { id: String(Date.now()), text, done: false }],
    }));
  }, []);

  const toggleTodo = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      todos: prev.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }));
  }, []);

  const removeTodo = useCallback((id: string) => {
    setState((prev) => ({ ...prev, todos: prev.todos.filter((t) => t.id !== id) }));
  }, []);

  const clearDoneTodos = useCallback(() => {
    setState((prev) => ({ ...prev, todos: prev.todos.filter((t) => !t.done) }));
  }, []);

  // Health check-ins (auto-reset when the date changes)
  const setHealthCheckIn = useCallback((type: 'water' | 'eyes' | 'stretch') => {
    setState((prev) => {
      const today = new Date().toDateString();
      const base = prev.healthCheckIns.date === today
        ? prev.healthCheckIns
        : { date: today, water: false, eyes: false, stretch: false };
      return { ...prev, healthCheckIns: { ...base, [type]: true } };
    });
  }, []);

  const setSnakeHighScore = useCallback((score: number) => {
    setState((prev) => (score > prev.snakeHighScore ? { ...prev, snakeHighScore: score } : prev));
  }, []);

  // Persist a user preference (snake skin/mode, scripture, synth pattern & bpm, ambience mix)
  const setPrefs = useCallback((patch: Partial<GameState['prefs']> | ((prev: GameState['prefs']) => Partial<GameState['prefs']>)) => {
    setState((prev) => ({
      ...prev,
      prefs: { ...prev.prefs, ...(typeof patch === 'function' ? patch(prev.prefs) : patch) },
    }));
  }, []);

  // Fishing dock: one fish landed — credits/merit + today's tally (auto-resets each day).
  // A single cast had an expected value of ~$203 against a $20 bait cost with no
  // cooldown, so the payout collapses to 10% after the daily soft cap.
  const recordCatch = useCallback((credits: number, merit: number) => {
    if (!Number.isFinite(credits) || !Number.isFinite(merit)) return;
    setState((prev) => {
      const today = todayStr();
      const base = prev.fishing?.date === today ? prev.fishing : { date: today, count: 0, earned: 0 };
      const scale = dailyDecay(base.count, DAILY_LIMITS.fish);
      const netCredits = Math.max(0, Math.round(credits * scale));
      const netMerit = Math.max(0, Math.round(merit * scale));
      return {
        ...prev,
        credits: prev.credits + netCredits,
        merit: prev.merit + netMerit,
        totalMeritGained: prev.totalMeritGained + netMerit,
        fishing: { date: today, count: base.count + 1, earned: base.earned + netCredits },
      };
    });
  }, []);

  // Insider tip: $100 buys a 90-second edge. The pumped symbol is deliberately NOT
  // named — a published, guaranteed-upward-only ticker was a risk-free 100x buy.
  const buyInsiderTip = useCallback((): string | null => {
    const cur = stateRef.current;
    const left = Math.max(0, Math.ceil(((cur.cooldowns?.['insider-tip'] ?? 0) - Date.now()) / 1000));
    if (left > 0) {
      SoundFX.playAlert();
      return `⏳ 华尔街内幕调查员正在避险，请等待 ${left} 秒后再打探情报！`;
    }
    if (cur.credits < 100) {
      SoundFX.playAlert();
      return null;
    }

    const now = Date.now();
    const pool = cur.stocks.filter((s) => (s.boostTicks ?? 0) <= 0);
    const pick = pool[Math.floor(Math.random() * Math.max(1, pool.length))] ?? cur.stocks[0];
    SoundFX.playCash();
    const message = '🕵️‍♂️ 【绝密内幕情报】某量子基金正在暗中调仓，未来 90 秒盘面波动加剧、方向未知。真金白银还是情报费，自己掂量。';

    setState((prev) => ({
      ...prev,
      credits: prev.credits - 100,
      cooldowns: { ...(prev.cooldowns ?? {}), 'insider-tip': now + 45_000 },
      stocks: prev.stocks.map((s) => (s.id === pick.id ? { ...s, boostTicks: 90 } : s)),
    }));
    return message;
  }, []);

  const setBgMode = useCallback((bgMode: GameState['bgMode']) => {
    setState((prev) => ({ ...prev, bgMode }));
  }, []);

  const toggleCrt = useCallback(() => {
    setState((prev) => ({ ...prev, crtEffect: !prev.crtEffect }));
  }, []);

  const toggleSound = useCallback(() => {
    setState((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }));
  }, []);

  const setSoundVolume = useCallback((soundVolume: number) => {
    setState((prev) => ({ ...prev, soundVolume }));
  }, []);

  const resetAll = useCallback(() => {
    setState(INITIAL_GAME_STATE);
    setWindows(INITIAL_WINDOWS);
    try {
      localStorage.removeItem(WINDOW_LAYOUT_KEY);
      localStorage.removeItem('CYBERDECK_OS_2077_SAVE');
      // Apps keep their own side keys (dungeon run snapshot, virtual FS, forge
      // daily/best, …). A "reset" that leaves those behind resurrects old progress
      // on the next open, so sweep the whole namespace.
      const stale: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('CYBERDECK_')) stale.push(k);
      }
      stale.forEach((k) => localStorage.removeItem(k));
      sessionStorage.clear();
    } catch {
      // ignore storage errors during reset
    }
    SoundFX.playAlert();
  }, []);

  const loadStateFromBase64 = useCallback((code: string) => {
    const loaded = importSaveData(code);
    if (loaded) {
      setState(loaded);
      SoundFX.playLevelUp();
      return true;
    } else {
      SoundFX.playAlert();
      return false;
    }
  }, []);

  // 1-second heartbeat: auto merit, passive mining, estate dividends, pet expedition,
  // daily rollover, stock ticks and liquidations.
  const tickCountRef = useRef(0);
  const marketDayRef = useRef(new Date().toDateString());
  useEffect(() => {
    const timer = setInterval(() => {
      tickCountRef.current += 1;
      const tick = tickCountRef.current;
      setState((prev) => {
        // 1. Auto Merit — same global multiplier as manual taps
        let nextMerit = prev.merit;
        let nextTotalMerit = prev.totalMeritGained;
        if (prev.autoMeritPerSec > 0) {
          const gain = Math.round(prev.autoMeritPerSec * getGlobalMeritMultiplier(prev));
          nextMerit += gain;
          nextTotalMerit += gain;
        }

        // 1b. Passive mining: pays hashrate/4 every 30s and the rig degrades 3% per
        //     payout. `mine` used to add hashrate for free with no sink and no decay,
        //     which made it a permanently growing annuity.
        let nextCredits = prev.credits;
        let nextHashrate = prev.hashrate;
        if (prev.hashrate > 0 && tick % 30 === 0) {
          nextCredits += Math.max(1, Math.round(prev.hashrate / 4));
          nextHashrate = Math.max(0, Math.round(prev.hashrate * (1 - HASHRATE_DECAY_PER_PAYOUT)));
        }

        // 1c. Real estate dividends — pay every interval missed while the tab was
        //     throttled or closed, capped at 10 cycles, and never from a future stamp.
        let nextLastPayout = prev.lastEstatePayout;
        if (prev.estates.length > 0) {
          const nowTs = Date.now();
          if (prev.lastEstatePayout === 0) {
            nextLastPayout = nowTs;
          } else if (prev.lastEstatePayout > nowTs) {
            nextLastPayout = nowTs; // clock rolled backwards
          } else {
            const income = ESTATE_DEFS
              .filter((e) => prev.estates.includes(e.id))
              .reduce((acc, e) => acc + e.yield, 0);
            let due = prev.lastEstatePayout;
            let credited = 0;
            let cycles = 0;
            while (due + ESTATE_PAYOUT_INTERVAL_MS <= nowTs && cycles < 10) {
              due += ESTATE_PAYOUT_INTERVAL_MS;
              credited += income;
              cycles += 1;
            }
            if (cycles > 0) {
              nextCredits += credited;
              nextLastPayout = due;
            }
          }
        }

        // 2. Pet Exploration & Natural Decay (armor chip halves the decay rate)
        let nextPet = { ...prev.pet };
        if (nextPet.isExploring) {
          const endAt = nextPet.exploreEndAt || 0;
          nextPet.exploreRemaining =
            endAt > 0
              ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
              : Math.max(0, nextPet.exploreRemaining - 1); // older save started before the deadline field existed
        }
        const hasArmorChip = prev.petChips.includes('c2');
        const hasPetSynergy = isGachaSeriesComplete(prev, 'pet');
        const decayChance = hasPetSynergy ? (hasArmorChip ? 0.012 : 0.025) : (hasArmorChip ? 0.025 : 0.05);
        if (Math.random() < decayChance) {
          nextPet.hunger = Math.max(0, nextPet.hunger - 1);
        }
        if (Math.random() < decayChance) {
          nextPet.happiness = Math.max(0, nextPet.happiness - 1);
        }
        // Self-heal: exp banked beyond the level-up threshold (older saves) levels up on the next tick
        if (nextPet.exp >= nextPet.maxExp) {
          applyPetLevelUps(nextPet);
        }

        // 2b. Day rolled over while the deck is running: reset "today"-scoped state
        let nextTodos = prev.todos;
        let nextTodoDate = prev.todoDate;
        let nextFishing = prev.fishing;
        let nextDaily = prev.daily;
        const today = todayStr();
        if (prev.todoDate !== today) {
          nextTodos = prev.todos.map((t) => ({ ...t, done: false }));
          nextTodoDate = today;
        }
        if (prev.fishing.date !== today) {
          nextFishing = { date: today, count: 0, earned: 0 };
        }
        if ((prev.daily?.date ?? '') !== today) {
          nextDaily = { date: today, counters: {} };
        }

        // 3. Stock prices: zero-drift random walk pulled back toward a fair-value anchor.
        //    The old walk had a +0.03%/s drift (≈2.55x per hour) and insider pumps were
        //    guaranteed-positive, so any long position was free money.
        const nextStocks = prev.stocks.map((stock) => {
          const boost = stock.boostTicks ?? 0;
          const anchor = STOCK_ANCHOR[stock.id] ?? stock.price;
          const reversion = ((anchor - stock.price) / Math.max(anchor, 0.01)) * 0.02;
          const shock = boost > 0 ? (Math.random() - 0.5) * 0.06 : (Math.random() - 0.5) * 0.03;
          const deltaPercent = shock + reversion;
          let newPrice = Math.max(0.01, stock.price * (1 + deltaPercent));
          // Round by relative magnitude: a flat 2-decimal round freezes sub-cent symbols.
          const precision = newPrice >= 100 ? 1 : newPrice >= 1 ? 2 : newPrice >= 0.01 ? 4 : 6;
          newPrice = Number(newPrice.toFixed(precision));
          const newHistory = [...stock.history.slice(-89), newPrice];
          const changePercent = stock.history.length
            ? Number((((newPrice - stock.history[0]) / stock.history[0]) * 100).toFixed(2))
            : 0;

          let next: GameState['stocks'][number] = {
            ...stock,
            boostTicks: Math.max(0, boost - 1),
            price: newPrice,
            history: newHistory,
            changePercent,
            high: Math.max(stock.high, newPrice),
            low: Math.min(stock.low, newPrice),
          };

          // 3b. Liquidation: leveraged equity below 35% of margin is force-closed at
          //     that equity, so a 100x position can no longer lose only its margin.
          if (next.ownedAmount > 0 && shouldLiquidate(next)) {
            const equity = getPositionEquity(next);
            next = { ...next, ownedAmount: 0, avgCost: 0, position: 'none', leverage: 1, margin: 0 };
            nextCredits += equity;
          }
          return next;
        });

        // 3c. Session highs/lows are meaningless as "today's range" — re-anchor at local midnight
        const marketDay = new Date().toDateString();
        let rangedStocks = nextStocks;
        if (marketDayRef.current !== marketDay) {
          marketDayRef.current = marketDay;
          rangedStocks = nextStocks.map((s) => ({ ...s, high: s.price, low: s.price }));
        }

        // 4. Achievements are permanent once earned (persisted set)
        const everUnlocked = prev.unlockedAchievements || [];
        const nowUnlocked = getUnlockedAchievementIds(prev);
        const nextUnlocked =
          nowUnlocked.size === everUnlocked.length ? everUnlocked : Array.from(nowUnlocked);

        // 5. Random News Generation
        let nextNews = [...prev.news];
        if (Math.random() < 0.03) {
          const sampleNews: NewsItem[] = [
            { id: String(Date.now()), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), title: '【爆料】赛博打工人协会推出全新带薪发呆标准', content: '预计全网生产力大幅波动，摸鱼重工受资金热捧。', type: 'bull' },
            { id: String(Date.now()), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), title: '【行情】量子算力主网完成硬分叉升级', content: '交易吞吐量突破百万级，手续费大幅降低。', type: 'neutral' },
            { id: String(Date.now()), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), title: '【预警】深渊地下城发现新型高危 0-day 漏洞', content: '请各位赛博修仙者及时打好防崩溃补丁。', type: 'bear' },
          ];
          const picked = sampleNews[Math.floor(Math.random() * sampleNews.length)];
          nextNews = [picked, ...nextNews.slice(0, 9)];
        }

        return {
          ...prev,
          merit: nextMerit,
          totalMeritGained: nextTotalMerit,
          credits: nextCredits,
          hashrate: nextHashrate,
          lastEstatePayout: nextLastPayout,
          pet: nextPet,
          todos: nextTodos,
          todoDate: nextTodoDate,
          fishing: nextFishing,
          daily: nextDaily,
          stocks: rangedStocks,
          news: nextNews,
          unlockedAchievements: nextUnlocked,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 盲盒扭蛋机: cost, ticket spending, rates, pity and duplicate refunds in ONE
  // atomic updater. The old flow gave nothing at all for a duplicate, so most of
  // the ~900 pulls needed to complete the cabinet were pure loss.
  const rollGacha = useCallback((count: number, ticketCount: number) => {
    const n = Math.max(1, Math.min(10, Math.floor(count) || 1));
    const result: { pulls: GachaPullOutcome[]; spentCredits: number; spentTickets: number }[] = [];

    setState((prev) => {
      const available = prev.inventory
        .filter((i) => i.name === '赛博扭蛋抽奖券')
        .reduce((acc, i) => acc + i.count, 0);
      // A ticket batch must cover the whole pull (a 10-pull needs 10 tickets), matching
      // the original UI rule; otherwise the batch is paid in credits at the advertised price.
      const wantTickets = Math.max(0, Math.floor(ticketCount) || 0);
      const useTickets = wantTickets >= n && available >= n;
      const tickets = useTickets ? n : 0;
      const creditsCost = useTickets ? 0 : getGachaCost(n);
      if (prev.credits < creditsCost) return prev;

      const unlocked = new Set(prev.gachaUnlockedIds || []);
      const newIds = [...(prev.gachaUnlockedIds || [])];
      let sinceSSR = prev.gachaPity?.sinceSSR ?? 0;
      let sinceUR = prev.gachaPity?.sinceUR ?? 0;
      let refundTotal = 0;
      const pulls: GachaPullOutcome[] = [];

      for (let i = 0; i < n; i++) {
        const { rarity, pityHit } = rollGachaRarity(sinceSSR, sinceUR);
        const item = pickGachaItem(rarity);
        const isNew = !unlocked.has(item.id);
        const refund = isNew ? 0 : getGachaDupeRefund(rarity);
        if (isNew) {
          unlocked.add(item.id);
          newIds.push(item.id);
        } else {
          refundTotal += refund;
        }
        const atLeastSSR = rarity === 'SSR' || rarity === 'UR';
        sinceSSR = atLeastSSR ? 0 : sinceSSR + 1;
        sinceUR = rarity === 'UR' ? 0 : sinceUR + 1;
        pulls.push({ item, isNew, refund, pityHit });
      }

      let toSpend = tickets;
      const nextInv = prev.inventory.reduce<GameState['inventory']>((acc, it) => {
        if (it.name === '赛博扭蛋抽奖券' && toSpend > 0) {
          const take = Math.min(it.count, toSpend);
          toSpend -= take;
          if (it.count - take > 0) acc.push({ ...it, count: it.count - take });
          return acc;
        }
        acc.push(it);
        return acc;
      }, []);

      result.push({ pulls, spentCredits: creditsCost, spentTickets: tickets });

      return {
        ...prev,
        credits: prev.credits - creditsCost + refundTotal,
        inventory: nextInv,
        gachaUnlockedIds: newIds,
        gachaPity: { sinceSSR, sinceUR },
      };
    });

    if (result.length === 0) {
      SoundFX.playAlert();
      return null;
    }
    SoundFX.playCash();
    return result[0];
  }, []);

  const claimDailyReportReward = useCallback((): boolean => {
    let claimed = false;
    setState((prev) => {
      const now = Date.now();
      const last = prev.lastDailyReportAt ?? 0;
      // A monotonic 20h floor (instead of the old `toDateString()` comparison) means
      // rolling the system clock forward — or flying east — can no longer re-pay the stipend.
      if (now - last < 20 * 3600 * 1000) return prev;

      const hasWorkSynergy = isGachaSeriesComplete(prev, 'work');
      const stipend = hasWorkSynergy ? 600 : 300;
      const flower: InventoryItem = {
        id: `item-flower-${now}`,
        name: '年度优秀员工小红花',
        icon: '🌸',
        desc: '生成每日摸鱼日报获得！喂食宠物可瞬间回满全部状态与精力',
        rarity: 'epic',
        count: 1,
      };
      const idx = prev.inventory.findIndex((i) => i.name === flower.name);
      const inventory =
        idx >= 0
          ? prev.inventory.map((i, k) => (k === idx ? { ...i, count: i.count + 1 } : i))
          : [...prev.inventory, flower];

      claimed = true;
      return {
        ...prev,
        lastDailyReportDate: todayStr(),
        lastDailyReportAt: now,
        credits: prev.credits + stipend,
        inventory,
      };
    });
    if (claimed) SoundFX.playLevelUp();
    else SoundFX.playAlert();
    return claimed;
  }, []);

  const claimAchievementMilestone = useCallback((id: string) => {
    const milestone = ACHIEVEMENT_MILESTONES.find((m) => m.id === id);
    if (!milestone) return false;

    // Guard, reward and record all live in one updater: the previous version read a
    // one-frame-stale ref for the guard and paid out outside of setState, so two
    // events in the same frame could double-claim m2/m3.
    let claimed = false;
    setState((prev) => {
      if ((prev.claimedMilestones || []).includes(id)) return prev;
      if (getUnlockedAchievementCount(prev) < milestone.requiredCount) return prev;

      let credits = prev.credits;
      let merit = prev.merit;
      let totalMeritGained = prev.totalMeritGained;
      let inventory = prev.inventory;

      if (id === 'm1') {
        const ticket: InventoryItem = {
          id: `item-ticket-${Date.now()}`,
          name: '赛博扭蛋抽奖券',
          icon: '🎫',
          desc: '成就里程碑奖励！可在盲盒扭蛋机中免费抽取 1 次珍稀藏品',
          rarity: 'epic',
          count: 3,
        };
        const idx = inventory.findIndex((i) => i.name === ticket.name);
        inventory =
          idx >= 0
            ? inventory.map((i, k) => (k === idx ? { ...i, count: i.count + 3 } : i))
            : [...inventory, ticket];
      } else if (id === 'm2') {
        credits += 2000;
        merit += 500;
        totalMeritGained += 500;
      } else if (id === 'm3') {
        credits += 5000;
        merit += 2000;
        totalMeritGained += 2000;
      }

      claimed = true;
      return {
        ...prev,
        credits,
        merit,
        totalMeritGained,
        inventory,
        claimedMilestones: [...(prev.claimedMilestones || []), id],
      };
    });

    if (!claimed) return false;
    SoundFX.playLevelUp();
    showAlert(`🏆 成功领取【${milestone.title}】里程碑奖励：${milestone.rewardDesc}！`, '成就嘉奖到账', milestone.icon, 'gold');
    return true;
  }, [showAlert]);

  const toggleDesktopPetRoam = useCallback(() => {
    setState((prev) => ({
      ...prev,
      pet: {
        ...prev.pet,
        roamOnDesktop: prev.pet.roamOnDesktop === false ? true : false,
      },
    }));
  }, []);

  const toggleRadio = useCallback(() => {
    setState((prev) => ({
      ...prev,
      radioEnabled: !prev.radioEnabled,
    }));
  }, []);

  return (
      <GameContext.Provider
        value={{
          state,
          windows,
          activeWindowId,
          openWindow,
          closeWindow,
          minimizeWindow,
          maximizeWindow,
          focusWindow,
          updateWindowPos,
          updateWindowSize,
          clampAllWindows,
          tapWoodenFish,
          buyUpgrade,
          convertMeritToCredits,
          releaseCreature,
          cooldownRemaining,
          startCooldown,
          getDailyCount,
          recordDailyUse,
          addCredits,
          addMerit,
          addHashrate,
          buyEstate,
          addInventoryItem,
          consumeItem,
          spendItem,
          sellItem,
          feedPet,
          petPet,
          addPetExp,
          installPetChip,
          startPetExplore,
          claimPetExplore,
          setWheelLife,
          buyStock,
          sellStock,
          addTodo,
          toggleTodo,
          removeTodo,
          clearDoneTodos,
          setHealthCheckIn,
          setSnakeHighScore,
          recordCatch,
          buyInsiderTip,
          setPrefs,
          rollGacha,
          claimDailyReportReward,
          claimAchievementMilestone,
          toggleDesktopPetRoam,
          toggleRadio,
          dialog,
          showDialog,
          closeDialog,
          showAlert,
          notifications,
          visualEffect,
          notify,
          dismissNotification,
          triggerEffect,
          setTheme,
          setBgMode,
          toggleCrt,
          toggleSound,
          setSoundVolume,
          resetAll,
          loadStateFromBase64,
        }}
      >
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
};
