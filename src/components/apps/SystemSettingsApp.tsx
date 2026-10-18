import React, { useState } from 'react';
import { Trash2, Volume2, Monitor, Check, Copy, Download } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { exportSaveData, importSaveData, normalizeGameState } from '../../utils/storage';
import {
  ACHIEVEMENTS,
  HASHRATE_CAP,
  HASHRATE_DECAY_PER_PAYOUT,
  MERIT_TO_CREDIT_RATE,
  describeItemEffect,
  formatCredits,
  formatNumber,
  getUnlockedAchievementCount,
} from '../../utils/gameLogic';
import { clearPersistedFS } from '../../utils/virtualFS';
import { SoundFX } from '../../audio/SoundFX';
import type { GameState } from '../../types';

export const SystemSettingsApp: React.FC = () => {
  const { state, setSoundVolume, toggleCrt, resetAll, loadStateFromBase64, consumeItem, notify, showDialog } = useGame();
  const [importCode, setImportCode] = useState('');
  const [exportCode, setExportCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState('');
  const [importInfo, setImportInfo] = useState('');
  const [activeTab, setActiveTab] = useState<'inventory' | 'achievements' | 'system'>('inventory');

  // Achievements live in gameLogic.ts — each one grants a real, applied +5% merit bonus
  const unlockedCount = getUnlockedAchievementCount(state);

  /** Clipboard is best-effort: it is blocked in insecure contexts, in Firefox without
   *  a user gesture and in private windows — the code must still reach the player. */
  const handleExport = async () => {
    const code = exportSaveData(state);
    setExportCode(code);
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    setCopied(ok);
    SoundFX.playCash();
    setTimeout(() => setCopied(false), 2000);
    notify(
      ok
        ? {
            title: '存档码已复制到剪贴板',
            body: `${code.length} 个字符，同时也显示在下方文本框里，随时可手动复制或下载文件。`,
            icon: '📋',
            tone: 'success',
          }
        : {
            title: '剪贴板不可用，请手动复制或下载',
            body: `存档码（${code.length} 字符）已显示在下方文本框：请全选复制，或点“下载存档文件”。此刻你还没有任何备份，别直接关窗口！`,
            icon: '⚠️',
            tone: 'error',
          },
    );
  };

  const downloadFile = (name: string, text: string, mime: string) => {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      notify({ title: '存档文件已下载', body: name, icon: '💾', tone: 'success' });
    } catch {
      notify({ title: '下载被浏览器拦截', body: '请改用下方文本框手动复制存档码。', icon: '⚠️', tone: 'error' });
    }
  };

  const handleDownloadTxt = () => {
    const code = exportCode || exportSaveData(state);
    if (!exportCode) setExportCode(code);
    downloadFile(`cyberdeck-save-${new Date().toISOString().slice(0, 10)}.txt`, code, 'text/plain');
  };

  const handleDownloadJson = () => {
    const code = exportCode || exportSaveData(state);
    const decoded = importSaveData(code);
    if (!decoded) {
      notify({ title: '导出失败', body: '无法把存档码还原为 JSON，请使用 .txt 下载。', icon: '⚠️', tone: 'error' });
      return;
    }
    downloadFile(`cyberdeck-save-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(decoded, null, 2), 'application/json');
  };

  /** Accepts the Base64 code or a raw JSON dump (an older/edited backup) and returns Base64. */
  const toBase64 = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{')) {
      try {
        return exportSaveData(normalizeGameState(JSON.parse(trimmed) as Partial<GameState> as GameState));
      } catch {
        return null;
      }
    }
    return trimmed.replace(/\s+/g, '');
  };

  const handleImport = () => {
    setImportInfo('');
    const candidate = toBase64(importCode);
    if (!candidate) {
      setImportError('存档码为空或格式无法识别：请整段粘贴导出的 Base64（或以 { 开头的 JSON 存档）。');
      return;
    }
    const preview = importSaveData(candidate);
    if (!preview) {
      setImportError(
        `校验失败：这 ${candidate.length} 个字符不是本系统的存档（Base64 可解码，但解出的内容不是合法存档 JSON）。请确认复制完整、没有夹带空格或被聊天软件截断。`,
      );
      return;
    }
    if (!loadStateFromBase64(candidate)) {
      setImportError('存档码可解析，但核心拒绝了载入（可能被其它窗口覆盖），请重新导出后再试。');
      return;
    }
    setImportError('');
    setImportCode('');
    setImportInfo(
      `已载入：${formatCredits(preview.credits)} 赛博币 / ${formatNumber(preview.merit)} 功德 / 算力 ${preview.hashrate}/${HASHRATE_CAP} GH/s / 背包 ${preview.inventory.length} 件 / 成就 ${getUnlockedAchievementCount(preview)} 枚`,
    );
    notify({ title: '存档导入成功', body: `当前余额 ${formatCredits(preview.credits)}，功德 ${formatNumber(preview.merit)}。`, icon: '✅', tone: 'gold' });
  };

  /** Destructive: snapshot the save into the visible textarea first, so "格式化" is recoverable. */
  const handleReset = () => {
    const code = exportSaveData(state);
    setExportCode(code);
    setActiveTab('system');
    showDialog({
      id: 'settings-hard-reset',
      title: '确认格式化全部数据？',
      message: `不可逆操作：功德、赛博币、算力、宠物、背包、成就、待办与终端虚拟文件全部清零。\n\n已先把当前存档码（${code.length} 字符）填进「存档备份与同步」文本框，建议先复制或下载 .txt 再动手。\n（只是嫌屏幕乱的话，关掉窗口即可，不用格式化。）`,
      icon: '☠️',
      tone: 'red',
      confirmText: '我已备份，确认格式化',
      cancelText: '取消',
      onConfirm: () => {
        clearPersistedFS();
        resetAll();
        setImportInfo('');
        setImportError('');
        notify({ title: '已格式化', body: '全部数据与终端虚拟文件系统已重置为初始状态。', icon: '🧹', tone: 'warn' });
      },
    });
  };

  return (
    <div className="flex flex-col h-full space-y-2.5 font-mono text-xs select-none">
      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-cyan-500/30">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex-1 py-1 rounded text-center font-bold ${activeTab === 'inventory' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50' : 'text-slate-400'}`}
        >
          🎒 行囊背包 ({state.inventory.length})
        </button>
        <button
          onClick={() => setActiveTab('achievements')}
          className={`flex-1 py-1 rounded text-center font-bold ${activeTab === 'achievements' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50' : 'text-slate-400'}`}
        >
          🏅 成就勋章 ({unlockedCount}/{ACHIEVEMENTS.length})
        </button>
        <button
          onClick={() => setActiveTab('system')}
          className={`flex-1 py-1 rounded text-center font-bold ${activeTab === 'system' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50' : 'text-slate-400'}`}
        >
          ⚙️ 存档与设置
        </button>
      </div>

      {/* Tab 1: Inventory */}
      {activeTab === 'inventory' && (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {state.inventory.length === 0 ? (
            <div className="text-slate-500 text-center py-8 text-xs">
              背包空空如也，快去木鱼抽奖或地牢探险获取宝物吧！
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {state.inventory.map((item) => (
                <div
                  key={item.id}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                    item.rarity === 'legendary'
                      ? 'bg-amber-950/40 border-yellow-400 shadow-neon-gold'
                      : item.rarity === 'epic'
                      ? 'bg-purple-950/40 border-purple-400'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="text-3xl">{item.icon}</span>
                    <div className="truncate">
                      <div className="font-bold text-slate-200 truncate flex items-center gap-1.5">
                        <span>{item.name}</span>
                        <span className="text-[10px] text-yellow-400">x{item.count}</span>
                      </div>
                      <div className="text-[9px] text-slate-400 truncate">{item.desc}</div>
                      <div className="text-[9px] text-cyan-400 font-semibold truncate">✨ {describeItemEffect(item)}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const msg = consumeItem(item.id);
                      if (msg) alert(msg);
                    }}
                    className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-[10px] shrink-0"
                  >
                    使用
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Achievements */}
      {activeTab === 'achievements' && (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <div className="text-[10px] text-slate-400 mb-1">
            达成各项赛博神迹——每枚勋章真实提供全局功德获取 +5%（当前总加成 +{unlockedCount * 5}%）：
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ACHIEVEMENTS.map((ach) => {
              const unlocked = ach.check(state);
              return (
                <div
                  key={ach.id}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                    unlocked ? 'bg-yellow-950/30 border-yellow-400/60 shadow-neon-gold' : 'bg-slate-900/40 border-slate-800 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{ach.icon}</span>
                    <div>
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        <span className={unlocked ? 'text-yellow-300' : 'text-slate-400'}>{ach.title}</span>
                        {unlocked && <span className="text-[9px] text-green-400 font-bold">已达成</span>}
                      </div>
                      <div className="text-[9px] text-slate-400">{ach.desc}</div>
                      <div className="text-[9px] text-cyan-300 font-semibold mt-0.5">加成: {ach.reward}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: System & Storage */}
      {activeTab === 'system' && (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col justify-between space-y-2">
          {/* Audio & Display */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="text-[11px] font-bold text-slate-300">音效与显示</div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Volume2 size={13} />
                <span>主音量: {Math.round(state.soundVolume * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={state.soundVolume}
                onChange={(e) => setSoundVolume(Number(e.target.value))}
                className="w-28 accent-cyan-400 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Monitor size={13} />
                <span>复古 CRT 扫描线</span>
              </span>
              <button
                onClick={toggleCrt}
                className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${
                  state.crtEffect ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {state.crtEffect ? '开启' : '关闭'}
              </button>
            </div>
          </div>

          {/* Backup Export/Import */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="text-[11px] font-bold text-slate-300">存档备份与同步</div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleExport}
                className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 font-bold flex items-center justify-center gap-1"
              >
                {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                <span>{copied ? '已复制到剪贴板' : exportCode ? '重新生成并复制存档码' : '生成并复制存档码'}</span>
              </button>
              <button
                onClick={handleDownloadTxt}
                title="下载 Base64 存档 (可直接粘贴导入)"
                className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 flex items-center gap-1 text-[10px]"
              >
                <Download size={12} />
                .txt
              </button>
              <button
                onClick={handleDownloadJson}
                title="下载 JSON 存档 (可读/可编辑，同样支持导入)"
                className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 flex items-center gap-1 text-[10px]"
              >
                <Download size={12} />
                .json
              </button>
            </div>

            {/*剪贴板可能被浏览器拒绝：存档码必须始终可见可选中，否则玩家会以为已经备份成功 */}
            <textarea
              readOnly
              value={exportCode}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="点击上方按钮生成存档码；生成后这里会显示完整内容（可手动 Ctrl+C 复制）"
              rows={3}
              className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-[9px] text-slate-300 outline-none resize-y font-mono break-all"
            />
            <div className="text-[9px] text-slate-500">
              {exportCode
                ? `存档码 ${exportCode.length} 字符，为点击生成那一刻的快照；未复制成功时请手动全选复制或下载文件。`
                : '尚未生成存档码。浏览器禁用剪贴板（无痕/非 HTTPS）时，文本框与文件下载是兜底备份通道。'}
            </div>

            <textarea
              value={importCode}
              onChange={(e) => {
                setImportCode(e.target.value);
                if (importError) setImportError('');
              }}
              placeholder="粘贴 Base64 存档代码（或 JSON 存档）..."
              rows={3}
              className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-200 outline-none text-[10px] font-mono resize-y break-all"
            />
            <div className="flex items-center justify-between gap-1.5">
              <span className={`text-[9px] ${importError ? 'text-red-400' : 'text-slate-500'}`}>
                {importError || `已粘贴 ${importCode.trim().length} 字符${importCode.trim() && importCode.trim().length < 80 ? '（明显不完整，无法还原存档）' : ''}`}
              </span>
              <button
                onClick={handleImport}
                disabled={!importCode.trim()}
                className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs shrink-0"
              >
                导入
              </button>
            </div>
            {importInfo && <div className="text-[10px] text-green-300">✅ {importInfo}</div>}
          </div>

          {/* Real engine constants — the UI must not promise numbers the core doesn't honour */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1 text-[10px] text-slate-400">
            <div className="text-[11px] font-bold text-slate-300 mb-0.5">核心运行参数（与主循环同源）</div>
            <div className="flex items-center justify-between">
              <span>算力上限</span>
              <span className="text-cyan-300 font-bold">{HASHRATE_CAP} GH/s（终端 mine 每次 +5，超出即封顶）</span>
            </div>
            <div className="flex items-center justify-between">
              <span>算力结算 / 折旧</span>
              <span className="text-cyan-300 font-bold">
                每 30s 付 算力/4 赛博币，付完衰减 {(HASHRATE_DECAY_PER_PAYOUT * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>功德 → 赛博币汇率</span>
              <span className="text-cyan-300 font-bold">{MERIT_TO_CREDIT_RATE} / 功德</span>
            </div>
            <div className="flex items-center justify-between">
              <span>当前状态</span>
              <span className="text-yellow-300 font-bold">
                {formatCredits(state.credits)} · {formatNumber(state.merit)} 功德 · {state.hashrate}/{HASHRATE_CAP} GH/s
              </span>
            </div>
          </div>

          {/* Format & Reset */}
          <button
            onClick={handleReset}
            className="w-full py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-red-400 font-bold flex items-center justify-center gap-1 text-[11px]"
          >
            <Trash2 size={13} />
            <span>格式化清除全部数据（重置前自动导出存档码）</span>
          </button>
        </div>
      )}
    </div>
  );
};
