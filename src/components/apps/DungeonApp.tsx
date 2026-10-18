import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Zap, Heart, Sparkles, Flame } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';
import { formatCredits } from '../../utils/gameLogic';

type ClassType = 'hacker' | 'architect' | 'daoist';
type TileType = 'empty' | 'wall' | 'enemy' | 'chest' | 'stairs' | 'boss' | 'merchant' | 'shrine';
type RunPhase = 'select' | 'explore' | 'battle' | 'merchant' | 'shrine' | 'gameover' | 'victory';

interface Hero {
  name: string;
  heroClass: ClassType;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  atk: number;
  def: number;
  /** 地牢专用金币：撤离/通关时才按 1:1 折算成赛博币，阵亡作废 */
  gold: number;
  floor: number;
  exp: number;
  level: number;
  bossKills: number;
  relics: string[];
}

interface Enemy {
  name: string;
  icon: string;
  hp: number;
  maxHp: number;
  atk: number;
  exp: number;
  gold: number;
  merit: number;
  isBoss?: boolean;
}

interface Tile {
  x: number;
  y: number;
  type: TileType;
  revealed: boolean;
  enemyData?: Enemy;
}

interface Point {
  x: number;
  y: number;
}

const MAP_WIDTH = 12;
const MAP_HEIGHT = 8;
const START: Point = { x: 1, y: 1 };
const EXIT: Point = { x: MAP_WIDTH - 2, y: MAP_HEIGHT - 2 };
/** 第 5 层起不再刷楼梯，唯一的推进方式就是本层魔王 */
const BOSS_FLOOR = 5;
const WALL_CHANCE = 0.12;
const MAX_GEN_ATTEMPTS = 60;
const MAX_TRASH = 8;
const EXP_PER_LEVEL = 120;
const GOLD_SETTLE_RATE = 1;
/** 通关后每再深入一层，Boss 掉落乘 0.6^n，防止无尽层变成印钞机 */
const ENDLESS_DECAY = 0.6;
/** 整局进度存在本地：关窗会直接卸载组件（Window.tsx 在 isOpen=false 时 return null） */
const RUN_KEY = 'CYBERDECK_DUNGEON_RUN';

const CLASS_CONFIG: Record<ClassType, {
  name: string; icon: string; text: string; border: string; hp: number; energy: number; atk: number; def: number;
  skillCostMult: number; energyRegen: number; healPerRound: number; perk: string; blurb: string;
}> = {
  hacker: { name: '赛博黑客', icon: '💻', text: 'text-cyan-300', border: 'hover:border-cyan-400', hp: 100, energy: 50, atk: 25, def: 5, skillCostMult: 0.75, energyRegen: 4, healPerRound: 0, perk: '技能能量消耗 −25%（爆发流）', blurb: '高暴击，技能可造成极高爆发伤害' },
  architect: { name: '架构宗师', icon: '🏛️', text: 'text-blue-300', border: 'hover:border-blue-400', hp: 140, energy: 40, atk: 20, def: 12, skillCostMult: 1, energyRegen: 4, healPerRound: 4, perk: '自愈框架：每回合回复 4 点生命（坦克流）', blurb: '高防御与高血量，擅长持久消耗战' },
  daoist: { name: '赛博道尊', icon: '📿', text: 'text-yellow-300', border: 'hover:border-yellow-400', hp: 90, energy: 80, atk: 30, def: 3, skillCostMult: 1, energyRegen: 8, healPerRound: 0, perk: '云端算力：每回合能量回复翻倍 4→8（续航流）', blurb: '超高法术能量与攻击力，消耗能量输出' },
};

const MONSTERS = [
  { name: '内存泄漏幽灵', icon: '👻', hpMul: 0.85, atkMul: 0.8, exp: 20, gold: 30, merit: 25 },
  { name: '空指针异常毒蛛', icon: '🕷️', hpMul: 0.95, atkMul: 1.1, exp: 25, gold: 40, merit: 30 },
  { name: '404 虚空爬虫', icon: '👾', hpMul: 1.0, atkMul: 1.0, exp: 30, gold: 50, merit: 40 },
  { name: '跨域 CORS 拦截怪', icon: '🕸️', hpMul: 1.1, atkMul: 0.95, exp: 35, gold: 60, merit: 50 },
  { name: '栈溢出石像魔', icon: '🗿', hpMul: 1.35, atkMul: 0.85, exp: 45, gold: 80, merit: 60 },
  { name: '死锁僵尸恶魔', icon: '🧟', hpMul: 1.25, atkMul: 1.15, exp: 50, gold: 90, merit: 70 },
];

interface RelicDef { name: string; icon: string; cost: number; atk: number; def: number; hp: number; energy: number; desc: string }

/** 每件遗物整局限购一次（按名字在 hero.relics 里查重） */
const RELIC_CATALOG: RelicDef[] = [
  { name: '递归暴击匕首', icon: '🗡️', cost: 50, atk: 15, def: 0, hp: 0, energy: 0, desc: '攻击力 +15' },
  { name: '死循环反伤甲', icon: '🛡️', cost: 60, atk: 0, def: 10, hp: 30, energy: 0, desc: '防御 +10 / 生命上限 +30' },
  { name: '超导量子电池', icon: '⚡', cost: 40, atk: 5, def: 0, hp: 10, energy: 20, desc: '攻击 +5 / 能量上限 +20' },
  { name: '内存垃圾回收器', icon: '🧹', cost: 80, atk: 20, def: 5, hp: 20, energy: 0, desc: '全属性大幅增强' },
];

/** 普通 Bug 怪：HP = 22 + 8×层，攻击 = 7 + 2×层（再乘怪物自身系数） */
const trashHp = (floorNum: number) => 22 + floorNum * 8;
const trashAtk = (floorNum: number) => 7 + floorNum * 2;

/** 魔王按玩家「进入本层时」的战力平滑缩放，公式直接印在 HUD 上：
 *  HP   = 6×玩家攻击 + 120 + 25×层（裸装黑客第 5 层 ≈ 395，约 16 下普攻 / 约 10 拍混合输出）
 *  攻击 = 玩家生命上限 ÷ 16 + 防御 ÷ 2 + 层 ÷ 2（每次反击大约削 6% 血，裸装纯普攻刚好在见底前收尾）
 *  因为只锁 6×攻击，继续堆攻击力仍会实打实缩短战斗，商店与练级不会白玩。 */
const bossStats = (hero: Hero, floorNum: number) => ({
  hp: Math.round(hero.atk * 6 + 120 + floorNum * 25),
  atk: Math.round(hero.maxHp / 16 + hero.def / 2 + floorNum / 2),
});

const endlessScale = (floorNum: number) => (floorNum <= BOSS_FLOOR ? 1 : Math.pow(ENDLESS_DECAY, floorNum - BOSS_FLOOR));

const bossIdentity = (floorNum: number) => (floorNum >= 10
  ? { name: '【神级高维架构魔尊】', icon: '👑' }
  : { name: '【终极Boss】周五突发需求大魔王', icon: '👹' });

