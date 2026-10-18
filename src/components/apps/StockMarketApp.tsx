import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TrendingUp, TrendingDown, Newspaper } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';
import confetti from 'canvas-confetti';
import {
  ESTATE_DEFS,
  ESTATE_PAYOUT_INTERVAL_MS,
  getEstateIncomePerMinute,
  isGachaSeriesComplete,
  getPositionPnl,
  getPositionEquity,
  shouldLiquidate,
  MAINTENANCE_RATIO,
  formatCredits,
  formatNumber,
} from '../../utils/gameLogic';
import { StockItem } from '../../types';
import { STOCK_ANCHOR } from '../../utils/storage';

const STAMP_DUTY = 0.01;
const INSIDER_TIP_COST = 100;
/** 与核心层一致：内幕情报只保证「双向高噪声」，不保证方向。 */
const INSIDER_TICKS_SEC = 90;

/** 价格精度按量级走（核心层同一套规则），否则 0.88 的柴犬币会被显示成 0.88/0.9。 */
const fmtPrice = (p: number) => {
  const abs = Math.abs(p);
  if (abs >= 100) return p.toFixed(1);
  if (abs >= 1) return p.toFixed(2);
  if (abs >= 0.01) return p.toFixed(4);
  return p.toFixed(6);
};

/** 强平触发价：equity = margin × MAINTENANCE_RATIO 时的价格。 */
const liquidationPriceOf = (stock: StockItem) => {
  if (stock.ownedAmount <= 0 || stock.avgCost <= 0 || stock.leverage <= 0) return 0;
  const room = (1 - MAINTENANCE_RATIO) / stock.leverage;
  return stock.position === 'short' ? stock.avgCost * (1 + room) : stock.avgCost * (1 - room);
};

/** 反向波动多少百分比就爆仓 —— 用真实公式给玩家看，而不是让他猜杠杆有多危险。 */
const liqMovePercent = (leverage: number) => ((1 - MAINTENANCE_RATIO) / Math.max(1, leverage)) * 100;

/** 小钱给两位小数（和成交流水对得上），大钱走 formatCredits 免撑破布局。 */
const fmtMoney = (v: number) => (Math.abs(v) >= 10000 ? formatCredits(v) : `₵${v.toFixed(2)}`);

