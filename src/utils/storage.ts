import { GameState, StockItem, NewsItem, WheelLifeState } from '../types';

/** Coerce any saved/imported value to a finite number — an Infinity/NaN in the
 *  ledger survives JSON.stringify as `null` and then crashes every consumer. */
const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** Keep an integer within a sane band; used for currencies and pet stats. */
const clampNum = (v: unknown, min: number, max: number, fallback: number): number =>
  Math.min(max, Math.max(min, num(v, fallback)));

// Old saves predate the insider-pump field — normalize whenever stocks enter the app
type StockSeed = Omit<StockItem, 'boostTicks'>;

export const normalizeStocks = (list: Array<Partial<StockSeed>>): StockItem[] =>
  list.map((s) => ({ boostTicks: 0, ...s })) as StockItem[];

const RAW_STOCKS: StockSeed[] = [
  {
    id: 'moyu-tech',
    symbol: 'MOYU',
    name: '摸鱼重工 (Moyu Heavy Ind)',
    price: 42.5,
    history: [38, 40, 39, 41, 40, 42.5],
    ownedAmount: 0,
    avgCost: 0,
    changePercent: 3.65,
    high: 45.0,
    low: 37.2,
    position: 'none',
    leverage: 1,
    margin: 0,
  },
  {
    id: 'doge-2077',
    symbol: 'DOGE77',
    name: '赛博柴犬币 (CyberDoge)',
    price: 0.88,
    history: [0.65, 0.72, 0.90, 0.82, 0.88],
    ownedAmount: 0,
    avgCost: 0,
    changePercent: 7.31,
    high: 1.05,
    low: 0.60,
    position: 'none',
    leverage: 1,
    margin: 0,
  },
  {
    id: 'quantum-ai',
    symbol: 'QAI',
    name: '量子算力基金 (Quantum AI ETF)',
    price: 520.0,
    history: [490, 505, 512, 518, 520],
    ownedAmount: 0,
    avgCost: 0,
    changePercent: 1.96,
    high: 535.0,
    low: 485.0,
    position: 'none',
    leverage: 1,
    margin: 0,
  },
  {
    id: 'cyber-maotai',
    symbol: 'CYBMT',
    name: '赛博酱香算力 (Cyber Maotai)',
    price: 1888.0,
    history: [1820, 1850, 1840, 1870, 1888],
    ownedAmount: 0,
    avgCost: 0,
    changePercent: 0.96,
    high: 1950.0,
    low: 1800.0,
    position: 'none',
    leverage: 1,
    margin: 0,
  },
  {
    id: 'anti-bald',
    symbol: 'HAIR',
    name: '纳米防脱发概念 (Anti-Bald Tech)',
    price: 66.6,
    history: [72, 68, 65, 63, 66.6],
    ownedAmount: 0,
    avgCost: 0,
    changePercent: -3.48,
    high: 75.0,
    low: 60.0,
    position: 'none',
    leverage: 1,
    margin: 0,
  },
  {
    id: 'nvda-77',
    symbol: 'NVDA77',
    name: '英伟达超导芯 (NVIDIA Cyber)',
    price: 1350.0,
    history: [1290, 1310, 1340, 1350],
    ownedAmount: 0,
    avgCost: 0,
    changePercent: 4.65,
    high: 1400.0,
    low: 1250.0,
    position: 'none',
    leverage: 1,
    margin: 0,
  },
  {
    id: 'openai-77',
    symbol: 'OPENAI',
    name: 'OpenAI 矩阵 (OpenAI Matrix)',
    price: 880.0,
    history: [820, 840, 860, 880],
    ownedAmount: 0,
    avgCost: 0,
    changePercent: 5.21,
    high: 900.0,
    low: 800.0,
    position: 'none',
    leverage: 1,
    margin: 0,
  },
  {
    id: 'tsla-cyber',
    symbol: 'TSLA77',
    name: '反重力皮卡 (Anti-Grav Pickup)',
    price: 260.0,
    history: [270, 265, 255, 260],
    ownedAmount: 0,
    avgCost: 0,
    changePercent: -1.88,
    high: 280.0,
    low: 250.0,
    position: 'none',
    leverage: 1,
    margin: 0,
  },
  {
    id: 'deep-mining',
    symbol: 'DEEP',
    name: '深渊黑客矿业 (Deep Hacker Mining)',
    price: 18.8,
    history: [16, 17, 19, 18.8],
    ownedAmount: 0,
    avgCost: 0,
    changePercent: 10.58,
    high: 22.0,
    low: 15.0,
    position: 'none',
    leverage: 1,
    margin: 0,
  },
  {
    id: 'immortal',
    symbol: 'IMMORT',
    name: '基因永生科技 (Immortal BioTech)',
    price: 3200.0,
    history: [3100, 3150, 3180, 3200],
    ownedAmount: 0,
    avgCost: 0,
    changePercent: 2.15,
    high: 3300.0,
    low: 3000.0,
    position: 'none',
    leverage: 1,
    margin: 0,
  },
];

