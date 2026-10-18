import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';
import { HASHRATE_CAP, formatCredits, formatNumber } from '../../utils/gameLogic';
import type { AppId, ThemeType } from '../../types';
import {
  FsResult,
  MAX_FILE_BYTES,
  VNode,
  collectFiles,
  formatListing,
  getNode,
  listDir,
  loadPersistedFS,
  makeDir,
  persistFS,
  removeNode,
  renderTree,
  resolvePath,
  setPerm,
  writeFile,
} from '../../utils/virtualFS';

type LineType = 'input' | 'output' | 'error' | 'success' | 'warn' | 'ascii';

interface OutputLine {
  id: number;
  text: string;
  type: LineType;
}

interface SimulatedProcess {
  pid: number;
  name: string;
  cpu: string;
  mem: string;
  reward: number;
}

// Two lines emitted in the same millisecond used to share `Date.now()` and collide as
// React keys (ls -l of a big directory rendered one row at random).
let lineSeq = 0;
const nextLineId = () => ++lineSeq;

const MAX_SCREEN_LINES = 300;
const CAT_MAX_LINES = 60;
const CAT_MAX_CHARS = 4000;
const GREP_MAX_LINES = 30;

const HACK_CD = 'terminal-hack';
const DDOS_CD = 'terminal-ddos';
const MINE_CD = 'terminal-mine';
const HACK_CD_MS = 15_000;
const DDOS_CD_MS = 20_000;
const MINE_CD_MS = 15_000;

/** Every target now carries a real success rate *and* a real penalty for failure. */
interface HackTarget {
  key: string;
  name: string;
  diff: string;
  rate: number;
  loot: number;
  merit: number;
  fine: number;
  meritLoss: number;
}

const HACK_TARGETS: HackTarget[] = [
  { key: 'corp', name: '荒坂重工财务服务器', diff: '简单', rate: 0.95, loot: 150, merit: 50, fine: 60, meritLoss: 10 },
  { key: 'bank', name: '量子第一中央银行', diff: '中等', rate: 0.75, loot: 320, merit: 100, fine: 160, meritLoss: 30 },
  { key: 'pentagon', name: '五角大楼天网主控中心', diff: '极难', rate: 0.52, loot: 600, merit: 200, fine: 380, meritLoss: 60 },
  { key: 'alien', name: '三体舰队智子广播中继站', diff: '神话', rate: 0.32, loot: 1400, merit: 500, fine: 600, meritLoss: 120 },
];

/** Ticket loot only falls from a *successful* risky run — and never from a 0-Day run,
 *  otherwise one exploit re-supplied the next one and the exploit was self-sustaining. */
const HACK_TICKET_CHANCE = 0.15;
const HACK_TICKET_TARGETS = ['bank', 'pentagon', 'alien'];
const ZERO_DAY_ITEM = '0-Day 漏洞特征码';
const ZERO_DAY_MULT = 2;

const MINE_HASH = 5;
const MINE_MERIT = 25;
/** Electricity scales with the rig you already own, so pumping hashrate forever stops paying. */
const powerBill = (hashrate: number) => 20 + Math.round(hashrate * 0.5);
const blockReward = (hashrate: number) => 18 + Math.round(hashrate * 0.25);
const GACHA_TICKET = {
  name: '赛博扭蛋抽奖券',
  icon: '🎫',
  desc: '黑客渗透绝密数据库截获的抽奖券！可在盲盒扭蛋机中免费抽取 1 次珍稀藏品',
  rarity: 'epic' as const,
};

type CmdGroup = 'fs' | 'sys' | 'net' | 'hack' | 'fun';

interface CmdSpec {
  name: string;
  alias?: string;
  args: string;
  group: CmdGroup;
  desc: string;
}

/** Single source of truth for `help` *and* Tab completion — the manual can no longer
 *  advertise commands the switch does not implement. */
const COMMANDS: CmdSpec[] = [
  { name: 'help', args: '', group: 'fs', desc: '显示本手册（与实现同源的命令注册表生成）' },
  { name: 'pwd', args: '', group: 'fs', desc: '显示当前工作目录' },
  { name: 'cd', args: '[目录]', group: 'fs', desc: '切换目录 (cd /secrets, cd ..)' },
  { name: 'ls', alias: 'dir', args: '[-l] [路径]', group: 'fs', desc: '列出文件；/apps 是真实的应用目录' },
  { name: 'tree', args: '[目录]', group: 'fs', desc: '递归打印目录树' },
  { name: 'find', args: '<关键词>', group: 'fs', desc: '全盘搜索文件名' },
  { name: 'cat', args: '<文件>', group: 'fs', desc: `查看文件 (超过 ${CAT_MAX_LINES} 行自动截断)` },
  { name: 'echo', args: '<内容> >|>> <文件>', group: 'fs', desc: '写入/追加文件 (父目录必须存在，单文件上限 64KB)' },
  { name: 'touch', args: '<文件>', group: 'fs', desc: '新建空文件 (父目录必须存在)' },
  { name: 'mkdir', args: '[-p] <目录>', group: 'fs', desc: '建目录；只有 -p 才连父目录一起建' },
  { name: 'rm', args: '[-r] <路径>', group: 'fs', desc: '删除文件/空目录；-r 连子目录 (拒绝 rm /)' },
  { name: 'grep', args: '<词> <文件>', group: 'fs', desc: '按行搜索文本' },
  { name: 'chmod', args: '<777|rwxr-xr-x> <路径>', group: 'fs', desc: '真实写入权限位，ls -l 立即可见' },
  { name: 'whoami', args: '', group: 'sys', desc: '查看当前用户与权限' },
  { name: 'uname', args: '[-a]', group: 'sys', desc: '查看内核版本' },
  { name: 'uptime', args: '', group: 'sys', desc: '查看运行时间与负载' },
  { name: 'date', args: '', group: 'sys', desc: '查看系统时间' },
  { name: 'df', args: '[-h]', group: 'sys', desc: '查看磁盘挂载空间' },
  { name: 'free', args: '[-m]', group: 'sys', desc: '查看内存占用' },
  { name: 'history', args: '', group: 'sys', desc: '查看最近执行的命令' },
  { name: 'neofetch', args: '', group: 'sys', desc: '系统概览 (功德/余额/算力 上限可见)' },
  { name: 'systemctl', args: '', group: 'sys', desc: '只读巡检：真实窗口数与桌面服务状态' },
  { name: 'top', args: '', group: 'sys', desc: '真实桌面负载 + 高危进程悬赏榜' },
  { name: 'htop', args: '', group: 'sys', desc: '算力/窗口占用条形图（读真实状态，非固定文案）' },
  { name: 'ps', args: '', group: 'sys', desc: '列出真实已打开窗口与悬赏进程' },
  { name: 'clear', args: '', group: 'sys', desc: '清空终端屏幕输出' },
  { name: 'reboot', args: '', group: 'sys', desc: '重载终端会话 (cwd/屏幕复位，不动存档)' },
  { name: 'open', args: '<app>', group: 'net', desc: '真正启动一个桌面应用窗口 (open market)' },
  { name: 'close', args: '<app>', group: 'net', desc: '关闭指定应用窗口' },
  { name: 'ifconfig', alias: 'ip', args: '[a]', group: 'net', desc: '查看网络接口 (仅回环，无外网)' },
  { name: 'ping', args: '<host>', group: 'net', desc: '回环延迟测试 (沙箱无外网出口)' },
  { name: 'curl', alias: 'wget', args: '<url|/本地路径>', group: 'net', desc: '只能读虚拟文件系统里的本地路径' },
  { name: 'ssh', args: '<host>', group: 'net', desc: '无外网出口，会明确拒绝而非假装成功' },
  { name: 'hack', args: '<corp|bank|pentagon|alien>', group: 'hack', desc: '渗透攻击；裸输 hack 查看成功率/奖惩表' },
  { name: 'ddos', args: '<host>', group: 'hack', desc: 'SYN 洪流，换取防拥堵津贴 (冷却 20s)' },
  { name: 'mine', args: '', group: 'hack', desc: `挖矿：付电费 ${powerBill(0)}+ 起，算力封顶 ${HASHRATE_CAP} GH/s` },
  { name: 'kill', args: '<pid>', group: 'hack', desc: '终结高危进程领取系统防御悬赏' },
  { name: 'sudo', args: '<cmd>', group: 'hack', desc: '当前已是 root，毁灭性指令会被拦截' },
  { name: 'crypto', alias: 'ticker', args: '', group: 'hack', desc: '查看实时加密盘口' },
  { name: 'ai', alias: 'chat', args: '<问题>', group: 'fun', desc: '向赛博毒舌 AI 提问' },
  { name: 'cowsay', args: '<文本>', group: 'fun', desc: '字符奶牛说骚话' },
  { name: 'sl', args: '', group: 'fun', desc: '蒸汽火车穿屏' },
  { name: 'matrix', args: '', group: 'fun', desc: '字符矩阵雨' },
  { name: 'weather', args: '<城市>', group: 'fun', desc: '查询赛博朋克天气' },
  { name: 'fortune', alias: 'moyu', args: '', group: 'fun', desc: '算一卦今日摸鱼运势' },
  { name: 'theme', args: '<name>', group: 'fun', desc: '切换主题 (cyberpunk/matrix/synthwave/gold)' },
];

