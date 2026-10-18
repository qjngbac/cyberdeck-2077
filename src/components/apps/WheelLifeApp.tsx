import React, { useState, useRef, useEffect } from 'react';
import { RotateCw } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';
import confetti from 'canvas-confetti';
import { SoulRing, SoulBone, WheelLifeState } from '../../types';
import { DAILY_LIMITS, dailyDecay, formatCredits, formatNumber, MERIT_TO_CREDIT_RATE } from '../../utils/gameLogic';

interface MartialSoulConfig {
  id: string;
  name: string;
  desc: string;
  icon: string;
  quality: 'SSR' | 'SR' | 'R';
  basePower: number;
}

const AVAILABLE_SOULS: MartialSoulConfig[] = [
  { id: 'haotian', name: '超导昊天锤', desc: '强攻系极致暴力，一锤砸碎千行 Bug', icon: '🔨', quality: 'SSR', basePower: 120 },
  { id: 'lanyin', name: '蓝银量子光纤', desc: '控制系无孔不入，绑定万物局域网', icon: '🌿', quality: 'SSR', basePower: 110 },
  { id: 'phoenix', name: '纳米邪火凤凰', desc: '敏攻爆发系，火焰附带量子湮灭', icon: '🔥', quality: 'SSR', basePower: 115 },
  { id: 'qisha', name: '赛博七杀剑', desc: '极致攻伐，剑气斩断死锁进程', icon: '🗡️', quality: 'SSR', basePower: 130 },
  { id: 'xuanwu', name: '玄武重装机甲', desc: '极致防御，护盾抵御一切线上事故', icon: '🛡️', quality: 'SR', basePower: 95 },
];

/** 武魂品质倍率：basePower 与 quality 现在直接进伤害公式，选哪个不再等价。 */
const QUALITY_MULT: Record<MartialSoulConfig['quality'], number> = { SSR: 1.2, SR: 1.0, R: 0.85 };

type WheelPrize =
  | { title: string; icon: string; type: 'ring'; years: number; colorHex: string; colorName: string; skill: string }
  | { title: string; icon: string; type: 'bone'; slot: string; name: string; power: number }
  | { title: string; icon: string; type: 'merit'; amount: number; desc: string }
  | { title: string; icon: string; type: 'credits'; amount: number; desc: string }
  | { title: string; icon: string; type: 'power'; amount: number; desc: string };

const WHEEL_SECTORS: WheelPrize[] = [
  { title: '猎杀十万年魂兽', icon: '🐉', type: 'ring', years: 100000, colorHex: '#ff0055', colorName: '十万年红环', skill: '【大须弥超导爆轰】' },
  { title: '掉落头部魂骨', icon: '🧠', type: 'bone', slot: '头部', name: '智慧神念魂骨', power: 150 },
  { title: '带薪天人感应', icon: '⚡', type: 'merit', amount: 500, desc: '功德 +500' },
  { title: '宗门算力分红', icon: '💰', type: 'credits', amount: 800, desc: '获得 ₵800 赛博币' },
  { title: '猎杀万年魂兽', icon: '🦁', type: 'ring', years: 25000, colorHex: '#1e1b4b', colorName: '万年黑环', skill: '【量子空间撕裂】' },
  { title: '掉落躯干魂骨', icon: '🦺', type: 'bone', slot: '躯干', name: '泰坦不灭魂骨', power: 200 },
  { title: '吸收千年灵芝', icon: '🍄', type: 'power', amount: 350, desc: '魂力 +350 点' },
  { title: '神界诸神赐福', icon: '🌟', type: 'ring', years: 1000000, colorHex: '#ffd700', colorName: '百万年金环', skill: '【神级·格式化全域】' },
  { title: '掉落右臂魂骨', icon: '🦾', type: 'bone', slot: '右臂', name: '雷霆撕裂魂骨', power: 180 },
  { title: '顿悟自创魂技', icon: '📜', type: 'merit', amount: 1000, desc: '功德 +1000' },
  { title: '掉落左臂魂骨', icon: '💪', type: 'bone', slot: '左臂', name: '虚空相位左臂', power: 160 },
  { title: '掉落左腿魂骨', icon: '🦿', type: 'bone', slot: '左腿', name: '极速瞬移魂骨', power: 140 },
  { title: '暴击宗门金库', icon: '💎', type: 'credits', amount: 2500, desc: '获得 ₵2,500 赛博币' },
  { title: '掉落右腿魂骨', icon: '🦵', type: 'bone', slot: '右腿', name: '风驰瞬影右腿', power: 130 },
];

const SPIN_COST_CREDITS = 500;
const SPIN_COST_MERIT = 800;
const RING_SLOTS = 9;
/** 魂骨只提供小比例增伤，避免九枚魂环的加成被魂骨再次放大。 */
const BONE_DMG_RATIO = 0.15;
const ARENA_BASE_HIT = 28;
const ARENA_ENTRY_COOLDOWN_MS = 10_000;

const MAX_LEVEL = 100;
const BREAKTHROUGH_MIN_CHANCE = 0.3;
/** 成功率随境界线性衰减（Level 10 → 88.5%，Level 90 → 36.5%）。 */
const breakthroughChanceAt = (level: number) => Math.max(BREAKTHROUGH_MIN_CHANCE, 0.95 - level * 0.0065);
/** 渡劫失败保留 60% 魂力，即烧掉 40% 已积累进度。 */
const BREAKTHROUGH_FAIL_LOSS = 0.4;

/** 一格奖项的现金等价（功德按兑换率折成赛博币），用于如实公示期望。 */
const sectorCashValue = (p: WheelPrize): number =>
  p.type === 'credits' ? p.amount : p.type === 'merit' ? p.amount * MERIT_TO_CREDIT_RATE : 0;

const WHEEL_EV = WHEEL_SECTORS.reduce((acc, p) => acc + sectorCashValue(p) / WHEEL_SECTORS.length, 0);

type BossType = 'beast' | 'pm' | 'emperor';