export const StockMarketApp: React.FC = () => {
  const { state, buyStock, sellStock, buyEstate, buyInsiderTip, notify, cooldownRemaining } = useGame();
  // Live list straight from global state — prices tick every second via the main loop
  const stocksList = state.stocks;
  const [selectedStockId, setSelectedStockId] = useState<string>(stocksList[0]?.id || 'moyu-tech');
  const [tradeAmount, setTradeAmount] = useState<number>(10);
  const [leverage, setLeverage] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'trade' | 'realestate' | 'news'>('trade');
  const [now, setNow] = useState(() => Date.now());
  const [chartW, setChartW] = useState(0);

  useEffect(() => {
    if (activeTab !== 'realestate') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activeTab]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartBoxRef = useRef<HTMLDivElement | null>(null);
  // 脏存档/空列表时回落到第一支：不再用 effect 回填 id（渲染期 setState 会多跑一轮），
  // 选中态与高亮都基于这个回落后的对象，天然保持一致。
  const selectedStock = stocksList.find((s) => s.id === selectedStockId) ?? stocksList[0];

  // 容器尺寸变化（拖拽/最大化窗口）时重画，canvas 位图宽度跟着走
  useEffect(() => {
    if (activeTab !== 'trade') return;
    const box = chartBoxRef.current;
    if (!box) return;
    const measure = () => setChartW(Math.max(120, Math.round(box.clientWidth)));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [activeTab]);

  // Render Real-time Stock Chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedStock) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = (canvas.width = chartW || canvas.parentElement?.clientWidth || 420);
    const height = (canvas.height = 170);

    ctx.clearRect(0, 0, width, height);

    const history = selectedStock.history;
    if (history.length < 2) return;

    const hasPosition = selectedStock.ownedAmount > 0;
    const liqPrice = liquidationPriceOf(selectedStock);
    const cost = selectedStock.avgCost;

    // 纵向刻度：把成本线与强平线也框进来，否则关键参考线会被裁到图外
    const anchors = [Math.min(...history), Math.max(...history), selectedStock.price];
    if (hasPosition) anchors.push(cost, liqPrice);
    const lo = Math.min(...anchors) * 0.985;
    const hi = Math.max(...anchors) * 1.015;
    const range = hi - lo || 1;
    const yOf = (val: number) => height - ((val - lo) / range) * height;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const isUp = selectedStock.changePercent >= 0;
    const lineColor = isUp ? '#ff0055' : '#00ff66';
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, isUp ? 'rgba(255, 0, 85, 0.25)' : 'rgba(0, 255, 102, 0.25)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.beginPath();
    history.forEach((val, idx) => {
      const x = (idx / (history.length - 1)) * width;
      const y = yOf(val);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    history.forEach((val, idx) => {
      const x = (idx / (history.length - 1)) * width;
      const y = yOf(val);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = lineColor;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 参考线：本轮区间高低 / 持仓成本 / 强平价
    const guides: Array<{ value: number; color: string; label: string }> = [
      { value: Math.max(...history), color: 'rgba(255,255,255,0.45)', label: `区间高 ${fmtPrice(Math.max(...history))}` },
      { value: Math.min(...history), color: 'rgba(255,255,255,0.35)', label: `区间低 ${fmtPrice(Math.min(...history))}` },
    ];
    if (hasPosition) {
      guides.push({ value: cost, color: '#ffd700', label: `成本 ${fmtPrice(cost)}` });
      guides.push({ value: liqPrice, color: '#ff0055', label: `强平 ${fmtPrice(liqPrice)}` });
    }
    ctx.font = 'bold 9px monospace';
    ctx.lineWidth = 1;
    guides.forEach((g, i) => {
      const y = yOf(g.value);
      ctx.strokeStyle = g.color;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = g.color;
      ctx.fillText(g.label, 4, Math.min(height - 3, Math.max(9, y - 3 + (i % 2 === 0 ? -6 : 9))));
    });

    const lastY = yOf(history[history.length - 1]);
    ctx.beginPath();
    ctx.arc(width - 4, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }, [selectedStock, chartW]);

  const buyEstateById = (estateId: string) => {
    const estate = ESTATE_DEFS.find((e) => e.id === estateId);
    if (!estate) return;
    if (state.credits < estate.price) {
      SoundFX.playAlert();
      notify({ title: '赛博币不足', body: `购置【${estate.name}】需要 ${formatCredits(estate.price)}！`, icon: '⚠️', tone: 'error' });
      return;
    }
    if (buyEstate(estateId)) {
      confetti({ particleCount: 80, spread: 80 });
      notify({ title: '产业已过户', body: `【${estate.name}】每 ${ESTATE_PAYOUT_INTERVAL_MS / 1000} 秒自动分红 ${formatCredits(estate.yield)}！`, icon: '🏰', tone: 'gold' });
    }
  };

  const tip = () => {
    const left = cooldownRemaining('insider-tip');
    if (left > 0) {
      SoundFX.playAlert();
      notify({ title: '情报员正在避险', body: `请等待 ${left} 秒后再打探下一次情报。`, icon: '⏳', tone: 'warn' });
      return;
    }
    if (state.credits < INSIDER_TIP_COST) {
      SoundFX.playAlert();
      notify({ title: '赛博币不足', body: `购买情报需要 ${formatCredits(INSIDER_TIP_COST)}！`, icon: '⚠️', tone: 'error' });
      return;
    }
    const msg = buyInsiderTip();
    if (msg) notify({ title: '内幕情报已到手', body: msg, icon: '🕵️', tone: 'purple' });
  };

  const closePosition = useCallback((stock: StockItem) => {
    // 平仓收益由核心层在 updater 内重算，这里只报「点击那一刻」的快照，避免与账本对不上
    const equity = getPositionEquity(stock);
    const pnl = getPositionPnl(stock);
    const settled = sellStock(stock.id);
    if (!settled) {
      SoundFX.playAlert();
      notify({ title: '平仓失败', body: `${stock.symbol} 当前没有可平仓位（可能刚被强制平仓）。`, icon: '⚠️', tone: 'warn' });
      return;
    }
    notify({
      title: '已一键平仓',
      body: `${stock.symbol} 结算返还 ${fmtMoney(equity)}（浮动盈亏 ${pnl >= 0 ? '+' : ''}${fmtMoney(pnl)}）。最终数字以交易流水为准（价格每秒波动）。`,
      icon: '📄',
      tone: pnl >= 0 ? 'success' : 'warn',
    });
  }, [sellStock, notify]);

  if (!selectedStock) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-xs text-slate-400 p-4 text-center">
        行情数据为空或存档损坏，请到「系统设置」重置存档后重新连接赛博交易所。
      </div>
    );
  }

  const hasPosition = selectedStock.ownedAmount > 0;
  const pnl = getPositionPnl(selectedStock);
  const equity = getPositionEquity(selectedStock);
  const marginRate = selectedStock.margin > 0 ? equity / selectedStock.margin : 1;
  const liqPrice = liquidationPriceOf(selectedStock);
  const liqRoomPercent = hasPosition
    ? Math.abs(selectedStock.price - liqPrice) / Math.max(selectedStock.price, 0.0001) * 100
    : 0;
  const atLiquidation = hasPosition && shouldLiquidate(selectedStock);
  const workSynergy = isGachaSeriesComplete(state, 'work');
  const feeRate = workSynergy ? 0 : STAMP_DUTY;

  const notional = selectedStock.price * tradeAmount;
  const totalCost = notional / leverage;
  const stampFee = totalCost * feeRate;
  const totalRequired = totalCost + stampFee;
  const oppositePosition = hasPosition && selectedStock.position !== 'none';
  const canOpen = state.credits >= totalRequired && !oppositePosition;
  const historyHigh = selectedStock.history.length ? Math.max(...selectedStock.history) : selectedStock.price;
  const historyLow = selectedStock.history.length ? Math.min(...selectedStock.history) : selectedStock.price;

  return (
    <div className="flex flex-col h-full space-y-2.5 font-mono text-xs select-none">
      {/* Sub Tabs */}
      <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-cyan-500/30">
        <button
          onClick={() => setActiveTab('trade')}
          className={`flex-1 py-1 rounded text-center font-bold ${activeTab === 'trade' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50' : 'text-slate-400'}`}
        >
          📈 实时交易盘
        </button>
        <button
          onClick={() => setActiveTab('realestate')}
          className={`flex-1 py-1 rounded text-center font-bold ${activeTab === 'realestate' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50' : 'text-slate-400'}`}
        >
          🏰 大亨置产豪宅 ({state.estates.length}/{ESTATE_DEFS.length})
        </button>
        <button
          onClick={() => setActiveTab('news')}
          className={`flex-1 py-1 rounded text-center font-bold ${activeTab === 'news' ? 'bg-pink-500/20 text-pink-300 border border-pink-500/50' : 'text-slate-400'}`}
        >
          📰 实时滚动快讯
        </button>
      </div>

      {activeTab === 'trade' && (
        <div className="flex-1 flex flex-col justify-between space-y-2 overflow-y-auto">
          {workSynergy && (
            <div className="px-2.5 py-1 rounded-lg bg-yellow-950/60 border border-yellow-500/50 text-yellow-300 text-[10px] font-bold flex items-center justify-between shadow-neon-gold shrink-0">
              <span className="flex items-center gap-1.5">
                <span>💼</span>
                <span>【职场暴富羁绊生效中】：股票交易印花税永久减免为 0！</span>
              </span>
              <span className="px-1.5 py-0.2 rounded bg-yellow-500 text-slate-950 font-black text-[8px]">免税特权</span>
            </div>
          )}
          {/* 10 Stocks Selector */}
          <div className="grid grid-cols-5 gap-1 max-h-24 overflow-y-auto pr-1 shrink-0">
            {stocksList.map((stock) => {
              const isUp = stock.changePercent >= 0;
              const isSelected = stock.id === selectedStock.id;
              const pumped = (stock.boostTicks ?? 0) > 0;
              return (
                <button
                  key={stock.id}
                  onClick={() => setSelectedStockId(stock.id)}
                  className={`p-1.5 rounded-lg text-left transition-all border ${
                    isSelected ? 'bg-slate-900 border-cyan-400 shadow-neon-cyan' : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="font-bold text-[10px] text-slate-200 truncate">
                    {pumped ? '⚡' : ''}{stock.symbol}{stock.ownedAmount > 0 ? ' ◆' : ''}
                  </div>
                  <div className={`font-bold text-[10px] ${isUp ? 'text-red-400' : 'text-green-400'}`}>
                    ₵{fmtPrice(stock.price)}
                  </div>
                  <div className={`text-[8px] ${isUp ? 'text-red-400/70' : 'text-green-400/70'}`}>
                    {isUp ? '+' : ''}{stock.changePercent}%/90s
                  </div>
                </button>
              );
            })}
          </div>

          {/* Main Chart Card */}
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex-1 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <div>
                <span className="font-bold text-sm text-cyan-300">{selectedStock.name} ({selectedStock.symbol})</span>
                {(selectedStock.boostTicks ?? 0) > 0 && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-purple-950 border border-purple-400 text-purple-300 font-bold animate-pulse">
                    ⚡ 剧烈波动中 ({selectedStock.boostTicks}s·方向未知)
                  </span>
                )}
                <div className="text-[9px] text-slate-400">
                  近 90 秒区间：₵{fmtPrice(historyLow)} ~ ₵{fmtPrice(historyHigh)}（{selectedStock.history.length} 个采样点）
                </div>
                <div className="text-[9px] text-slate-500">
                  日初重锚（每日 00:00 重置为当时价格）：高 ₵{fmtPrice(selectedStock.high)} / 低 ₵{fmtPrice(selectedStock.low)}
                </div>
                <div className="text-[9px] text-slate-500">
                  均值回归目标价 ₵{fmtPrice(STOCK_ANCHOR[selectedStock.id] ?? selectedStock.price)}（每秒收敛与它之间差额的 2%，无长期上涨漂移）
                </div>
              </div>
              <div className={`flex items-center gap-1 font-bold text-xs ${selectedStock.changePercent >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {selectedStock.changePercent >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span>₵{fmtPrice(selectedStock.price)} ({selectedStock.changePercent >= 0 ? '+' : ''}{selectedStock.changePercent}%)</span>
              </div>
            </div>

            <div ref={chartBoxRef} className="w-full h-40 bg-slate-950/90 rounded-lg p-1 border border-slate-800/80 relative overflow-hidden">
              <canvas ref={canvasRef} className="w-full h-full block" />
            </div>

            {hasPosition && (
              <div className={`mt-1.5 p-1.5 rounded border text-[10px] space-y-0.5 ${atLiquidation ? 'bg-red-950/50 border-red-500/60' : 'bg-cyan-950/40 border-cyan-500/40'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-cyan-300 font-bold">
                    持仓: {selectedStock.position === 'short' ? '📉 做空' : '🚀 做多'} {formatNumber(selectedStock.ownedAmount)} 份 · {selectedStock.leverage}x
                  </span>
                  <button onClick={() => closePosition(selectedStock)} className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-bold">
                    一键平仓
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-2 text-[9px] text-slate-300">
                  <span>均价成本: ₵{fmtPrice(selectedStock.avgCost)}</span>
                  <span>保证金: {fmtMoney(selectedStock.margin)}</span>
                  <span className={pnl >= 0 ? 'text-red-400' : 'text-green-400'}>
                    未实现盈亏: {pnl >= 0 ? '+' : ''}{fmtMoney(pnl)}
                  </span>
                  <span>当前权益 equity: {fmtMoney(equity)}</span>
                  <span className={marginRate < 0.5 ? 'text-yellow-400 font-bold' : ''}>
                    保证金率: {(marginRate * 100).toFixed(1)}% / 维持线 {(MAINTENANCE_RATIO * 100).toFixed(0)}%
                  </span>
                  <span className="text-pink-400">强平价: ₵{fmtPrice(liqPrice)}（还差 {liqRoomPercent.toFixed(2)}%）</span>
                </div>
                <div className="text-[9px] text-slate-500">
                  公式: equity = 保证金 ± 保证金×杠杆×涨跌幅；equity 跌破保证金×{MAINTENANCE_RATIO} 时主循环立即强制平仓入账。
                </div>
                {atLiquidation && (
                  <div className="text-[9px] text-red-300 font-bold">⚠️ 已触及强平线，下一秒的心跳循环会替你平仓！</div>
                )}
              </div>
            )}

            {/* Trade Controls */}
            <div className="mt-2 grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                  <span>份额: {tradeAmount}</span>
                  <span>名义额: {fmtMoney(notional)}</span>
                </div>
                <div className="flex gap-1">
                  {[1, 5, 10, 50].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setTradeAmount(amt)}
                      className={`flex-1 py-1 rounded text-[10px] font-bold ${tradeAmount === amt ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
                    >
                      {amt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 mb-0.5">
                  <span>杠杆倍率 <span className="text-yellow-400 font-bold">{leverage}x</span></span>
                  <button
                    onClick={tip}
                    disabled={cooldownRemaining('insider-tip') > 0 || state.credits < INSIDER_TIP_COST}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-purple-950 border border-purple-500 text-purple-300 hover:bg-purple-900 disabled:opacity-40 transition-colors"
                  >
                    🕵️ 波动情报(₵{INSIDER_TIP_COST}/{INSIDER_TICKS_SEC}s){cooldownRemaining('insider-tip') > 0 ? ` ${cooldownRemaining('insider-tip')}s` : ''}
                  </button>
                </div>
                <div className="flex gap-1">
                  {[1, 5, 20, 100].map((lev) => (
                    <button
                      key={lev}
                      onClick={() => setLeverage(lev)}
                      className={`flex-1 py-1 rounded text-[9px] font-bold leading-tight ${leverage === lev ? 'bg-yellow-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
                    >
                      {lev}x
                      <div className="text-[7px] opacity-80">{liqMovePercent(lev).toFixed(lev >= 20 ? 2 : 1)}%</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-2 text-[9px] text-slate-400 space-y-0.5 mt-1">
                <div className="flex justify-between">
                  <span>保证金（占用本金）: <span className="text-cyan-300">{fmtMoney(totalCost)}</span></span>
                  <span>印花税 {Math.round(feeRate * 100)}%: <span className="text-yellow-300">{fmtMoney(stampFee)}</span></span>
                </div>
                <div className="flex justify-between">
                  <span>下单需准备: <span className="text-cyan-300 font-bold">{fmtMoney(totalRequired)}</span> / 余额 {formatCredits(state.credits)}</span>
                  <span>
                    {leverage}x 下反向 <span className="text-red-400 font-bold">{liqMovePercent(leverage).toFixed(2)}%</span> 即强平
                  </span>
                </div>
                <div className="text-[9px] text-slate-500 leading-tight">
                  例：{fmtMoney(totalCost)} 保证金 × {leverage}x 撬动 {fmtMoney(notional)} 名义仓位。反向波动 {liqMovePercent(leverage).toFixed(2)}% 时浮亏 {fmtMoney(totalCost * (1 - MAINTENANCE_RATIO))}，权益只剩 {fmtMoney(totalCost * MAINTENANCE_RATIO)} 触及 {(MAINTENANCE_RATIO * 100).toFixed(0)}% 维持线 → 系统下一跳立即强平并退回该金额（印花税不退）。
                </div>
                {oppositePosition && (
                  <div className="text-red-300 text-[9px]">已持有 {selectedStock.position === 'short' ? '做空' : '做多'} 仓位，必须先「一键平仓」才能反向开仓。</div>
                )}
              </div>

              <div className="col-span-2 flex gap-2 mt-1">
                <button
                  onClick={() => buyStock(selectedStock.id, tradeAmount, leverage, 'long')}
                  disabled={!canOpen}
                  className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-black text-xs shadow-neon-pink"
                >
                  🚀 做多 (BUY)
                </button>
                <button
                  onClick={() => buyStock(selectedStock.id, tradeAmount, leverage, 'short')}
                  disabled={!canOpen}
                  className="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 text-slate-950 font-black text-xs shadow-neon-green"
                >
                  📉 做空 (SELL)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Real Estate */}
      {activeTab === 'realestate' && (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-slate-400">购置终极豪宅与座驾，分红每 60 秒自动到账：</span>
            {state.estates.length > 0 && (
              <span className="text-green-400 font-bold">
                ⏳ 下次分红 {Math.max(1, Math.ceil((ESTATE_PAYOUT_INTERVAL_MS - (now - state.lastEstatePayout)) / 1000))}s · +{formatCredits(getEstateIncomePerMinute(state))}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ESTATE_DEFS.map((est) => {
              const owned = state.estates.includes(est.id);
              return (
                <div
                  key={est.id}
                  className={`p-3 rounded-xl border flex flex-col justify-between ${
                    owned ? 'bg-amber-950/40 border-yellow-400 shadow-neon-gold' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-3xl">{est.icon}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${owned ? 'bg-green-950 text-green-300' : 'bg-slate-800 text-slate-400'}`}>
                        {owned ? '已拥有' : formatCredits(est.price)}
                      </span>
                    </div>
                    <div className="font-bold text-slate-200 text-xs mt-1.5">{est.name}</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">{est.desc}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">
                      静态回本 ≈ {Math.round(est.price / Math.max(1, est.yield))} 分钟（{formatCredits(est.yield)}/60秒）
                    </div>
                  </div>

                  <div className="mt-3">
                    {!owned ? (
                      <button
                        onClick={() => buyEstateById(est.id)}
                        disabled={state.credits < est.price}
                        className="w-full py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-slate-950 font-bold text-xs"
                      >
                        购置产业
                      </button>
                    ) : (
                      <div className="text-center text-[10px] text-green-400 font-bold py-1">
                        ✅ 分红收益中 (+{formatCredits(est.yield)}/60秒)
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {state.estates.length > 0 && (
            <div className="p-2 rounded-lg bg-green-950/30 border border-green-500/30 text-green-300 text-[11px] font-bold text-center">
              💰 当前房产组合每 60 秒总收入: {formatCredits(getEstateIncomePerMinute(state))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: News Feed */}
      {activeTab === 'news' && (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <div className="text-cyan-400 font-bold flex items-center gap-1 mb-1">
            <Newspaper size={13} />
            <span>赛博华尔街实时快讯（本会话最近 {state.news.length} 条）</span>
          </div>
          {state.news.map((item) => (
            <div key={item.id} className="p-2 rounded-lg bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-yellow-300">{item.title}</span>
                <span className="text-slate-500 text-[9px]">[{item.time}]</span>
              </div>
              <div className="text-slate-300 text-[10px]">{item.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
