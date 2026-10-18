import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Waves } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import confetti from 'canvas-confetti';
import { SoundFX } from '../../audio/SoundFX';
import { InventoryItem } from '../../types';
import {
  GACHA_POOL,
  RELEASE_OPTIONS,
  MERIT_TO_CREDIT_RATE,
  getMeritPerTap,
  getReleaseFactor,
  getReleaseRatio,
  formatNumber,
  formatCredits,
} from '../../utils/gameLogic';

interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
}

type ReleaseId = 'duck' | 'koi' | 'turtle' | 'bug';

/** Presentation-only decoration for the pond cards; every number comes from RELEASE_OPTIONS. */
const POND_META: Record<ReleaseId, { icon: string; tag: string }> = {
  duck: { icon: '🦆', tag: '消除隐藏死锁' },
  koi: { icon: '🎏', tag: '股市暴涨祥瑞' },
  turtle: { icon: '🐢', tag: '发量寿命大增' },
  bug: { icon: '🐛', tag: '大智慧度化Bug' },
};

/** 祈愿池按设计意图的出率：传说 15% / 史诗 30% / 稀有+普通 55%。 */
const PRAY_RATES = { legendary: 0.15, epic: 0.45 };
const PRAY_COST = { single: 1000, ten: 9000 };
const PRAY_BANDS = {
  legendary: GACHA_POOL.filter((i) => i.rarity === 'legendary'),
  epic: GACHA_POOL.filter((i) => i.rarity === 'epic'),
  // 兜底只从 rare/common 里取——旧实现从整池兜底，实测传说 ≈31%、史诗 ≈50%
  low: GACHA_POOL.filter((i) => i.rarity === 'rare' || i.rarity === 'common'),
};

/** 公示出率：剩下的 55% 由 rare / common 按件数均分，与 doGacha 的抽取逻辑一一对应。 */
const PRAY_RATE_LIST = (() => {
  const rareCount = GACHA_POOL.filter((i) => i.rarity === 'rare').length;
  const commonCount = GACHA_POOL.filter((i) => i.rarity === 'common').length;
  const lowTotal = rareCount + commonCount || 1;
  const tail = 1 - PRAY_RATES.epic;
  return [
    { label: '传说', p: PRAY_RATES.legendary },
    { label: '史诗', p: PRAY_RATES.epic - PRAY_RATES.legendary },
    { label: '稀有', p: (tail * rareCount) / lowTotal },
    { label: '普通', p: (tail * commonCount) / lowTotal },
  ];
})();