const makeTrashEnemy = (floorNum: number): Enemy => {
  const picked = MONSTERS[Math.floor(Math.random() * MONSTERS.length)];
  const hp = Math.max(6, Math.round(trashHp(floorNum) * picked.hpMul));
  return {
    name: picked.name,
    icon: picked.icon,
    hp,
    maxHp: hp,
    atk: Math.max(2, Math.round(trashAtk(floorNum) * picked.atkMul)),
    exp: picked.exp,
    gold: picked.gold + floorNum * 5,
    merit: picked.merit,
  };
};

const makeBossEnemy = (hero: Hero, floorNum: number): Enemy => {
  const { name, icon } = bossIdentity(floorNum);
  const { hp, atk } = bossStats(hero, floorNum);
  const decay = endlessScale(floorNum);
  return {
    name,
    icon,
    hp,
    maxHp: hp,
    atk,
    exp: Math.round(300 * decay),
    gold: Math.round((200 + floorNum * 30) * decay),
    merit: Math.round((300 + floorNum * 40) * decay),
    isBoss: true,
  };
};

const DIRS: Point[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
const posKey = (p: Point) => `${p.x},${p.y}`;

/** 深拷贝整张图（tile 与 enemyData 一起复制），任何一次改动都不再共享对象引用 */
const cloneMap = (m: Tile[][]): Tile[][] =>
  m.map((row) => row.map((t) => ({ ...t, enemyData: t.enemyData ? { ...t.enemyData } : undefined })));

const shuffle = <T,>(arr: T[]): T[] => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** 从出生点做 BFS，返回所有可达格 —— 地图合法性的唯一判据 */
const reachableFrom = (m: Tile[][], start: Point): Set<string> => {
  const seen = new Set<string>([posKey(start)]);
  const queue: Point[] = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const d of DIRS) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k) || m[ny][nx].type === 'wall') continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
};

const revealAround = (m: Tile[][], px: number, py: number) => {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = px + dx;
      const ny = py + dy;
      if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) m[ny][nx].revealed = true;
    }
  }
};

/**
 * 生成一层。所有关键格（楼梯/魔王、商店、神龛、宝箱、怪）只放在 BFS 可达的地板上；
 * 出口不可达就整张作废重掷；重掷耗尽后 forceOpen 兜底 —— 直接凿通出生点→出口的 L 形走廊。
 */
function buildFloor(floorNum: number, hero: Hero, forceOpen: boolean): Tile[][] | null {
  const m: Tile[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      const isEdge = x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1;
      const isKey = (x === START.x && y === START.y) || (x === EXIT.x && y === EXIT.y);
      const isWall = isEdge || (!isKey && Math.random() < WALL_CHANCE);
      row.push({ x, y, type: isWall ? 'wall' : 'empty', revealed: isEdge });
    }
    m.push(row);
  }

  if (forceOpen) {
    for (let x = START.x; x <= EXIT.x; x++) m[START.y][x].type = 'empty';
    for (let y = START.y; y <= EXIT.y; y++) m[y][EXIT.x].type = 'empty';
  }

  const reach = reachableFrom(m, START);
  if (!reach.has(posKey(EXIT))) return null;

  if (floorNum >= BOSS_FLOOR) {
    m[EXIT.y][EXIT.x].type = 'boss';
    m[EXIT.y][EXIT.x].enemyData = makeBossEnemy(hero, floorNum);
  } else {
    m[EXIT.y][EXIT.x].type = 'stairs';
  }

  // 只在「可达 + 仍是地板 + 非出生/出口」的格子里放东西；格子不够就少放，绝不无限重试
  const pool = shuffle(
    [...reach]
      .map((k) => {
        const [x, y] = k.split(',').map(Number);
        return { x, y };
      })
      .filter((p) => !(p.x === START.x && p.y === START.y) && !(p.x === EXIT.x && p.y === EXIT.y) && m[p.y][p.x].type === 'empty'),
  );
  const take = (n: number): Point[] => pool.splice(0, n);

  take(Math.min(MAX_TRASH, 3 + floorNum)).forEach((p) => {
    m[p.y][p.x].type = 'enemy';
    m[p.y][p.x].enemyData = makeTrashEnemy(floorNum);
  });
  take(2).forEach((p) => { m[p.y][p.x].type = 'chest'; });
  take(1).forEach((p) => { m[p.y][p.x].type = 'merchant'; });
  take(1).forEach((p) => { m[p.y][p.x].type = 'shrine'; });

  revealAround(m, START.x, START.y);
  return m;
}

const DEFAULT_HERO: Hero = {
  name: CLASS_CONFIG.hacker.name,
  heroClass: 'hacker',
  hp: 100,
  maxHp: 100,
  energy: 50,
  maxEnergy: 50,
  atk: 25,
  def: 5,
  gold: 0,
  floor: 1,
  exp: 0,
  level: 1,
  bossKills: 0,
  relics: [],
};

/** 读档做完整结构校验：楼层尺寸、出口类型、出生点都得站得住，否则丢掉这份快照 */
function readSnapshot(): { hero: Hero; map: Tile[][]; playerPos: Point; phase: RunPhase } | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; savedAt?: number; hero?: Hero; map?: Tile[][]; playerPos?: Point; phase?: RunPhase };
    if (parsed.v !== 1 || !parsed.hero || !Array.isArray(parsed.map)) return null;
    const map = parsed.map;
    const hero = parsed.hero;
    if (map.length !== MAP_HEIGHT || map.some((row) => !Array.isArray(row) || row.length !== MAP_WIDTH)) return null;
    // 陈旧快照兜底：一周前的那局早就该作废了（也顺手避开「系统设置重置后复活」的一部分）
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > 7 * 24 * 3600 * 1000) return null;
    if (map[START.y][START.x].type === 'wall') return null;
    const exitType = map[EXIT.y][EXIT.x].type;
    if (exitType !== 'stairs' && exitType !== 'boss') return null;
    if (typeof hero.hp !== 'number' || typeof hero.floor !== 'number' || typeof hero.atk !== 'number') return null;
    const pos = parsed.playerPos;
    const playerPos = pos && map[pos.y]?.[pos.x] && map[pos.y][pos.x].type !== 'wall' ? pos : START;
    // 战斗/商店/神龛页恢复到探索页：怪物剩余血量写在格子里，重打不会满血复活
    const phase: RunPhase = parsed.phase === 'victory' ? 'victory' : 'explore';
    return { hero, map, playerPos, phase };
  } catch {
    return null;
  }
}

/** exp 终于有了消费者：每 120 点经验升 1 级，+2 攻 / +8 生命上限 / +1 防并回复三成生命 */
function applyExp(hero: Hero, gained: number): { hero: Hero; levels: number } {
  const exp = hero.exp + gained;
  const level = 1 + Math.floor(exp / EXP_PER_LEVEL);
  const levels = level - hero.level;
  if (levels <= 0) return { hero: { ...hero, exp }, levels: 0 };
  const maxHp = hero.maxHp + 8 * levels;
  return {
    hero: {
      ...hero,
      exp,
      level,
      atk: hero.atk + 2 * levels,
      def: hero.def + levels,
      maxHp,
      hp: Math.min(maxHp, hero.hp + Math.round(hero.maxHp * 0.35)),
    },
    levels,
  };
}