export const INITIAL_STOCKS: StockItem[] = normalizeStocks(RAW_STOCKS);

/** Long-run fair value each symbol reverts to. Without this a zero-drift random walk still
 *  wanders away forever, and any drift at all is an unconditional print. */
export const STOCK_ANCHOR: Record<string, number> = RAW_STOCKS.reduce(
  (acc, s) => ({ ...acc, [s.id]: s.price }),
  {} as Record<string, number>,
);

export const INITIAL_NEWS: NewsItem[] = [
  {
    id: 'news-1',
    time: '23:30',
    title: '【突发】某大厂服务器着火，摸鱼重工股价单日逆势大涨！',
    content: '专家称程序员全体开启带薪休假模式，摸鱼指数创新高。',
    type: 'bull',
  },
  {
    id: 'news-2',
    time: '23:15',
    title: '【快讯】量子网络突发震荡，黑客宣布对本次事件负责',
    content: '各节点算力剧烈波动，赛博柴犬币多空双爆。',
    type: 'breaking',
  },
];

export const INITIAL_WHEEL_LIFE: WheelLifeState = {
  awakenedSoul: null,
  level: 1,
  soulPower: 0,
  maxSoulPower: 100,
  realmName: '未觉醒',
  rings: [],
  bones: [{ slot: '躯干', name: '赛博合金护甲骨', power: 50 }],
  totalSpins: 0,
  logs: ['请先觉醒专属赛博武魂，踏上命运转盘飞升之路！'],
};

