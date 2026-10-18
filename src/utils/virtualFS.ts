/**
 * CyberDeck virtual file system — a real in-memory tree shared by the terminal.
 * Directories & files can be browsed (ls/cd/tree/find), read (cat) and even
 * written (echo text > file, mkdir). The tree is persisted to localStorage so
 * player edits survive closing the window, like the rest of the save data.
 */

export interface VNode {
  type: 'dir' | 'file';
  children?: Record<string, VNode>;
  content?: string;
  /** Symbolic mode written by `chmod` (e.g. 'rwxr-xr-x'); undefined = default. */
  perm?: string;
  /** Read-only mount point (the synthetic /apps tree) — writes are refused. */
  readonly?: boolean;
}

/** Per-file content ceiling: a 64KB cap keeps `cat`/listing cheap and stops one
 *  giant file from slowing every later command down. */
export const MAX_FILE_BYTES = 64 * 1024;
/** Hard node budget so a crafted/persistent tree can't grow without bound. */
const MAX_NODES = 4000;
const MAX_NAME_LEN = 64;

const dir = (children: Record<string, VNode>): VNode => ({ type: 'dir', children });
const file = (content: string): VNode => ({ type: 'file', content });

export function createInitialFS(): VNode {
  return dir({
    home: dir({
      moyu: dir({
        'moyu_guide.md': file(`### 摸鱼最高境界三十六计\n1. 终端常开 top 命令与黑客代码雨，路过者肃然起敬。\n2. 走路要快，眉头要皱，手里永远拿一份打印的架构图。\n3. 遇到突发需求，沉吟三秒回答：“底层链路要重构，本周排期已满。”`),
        'todo.txt': file('[ ] 敲赛博木鱼 100 次\n[ ] 去茶水间接第 3 杯冰美式\n[x] 假装在线 (已完成 8 小时)'),
        'welcome.txt': file('欢迎登录 CYBERDECK 2077！\n试试这些命令: ls, cd /secrets, cat boss_diary.txt, tree, echo 666 > note.txt, mine, hack alien'),
      }),
    }),
    secrets: dir({
      'boss_diary.txt': file(`【老板绝密日记 · 2077】\n10月1日：今天发现架构师又在摸鱼敲电子木鱼，但我不敢裁他，因为核心结算系统只有他看得懂。\n10月2日：新招的AI程序员把生产数据库删了三次，幸好带薪休假的打工人留了备份。\n10月3日：决定给大家全员涨薪，但用赛博算力币支付。`),
      'passwords.txt': file('admin / 123456\nroot / cyberdeck2077\nCEO / gangba13456 (别问了，他非要用生日)'),
    }),
    system: dir({
      'salary.xlsx': file(`=== 2077 赛博集团薪资表 (绝密) ===\n[001] 董事长 (CEO):   ₵9,999,999  (日常负责画大饼)\n[002] 首席架构道尊:    ₵188,888    (日常敲木鱼镇压Bug)\n[003] 摸鱼特工主管:    ₵88,888     (全天假装思考架构)\n[004] 纯血背锅侠:      ₵1,200      (负责承接全部突发事故)`),
      'kernel.cfg': file('quantum_core=enabled\nmoyu_mode=always_on\nbaldness_prevention=failed\ncoffee_dependency=critical'),
    }),
    var: dir({
      log: dir({
        'bug.log': file(`[FATAL 23:42:01] OutOfMemoryError: GC overhead limit exceeded in BrainCell.class\n[WARN  23:42:05] NullPointerException: Object "GirlFriend" is null at Future.java:404\n[INFO  23:42:10] CoffeeLevelCritical: Please refill Espresso immediately.`),
        'moyu.log': file(`[AUDIT] 09:00 员工到岗率 100% (实际清醒率 12%)\n[AUDIT] 14:00 检测到大规模摸鱼行为，已自动生成年度述职报告。\n[AUDIT] 18:00 加班申请被系统自动驳回：理由"显得太努力不利于团队和谐"。`),
      }),
    }),
    etc: dir({
      motd: file('今日赛博格言: 能跑的代码不要动，能摸的鱼不要放。'),
      'hosts.deny': file('boss@meeting-room\nhr@performance-review\n需求变更@friday-evening'),
    }),
    usr: dir({
      bin: dir({
        'wooden_fish': file('#!quantum/shell\n# 功德++ 与 Bug-- 的终极二进制'),
        'moyu_engine': file('#!quantum/shell\n# 摸鱼引擎 v9.9 — 一直在运行，从未被编译'),
      }),
    }),
    tmp: dir({}),
  });
}