const GROUP_TITLES: Record<CmdGroup, string> = {
  fs: '【📂 虚拟文件系统】',
  sys: '【⚙️ 系统巡检】',
  net: '【🌐 网络与应用窗口】',
  hack: '【⚔️ 黑客渗透与挖矿】',
  fun: '【🤖 赛博 AI 与彩蛋】',
};

const HELP_LINES: Array<{ text: string; type: LineType }> = [
  { text: '━━━━━━━━━━ CYBERDECK 命令行指令集 (由命令注册表生成，与实际实现同源) ━━━━━━━━━━', type: 'warn' },
  ...Object.keys(GROUP_TITLES).flatMap((g) => {
    const key = g as CmdGroup;
    return [
      { text: GROUP_TITLES[key], type: 'warn' as LineType },
      ...COMMANDS.filter((c) => c.group === key).map((c) => ({
        text: `  ${(c.alias ? `${c.name} / ${c.alias}` : c.name) + (c.args ? ` ${c.args}` : '')}  -  ${c.desc}`,
        type: 'output' as LineType,
      })),
    ];
  }),
  { text: '【⌨️ 终端快捷键与语法】', type: 'warn' },
  { text: '  ↑ / ↓ 命令历史   ·   Tab 补全命令与路径   ·   Ctrl+C 清空输入行   ·   Ctrl+L 或 Esc 清屏', type: 'output' },
  { text: '  参数支持 "双引号" 与 \'单引号\' 包裹含空格的文件名；-l/-la/-h/-p/-r 等 flag 已可正常解析', type: 'output' },
];

const commandNames = () => COMMANDS.flatMap((c) => (c.alias ? [c.name, c.alias] : [c.name]));

/** Quote-aware split — `cat "my notes.txt"` used to explode into three arguments. */
function tokenize(cmd: string): string[] {
  const out: string[] = [];
  const buf = /["']/;
  let cur = '';
  let quote: string | null = null;
  let started = false;
  for (const ch of cmd) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (buf.test(ch)) {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) {
        out.push(cur);
        cur = '';
        started = false;
      }
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started) out.push(cur);
  return out;
}

/** Strip `-l` / `-la` / `-h` style flags so they stop being parsed as paths. */
function splitFlags(tokens: string[]): { flags: Set<string>; args: string[] } {
  const flags = new Set<string>();
  const args: string[] = [];
  for (const t of tokens) {
    if (/^-[^-]/.test(t)) t.slice(1).split('').forEach((c) => flags.add(c));
    else if (t === '--help') flags.add('h');
    else args.push(t);
  }
  return { flags, args };
}

const APPS_MOUNT = '/apps';
const isReadOnlyMount = (path: string) => path === APPS_MOUNT || path.startsWith(`${APPS_MOUNT}/`);

/** `/apps` is a real read-only mount generated from the actual window registry. */
function withAppsMount(fs: VNode, apps: Array<{ id: string; icon: string; title: string; status: string }>): VNode {
  const children: Record<string, VNode> = {};
  for (const app of apps) {
    children[app.id] = {
      type: 'dir',
      readonly: true,
      children: {
        'window.info': {
          type: 'file',
          content: `id: ${app.id}\nname: ${app.title}\nicon: ${app.icon}\nstate: ${app.status}\n用法: open ${app.id} 启动窗口`,
        },
      },
    };
  }
  return { ...fs, children: { ...(fs.children ?? {}), apps: { type: 'dir', readonly: true, children } } };
}

const numericModeToSymbolic = (mode: string): string => {
  const digits = mode.slice(-3).split('').map((d) => {
    const n = Number(d);
    if (!Number.isInteger(n) || n < 0 || n > 7) return null;
    return `${n & 4 ? 'r' : '-'}${n & 2 ? 'w' : '-'}${n & 1 ? 'x' : '-'}`;
  });
  return digits.every(Boolean) ? digits.join('') : '';
};

const shortTitle = (title: string) => title.split(' · ')[0].split('(')[0].trim();