export const INITIAL_GAME_STATE: GameState = {
  merit: 0,
  credits: 1000,
  hashrate: 10,
  meritPerClick: 1,
  autoMeritPerSec: 0,
  totalMeritGained: 0,
  totalClicks: 0,
  
  upgrades: {
    quantumStriker: 0,
    antiMatterRobe: 0,
    nanoScriptures: 0,
    overclockBeads: 0,
    aiBodhisattva: 0,
  },

  inventory: [
    {
      id: 'debug-coffee',
      name: '极客高能冰美式',
      icon: '☕',
      desc: '程序员必备饮品，精神状态 +50，代码 Bug 产生率 -20%',
      rarity: 'common',
      count: 3,
    },
    {
      id: 'ram-stick',
      name: 'DDR7 赛博内存条 (128G)',
      icon: '💾',
      desc: '可喂食给机甲宠物，提升 100 点经验与 20 点算力',
      rarity: 'rare',
      count: 1,
    },
  ],

  pet: {
    name: '赛博啸天 · 零号机',
    type: 'dog',
    hunger: 80,
    happiness: 85,
    energy: 90,
    power: 25,
    level: 1,
    exp: 0,
    maxExp: 100,
    stage: 1,
    isExploring: false,
    exploreDuration: 30,
    exploreRemaining: 0,
    exploreEndAt: 0,
    exploreRewardBase: 0,
    exploreExpBase: 0,
    exploreDropBoost: 0,
    exploreLogs: ['机甲修狗正在基地待命，摇着机械尾巴等待指令...'],
    roamOnDesktop: true,
  },

  wheelLife: INITIAL_WHEEL_LIFE,

  stocks: INITIAL_STOCKS,
  news: INITIAL_NEWS,
  tradeLogs: ['赛博交易终端连接成功，实时行情已接入。'],

  estates: [],
  lastEstatePayout: 0,
  petChips: [],

  todos: [
    { id: '1', text: '假装敲键盘写架构方案 (0/1)', done: false },
    { id: '2', text: '去茶水间接第 3 杯冰美式', done: true },
    { id: '3', text: '敲赛博木鱼积攒 1000 功德', done: false },
    { id: '4', text: '转动命运轮盘猎杀万年魂兽', done: false },
  ],
  todoDate: '',

  healthCheckIns: { date: '', water: false, eyes: false, stretch: false },
  snakeHighScore: 0,

  fishing: { date: '', count: 0, earned: 0 },
  lastDailyReportAt: 0,

  daily: { date: '', counters: {} },
  cooldowns: {},
  unlockedAchievements: [],
  gachaPity: { sinceSSR: 0, sinceUR: 0 },
  stateVersion: 2,

  prefs: {
    snakeSkin: 'cyan',
    snakeMode: 'classic',
    scripture: '大悲咒 (8-Bit超导版)',
    synthGrid: [
      [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
      [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
      [true, false, true, false, false, true, false, true, true, false, true, false, false, true, true, false],
      [false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true],
      [true, false, false, true, false, false, true, false, true, false, false, true, false, false, true, false],
    ],
    synthBpm: 120,
    ambienceVolumes: {},
  },

  gachaUnlockedIds: [],
  lastDailyReportDate: '',
  claimedMilestones: [],
  radioEnabled: false,

  soundEnabled: true,
  soundVolume: 0.5,
  crtEffect: false, // Default off to prevent eye strain
  theme: 'cyberpunk',
  bgMode: 'nebula', // Default to soothing deep space nebula
};

const STORAGE_KEY = 'CYBERDECK_OS_2077_SAVE';

/**
 * Daily cycle: the sticky-note todo list and the fishing dock stats are both
 * "today" scoped — whenever the saved date differs from today (new login day or
 * the app left open across midnight), checked items are unchecked again and
 * today's catch counter resets. Items themselves are kept as a template.
 */
/**
 * Daily cycle: the sticky-note todo list, the fishing dock tally and every
 * diminishing-return counter are "today" scoped — whenever the saved date differs
 * from today (new login day or the app left open across midnight) they roll over.
 * Expired cooldowns are dropped so the persisted map cannot grow forever.
 */
export function applyDailyReset(state: GameState): GameState {
  const today = new Date().toDateString();
  const needsReset =
    state.todoDate !== today || state.fishing.date !== today || (state.daily?.date ?? '') !== today;
  if (!needsReset) return state;

  const now = Date.now();
  const liveCooldowns: Record<string, number> = {};
  Object.entries(state.cooldowns ?? {}).forEach(([key, until]) => {
    if (num(until, 0) > now) liveCooldowns[key] = until;
  });

  return {
    ...state,
    todoDate: today,
    todos: (state.todos ?? []).map((t) => ({ ...t, done: false })),
    fishing: { date: today, count: 0, earned: 0 },
    daily: { date: today, counters: {} },
    cooldowns: liveCooldowns,
  };
}

/** A saved ledger that is not a finite number becomes `null` through
 *  JSON.stringify and then crashes every `toLocaleString()` consumer. */
const sanitizeStock = (s: Partial<StockItem>): StockItem => ({
  id: String(s.id ?? ''),
  symbol: String(s.symbol ?? '???'),
  name: String(s.name ?? '未知标的'),
  price: clampNum(s.price, 0.01, Number.MAX_SAFE_INTEGER, 1),
  history: Array.isArray(s.history) ? s.history.map((h) => num(h, 1)) : [],
  ownedAmount: clampNum(s.ownedAmount, 0, Number.MAX_SAFE_INTEGER, 0),
  avgCost: clampNum(s.avgCost, 0, Number.MAX_SAFE_INTEGER, 0),
  changePercent: clampNum(s.changePercent, -100, 1e6, 0),
  high: clampNum(s.high, 0.01, Number.MAX_SAFE_INTEGER, 1),
  low: clampNum(s.low, 0.01, Number.MAX_SAFE_INTEGER, 1),
  position: s.position === 'long' || s.position === 'short' ? s.position : 'none',
  leverage: clampNum(s.leverage, 1, 100, 1),
  margin: clampNum(s.margin, 0, Number.MAX_SAFE_INTEGER, 0),
  boostTicks: clampNum(s.boostTicks, 0, 1000, 0),
});

export function normalizeGameState(parsed: any): GameState {
  if (!parsed || typeof parsed !== 'object') {
    return applyDailyReset(INITIAL_GAME_STATE);
  }

  const rawDailyCounters =
    parsed.daily?.counters && typeof parsed.daily.counters === 'object' ? parsed.daily.counters : {};
  const rawCooldowns =
    parsed.cooldowns && typeof parsed.cooldowns === 'object' ? parsed.cooldowns : {};

  // Migrate the old date-string daily-report claim onto the monotonic deadline.
  // A day already claimed is back-dated by 21h (next claim ≈3h away) instead of
  // stamped now, which would have locked the stipend out for a full 20 hours.
  const today = new Date().toDateString();
  const savedReportDate = typeof parsed.lastDailyReportDate === 'string' ? parsed.lastDailyReportDate : '';
  const migratedReportAt = !savedReportDate
    ? 0
    : savedReportDate === today
      ? Date.now() - 21 * 3600 * 1000
      : Date.parse(savedReportDate) || 0;

  return applyDailyReset({
    ...INITIAL_GAME_STATE,
    ...parsed,
    merit: clampNum(parsed.merit, 0, Number.MAX_SAFE_INTEGER, 0),
    credits: clampNum(parsed.credits, 0, Number.MAX_SAFE_INTEGER, 0),
    hashrate: clampNum(parsed.hashrate, 0, 1_000_000, 0),
    meritPerClick: clampNum(parsed.meritPerClick, 1, Number.MAX_SAFE_INTEGER, 1),
    autoMeritPerSec: clampNum(parsed.autoMeritPerSec, 0, Number.MAX_SAFE_INTEGER, 0),
    totalMeritGained: clampNum(parsed.totalMeritGained, 0, Number.MAX_SAFE_INTEGER, 0),
    totalClicks: clampNum(parsed.totalClicks, 0, Number.MAX_SAFE_INTEGER, 0),
    wheelLife: parsed.wheelLife
      ? {
          ...INITIAL_WHEEL_LIFE,
          ...parsed.wheelLife,
          level: clampNum(parsed.wheelLife.level, 1, 100, 1),
          soulPower: clampNum(parsed.wheelLife.soulPower, 0, Number.MAX_SAFE_INTEGER, 0),
          bones: parsed.wheelLife.bones ?? INITIAL_WHEEL_LIFE.bones,
          rings: Array.isArray(parsed.wheelLife.rings) ? parsed.wheelLife.rings : INITIAL_WHEEL_LIFE.rings,
          maxSoulPower: typeof parsed.wheelLife.maxSoulPower === 'number' && parsed.wheelLife.maxSoulPower > 0
            ? parsed.wheelLife.maxSoulPower
            : INITIAL_WHEEL_LIFE.maxSoulPower,
        }
      : INITIAL_WHEEL_LIFE,
    upgrades: {
      quantumStriker: clampNum(parsed.upgrades?.quantumStriker, 0, 500, 0),
      antiMatterRobe: clampNum(parsed.upgrades?.antiMatterRobe, 0, 500, 0),
      nanoScriptures: clampNum(parsed.upgrades?.nanoScriptures, 0, 500, 0),
      overclockBeads: clampNum(parsed.upgrades?.overclockBeads, 0, 500, 0),
      aiBodhisattva: clampNum(parsed.upgrades?.aiBodhisattva, 0, 500, 0),
    },
    pet: {
      ...INITIAL_GAME_STATE.pet,
      ...(parsed.pet ?? {}),
      hunger: clampNum(parsed.pet?.hunger, 0, 100, 80),
      happiness: clampNum(parsed.pet?.happiness, 0, 100, 85),
      energy: clampNum(parsed.pet?.energy, 0, 100, 90),
      power: clampNum(parsed.pet?.power, 0, Number.MAX_SAFE_INTEGER, 25),
      level: clampNum(parsed.pet?.level, 1, Number.MAX_SAFE_INTEGER, 1),
      exp: clampNum(parsed.pet?.exp, 0, Number.MAX_SAFE_INTEGER, 0),
      maxExp: clampNum(parsed.pet?.maxExp, 1, Number.MAX_SAFE_INTEGER, 100),
      exploreDuration: clampNum(parsed.pet?.exploreDuration, 1, 3600, 30),
      exploreRemaining: clampNum(parsed.pet?.exploreRemaining, 0, 3600, 0),
      exploreEndAt: clampNum(parsed.pet?.exploreEndAt, 0, Number.MAX_SAFE_INTEGER, 0),
      exploreRewardBase: clampNum(parsed.pet?.exploreRewardBase, 0, Number.MAX_SAFE_INTEGER, 0),
      exploreExpBase: clampNum(parsed.pet?.exploreExpBase, 0, Number.MAX_SAFE_INTEGER, 0),
      exploreDropBoost: clampNum(parsed.pet?.exploreDropBoost, 0, 1, 0),
    },
    stocks:
      Array.isArray(parsed.stocks) && parsed.stocks.length
        ? normalizeStocks(parsed.stocks).map(sanitizeStock)
        : INITIAL_GAME_STATE.stocks,
    estates: Array.isArray(parsed.estates) ? parsed.estates : [],
    lastEstatePayout: num(parsed.lastEstatePayout, 0),
    petChips: Array.isArray(parsed.petChips) ? parsed.petChips : [],
    todos: Array.isArray(parsed.todos) ? parsed.todos : INITIAL_GAME_STATE.todos,
    todoDate: parsed.todoDate ?? '',
    fishing: parsed.fishing ? { ...INITIAL_GAME_STATE.fishing, ...parsed.fishing } : INITIAL_GAME_STATE.fishing,
    inventory: Array.isArray(parsed.inventory) ? parsed.inventory : INITIAL_GAME_STATE.inventory,
    prefs: {
      ...INITIAL_GAME_STATE.prefs,
      ...(parsed.prefs ?? {}),
      synthGrid: parsed.prefs?.synthGrid ?? INITIAL_GAME_STATE.prefs.synthGrid,
    },
    // healthCheckIns is an object, not an array — the old Array.isArray() test
    // discarded every saved check-in on each load.
    healthCheckIns:
      parsed.healthCheckIns && typeof parsed.healthCheckIns === 'object'
        ? { ...INITIAL_GAME_STATE.healthCheckIns, ...parsed.healthCheckIns }
        : INITIAL_GAME_STATE.healthCheckIns,
    snakeHighScore: clampNum(parsed.snakeHighScore, 0, Number.MAX_SAFE_INTEGER, 0),
    gachaUnlockedIds: Array.isArray(parsed.gachaUnlockedIds) ? parsed.gachaUnlockedIds : [],
    claimedMilestones: Array.isArray(parsed.claimedMilestones) ? parsed.claimedMilestones : [],
    lastDailyReportDate: savedReportDate,
    lastDailyReportAt: clampNum(parsed.lastDailyReportAt, 0, Number.MAX_SAFE_INTEGER, 0) || migratedReportAt,
    unlockedAchievements: Array.isArray(parsed.unlockedAchievements) ? parsed.unlockedAchievements : [],
    daily: {
      date: parsed.daily?.date ?? '',
      counters: Object.fromEntries(
        Object.entries(rawDailyCounters).map(([k, v]) => [k, clampNum(v, 0, Number.MAX_SAFE_INTEGER, 0)]),
      ),
    },
    cooldowns: Object.fromEntries(
      Object.entries(rawCooldowns)
        .map(([k, v]) => [k, num(v, 0)] as const)
        .filter(([, v]) => v > 0),
    ),
    gachaPity: {
      sinceSSR: clampNum(parsed.gachaPity?.sinceSSR, 0, 1000, 0),
      sinceUR: clampNum(parsed.gachaPity?.sinceUR, 0, 1000, 0),
    },
    radioEnabled: parsed.radioEnabled ?? false,
    crtEffect: parsed.crtEffect ?? false,
  });
}

export function loadSavedState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return applyDailyReset(INITIAL_GAME_STATE);
    const parsed = JSON.parse(raw);
    return normalizeGameState(parsed);
  } catch (e) {
    console.error('Failed to load saved state:', e);
    return applyDailyReset(INITIAL_GAME_STATE);
  }
}

export function saveState(state: GameState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, stateVersion: 2 }));
    return true;
  } catch (e) {
    // Quota exceeded / storage disabled — the caller surfaces this to the player,
    // because silently losing the save is the worst possible outcome.
    console.error('Failed to save state:', e);
    return false;
  }
}

export function exportSaveData(state: GameState): string {
  try {
    const jsonStr = JSON.stringify(state);
    const bytes = new TextEncoder().encode(jsonStr);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin);
  } catch {
    // Fallback
    return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  }
}

export function importSaveData(base64Str: string): GameState | null {
  try {
    let jsonStr = '';
    try {
      const bin = atob(base64Str.trim());
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      jsonStr = new TextDecoder().decode(bytes);
    } catch {
      // Fallback to legacy unescape
      jsonStr = decodeURIComponent(escape(atob(base64Str.trim())));
    }
    const parsed = JSON.parse(jsonStr);
    return normalizeGameState(parsed);
  } catch (e) {
    console.error('Invalid save data string:', e);
    return null;
  }
}