/** Resolve a possibly-relative path against cwd → absolute normalized path. */
export function resolvePath(cwd: string, input: string): string {
  const raw = input.trim();
  if (!raw) return cwd;
  const abs = raw.startsWith('/');
  const parts = (abs ? raw : `${cwd}/${raw}`).split('/').filter((p) => p.length > 0);
  const out: string[] = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return '/' + out.join('/');
}

export function getNode(fs: VNode, path: string): VNode | null {
  const parts = path.split('/').filter(Boolean);
  let node: VNode = fs;
  for (const part of parts) {
    if (node.type !== 'dir' || !node.children || !node.children[part]) return null;
    node = node.children[part];
  }
  return node;
}

export function listDir(node: VNode): Array<{ name: string; type: 'dir' | 'file' }> {
  if (node.type !== 'dir' || !node.children) return [];
  return Object.entries(node.children)
    .map(([name, child]) => ({ name, type: child.type }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
}

/** Result of a mutating call: on failure `error` is the message the shell prints. */
export type FsResult = { ok: true; root: VNode } | { ok: false; error: string };

const fsErr = (error: string): FsResult => ({ ok: false, error });
const fsOk = (root: VNode): FsResult => ({ ok: true, root });

const EROFS = '只读文件系统，无法写入';
const DEFAULT_FILE_MODE = '-rw-r--r--';
const DEFAULT_DIR_MODE = 'drwxr-xr-x';

const partsOf = (path: string) => path.split('/').filter(Boolean);
const joinParts = (parts: string[]) => '/' + parts.join('/');

/**
 * Clone only the ancestors of the target and return the chain (root first).
 * The old code JSON-parsed the whole tree on every command, so one big file made
 * every later keystroke re-serialise it; sharing untouched subtrees keeps writes O(depth).
 */
function pathForWrite(
  root: VNode,
  parts: string[],
  createMissingDirs: boolean,
): { chain: VNode[] } | { error: string } {
  const cloneDir = (node: VNode): VNode => ({ ...node, children: { ...(node.children ?? {}) } });
  const chain: VNode[] = [cloneDir(root)];
  let cursor = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cursor.readonly) return { error: `${EROFS}: ${joinParts(parts.slice(0, i + 1))}` };
    const name = parts[i];
    const child = cursor.children?.[name];
    if (!child) {
      if (!createMissingDirs) return { error: `目录不存在: ${joinParts(parts.slice(0, i + 1))}` };
      const created = dir({});
      chain[chain.length - 1].children![name] = created;
      chain.push(created);
      cursor = created;
      continue;
    }
    if (child.type !== 'dir') return { error: `不是目录: ${joinParts(parts.slice(0, i + 1))}` };
    const cloned = cloneDir(child);
    chain[chain.length - 1].children![name] = cloned;
    chain.push(cloned);
    cursor = child;
  }
  return { chain };
}

/**
 * Write (create/overwrite) a file. Without `parents` a missing parent directory is an
 * error, matching real shells (`echo x > /a/b/c.txt` fails; `mkdir -p` is explicit).
 */