export const TerminalApp: React.FC = () => {
  const {
    state,
    windows,
    activeWindowId,
    openWindow,
    closeWindow,
    addCredits,
    addMerit,
    addHashrate,
    setTheme,
    addInventoryItem,
    spendItem,
    cooldownRemaining,
    startCooldown,
  } = useGame();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<OutputLine[]>([
    { id: nextLineId(), text: 'CYBERDECK MATRIX TERMINAL v3.1 [SECURE ROOT SHELL]', type: 'warn' },
    { id: nextLineId(), text: '✨ 指令手册与补全同源：输入 "help" 查看，Tab 补全命令/路径。', type: 'success' },
    { id: nextLineId(), text: '📌 屏幕输出不持久化（关闭终端即清空），但 /home/moyu 下写的文件会存进本地存档。', type: 'output' },
  ]);
  const [processes, setProcesses] = useState<SimulatedProcess[]>([
    { pid: 1024, name: 'memory_leak_demon', cpu: '88.4%', mem: '4.2GB', reward: 120 },
    { pid: 2048, name: 'hair_loss_agent.exe', cpu: '45.1%', mem: '1.8GB', reward: 80 },
    { pid: 4096, name: 'friday_prod_deploy', cpu: '99.9%', mem: '8.0GB', reward: 200 },
    { pid: 8192, name: 'infinite_loop_bug', cpu: '76.2%', mem: '2.5GB', reward: 100 },
  ]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [fsNotice, setFsNotice] = useState('');

  // Real virtual file system — persisted, so closing the window stops eating the files
  const [fs, setFs] = useState<VNode>(loadPersistedFS);
  const [cwd, setCwd] = useState('/home/moyu');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const appEntries = useMemo(
    () =>
      windows.map((w) => ({
        id: w.id as string,
        icon: w.icon,
        title: w.title,
        status: w.isOpen ? (w.isMinimized ? 'minimized' : 'running (前台)') : 'stopped',
      })),
    [windows],
  );

  const fsView = useMemo(() => withAppsMount(fs, appEntries), [fs, appEntries]);

  // High-risk processes occasionally respawn so the bounty hunt never dries up.
  // The random pick happens OUTSIDE the updater — a StrictMode double-invoke must not
  // roll two different bounties (or spend two rewards).
  useEffect(() => {
    const respawn = setInterval(() => {
      const pool = [
        { name: 'crypto_miner_worm', cpu: `${(30 + Math.random() * 60).toFixed(1)}%`, mem: `${(1 + Math.random() * 6).toFixed(1)}GB` },
        { name: 'segfault_poltergeist', cpu: `${(20 + Math.random() * 50).toFixed(1)}%`, mem: `${(0.5 + Math.random() * 4).toFixed(1)}GB` },
        { name: 'scope_creep_daemon', cpu: `${(40 + Math.random() * 55).toFixed(1)}%`, mem: `${(1 + Math.random() * 8).toFixed(1)}GB` },
        { name: 'null_ref_wraith', cpu: `${(25 + Math.random() * 60).toFixed(1)}%`, mem: `${(1 + Math.random() * 5).toFixed(1)}GB` },
      ];
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const spawn: SimulatedProcess = {
        pid: Math.floor(1000 + Math.random() * 9000),
        ...pick,
        reward: 60 + Math.floor(Math.random() * 150),
      };
      setProcesses((prev) => (prev.length >= 6 || prev.some((p) => p.pid === spawn.pid) ? prev : [...prev, spawn]));
    }, 30000);
    return () => clearInterval(respawn);
  }, []);

  /** Every FS mutation lands in state AND localStorage from the event handler,
   *  so a full/blocked storage quota is reported once instead of in an effect. */
  const commitFs = (next: VNode) => {
    setFs(next);
    setFsNotice(persistFS(next) ? '' : '⚠️ 文件系统无法写入 localStorage（存储已满或被禁用），文件仅保留在本次会话');
  };

  const append = (lines: OutputLine[]) => {
    if (lines.length === 0) return;
    setHistory((prev) => [...prev, ...lines].slice(-MAX_SCREEN_LINES));
  };

  const handleCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    SoundFX.playKeyClick();
    setCmdHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed).slice(0, 30)]);
    setHistoryIndex(-1);

    const lines: OutputLine[] = [{ id: nextLineId(), text: `root@cyberdeck:${cwd}$ ${trimmed}`, type: 'input' }];
    const say = (text: string, type: LineType = 'output') => lines.push({ id: nextLineId(), text, type });
    const sayMany = (texts: string[], type: LineType = 'output') => texts.forEach((t) => say(t, type));
    const commit = (res: FsResult, okText?: string) => {
      if (!res.ok) {
        say(`❌ ${res.error}`, 'error');
        return;
      }
      commitFs(res.root);
      if (okText) say(okText, 'success');
    };

    const tokens = tokenize(trimmed);
    const action = tokens[0] ?? '';
    const lowerAction = action.toLowerCase();
    const rawArgs = tokens.slice(1);
    const argStr = rawArgs.join(' ');
    const { flags, args } = splitFlags(rawArgs);
    const target = (i: number) => resolvePath(cwd, args[i] ?? '.');

    switch (lowerAction) {
      case 'help':
        HELP_LINES.forEach((l) => say(l.text, l.type));
        break;

      case 'ls':
      case 'dir': {
        const pathArg = args[0] ?? '.';
        const targetPath = resolvePath(cwd, pathArg);
        const node = getNode(fsView, targetPath);
        if (!node) {
          say(`${lowerAction}: ${pathArg}: No such file or directory`, 'error');
        } else if (node.type === 'file') {
          say(pathArg);
        } else if (flags.has('l') || flags.has('a')) {
          sayMany([`📂 ${targetPath}`, ...formatListing(targetPath, node)]);
        } else {
          const names = listDir(node).map((e) => (e.type === 'dir' ? `${e.name}/` : e.name));
          say(names.length ? names.join('   ') : '(空目录)', names.length ? 'output' : 'warn');
        }
        break;
      }

      case 'pwd':
        say(cwd);
        break;

      case 'cd': {
        const pathArg = args[0] ?? '/home/moyu';
        const targetPath = resolvePath(cwd, pathArg);
        const node = getNode(fsView, targetPath);
        if (!node) say(`cd: ${pathArg}: No such file or directory`, 'error');
        else if (node.type !== 'dir') say(`cd: ${pathArg}: Not a directory`, 'error');
        else setCwd(targetPath);
        break;
      }

      case 'tree': {
        const pathArg = args[0] ?? '.';
        const targetPath = resolvePath(cwd, pathArg);
        const node = getNode(fsView, targetPath);
        if (!node || node.type !== 'dir') say(`tree: ${pathArg}: Not a directory`, 'error');
        else sayMany([`📂 ${targetPath}`, '.', ...renderTree(node)]);
        break;
      }

      case 'find': {
        if (!argStr) {
          say('用法: find <关键词> — 全盘搜索文件名', 'warn');
          break;
        }
        const hits = collectFiles(fsView).filter((f) => f.path.toLowerCase().includes(argStr.toLowerCase()));
        say(hits.length ? `🔎 找到 ${hits.length} 个文件:` : '🔎 全盘搜索完毕，一无所获。', hits.length ? 'success' : 'output');
        sayMany(hits.slice(0, GREP_MAX_LINES).map((h) => h.path));
        if (hits.length > GREP_MAX_LINES) say(`  … 另有 ${hits.length - GREP_MAX_LINES} 条结果已省略`, 'warn');
        break;
      }

      case 'mkdir': {
        if (!argStr) {
          say('用法: mkdir [-p] <目录名>', 'warn');
          break;
        }
        const path = target(0);
        if (isReadOnlyMount(path)) {
          say(`mkdir: ${path}: 只读文件系统 (/apps 由窗口注册表实时生成)`, 'error');
          break;
        }
        commit(makeDir(fs, path, { parents: flags.has('p') }), `📁 已创建目录 ${path}`);
        break;
      }

      case 'rm': {
        if (!argStr) {
          say('用法: rm [-r] <文件或目录>', 'warn');
          break;
        }
        const path = target(0);
        if (isReadOnlyMount(path)) {
          say(`rm: ${path}: 只读文件系统，无法删除应用挂载点`, 'error');
          break;
        }
        commit(removeNode(fs, path, { recursive: flags.has('r') || flags.has('f') }), `🗑️ 已删除 ${path}`);
        break;
      }

      case 'cat': {
        if (!argStr) {
          say('用法: cat <文件> (支持相对路径, 例: cat boss_diary.txt)', 'error');
        } else {
          const pathArg = args[0];
          const path = resolvePath(cwd, pathArg);
          const node = getNode(fsView, path);
          if (!node) say(`cat: ${pathArg}: No such file or directory`, 'error');
          else if (node.type === 'dir') say(`cat: ${pathArg}: Is a directory`, 'error');
          else {
            // Cap the render: a 64KB file must not drop 64K of DOM nodes into the window.
            const all = (node.content ?? '').split('\n');
            const shown = all.slice(0, CAT_MAX_LINES);
            let chars = shown.join('\n').length;
            while (chars > CAT_MAX_CHARS && shown.length > 1) {
              chars -= shown.pop()!.length + 1;
            }
            sayMany(shown);
            const hidden = all.length - shown.length;
            if (hidden > 0) say(`… [已截断 ${hidden} 行 / ${(node.content ?? '').length} 字节，文件上限 ${MAX_FILE_BYTES / 1024}KB]`, 'warn');
          }
        }
        break;
      }

      case 'echo': {
        // echo text > file (or >> file to append) — writes into the persisted virtual FS
        const redirect = />>?/.exec(trimmed);
        if (!redirect) {
          say(rawArgs.length ? argStr : '');
          break;
        }
        const appendMode = redirect[0] === '>>';
        const content = tokenize(trimmed.slice(0, redirect.index).replace(/^echo\s*/i, '')).join(' ');
        const fileArg = tokenize(trimmed.slice(redirect.index + redirect[0].length))[0] ?? '';
        if (!fileArg) {
          say('echo: 缺少重定向目标 (用法: echo 内容 > 文件名)', 'error');
          break;
        }
        const filePath = resolvePath(cwd, fileArg);
        if (isReadOnlyMount(filePath)) {
          say(`echo: ${filePath}: 只读文件系统，无法写入`, 'error');
          break;
        }
        const before = getNode(fs, filePath);
        const finalContent =
          appendMode && before?.type === 'file' ? `${before.content ?? ''}\n${content}` : content;
        commit(writeFile(fs, filePath, finalContent), `✅ 已${appendMode ? '追加' : '写入'} ${filePath} (${finalContent.length} 字节) — 用 cat ${fileArg} 查看`);
        break;
      }

      case 'touch': {
        if (!argStr) {
          say('用法: touch <文件名>', 'warn');
          break;
        }
        const path = target(0);
        if (isReadOnlyMount(path)) {
          say(`touch: ${path}: 只读文件系统，无法写入`, 'error');
          break;
        }
        const existing = getNode(fs, path);
        commit(writeFile(fs, path, existing?.type === 'file' ? existing.content ?? '' : ''), `📄 已${existing ? '更新' : '创建'}文件 ${path}`);
        break;
      }

      case 'chmod': {
        if (args.length < 2) {
          say('用法: chmod <权限, 如 777 或 u+x> <目标文件>', 'warn');
          break;
        }
        const symbolic = /^[0-7]{3,4}$/.test(args[0]) ? numericModeToSymbolic(args[0]) : args[0].replace(/[^rwx-]/g, '');
        if (symbolic.length < 9) {
          say(`chmod: 无效的权限模式: ${args[0]} (例: chmod 755 file.txt)`, 'error');
          break;
        }
        const path = target(1);
        if (isReadOnlyMount(path)) {
          say(`chmod: ${path}: 只读文件系统，权限位由内核托管`, 'error');
          break;
        }
        commit(setPerm(fs, path, symbolic), `chmod: 已写入 ${path} 权限位 → ${symbolic} (用 ls -l ${path.replace(/\/[^/]*$/, '') || '.'} 验证)`);
        break;
      }

      case 'grep': {
        if (args.length < 2) {
          say('用法: grep <搜索词> <文件名>', 'warn');
        } else {
          const pattern = args[0];
          const fileArg = args[1];
          const node = getNode(fsView, resolvePath(cwd, fileArg));
          if (!node || node.type !== 'file') say(`grep: ${fileArg}: No such file`, 'error');
          else {
            const matches = (node.content || '').split('\n').filter((l) => l.includes(pattern));
            if (matches.length === 0) say(`未匹配到包含 "${pattern}" 的行。`);
            else {
              say(`🔎 匹配到 ${matches.length} 处结果${matches.length > GREP_MAX_LINES ? ` (显示前 ${GREP_MAX_LINES} 处)` : ''}:`, 'warn');
              sayMany(matches.slice(0, GREP_MAX_LINES).map((l) => `  > ${l}`), 'success');
            }
          }
        }
        break;
      }

      case 'whoami':
        say('root (uid=0 gid=0 groups=0(root),1337(cyberhacker))', 'success');
        break;

      case 'uname':
        say(flags.has('a') || !args.length ? 'Linux cyberdeck-2077 6.12.8-cyberdeck-rt #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux' : 'Linux');
        break;

      case 'uptime':
        say(` ${new Date().toLocaleTimeString()} up 42 days, 13:37,  1 user,  load average: 0.42, 0.99, 1.37`);
        break;

      case 'date':
        say(new Date().toString());
        break;

      case 'df': {
        const { bytes, files } = fsStats(fs);
        const quotaK = Math.max(1, files) * (MAX_FILE_BYTES / 1024);
        const usedK = Math.round(bytes / 1024);
        sayMany([
          'Filesystem      Size  Used Avail Use% Mounted on',
          '/dev/nvme0n1p2  1.0T  384G  640G  38% /',
          '/dev/matrix_sd1  64T   12T   52T  19% /mnt/quantum_vault',
          `vfs-overlay     ${quotaK}K   ${usedK}K   ${Math.max(0, quotaK - usedK)}K   ${fsUsagePercent(fs)}%  / (真实可写区: ${files} 个文件, 单文件上限 ${MAX_FILE_BYTES / 1024}KB)`,
        ]);
        break;
      }

      case 'free':
        sayMany([
          '               total        used        free      shared  buff/cache   available',
          'Mem:           64320       18420       32100        1240       13800       44200',
          'Swap:          16384         256       16128',
        ]);
        break;

      case 'history':
        say('=== 最近执行的终端命令 ===', 'warn');
        sayMany(cmdHistory.slice(0, 15).reverse().map((h, i) => `  ${i + 1}  ${h}`));
        break;

      case 'sudo':
        if (argStr.includes('rm -rf')) {
          SoundFX.playAlert();
          addMerit(-10);
          sayMany(
            [
              `⚠️ 警报！检测到毁灭性指令 ${argStr}！`,
              `🔥 防火墙拦截了本次操作！功德 -10 以示惩戒！`,
            ],
            'error',
          );
        } else {
          sayMany([
            '[sudo] 当前终端默认已是最高 Root 特权级别，无需使用 sudo。',
            '“能力越大，责任越大。请务必谨慎操作，切勿轻易 rm -rf /”',
          ]);
        }
        break;

      case 'ifconfig':
      case 'ip':
        sayMany([
          'lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384',
          '        inet 127.0.0.1  netmask 255.0.0.0',
          'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST> mtu 1500',
          '        inet 192.168.2077.77  netmask 255.255.255.0  broadcast 192.168.2077.255',
          '⚠️ 本系统是浏览器沙箱，无外网出口：仅回环接口可用，curl/ssh/ping 不会真的发包。',
        ]);
        break;

      case 'curl':
      case 'wget': {
        const spec = args[0] ?? '';
        const localPath = spec.replace(/^(https?|file):\/\/(localhost|cyberdeck2077\.local)/, '');
        if (!spec) {
          say(`用法: curl <url> 或 curl /etc/motd — 本系统无外网出口，只能读取虚拟文件系统`, 'warn');
          break;
        }
        if (!localPath.startsWith('/')) {
          say(`curl: (7) 无法解析 ${spec} — 沙箱内 DNS 已禁用，本系统没有外网出口。`, 'error');
          say('提示: 试 curl /etc/motd 读取本地文件，或 open <app> 启动真实窗口。');
          break;
        }
        const node = getNode(fsView, localPath);
        if (!node) say(`curl: ${localPath}: 404 Not Found (虚拟文件系统里没有这个路径)`, 'error');
        else if (node.type === 'dir') say(`curl: ${localPath}: 这是一个目录，改用 ls ${localPath}`);
        else {
          say(`> GET file://${localPath} (HTTP/1.1 200 OK, 本地回环)`, 'success');
          const body = (node.content ?? '').split('\n');
          sayMany(body.slice(0, CAT_MAX_LINES));
          if (body.length > CAT_MAX_LINES) say(`… [已截断 ${body.length - CAT_MAX_LINES} 行]`, 'warn');
        }
        break;
      }

      case 'ssh':
        say(`OpenSSH_9.6p1: Connecting to ${args[0] || 'matrix.nightcity.net'} port 22...`, 'output');
        say('ssh: Could not resolve hostname: 沙箱内没有外网出口，本命令不会伪造登录成功。', 'error');
        say('💡 唯一能“进入”的终端是本地窗口：open <app>（ls /apps 查看全部应用）。');
        break;

      case 'ping': {
        const pHost = args[0] || 'localhost';
        say(`PING ${pHost} (127.0.0.1): 56 data bytes`);
        say('64 bytes from 127.0.0.1: icmp_seq=0 ttl=64 time=0.042 ms');
        say('64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time=0.038 ms');
        say(`--- ${pHost} ping statistics: 回环测试 0% packet loss（外网地址不可达）---`, 'success');
        break;
      }

      case 'reboot': {
        // Honest reboot: nothing in the browser can restart the host, but the terminal
        // session itself really is torn down and re-initialised here.
        setHistory([
          { id: nextLineId(), text: '[REBOOT] 正在同步虚拟磁盘缓存... [OK]', type: 'warn' },
          { id: nextLineId(), text: '[REBOOT] 重新加载 CyberDeck 终端会话：cwd 与屏幕已复位（存档、算力、文件均未改动）', type: 'success' },
          { id: nextLineId(), text: '注：浏览器沙箱无法重启宿主机；如需清屏请用 clear 或 Ctrl+L。', type: 'output' },
          { id: nextLineId(), text: 'CYBERDECK MATRIX TERMINAL v3.1 [SECURE ROOT SHELL]', type: 'warn' },
        ]);
        setCwd('/home/moyu');
        setInput('');
        SoundFX.playLevelUp();
        return;
      }

      case 'systemctl': {
        const running = windows.filter((w) => w.isOpen).length;
        sayMany([
          '● cyberdeck-desktop.service — CyberDeck OS 桌面会话管理器',
          '     Loaded: loaded (/etc/systemd/system/cyberdeck.service; enabled; preset: enabled)',
          `     Active: ${running > 0 ? 'active (running)' : 'active (idle)'} · 主题 ${state.theme} · CRT ${state.crtEffect ? 'on' : 'off'} · 电台 ${state.radioEnabled ? 'on' : 'off'} · 音量 ${Math.round(state.soundVolume * 100)}%`,
          `   Main PID: ${windows.findIndex((w) => w.id === activeWindowId) + 1 || 1} (cyberdeck-shell)`,
          `      Tasks: ${running} (窗口) / ${windows.length} (已注册应用, limit: 4915)`,
          `     Memory: ${(1.2 + running * 0.18).toFixed(1)}G (peak: 3.4G)`,
          'ⓘ 本命令为只读巡检，不会伪造服务启停；要启动应用请用 open <app>。',
        ]);
        break;
      }

      case 'htop': {
        const running = windows.filter((w) => w.isOpen).length;
        const load = Math.min(100, Math.round((state.hashrate / HASHRATE_CAP) * 100));
        sayMany([
          `1  [${bar(load)}${load}%]   量子算力 ${state.hashrate}/${HASHRATE_CAP} GH/s`,
          `2  [${bar(Math.min(100, running * 12))}%]        桌面窗口 ${running}/${windows.length} (打开越多占用越高)`,
          `Mem[||||||||||||||||| 28.6% 18.4G/64.3G]  Swp[| 1.5% 256M/16.0G]`,
          `Tasks: ${running + processes.length}, ${running} ui; ${processes.length} hostile | Load average: 0.42 0.99 1.37`,
        ]);
        break;
      }

      case 'top':
      case 'ps': {
        const open = windows.filter((w) => w.isOpen);
        say('=== 桌面真实进程 (已打开窗口) ===', 'warn');
        if (open.length === 0) say('  (无已打开窗口 — 试试 "open market" 或 "open dungeon")');
        open.forEach((w) =>
          say(
            `  ${w.icon}  ${w.id.padEnd(16)} ${shortTitle(w.title).padEnd(18)} ${w.id === activeWindowId ? '前台' : w.isMinimized ? '最小化' : '后台'}`,
          ),
        );
        say(`=== 高危进程悬赏 (kill <pid> 领赏) ===`, 'warn');
        [...processes]
          .sort((a, b) => parseFloat(b.cpu) - parseFloat(a.cpu))
          .forEach((p) =>
            say(`  ${String(p.pid).padEnd(6)}root   ${p.cpu.padEnd(7)}${p.mem.padEnd(7)}${p.name.padEnd(24)}RUNNING  赏金 ${formatCredits(p.reward)}`),
          );
        if (lowerAction === 'top') say(`  算力 ${state.hashrate}/${HASHRATE_CAP} GH/s | 余额 ${formatCredits(state.credits)} | 功德 ${formatNumber(state.merit)}`, 'success');
        say('💡 窗口进程只读展示；悬赏进程用 "kill <pid>" 终结。', 'success');
        break;
      }

      case 'open': {
        const wanted = (args[0] || '').toLowerCase();
        if (!wanted) {
          say('用法: open <app> — 可用应用见 ls /apps', 'warn');
          say('  ' + appEntries.map((a) => a.id).join('  '));
          break;
        }
        const hit =
          appEntries.find((a) => a.id === wanted) ??
          appEntries.find((a) => a.id.includes(wanted) || shortTitle(a.title).toLowerCase().includes(wanted) || a.title.toLowerCase().includes(wanted));
        if (!hit) {
          say(`open: 未找到应用 ${wanted}。输入 ls /apps 查看真实可启动列表。`, 'error');
          break;
        }
        openWindow(hit.id as AppId);
        say(`🚀 已启动窗口 ${hit.icon} ${hit.title} (ps 可查，close ${hit.id} 可关)`, 'success');
        break;
      }

      case 'close': {
        const wanted = (args[0] || '').toLowerCase();
        const hit = appEntries.find((a) => a.id === wanted) ?? appEntries.find((a) => a.id.includes(wanted));
        if (!hit) {
          say(`close: 未找到应用 ${wanted || '(缺少参数)'}。用法: close <app>`, 'error');
          break;
        }
        closeWindow(hit.id as AppId);
        say(`🛑 已关闭窗口 ${hit.icon} ${shortTitle(hit.title)}`, 'warn');
        break;
      }

      case 'kill': {
        const targetPid = parseInt(args[0], 10);
        const procIdx = processes.findIndex((p) => p.pid === targetPid);
        if (procIdx >= 0) {
          const killed = processes[procIdx];
          // Read-then-strip: the bounty is applied once, outside the state updater.
          setProcesses((prev) => prev.filter((p) => p.pid !== targetPid));
          const credited = addCredits(killed.reward);
          addMerit(30);
          SoundFX.playLevelUp();
          const gained = credited > 0 ? credited : killed.reward;
          say(`[SIGKILL 9] 成功终止高危进程 【${killed.name}】 (PID: ${killed.pid})！`, 'success');
          say(`🎉 获得系统防御悬赏 ${formatCredits(gained)} 赛博币 与 30 点功德！`, 'success');
        } else {
          say(`kill: (${args[0] ?? ''}): 进程未找到。输入 "ps" 查看有效 PID。`, 'error');
        }
        break;
      }

      case 'hack': {
        const remaining = cooldownRemaining(HACK_CD);
        if (remaining > 0) {
          say(`[-] 防火墙正在反向追踪！入侵模块冷却中 (剩余 ${remaining}s，冷却已持久化，刷新/开新标签页也不会归零)...`, 'error');
          break;
        }
        const printTable = () => {
          say('渗透战况表 (冷却 15s，风险自负；0-Day 特征码 = 必定成功且奖励 ×2):', 'warn');
          HACK_TARGETS.forEach((t) =>
            say(
              `  ${t.key.padEnd(9)}${t.diff.padEnd(6)}成功率 ${String(Math.round(t.rate * 100)).padStart(3)}%  成功 +${formatCredits(t.loot)} +${t.merit}功德  失败 -${formatCredits(t.fine)} -${t.meritLoss}功德`,
            ),
          );
          say('  用法: hack <target>，例: hack corp');
        };
        const key = (args[0] || '').toLowerCase();
        if (!key) {
          printTable();
          break;
        }
        const tInfo = HACK_TARGETS.find((t) => t.key === key);
        if (!tInfo) {
          say(`[-] 未知目标: ${key}。可选: ${HACK_TARGETS.map((t) => t.key).join(', ')}`, 'error');
          break;
        }
        const zeroDay = state.inventory.find((i) => i.name === ZERO_DAY_ITEM && i.count > 0);
        startCooldown(HACK_CD, HACK_CD_MS);
        say(`[+] 正在锁定目标: 【${tInfo.name}】 (难度: ${tInfo.diff})...`);
        say(
          `[+] 注入 ${zeroDay ? '0-Day 绝密特征码' : '通用内存溢出 Shellcode 0xDEADBEEF'}... 成功率 ${
            zeroDay ? '100% (0-Day 保证)' : `${Math.round(tInfo.rate * 100)}%`
          } | 失败将被反追踪罚款 ${formatCredits(tInfo.fine)} + 功德 -${tInfo.meritLoss}`,
        );

        if (zeroDay) spendItem(zeroDay.id, 1);
        const success = !!zeroDay || Math.random() < tInfo.rate;

        if (!success) {
          const paid = addCredits(-tInfo.fine);
          addMerit(-tInfo.meritLoss);
          SoundFX.playAlert();
          const fine = paid < 0 ? -paid : Math.min(tInfo.fine, Math.max(0, state.credits));
          sayMany(
            [
              `[-] 入侵失败！IDS 已锁定你的出口节点，${fine > 0 ? `反追踪罚款 ${formatCredits(fine)}` : '账户已见底，仅记录在案'}。`,
              `💀 目标防御等级 ${tInfo.diff}：功德 -${tInfo.meritLoss}，冷却 ${HACK_CD_MS / 1000}s 后重来 (hack 查看成功率表)。`,
            ],
            'error',
          );
          break;
        }

        const mult = zeroDay ? ZERO_DAY_MULT : 1;
        const loot = Math.round(tInfo.loot * mult);
        const meritGain = Math.round(tInfo.merit * mult);
        const credited = addCredits(loot);
        addMerit(meritGain);
        SoundFX.playLevelUp();
        const gained = credited > 0 ? credited : loot;
        if (zeroDay) {
          say('👾 [0-DAY EXPLOIT ACTIVATED] 消耗扫雷截获的【0-Day 漏洞特征码】：防火墙形同虚设，奖励 ×2！', 'warn');
        }
        say(`🎉 渗透成功！获取 Root 权限，掠夺 ${formatCredits(gained)} 赛博币 + ${meritGain} 功德！ (冷却 ${HACK_CD_MS / 1000}s)`, 'success');
        if (!zeroDay && HACK_TICKET_TARGETS.includes(tInfo.key) && Math.random() < HACK_TICKET_CHANCE) {
          addInventoryItem({ ...GACHA_TICKET, id: `item-ticket-${Date.now()}`, count: 1 });
          say('🎫 战利品掉落：截获【赛博扭蛋抽奖券】x1 已收入背包！', 'warn');
        }
        break;
      }

      case 'ddos': {
        const ddosRemaining = cooldownRemaining(DDOS_CD);
        if (ddosRemaining > 0) {
          say(`[-] 僵尸网络负载过高，DDoS 冷却中 (剩余 ${ddosRemaining}s)...`, 'error');
          break;
        }
        startCooldown(DDOS_CD, DDOS_CD_MS);
        const dTarget = args[0] || 'bug-server.internal';
        const credited = addCredits(50);
        SoundFX.playCash();
        sayMany([
          `[DDOS] 发送 1,000,000 SYN 洪流至 ${dTarget}...`,
          `[■■■■■■■■■■■■■■■■■■■■] 100% 目标带宽已瘫痪！`,
          `系统奖励防拥堵津贴 ${formatCredits(Math.max(0, credited) || 50)} 赛博币！ (冷却 ${DDOS_CD_MS / 1000}s，冷却已持久化)`,
        ]);
        break;
      }

      case 'mine': {
        const mineRemaining = cooldownRemaining(MINE_CD);
        if (mineRemaining > 0) {
          say(`[-] 矿机算力单元过热，冷却中 (剩余 ${mineRemaining}s)...`, 'error');
          break;
        }
        const bill = powerBill(state.hashrate);
        if (state.credits < bill) {
          say(`[-] 电费账户余额不足：本次挖矿需付 ${formatCredits(bill)}，当前仅 ${formatCredits(state.credits)}。`, 'error');
          say('💡 电费随算力上涨 (20 + 算力×0.5)，算力越高越烧钱。');
          break;
        }
        const atCap = state.hashrate >= HASHRATE_CAP;
        const nextHash = Math.min(HASHRATE_CAP, state.hashrate + MINE_HASH);
        const reward = blockReward(state.hashrate);
        const net = reward - bill;
        startCooldown(MINE_CD, MINE_CD_MS);
        const credited = addCredits(net);
        addMerit(MINE_MERIT);
        if (!atCap) addHashrate(MINE_HASH);
        SoundFX.playCash();
        const delta = credited !== 0 ? credited : net;
        say(`[+] 量子分布式挖矿已启动：电力账单 -${formatCredits(bill)}，区块奖励 +${formatCredits(reward)}。`, 'output');
        say(
          `${delta >= 0 ? '[+]' : '[-]'} 净收支 ${delta >= 0 ? '+' : '-'}${formatCredits(Math.abs(delta))} 赛博币，功德 +${MINE_MERIT}${
            atCap ? `；算力已达上限 ${HASHRATE_CAP} GH/s，本次不再叠加` : `，算力 ${state.hashrate} → ${nextHash}/${HASHRATE_CAP} GH/s`
          }`,
          delta >= 0 ? 'success' : 'warn',
        );
        say(
          `⚙️ 折旧提示：主循环每 30s 结算 算力/4 赛博币，结算后算力自身衰减 3% — 想守住 ${nextHash} GH/s 就得持续交电费。`,
          'output',
        );
        break;
      }

      case 'crypto':
      case 'ticker':
        say('=== 实时赛博加密盘口 ===', 'warn');
        state.stocks.forEach((s) =>
          say(`${s.symbol.padEnd(8)}: $${s.price.toFixed(2).padEnd(10)} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent}%)`, s.changePercent >= 0 ? 'success' : 'error'),
        );
        break;

      case 'matrix':
        // Rolled once inside the handler and frozen into the output lines — never during a re-render
        sayMany(
          Array.from({ length: 4 }, (_, i) => Array.from({ length: 48 }, (_, k) => ((i * 48 + k + lineSeq) % 3 ? '1' : '0')).join('')),
          'success',
        );
        break;

      case 'neofetch':
        sayMany([
          '  ______   __  __   ____    ______   _____  ',
          ' / ____/  / / / /  / __ )  / ____/  / ___/  ',
          '/ /      / /_/ /  / __  | / __/     \\__ \\   ',
          '/ /___   / __  /  / /_/ / / /___    ___/ /   ',
          '\\____/  /_/ /_/  /_____/ /_____/   /____/    ',
          `OS: CyberDeck 2077 OS x86_64  (theme: ${state.theme})`,
          `Kernel: 6.9.42-quantum-generic | 窗口 ${windows.filter((w) => w.isOpen).length}/${windows.length} 打开`,
          `Merit: ${formatNumber(state.merit)} | Credits: ${formatCredits(state.credits)} | Hashrate: ${state.hashrate}/${HASHRATE_CAP} GH/s`,
          `磁盘: 虚拟 FS 已持久化 (${fsContentBytes(fs)} 字节, 单文件上限 ${MAX_FILE_BYTES / 1024}KB)`,
        ], 'output');
        break;

      case 'fortune':
      case 'moyu':
        say(`🔮 今日赛博黄历: ${FORTUNES[Math.floor(Math.random() * FORTUNES.length)]}`, 'warn');
        break;

      case 'weather':
        say(`🌦️ 【${argStr || '夜之城'} 天气】: 酸雨 28℃ | 辐射等级: 微量 | 空气质量: 纳米微尘轻度污染 | 建议: 佩戴赛博呼吸阀与防静电雨伞。`, 'warn');
        break;

      case 'ai':
      case 'chat': {
        if (!argStr) {
          say('用法: ai <你想问的问题> (例: ai 怎样年薪百万还不用加班)', 'warn');
          break;
        }
        const picked = AI_REPLIES[Math.floor(Math.random() * AI_REPLIES.length)];
        say(picked, 'success');
        SoundFX.playWoodenFish(1.5);
        break;
      }

      case 'cowsay': {
        const cowMsg = argStr || '赛博打工人，功德加满！';
        const bar = '-'.repeat(cowMsg.length + 4);
        say(
          `\n  ${bar}\n< ${cowMsg} >\n  ${bar}\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||`,
          'ascii',
        );
        break;
      }

      case 'sl':
        say(TRAIN_ART, 'warn');
        SoundFX.playLevelUp();
        break;

      case 'theme': {
        const t = args[0] as ThemeType;
        if (['cyberpunk', 'matrix', 'synthwave', 'gold'].includes(t)) {
          setTheme(t);
          say(`[+] 主题已成功切换为: ${t}`, 'success');
          SoundFX.playCash();
        } else {
          say(`[-] 可选主题: cyberpunk, matrix, synthwave, gold`, 'error');
        }
        break;
      }

      case 'clear':
        setHistory([]);
        setInput('');
        return;

      default:
        say(`zsh: command not found: ${action}. 输入 "help" 查看 ${commandNames().length} 条可用指令。`, 'error');
        break;
    }

    append(lines);
    setInput('');
  };

  /** Tab completion for command names and virtual-FS paths. */
  const handleTab = (value: string) => {
    if (!value) return;
    const trailingSpace = /\s$/.test(value);
    const tokens = tokenize(value);
    const last = trailingSpace ? '' : tokens[tokens.length - 1] ?? '';
    const prefix = trailingSpace || !tokens.length ? value : value.slice(0, value.length - last.length);
    let candidates: string[] = [];
    if (tokens.length <= 1 && !trailingSpace) {
      candidates = commandNames().filter((n) => n.startsWith(last.toLowerCase()));
    } else {
      const dirPart = last.includes('/') ? last.slice(0, last.lastIndexOf('/') + 1) : '';
      const stem = last.slice(dirPart.length);
      const node = getNode(fsView, resolvePath(cwd, dirPart || '.'));
      candidates = node?.type === 'dir' ? Object.keys(node.children ?? {}).filter((n) => n.startsWith(stem)) : [];
      candidates = candidates.map((c) => `${dirPart}${c}${getNode(fsView, resolvePath(cwd, `${dirPart}${c}`))?.type === 'dir' ? '/' : ''}`);
    }
    if (candidates.length === 1) setInput(`${prefix}${candidates[0]} `);
    else if (candidates.length > 1) {
      const shown = candidates.slice(0, 16);
      append([
        { id: nextLineId(), text: `${prefix}${shown.join('   ')}${candidates.length > shown.length ? `   …(+${candidates.length - shown.length})` : ''}`, type: 'warn' },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const nextIdx = Math.min(cmdHistory.length - 1, historyIndex + 1);
        setHistoryIndex(nextIdx);
        setInput(cmdHistory[nextIdx]);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setInput(cmdHistory[nextIdx]);
      } else {
        setHistoryIndex(-1);
        setInput('');
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      handleTab(input);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setHistory([]);
      return;
    }
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      // Only swallow Ctrl+C while the caret is in this input — copy still works elsewhere
      const sel = window.getSelection?.();
      if (!sel || sel.isCollapsed || inputRef.current?.contains(sel.anchorNode)) {
        e.preventDefault();
        setInput('');
        append([{ id: nextLineId(), text: `${cwd}$ ^C`, type: 'warn' }]);
      }
      return;
    }
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      setHistory([]);
    }
  };

  const hackLeft = cooldownRemaining(HACK_CD);
  const mineLeft = cooldownRemaining(MINE_CD);
  const ddosLeft = cooldownRemaining(DDOS_CD);

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-xl p-3 font-mono text-xs text-green-400 border border-green-500/30 overflow-hidden select-text">
      {/* Live hardware strip: the caps and cooldowns are part of the UI, not hidden in a switch */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pb-1.5 mb-1.5 border-b border-green-500/20 text-[10px] text-slate-400">
        <span>
          算力 <b className="text-cyan-300">{state.hashrate}/{HASHRATE_CAP} GH/s</b>
        </span>
        <span>
          余额 <b className="text-green-300">{formatCredits(state.credits)}</b>
        </span>
        <span>
          功德 <b className="text-yellow-300">{formatNumber(state.merit)}</b>
        </span>
        <span className={hackLeft ? 'text-red-400' : 'text-green-500'}>hack {hackLeft ? `${hackLeft}s` : '就绪'}</span>
        <span className={mineLeft ? 'text-red-400' : 'text-green-500'}>mine {mineLeft ? `${mineLeft}s` : '就绪'}</span>
        <span className={ddosLeft ? 'text-red-400' : 'text-green-500'}>ddos {ddosLeft ? `${ddosLeft}s` : '就绪'}</span>
        <span className="ml-auto text-slate-500">关闭终端将清空屏幕输出{fsNotice ? ` · ${fsNotice}` : ''}</span>
      </div>

      {/* Output Terminal Area */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 font-mono">
        {history.map((line) => (
          <div
            key={line.id}
            className={`leading-relaxed break-words whitespace-pre-wrap ${
              line.type === 'input'
                ? 'text-cyan-300 font-bold'
                : line.type === 'error'
                ? 'text-red-400'
                : line.type === 'success'
                ? 'text-green-300 font-bold'
                : line.type === 'warn'
                ? 'text-yellow-400 font-semibold'
                : line.type === 'ascii'
                ? 'text-pink-300 leading-tight'
                : 'text-slate-300'
            }`}
          >
            {line.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input Prompt */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleCommand(input);
        }}
        className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800"
      >
        <span className="text-cyan-400 font-bold shrink-0">root@cyberdeck:{cwd}$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='输入指令 (help 查看手册, Tab 补全, open market, hack corp, cat "文件")...'
          className="flex-1 bg-transparent border-none outline-none text-green-300 font-mono placeholder:text-slate-600"
          autoFocus
          spellCheck={false}
        />
        <button
          type="submit"
          className="px-3 py-1 rounded bg-green-950/80 hover:bg-green-900 border border-green-500/40 text-green-300 text-[10px]"
        >
          执行
        </button>
      </form>
    </div>
  );
};

const bar = (percent: number) => '█'.repeat(Math.round(percent / 5)).padEnd(20, '░');

const FORTUNES = [
  '宜：准点下班、带薪如厕、假装思考架构、敲赛博木鱼。忌：周五傍晚提 PR。',
  '宜：喝冰美式、重构代码、摸鱼看行情。忌：把生产数据库当测试库。',
  '运势大吉：今日你的代码将 0 警告 0 报错，且 Bug 全部自动消失！',
  '摸鱼箴言：只要我不提交代码，我就永远不会写出 Bug。',
  '天机泄露：先 hack 看成功率表再动手 — 神话级目标失败是要倒贴罚款的。',
];

const AI_REPLIES = [
  '[Cyber Oracle AI]: “据大数据分析，解决 Bug 的最快方案是把提需求的人拉进会议室聊 3 小时，他自然会放弃。”',
  '[Cyber Oracle AI]: “世上本没有需求，催得急了，便成了线上事故。”',
  '[Cyber Oracle AI]: “代码能跑就千万别动，哪怕那是一行用中文拼音命名的全局变量。”',
  '[Cyber Oracle AI]: “带薪如厕 15 分钟，相当于每天获得集团 3% 的无风险年化股权分红。”',
  '[Cyber Oracle AI]: “只要你的注释写得足够高深莫测，产品经理就会觉得这是不可替代的核心专利。”',
];

const TRAIN_ART = `
      ====        ________                ___________
  _D _|  |_______/        \\__I_I_____===__|_________|
   |(_)---  |   H\\________/ _____ |   =|___ ___|      
   /     |  |   H  |  |     |   | |      ||_|         
  |      |  |   H  |__--------------------|           
  | ________|___H__/__|_____/[][]~\\_______|           
  |/ |__-----/-O||O======O||O======O||O===\\_____      
`;

/** Bytes actually occupied in the writable area — lets `df`/`neofetch` report the real FS. */
function fsStats(node: VNode): { bytes: number; files: number } {
  if (node.type === 'file') return { bytes: node.content?.length ?? 0, files: 1 };
  return Object.values(node.children ?? {}).reduce(
    (acc, child) => {
      const s = fsStats(child);
      return { bytes: acc.bytes + s.bytes, files: acc.files + s.files };
    },
    { bytes: 0, files: 0 },
  );
}

const fsContentBytes = (node: VNode) => fsStats(node).bytes;

const fsUsagePercent = (node: VNode) => {
  const { bytes, files } = fsStats(node);
  return Math.min(99, Math.round((bytes / (MAX_FILE_BYTES * Math.max(1, files))) * 100));
};
