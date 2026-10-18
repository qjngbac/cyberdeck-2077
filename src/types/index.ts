export type AppId = 
  | 'wooden-fish'
  | 'wheel-life'
  | 'snake-arcade'
  | 'cyber-pet'
  | 'dungeon'
  | 'stock-market'
  | 'synthwave'
  | 'terminal'
  | 'ambience'
  | 'fishing'
  | 'market'
  | 'doudizhu'
  | 'minesweeper'
  | 'forge'
  | 'gacha'
  | 'daily-report'
  | 'trophy-hall'
  | 'system-settings';

export interface WindowState {
  id: AppId;
  title: string;
  icon: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
}

export type ThemeType = 'cyberpunk' | 'matrix' | 'synthwave' | 'gold';
export type BgModeType = 'nebula' | 'wave' | 'rain' | 'minimal' | 'matrix';

/** In-app notification popup (replaces native alert) — transient, never persisted. */
export type NotificationTone = 'info' | 'success' | 'gold' | 'warn' | 'error' | 'purple';

export interface UiNotification {
  id: number;
  title: string;
  body: string;
  icon: string;
  tone: NotificationTone;
}

export interface CyberDialog {
  id: string;
  title: string;
  message: string;
  icon?: string;
  tone?: 'cyan' | 'gold' | 'pink' | 'green' | 'red' | 'purple';
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export interface InventoryItem {
  id: string;
  name: string;
  icon: string;
  desc: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  count: number;
  effect?: string;
}

export interface PetState {
  name: string;
  type: 'dog' | 'cat' | 'dragon';
  hunger: number; // 0 - 100
  happiness: number; // 0 - 100
  energy: number; // 0 - 100
  power: number;
  level: number;
  exp: number;
  maxExp: number;
  stage: 1 | 2 | 3;
  isExploring: boolean;
  exploreDuration: number;
  exploreRemaining: number;
  // Absolute ms deadline of the running expedition — the countdown is derived from
  // wall-clock time so a throttled/hidden tab or a reload cannot stretch or skip it.
  exploreEndAt: number;
  // Reward rolled when the dog leaves (scaled by duration + mood), paid out on claim.
  // Kept in state so a reload cannot re-roll for a better outcome.
  exploreRewardBase: number;
  exploreExpBase: number;
  exploreDropBoost: number;
  exploreLogs: string[];
  roamOnDesktop?: boolean;
}

export interface SoulRing {
  id: string;
  years: number;
  colorName: string;
  colorHex: string;
  skillName: string;
  atkBonus: number;
}

export interface SoulBone {
  slot: string;
  name: string;
  power: number;
}

export interface WheelLifeState {
  awakenedSoul: {
    id: string;
    name: string;
    desc: string;
    icon: string;
    quality: 'SSR' | 'SR' | 'R';
    basePower: number;
  } | null;
  level: number;        // 1 - 100 (魂士 ~ 量子神尊)
  soulPower: number;    // 当前魂力/算力值
  maxSoulPower: number;
  realmName: string;    // 境界称号
  rings: SoulRing[];    // 魂环列表 (最多 9 个)
  bones: SoulBone[];    // 魂骨列表 (六大槽位)
  totalSpins: number;
  logs: string[];
}

export interface StockItem {
  id: string;
  symbol: string;
  name: string;
  price: number;
  history: number[];
  ownedAmount: number;
  avgCost: number;
  changePercent: number;
  high: number;
  low: number;
  position: 'none' | 'long' | 'short';
  leverage: number;
  margin: number;
  // Insider-tip pump: seconds of guaranteed upward drift remaining
  boostTicks: number;
}

export interface NewsItem {
  id: string;
  time: string;
  title: string;
  content: string;
  type: 'bull' | 'bear' | 'neutral' | 'breaking';
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

export interface GameState {
  // Economy
  merit: number;          // 功德
  credits: number;        // 赛博信用点
  hashrate: number;       // 算力 (GH/s)
  meritPerClick: number;
  autoMeritPerSec: number;
  totalMeritGained: number;
  totalClicks: number;
  
  // Upgrades
  upgrades: {
    quantumStriker: number;   // 量子敲击器
    antiMatterRobe: number;   // 反物质袈裟
    nanoScriptures: number;   // 纳米经文
    overclockBeads: number;   // 超频佛珠
    aiBodhisattva: number;    // AI 菩萨算力矩阵
  };

  // Inventory
  inventory: InventoryItem[];

  // Cyber Pet
  pet: PetState;

  // Wheel Life
  wheelLife: WheelLifeState;

  // Stocks
  stocks: StockItem[];
  news: NewsItem[];
  tradeLogs: string[];

  // Real Estate (owned estate ids)
  estates: string[];
  lastEstatePayout: number;

  // Pet tactical chips (installed chip ids)
  petChips: string[];

  // Desktop Todo (today's list — checked items auto-reset each new day)
  todos: TodoItem[];
  todoDate: string;

  // Fishing dock (today's stats — auto-reset each new day)
  fishing: {
    date: string;
    count: number;
    earned: number;
  };

  // Per-day action counters backing every diminishing-return / daily cap
  // (release pond, arena entries, pet training, forge output …). Reset on day rollover.
  daily: {
    date: string;
    counters: Record<string, number>;
  };

  // Persisted cooldown deadlines (timestamp in ms) — survive reloads and new tabs
  cooldowns: Record<string, number>;

  // Achievement ids ever unlocked. Permanent: spending the money that earned
  // an achievement must not silently revoke its global merit bonus.
  unlockedAchievements: string[];

  // Gacha pity: pulls since the last SSR-or-better / UR
  gachaPity: { sinceSSR: number; sinceUR: number };

  // Save schema version, kept for future migrations
  stateVersion?: number;

  // Cross-app user preferences (survive reloads)
  prefs: {
    snakeSkin: 'cyan' | 'gold' | 'green' | 'purple';
    snakeMode: 'classic' | 'speed' | 'maze';
    scripture: string;
    synthGrid: boolean[][];
    synthBpm: number;
    ambienceVolumes: Record<string, number>;
  };

  // Health check-ins (reset daily)
  healthCheckIns: {
    date: string;
    water: boolean;
    eyes: boolean;
    stretch: boolean;
  };

  // Arcade best score
  snakeHighScore: number;

  // Gacha collection unlocked item IDs
  gachaUnlockedIds?: string[];

  // Daily work report last generated date
  lastDailyReportDate?: string;

  // Monotonic ms deadline of the last report payout — the date string alone could
  // be re-claimed by rolling the system clock forward.
  lastDailyReportAt?: number;

  // Achievement milestone claimed IDs
  claimedMilestones?: string[];

  // Cyber Lofi FM Radio state
  radioEnabled?: boolean;

  // Global settings
  soundEnabled: boolean;
  soundVolume: number;
  crtEffect: boolean;
  theme: ThemeType;
  bgMode: BgModeType;
}