export function writeFile(fs: VNode, path: string, content: string, opts: { parents?: boolean } = {}): FsResult {
  const parts = partsOf(path);
  if (parts.length === 0) return fsErr(`${path}: 不是有效的文件路径`);
  if (parts.some((p) => p.length > MAX_NAME_LEN)) return fsErr(`${path}: 文件名过长 (≤${MAX_NAME_LEN} 字符)`);
  if (content.length > MAX_FILE_BYTES) {
    return fsErr(`${path}: 内容 ${content.length} 字节，超出单文件上限 ${MAX_FILE_BYTES / 1024}KB`);
  }
  const located = pathForWrite(fs, parts, !!opts.parents);
  if ('error' in located) return fsErr(located.error);
  const parent = located.chain[located.chain.length - 1];
  if (parent.readonly) return fsErr(`${EROFS}: ${path}`);
  const name = parts[parts.length - 1];
  const existing = parent.children?.[name];
  if (existing?.type === 'dir') return fsErr(`${path}: 这是一个目录`);
  parent.children![name] = { type: 'file', content, perm: existing?.perm };
  return fsOk(located.chain[0]);
}

export function makeDir(fs: VNode, path: string, opts: { parents?: boolean } = {}): FsResult {
  const parts = partsOf(path);
  if (parts.length === 0) return fsErr('无法创建或替换根目录 /');
  if (parts.some((p) => p.length > MAX_NAME_LEN)) return fsErr(`${path}: 目录名过长 (≤${MAX_NAME_LEN} 字符)`);
  const located = pathForWrite(fs, parts, !!opts.parents);
  if ('error' in located) return fsErr(located.error);
  const parent = located.chain[located.chain.length - 1];
  if (parent.readonly) return fsErr(`${EROFS}: ${path}`);
  const name = parts[parts.length - 1];
  const existing = parent.children?.[name];
  if (existing) {
    if (existing.type === 'dir') return opts.parents ? fsOk(located.chain[0]) : fsErr(`${path}: 目录已存在`);
    return fsErr(`${path}: 已存在同名文件`);
  }
  parent.children![name] = dir({});
  return fsOk(located.chain[0]);
}

export function removeNode(fs: VNode, path: string, opts: { recursive?: boolean } = {}): FsResult {
  const parts = partsOf(path);
  if (parts.length === 0) return fsErr('rm: 拒绝删除根目录 /');
  const located = pathForWrite(fs, parts, false);
  if ('error' in located) return fsErr(located.error);
  const parent = located.chain[located.chain.length - 1];
  if (parent.readonly) return fsErr(`${EROFS}: ${path}`);
  const name = parts[parts.length - 1];
  const target = parent.children?.[name];
  if (!target) return fsErr(`${path}: No such file or directory`);
  if (target.readonly) return fsErr(`${EROFS}: ${path}`);
  const childCount = Object.keys(target.children ?? {}).length;
  if (target.type === 'dir' && childCount > 0 && !opts.recursive) {
    return fsErr(`${path}: 目录非空 (${childCount} 项)，使用 rm -r ${path} 删除整棵子树`);
  }
  delete parent.children![name];
  return fsOk(located.chain[0]);
}

/** Real permission bits for `chmod` — the FS stores what `ls -l` prints. */
export function setPerm(fs: VNode, path: string, perm: string): FsResult {
  const parts = partsOf(path);
  if (parts.length === 0) return fsErr('chmod: 根目录权限由内核托管，不可修改');
  const located = pathForWrite(fs, parts, false);
  if ('error' in located) return fsErr(located.error);
  const parent = located.chain[located.chain.length - 1];
  if (parent.readonly) return fsErr(`${EROFS}: ${path}`);
  const name = parts[parts.length - 1];
  const target = parent.children?.[name];
  if (!target) return fsErr(`${path}: No such file or directory`);
  if (target.readonly) return fsErr(`${EROFS}: ${path}`);
  const symbolic = perm.length >= 9 ? perm.slice(-9) : perm.padStart(9, '0');
  parent.children![name] = { ...target, perm: `${target.type === 'dir' ? 'd' : '-'}${symbolic}` };
  return fsOk(located.chain[0]);
}

const modeOf = (node: VNode) => (node.perm ?? (node.type === 'dir' ? DEFAULT_DIR_MODE : DEFAULT_FILE_MODE)).padStart(10);