interface BossDef {
  name: string;
  icon: string;
  fee: number;
  reward: number;
  merit: number;
  /** 至少需要几回合才能击杀 —— Boss 血量按玩家最强环伤害反推。 */
  minHits: number;
  /** 血量保底：装备不足时不能把 Boss 越打越小。 */
  hpFloor: number;
  /** Boss 单击占玩家生命比例 —— 决定玩家能扛几回合。 */
  atkShare: number;
}

const ARENA_BOSSES: Record<BossType, BossDef> = {
  beast: { name: '百年 · 内存泄漏妖兽', icon: '👾', fee: 300, reward: 1200, merit: 500, minHits: 4, hpFloor: 200, atkShare: 0.15 },
  pm: { name: '万年 · 深渊产品经理', icon: '👹', fee: 800, reward: 3500, merit: 1500, minHits: 7, hpFloor: 450, atkShare: 0.12 },
  emperor: { name: '十万年 · 加班大帝魔神', icon: '👑', fee: 2500, reward: 12000, merit: 5000, minHits: 10, hpFloor: 900, atkShare: 0.09 },
};

interface LiveBoss {
  type: BossType;
  name: string;
  icon: string;
  hp: number;
  maxHp: number;
  atk: number;
  reward: number;
  merit: number;
  scale: number;
  minHits: number;
  hpFloor: number;
  atkShare: number;
}

interface BattleState {
  boss: LiveBoss;
  playerHp: number;
  playerMaxHp: number;
}

