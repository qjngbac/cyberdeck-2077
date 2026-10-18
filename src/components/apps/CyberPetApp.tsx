import React, { useState, useEffect, useRef } from 'react';
import { Heart, Battery, Utensils, Cpu } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';
import confetti from 'canvas-confetti';
import { DAILY_LIMITS, dailyDecay, formatCredits, formatNumber, isGachaSeriesComplete } from '../../utils/gameLogic';

interface CyberChip {
  id: string;
  name: string;
  slot: 'brain' | 'armor' | 'engine';
  power: number;
  desc: string;
  cost: number;
}

// Passive effects are applied in GameContext (explore rewards/duration & decay rate)
const CHIP_DEFS: CyberChip[] = [
  { id: 'c1', name: '量子神经突触核心', slot: 'brain', power: 45, desc: '提升修狗悟性，探险收益 +25%', cost: 200 },
  { id: 'c2', name: '纳米自愈合金装甲', slot: 'armor', power: 60, desc: '饱食度与心情自然消耗降低 50%', cost: 350 },
  { id: 'c3', name: '反重力离子推进器', slot: 'engine', power: 80, desc: '荒原探险历时缩短 30%（奖励不变）', cost: 600 },
];

/** 与核心层 startPetExplore 一字不差的公式，保证 UI 不会「显示一套、结算另一套」。 */
const moodFactorOf = (hunger: number, happiness: number) => 0.5 + ((hunger + happiness) / 200) * 0.7;
const minutesOf = (durationSec: number) => Math.max(1, durationSec / 30);
const energyCostOf = (durationSec: number) => (durationSec >= 120 ? 50 : durationSec >= 60 ? 35 : 20);
const rewardRangeOf = (durationSec: number, stage: number, mood: number): [number, number] => {
  const m = minutesOf(durationSec);
  return [Math.round(100 * m * mood), Math.round((100 + 100 * stage) * m * mood)];
};
const expRangeOf = (durationSec: number, stage: number, mood: number): [number, number] => {
  const m = minutesOf(durationSec);
  return [Math.round(40 * m * mood), Math.round((40 + 40 * stage) * m * mood)];
};
const dropBoostOf = (durationSec: number) => Math.min(0.45, 0.12 * minutesOf(durationSec));
const EXPLORE_RETURN_ENERGY = 15;
/** 核心层每秒 roll 一次 -1，护甲/羁绊改变概率 —— 「衰减 -50%」必须能被验证。 */
const decayChanceOf = (hasArmor: boolean, hasSynergy: boolean) =>
  hasSynergy ? (hasArmor ? 0.012 : 0.025) : hasArmor ? 0.025 : 0.05;

const TRIP_DEFS = [
  { duration: 30, name: '赛博荒原边缘', tone: 'text-green-300', hint: '基础奖励' },
  { duration: 60, name: '服务器机房核心', tone: 'text-cyan-300', hint: '稀有芯片' },
  { duration: 120, name: '轨道空间站残骸', tone: 'text-purple-300', hint: '神装部件' },
];

const HIT_EXP = 10;
const TRAIN_SECONDS = 10;
/** 「多久能进化」的估算口径：假设每次特训命中 25 次，写死在 UI 上让玩家自己判断。 */
const ASSUMED_HITS_PER_SESSION = 25;

