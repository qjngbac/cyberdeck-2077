import React, { useState, useEffect, useRef } from 'react';
import { Anchor } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';
import confetti from 'canvas-confetti';
import { InventoryItem } from '../../types';
import { GACHA_POOL, DAILY_LIMITS, dailyDecay, formatCredits, formatNumber } from '../../utils/gameLogic';

type FishRarity = 'junk' | 'common' | 'rare' | 'epic' | 'legendary';

interface FishDef {
  name: string;
  icon: string;
  rarity: FishRarity;
  credits: number;
  merit: number;
  weight: number; // relative probability
  desc: string;
}

const FISH_TABLE: FishDef[] = [
  { name: '破损机械靴', icon: '🥾', rarity: 'junk', credits: 5, merit: 2, weight: 15, desc: '赛博下水道的常客，硬得像周五的需求' },
  { name: '霓虹沙丁鱼', icon: '🐟', rarity: 'common', credits: 40, merit: 10, weight: 25, desc: '夜之城运河标配，鱼罐头厂的最爱' },
  { name: '荧光磷虾', icon: '🦐', rarity: 'common', credits: 60, merit: 15, weight: 20, desc: '夜里会发光，拌面一绝' },
  { name: '电子章鱼', icon: '🐙', rarity: 'rare', credits: 150, merit: 40, weight: 15, desc: '八条触手同时编译代码的奇行种' },
  { name: '量子鱿鱼', icon: '🦑', rarity: 'rare', credits: 220, merit: 60, weight: 11, desc: '在被观测前处于熟与不熟的叠加态' },
  { name: '霓虹巨齿鲨', icon: '🦈', rarity: 'epic', credits: 600, merit: 150, weight: 8, desc: '义体化深海霸主，牙口很好' },
  { name: '深空鲸落', icon: '🐳', rarity: 'epic', credits: 900, merit: 200, weight: 4, desc: '一鲸落，万物生，功德滚滚来' },
  { name: '赛博锦鲤王', icon: '🐠', rarity: 'legendary', credits: 2500, merit: 500, weight: 2, desc: '传说中转发的它的人都升职加薪了' },
];

const RARITY_STYLE: Record<FishRarity, { label: string; text: string; border: string }> = {
  junk: { label: '垃圾', text: 'text-slate-400', border: 'border-slate-600' },
  common: { label: '普通', text: 'text-green-400', border: 'border-green-500/50' },
  rare: { label: '稀有', text: 'text-cyan-300', border: 'border-cyan-400/60' },
  epic: { label: '史诗', text: 'text-purple-300', border: 'border-purple-400/70' },
  legendary: { label: '传说', text: 'text-yellow-300', border: 'border-yellow-400' },
};

const BAIT_COST = 20;
/** 抛竿后必须在这个秒数内收竿，否则自动失手——否则鱼饵已扣却永不结算，RAF 也一直空转。 */
const CAST_TIMEOUT = 4.5;

const TOTAL_WEIGHT = FISH_TABLE.reduce((acc, f) => acc + f.weight, 0);
/** 命中鱼讯区后单尾的期望收益（不含法宝掉落）。 */
const EXPECTED_CREDITS = FISH_TABLE.reduce((acc, f) => acc + f.credits * f.weight, 0) / TOTAL_WEIGHT;
/** 垃圾档内部期望：单尾收益低于鱼饵成本，UI 要如实标注。 */
const JUNK_EXPECTED = (() => {
  const junk = FISH_TABLE.filter((f) => f.rarity === 'junk');
  const w = junk.reduce((acc, f) => acc + f.weight, 0);
  return w > 0 ? junk.reduce((acc, f) => acc + f.credits * f.weight, 0) / w : 0;
})();

/** 收竿判定与画面指示共用同一条曲线，保证「看到在区内」就等于「判在区内」。 */
const posAt = (elapsed: number) => {
  const speed = 3.2 + Math.min(2.5, elapsed * 0.25);
  return (Math.sin(elapsed * speed * Math.PI) + 1) / 2;
};

