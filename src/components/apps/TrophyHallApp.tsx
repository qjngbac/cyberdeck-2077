import React from 'react';
import { Award, Lock, Gift } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_MILESTONES,
  getUnlockedAchievementCount,
  getAchievementMultiplier,
  getGlobalMeritMultiplier,
} from '../../utils/gameLogic';

export const TrophyHallApp: React.FC = () => {
  const { state, claimAchievementMilestone } = useGame();

  const totalCount = ACHIEVEMENTS.length;
  const unlockedCount = getUnlockedAchievementCount(state);
  const percent = Math.round((unlockedCount / totalCount) * 100);
  const claimedMilestones = state.claimedMilestones || [];

  return (
    <div className="flex flex-col h-full font-mono text-xs text-slate-200 select-none overflow-y-auto p-3 space-y-4">
      {/* Header Banner */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/50 via-slate-900 to-cyan-950/50 border border-yellow-500/40 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-2xl text-slate-950 shadow-neon-gold shrink-0">
            🏆
          </div>
          <div>
            <div className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-200 to-cyan-300 flex items-center gap-2">
              <span>赛博成就殿堂 · 荣誉奖章陈列室</span>
              {percent === 100 && (
                <span className="px-2 py-0.5 rounded-full bg-yellow-400 text-slate-950 text-[10px] font-black">
                  至尊天尊
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              记录你在 CyberDeck OS 中每一个突破极限的传奇时刻，成就勋章提供全服永久属性加成。
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-2xl font-black text-yellow-400 font-mono">
            {unlockedCount} / {totalCount}
          </div>
          <div className="text-[10px] text-cyan-300">
            成就增幅: +{Math.round((getAchievementMultiplier(state) - 1) * 100)}% · 含收藏与称号后全场功德 ×{getGlobalMeritMultiplier(state).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold px-1">
          <span>成就殿堂点亮进度</span>
          <span className="text-yellow-400">{percent}% COMPLETE</span>
        </div>
        <div className="w-full h-2.5 bg-slate-900 rounded-full border border-slate-800 overflow-hidden p-0.5">
          <div
            style={{ width: `${percent}%` }}
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-purple-500 to-yellow-400 transition-all duration-500 shadow-neon-gold"
          />
        </div>
      </div>

      {/* Milestone Rewards Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-bold text-yellow-300">
          <Gift size={16} />
          <span>阶段性荣誉领奖台 (Milestone Rewards)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {ACHIEVEMENT_MILESTONES.map((ms) => {
            const isUnlocked = unlockedCount >= ms.requiredCount;
            const isClaimed = claimedMilestones.includes(ms.id);

            return (
              <div
                key={ms.id}
                className={`p-3 rounded-xl border transition-all flex flex-col justify-between space-y-2 ${
                  isClaimed
                    ? 'bg-slate-950/80 border-slate-800 opacity-75'
                    : isUnlocked
                    ? 'bg-gradient-to-b from-yellow-950/50 to-slate-900 border-yellow-500/60 shadow-neon-gold'
                    : 'bg-slate-900/40 border-slate-800/80'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{ms.icon}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                        isClaimed
                          ? 'bg-slate-800 text-slate-400'
                          : isUnlocked
                          ? 'bg-yellow-500 text-slate-950'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      需达成 {ms.requiredCount} 项
                    </span>
                  </div>
                  <div className="font-bold text-xs text-slate-100 mt-1">{ms.title}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{ms.desc}</div>
                  <div className="text-[10px] text-yellow-300 font-bold mt-1 bg-yellow-950/40 px-1.5 py-0.5 rounded border border-yellow-500/30">
                    🎁 {ms.rewardDesc}
                  </div>
                </div>

                <button
                  disabled={!isUnlocked || isClaimed}
                  onClick={() => claimAchievementMilestone(ms.id)}
                  className={`w-full py-1.5 rounded-lg text-xs font-black transition-all ${
                    isClaimed
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : isUnlocked
                      ? 'bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-slate-950 shadow-neon-gold cursor-pointer animate-pulse'
                      : 'bg-slate-800/60 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {isClaimed ? '已领受嘉奖 ✓' : isUnlocked ? '点击领受嘉奖 ✨' : `进度 (${unlockedCount}/${ms.requiredCount})`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 8+ Achievements Grid */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-bold text-cyan-300">
          <Award size={16} />
          <span>赛博传奇勋章阵列 (Medals)</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {ACHIEVEMENTS.map((ach) => {
            const isUnlocked = ach.check(state);

            return (
              <div
                key={ach.id}
                className={`p-3 rounded-xl border flex flex-col items-center text-center transition-all ${
                  isUnlocked
                    ? 'bg-gradient-to-b from-slate-900 to-slate-950 border-cyan-500/60 hover:border-cyan-400 hover:shadow-neon-cyan'
                    : 'bg-slate-950/40 border-slate-800/60 opacity-50 grayscale'
                }`}
              >
                <div className="relative mb-1">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border ${
                      isUnlocked
                        ? 'bg-cyan-950/80 border-cyan-400 shadow-neon-cyan'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    {ach.icon}
                  </div>
                  {isUnlocked ? (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center text-[10px] font-black">
                      ✓
                    </div>
                  ) : (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center text-[10px]">
                      <Lock size={10} />
                    </div>
                  )}
                </div>

                <div className={`font-bold text-xs ${isUnlocked ? 'text-cyan-300' : 'text-slate-400'}`}>
                  {ach.title}
                </div>
                <div className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                  {ach.desc}
                </div>

                <div className="mt-2 text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-500">
                  {isUnlocked ? '已达成 · 功德+5%' : '未解锁'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