export const DungeonApp: React.FC = () => {
  const { state, addCredits, addMerit, addInventoryItem, showAlert, notify, showDialog, activeWindowId } = useGame();

  // 快照只在挂载时读一次（lazy initializer，避免在 effect 里 setState 引起级联渲染）：
  // 关窗即卸载组件，本地快照是唯一活得过卸载的整局进度。
  const [boot] = useState(() => readSnapshot());
  const bootAnnounced = useRef(false);

  const [gameState, setGameState] = useState<RunPhase>(boot?.phase ?? 'select');
  const [hero, setHeroState] = useState<Hero>(boot?.hero ?? DEFAULT_HERO);
  const [playerPos, setPlayerPosState] = useState<Point>(boot?.playerPos ?? START);
  const [map, setMapState] = useState<Tile[][]>(boot?.map ?? []);
  const [currentEnemy, setCurrentEnemy] = useState<Enemy | null>(null);
  const [combatLogs, setCombatLogs] = useState<string[]>([]);
  const [battleBusy, setBattleBusy] = useState(false);
  const [shrineSpent, setShrineSpent] = useState(false);

  // 处理器一律同步读写 ref：同一帧双击 Boss 时，结算用的永远是刚写回的那份血量
  const heroRef = useRef(hero);
  const mapRef = useRef(map);
  const posRef = useRef(playerPos);
  const enemyRef = useRef<Enemy | null>(null);
  // The tile the fought enemy stands on — its HP is written back here, so a monster
  // that fled mid-fight cannot be farmed at full health by walking in and out.
  const battlePosRef = useRef<Point | null>(null);
  const phaseRef = useRef<RunPhase>(gameState);
  const busyRef = useRef(false);
  const stateRef = useRef(state);

  useEffect(() => { stateRef.current = state; }, [state]);

  const setHero = useCallback((h: Hero) => { heroRef.current = h; setHeroState(h); }, []);
  const setMap = useCallback((m: Tile[][]) => { mapRef.current = m; setMapState(m); }, []);
  const setPlayerPos = useCallback((p: Point) => { posRef.current = p; setPlayerPosState(p); }, []);
  const setEnemy = useCallback((e: Enemy | null) => { enemyRef.current = e; setCurrentEnemy(e); }, []);
  const setPhase = useCallback((p: RunPhase) => { phaseRef.current = p; setGameState(p); }, []);

  const clearSnapshot = useCallback(() => {
    try { localStorage.removeItem(RUN_KEY); } catch { /* 存储不可用就算了，不影响本局 */ }
  }, []);

  // ---- 整局进度落盘：关窗即卸载，本地快照是唯一活得过卸载的东西 ----
  useEffect(() => {
    if (gameState === 'select' || gameState === 'gameover') return;
    if (map.length !== MAP_HEIGHT) return;
    try {
      localStorage.setItem(RUN_KEY, JSON.stringify({ v: 1, savedAt: Date.now(), hero, map, playerPos, phase: gameState }));
    } catch { /* 写满只是丢一次快照 */ }
  }, [gameState, hero, map, playerPos]);

  useEffect(() => {
    if (!boot || bootAnnounced.current) return;
    bootAnnounced.current = true;
    notify({
      title: '⚔️ 已恢复未完成的探险',
      body: `第 ${boot.hero.floor} 层 · 生命 ${boot.hero.hp}/${boot.hero.maxHp} · ${boot.hero.gold} 枚未折算地牢金币。关窗不会再吞掉整局进度。`,
      icon: '🗺️',
      tone: 'info',
    });
  }, [boot, notify]);

  const generateFloor = useCallback((floorNum: number, who: Hero) => {
    let built: Tile[][] | null = null;
    for (let attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
      built = buildFloor(floorNum, who, false);
      if (built) break;
    }
    // 兜底：连掷 60 次出口都被封死（20 万次蒙特卡洛里一次都没发生）就把关键走廊改成可通行
    if (!built) built = buildFloor(floorNum, who, true);
    if (!built) return;
    setMap(built);
    setPlayerPos(START);
  }, [setMap, setPlayerPos]);

  const goalText = (floorNum: number) =>
    floorNum >= BOSS_FLOOR
      ? `本层目标：击败右下角的魔王 👹（≥${BOSS_FLOOR} 层没有楼梯，这是唯一的推进方式）`
      : `本层目标：走到右下角的楼梯 🪜 继续下潜`;

  const startGame = (heroClass: ClassType) => {
    const cfg = CLASS_CONFIG[heroClass];
    let stats = { hp: cfg.hp, maxHp: cfg.hp, energy: cfg.energy, maxEnergy: cfg.energy, atk: cfg.atk, def: cfg.def };
    const relics: string[] = [`职业特性：${cfg.perk}`];
    const invNames = new Set(stateRef.current.inventory.map((i) => i.name));

    // 1. Forge Artifacts Synergy
    if (invNames.has('开天诛仙真器')) {
      stats = { ...stats, atk: stats.atk + 100, maxHp: stats.maxHp + 100, hp: stats.hp + 100 };
      relics.push('开天诛仙真器 (+100攻/+100血)');
    } else if (invNames.has('混沌造化青莲')) {
      stats = { ...stats, maxHp: stats.maxHp + 80, hp: stats.hp + 80, def: stats.def + 15 };
      relics.push('混沌造化青莲 (+80血/+15防/每步自愈)');
    } else if (invNames.has('翻天量子印')) {
      stats = { ...stats, maxHp: stats.maxHp + 60, hp: stats.hp + 60, def: stats.def + 10 };
      relics.push('翻天量子印 (+60血/+10防)');
    } else if (invNames.has('紫霄神雷剑')) {
      stats = { ...stats, atk: stats.atk + 35 };
      relics.push('紫霄神雷剑 (+35攻击)');
    } else if (invNames.has('太虚定风珠')) {
      stats = { ...stats, def: stats.def + 8 };
      relics.push('太虚定风珠 (+8防御)');
    }

    // 2. Martial Soul Blessing from WheelLifeApp — scaled by the soul actually
    //    chosen (it used to be a flat +25% whenever a soul existed at all).
    const soul = stateRef.current.wheelLife?.awakenedSoul;
    if (soul) {
      const qualityBonus = soul.quality === 'SSR' ? 1.15 : soul.quality === 'SR' ? 1.05 : 1;
      const soulMult = Math.max(1, (soul.basePower / 100) * qualityBonus);
      stats = { ...stats, atk: Math.round(stats.atk * soulMult), maxHp: Math.round(stats.maxHp * soulMult) };
      stats = { ...stats, hp: stats.maxHp };
      relics.push(`武魂共鸣·${soul.name} (全属性+${Math.round((soulMult - 1) * 100)}%)`);
    }

    // 3. Cyber Pet Assistant from CyberPetApp
    const pet = stateRef.current.pet;
    if (pet.level >= 3) relics.push(`机甲宠物·${pet.name} (战力+${pet.power} 协同助战)`);

    const fresh: Hero = { ...DEFAULT_HERO, ...stats, name: cfg.name, heroClass, relics };
    clearSnapshot();
    setHero(fresh);
    battlePosRef.current = null;
    setEnemy(null);
    setCombatLogs([]);
    generateFloor(1, fresh);
    setPhase('explore');
    SoundFX.playLevelUp();
    notify({
      title: `⚡ ${cfg.name} 潜入第 1 层`,
      body: `职业特性：${cfg.perk}。地牢金币只在撤离/击溃魔王时折算成赛博币，阵亡作废。${goalText(1)}。`,
      icon: '⚔️',
      tone: 'success',
    });
  };

  /** 金币折算：addCredits 的返回值才是真正入账的数额（余额被钳 0 时会小于请求值） */
  const settleGold = (amount: number, reason: string) => {
    if (amount <= 0) {
      notify({ title: `${reason}：没有可折算的金币`, body: '本局一枚地牢金币都没攒下，先去敲宝箱和 Bug 怪吧。', icon: '💰', tone: 'info' });
      return;
    }
    const want = Math.round(amount * GOLD_SETTLE_RATE);
    const applied = addCredits(want);
    notify({
      title: `💰 ${reason}`,
      body: applied < want
        ? `${amount} 枚地牢金币应有 ${formatCredits(want)}，实际入账 ${formatCredits(applied)}（余额钳制吞掉了 ${formatCredits(want - applied)}）。`
        : `${amount} 枚地牢金币已按 1:1 折算，实际入账 ${formatCredits(applied)} 赛博币。`,
      icon: '💰',
      tone: 'gold',
    });
  };

  const endRun = () => {
    clearSnapshot();
    setHero(DEFAULT_HERO);
    setMap([]);
    setPlayerPos(START);
    setEnemy(null);
    battlePosRef.current = null;
    setCombatLogs([]);
    setPhase('select');
  };

  const retreatFromField = () => {
    const h = heroRef.current;
    showDialog({
      id: `dungeon-retreat-${h.floor}`,
      title: '撤离地下城？',
      message: `当前第 ${h.floor} 层，持有 ${h.gold} 枚地牢金币。\n确认后立即按 1:1 折算入账并结束本局（地图、遗物、进度一并清空）。\n阵亡则未折算的金币全部作废 —— 这就是失败惩罚。`,
      icon: '🚪',
      tone: 'green',
      confirmText: '确认撤离结算',
      cancelText: '再摸一层',
      onConfirm: () => {
        settleGold(h.gold, `撤离第 ${h.floor} 层`);
        SoundFX.playCash();
        endRun();
      },
    });
  };

  const movePlayer = useCallback((dx: number, dy: number) => {
    if (phaseRef.current !== 'explore') return;
    const m = mapRef.current;
    if (m.length !== MAP_HEIGHT) return;

    const nx = posRef.current.x + dx;
    const ny = posRef.current.y + dy;
    if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) return;
    const tile = m[ny][nx];
    if (tile.type === 'wall') return;

    SoundFX.playKeyClick();

    if (tile.type === 'enemy' || tile.type === 'boss') {
      const data = tile.enemyData;
      if (!data) return;
      setEnemy({ ...data }); // 拷贝一份：绝不再持有 tile 里的引用
      battlePosRef.current = { x: nx, y: ny };
      setCombatLogs([`遭遇了【${data.name}】！HP ${data.hp}/${data.maxHp}，攻击 ${data.atk}。`]);
      setPhase('battle');
      return;
    }

    const next = cloneMap(m);
    let h = { ...heroRef.current };
    // Artifact passive: Lotus heals 5 HP per step
    if (h.relics.some((r) => r.includes('混沌造化青莲'))) h = { ...h, hp: Math.min(h.maxHp, h.hp + 5) };

    if (tile.type === 'stairs') {
      const nextFloor = h.floor + 1;
      h = { ...h, floor: nextFloor };
      setHero(h);
      generateFloor(nextFloor, h);
      SoundFX.playLevelUp();
      notify({
        title: `🪜 下潜到第 ${nextFloor} 层`,
        body: `${goalText(nextFloor)}。本层小怪 HP ${trashHp(nextFloor)} / 攻击 ${trashAtk(nextFloor)}（±15%~20% 怪物系数）。`,
        icon: '🗺️',
        tone: 'info',
      });
      return;
    }

    if (tile.type === 'chest') {
      const goldReward = 60 + Math.floor(Math.random() * 90);
      const heal = 30;
      next[ny][nx] = { ...next[ny][nx], type: 'empty' };
      h = { ...h, gold: h.gold + goldReward, hp: Math.min(h.maxHp, h.hp + heal) };
      SoundFX.playCash();
      notify({
        title: '🎁 开启宝箱',
        body: `+${goldReward} 枚地牢金币（未折算，撤离/通关时才入账），并恢复 ${heal} 点生命。`,
        icon: '🎁',
        tone: 'gold',
      });
    }

    if (tile.type === 'merchant') {
      revealAround(next, nx, ny);
      setHero(h);
      setMap(next);
      setPlayerPos({ x: nx, y: ny });
      setPhase('merchant');
      return;
    }

    if (tile.type === 'shrine') {
      // 踩上去就当场塌成普通地板：进入即消耗，堵死「进格→礼拜→离开→再进」的无限刷
      next[ny][nx] = { ...next[ny][nx], type: 'empty' };
      revealAround(next, nx, ny);
      setHero(h);
      setMap(next);
      setPlayerPos({ x: nx, y: ny });
      setShrineSpent(false);
      setPhase('shrine');
      return;
    }

    revealAround(next, nx, ny);
    setHero(h);
    setMap(next);
    setPlayerPos({ x: nx, y: ny });
  }, [generateFloor, notify, setEnemy, setHero, setMap, setPhase, setPlayerPos]);

  const buyRelic = (relic: RelicDef) => {
    const h = heroRef.current;
    if (h.relics.includes(relic.name)) {
      SoundFX.playAlert();
      notify({ title: '已经买过了', body: `【${relic.name}】整局限购一次，重复购买不叠加。`, icon: '🛒', tone: 'warn' });
      return;
    }
    if (h.gold < relic.cost) {
      SoundFX.playAlert();
      notify({ title: '地牢金币不足', body: `【${relic.name}】要 ${relic.cost} 枚地牢金币，你只有 ${h.gold} 枚。去敲宝箱、打 Bug 怪，但记住金币留在口袋里不算资产。`, icon: '💸', tone: 'error' });
      return;
    }
    SoundFX.playCash();
    const next: Hero = {
      ...h,
      gold: h.gold - relic.cost,
      atk: h.atk + relic.atk,
      def: h.def + relic.def,
      maxHp: h.maxHp + relic.hp,
      hp: h.hp + relic.hp,
      maxEnergy: h.maxEnergy + relic.energy,
      energy: h.energy + relic.energy,
      relics: [...h.relics, relic.name],
    };
    setHero(next);
    notify({ title: `🎉 已购入【${relic.name}】`, body: `${relic.desc}。每件遗物整局限一次；地牢金币只有撤离/通关才折算。`, icon: '🛒', tone: 'gold' });
  };

  const shrineSacrifice = (type: 'blood' | 'pray') => {
    if (shrineSpent) return;
    const h = heroRef.current;
    if (type === 'blood' && h.hp <= 25) {
      SoundFX.playAlert();
      notify({ title: '生命值太低', body: `献祭需要保留 25 点以上生命，当前只有 ${h.hp} 点。换「虔诚礼拜」或直接离开。`, icon: '⚠️', tone: 'error' });
      return;
    }
    // 一次应答 = 神龛作废，先立标志位再结算，双击也抢不出第二次
    setShrineSpent(true);
    if (type === 'blood') {
      SoundFX.playSlash();
      setHero({ ...h, hp: h.hp - 20, atk: h.atk + 15, relics: [...h.relics, '血之印记 (+15攻击)'] });
      notify({ title: '⛩️ 鲜血献祭', body: '消耗 20 点生命，换来 +15 点永久攻击力。神龛已坍塌 —— 一龛只应答一次。', icon: '🩸', tone: 'purple' });
    } else {
      SoundFX.playLevelUp();
      addMerit(150);
      setHero({ ...h, hp: h.maxHp });
      notify({ title: '⛩️ 虔诚礼拜', body: '生命完全恢复，功德 +150。神龛已坍塌 —— 一龛只应答一次。', icon: '✨', tone: 'success' });
    }
  };

  const leaveShrine = () => {
    setShrineSpent(false);
    setPhase('explore');
    SoundFX.playKeyClick();
  };

  const energyRegen = (h: Hero) => CLASS_CONFIG[h.heroClass].energyRegen;
  const skillCost = (h: Hero, base: number) => Math.round(base * CLASS_CONFIG[h.heroClass].skillCostMult);

  const endBattle = (enemy: Enemy, pos: Point, h: Hero, energyAfter: number, logs: string[]) => {
    SoundFX.playLevelUp();
    const firstBossKill = !!enemy.isBoss && h.bossKills === 0;
    const meritGain = firstBossKill ? 1000 : enemy.merit;
    logs.push(`🎉 消灭【${enemy.name}】！地牢金币 +${enemy.gold}（未折算），经验 +${enemy.exp}，功德 +${meritGain}`);
    addMerit(meritGain);

    const next = cloneMap(mapRef.current);
    next[pos.y][pos.x] = { ...next[pos.y][pos.x], type: 'empty', enemyData: undefined };
    revealAround(next, pos.x, pos.y);
    setMap(next);
    setPlayerPos(pos); // 踏入刚刚清空的格子
    battlePosRef.current = null;
    setEnemy(null);

    const cfg = CLASS_CONFIG[h.heroClass];
    const withLoot: Hero = {
      ...h,
      gold: h.gold + enemy.gold,
      energy: energyAfter,
      hp: Math.min(h.maxHp, h.hp + cfg.healPerRound),
    };
    const leveled = applyExp(withLoot, enemy.exp);
    if (leveled.levels > 0) {
      notify({
        title: `🔺 升到 Lv.${leveled.hero.level}`,
        body: `累计经验 ${leveled.hero.exp}：攻击 +${2 * leveled.levels} / 生命上限 +${8 * leveled.levels} / 防御 +${leveled.levels}，并回复了部分生命。`,
        icon: '📈',
        tone: 'success',
      });
    }

    if (!enemy.isBoss) {
      setHero(leveled.hero);
      setPhase('explore');
      setCombatLogs((prev) => [...logs, ...prev].slice(0, 6));
      return;
    }

    const afterBoss: Hero = { ...leveled.hero, bossKills: leveled.hero.bossKills + 1 };
    if (firstBossKill) {
      // Boss Drops: 2 Gacha tickets and 1 0-Day Exploit —— 只发一次，无尽层不再重复掉落
      addInventoryItem({
        id: `item-ticket-${Date.now()}-1`,
        name: '赛博扭蛋抽奖券',
        icon: '🎫',
        desc: '消灭深渊地牢魔王斩获的至高扭蛋券！可在盲盒扭蛋机中免费抽取 1 次珍稀藏品',
        rarity: 'epic',
        count: 2,
      });
      addInventoryItem({
        id: `item-0day-${Date.now()}`,
        name: '0-Day 漏洞特征码',
        icon: '👾',
        desc: '消灭地牢深渊魔王核心截获的0-Day漏洞！在黑客终端中渗透赏金暴击2.5倍！',
        rarity: 'legendary',
        count: 1,
      });
    }
    // 通关即结算：hero.gold 一次性折算成赛博币并清零，之后攒下的才是新账
    const payable = afterBoss.gold;
    setHero({ ...afterBoss, gold: 0 });
    settleGold(payable, `击溃第 ${afterBoss.floor} 层魔王，金币折算`);
    setPhase('victory');
    setCombatLogs((prev) => [...logs, ...prev].slice(0, 6));
    showAlert(
      firstBossKill
        ? '🎉 征服深渊地牢！斩杀终极需求魔王，爆出【赛博扭蛋抽奖券×2】与【0-Day 漏洞特征码】已收入背包，本层地牢金币已即时折算入账！'
        : `🏆 第 ${afterBoss.floor} 层魔王授首。无尽深渊的掉落已衰减为 ${Math.round(endlessScale(afterBoss.floor) * 100)}%，扭蛋券与 0-Day 只在首杀发放；金币已折算入账。`,
      '地牢大捷',
      '🏆',
      'gold',
    );
  };

  const diveDeeper = () => {
    const nextFloor = heroRef.current.floor + 1;
    const next = { ...heroRef.current, floor: nextFloor };
    setHero(next);
    battlePosRef.current = null;
    setEnemy(null);
    setCombatLogs([]);
    generateFloor(nextFloor, next);
    setPhase('explore');
    SoundFX.playLevelUp();
    notify({
      title: `🪜 无尽下潜：第 ${nextFloor} 层`,
      body: `Boss 掉落折算 ${Math.round(endlessScale(nextFloor) * 100)}%（0.6 的幂），首杀大奖不再重复。${goalText(nextFloor)}。`,
      icon: '⚡',
      tone: 'purple',
    });
  };

  const playerAttack = (skillType: 'normal' | 'skill1' | 'skill2') => {
    if (phaseRef.current !== 'battle' || busyRef.current) return;
    const enemy = enemyRef.current;
    const pos = battlePosRef.current;
    const h = heroRef.current;
    if (!enemy || !pos) return;

    let cost = 0;
    let mult = 1;
    let skillName = '普通代码重构';
    if (skillType === 'skill1') {
      cost = skillCost(h, 15);
      mult = 1.8;
      skillName = h.heroClass === 'hacker' ? '【注入死循环】' : h.heroClass === 'architect' ? '【微服务隔离打击】' : '【量子辟邪咒】';
    } else if (skillType === 'skill2') {
      cost = skillCost(h, 25);
      mult = 2.6;
      skillName = h.heroClass === 'hacker' ? '【拔掉网线】' : h.heroClass === 'architect' ? '【容器化重构爆破】' : '【万佛朝宗云算力】';
    }
    if (h.energy < cost) {
      SoundFX.playAlert();
      notify({ title: '⚡ 能量不足', body: `${skillName} 需要 ${cost} 点能量（当前 ${h.energy}）。每回合只固定回复 ${energyRegen(h)} 点，普攻不回能 —— 先用普通打击过渡。`, icon: '⚡', tone: 'warn' });
      return;
    }

    busyRef.current = true;
    setBattleBusy(true);
    SoundFX.playSlash();

    let dmg = Math.floor(h.atk * mult);
    const pet = stateRef.current.pet;
    let petDmg = 0;
    if (pet.level >= 3) {
      petDmg = Math.round(pet.power * 0.9);
      dmg += petDmg;
    }

    const enemyHp = Math.max(0, enemy.hp - dmg);
    const logs = [`玩家释放 ${skillName}，对【${enemy.name}】造成了 ${dmg - petDmg} 点伤害！`];
    if (petDmg > 0) logs.push(`🐕【${pet.name}】协同出击！发射等离子光束追加造成 ${petDmg} 点伤害！`);
    const cfg = CLASS_CONFIG[h.heroClass];
    // 能量是每回合固定工资，不是普攻印钞机
    const energyAfter = Math.min(h.maxEnergy, h.energy - cost + cfg.energyRegen);

    if (enemyHp <= 0) {
      endBattle(enemy, pos, h, energyAfter, logs);
      window.setTimeout(() => { busyRef.current = false; setBattleBusy(false); }, 220);
      return;
    }

    const taken = Math.max(1, enemy.atk - h.def);
    logs.push(`【${enemy.name}】反击！造成了 ${taken} 点伤害${cfg.healPerRound > 0 ? `（自愈框架回复 ${cfg.healPerRound} 点）` : ''}！`);
    const afterRound: Hero = { ...h, hp: Math.max(0, h.hp - taken + cfg.healPerRound), energy: energyAfter };
    setHero(afterRound);

    // 敌人剩余血量写回地图格子：tile.enemyData 才是权威，跑开再回来不会满血复活
    const next = cloneMap(mapRef.current);
    next[pos.y][pos.x] = { ...next[pos.y][pos.x], enemyData: { ...enemy, hp: enemyHp } };
    setMap(next);
    setEnemy({ ...enemy, hp: enemyHp });
    setCombatLogs((prev) => [...logs, ...prev].slice(0, 6));

    if (afterRound.hp <= 0) {
      SoundFX.playAlert();
      const forfeited = afterRound.gold;
      setHero({ ...afterRound, gold: 0 });
      clearSnapshot();
      setEnemy(null);
      battlePosRef.current = null;
      setPhase('gameover');
      notify({
        title: '💀 数据核心熔毁',
        body: `未折算的 ${forfeited} 枚地牢金币随尸体一起格式化 —— 只有撤离/通关折算过的金币才算你的。`,
        icon: '☠️',
        tone: 'error',
      });
    }
    window.setTimeout(() => { busyRef.current = false; setBattleBusy(false); }, 220);
  };

  // Keyboard navigation (only while this window is the active one)
  const isMainWindow = activeWindowId === 'dungeon';
  useEffect(() => {
    if (!isMainWindow) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (phaseRef.current !== 'explore' || e.repeat) return; // 长按连发曾把日志与音效一起刷屏
      if (e.ctrlKey || e.metaKey || e.altKey) return; // 浏览器快捷键（Ctrl+D 等）优先
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      let moved = true;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') movePlayer(0, -1);
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') movePlayer(0, 1);
      else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') movePlayer(-1, 0);
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') movePlayer(1, 0);
      else moved = false;
      // 方向键默认会滚动窗口内容，游戏期间必须吃掉默认行为
      if (moved && e.key.startsWith('Arrow')) e.preventDefault();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMainWindow, movePlayer]);

  const bossPreview = hero.floor >= BOSS_FLOOR ? bossStats(hero, hero.floor) : null;
  const perHit = currentEnemy ? Math.max(1, currentEnemy.atk - hero.def) : 0;

  return (
    <div className="flex flex-col h-full font-mono text-xs select-none">
      {/* Select Screen */}
      {gameState === 'select' && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center space-y-4 overflow-y-auto">
          <div>
            <div className="text-xl font-black text-cyan-400 text-glow-cyan">
              ⚡ 霓虹深渊 · 代码肉鸽探险 ⚡
            </div>
            <div className="text-slate-400 text-xs mt-1">
              选择你的赛博职业，潜入地下城消灭 Bug 与终极需求魔王！
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 w-full max-w-lg mt-2">
            {(['hacker', 'architect', 'daoist'] as const).map((c) => {
              const cfg = CLASS_CONFIG[c];
              return (
                <button
                  key={c}
                  onClick={() => startGame(c)}
                  className={`p-3 rounded-xl bg-slate-900/80 border border-slate-700 ${cfg.border} transition-all text-left group`}
                >
                  <div className="text-3xl mb-1 group-hover:scale-110 transition-transform">{cfg.icon}</div>
                  <div className={`font-bold ${cfg.text}`}>{cfg.name}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{cfg.blurb}</div>
                  <div className="text-[9px] text-emerald-300 mt-1">特性：{cfg.perk}</div>
                  <div className={`text-[9px] mt-2 ${cfg.text}`}>生命 {cfg.hp} | 攻 {cfg.atk} | 防 {cfg.def} | 能量 {cfg.energy}</div>
                </button>
              );
            })}
          </div>

          <div className="max-w-lg text-left text-[10px] leading-relaxed text-slate-400 bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <div className="text-cyan-300 font-bold">📜 本局规则（数值全部公示，无静默改动）</div>
            <div>· 地图：每层 12% 随机墙，但生成时用 BFS 校验，出口 / 商店 / 神龛 / 宝箱 / 魔王一定走得通。</div>
            <div>· 战争迷雾：只点亮脚下 3×3 的方形格子，走过的地方永久显示（渲染是 CSS 网格，不是 Canvas）。</div>
            <div>· 金币：地牢专用货币，只有「撤离」或「击溃魔王」时按 1:1 折算成赛博币；阵亡未折算部分作废。</div>
            <div>· 能量：每回合固定回复 4 点（道尊 8 点），普攻不回能；黑客技能消耗 −25%。</div>
            <div>· 限购：每件遗物整局只能买一次；神龛一龛只应答一次，踩上即坍塌。</div>
            <div>· 缩放：小怪 HP = 22+8×层 / 攻 = 7+2×层；魔王 HP = 6×攻击+120+25×层 / 攻 = 生命÷16+防御÷2+层÷2。</div>
            <div>· 成长：击杀积累经验，每 {EXP_PER_LEVEL} 点升 1 级（+2 攻 / +8 血上限 / +1 防并回血）。</div>
            <div>· 进度：整局快照存本地，关窗不丢，重开自动恢复。</div>
          </div>
        </div>
      )}

      {/* Explore Screen */}
      {gameState === 'explore' && (
        <div className="flex-1 flex flex-col justify-between min-h-0">
          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800 mb-2 flex-wrap gap-1">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={retreatFromField}
                title="放弃本局并撤离：地牢金币按 1:1 折算入账"
                className="px-2 py-1 rounded bg-slate-800 hover:bg-red-950/70 border border-slate-700 hover:border-red-500/60 text-[10px] text-slate-300 hover:text-red-300 font-bold transition-colors"
              >
                🚪 撤离折算
              </button>
              <span className="font-bold text-cyan-300">{hero.name} Lv.{hero.level}（第 {hero.floor} 层）</span>
              <span className="text-red-400 font-bold flex items-center gap-1"><Heart size={12} /> {hero.hp}/{hero.maxHp}</span>
              <span className="text-blue-400 font-bold flex items-center gap-1"><Zap size={12} /> {hero.energy}/{hero.maxEnergy}</span>
              <span className="text-yellow-400 font-bold">💰 地牢金币: {hero.gold}（未折算）</span>
              <span className="text-pink-400 font-bold">⚔️ 攻击: {hero.atk}</span>
              <span className="text-slate-300 font-bold">🛡️ 防御: {hero.def}</span>
              <span className="text-slate-400">📈 经验: {hero.exp}</span>
            </div>
            <div className="text-[10px] text-slate-400">WASD / 方向键移动（长按不连走）</div>
          </div>

          <div className="px-2 py-1 mb-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/25 text-[10px] text-cyan-200 flex flex-wrap gap-x-4 gap-y-0.5">
            <span>🎯 {goalText(hero.floor)}</span>
            {bossPreview && (
              <span className="text-purple-300 font-bold">
                👹 魔王 HP {bossPreview.hp} / 攻 {bossPreview.atk}（= 6×{hero.atk}+120+25×{hero.floor}；{hero.maxHp}÷16+{hero.def}÷2+{hero.floor}÷2）
              </span>
            )}
            <span className="text-slate-400">🟢 小怪 HP {trashHp(hero.floor)} / 攻 {trashAtk(hero.floor)}</span>
            <span className="text-slate-400">⚡ 每回合能量 +{energyRegen(hero)}，普攻不回能</span>
            <span className="text-slate-500">🌫️ 迷雾 = 脚下 3×3 方形，永久点亮</span>
          </div>

          {hero.relics.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 mb-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 overflow-x-auto text-[10px]">
              <span className="text-yellow-400 font-bold shrink-0">✨ 加成羁绊:</span>
              {hero.relics.map((r, idx) => (
                <span key={idx} className="px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 shrink-0 font-medium">
                  {r}
                </span>
              ))}
            </div>
          )}

          {/* Dungeon Grid */}
          <div className="flex-1 min-h-0 flex items-center justify-center p-2 bg-slate-950/90 rounded-xl border border-cyan-500/20">
            <div
              className="grid gap-1 bg-slate-900/60 p-2 rounded-lg border border-slate-800"
              style={{ gridTemplateColumns: `repeat(${MAP_WIDTH}, minmax(0, 1fr))` }}
            >
              {map.map((row, y) =>
                row.map((tile, x) => {
                  const isPlayer = playerPos.x === x && playerPos.y === y;
                  return (
                    <div
                      key={`${x}-${y}`}
                      className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded text-sm sm:text-base font-bold transition-all ${
                        !tile.revealed
                          ? 'bg-slate-950 border border-slate-900 text-transparent'
                          : tile.type === 'wall'
                          ? 'bg-slate-800/80 border border-slate-700 text-slate-600'
                          : isPlayer
                          ? 'bg-cyan-500 text-slate-950 shadow-neon-cyan scale-105 z-10'
                          : tile.type === 'enemy'
                          ? 'bg-red-950/60 border border-red-500/40 animate-pulse'
                          : tile.type === 'boss'
                          ? 'bg-purple-950/80 border border-purple-500 shadow-neon-pink animate-bounce'
                          : tile.type === 'merchant'
                          ? 'bg-yellow-950/80 border border-yellow-400 text-yellow-300 animate-pulse'
                          : tile.type === 'shrine'
                          ? 'bg-emerald-950/80 border border-emerald-400 text-emerald-300'
                          : tile.type === 'chest'
                          ? 'bg-amber-950/60 border border-amber-500/40'
                          : tile.type === 'stairs'
                          ? 'bg-green-950/60 border border-green-500/40 text-green-300'
                          : 'bg-slate-900/40 border border-slate-800/50'
                      }`}
                    >
                      {isPlayer
                        ? '🤖'
                        : !tile.revealed
                        ? '·'
                        : tile.type === 'wall'
                        ? '🧱'
                        : tile.type === 'enemy'
                        ? tile.enemyData?.icon || '👾'
                        : tile.type === 'boss'
                        ? tile.enemyData?.icon || '👹'
                        : tile.type === 'merchant'
                        ? '🛒'
                        : tile.type === 'shrine'
                        ? '⛩️'
                        : tile.type === 'chest'
                        ? '🎁'
                        : tile.type === 'stairs'
                        ? '🪜'
                        : ''}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Directional Controls */}
          <div className="flex justify-center gap-2 mt-1.5">
            <button onClick={() => movePlayer(0, -1)} className="px-4 py-1.5 rounded bg-slate-800 hover:bg-cyan-900 text-cyan-300 font-bold border border-slate-700">▲ 上</button>
            <button onClick={() => movePlayer(-1, 0)} className="px-4 py-1.5 rounded bg-slate-800 hover:bg-cyan-900 text-cyan-300 font-bold border border-slate-700">◀ 左</button>
            <button onClick={() => movePlayer(0, 1)} className="px-4 py-1.5 rounded bg-slate-800 hover:bg-cyan-900 text-cyan-300 font-bold border border-slate-700">▼ 下</button>
            <button onClick={() => movePlayer(1, 0)} className="px-4 py-1.5 rounded bg-slate-800 hover:bg-cyan-900 text-cyan-300 font-bold border border-slate-700">▶ 右</button>
          </div>
        </div>
      )}

      {/* Merchant Screen */}
      {gameState === 'merchant' && (
        <div className="flex-1 flex flex-col justify-between p-3 bg-slate-950 rounded-xl border border-yellow-500/40 overflow-y-auto">
          <div className="text-center">
            <div className="text-4xl mb-1">🛒</div>
            <div className="font-bold text-sm text-yellow-300">地牢流浪商人</div>
            <div className="text-slate-400 text-[10px] mt-0.5">持有 {hero.gold} 枚地牢金币（未折算）· 每件遗物整局限购一次</div>
          </div>

          <div className="grid grid-cols-2 gap-2 my-2">
            {RELIC_CATALOG.map((relic) => {
              const owned = hero.relics.includes(relic.name);
              return (
                <button
                  key={relic.name}
                  onClick={() => buyRelic(relic)}
                  disabled={owned}
                  className={`p-2.5 rounded-lg text-left border transition-colors ${
                    owned ? 'bg-slate-900/40 border-slate-800 cursor-not-allowed' : 'bg-slate-900 border-slate-700 hover:border-yellow-400'
                  }`}
                >
                  <div className="font-bold text-yellow-300">{relic.icon} {relic.name} (${relic.cost})</div>
                  <div className="text-[9px] text-slate-400">{relic.desc}</div>
                  <div className="text-[9px] mt-1 font-bold text-slate-400">
                    {owned ? '✅ 已拥有（限购一次）' : hero.gold >= relic.cost ? '💰 买得起' : '💸 金币不够'}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setPhase('explore')}
            className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
          >
            离开商店继续探险（商店可以反复回来，但商品不能重复购买）
          </button>
        </div>
      )}

      {/* Shrine Screen */}
      {gameState === 'shrine' && (
        <div className="flex-1 flex flex-col justify-between p-3 bg-slate-950 rounded-xl border border-emerald-500/40">
          <div className="text-center">
            <div className="text-4xl mb-1">⛩️</div>
            <div className="font-bold text-sm text-emerald-300">赛博神龛祈福</div>
            <div className="text-slate-400 text-[10px] mt-0.5">你已经踩上神龛 —— 它只应答一次，选完（或直接离开）就坍塌</div>
          </div>

          <div className="grid grid-cols-2 gap-3 my-3">
            <button
              onClick={() => shrineSacrifice('blood')}
              disabled={shrineSpent}
              className="p-3 rounded-xl bg-red-950/60 hover:bg-red-900/80 border border-red-500/50 text-left disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="font-bold text-red-300 flex items-center gap-1"><Flame size={14} /> 鲜血献祭</div>
              <div className="text-[10px] text-slate-300 mt-1">消耗 20 点生命值，永久获得 +15 点攻击力！</div>
            </button>
            <button
              onClick={() => shrineSacrifice('pray')}
              disabled={shrineSpent}
              className="p-3 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/50 text-left disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="font-bold text-emerald-300 flex items-center gap-1"><Sparkles size={14} /> 虔诚礼拜</div>
              <div className="text-[10px] text-slate-300 mt-1">完全恢复生命值，并获得 150 点功德！</div>
            </button>
          </div>

          <div className="text-[10px] text-slate-500 text-center mb-1">
            {shrineSpent ? '🕯️ 神龛已完成应答，坍塌为普通地板。' : '神龛每层只有一座，用完不刷新 —— 反复踩格子刷功德的路已经封死。'}
          </div>

          <button
            onClick={leaveShrine}
            className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
          >
            {shrineSpent ? '神龛已坍塌，继续探险' : '直接离开神龛（视为放弃应答）'}
          </button>
        </div>
      )}

      {/* Battle Screen */}
      {gameState === 'battle' && currentEnemy && (
        <div className="flex-1 flex flex-col justify-between p-3 bg-slate-950/90 rounded-xl border border-red-500/30">
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-center">
            <div className="text-4xl mb-1 animate-bounce">{currentEnemy.icon}</div>
            <div className="font-bold text-sm text-red-300">{currentEnemy.name}</div>
            <div className="w-full max-w-xs mx-auto h-2.5 bg-slate-800 rounded-full overflow-hidden mt-1.5 border border-red-500/30">
              <div className="h-full bg-red-500 transition-all" style={{ width: `${(currentEnemy.hp / currentEnemy.maxHp) * 100}%` }} />
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              HP: {currentEnemy.hp} / {currentEnemy.maxHp} | 攻击: {currentEnemy.atk} | 单击削你 {perHit} 血（{Math.ceil(hero.hp / Math.max(1, perHit))} 下见底）
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">剩余血量已写回地图格子，绕开再回来打不会满血复活。</div>
          </div>

          <div className="h-24 overflow-y-auto bg-slate-900/80 rounded-lg p-2 border border-slate-800 space-y-1 text-[11px] text-slate-300">
            {combatLogs.map((log, idx) => (<div key={idx}>{log}</div>))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => playerAttack('normal')} disabled={battleBusy} className="p-2.5 rounded-lg bg-slate-800 hover:bg-cyan-900/80 border border-slate-700 hover:border-cyan-400 text-left disabled:opacity-40">
              <div className="font-bold text-cyan-300">普通打击</div>
              <div className="text-[9px] text-slate-400">消耗 0 能量 · 伤害 {hero.atk}（不回能）</div>
            </button>
            <button onClick={() => playerAttack('skill1')} disabled={battleBusy || hero.energy < skillCost(hero, 15)} className="p-2.5 rounded-lg bg-slate-800 hover:bg-purple-900/80 border border-slate-700 hover:border-purple-400 text-left disabled:opacity-40">
              <div className="font-bold text-purple-300">强力注入</div>
              <div className="text-[9px] text-slate-400">消耗 {skillCost(hero, 15)}（1.8x = {Math.floor(hero.atk * 1.8)}）</div>
            </button>
            <button onClick={() => playerAttack('skill2')} disabled={battleBusy || hero.energy < skillCost(hero, 25)} className="p-2.5 rounded-lg bg-slate-800 hover:bg-yellow-900/80 border border-slate-700 hover:border-yellow-400 text-left disabled:opacity-40">
              <div className="font-bold text-yellow-300">拔网线终结</div>
              <div className="text-[9px] text-slate-400">消耗 {skillCost(hero, 25)}（2.6x = {Math.floor(hero.atk * 2.6)}）</div>
            </button>
          </div>
          <div className="text-[9px] text-slate-500 mt-1 text-center">
            每回合结束固定回复 {energyRegen(hero)} 点能量{CLASS_CONFIG[hero.heroClass].healPerRound > 0 ? ` 与 ${CLASS_CONFIG[hero.heroClass].healPerRound} 点生命` : ''}，攻击本身不产资源。
          </div>
        </div>
      )}

      {/* Game Over / Victory */}
      {(gameState === 'gameover' || gameState === 'victory') && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center space-y-3">
          <div className="text-5xl">{gameState === 'victory' ? '🏆' : '💀'}</div>
          <div className={`text-xl font-black ${gameState === 'victory' ? 'text-green-400' : 'text-red-400'}`}>
            {gameState === 'victory' ? `🎉 击溃了第 ${hero.floor} 层魔主！深渊仍在召唤……` : '💀 代码崩溃，你倒在了地下城深处！'}
          </div>
          <div className="text-slate-400 text-xs">
            {gameState === 'victory'
              ? `抵达第 ${hero.floor} 层 · Lv.${hero.level} · 战利品金币已在通关瞬间折算入账（当前未折算余额 ${hero.gold} 枚）`
              : `抵达第 ${hero.floor} 层 · Lv.${hero.level} · 未折算的地牢金币已随本局作废（这就是失败的代价）`}
          </div>
          {gameState === 'victory' && (
            <div className="text-[10px] text-purple-300 max-w-md">
              继续下潜属于无尽模式：第 {hero.floor + 1} 层的 Boss 掉落折算 {Math.round(endlessScale(hero.floor + 1) * 100)}%（×0.6 递进），
              扭蛋券与 0-Day 只在首杀发放。
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={endRun} className="px-5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold text-xs">
              {gameState === 'victory' ? '带着战利品离场' : '接受结算，离开深渊'}
            </button>
            {gameState === 'victory' && (
              <button
                onClick={diveDeeper}
                className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs"
              >
                ⚡ 继续深入第 {hero.floor + 1} 层
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