export const CyberPetApp: React.FC = () => {
  const {
    state, feedPet, petPet, addPetExp, installPetChip, startPetExplore, claimPetExplore,
    toggleDesktopPetRoam, getDailyCount, notify,
  } = useGame();
  const pet = state.pet;
  const [activeTab, setActiveTab] = useState<'status' | 'train' | 'chips' | 'maps'>('status');

  // Mini-Game Training State (deadline-based — hits no longer stall the countdown)
  const [isTraining, setIsTraining] = useState(false);
  const [trainScore, setTrainScore] = useState(0);
  const trainScoreRef = useRef(0);
  const [trainTargetPos, setTrainTargetPos] = useState({ top: 30, left: 40 });
  const [timeLeft, setTimeLeft] = useState(TRAIN_SECONDS);
  const endTimeRef = useRef(0);
  // 同一次特训只能结算一次（定时器可能在一帧内跑两圈）
  const trainEndedRef = useRef(false);
  // 结算文案里的「今日剩余」以开始训练时的计数为准，避免 effect 因计数变化而重启
  const trainUsedAtStartRef = useRef(0);

  // 探险倒计时读核心写入的时间戳 pet.exploreEndAt，而不是本地猜的 interval
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!pet.isExploring) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [pet.isExploring]);

  const stageTitles = { 1: '机械幼体 · 零号机', 2: '战术机甲 · 啸天犬', 3: '量子神兽 · 虚空咆哮者' };
  const stageAvatars = { 1: '🐶', 2: '🐺', 3: '🐲' };

  const trainLimits = DAILY_LIMITS.train;
  const exploreLimits = DAILY_LIMITS.explore;
  const trainUsed = getDailyCount('train');
  const exploreUsed = getDailyCount('explore');
  const trainLeft = Math.max(0, trainLimits.soft - trainUsed);
  const exploreScale = dailyDecay(exploreUsed, exploreLimits);

  const mood = moodFactorOf(pet.hunger, pet.happiness);
  /** 喂养后的心情系数（按 100 上限实算），保证「吃了能多赚多少」不是拍脑袋。 */
  const moodAfter = (dHunger: number, dHappy: number) =>
    moodFactorOf(Math.min(100, pet.hunger + dHunger), Math.min(100, pet.happiness + dHappy));
  const oilMoodGain = moodAfter(30, 10) - mood;
  const ramMoodGain = moodAfter(20, 25) - mood;
  const batteryMoodGain = moodAfter(0, 15) - mood;
  const hasBrain = state.petChips.includes('c1');
  const hasArmor = state.petChips.includes('c2');
  const hasEngine = state.petChips.includes('c3');
  const petSynergy = isGachaSeriesComplete(state, 'pet');
  const claimBonus = (hasBrain ? 1.25 : 1) * (petSynergy ? 1.5 : 1);
  const dropChance = Math.min(0.95, (petSynergy ? 0.7 : 0.45) + (pet.exploreDropBoost || 0));
  const decayChance = decayChanceOf(hasArmor, petSynergy);

  /** 升目标等级还差多少经验（按核心 maxExp×1.5 的曲线累加）。 */
  const expToReach = (targetLevel: number) => {
    if (pet.level >= targetLevel) return 0;
    let perLevel = pet.maxExp;
    let banked = pet.exp;
    let total = 0;
    for (let lvl = pet.level; lvl < targetLevel; lvl++) {
      total += Math.max(0, perLevel - banked);
      banked = 0;
      perLevel = Math.floor(perLevel * 1.5);
    }
    return total;
  };
  const nextStageLevel = pet.stage === 1 ? 5 : pet.stage === 2 ? 12 : 0;
  const dailyTrainExp = trainLeft * ASSUMED_HITS_PER_SESSION * HIT_EXP;

  // Training Mini-Game Loop — exactly 10 real seconds, independent of click speed
  const startTrainingGame = () => {
    if (trainLeft <= 0) {
      SoundFX.playAlert();
      notify({
        title: '今日特训次数已用尽',
        body: `${trainLimits.label}每日 ${trainLimits.soft} 次封顶，超出后经验为 0。明天再来，或改用 DDR7 内存条 / 探险获取经验。`,
        icon: '🎯',
        tone: 'warn',
      });
      return;
    }
    setIsTraining(true);
    setTrainScore(0);
    trainScoreRef.current = 0;
    trainEndedRef.current = false;
    trainUsedAtStartRef.current = trainUsed;
    setTimeLeft(TRAIN_SECONDS);
    endTimeRef.current = Date.now() + TRAIN_SECONDS * 1000;
    SoundFX.playLevelUp();
  };

  const hitTarget = () => {
    SoundFX.playWoodenFish(1.6);
    trainScoreRef.current += 1;
    setTrainScore(trainScoreRef.current);
    setTrainTargetPos({
      top: Math.floor(Math.random() * 70) + 10,
      left: Math.floor(Math.random() * 70) + 10,
    });
  };

  useEffect(() => {
    if (!isTraining) return;
    const interval = setInterval(() => {
      const remainingMs = Math.max(0, endTimeRef.current - Date.now());
      const remainingSec = Math.ceil(remainingMs / 1000);
      setTimeLeft(remainingSec);
      if (remainingMs <= 0) {
        clearInterval(interval);
        if (trainEndedRef.current) return;
        trainEndedRef.current = true;
        setIsTraining(false);
        SoundFX.playCash();
        const earnedExp = trainScoreRef.current * HIT_EXP;
        addPetExp(earnedExp);
        confetti({ particleCount: 35, spread: 60 });
        notify({
          title: '战术训练结束',
          body: `命中 ${trainScoreRef.current} 次 → 经验 +${earnedExp}（每命中 ${HIT_EXP} 点）。今日特训剩余 ${Math.max(0, DAILY_LIMITS.train.soft - trainUsedAtStartRef.current - 1)} 次。`,
          icon: '🎯',
          tone: earnedExp > 0 ? 'success' : 'warn',
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isTraining, addPetExp, notify]);

  const buyAndInstallChip = (chip: CyberChip) => {
    if (state.petChips.includes(chip.id)) return;
    if (state.credits < chip.cost) {
      SoundFX.playAlert();
      notify({ title: '赛博币不足', body: `安装芯片需要 ${formatCredits(chip.cost)}！`, icon: '⚠️', tone: 'error' });
      return;
    }
    if (installPetChip(chip.id, chip.cost)) {
      confetti({ particleCount: 40, spread: 60 });
      notify({ title: '芯片已装载', body: `【${chip.name}】${chip.desc}（永久生效）`, icon: '💾', tone: 'purple' });
    }
  };

  // 旧存档可能只有 exploreRemaining 而没有时间戳 —— 不假装倒计时，直接提示口径
  const exploreHasDeadline = pet.isExploring && pet.exploreEndAt > 0;
  const exploreLeft = exploreHasDeadline ? Math.max(0, Math.ceil((pet.exploreEndAt - now) / 1000)) : 0;
  const isExploreReady = pet.isExploring && (!exploreHasDeadline ? pet.exploreRemaining <= 0 : exploreLeft <= 0);

  return (
    <div className="flex flex-col h-full space-y-2.5 font-mono text-xs select-none">
      {/* Top Banner */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30">
        <div className="flex items-center gap-3">
          <div
            onClick={petPet}
            title="点击摸摸修狗"
            className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-900/60 to-purple-900/60 border border-cyan-400/50 flex items-center justify-center text-3xl shadow-neon-cyan cursor-pointer hover:scale-110 active:scale-95 transition-transform"
          >
            {stageAvatars[pet.stage]}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-cyan-300">{pet.name}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                Lv.{pet.level}
              </span>
            </div>
            <div className="text-[10px] text-yellow-400 font-semibold mt-0.5">
              【{stageTitles[pet.stage]}】
            </div>
            <div className="text-[10px] text-slate-400">
              机甲总战力: <span className="text-pink-400 font-bold">{pet.power + CHIP_DEFS.filter((c) => state.petChips.includes(c.id)).reduce((acc, c) => acc + c.power, 0)}</span> 点
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleDesktopPetRoam}
            title="将宠物放养到桌面任务栏自由漫步"
            className={`px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
              pet.roamOnDesktop !== false
                ? 'bg-amber-950/80 border-amber-500/70 text-amber-300 shadow-neon-gold'
                : 'bg-slate-800/80 border-slate-700 text-slate-400'
            }`}
          >
            <span>🐾</span>
            <span>{pet.roamOnDesktop !== false ? '桌面放养中' : '放养到桌面'}</span>
          </button>

          <button
            onClick={petPet}
            className="px-2.5 py-1.5 rounded-lg bg-pink-950/60 hover:bg-pink-900/80 border border-pink-500/40 text-pink-300 text-xs font-bold transition-transform hover:scale-105 active:scale-95 flex items-center gap-1 cursor-pointer"
          >
            <Heart size={13} className="text-pink-400 fill-pink-400" />
            <span>摸摸头</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
        <button
          onClick={() => setActiveTab('status')}
          className={`py-1 rounded text-center font-bold ${activeTab === 'status' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50' : 'text-slate-400'}`}
        >
          🍗 状态喂养
        </button>
        <button
          onClick={() => setActiveTab('train')}
          className={`py-1 rounded text-center font-bold ${activeTab === 'train' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50' : 'text-slate-400'}`}
        >
          🎯 特训 ({trainLeft}/{trainLimits.soft})
        </button>
        <button
          onClick={() => setActiveTab('chips')}
          className={`py-1 rounded text-center font-bold ${activeTab === 'chips' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50' : 'text-slate-400'}`}
        >
          💾 战术芯片
        </button>
        <button
          onClick={() => setActiveTab('maps')}
          className={`py-1 rounded text-center font-bold ${activeTab === 'maps' ? 'bg-green-500/20 text-green-300 border border-green-500/50' : 'text-slate-400'}`}
        >
          🛰️ 荒原探索
        </button>
      </div>

      {/* Tab 1: Status & Feed */}
      {activeTab === 'status' && (
        <div className="flex-1 flex flex-col justify-between space-y-2 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="col-span-2">
              <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                <span>升级经验 (EXP)</span>
                <span>{formatNumber(pet.exp)} / {formatNumber(pet.maxExp)}</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${Math.min(100, (pet.exp / pet.maxExp) * 100)}%` }} />
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5">
                {nextStageLevel > 0
                  ? `下一形态 Lv.${nextStageLevel}（曲线每级 maxExp×1.5），还差 ${formatNumber(expToReach(nextStageLevel))} 经验`
                  : '已达最终形态 Lv.12+'}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[10px] text-orange-400 mb-0.5">
                <span className="flex items-center gap-1"><Utensils size={10} /> 饱食度</span>
                <span>{pet.hunger}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500" style={{ width: `${pet.hunger}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[10px] text-yellow-400 mb-0.5">
                <span className="flex items-center gap-1"><Battery size={10} /> 电量</span>
                <span>{pet.energy}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-yellow-500" style={{ width: `${pet.energy}%` }} />
              </div>
            </div>
          </div>

          {/* 喂养 → 探险收益 的因果链，hunger/happiness 现在真的有消费点 */}
          <div className="p-2 rounded-xl bg-slate-900/60 border border-cyan-500/30 text-[9px] space-y-0.5">
            <div className="text-cyan-300 font-bold text-[10px]">🔗 饱食 / 心情的真实用途</div>
            <div className="text-slate-400">
              探险奖励系数（心情）= 0.5 + (饱食+心情)/200 × 0.7 = <span className="text-green-400 font-bold">{mood.toFixed(3)}</span>（区间 0.500~1.200）
            </div>
            <div className="text-slate-500">
              任一状态 +10 → 系数 +0.035；两项各 +10 → +0.070（即奖励 +7%）。满状态相对空状态是 <span className="text-yellow-400">×2.4</span> 收益。
            </div>
            <div className="text-slate-500">
              自然衰减：每秒 -1 点概率 <span className="text-pink-400">{(decayChance * 100).toFixed(1)}%</span>（≈每 {Math.round(1 / decayChance)} 秒掉 1 点）{hasArmor ? ' · 装甲芯片已减半' : ' · 未装纳米装甲'}{petSynergy ? ' · 萌宠羁绊再减半' : ''}
            </div>
            <div className="text-slate-500">探险归来固定回 {EXPLORE_RETURN_ENERGY} 点电量，摸头 +2 经验。</div>
          </div>

          <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="text-[11px] font-bold text-slate-300 mb-1.5">🍗 喂食补给</div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => feedPet('oil')} disabled={state.credits < 20} className="p-2 rounded-lg bg-slate-800 hover:bg-cyan-950 border border-slate-700 text-center disabled:opacity-40">
                <div className="text-xl">🛢️</div>
                <div className="font-bold text-[10px] text-slate-200 mt-0.5">机油可乐</div>
                <div className="text-[9px] text-cyan-400">₵20 (饱食+30 心情+10)</div>
                <div className="text-[8px] text-green-400">→ 系数 +{oilMoodGain.toFixed(3)}</div>
              </button>
              <button onClick={() => feedPet('battery')} disabled={state.credits < 50} className="p-2 rounded-lg bg-slate-800 hover:bg-cyan-950 border border-slate-700 text-center disabled:opacity-40">
                <div className="text-xl">🔋</div>
                <div className="font-bold text-[10px] text-slate-200 mt-0.5">高能电池</div>
                <div className="text-[9px] text-yellow-400">₵50 (电量+40 心情+15)</div>
                <div className="text-[8px] text-green-400">→ 系数 +{batteryMoodGain.toFixed(3)} + 续航</div>
              </button>
              <button onClick={() => feedPet('ram')} disabled={state.credits < 150} className="p-2 rounded-lg bg-slate-800 hover:bg-cyan-950 border border-slate-700 text-center disabled:opacity-40">
                <div className="text-xl">💾</div>
                <div className="font-bold text-[10px] text-slate-200 mt-0.5">DDR7内存</div>
                <div className="text-[9px] text-pink-400">₵150 (经验+60 饱食+20 心情+25)</div>
                <div className="text-[8px] text-green-400">→ 系数 +{ramMoodGain.toFixed(3)}</div>
              </button>
            </div>
            <div className="text-[8px] text-slate-500 mt-1">
              注：₵20 机油不是纯烧钱 —— 它把 30s 探险的奖励区间从 {formatCredits(rewardRangeOf(30, pet.stage, mood)[0])}~{formatCredits(rewardRangeOf(30, pet.stage, mood)[1])} 抬到 {formatCredits(rewardRangeOf(30, pet.stage, moodAfter(30, 10))[0])}~{formatCredits(rewardRangeOf(30, pet.stage, moodAfter(30, 10))[1])}（已按 100 上限实算）。
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Mini-Game Training */}
      {activeTab === 'train' && (
        <div className="flex-1 flex flex-col justify-between p-2">
          {!isTraining ? (
            <div className="space-y-3 text-center my-auto">
              <div className="text-3xl">🎯</div>
              <div className="font-bold text-yellow-300 text-sm">机甲飞盘敏捷特训</div>
              <div className="text-slate-400 text-[10px]">
                在 {TRAIN_SECONDS} 秒内连续快速点击飞盘，每命中 1 次经验 +{HIT_EXP} 点（无赛博币产出）。
              </div>
              <div className="text-[10px] p-1.5 rounded-lg bg-slate-900/70 border border-slate-800 text-slate-300">
                今日剩余 <span className={trainLeft > 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>{trainLeft}</span>/{trainLimits.soft} 次
                （超过 {trainLimits.soft} 次后经验直接为 <span className="text-red-400">{Math.round(dailyDecay(trainLimits.soft, trainLimits) * 100)}%</span>，即不再给经验）
              </div>
              <button
                onClick={startTrainingGame}
                disabled={trainLeft <= 0}
                className="px-6 py-2 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 text-slate-950 font-black text-xs shadow-neon-gold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {trainLeft > 0 ? `开始 ${TRAIN_SECONDS}秒 特训` : '今日特训次数已用尽'}
              </button>
              <div className="text-[9px] text-slate-500 leading-tight">
                经验曲线：每级 maxExp×1.5。按每次特训 {ASSUMED_HITS_PER_SESSION} 命中估算，剩余次数最多再带来 {formatNumber(dailyTrainExp)} 经验
                {nextStageLevel > 0 ? ` → 升至 Lv.${nextStageLevel} 还需 ${formatNumber(expToReach(nextStageLevel))} 经验（约 ${Math.max(1, Math.ceil(expToReach(nextStageLevel) / Math.max(1, dailyTrainExp)))} 天）。` : '。'}
              </div>
            </div>
          ) : (
            <div className="flex-1 relative bg-slate-950 rounded-xl border border-yellow-500/40 overflow-hidden">
              <div className="absolute top-2 left-2 text-yellow-400 font-bold text-xs">倒计时: {timeLeft}s | 命中: {trainScore} | 经验 +{trainScore * HIT_EXP}</div>
              <div
                onClick={hitTarget}
                style={{ top: `${trainTargetPos.top}%`, left: `${trainTargetPos.left}%` }}
                className="absolute w-12 h-12 rounded-full bg-gradient-to-tr from-yellow-400 to-pink-500 flex items-center justify-center text-xl cursor-pointer shadow-neon-gold animate-bounce"
              >
                🦴
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Chips */}
      {activeTab === 'chips' && (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <div className="text-[10px] text-slate-400 mb-1">装配战术神经芯片，赋予机甲修狗被动效果（永久生效）：</div>
          {CHIP_DEFS.map((chip) => {
            const installed = state.petChips.includes(chip.id);
            return (
              <div key={chip.id} className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${installed ? 'bg-purple-950/40 border-purple-400 shadow-neon-pink' : 'bg-slate-900 border-slate-800'}`}>
                <div className="flex items-center gap-2">
                  <Cpu size={22} className={installed ? 'text-purple-400' : 'text-slate-500'} />
                  <div>
                    <div className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                      <span>{chip.name}</span>
                      <span className="text-[9px] text-yellow-400">+{chip.power} 战力</span>
                      {installed && <span className="text-[9px] text-green-400">生效中</span>}
                    </div>
                    <div className="text-[9px] text-slate-400">{chip.desc}</div>
                    <div className="text-[8px] text-slate-500">
                      {chip.slot === 'brain' && `结算倍率 ×1.25（当前总倍率 ×${claimBonus.toFixed(2)}）`}
                      {chip.slot === 'armor' && `衰减概率 ${(decayChanceOf(false, petSynergy) * 100).toFixed(1)}% → ${(decayChanceOf(true, petSynergy) * 100).toFixed(1)}% /秒`}
                      {chip.slot === 'engine' && `30/60/120 秒 → ${Math.round(30 * 0.7)}/${Math.round(60 * 0.7)}/${Math.round(120 * 0.7)} 秒，奖励按标称时长算`}
                    </div>
                  </div>
                </div>

                {!installed ? (
                  <button
                    onClick={() => buyAndInstallChip(chip)}
                    disabled={state.credits < chip.cost}
                    className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-[10px] shrink-0 disabled:opacity-40"
                  >
                    ${chip.cost} 装配
                  </button>
                ) : (
                  <span className="text-[10px] text-green-400 font-bold shrink-0">已装载</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 4: Exploration */}
      {activeTab === 'maps' && (
        <div className="flex-1 flex flex-col justify-between p-1 space-y-2 overflow-y-auto">
          <div className="text-[9px] p-1.5 rounded-lg bg-slate-900/70 border border-slate-800 text-slate-400">
            出发瞬间按「标称时长 × 心情」锁定奖励（刷新也不会重 roll）。当前心情系数 <span className="text-green-400 font-bold">{mood.toFixed(3)}</span>
            （饱食 {pet.hunger} / 心情 {pet.happiness}）· 今日已探 {exploreUsed}/{exploreLimits.soft} 次，超出后奖励 {Math.round(exploreScale * 100)}%
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {TRIP_DEFS.map((trip) => {
              const [rMin, rMax] = rewardRangeOf(trip.duration, pet.stage, mood);
              const [eMin, eMax] = expRangeOf(trip.duration, pet.stage, mood);
              const cost = energyCostOf(trip.duration);
              const realSec = hasEngine ? Math.max(1, Math.round(trip.duration * 0.7)) : trip.duration;
              return (
                <button
                  key={trip.duration}
                  onClick={() => startPetExplore(trip.duration)}
                  disabled={pet.isExploring || pet.energy < cost}
                  className="p-2 rounded-lg bg-slate-900 hover:bg-green-950 border border-slate-800 hover:border-green-400 text-left disabled:opacity-40"
                >
                  <div className={`font-bold text-[10px] ${trip.tone}`}>{trip.name}</div>
                  <div className="text-[9px] text-slate-400">{trip.duration}s{hasEngine ? ` → ${realSec}s` : ''} / 电量 {cost}</div>
                  <div className="text-[9px] text-green-400">{formatCredits(rMin)}~{formatCredits(rMax)}</div>
                  <div className="text-[9px] text-cyan-400">经验 {formatNumber(eMin)}~{formatNumber(eMax)}</div>
                  <div className="text-[8px] text-slate-500">掉落 {(Math.min(0.95, (petSynergy ? 0.7 : 0.45) + dropBoostOf(trip.duration)) * 100).toFixed(0)}% · {trip.hint}</div>
                </button>
              );
            })}
          </div>

          {pet.isExploring && (
            <div className="p-2 rounded-lg bg-slate-900 border border-yellow-500/40 text-center space-y-1">
              {isExploreReady ? (
                <button
                  onClick={claimPetExplore}
                  className="w-full py-2 rounded-lg bg-green-500 text-slate-950 font-black text-xs shadow-neon-green animate-bounce"
                >
                  🎉 探险完成！点击领取战利品（≈{formatCredits(Math.round(pet.exploreRewardBase * claimBonus * exploreScale))}）
                </button>
              ) : (
                <div className="text-yellow-400 text-[11px] font-bold">
                  🛰️ 探险搜寻中... 剩余 {exploreLeft > 0 ? exploreLeft : pet.exploreRemaining} 秒
                  {exploreLeft <= 0 && pet.exploreEndAt <= 0 && (
                    <span className="text-[9px] text-red-400 block">旧存档缺少探险时间戳，请重新出发一次</span>
                  )}
                </div>
              )}
              <div className="text-[9px] text-slate-400">
                已锁定：赛博币基数 {formatCredits(pet.exploreRewardBase)} · 经验基数 {formatNumber(pet.exploreExpBase)} · 掉落概率 {(dropChance * 100).toFixed(0)}%（基础 {(petSynergy ? 70 : 45)}% + 加成 {(pet.exploreDropBoost * 100).toFixed(0)}%）
              </div>
              <div className="text-[9px] text-slate-500">
                结算 = 基数 × 芯片/羁绊 ×{claimBonus.toFixed(2)} × 今日递减 {Math.round(exploreScale * 100)}%，归来回 {EXPLORE_RETURN_ENERGY} 电量
              </div>
            </div>
          )}

          {exploreUsed >= exploreLimits.soft && (
            <div className="p-1.5 rounded-lg bg-red-950/40 border border-red-500/40 text-[9px] text-red-300">
              今日已探 {exploreUsed} 次，超过 {exploreLimits.soft} 次的部分只给 {Math.round(exploreLimits.tail * 100)}% 奖励（仍可出发，但电量明显不划算）。
            </div>
          )}

          <div className="h-16 shrink-0 overflow-y-auto bg-slate-950 rounded-lg p-1.5 border border-slate-800 text-[9px] text-slate-400 space-y-1">
            {pet.exploreLogs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
