import React, { useState, useRef, useEffect } from 'react';
import { Power } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { AppId } from '../../types';

export const Taskbar: React.FC = () => {
  const { windows, activeWindowId, openWindow, focusWindow, minimizeWindow, resetAll } = useGame();
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close start menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setStartMenuOpen(false);
      }
    };
    if (startMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [startMenuOpen]);

  const appList: { id: AppId; name: string; desc: string; icon: string; category: string }[] = [
    { id: 'wooden-fish', name: '赛博木鱼修仙', desc: '敲击积攒功德，量子飞升与法宝抽奖', icon: '📿', category: '修仙挂机' },
    { id: 'wheel-life', name: '赛博转盘修仙', desc: '武魂觉醒、命运大转盘、十万年魂环与渡劫飞升', icon: '🎡', category: '核心修仙' },
    { id: 'snake-arcade', name: '赛博街机贪吃蛇', desc: '霓虹像素贪吃蛇，吞噬Bug与内存赚取赛博币', icon: '🕹️', category: '街机游戏' },
    { id: 'cyber-pet', name: '机甲电子宠物', desc: '喂食养成，荒原探索捡稀有装备', icon: '🐕', category: '电子宠物' },
    { id: 'dungeon', name: '霓虹代码肉鸽', desc: 'Canvas 像素地下城，打怪掉宝消灭 Bug', icon: '⚔️', category: '核心游戏' },
    { id: 'stock-market', name: '赛博华尔街', desc: '实时 K 线波动，百倍杠杆炒币炒股', icon: '📈', category: '模拟交易' },
    { id: 'fishing', name: '赛博钓鱼码头', desc: '运河抛竿收竿，钓锦鲤王掉落法宝', icon: '🎣', category: '休闲摸鱼' },
    { id: 'market', name: '赛博交易所', desc: '出售背包道具，黑市购买盲盒与补给', icon: '🏪', category: '经济系统' },
    { id: 'doudizhu', name: '赛博斗地主', desc: '与两位 AI 三人局，叫地主炸金花倍率', icon: '🃏', category: '牌桌游戏' },
    { id: 'minesweeper', name: '量子扫雷 · 漏洞排查', desc: '排查系统高危恶意漏洞，掉落 0-Day 漏洞特征码与冷钱包', icon: '👾', category: '极客解压' },
    { id: 'forge', name: '八卦炼宝炉 · 2048', desc: '阵法合成升阶本命法宝，直达混沌青莲与诛仙真器', icon: '🔮', category: '法宝炼制' },
    { id: 'gacha', name: '赛博盲盒扭蛋机', desc: '抽卡开箱夜之城限量手办，激活全套永久被动羁绊', icon: '🎁', category: '潮玩收藏' },
    { id: 'daily-report', name: '摸鱼日报 · 黑话生成器', desc: '一键拉齐颗粒度生成大厂高维日报，每日领 $300 与小红花', icon: '📄', category: '职场整活' },
    { id: 'trophy-hall', name: '成就殿堂 · 荣誉展柜', desc: '全服荣誉勋章陈列室，里程碑嘉奖与赛博天尊加冕', icon: '🏆', category: '荣誉追求' },
    { id: 'synthwave', name: '8-Bit 合成编曲机', desc: '16 步进鼓机，原生 Web Audio 合成器', icon: '🎹', category: '摸鱼音乐' },
    { id: 'terminal', name: '黑客矩阵终端', desc: '命令行彩蛋，挂机挖矿与摸鱼黄历', icon: '💻', category: '系统工具' },
    { id: 'ambience', name: '赛博白噪音专注', desc: '雨夜机房白噪音与打工人番茄钟', icon: '☕', category: '健康摸鱼' },
    { id: 'system-settings', name: '系统与存档设置', desc: '导出/导入存档与重置系统', icon: '⚙️', category: '系统设置' },
  ];

  return (
    <footer
      style={{
        backgroundColor: 'var(--theme-bar-bg)',
        borderTopColor: 'var(--theme-border)',
      }}
      className="h-12 border-t fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-3 backdrop-blur-lg select-none transition-colors duration-300"
    >
      {/* Start Button & Start Menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setStartMenuOpen(!startMenuOpen)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded font-black text-xs tracking-wider transition-all duration-200 ${
            startMenuOpen
              ? 'bg-cyan-400 text-slate-950 shadow-neon-cyan'
              : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:brightness-110 shadow-md'
          }`}
        >
          <span className="text-base">⚡</span>
          <span>CYBER_START</span>
        </button>

        {/* Start Menu Popup */}
        {startMenuOpen && (
          <div className="absolute bottom-14 left-0 w-80 sm:w-96 rounded-xl bg-slate-950/95 border border-cyan-500/50 shadow-2xl p-4 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-3 duration-200 z-50">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-cyan-500/30 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-lg">
                  🛸
                </div>
                <div>
                  <div className="font-bold text-sm text-cyan-300">CYBERDECK OS</div>
                  <div className="text-[10px] text-slate-400">赛博摸鱼终端 2077 版</div>
                </div>
              </div>
              <button
                onClick={() => {
                  if (window.confirm('确定要重置所有游戏数据与存档吗？')) {
                    resetAll();
                    setStartMenuOpen(false);
                  }
                }}
                title="重置系统"
                className="p-1.5 rounded bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-400 hover:text-red-200 text-xs flex items-center gap-1"
              >
                <Power size={13} />
                <span>重置</span>
              </button>
            </div>

            {/* Application List */}
            <div className="text-xs text-slate-400 font-semibold mb-1 px-1">全部应用与游戏</div>
            <div className="grid grid-cols-1 gap-1.5 max-h-80 overflow-y-auto pr-1">
              {appList.map((app) => (
                <button
                  key={app.id}
                  onClick={() => {
                    openWindow(app.id);
                    setStartMenuOpen(false);
                  }}
                  className="flex items-center gap-3 p-2 rounded-lg bg-slate-900/60 hover:bg-cyan-950/50 border border-slate-800/80 hover:border-cyan-500/50 transition-all text-left group"
                >
                  <span className="text-2xl group-hover:scale-110 transition-transform">{app.icon}</span>
                  <div className="flex-1 truncate">
                    <div className="font-bold text-xs text-slate-200 group-hover:text-cyan-300 truncate">
                      {app.name}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{app.desc}</div>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    {app.category}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Open / Running Windows on Taskbar */}
      <div className="flex-1 flex items-center gap-1.5 mx-4 overflow-x-auto no-scrollbar py-1">
        {windows
          .filter((w) => w.isOpen)
          .map((win) => {
            const isActive = activeWindowId === win.id && !win.isMinimized;
            return (
              <button
                key={win.id}
                onClick={() => {
                  if (isActive) {
                    minimizeWindow(win.id);
                  } else {
                    focusWindow(win.id);
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-all border shrink-0 max-w-[170px] truncate ${
                  isActive
                    ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 shadow-neon-cyan'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-cyan-500/40 hover:text-slate-200'
                }`}
              >
                <span>{win.icon}</span>
                <span className="truncate">{win.title.split('(')[0].trim()}</span>
              </button>
            );
          })}
      </div>

      {/* Quick Launch Icons */}
      <div className="hidden sm:flex items-center gap-1">
        {appList.slice(0, 5).map((app) => (
          <button
            key={app.id}
            onClick={() => openWindow(app.id)}
            title={app.name}
            className="w-8 h-8 rounded-lg bg-slate-900/60 hover:bg-cyan-950/60 border border-slate-800 hover:border-cyan-500/40 flex items-center justify-center text-sm transition-transform hover:scale-110"
          >
            {app.icon}
          </button>
        ))}
      </div>
    </footer>
  );
};