export const WoodenFishApp: React.FC = () => {
  const {
    state, tapWoodenFish, buyUpgrade, convertMeritToCredits, addInventoryItem,
    addMerit, releaseCreature, showAlert, setPrefs,
  } = useGame();
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [isTapping, setIsTapping] = useState(false);
  const [activeTab, setActiveTab] = useState<'tap' | 'upgrades' | 'gacha' | 'pond'>('tap');
  // Scripture choice is remembered in the save and changes the tap sound pitch
  const selectedScripture = state.prefs.scripture;

  // Combo Meter (refs keep the tap handler in sync — the triggering tap also gets the x5 bonus)
  const [combo, setCombo] = useState(0);
  const [isOverdrive, setIsOverdrive] = useState(false);
  const comboRef = useRef(0);
  const overdriveRef = useRef(false);
  const overdriveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (overdriveTimerRef.current !== null) window.clearTimeout(overdriveTimerRef.current);
    };
  }, []);

  // Gacha Result Modal
  const [gachaResults, setGachaResults] = useState<typeof GACHA_POOL | null>(null);

  // Merit → credits converter amount
  const [convertAmount, setConvertAmount] = useState(100);

  const funnyPopups = ['功德 +', '福报 +', 'Bug -', '发量 +', '免加班 +', '算力 +', '心境 +'];

  // Every floating popup owns its own removal timer — entries pushed without one leaked forever
  const pushFloatingText = (text: string, x: number, y: number) => {
    const id = Date.now() + Math.random();
    setFloatingTexts((prev) => [...prev, { id, text, x, y }]);
    setTimeout(() => {
      setFloatingTexts((prev) => prev.filter((item) => item.id !== id));
    }, 900);
  };

  // Tap wooden fish with combo logic
  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const mult = overdriveRef.current ? 5 : 1;
    const gain = getMeritPerTap(state, mult);
    tapWoodenFish(mult);
    setIsTapping(true);
    setTimeout(() => setIsTapping(false), 120);

    if (!overdriveRef.current) {
      comboRef.current += 1;
      setCombo(comboRef.current);
      if (comboRef.current >= 20) {
        overdriveRef.current = true;
        setIsOverdrive(true);
        SoundFX.playLevelUp();
        confetti({ particleCount: 60, spread: 70 });
        if (overdriveTimerRef.current !== null) window.clearTimeout(overdriveTimerRef.current);
        overdriveTimerRef.current = window.setTimeout(() => {
          overdriveRef.current = false;
          comboRef.current = 0;
          setIsOverdrive(false);
          setCombo(0);
        }, 8000);
      }
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const randomText = mult > 1
      ? `🔥 狂暴功德 +${gain}!`
      : `${funnyPopups[Math.floor(Math.random() * funnyPopups.length)]}${gain}`;
    pushFloatingText(randomText, x, y);

    // Cross-App Synergy: Chance to drop 九天玄晶矿石 for ForgeApp
    const oreChance = mult > 1 ? 0.08 : 0.03;
    if (Math.random() < oreChance) {
      addInventoryItem({
        id: `item-ore-${Date.now()}`,
        name: '九天玄晶矿石',
        icon: '💎',
        desc: '敲击电子木鱼感应天地灵气而凝聚的玄晶矿石！八卦炼宝炉合成高阶本命法宝的核心原料',
        rarity: 'rare',
        count: 1,
      });
      pushFloatingText('💎 获得【九天玄晶矿石】!', x, Math.max(0, y - 24));
    }
  };

  // Perform Gacha (Single or 10-Pull)
  const doGacha = (count: number) => {
    const cost = count === 1 ? PRAY_COST.single : PRAY_COST.ten;
    if (state.merit < cost) {
      SoundFX.playAlert();
      showAlert(`功德不足！${count} 连抽需要 ${formatNumber(cost)} 功德！`, '功德不足', '⚠️', 'gold');
      return;
    }

    addMerit(-cost);
    SoundFX.playLevelUp();

    const results: typeof GACHA_POOL = [];
    for (let i = 0; i < count; i++) {
      // 每一格走同一套概率，十连只是 9 折——旧的「第 10 格必出紫色以上」比自然抽取更慷慨
      const rand = Math.random();
      const band = rand < PRAY_RATES.legendary
        ? PRAY_BANDS.legendary
        : rand < PRAY_RATES.epic
        ? PRAY_BANDS.epic
        : PRAY_BANDS.low;
      const picked = band[Math.floor(Math.random() * band.length)];

      results.push(picked);

      // Add to inventory (stacked by name in the global save)
      const invItem: InventoryItem = {
        id: `item_${picked.name}`,
        name: picked.name,
        icon: picked.icon,
        desc: picked.desc,
        rarity: picked.rarity,
        count: 1,
      };
      addInventoryItem(invItem);
    }

    setGachaResults(results);
    const hasLegendary = results.some((r) => r.rarity === 'legendary');
    if (hasLegendary) {
      confetti({ particleCount: 100, spread: 100, origin: { y: 0.5 } });
    }
  };

  // Cyber Release Pond Action — 成本、功德与当日递减全部由核心层结算，UI 只展示
  const handleRelease = (id: ReleaseId) => {
    const res = releaseCreature(id);
    if (!res.ok) {
      showAlert(res.message, '放生失败', '⚠️', 'red');
      return;
    }
    confetti({ particleCount: 50, spread: 70 });
    showAlert(res.message, '功德放生成功', '🌊', 'cyan');
  };

  // 今日已放生次数驱动卡片上的「递减后功德 / 满值」预览
  const releaseDoneToday = state.daily?.date === new Date().toDateString()
    ? (state.daily.counters?.release ?? 0)
    : 0;
  const releaseFactor = getReleaseFactor(releaseDoneToday);

  const upgradeConfigs: { key: keyof typeof state.upgrades; title: string; desc: string; icon: string; baseCost: number; mult: number; gainDesc: string }[] = [
    { key: 'quantumStriker', title: '敲击功率增幅器', desc: '强化击槌的量子势能，每一记敲击功德更沉（不加自动产出）', icon: '⚡', baseCost: 20, mult: 1.6, gainDesc: '+1 每次敲击功德' },
    { key: 'antiMatterRobe', title: '反物质袈裟', desc: '超导纳米纤维编织，持续吸收宇宙背景微波自动产生功德', icon: '🥋', baseCost: 100, mult: 1.8, gainDesc: '+2/秒 自动功德' },
    { key: 'nanoScriptures', title: '纳米经文矩阵', desc: '把《大悲咒》刻在原子核上，超高速全自动轮转诵经', icon: '📜', baseCost: 500, mult: 2.0, gainDesc: '+10 敲击 / +8 每秒' },
    { key: 'overclockBeads', title: '超频舍利佛珠', desc: '超导水冷液氮散热，主频提升至 8.8GHz', icon: '📿', baseCost: 2500, mult: 2.2, gainDesc: '+50 敲击 / +40 每秒' },
    { key: 'aiBodhisattva', title: 'AI 菩萨云计算', desc: '调用万卡分布式集群进行超导量子飞升', icon: '🕉️', baseCost: 10000, mult: 2.5, gainDesc: '+200 敲击 / +250 每秒' },
  ];

  return (
    <div className="flex flex-col h-full space-y-2.5 font-mono text-xs select-none">
      {/* Sub Tabs */}
      <div className="grid grid-cols-4 gap-1 bg-slate-900/90 p-1 rounded-lg border border-cyan-500/30">
        <button
          onClick={() => setActiveTab('tap')}
          className={`py-1 rounded text-center font-bold transition-all ${
            activeTab === 'tap'
              ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          📿 敲木鱼
        </button>
        <button
          onClick={() => setActiveTab('pond')}
          className={`py-1 rounded text-center font-bold transition-all ${
            activeTab === 'pond'
              ? 'bg-blue-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          🌊 放生池
        </button>
        <button
          onClick={() => setActiveTab('gacha')}
          className={`py-1 rounded text-center font-bold transition-all ${
            activeTab === 'gacha'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          🎁 祈愿十连
        </button>
        <button
          onClick={() => setActiveTab('upgrades')}
          className={`py-1 rounded text-center font-bold transition-all ${
            activeTab === 'upgrades'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          ⚡ 法宝科技
        </button>
      </div>

      {/* Main Tab: Wooden Fish Tap */}
      {activeTab === 'tap' && (
        <div className="flex-1 flex flex-col items-center justify-between py-1">
          {/* Header & Combo Meter */}
          <div className="text-center w-full">
            <div className="flex items-center justify-center gap-2">
              <span className={`text-2xl font-black ${isOverdrive ? 'text-pink-400 text-glow-pink animate-pulse' : 'text-yellow-400 text-glow-gold'}`}>
                {formatNumber(state.merit)}
              </span>
              <span className="text-xs text-yellow-500 font-bold">功德</span>
            </div>

            {/* Scripture & Mode Selection */}
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className="text-[10px] text-slate-400">诵经经文:</span>
              <select
                value={selectedScripture}
                onChange={(e) => {
                  setPrefs({ scripture: e.target.value });
                  SoundFX.playWoodenFish(e.target.value.includes('清心咒') ? 1.25 : e.target.value.includes('金刚经') ? 0.8 : 1.0);
                }}
                className="bg-slate-900 text-cyan-300 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] outline-none"
              >
                <option>大悲咒 (8-Bit超导版)</option>
                <option>清心咒 (量子超频版)</option>
                <option>金刚经 (多线程架构版)</option>
              </select>
            </div>

            {/* Combo Overdrive Progress */}
            <div className="w-48 mx-auto mt-2">
              <div className="flex justify-between text-[9px] text-slate-400 mb-0.5 font-mono">
                <span>{isOverdrive ? '🔥 狂暴功德 x5 暴击中！' : '连击能量条'}</span>
                <span>{isOverdrive ? 'ACTIVE' : `${combo}/20`}</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div
                  className={`h-full transition-all duration-150 ${
                    isOverdrive ? 'bg-gradient-to-r from-pink-500 to-yellow-400 w-full animate-pulse' : 'bg-cyan-400'
                  }`}
                  style={{ width: isOverdrive ? '100%' : `${(combo / 20) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Wooden Fish Visual Area */}
          <div
            onClick={handleTap}
            className={`relative w-44 h-44 sm:w-52 sm:h-52 rounded-full flex items-center justify-center cursor-pointer select-none transition-transform duration-100 ${
              isTapping ? 'scale-90 brightness-150' : 'hover:scale-105 active:scale-95'
            }`}
          >
            <div className={`absolute inset-0 rounded-full blur-xl ${isOverdrive ? 'bg-pink-500/30 animate-pulse' : 'bg-yellow-500/20 animate-pulse-fast'}`} />
            
            <div className={`relative w-36 h-36 sm:w-44 sm:h-44 rounded-full flex flex-col items-center justify-center border-2 shadow-2xl ${
              isOverdrive
                ? 'bg-gradient-to-br from-pink-900 via-purple-950 to-slate-950 border-pink-400 shadow-neon-pink'
                : 'bg-gradient-to-br from-amber-800 via-yellow-950 to-slate-950 border-yellow-500/60 shadow-neon-gold'
            }`}>
              <span className="text-5xl sm:text-6xl filter drop-shadow-[0_0_15px_rgba(255,215,0,0.6)] animate-float">
                🪘
              </span>
              <span className="text-[9px] text-yellow-300/80 font-bold mt-1 tracking-widest">
                {isOverdrive ? '【 狂暴超频功德 】' : '[ 敲击积德 · 消除Bug ]'}
              </span>
            </div>

            {/* Floating Popups */}
            {floatingTexts.map((f) => (
              <div
                key={f.id}
                style={{ top: `${f.y - 20}px`, left: `${f.x - 20}px` }}
                className="absolute pointer-events-none text-yellow-300 font-bold text-sm text-glow-gold animate-out fade-out slide-out-to-top-8 duration-700 select-none"
              >
                {f.text}
              </div>
            ))}
          </div>

          {/* Quick Convert (input amount) */}
          <div className="w-full p-2 rounded-lg bg-slate-900/80 border border-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-slate-300 font-bold">
                功德兑换赛博币 (汇率 1 : {MERIT_TO_CREDIT_RATE})
              </span>
              <div className="flex items-center gap-1">
                {[100, 1000, 10000].map((q) => (
                  <button
                    key={q}
                    onClick={() => setConvertAmount(q)}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500/50 text-[9px] text-slate-300"
                  >
                    {q >= 10000 ? '1万' : q}
                  </button>
                ))}
                <button
                  onClick={() => setConvertAmount(Math.max(0, Math.floor(state.merit)))}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-yellow-950 border border-slate-700 hover:border-yellow-500/50 text-[9px] text-yellow-300"
                >
                  全部
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={convertAmount === 0 ? '' : convertAmount}
                placeholder="输入功德数量..."
                onChange={(e) => setConvertAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className="flex-1 px-2 py-1 rounded bg-slate-950 border border-slate-700 focus:border-cyan-500 text-yellow-300 font-bold outline-none text-xs"
              />
              <button
                onClick={() => convertMeritToCredits(convertAmount)}
                disabled={convertAmount <= 0 || state.merit < convertAmount}
                className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-1 shrink-0"
              >
                <span>兑换 {formatCredits(Math.floor(convertAmount * MERIT_TO_CREDIT_RATE))}</span>
                <ArrowRight size={11} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Releasing Pond */}
      {activeTab === 'pond' && (
        <div className="flex-1 flex flex-col justify-between p-2 space-y-2">
          <div className="text-center">
            <div className="font-bold text-cyan-300 text-sm flex items-center justify-center gap-1">
              <Waves size={16} className="text-cyan-400" />
              <span>赛博功德放生池</span>
            </div>
            <div className="text-slate-400 text-[10px] mt-0.5 leading-relaxed">
              今日第 {releaseDoneToday + 1} 次放生，功德每次 ×{getReleaseFactor(1)} 递减（当前 ×{releaseFactor.toFixed(2)}）；
              功德按 1:{MERIT_TO_CREDIT_RATE} 兑换回赛博币，「往返回收」低于 100% 即为亏本。
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 flex-1">
            {RELEASE_OPTIONS.map((opt) => {
              const gain = Math.max(1, Math.floor(opt.merit * releaseFactor));
              const backPercent = getReleaseRatio(opt, releaseDoneToday) * MERIT_TO_CREDIT_RATE * 100;
              const faded = releaseFactor < 0.999;
              const meta = POND_META[opt.id];
              return (
                <button
                  key={opt.id}
                  onClick={() => handleRelease(opt.id)}
                  disabled={state.credits < opt.cost}
                  className={`p-2.5 rounded-xl bg-slate-900/80 border flex flex-col items-center justify-center text-center transition-all group disabled:opacity-40 ${
                    opt.id === 'bug'
                      ? 'hover:bg-pink-950/80 border-slate-800 hover:border-pink-400'
                      : 'hover:bg-cyan-950/80 border-slate-800 hover:border-cyan-400'
                  }`}
                >
                  <span className="text-3xl group-hover:scale-110 transition-transform">{meta.icon}</span>
                  <div className={`font-bold mt-1 ${opt.id === 'bug' ? 'text-pink-300' : 'text-slate-200'}`}>{opt.name}</div>
                  <div className="text-[10px] text-yellow-400 font-semibold">
                    {formatCredits(opt.cost)} (功德 +{formatNumber(gain)})
                  </div>
                  <div className="text-[9px] text-slate-500 mt-0.5">
                    {faded ? `满值 +${formatNumber(opt.merit)} · ` : ''}
                    <span className={backPercent >= 100 ? 'text-green-400' : 'text-red-400'}>
                      往返 {backPercent.toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-500">{meta.tag}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Gacha & 10-Pull */}
      {activeTab === 'gacha' && (
        <div className="flex-1 flex flex-col items-center justify-between p-2">
          <div className="text-center">
            <div className="text-base font-bold text-purple-300 text-glow-pink">赛博功德祈愿法宝池 2.0</div>
            <div className="text-slate-400 text-[10px] mt-0.5 leading-relaxed">
              法宝池共 {GACHA_POOL.length} 种（产品经理退散符、Bug 消除神针等）。公示出率：
              {PRAY_RATE_LIST.map((r) => `${r.label} ${Math.round(r.p * 100)}%`).join(' / ')}。
              十连仅 9 折、无额外保底，每一格出率与单抽完全一致。
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 my-2">
            <div className="text-6xl animate-bounce">🎁</div>
          </div>

          {/* Action Buttons */}
          <div className="w-full flex items-center gap-3">
            <button
              onClick={() => doGacha(1)}
              disabled={state.merit < PRAY_COST.single}
              className="flex-1 py-2.5 rounded-xl bg-purple-950 hover:bg-purple-900 border border-purple-500/50 text-purple-200 font-bold text-xs disabled:opacity-40 transition-all"
            >
              <div>祈愿单抽</div>
              <div className="text-[9px] text-yellow-400 font-normal">{formatNumber(PRAY_COST.single)} 功德</div>
            </button>

            <button
              onClick={() => doGacha(10)}
              disabled={state.merit < PRAY_COST.ten}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 hover:brightness-110 text-white font-black text-xs shadow-neon-pink disabled:opacity-40 transition-all"
            >
              <div>✨ 祈愿十连抽 (9折)</div>
              <div className="text-[9px] text-yellow-200 font-normal">{formatNumber(PRAY_COST.ten)} 功德 (出率同单抽)</div>
            </button>
          </div>
        </div>
      )}

      {/* Tab 4: Upgrades */}
      {activeTab === 'upgrades' && (
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {upgradeConfigs.map((up) => {
            const curLvl = state.upgrades[up.key];
            const cost = Math.floor(up.baseCost * Math.pow(up.mult, curLvl));
            const canAfford = state.merit >= cost;

            return (
              <div
                key={up.key}
                className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-2xl">{up.icon}</span>
                  <div className="truncate">
                    <div className="font-bold text-slate-200 text-xs truncate flex items-center gap-1.5">
                      <span>{up.title}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                        Lv.{curLvl}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-400 truncate">{up.desc}</div>
                    <div className="text-[9px] text-yellow-400 font-semibold">{up.gainDesc}</div>
                  </div>
                </div>

                <button
                  onClick={() => buyUpgrade(up.key)}
                  disabled={!canAfford}
                  className={`px-2.5 py-1.5 rounded font-bold text-xs shrink-0 transition-all ${
                    canAfford ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-950 shadow-neon-gold' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {formatNumber(cost)} 功德
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Gacha Results Modal Overlay */}
      {gachaResults && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 p-4 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-200">
          <div className="text-center mb-3">
            <div className="text-lg font-black text-yellow-300 text-glow-gold">🎉 祈愿大获丰收！获得以下法宝</div>
            <div className="text-[10px] text-slate-400">已全部自动放入行囊背包中生效！</div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 max-w-lg w-full max-h-72 overflow-y-auto p-1">
            {gachaResults.map((res, i) => (
              <div
                key={i}
                className={`p-2 rounded-xl flex flex-col items-center text-center border ${
                  res.rarity === 'legendary'
                    ? 'bg-amber-950/80 border-yellow-400 shadow-neon-gold animate-bounce'
                    : res.rarity === 'epic'
                    ? 'bg-purple-950/80 border-purple-400 shadow-neon-pink'
                    : 'bg-slate-900 border-slate-700'
                }`}
              >
                <span className="text-3xl">{res.icon}</span>
                <span className="font-bold text-[10px] text-slate-200 mt-1 line-clamp-1">{res.name}</span>
                <span className={`text-[9px] font-bold ${
                  res.rarity === 'legendary' ? 'text-yellow-400' : res.rarity === 'epic' ? 'text-purple-400' : 'text-slate-400'
                }`}>
                  [{res.rarity.toUpperCase()}]
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setGachaResults(null)}
            className="mt-4 px-6 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shadow-neon-cyan"
          >
            收入行囊
          </button>
        </div>
      )}
    </div>
  );
};