/** Pretty directory listing lines for the terminal (real mode bits, `ls -l`). */
export function formatListing(path: string, node: VNode): string[] {
  const entries = listDir(node);
  if (entries.length === 0) return ['(空目录)'];
  return entries.map((e) => {
    const child = getNode(node, e.name);
    const meta =
      e.type === 'dir'
        ? `root  root   4.0K  ${path === '/' ? '' : path}/${e.name}/`
        : `root  root   ${String(child?.content?.length ?? 0).padStart(4)}B  ${e.name}`;
    return `${modeOf(child ?? { type: e.type })}  ${meta}`;
  });
}

export function collectFiles(node: VNode, base: string = ''): Array<{ path: string; content: string }> {
  const out: Array<{ path: string; content: string }> = [];
  if (node.type === 'file') return [{ path: base || '/', content: node.content ?? '' }];
  for (const [name, child] of Object.entries(node.children ?? {})) {
    const p = `${base}/${name}`;
    if (child.type === 'file') out.push({ path: p, content: child.content ?? '' });
    else out.push(...collectFiles(child, p));
  }
  return out;
}

/** ASCII tree for the `tree` command. */
export function renderTree(node: VNode, prefix: string = ''): string[] {
  const lines: string[] = [];
  const entries = listDir(node);
  entries.forEach((e, i) => {
    const last = i === entries.length - 1;
    lines.push(`${prefix}${last ? '└── ' : '├── '}${e.name}${e.type === 'dir' ? '/' : ''}`);
    if (e.type === 'dir') {
      const child = getNode(node, e.name);
      if (child) lines.push(...renderTree(child, prefix + (last ? '    ' : '│   ')));
    }
  });
  return lines;
}

// ---------------------------------------------------------------------------
// Persistence — the terminal used to keep the FS in component state only, so
// closing the window threw away every file while credits/hashrate persisted.
// ---------------------------------------------------------------------------

const VFS_KEY = 'CYBERDECK_VFS';
const VFS_VERSION = 1;

/** Defensive rebuild of a parsed tree: unknown shapes must not crash the shell. */
function sanitizeNode(raw: unknown, budget: { nodes: number }): VNode | null {
  if (!raw || typeof raw !== 'object' || budget.nodes >= MAX_NODES) return null;
  const node = raw as Partial<VNode>;
  budget.nodes += 1;
  if (node.type === 'file') {
    const content = typeof node.content === 'string' ? node.content.slice(0, MAX_FILE_BYTES) : '';
    return { type: 'file', content, ...(typeof node.perm === 'string' ? { perm: node.perm.slice(0, 16) } : {}) };
  }
  if (node.type !== 'dir') return null;
  const children: Record<string, VNode> = {};
  for (const [name, child] of Object.entries(node.children ?? {})) {
    if (!name || name === '.' || name === '..' || name.length > MAX_NAME_LEN) continue;
    const clean = sanitizeNode(child, budget);
    if (clean) children[name] = clean;
  }
  return { type: 'dir', children, ...(typeof node.perm === 'string' ? { perm: node.perm.slice(0, 16) } : {}) };
}

export function loadPersistedFS(): VNode {
  try {
    const raw = localStorage.getItem(VFS_KEY);
    if (!raw) return createInitialFS();
    const parsed = JSON.parse(raw) as { root?: unknown };
    const root = sanitizeNode(parsed?.root, { nodes: 0 });
    return root && root.type === 'dir' && Object.keys(root.children ?? {}).length ? root : createInitialFS();
  } catch {
    return createInitialFS();
  }
}

/** Returns false when localStorage is full/blocked — the caller keeps working in memory. */
export function persistFS(root: VNode): boolean {
  try {
    localStorage.setItem(VFS_KEY, JSON.stringify({ v: VFS_VERSION, root }));
    return true;
  } catch {
    return false;
  }
}

export function clearPersistedFS(): void {
  try {
    localStorage.removeItem(VFS_KEY);
  } catch {
    // storage unavailable — nothing to clear
  }
}