const fishChance = (f: FishDef) => (f.weight / TOTAL_WEIGHT) * 100;

interface CatchLog {
  id: number;
  icon: string;
  name: string;
  rarity: FishRarity;
  credits: number;
  merit: number;
  decayed: boolean;
}

export const FishingApp: React.FC = () => {
  const { state, addCredits, recordCatch, addInventoryItem, notify, activeWindowId } = useGame();

  // 'idle' → waiting; 'casting' → reeling minigame running
  const [phase, setPhase] = useState<'idle' | 'casting'>('idle');
  const [pos, setPos] = useState(0.5); // indicator position 0..1
  const [zone, setZone] = useState({ start: 0.4, width: 0.2 });
  const [logs, setLogs] = useState<CatchLog[]>([]);
  const [lastMsg, setLastMsg] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(Math.ceil(CAST_TIMEOUT));
  const [panel, setPanel] = useState<'log' | 'odds'>('log');

  // 今日渔获 lives in the global save (auto-resets each day)
  const todayCount = state.fishing.count;
  const todayEarned = state.fishing.earned;
  const fishLimits = DAILY_LIMITS.fish;
  // 结算递减在核心层，这里只做展示，用同一个 dailyDecay 以免文案与实际不符
  const nowScale = dailyDecay(todayCount, fishLimits);

  const rafRef = useRef<number>(0);
  const castAtRef = useRef<number>(0);
  // RAF 每帧写入的实时位置——判定必须读它，而不是可能滞后一帧的 state
  const posRef = useRef(0.5);
  // 一次抛竿只允许结算一次（超时与点击收竿可能落在同一帧）
  const lineActiveRef = useRef(false);

  // Oscillating indicator while casting
  useEffect(() => {
    if (phase !== 'casting') return;
    castAtRef.current = performance.now();
    const loop = (t: number) => {
      const elapsed = (t - castAtRef.current) / 1000;
      const next = posAt(elapsed);
      posRef.current = next;
      setPos(next);
      if (elapsed >= CAST_TIMEOUT) {
        // 超时自动失手并回到 idle，RAF 随之停转；同一帧里已经收竿过就不能再覆盖结算文案
        if (lineActiveRef.current) {
          lineActiveRef.current = false;
          setPhase('idle');
          setLastMsg(`⏳ ${CAST_TIMEOUT} 秒内没有收竿，鱼拖着量子鱼饵游走了……这次算空军！`);
          SoundFX.playAlert();
        }
        return;
      }
      setTimeLeft(Math.ceil(CAST_TIMEOUT - elapsed));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  const rollFish = (): FishDef => {
    let roll = Math.random() * TOTAL_WEIGHT;
    for (const f of FISH_TABLE) {
      roll -= f.weight;
      if (roll <= 0) return f;
    }
    return FISH_TABLE[0];
  };

  const startCast = () => {
    if (lineActiveRef.current) return;
    const paid = addCredits(-BAIT_COST);
    if (paid !== -BAIT_COST) {
      // 余额被钳在 0：退回实付的差额，不进入收竿小游戏
      if (paid < 0) addCredits(-paid);
      SoundFX.playAlert();
      notify({ title: '赛博币不足', body: `购买量子鱼饵需要 ${formatCredits(BAIT_COST)}！`, icon: '⚠️', tone: 'error' });
      return;
    }
    SoundFX.playKeyClick();
    // Random strike zone, slightly generous
    const width = 0.16 + Math.random() * 0.08;
    setZone({ start: 0.1 + Math.random() * (0.8 - width), width });
    setLastMsg(null);
    setPos(0.5);
    posRef.current = 0.5;
    setTimeLeft(Math.ceil(CAST_TIMEOUT));
    lineActiveRef.current = true;
    setPhase('casting');
  };

  const reelIn = () => {
    if (!lineActiveRef.current) return;
    lineActiveRef.current = false;
    setPhase('idle');

    const inZone = posRef.current >= zone.start && posRef.current <= zone.start + zone.width;
    if (!inZone) {
      SoundFX.playAlert();
      setLastMsg('💨 鱼跑了……量子鱼饵白买了，再试一次！');
      return;
    }

    const fish = rollFish();
    const style = RARITY_STYLE[fish.rarity];
    const scale = dailyDecay(todayCount, fishLimits);
    const netCredits = Math.max(0, Math.round(fish.credits * scale));
    const netMerit = Math.max(0, Math.round(fish.merit * scale));
    recordCatch(fish.credits, fish.merit);
    setLogs((prev) => [
      { id: Date.now(), icon: fish.icon, name: fish.name, rarity: fish.rarity, credits: netCredits, merit: netMerit, decayed: scale < 1 },
      ...prev.slice(0, 7),
    ]);

    if (fish.rarity === 'legendary' || fish.rarity === 'epic') {
      SoundFX.playLevelUp();
      confetti({ particleCount: fish.rarity === 'legendary' ? 110 : 60, spread: fish.rarity === 'legendary' ? 100 : 70 });
    } else if (fish.rarity === 'junk') {
      SoundFX.playWoodenFish(0.7);
    } else {
      SoundFX.playCash();
    }

    const decayNote = scale < 1 ? `（今日超过 ${fishLimits.soft} 尾，已降为 ${Math.round(scale * 100)}%）` : '';

    // The legendary Koi King also carries a random treasure into your inventory
    if (fish.rarity === 'legendary') {
      const treasure = GACHA_POOL[Math.floor(Math.random() * GACHA_POOL.length)];
      const invItem: InventoryItem = {
        id: `item_${treasure.name}`,
        name: treasure.name,
        icon: treasure.icon,
        desc: treasure.desc,
        rarity: treasure.rarity,
        count: 1,
      };
      addInventoryItem(invItem);
      // Also reward Gacha Ticket!
      addInventoryItem({
        id: `item-ticket-${Date.now()}`,
        name: '赛博扭蛋抽奖券',
        icon: '🎫',
        desc: '钓上锦鲤王附赠的至尊扭蛋券！可在盲盒扭蛋机中免费抽取 1 次珍稀藏品',
        rarity: 'epic',
        count: 2,
      });
      setLastMsg(`🏆 【${style.label}】钓上了传说赛博锦鲤王！+${formatCredits(netCredits)}、功德 +${netMerit}，夹带法宝【${treasure.name}】与【扭蛋券×2】入包！${decayNote}`);
    } else {
      // Cross-app synergy drops: 量子探针 or 赛博扭蛋抽奖券
      if (fish.rarity === 'epic' || (fish.rarity === 'rare' && Math.random() < 0.35)) {
        if (Math.random() < 0.5) {
          addInventoryItem({
            id: `item-probe-${Date.now()}`,
            name: '量子探针',
            icon: '🔮',
            desc: '钓鱼码头捞起的深海量子探针！在赛博量子扫雷中可直接透视并标记 1 颗地雷',
            rarity: 'rare',
            count: 1,
          });
          setLastMsg(`${fish.icon} 【${style.label}】钓上了${fish.name}！+${formatCredits(netCredits)}、功德 +${netMerit}，并打捞出【量子探针】x1！${decayNote}`);
        } else {
          addInventoryItem({
            id: `item-ticket-${Date.now()}`,
            name: '赛博扭蛋抽奖券',
            icon: '🎫',
            desc: '钓鱼码头捞起的防水扭蛋券！可在盲盒扭蛋机中免费抽取 1 次珍稀藏品',
            rarity: 'epic',
            count: 1,
          });
          setLastMsg(`${fish.icon} 【${style.label}】钓上了${fish.name}！+${formatCredits(netCredits)}、功德 +${netMerit}，并打捞出【赛博扭蛋抽奖券】x1！${decayNote}`);
        }
      } else {
        setLastMsg(`${fish.icon} 【${style.label}】钓上了${fish.name}！+${formatCredits(netCredits)}、功德 +${netMerit}${decayNote}`);
      }
    }
  };

  // 空格键抛竿 / 收竿：处理函数存进 ref，避免小游戏每帧重新订阅监听器
  const actionRef = useRef({ cast: startCast, reel: reelIn });
  useEffect(() => {
    actionRef.current = { cast: startCast, reel: reelIn };
  });

  useEffect(() => {
    if (activeWindowId !== 'fishing') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      // 焦点落在按钮/输入框时交给原生空格激活，否则一次按键会触发两个动作
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (lineActiveRef.current) actionRef.current.reel();
      else actionRef.current.cast();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeWindowId]);

  return (
    <div className="flex flex-col h-full space-y-2.5 font-mono text-xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30">
        <div className="flex items-center gap-2">
          <Anchor size={18} className="text-cyan-400" />
          <div>
            <div className="font-bold text-sm text-cyan-300">赛博钓鱼码头 · 夜之城运河</div>
            <div className="text-[10px] text-slate-400">
              今日第 {todayCount + 1} 尾 · 已入账 {formatCredits(todayEarned)} | 鱼饵 {formatCredits(BAIT_COST)}/次
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-yellow-400 font-bold">{formatCredits(state.credits)}</div>
          <div className="text-[9px] text-slate-500">当前赛博币</div>
        </div>
      </div>

      {/* Daily diminishing-return notice (rules settled in the state layer) */}
      <div className={`px-2 py-1 rounded-lg border text-[10px] leading-relaxed ${
        nowScale < 1 ? 'bg-red-950/50 border-red-500/50 text-red-200' : 'bg-slate-900/70 border-slate-800 text-slate-300'
      }`}>
        收益规则：当日前 {fishLimits.soft} 尾全额入账，第 {fishLimits.soft + 1} 尾起降为 {Math.round(fishLimits.tail * 100)}%
        {todayCount >= fishLimits.soft ? '（你已超过上限，现在每尾只有一成）' : `（今日还剩 ${fishLimits.soft - todayCount} 尾全额）`}
        。抛竿后 {CAST_TIMEOUT} 秒内未收竿自动算失手。
      </div>

      {/* Reeling Minigame */}
      <div className="flex-1 flex flex-col items-center justify-center p-3 rounded-xl bg-gradient-to-b from-slate-950 to-cyan-950/40 border border-cyan-500/30 relative overflow-hidden">
        {/* Decorative water */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-cyan-900/40 to-transparent pointer-events-none" />

        {phase === 'idle' ? (
          <div className="text-center space-y-3 relative z-10">
            <div className={`text-6xl ${lastMsg ? '' : 'animate-bounce'}`}>🎣</div>
            <div className="text-[11px] text-slate-300 max-w-[260px]">
              点击【抛竿】消耗 {formatCredits(BAIT_COST)}，在滑块进入<span className="text-green-400 font-bold">绿色鱼讯区</span>时收竿（空格键同）。
              命中后单尾期望 <span className="text-yellow-300 font-bold">{formatCredits(EXPECTED_CREDITS)}</span>，其中
              <span className="text-slate-400"> 垃圾档期望 {formatCredits(JUNK_EXPECTED)} 低于鱼饵成本</span>。
            </div>
            {lastMsg && (
              <div className="mx-auto max-w-[280px] p-1.5 rounded bg-slate-900/80 border border-cyan-500/40 text-[10px] text-cyan-200 leading-relaxed">
                {lastMsg}
              </div>
            )}
            <button
              onClick={startCast}
              disabled={state.credits < BAIT_COST}
              className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:brightness-110 disabled:opacity-40 text-slate-950 font-black text-sm shadow-neon-cyan transition-all"
            >
              🎣 抛竿 (-{formatCredits(BAIT_COST)})
            </button>
          </div>
        ) : (
          <div className="w-full max-w-[280px] relative z-10">
            <div className="text-center text-[11px] text-yellow-300 font-bold mb-2 animate-pulse">
              🌊 鱼儿咬钩了！{timeLeft} 秒内看准时机收竿！
            </div>

            {/* The bar */}
            <div className="relative h-14 rounded-xl bg-slate-950 border-2 border-cyan-500/50 overflow-hidden shadow-neon-cyan">
              {/* Strike zone */}
              <div
                className="absolute top-0 bottom-0 bg-green-500/35 border-x-2 border-green-400"
                style={{ left: `${zone.start * 100}%`, width: `${zone.width * 100}%` }}
              />
              {/* Moving indicator */}
              <div
                className="absolute top-1 bottom-1 w-2 rounded bg-gradient-to-b from-yellow-300 to-pink-500 shadow-neon-gold"
                style={{ left: `calc(${pos * 100}% - 4px)` }}
              />
            </div>

            <button
              onClick={reelIn}
              className="w-full mt-3 py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 hover:brightness-110 text-slate-950 font-black text-base shadow-neon-gold active:scale-95 transition-transform"
            >
              ⚡ 收竿！(REEL / 空格)
            </button>
          </div>
        )}
      </div>

      {/* Bottom panel: session log & published odds */}
      <div className="shrink-0">
        <div className="flex items-center gap-1 mb-1">
          <button
            onClick={() => setPanel('log')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
              panel === 'log' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50' : 'text-slate-500 border-slate-800 hover:text-slate-300'
            }`}
          >
            本局渔获日志
          </button>
          <button
            onClick={() => setPanel('odds')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
              panel === 'odds' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' : 'text-slate-500 border-slate-800 hover:text-slate-300'
            }`}
          >
            鱼讯赔率公示
          </button>
        </div>

        <div className="h-24 overflow-y-auto bg-slate-950/80 rounded-lg p-2 border border-slate-800 space-y-1">
          {panel === 'log' ? (
            logs.length === 0 ? (
              <div className="text-slate-500 text-[10px] text-center py-4">渔获日志空空如也，去钓上第一条霓虹沙丁鱼吧！（关窗即清空）</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between text-[10px]">
                  <span className="flex items-center gap-1.5">
                    <span className="text-base">{log.icon}</span>
                    <span className={RARITY_STYLE[log.rarity].text}>
                      [{RARITY_STYLE[log.rarity].label}] {log.name}
                    </span>
                  </span>
                  <span className="text-yellow-400 font-bold">
                    +{formatCredits(log.credits)} · 功德+{log.merit}
                    {log.decayed ? <span className="text-red-400 font-normal">（递减）</span> : null}
                  </span>
                </div>
              ))
            )
          ) : (
            <>
              {FISH_TABLE.map((f) => (
                <div key={f.name} className="flex items-center justify-between text-[10px]">
                  <span className="flex items-center gap-1.5">
                    <span className="text-base">{f.icon}</span>
                    <span className={RARITY_STYLE[f.rarity].text}>[{RARITY_STYLE[f.rarity].label}] {f.name}</span>
                  </span>
                  <span className="text-slate-300">
                    {fishChance(f).toFixed(1)}% · {formatCredits(f.credits)} · 功德{formatNumber(f.merit)}
                    {f.credits < BAIT_COST ? <span className="text-red-400">（低于鱼饵）</span> : null}
                  </span>
                </div>
              ))}
              <div className="text-[9px] text-slate-500 pt-1 border-t border-slate-800">
                概率 = 权重 {TOTAL_WEIGHT} 分制；期望收益 {formatCredits(EXPECTED_CREDITS)}/尾，
                超过当日 {fishLimits.soft} 尾后降为 {formatCredits(EXPECTED_CREDITS * fishLimits.tail)}/尾。
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