export const WheelLifeApp: React.FC = () => {
  const { state, addCredits, addMerit, setWheelLife, getDailyCount, recordDailyUse, startCooldown, cooldownRemaining, notify, showDialog } = useGame();
  const wheelLife = state.wheelLife;
  const bones = wheelLife.bones;
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [activeTab, setActiveTab] = useState<'wheel' | 'rings' | 'bones' | 'arena'>('wheel');
  const [showOdds, setShowOdds] = useState(false);

  // Arena Battle State (session-only)
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [arenaLogs, setArenaLogs] = useState<string[]>([]);
  // 斗魂场当日次数：核心层尚未持久化 'arena' 计数，先用组件状态记当日次数，与 getDailyCount 取大
  const [arenaSession, setArenaSession] = useState({ date: '', n: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // 战斗与吸收都要读「当下」的快照：转盘结算在 3.2s 后的回调里，闭包值已经过期
  const wheelRef = useRef(wheelLife);
  const battleRef = useRef<BattleState | null>(null);
  // 行动锁：同帧连点只能结算一次（旧代码读闭包 state，双击会少算一次反击）
  const actionLockRef = useRef(false);

  useEffect(() => {
    wheelRef.current = wheelLife;
  }, [wheelLife]);

  useEffect(() => {
    battleRef.current = battle;
  }, [battle]);

  // Draw the roulette wheel on Canvas (14 sectors).
  // Re-runs when the tab changes: the canvas remounts after switching to 魂环/魂骨 and back.
  useEffect(() => {
    if (activeTab !== 'wheel') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 280;
    canvas.width = size;
    canvas.height = size;
    const center = size / 2;
    const radius = size / 2 - 10;
    const numSectors = WHEEL_SECTORS.length;
    const sectorAngle = (Math.PI * 2) / numSectors;

    ctx.clearRect(0, 0, size, size);

    for (let i = 0; i < numSectors; i++) {
      const angle = i * sectorAngle;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, angle, angle + sectorAngle);
      ctx.closePath();

      ctx.fillStyle = i % 2 === 0 ? 'rgba(15, 23, 42, 0.95)' : 'rgba(30, 41, 59, 0.95)';
      ctx.fill();

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Text
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(angle + sectorAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`${WHEEL_SECTORS[i].icon} ${WHEEL_SECTORS[i].title.slice(0, 4)}`, radius - 12, 3);
      ctx.restore();
    }

    // Outer Glow Border
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00f0ff';
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center Hub
    ctx.beginPath();
    ctx.arc(center, center, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [activeTab]);

  const pushLog = (prev: WheelLifeState, msg: string): WheelLifeState => ({
    ...prev,
    logs: [msg, ...prev.logs.slice(0, 10)],
  });

  // ---------------- 战力推导（UI 与结算共用同一套公式，杜绝「显示一套、结算另一套」） ----------------
  const soul = wheelLife.awakenedSoul;
  const soulFactor = soul ? (soul.basePower / 100) * QUALITY_MULT[soul.quality] : 1;
  const boneBonus = Math.round(bones.reduce((acc, b) => acc + b.power, 0) * BONE_DMG_RATIO);
  const ringHit = (atkBonus: number) => Math.max(1, Math.round((ARENA_BASE_HIT + atkBonus + wheelLife.level * 3 + boneBonus) * soulFactor));
  const ringHits = wheelLife.rings.map((r) => ringHit(r.atkBonus));
  const strongestHit = ringHits.length ? Math.max(...ringHits) : ringHit(0);
  const playerMaxHp = 200 + wheelLife.level * 10;
  const bossHpFor = (def: BossDef) => Math.max(def.hpFloor, Math.round(strongestHit * def.minHits));
  const bossAtkFor = (def: BossDef) => Math.max(1, Math.round(playerMaxHp * def.atkShare));

  const arenaLimits = DAILY_LIMITS.arena;
  const arenaLocalCount = arenaSession.date === new Date().toDateString() ? arenaSession.n : 0;
  const arenaUsedToday = () => Math.max(getDailyCount('arena'), arenaLocalCount);
  const arenaScaleFor = (used: number) => dailyDecay(used, arenaLimits);

  // Awaken Martial Soul. First awakening grants the level-10 starter package;
  // a re-awakening keeps rings/bones/realm and only swaps the soul itself.
  const awakenSoul = (target: MartialSoulConfig) => {
    SoundFX.playLevelUp();
    confetti({ particleCount: 50, spread: 70 });
    const factor = (target.basePower / 100) * QUALITY_MULT[target.quality];
    const initialRing: SoulRing = {
      id: 'ring-1',
      years: 1000,
      colorName: '千年紫环',
      colorHex: '#a855f7',
      skillName: '【第一魂技 · 基础代码编译】',
      // 觉醒赠环也按武魂分层：SSR 七杀给 47，SR 玄武只给 29
      atkBonus: Math.round(30 * factor),
    };
    setWheelLife((prev) => {
      const isFirstAwakening = prev.rings.length === 0;
      return {
        ...prev,
        awakenedSoul: target,
        ...(isFirstAwakening
          ? {
              level: 10,
              soulPower: 100,
              maxSoulPower: 200,
              realmName: '一环魂师 (Level 10)',
              rings: [initialRing],
            }
          : {}),
        logs: [`[机缘] 恭喜成功觉醒专属赛博神级武魂【${target.name}】！伤害系数 ×${factor.toFixed(2)}${isFirstAwakening ? `，初始魂环攻击 +${initialRing.atkBonus}！` : '，原有魂环与境界全部保留！'}`],
      };
    });
  };

  // Return to the awakening screen to pick a different martial soul (progress kept)
  const reopenAwakening = () => {
    showDialog({
      id: 'wheel-reawaken',
      title: '重选武魂？',
      message: `魂环、魂骨与境界都会保留，仅更换武魂本体。\n当前伤害系数 ×${soulFactor.toFixed(2)}（${soul?.name} ${soul?.quality}·basePower ${soul?.basePower}）\n可选系数区间 ×${Math.min(...AVAILABLE_SOULS.map((s0) => (s0.basePower / 100) * QUALITY_MULT[s0.quality])).toFixed(2)} ~ ×${Math.max(...AVAILABLE_SOULS.map((s0) => (s0.basePower / 100) * QUALITY_MULT[s0.quality])).toFixed(2)}。`,
      icon: '🔄',
      tone: 'purple',
      confirmText: '确认重选',
      cancelText: '再想想',
      onConfirm: () => {
        SoundFX.playKeyClick();
        setWheelLife((prev) => ({ ...prev, awakenedSoul: null }));
      },
    });
  };

  // ---- 魂环吸收：按 atkBonus 择优保留 9 枚，淘汰更强的必须二次确认 ----
  const absorbRing = (newRing: SoulRing, forceDropStronger: boolean) => {
    setWheelLife((prev) => {
      // 吸收补偿的魂力也按武魂分层（从 prev 推导，保证 StrictMode 双调用结果一致）
      const s = prev.awakenedSoul;
      const gain = Math.round(100 * (s ? (s.basePower / 100) * QUALITY_MULT[s.quality] : 1));
      const kept = [...prev.rings];
      let note = '';
      if (kept.length < RING_SLOTS) {
        kept.push(newRing);
        note = `成功装配【${newRing.colorName}】（攻击 +${newRing.atkBonus}），魂环 ${kept.length}/${RING_SLOTS}，魂力 +${gain}。`;
      } else {
        const weakestIdx = kept.reduce((wi, r, i) => (r.atkBonus < kept[wi].atkBonus ? i : wi), 0);
        const weakest = kept[weakestIdx];
        if (newRing.atkBonus >= weakest.atkBonus) {
          kept[weakestIdx] = newRing;
          note = `【${newRing.colorName}】(+${newRing.atkBonus}) 顶替了最弱的【${weakest.colorName}】(+${weakest.atkBonus})，魂力 +${gain}。`;
        } else if (forceDropStronger) {
          kept[weakestIdx] = newRing;
          note = `强行装配【${newRing.colorName}】(+${newRing.atkBonus})，淘汰了【${weakest.colorName}】(+${weakest.atkBonus})，战力下降 ${weakest.atkBonus - newRing.atkBonus}。`;
        } else {
          note = `【${newRing.colorName}】(+${newRing.atkBonus}) 弱于现有最弱环【${weakest.colorName}】(+${weakest.atkBonus})，已自动舍弃，魂环保留最强 9 枚，魂力 +${gain} 作为补偿。`;
        }
      }
      return pushLog({ ...prev, rings: kept, soulPower: prev.soulPower + gain, totalSpins: prev.totalSpins + 1 }, `[轮盘机缘] ${note}`);
    });
  };

  const offerForcedAbsorb = (newRing: SoulRing, weakest: SoulRing) => {
    showDialog({
      id: `ring-full-${Date.now()}`,
      title: '魂环位已满 9 枚',
      message: `转到【${newRing.colorName}】攻击 +${newRing.atkBonus}，却弱于你现有最弱的【${weakest.colorName}】+${weakest.atkBonus}。\n默认「自动舍弃」，不损失任何战力（改按武魂系数补偿魂力）。\n强行吸收将永久淘汰 +${weakest.atkBonus} 那一枚，战力 -${weakest.atkBonus - newRing.atkBonus}。`,
      icon: '📿',
      tone: 'red',
      confirmText: `强行吸收（淘汰 +${weakest.atkBonus}）`,
      cancelText: '自动舍弃（推荐）',
      onConfirm: () => absorbRing(newRing, true),
      onCancel: () => absorbRing(newRing, false),
    });
  };

  // Spin Wheel of Destiny
  const spinWheel = () => {
    if (isSpinning) return;
    if (state.credits < SPIN_COST_CREDITS && state.merit < SPIN_COST_MERIT) {
      SoundFX.playAlert();
      notify({
        title: '功德/赛博币不足',
        body: `转动命运轮盘需要 ${formatCredits(SPIN_COST_CREDITS)} 或 ${SPIN_COST_MERIT} 功德！当前 ${formatCredits(state.credits)} / ${formatNumber(state.merit)} 功德。`,
        icon: '⚠️',
        tone: 'error',
      });
      return;
    }

    if (state.credits >= SPIN_COST_CREDITS) {
      const paid = addCredits(-SPIN_COST_CREDITS);
      if (paid !== -SPIN_COST_CREDITS) {
        if (paid < 0) addCredits(-paid);
        SoundFX.playAlert();
        notify({ title: '赛博币不足', body: `本次转动需要 ${formatCredits(SPIN_COST_CREDITS)}！`, icon: '⚠️', tone: 'error' });
        return;
      }
    } else {
      addMerit(-SPIN_COST_MERIT);
    }

    setIsSpinning(true);
    SoundFX.playWoodenFish(1.8);

    const randomSectorIdx = Math.floor(Math.random() * WHEEL_SECTORS.length);
    const numSectors = WHEEL_SECTORS.length;
    const sectorAngleDeg = 360 / numSectors;
    // Pointer sits at 12 o'clock = 270° in canvas coordinates.
    // Rotate the wheel so the winning sector's center lands exactly under the pointer,
    // accounting for the accumulated rotation from previous spins.
    const pointerDeg = 270;
    const sectorCenter = randomSectorIdx * sectorAngleDeg + sectorAngleDeg / 2;
    const delta = ((pointerDeg - sectorCenter - (rotationAngle % 360)) % 360 + 360) % 360;
    const nextAngle = rotationAngle + 5 * 360 + delta;

    setRotationAngle(nextAngle);

    setTimeout(() => {
      setIsSpinning(false);
      const prize = WHEEL_SECTORS[randomSectorIdx];
      SoundFX.playLevelUp();
      confetti({ particleCount: 40, spread: 60 });

      let logMsg = `[轮盘机缘] 转到了【${prize.title}】！`;

      if (prize.type === 'credits') {
        addCredits(prize.amount);
        logMsg += ` 获得了 ₵${formatNumber(prize.amount)} 赛博币！`;
        setWheelLife((prev) => pushLog({ ...prev, totalSpins: prev.totalSpins + 1 }, logMsg));
      } else if (prize.type === 'merit') {
        addMerit(prize.amount);
        logMsg += ` 积攒了 ${prize.amount} 点功德！`;
        setWheelLife((prev) => pushLog({ ...prev, totalSpins: prev.totalSpins + 1 }, logMsg));
      } else if (prize.type === 'power') {
        setWheelLife((prev) => pushLog({
          ...prev,
          soulPower: prev.soulPower + prize.amount,
          totalSpins: prev.totalSpins + 1,
        }, `${logMsg} 获得了 ${prize.amount} 点修仙魂力！`));
      } else if (prize.type === 'bone') {
        setWheelLife((prev) => {
          const nextBones: SoulBone[] = [...prev.bones.filter((b) => b.slot !== prize.slot), { slot: prize.slot, name: prize.name, power: prize.power }];
          return pushLog({ ...prev, bones: nextBones, totalSpins: prev.totalSpins + 1 }, `${logMsg} 成功融合【${prize.slot}·${prize.name}】（战力 +${prize.power}，折算增伤 +${Math.round(prize.power * BONE_DMG_RATIO)}）！`);
        });
      } else if (prize.type === 'ring') {
        const newRing: SoulRing = {
          id: `ring-${Date.now()}`,
          years: prize.years,
          colorName: prize.colorName,
          colorHex: prize.colorHex,
          skillName: prize.skill,
          atkBonus: Math.floor(prize.years / 200),
        };
        const cur = wheelRef.current;
        if (cur.rings.length >= RING_SLOTS) {
          const weakest = cur.rings.reduce((a, b) => (a.atkBonus <= b.atkBonus ? a : b), cur.rings[0]);
          if (newRing.atkBonus < weakest.atkBonus) {
            // 淘汰更强的魂环不可逆，交给玩家决定
            offerForcedAbsorb(newRing, weakest);
            return;
          }
        }
        absorbRing(newRing, false);
      }
    }, 3200);
  };

  // Breakthrough Realm — 成功率随境界衰减，失败烧掉 40% 魂力，满级不再可点
  const breakthrough = () => {
    if (wheelLife.level >= MAX_LEVEL) {
      notify({ title: '已达最高境界', body: '量子神尊 · 赛博道祖，再无更高境界可渡。', icon: '🌈', tone: 'purple' });
      return;
    }
    if (wheelLife.soulPower < wheelLife.maxSoulPower) {
      SoundFX.playAlert();
      notify({
        title: '魂力不足',
        body: `渡劫需要 ${formatNumber(wheelLife.maxSoulPower)} 魂力，当前 ${formatNumber(wheelLife.soulPower)}（还差 ${formatNumber(wheelLife.maxSoulPower - wheelLife.soulPower)}）。`,
        icon: '⚠️',
        tone: 'warn',
      });
      return;
    }

    const chance = breakthroughChanceAt(wheelLife.level);
    // 随机数必须在 updater 之外决定：StrictMode 会把 updater 调用两次
    const success = Math.random() < chance;

    if (success) {
      SoundFX.playLevelUp();
      confetti({ particleCount: 80, spread: 90 });
    } else {
      SoundFX.playAlert();
    }

    const nextLevel = Math.min(MAX_LEVEL, wheelLife.level + 10);
    const realms = [
      '一环魂师', '二环大魂师', '三环魂尊', '四环魂宗', '五环魂王',
      '六环魂帝', '七环魂圣', '八环魂斗罗', '九环封号斗罗', '十环【量子真神 · 赛博道祖】'
    ];
    const realmIdx = Math.min(realms.length - 1, Math.floor(nextLevel / 10));
    const lostSoulPower = Math.round(wheelLife.maxSoulPower * BREAKTHROUGH_FAIL_LOSS);

    setWheelLife((prev) => {
      if (success) {
        return {
          ...prev,
          level: nextLevel,
          soulPower: 0,
          maxSoulPower: prev.maxSoulPower + 150,
          realmName: `${realms[realmIdx]} (Level ${nextLevel})`,
          logs: [`🎉 渡劫成功（概率 ${(chance * 100).toFixed(1)}%）！晋升至【${realms[realmIdx]}】境界！`, ...prev.logs.slice(0, 10)],
        };
      }
      return {
        ...prev,
        soulPower: Math.max(0, prev.soulPower - lostSoulPower),
        logs: [`⛈️ 渡劫失败（成功概率仅 ${(chance * 100).toFixed(1)}%）！天雷劈散 ${lostSoulPower} 点魂力，境界未动。`, ...prev.logs.slice(0, 10)],
      };
    });

    notify(
      success
        ? { title: '渡劫飞升成功', body: `晋升【${realms[realmIdx]}】，下一境界需要 ${formatNumber(wheelLife.maxSoulPower + 150)} 魂力，成功率 ${(breakthroughChanceAt(nextLevel) * 100).toFixed(1)}%。`, icon: '⚡', tone: 'gold' }
        : { title: '渡劫失败', body: `魂力 -${lostSoulPower}（保留 ${(1 - BREAKTHROUGH_FAIL_LOSS) * 100}%），本次成功概率 ${(chance * 100).toFixed(1)}%。`, icon: '⛈️', tone: 'error' },
    );
  };

  // ---------------- Arena ----------------
  const startArena = (bossType: BossType) => {
    const def = ARENA_BOSSES[bossType];
    if (battleRef.current) {
      notify({ title: '战斗进行中', body: '请先打完当前这场，或用「离场」退出。', icon: '⚔️', tone: 'warn' });
      return;
    }
    if (wheelLife.rings.length === 0) {
      SoundFX.playAlert();
      notify({ title: '无可释放魂技', body: '至少需要 1 枚魂环才能进入斗魂场。', icon: '⚠️', tone: 'error' });
      return;
    }
    const cd = cooldownRemaining('arena-entry');
    if (cd > 0) {
      SoundFX.playAlert();
      notify({ title: '斗魂场冷却中', body: `还需等待 ${cd} 秒才能再次入场（防止无限连刷）。`, icon: '⏳', tone: 'warn' });
      return;
    }
    const used = arenaUsedToday();
    if (state.credits < def.fee) {
      SoundFX.playAlert();
      notify({ title: '赛博币不足', body: `挑战【${def.name}】需要缴纳门票 ${formatCredits(def.fee)}！`, icon: '⚠️', tone: 'error' });
      return;
    }
    const paid = addCredits(-def.fee);
    if (paid !== -def.fee) {
      if (paid < 0) addCredits(-paid);
      SoundFX.playAlert();
      notify({ title: '赛博币不足', body: `门票需要 ${formatCredits(def.fee)}！`, icon: '⚠️', tone: 'error' });
      return;
    }

    const scale = arenaScaleFor(used);
    const maxHp = bossHpFor(def);
    const entryNo = arenaLocalCount + 1;
    const next: BattleState = {
      boss: {
        type: bossType,
        name: def.name,
        icon: def.icon,
        hp: maxHp,
        maxHp,
        atk: bossAtkFor(def),
        reward: Math.max(1, Math.round(def.reward * scale)),
        merit: Math.max(1, Math.round(def.merit * scale)),
        scale,
        minHits: def.minHits,
        hpFloor: def.hpFloor,
        atkShare: def.atkShare,
      },
      playerHp: playerMaxHp,
      playerMaxHp,
    };
    const today = new Date().toDateString();
    setArenaSession((prev) => (prev.date === today ? { date: today, n: prev.n + 1 } : { date: today, n: entryNo }));
    battleRef.current = next;
    setBattle(next);
    startCooldown('arena-entry', ARENA_ENTRY_COOLDOWN_MS);
    recordDailyUse('arena');
    setArenaLogs([
      `第 ${entryNo} 场（今日已战 ${used + 1}/${arenaLimits.soft}）：门票 -${formatCredits(def.fee)}，迎战【${def.name}】HP ${maxHp} / 单击 ${next.boss.atk}。`,
      ...(scale < 1 ? [`⚠️ 今日场次已超 ${arenaLimits.soft} 次，本场奖励降为 ${Math.round(scale * 100)}%（${formatCredits(next.boss.reward)}）。`] : []),
    ]);
  };

  const leaveArena = () => {
    battleRef.current = null;
    setBattle(null);
    setArenaLogs((prev) => ['🚪 你撤离了斗魂场，门票不退。', ...prev.slice(0, 4)]);
  };

  const attackBoss = (ring: SoulRing) => {
    const b = battleRef.current;
    // 同帧连点只结算一次：反击次数与伤害必须一一对应
    if (!b || actionLockRef.current) return;
    actionLockRef.current = true;
    setTimeout(() => { actionLockRef.current = false; }, 250);

    const dmg = ringHit(ring.atkBonus);
    const nextBossHp = Math.max(0, b.boss.hp - dmg);
    const logs = [`释放魂技 ${ring.skillName}（+${ring.atkBonus}）造成 ${dmg} 点伤害！`];
    let playerHp = b.playerHp;
    let victory = false;

    if (nextBossHp <= 0) {
      victory = true;
      // 击杀那次同样要吃一发 50% 临死反扑（不致死），一击流再也白嫖不到无伤
      const dying = Math.round(b.boss.atk * 0.5);
      playerHp = Math.max(1, playerHp - dying);
      logs.push(`🎉 击溃【${b.boss.name}】！战利品 ${formatCredits(b.boss.reward)} 与功德 +${b.boss.merit}（需 ${b.boss.minHits} 回合保底）。`);
      logs.push(`💥 魔神临死反扑，你受到 ${dying} 点伤害（不会致死），剩余生命 ${playerHp}。`);
    } else {
      const bossDmg = b.boss.atk;
      playerHp = Math.max(0, b.playerHp - bossDmg);
      logs.push(`【${b.boss.name}】反扑，玩家受到 ${bossDmg} 点伤害！剩余生命 ${playerHp}。`);
      if (playerHp <= 0) logs.push('💀 战败退场！门票已消耗，请回转盘提升魂环与武魂系数。');
    }

    const next: BattleState | null = victory || playerHp <= 0
      ? null
      : { ...b, boss: { ...b.boss, hp: nextBossHp }, playerHp };
    battleRef.current = next;
    setBattle(next);
    setArenaLogs((prev) => [...logs, ...prev].slice(0, 5));

    if (victory) {
      SoundFX.playLevelUp();
      confetti({ particleCount: 70, spread: 80 });
      addCredits(b.boss.reward);
      addMerit(b.boss.merit);
      notify({
        title: '斗魂场大捷',
        body: `${b.boss.name} 被击溃：${formatCredits(b.boss.reward)} + 功德 ${b.boss.merit}${b.boss.scale < 1 ? `（今日递减 ${Math.round(b.boss.scale * 100)}%）` : ''}。`,
        icon: '🏆',
        tone: 'gold',
      });
    } else if (playerHp <= 0) {
      SoundFX.playAlert();
      notify({
        title: '战败退场',
        body: `${dmg} 点伤害打不满 ${b.boss.maxHp} 血，需要 ${Math.ceil(b.boss.maxHp / Math.max(1, dmg))} 回合，但你只扛得住 ${Math.floor(b.playerMaxHp / Math.max(1, b.boss.atk))} 回合。换更强的魂环或先提升武魂系数。`,
        icon: '💀',
        tone: 'error',
      });
    } else {
      SoundFX.playSlash();
    }
  };

  // Unawakened Screen
  if (!wheelLife.awakenedSoul) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-4 text-center space-y-4 font-mono text-xs select-none">
        <div className="text-4xl animate-bounce">⚡</div>
        <div>
          <div className="text-base font-black text-cyan-300 text-glow-cyan">
            赛博修仙 · 觉醒你的专属武魂
          </div>
          <div className="text-slate-400 text-[11px] mt-1">
            选择你最初的赛博机甲武魂，踏上转盘修仙与魂环突破之旅！
          </div>
          <div className="text-[10px] text-yellow-400 mt-1">
            武魂直接决定斗魂场伤害系数：系数 = basePower/100 × 品质倍率（SSR 1.2 / SR 1.0 / R 0.85）
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-md">
          {AVAILABLE_SOULS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => awakenSoul(opt)}
              className="p-3 rounded-xl bg-slate-900/80 hover:bg-cyan-950/80 border border-slate-800 hover:border-cyan-400 text-left transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl group-hover:scale-110 transition-transform">{opt.icon}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-950 text-pink-300 font-bold border border-pink-800">
                  {opt.quality}
                </span>
              </div>
              <div className="font-bold text-slate-200 mt-1">{opt.name}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</div>
              <div className="text-[10px] text-cyan-300 mt-1">
                basePower {opt.basePower} → 斗魂场伤害系数 ×{((opt.basePower / 100) * QUALITY_MULT[opt.quality]).toFixed(2)}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const totalPower = wheelLife.rings.reduce((acc, r) => acc + r.atkBonus, 0) + bones.reduce((acc, b) => acc + b.power, 0) + wheelLife.level * 10;
  const isMaxLevel = wheelLife.level >= MAX_LEVEL;
  const btChance = breakthroughChanceAt(wheelLife.level);
  const usedToday = arenaUsedToday();
  const nextScale = arenaScaleFor(usedToday);
  const entryCd = cooldownRemaining('arena-entry');

  return (
    <div className="flex flex-col h-full space-y-2.5 font-mono text-xs select-none">
      {/* Header Banner */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-950 to-purple-950 border border-cyan-400 flex items-center justify-center text-2xl shadow-neon-cyan">
            {wheelLife.awakenedSoul.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-cyan-300">{wheelLife.awakenedSoul.name}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-yellow-950 text-yellow-300 border border-yellow-700">
                {wheelLife.realmName}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              总战力: <span className="text-pink-400 font-bold">{formatNumber(totalPower)}</span> | 魂力: <span className="text-cyan-400 font-bold">{formatNumber(wheelLife.soulPower)}</span>/{formatNumber(wheelLife.maxSoulPower)}
              <span className="text-slate-500">
                {isMaxLevel
                  ? ' · 已满级，渡劫不再可点'
                  : ` · 渡劫成功率 ${(btChance * 100).toFixed(1)}%，失败 -${Math.round(wheelLife.maxSoulPower * BREAKTHROUGH_FAIL_LOSS)} 魂力`}
              </span>
            </div>
            <div className="text-[9px] text-slate-500">
              单跳伤害 {Math.min(...(ringHits.length ? ringHits : [strongestHit]))}~{strongestHit}（系数 ×{soulFactor.toFixed(2)}，魂骨 +{boneBonus}）
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <button
            onClick={breakthrough}
            disabled={isMaxLevel || wheelLife.soulPower < wheelLife.maxSoulPower}
            title={isMaxLevel ? '已达最高境界' : `成功率 ${(btChance * 100).toFixed(1)}%，失败魂力 -${Math.round(wheelLife.maxSoulPower * BREAKTHROUGH_FAIL_LOSS)}`}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-yellow-500 to-amber-500 hover:brightness-110 disabled:opacity-40 text-slate-950 font-black text-xs shadow-neon-gold transition-all"
          >
            {isMaxLevel ? '🌈 已证道祖' : `⚡ 渡劫 ${(btChance * 100).toFixed(0)}%`}
          </button>
          <button
            onClick={reopenAwakening}
            title="重新选择武魂，魂环魂骨与境界全部保留"
            className="px-2.5 py-0.5 rounded bg-slate-800/80 hover:bg-cyan-950/60 border border-slate-700 hover:border-cyan-500/50 text-[9px] text-slate-400 hover:text-cyan-300 transition-colors"
          >
            🔄 重选武魂
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
        <button
          onClick={() => setActiveTab('wheel')}
          className={`py-1 rounded text-center font-bold ${activeTab === 'wheel' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50' : 'text-slate-400'}`}
        >
          🎡 命运转盘
        </button>
        <button
          onClick={() => setActiveTab('rings')}
          className={`py-1 rounded text-center font-bold ${activeTab === 'rings' ? 'bg-pink-500/20 text-pink-300 border border-pink-500/50' : 'text-slate-400'}`}
        >
          📿 魂环 ({wheelLife.rings.length}/{RING_SLOTS})
        </button>
        <button
          onClick={() => setActiveTab('bones')}
          className={`py-1 rounded text-center font-bold ${activeTab === 'bones' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50' : 'text-slate-400'}`}
        >
          🦴 魂骨 ({bones.length}/6)
        </button>
        <button
          onClick={() => setActiveTab('arena')}
          className={`py-1 rounded text-center font-bold ${activeTab === 'arena' ? 'bg-red-500/20 text-red-300 border border-red-500/50' : 'text-slate-400'}`}
        >
          ⚔️ 斗魂场
        </button>
      </div>

      {/* Tab 1: Wheel */}
      {activeTab === 'wheel' && (
        <div className="flex-1 flex flex-col items-center justify-between p-2 overflow-y-auto">
          <div className="relative w-64 h-64 flex items-center justify-center shrink-0">
            <div className="absolute top-0 z-20 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[18px] border-t-yellow-400 filter drop-shadow-[0_0_8px_#ffd700]" />

            <div
              style={{
                transform: `rotate(${rotationAngle}deg)`,
                transition: isSpinning ? 'transform 3.2s cubic-bezier(0.15, 0.9, 0.25, 1)' : 'none',
              }}
              className="rounded-full shadow-2xl"
            >
              <canvas ref={canvasRef} className="block" />
            </div>

            <button
              onClick={spinWheel}
              disabled={isSpinning}
              className="absolute z-20 w-14 h-14 rounded-full bg-gradient-to-tr from-yellow-500 via-amber-400 to-yellow-300 text-slate-950 font-black text-xs shadow-neon-gold hover:scale-105 active:scale-95 disabled:opacity-60 transition-transform flex flex-col items-center justify-center"
            >
              <RotateCw size={14} className={isSpinning ? 'animate-spin' : ''} />
              <span>转动</span>
            </button>
          </div>

          <div className="w-full mt-2 flex items-center justify-between text-[10px] text-slate-400 px-2 py-1 bg-slate-900/60 rounded-lg border border-slate-800 shrink-0">
            <span>消耗: {formatCredits(SPIN_COST_CREDITS)} 或 {formatNumber(SPIN_COST_MERIT)} 功德 / 次</span>
            <span>已转动: {formatNumber(wheelLife.totalSpins)} 次</span>
            <button onClick={() => setShowOdds((v) => !v)} className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-300">
              {showOdds ? '收起公示' : '概率/期望公示'}
            </button>
          </div>

          {showOdds && (
            <div className="w-full mt-1.5 p-1.5 rounded-lg bg-slate-950/80 border border-cyan-500/30 text-[9px] space-y-0.5 shrink-0">
              <div className="text-cyan-300 font-bold">
                14 格等概率（每格 1/14 = {(100 / WHEEL_SECTORS.length).toFixed(1)}%）· 现金期望 ≈{formatCredits(Math.round(WHEEL_EV))} / 成本 {formatCredits(SPIN_COST_CREDITS)} → 期望净值 {formatCredits(Math.round(WHEEL_EV - SPIN_COST_CREDITS))}
              </div>
              <div className="text-slate-500">现金等价 = 赛博币 + 功德 × {MERIT_TO_CREDIT_RATE}（兑换率）；魂环/魂骨/魂力不计入现金，只换算战力。</div>
              <div className="grid grid-cols-2 gap-x-2">
                {WHEEL_SECTORS.map((p, i) => (
                  <div key={i} className="flex justify-between gap-1 truncate">
                    <span className="text-slate-300">{p.icon} {p.title}</span>
                    <span className={sectorCashValue(p) > 0 ? 'text-green-400' : 'text-slate-500'}>
                      {sectorCashValue(p) > 0 ? `${formatCredits(Math.round(sectorCashValue(p)))}` : '战力/魂力'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="w-full mt-1.5 h-16 shrink-0 overflow-y-auto bg-slate-950/80 rounded-lg p-1.5 border border-slate-800 text-[10px] text-slate-300 space-y-1">
            {wheelLife.logs.map((log, idx) => (
              <div key={idx} className="truncate text-yellow-300/90">{log}</div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Soul Rings */}
      {activeTab === 'rings' && (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <div className="text-[10px] text-slate-400 mb-1 p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
            魂环按 <span className="text-cyan-300">攻击加成择优保留 {RING_SLOTS} 枚</span>：转到更弱的环会自动舍弃（补偿 100×武魂系数 的魂力），要淘汰更强的环必须二次确认。
            单跳伤害 = ({ARENA_BASE_HIT} + 环加成 + 等级×{3} + 魂骨战力×{Math.round(BONE_DMG_RATIO * 100)}%) × 武魂系数 ×{soulFactor.toFixed(2)}
          </div>
          {wheelLife.rings.map((ring, idx) => (
            <div
              key={ring.id}
              style={{ borderColor: ring.colorHex }}
              className="p-2 rounded-lg bg-slate-900/80 border flex items-center justify-between gap-2 shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <div
                  style={{ backgroundColor: ring.colorHex }}
                  className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white shadow-md"
                >
                  {idx + 1}
                </div>
                <div>
                  <div className="font-bold text-slate-200 text-xs">
                    {ring.colorName} ({formatNumber(ring.years)} 年)
                  </div>
                  <div className="text-[10px] text-cyan-300 font-semibold">{ring.skillName}</div>
                </div>
              </div>
              <div className="text-right text-[10px]">
                <div className="text-pink-400 font-bold">攻击 +{formatNumber(ring.atkBonus)}</div>
                <div className="text-slate-400">实伤 {formatNumber(ringHits[idx])}{ring.atkBonus === Math.max(...wheelLife.rings.map((r) => r.atkBonus)) ? ' ★主C' : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Soul Bones */}
      {activeTab === 'bones' && (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <div className="text-[11px] text-slate-400 mb-1">
            六大外附魂骨槽位（转盘掉落，战力 ×{Math.round(BONE_DMG_RATIO * 100)}% 直接进斗魂场伤害，当前合计 +{boneBonus} 增伤）：
          </div>
          <div className="grid grid-cols-2 gap-2">
            {['头部', '躯干', '左臂', '右臂', '左腿', '右腿'].map((slot) => {
              const bone = bones.find((b) => b.slot === slot);
              return (
                <div
                  key={slot}
                  className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                    bone ? 'bg-purple-950/40 border-purple-400 shadow-neon-pink' : 'bg-slate-900/40 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-400">{slot}魂骨</span>
                    {bone && <span className="text-[10px] text-yellow-400 font-bold">+{bone.power} 战力</span>}
                  </div>
                  <div className="mt-2">
                    {bone ? (
                      <span className="text-purple-300 font-bold text-xs">🦴 {bone.name}</span>
                    ) : (
                      <span className="text-slate-600 text-[10px]">未融合 (转盘获取)</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 4: Arena */}
      {activeTab === 'arena' && (
        <div className="flex-1 flex flex-col justify-between p-2 overflow-y-auto">
          {!battle ? (
            <div className="space-y-2.5 text-center">
              <div className="text-base font-bold text-red-400">⚔️ 赛博斗魂试炼场 ⚔️</div>
              <div className="text-[10px] text-slate-400 leading-tight">
                Boss 血量 = max(基础血量, 你的最强环伤害 × 保底回合)，攻击 = 你的生命 × 比例。<br />
                打不死是因为你不够强，不是点一下就算赢。
              </div>
              <div className="text-[10px] p-1.5 rounded-lg bg-slate-900/70 border border-slate-800 text-slate-300">
                今日已战 <span className="text-cyan-300 font-bold">{usedToday}</span>/{arenaLimits.soft} 次 · 下次入场奖励 <span className={nextScale < 1 ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>{Math.round(nextScale * 100)}%</span>
                {entryCd > 0 && <span className="text-yellow-400"> · 冷却 {entryCd}s</span>}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {(Object.keys(ARENA_BOSSES) as BossType[]).map((type) => {
                  const def = ARENA_BOSSES[type];
                  const hp = bossHpFor(def);
                  const atk = bossAtkFor(def);
                  const need = Math.ceil(hp / strongestHit);
                  const survivable = Math.floor(playerMaxHp / atk);
                  const canWin = need <= survivable;
                  return (
                    <button
                      key={type}
                      onClick={() => startArena(type)}
                      disabled={entryCd > 0}
                      className="p-2.5 rounded-xl bg-slate-900 hover:bg-red-950/80 disabled:opacity-40 border border-slate-700 hover:border-red-400 text-left transition-all"
                    >
                      <div className="text-2xl mb-0.5">{def.icon}</div>
                      <div className="font-bold text-slate-200 text-[10px] leading-tight">{def.name.replace(/^.*· /, '')}</div>
                      <div className="text-[9px] text-slate-400 mt-1">门票 {formatCredits(def.fee)}</div>
                      <div className="text-[9px] text-slate-400">HP {formatNumber(hp)} · 单击 {formatNumber(atk)}</div>
                      <div className="text-[9px] text-slate-400">需 {need} 回合 / 可扛 {survivable} 回合</div>
                      <div className={`text-[9px] font-bold mt-0.5 ${canWin ? 'text-green-400' : 'text-red-400'}`}>
                        {canWin ? `奖金 ${formatCredits(Math.round(def.reward * nextScale))}` : '大概率战败'}
                      </div>
                      <div className="text-[8px] text-slate-500">保底 {def.minHits} 回合 / 血量下限 {def.hpFloor}</div>
                    </button>
                  );
                })}
              </div>
              <div className="text-[9px] text-slate-500">
                你的生命 {playerMaxHp}（200+等级×10）· 最强环伤害 {strongestHit} · 入场冷却 {ARENA_ENTRY_COOLDOWN_MS / 1000}s
              </div>
              {arenaLogs.length > 0 && (
                <div className="h-16 overflow-y-auto bg-slate-950/80 rounded-lg p-1.5 border border-slate-800 text-[10px] space-y-1 text-left">
                  {arenaLogs.map((log, i) => (
                    <div key={i} className="text-slate-400">{log}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between space-y-2">
              {/* Boss Status */}
              <div className="p-2.5 rounded-xl bg-red-950/50 border border-red-500/40 text-center">
                <div className="text-4xl mb-1">{battle.boss.icon}</div>
                <div className="font-bold text-red-300 text-xs">{battle.boss.name}</div>
                <div className="w-48 mx-auto h-2 bg-slate-800 rounded-full overflow-hidden mt-1 border border-red-500/40">
                  <div className="h-full bg-red-500" style={{ width: `${(battle.boss.hp / battle.boss.maxHp) * 100}%` }} />
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  HP: {formatNumber(battle.boss.hp)} / {formatNumber(battle.boss.maxHp)} | 单击 {formatNumber(battle.boss.atk)}（生命×{(battle.boss.atkShare * 100).toFixed(0)}%）
                </div>
                <div className="text-[9px] text-slate-500">
                  血量由 max({battle.boss.hpFloor}, 最强环 {formatNumber(strongestHit)} × {battle.boss.minHits}) 得来 · 击杀奖励 {formatCredits(battle.boss.reward)} + 功德 {battle.boss.merit}
                </div>
              </div>

              {/* Player Status & Combat Logs */}
              <div className="flex items-center justify-between text-[11px] text-slate-300 px-1">
                <span>
                  玩家生命: <span className={`font-bold ${battle.playerHp / battle.playerMaxHp > 0.35 ? 'text-green-400' : 'text-red-400'}`}>{battle.playerHp}</span>
                  <span className="text-slate-500">/{battle.playerMaxHp}</span>
                </span>
                <span className="text-yellow-400">还需 {Math.ceil(battle.boss.hp / Math.max(1, strongestHit))} 回合（可扛 {Math.floor(battle.playerHp / Math.max(1, battle.boss.atk))} 回合）</span>
                <button onClick={leaveArena} className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[9px]">离场</button>
              </div>

              <div className="h-16 overflow-y-auto bg-slate-950/80 rounded-lg p-1.5 border border-slate-800 text-[10px] space-y-1 shrink-0">
                {arenaLogs.map((log, i) => (
                  <div key={i} className="text-cyan-300">{log}</div>
                ))}
              </div>

              {/* Soul Skill Action Buttons */}
              <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto">
                {wheelLife.rings.map((ring, idx) => (
                  <button
                    key={ring.id}
                    onClick={() => attackBoss(ring)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-400 text-left truncate transition-colors"
                  >
                    <div className="font-bold text-[10px] text-yellow-300 truncate">{ring.skillName}</div>
                    <div className="text-[9px] text-pink-400">伤害 {formatNumber(ringHits[idx])}</div>
                    <div className="text-[9px] text-slate-500">{Math.ceil(battle.boss.hp / Math.max(1, ringHits[idx]))} 回合</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
