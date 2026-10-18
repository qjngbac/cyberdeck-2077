import React, { useState } from 'react';
import { Store, Coins, Package, Sparkles } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';
import confetti from 'canvas-confetti';
import { InventoryItem } from '../../types';
import {
  getItemDef, getBuyPrice, getSellPrice, getMarketValue, getDailyShopStock,
  SHOP_STAPLES, MYSTERY_BOX_PRICE, rollMysteryBox, describeItemEffect,
  SELL_RATE, formatCredits,
} from '../../utils/gameLogic';

const RARITY_STYLE: Record<string, { label: string; text: string; border: string; bg: string }> = {
  common: { label: '普通', text: 'text-slate-300', border: 'border-slate-700', bg: 'bg-slate-900/70' },
  rare: { label: '稀有', text: 'text-cyan-300', border: 'border-cyan-500/50', bg: 'bg-cyan-950/40' },
  epic: { label: '史诗', text: 'text-purple-300', border: 'border-purple-500/60', bg: 'bg-purple-950/40' },
  legendary: { label: '传说', text: 'text-yellow-300', border: 'border-yellow-500/70', bg: 'bg-amber-950/40' },
};

const SELL_PERCENT = Math.round(SELL_RATE * 100);

export const MarketApp: React.FC = () => {
  const { state, addCredits, addInventoryItem, sellItem, showDialog, showAlert } = useGame();
  const [activeTab, setActiveTab] = useState<'shop' | 'sell'>('shop');
  const [lastMsg, setLastMsg] = useState<string | null>(null);

  const todayStr = new Date().toDateString();
  const dailyNames = getDailyShopStock(todayStr);
  const shopNames = Array.from(new Set([...SHOP_STAPLES, ...dailyNames]));

  const buyItem = (name: string) => {
    const def = getItemDef(name);
    if (!def) return;
    const price = getBuyPrice(def.name, def.rarity);
    if (state.credits < price) {
      SoundFX.playAlert();
      showAlert(`赛博币不足！购买【${def.name}】需要 ${formatCredits(price)}！`, '赛博币不足', '⚠️', 'gold');
      return;
    }
    // 实付以 addCredits 的返回值为准——余额被钳在 0 时入账会小于报价
    const paid = addCredits(-price);
    addInventoryItem({
      id: `item_${def.name}`,
      name: def.name,
      icon: def.icon,
      desc: def.desc,
      rarity: def.rarity,
      count: 1,
    });
    SoundFX.playCash();
    setLastMsg(`🛒 购入【${def.name}】成功，已放入背包（-${formatCredits(-paid)}）！`);
  };

  const buyMysteryBox = () => {
    if (state.credits < MYSTERY_BOX_PRICE) {
      SoundFX.playAlert();
      showAlert(`赛博币不足！神秘盲盒需要 ${formatCredits(MYSTERY_BOX_PRICE)}！`, '赛博币不足', '⚠️', 'gold');
      return;
    }
    const paid = addCredits(-MYSTERY_BOX_PRICE);
    const def = rollMysteryBox();
    addInventoryItem({
      id: `item_${def.name}`,
      name: def.name,
      icon: def.icon,
      desc: def.desc,
      rarity: def.rarity,
      count: 1,
    });
    SoundFX.playLevelUp();
    if (def.rarity === 'legendary' || def.rarity === 'epic') {
      confetti({ particleCount: 80, spread: 90 });
    }
    setLastMsg(`🎁 盲盒开出【${def.icon} ${def.name}】（${RARITY_STYLE[def.rarity].label}）！已放入背包（-${formatCredits(-paid)}）！`);
  };

  // 出售数量以核心层的 clamp 为准，文案只报实际成交的部分
  const sell = (item: InventoryItem, count: number) => {
    const n = Math.max(0, Math.min(count, item.count));
    if (n <= 0) {
      showAlert('背包里没有可出售的该道具！', '无法出售', '📦', 'cyan');
      return;
    }
    const unit = getSellPrice(item.name, item.rarity);
    sellItem(item.id, n);
    setLastMsg(`💰 出售【${item.name}】x${n}，回收 +${formatCredits(unit * n)}！`);
  };

  const sellAll = (item: InventoryItem) => {
    const n = item.count;
    const unit = getSellPrice(item.name, item.rarity);
    const total = unit * n;
    showDialog({
      id: `market-sell-all-${item.id}`,
      title: '确认一次性出售？',
      message: `【${item.name}】x${n}（${RARITY_STYLE[item.rarity].label}）将全部以 ${SELL_PERCENT}% 回收价换成 ${formatCredits(total)} 赛博币。\n出手后无法赎回，确定吗？`,
      icon: '💰',
      tone: item.rarity === 'legendary' || item.rarity === 'epic' ? 'gold' : 'cyan',
      confirmText: `确认卖出 ${formatCredits(total)}`,
      cancelText: '再想想',
      onConfirm: () => sell(item, n),
    });
  };

  const sellable = state.inventory;

  return (
    <div className="flex flex-col h-full space-y-2.5 font-mono text-xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-yellow-500/30">
        <div className="flex items-center gap-2">
          <Store size={18} className="text-yellow-400" />
          <div>
            <div className="font-bold text-sm text-yellow-300">赛博交易所 · 夜之城黑市</div>
            <div className="text-[10px] text-slate-400">回收价 = 市价 {SELL_PERCENT}% | 精选货架每日刷新</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-cyan-300 font-bold">{formatCredits(state.credits)}</div>
          <div className="text-[9px] text-slate-500">当前赛博币</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
        <button
          onClick={() => setActiveTab('shop')}
          className={`flex-1 py-1 rounded text-center font-bold ${activeTab === 'shop' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50' : 'text-slate-400'}`}
        >
          🛒 黑市商店
        </button>
        <button
          onClick={() => setActiveTab('sell')}
          className={`flex-1 py-1 rounded text-center font-bold ${activeTab === 'sell' ? 'bg-green-500/20 text-green-300 border border-green-500/50' : 'text-slate-400'}`}
        >
          💰 出售背包 ({sellable.length})
        </button>
      </div>

      {lastMsg && (
        <div className="p-1.5 rounded bg-slate-950/80 border border-cyan-500/40 text-[10px] text-cyan-200 text-center">
          {lastMsg}
        </div>
      )}

      {/* Shop */}
      {activeTab === 'shop' && (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {/* Mystery Box */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-purple-950/60 via-slate-900 to-pink-950/50 border border-purple-500/60 shadow-neon-pink flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-4xl animate-bounce">🎁</span>
              <div>
                <div className="font-bold text-purple-200 text-xs flex items-center gap-1.5">
                  <Sparkles size={12} className="text-pink-400" />
                  神秘赛博盲盒
                </div>
                <div className="text-[10px] text-slate-300 mt-0.5">
                  必出<b className="text-cyan-300">稀有及以上</b>道具！60% 稀有 / 32% 史诗 / 8% 传说（欧皇请重仓）
                </div>
              </div>
            </div>
            <button
              onClick={buyMysteryBox}
              disabled={state.credits < MYSTERY_BOX_PRICE}
              className="px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:brightness-110 disabled:opacity-40 text-white font-black text-xs shadow-neon-pink shrink-0"
            >
              开盒 {formatCredits(MYSTERY_BOX_PRICE)}
            </button>
          </div>

          {/* Goods */}
          <div className="text-[10px] text-slate-400 font-semibold">📦 常驻货架 + 今日精选（{todayStr.slice(4, 10)}）</div>
          <div className="grid grid-cols-1 gap-1.5">
            {shopNames.map((name) => {
              const def = getItemDef(name);
              if (!def) return null;
              const price = getBuyPrice(def.name, def.rarity);
              const style = RARITY_STYLE[def.rarity];
              const affordable = state.credits >= price;
              return (
                <div
                  key={name}
                  className={`p-2 rounded-xl border flex items-center justify-between gap-2 ${style.bg} ${style.border}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-2xl">{def.icon}</span>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-100 text-[11px] flex items-center gap-1.5">
                        <span className="truncate">{def.name}</span>
                        <span className={`text-[9px] shrink-0 ${style.text}`}>[{style.label}]</span>
                      </div>
                      <div className="text-[9px] text-slate-400 truncate">{def.desc}</div>
                      <div className="text-[9px] text-green-400/90 truncate">✨ {describeItemEffect({ id: '', name: def.name, icon: '', desc: '', rarity: def.rarity, count: 1 })}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => buyItem(name)}
                    disabled={!affordable}
                    className={`px-2.5 py-1.5 rounded font-bold text-[10px] shrink-0 transition-all ${
                      affordable ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-950 shadow-neon-gold' : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {formatCredits(price)}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sell */}
      {activeTab === 'sell' && (
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {sellable.length === 0 ? (
            <div className="text-slate-500 text-center py-8 text-xs">
              背包空空如也，无法回收。去木鱼抽卡、钓鱼或地牢寻宝吧！
            </div>
          ) : (
            <>
              <div className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                <Package size={11} />
                出售立即到账（回收价 = 市价 {SELL_PERCENT}%）
              </div>
              {sellable.map((item) => {
                const unit = getSellPrice(item.name, item.rarity);
                const style = RARITY_STYLE[item.rarity];
                // 目录里没有参考价的道具，按稀有度兜底计价，UI 如实标注
                const listed = !!getItemDef(item.name);
                const market = getMarketValue(item.name, item.rarity);
                return (
                  <div
                    key={item.id}
                    className={`p-2 rounded-xl border flex items-center justify-between gap-2 ${style.bg} ${style.border}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-2xl">{item.icon}</span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-100 text-[11px] flex items-center gap-1.5">
                          <span className="truncate">{item.name}</span>
                          <span className="text-[9px] text-yellow-400 shrink-0">x{item.count}</span>
                        </div>
                        <div className="text-[9px] text-slate-400 truncate">✨ {describeItemEffect(item)}</div>
                        <div className="text-[9px] text-slate-500 truncate">
                          市价 {formatCredits(market)}{listed ? '' : `（无参考价，按 ${style.label} 兜底）`} · 单件回收 {formatCredits(unit)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => sell(item, 1)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-green-950 border border-slate-700 hover:border-green-500/60 text-[10px] text-slate-200 font-bold transition-colors"
                      >
                        卖1 ({formatCredits(unit)})
                      </button>
                      {item.count > 1 && (
                        <button
                          onClick={() => sellAll(item)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-green-950 border border-slate-700 hover:border-green-500/60 text-[10px] text-green-300 font-bold transition-colors"
                        >
                          全卖 ({formatCredits(unit * item.count)})
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Footer tip */}
      <div className="flex items-center justify-center gap-1.5 text-[9px] text-slate-500 pt-1 border-t border-slate-800">
        <Coins size={10} className="text-yellow-600" />
        <span>道具来源：木鱼祈愿 · 钓鱼 · 地牢 · 盲盒 → 不需要的可以在这里换成赛博币</span>
      </div>
    </div>
  );
};
