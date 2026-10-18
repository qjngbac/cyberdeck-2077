import React, { useState } from 'react';
import { Sparkles, Ticket, Lock } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';
import {
  GACHA_ITEMS,
  GACHA_SERIES_INFO,
  GachaSeriesId,
  GachaCollectionItem,
  GACHA_COST_CREDITS,
  GACHA_TEN_PULL_COST,
  GACHA_PITY_UR,
  GACHA_PITY_SSR,
  GACHA_RATES,
  getGachaDupeRefund,
} from '../../utils/gameLogic';
import type { GachaPullOutcome } from '../../utils/gameLogic';
import confetti from 'canvas-confetti';

export const GachaApp: React.FC = () => {
  const { state, rollGacha, showAlert } = useGame();
  const [activeTab, setActiveTab] = useState<GachaSeriesId>('god');
  const [isPulling, setIsPulling] = useState(false);
  const [pulledItems, setPulledItems] = useState<GachaPullOutcome[] | null>(null);

  const unlockedIds = new Set(state.gachaUnlockedIds || []);
  const ticketItem = state.inventory.find((i) => i.name === '赛博扭蛋抽奖券' && i.count > 0);
  const ticketCount = ticketItem?.count || 0;
  const pity = {
    sinceSSR: state.gachaPity?.sinceSSR ?? 0,
    sinceUR: state.gachaPity?.sinceUR ?? 0,
  };

  // Execute a gacha pull — rates, pity and duplicate refunds are resolved atomically
  // by the state layer, the UI only spends what it can afford.
  const handlePull = (count: 1 | 10) => {
    if (isPulling) return;
    const cost = count === 1 ? GACHA_COST_CREDITS : GACHA_TEN_PULL_COST;
    const canUseTickets = ticketCount >= count;

    if (!canUseTickets && state.credits < cost) {
      showAlert(`赛博币不足！抽取 ${count} 次需要 ₵${cost.toLocaleString()} 赛博币或 ${count} 张【赛博扭蛋抽奖券】。`, '抽奖余额不足', '🎫', 'red');
      return;
    }

    SoundFX.playKeyClick();
    setIsPulling(true);
    setPulledItems(null);

    setTimeout(() => {
      const outcome = rollGacha(count, canUseTickets ? ticketCount : 0);
      if (!outcome) {
        setIsPulling(false);
        return;
      }

      const results = outcome.pulls;
      setPulledItems(results);
      setIsPulling(false);

      const refunded = results.reduce((acc, r) => acc + r.refund, 0);
      const hasURorSSR = results.some((r) => r.item.rarity === 'UR' || r.item.rarity === 'SSR');
      if (hasURorSSR) {
        SoundFX.playLevelUp();
        confetti({
          particleCount: 120,
          spread: 100,
          origin: { x: 0.5, y: 0.5 },
          colors: ['#ffd700', '#00f0ff', '#ff0055', '#a855f7'],
        });
      } else {
        SoundFX.playCash();
      }
      if (refunded > 0) {
        showAlert(`本次重复藏品已折算 ₵${refunded.toLocaleString()} 赛博币返还。`, '重复藏品回收', '♻️', 'green');
      }
    }, 900);
  };

  const getRarityBadge = (r: GachaCollectionItem['rarity']) => {
    switch (r) {
      case 'UR':
        return 'bg-gradient-to-r from-amber-500 to-yellow-300 text-slate-950 font-black shadow-neon-gold border border-yellow-300';
      case 'SSR':
        return 'bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black shadow-neon-pink border border-pink-400';
      case 'SR':
        return 'bg-cyan-600 text-slate-950 font-bold border border-cyan-400';
      default:
        return 'bg-slate-700 text-slate-300 font-semibold border border-slate-600';
    }
  };

  const seriesItems = GACHA_ITEMS.filter((i) => i.series === activeTab);
  const seriesUnlockedCount = seriesItems.filter((i) => unlockedIds.has(i.id)).length;
  const isSeriesComplete = seriesUnlockedCount === seriesItems.length;

  return (
    <div className="flex flex-col h-full bg-slate-950/95 text-slate-200 font-mono select-none overflow-y-auto p-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="text-xl">🎁</div>
          <div>
            <div className="text-xs font-black text-pink-400 tracking-wider flex items-center gap-1.5">
              <span>CYBER_GACHA_VAULT</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-950 border border-pink-500/40 text-pink-300">
                2077 限定
              </span>
            </div>
            <div className="text-[10px] text-slate-400">开启赛博盲盒扭蛋 · 解锁全套专属被动羁绊</div>
          </div>
        </div>

        {/* Tickets and Credits Info */}
        <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1 rounded-lg border border-slate-800 text-xs">
          <div className="flex items-center gap-1 text-pink-300 font-bold">
            <Ticket size={13} className="text-pink-400" />
            <span>抽奖券: {ticketCount}</span>
          </div>
          <div className="border-l border-slate-700 pl-2 text-cyan-300 font-bold">
            💰 ${state.credits.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Pull Buttons Area */}
      <div className="p-3 my-2 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-900/90 to-pink-950/40 border border-purple-500/40 shadow-lg flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="space-y-0.5">
          <div className="text-xs font-black text-pink-300 flex items-center gap-1.5">
            <Sparkles size={14} className="text-yellow-400 animate-pulse" />
            <span>夜之城限定全息扭蛋仓</span>
          </div>
          <div className="text-[10px] text-slate-400">
            单抽 ₵{GACHA_COST_CREDITS.toLocaleString()} / 十连 ₵{GACHA_TEN_PULL_COST.toLocaleString()}（优先消耗抽奖券）；重复藏品自动折算返还。
          </div>
          <div className="text-[9px] text-slate-500 flex flex-wrap gap-x-2 gap-y-0.5">
            {GACHA_RATES.map((r) => (
              <span key={r.rarity}>
                {r.rarity} {(r.p * 100).toFixed(0)}%
              </span>
            ))}
            <span className="text-cyan-400">
              保底：{Math.max(0, GACHA_PITY_SSR - pity.sinceSSR)} 抽内必出 SSR+，{Math.max(0, GACHA_PITY_UR - pity.sinceUR)} 抽内必出 UR
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePull(1)}
            disabled={isPulling || (ticketCount < 1 && state.credits < GACHA_COST_CREDITS)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:brightness-110 active:scale-95 disabled:opacity-50 text-white font-black text-xs shadow-neon-pink cursor-pointer transition-all"
          >
            {isPulling ? '开启中…' : ticketCount >= 1 ? '🎫 券单抽' : `🪙 ₵${GACHA_COST_CREDITS.toLocaleString()} 单抽`}
          </button>
          <button
            onClick={() => handlePull(10)}
            disabled={isPulling || (ticketCount < 10 && state.credits < GACHA_TEN_PULL_COST)}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:brightness-110 active:scale-95 disabled:opacity-50 text-slate-950 font-black text-xs shadow-neon-gold cursor-pointer transition-all"
          >
            {isPulling ? '十连狂开…' : ticketCount >= 10 ? '🎫 券十连' : `💎 ₵${GACHA_TEN_PULL_COST.toLocaleString()} 十连`}
          </button>
        </div>
      </div>

      {/* Pulled Items Popup Display */}
      {pulledItems && (
        <div className="p-3 mb-2 rounded-xl bg-slate-900/95 border border-cyan-500/60 shadow-2xl animate-in zoom-in-95 duration-200 shrink-0">
          <div className="text-xs font-black text-cyan-300 mb-2 flex items-center justify-between">
            <span>🎉 本次扭蛋开箱成果：</span>
            <button
              onClick={() => setPulledItems(null)}
              className="text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800"
            >
              收起
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto pr-1">
            {pulledItems.map(({ item, isNew, pityHit }, idx) => (
              <div
                key={`${item.id}-${idx}`}
                className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col items-center text-center relative"
              >
                {isNew && (
                  <span className="absolute -top-1.5 -right-1.5 px-1 py-0.2 rounded bg-red-600 text-white font-black text-[8px] animate-pulse">
                    NEW!
                  </span>
                )}
                <span className="text-2xl mb-1">{item.icon}</span>
                <span className={`text-[8px] px-1 py-0.2 rounded mb-1 ${getRarityBadge(item.rarity)}`}>
                  {item.rarity}
                </span>
                <div className="text-[10px] font-bold text-slate-200 line-clamp-1">{item.name}</div>
                {!isNew && (
                  <div className="text-[8px] text-emerald-400 font-bold">重复 +₵{getGachaDupeRefund(item.rarity).toLocaleString()}</div>
                )}
                {pityHit && <div className="text-[8px] text-cyan-300">保底触发</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collection Series Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800 pb-1.5 mb-2 shrink-0 overflow-x-auto no-scrollbar">
        {(['god', 'work', 'cyber', 'pet'] as GachaSeriesId[]).map((sid) => {
          const info = GACHA_SERIES_INFO[sid];
          const isAct = activeTab === sid;
          const items = GACHA_ITEMS.filter((i) => i.series === sid);
          const unlocked = items.filter((i) => unlockedIds.has(i.id)).length;
          return (
            <button
              key={sid}
              onClick={() => setActiveTab(sid)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 border ${
                isAct
                  ? 'bg-slate-800 border-cyan-400 text-cyan-300 shadow-sm'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{info.icon}</span>
              <span>{info.name}</span>
              <span className={`text-[9px] px-1 py-0.2 rounded ${unlocked === items.length ? 'bg-green-950 text-green-400 border border-green-500/40' : 'bg-slate-800 text-slate-500'}`}>
                {unlocked}/{items.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Series Synergy Bond Banner */}
      <div
        className={`p-2.5 rounded-xl border mb-3 shrink-0 transition-all ${
          isSeriesComplete
            ? 'bg-gradient-to-r from-amber-950/60 to-yellow-950/60 border-yellow-400 shadow-neon-gold text-yellow-200'
            : 'bg-slate-900/60 border-slate-800 text-slate-400'
        }`}
      >
        <div className="flex items-center justify-between text-xs font-bold mb-0.5">
          <div className="flex items-center gap-1.5">
            <span>{isSeriesComplete ? '✨【全套羁绊已激活生效】' : '🔒【全套被动羁绊（未集齐）】'}</span>
          </div>
          <span className="text-[10px]">收集进度: {seriesUnlockedCount} / {seriesItems.length}</span>
        </div>
        <div className="text-[11px] leading-relaxed">
          {GACHA_SERIES_INFO[activeTab].synergyDesc}
        </div>
      </div>

      {/* Series Collection Showcase Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {seriesItems.map((item) => {
          const isUnlocked = unlockedIds.has(item.id);
          return (
            <div
              key={item.id}
              className={`p-3 rounded-xl border transition-all flex items-start gap-3 ${
                isUnlocked
                  ? 'bg-slate-900/80 border-slate-700/80 hover:border-cyan-500/50'
                  : 'bg-slate-950/40 border-slate-800/50 opacity-60'
              }`}
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 border ${
                  isUnlocked
                    ? 'bg-slate-800/80 border-slate-600 shadow-inner'
                    : 'bg-slate-900/50 border-slate-800 text-slate-600'
                }`}
              >
                {isUnlocked ? item.icon : <Lock size={18} className="text-slate-600" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[8px] px-1 py-0.2 rounded ${getRarityBadge(item.rarity)}`}>
                    {item.rarity}
                  </span>
                  <div className={`text-xs font-bold truncate ${isUnlocked ? 'text-slate-200' : 'text-slate-500'}`}>
                    {isUnlocked ? item.name : '未知稀有藏品 ???'}
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 leading-tight line-clamp-2 mb-1">
                  {isUnlocked ? item.desc : '拉动扭蛋机摇杆或在黑客/钓鱼中获取扭蛋券解锁'}
                </div>

                {isUnlocked && (
                  <div className="text-[9px] text-cyan-400/80 italic line-clamp-1">
                    {item.quote}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
