import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Palette, Package, Radio, X, CornerDownLeft } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { ThemeType } from '../../types';
import { SoundFX } from '../../audio/SoundFX';

interface PaletteItem {
  id: string;
  category: 'app' | 'command' | 'theme' | 'item' | 'system';
  title: string;
  subtitle: string;
  icon: string | React.ReactNode;
  action: () => void;
  badge?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const {
    state,
    windows,
    openWindow,
    setTheme,
    toggleCrt,
    toggleSound,
    toggleRadio,
    toggleDesktopPetRoam,
    consumeItem,
    showAlert,
    tapWoodenFish,
  } = useGame();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      SoundFX.playKeyClick();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build items catalog
  const allItems: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = [];

    // 1. All Applications
    windows.forEach((win) => {
      items.push({
        id: `app-${win.id}`,
        category: 'app',
        title: win.title.split(' (')[0],
        subtitle: `启动 / 置顶 ${win.id} 窗口`,
        icon: win.icon,
        badge: '应用',
        action: () => {
          openWindow(win.id);
          onClose();
        },
      });
    });

    // 2. Quick Actions
    items.push({
      id: 'cmd-woodfish',
      category: 'command',
      title: '敲击赛博木鱼 (+功德)',
      subtitle: '免开窗口直接心诚敲击一次电子木鱼',
      icon: '📿',
      badge: '功德',
      action: () => {
        tapWoodenFish(1);
        SoundFX.playWoodenFish();
        showAlert('📿 功德 +1！心如平湖，数据归宗。', '木鱼鸣响', '📿', 'cyan');
        onClose();
      },
    });

    items.push({
      id: 'cmd-radio',
      category: 'system',
      title: state.radioEnabled ? '关闭 📻 Cyber Radio FM' : '开启 📻 Cyber Radio FM',
      subtitle: '程序化原生生成式 80s 极客合成波电台',
      icon: <Radio size={16} className="text-pink-400" />,
      badge: '电台',
      action: () => {
        toggleRadio();
        onClose();
      },
    });

    items.push({
      id: 'cmd-pet-roam',
      category: 'system',
      title: state.pet.roamOnDesktop === false ? '开启 🐕 桌面桌宠漫游模式' : '收回 🐕 桌面桌宠至应用窗口',
      subtitle: '让机甲宠物在任务栏与桌面自由散步与互动',
      icon: '🐾',
      badge: '伴侣',
      action: () => {
        toggleDesktopPetRoam();
        onClose();
      },
    });

    items.push({
      id: 'cmd-crt',
      category: 'system',
      title: state.crtEffect ? '关闭复古 CRT 扫描线' : '开启复古 CRT 扫描线',
      subtitle: '切换 80 年代复古大头显示器横纹光栅',
      icon: '📺',
      badge: '滤镜',
      action: () => {
        toggleCrt();
        onClose();
      },
    });

    items.push({
      id: 'cmd-sound',
      category: 'system',
      title: state.soundEnabled ? '静音全场音效' : '开启全场音效',
      subtitle: '全局 Procedural Web Audio 合成音效开关',
      icon: '🔊',
      badge: '声音',
      action: () => {
        toggleSound();
        onClose();
      },
    });

    // 3. Themes
    const themes: { id: ThemeType; name: string; color: string }[] = [
      { id: 'cyberpunk', name: '霓虹青黑 (Cyberpunk)', color: '#00f0ff' },
      { id: 'matrix', name: '矩阵代码绿 (Matrix)', color: '#00ff66' },
      { id: 'synthwave', name: '复古合成粉 (Synthwave)', color: '#ff007f' },
      { id: 'gold', name: '帝王赛博金 (Imperial Gold)', color: '#ffd700' },
    ];
    themes.forEach((t) => {
      items.push({
        id: `theme-${t.id}`,
        category: 'theme',
        title: `切换系统主题：${t.name}`,
        subtitle: `设置全桌面颜色变量为 ${t.id}`,
        icon: <Palette size={16} style={{ color: t.color }} />,
        badge: '主题',
        action: () => {
          setTheme(t.id);
          SoundFX.playKeyClick();
          onClose();
        },
      });
    });

    // 4. Inventory Quick Inspection
    state.inventory.forEach((inv) => {
      items.push({
        id: `inv-${inv.id}`,
        category: 'item',
        title: `${inv.icon} ${inv.name} (存量: ${inv.count})`,
        subtitle: `${inv.desc}`,
        icon: <Package size={16} className="text-yellow-400" />,
        badge: '背包',
        action: () => {
          const res = consumeItem(inv.id);
          if (res) {
            showAlert(res, '道具已使用', inv.icon, 'cyan');
          }
          onClose();
        },
      });
    });

    return items;
  }, [
    windows,
    state.radioEnabled,
    state.pet.roamOnDesktop,
    state.crtEffect,
    state.soundEnabled,
    state.inventory,
    openWindow,
    onClose,
    tapWoodenFish,
    toggleRadio,
    toggleDesktopPetRoam,
    toggleCrt,
    toggleSound,
    setTheme,
    consumeItem,
    showAlert,
  ]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 10);
    const q = query.toLowerCase().trim();
    return allItems
      .filter((i) => i.title.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q) || i.category.includes(q))
      .slice(0, 12);
  }, [allItems, query]);

  // Reset selected index when user changes search query
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation inside palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      SoundFX.playKeyClick();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      SoundFX.playKeyClick();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const safeIdx = Math.min(selectedIndex, filteredItems.length - 1);
      const current = filteredItems[safeIdx];
      if (current) {
        current.action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[99998] flex items-start justify-center pt-[15vh] px-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-150 select-none font-mono"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-cyan-500/50 shadow-2xl shadow-cyan-950/80 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800/80 bg-slate-900/60">
          <Search size={18} className="text-cyan-400 shrink-0 animate-pulse" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="键入以搜索应用、快捷指令、主题、背包道具... (↑↓ 选择，回车执行)"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-slate-500 hover:text-slate-300 p-0.5">
              <X size={14} />
            </button>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            ESC 关闭
          </span>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1 divide-y divide-slate-800/30">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              未找到匹配指令或应用，尝试输入 `app`、`木鱼` 或 `主题`
            </div>
          ) : (
            (() => {
              const safeSelectedIndex = Math.min(selectedIndex, Math.max(0, filteredItems.length - 1));
              return filteredItems.map((item, idx) => {
                const isSelected = idx === safeSelectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-cyan-950/60 border border-cyan-500/50 text-cyan-200 shadow-neon-cyan'
                      : 'hover:bg-slate-900/60 text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center text-base shrink-0 border border-slate-800">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-xs truncate flex items-center gap-2">
                        <span>{item.title}</span>
                        {item.badge && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800/90 text-slate-400 border border-slate-700/60">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate opacity-80">{item.subtitle}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {isSelected && (
                      <span className="flex items-center text-[10px] text-cyan-400 font-bold gap-0.5 bg-cyan-900/40 px-2 py-0.5 rounded border border-cyan-500/30 animate-in fade-in">
                        <span>执行</span>
                        <CornerDownLeft size={11} />
                      </span>
                    )}
                  </div>
                </div>
              );
            });
          })()
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono">↑</kbd>
              <kbd className="px-1 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono ml-0.5">↓</kbd> 切换导航
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono">Enter</kbd> 执行选中
            </span>
          </div>
          <span className="text-cyan-500/80 font-bold">CYBERDECK COMMAND LINE</span>
        </div>
      </div>
    </div>
  );
};
