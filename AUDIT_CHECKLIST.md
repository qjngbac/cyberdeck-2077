# CyberDeck 2077 · 代码审查问题清单

> 对象：`D:\material-antigravity\funny`（CyberDeck OS 2077 · 赛博摸鱼终端与修仙元宇宙）
> 技术栈：Vue 无关，实际为 **React 19 + TypeScript 6 + Vite 8 + Tailwind CSS v4 + canvas-confetti + lucide-react**
> 审查日期：2026-09-15
> 审查方式：**纯只读**（未修改任何源码）+ 运行项目自带的静态检查 + 反查已构建产物
> 交付给修复方的用途：逐条排修，每条都带「位置 / 现象 / 影响 / 建议修法 / 验收标准」

---

## 0. 审查证据（可复现）

在本目录执行：

```bash
npx oxlint                 # 静态检查
npx tsc -p tsconfig.app.json --noEmit   # 类型检查
```

实际结果：

| 检查项 | 结果 |
| --- | --- |
| `oxlint` | **114 problems：2 个 Error + 112 个 Warning** |
| `tsc --noEmit` | **0 错误**（类型层面干净，问题都在运行时逻辑） |
| `npm run build`（`tsc -b --dry`） | 可正常构建（TS 6.0.3） |

产物反查（`dist/assets/index-D3NrGwZE.css`，101 KB）：

| 类名 | 是否生成 | 说明 |
| --- | --- | --- |
| `scale-115` / `w-22` / `h-22` / `grid-cols-16` | ✅ | 正常 |
| `shadow-neon-gold`、`text-glow-*` | ✅ | 由 `index.css` 手写提供 |
| **`pulse-fast`** | ❌ 未生成 | `animate-pulse-fast` 完全失效（见 P4-33） |
| **`no-scrollbar`** | ❌ 未生成 | 该 class 全项目未定义（见 P4-34） |

已构建产物存在 `dist/`，说明此前能跑通 `npm run build`。

---

## 1. 结论摘要

| 等级 | 含义 | 条数 |
| --- | --- | --- |
| 🔴 P0 | 会白屏 / 抛错，必须修 | 3 |
| 🟠 P1 | 逻辑或数值 Bug，功能不正确 | 18 |
| 🟡 P2 | 经济系统没有闭环，可无限刷资源 | 5 |
| 🔵 P3 | 性能与渲染开销 | 6 |
| ⚪ P4 | 一致性 / 文案 / 死代码 / 可访问性 | 8 |

**如果只修 3 个**：P0-1（DesktopPet 跳过 Hooks）、P0-2（无 ErrorBoundary）、P1-4（updater 内写副作用）。

两条已确认的**静态检查 Error**（oxlint）：

```
src/components/desktop/DesktopPet.tsx:24:3: React Hook "useEffect" is called conditionally. React Hooks must be called in the exact same order in every component render. [Error/react-hooks(rules-of-hooks)]
src/components/desktop/DesktopPet.tsx:42:3: React Hook "useEffect" is called conditionally. React Hooks must be called in the exact same order in every component render. [Error/react-hooks(rules-of-hooks)]
```

---

## 2. 🔴 P0 必修（会白屏 / 抛错）

### P0-1 桌面宠物提前 `return null` 跳过了 Hooks（会白屏）

- **位置**：`src/components/desktop/DesktopPet.tsx:21`（`return null`），Hooks 在 `:24`、`:42`
- **现状**：

```tsx
const { state, ... } = useGame();
const pet = state.pet;
if (pet.roamOnDesktop === false) return null;   // ← 21 行，位于两个 useEffect 之前
useEffect(...)  // 24 行
useEffect(...)  // 42 行
```

- **影响**：违反 Rules of Hooks。当 `roamOnDesktop` 由 `true` 变为 `false`（即**关掉"桌面放养"**）时，本次渲染调用的 Hook 数量骤减，dev 下抛 `Rendered fewer hooks than expected. This may be caused by an accidental early return statement.`，**整个应用白屏**（项目没有 ErrorBoundary，见 P0-2）；生产构建下则是 Hook 状态错乱、行为不可预期。
- **触发入口（三处）**：
  1. `CyberPetApp` 顶栏「桌面放养中 / 放养到桌面」按钮
  2. `DesktopContextMenu` 右键菜单 →「桌面放养桌宠」
  3. `CommandPalette`（Ctrl+K）→ `cmd-pet-roam`
- **建议修法**：把 `if (pet.roamOnDesktop === false) return null;` 移到**所有 Hook 之后**（即在 `handlePetClick` 定义之后、`return (<div .../>)` 之前），或改为只对 JSX 做条件渲染：

```tsx
// 方案 A：至少把 return null 放到最后一个 Hook 之后
// 方案 B：保留 Hook 全部执行，仅让返回的 JSX 为空
if (pet.roamOnDesktop === false) return null;   // ← 移动到这里（hook 之后）
```

- **验收标准**：开启桌宠 → 关闭桌宠 → 再打开，全程无控制台报错、无白屏；`npx oxlint` 中 DesktopPet 的两条 `rules-of-hooks` Error 消失。

### P0-2 全站缺少 ErrorBoundary（单点异常 = 整页白屏）

- **位置**：`src/components/desktop/Desktop.tsx:183-187`
- **现状**：`windows.map((win) => <Window key={win.id} win={win}>{renderAppContent(win.id)}</Window>)`，18 个 App 直接渲染，无任何错误边界。
- **影响**：任何一个 App 抛错（P0-1 即为一例）都会让整棵 React 树卸载 → 白屏，用户只能刷新页面，且**已手动打开的窗口布局与所有会话态游戏进度（扫雷棋盘、贪吃蛇、终端虚拟文件系统、炼宝炉棋盘）全部丢失**（这些状态只在组件内 `useState`，不入存档）。
- **建议修法**：新增 `<ErrorBoundary>` 组件（class 组件实现 `componentDidCatch`），包在 `<Window>` 的 children 外层；兜底 UI 提供「重开此应用」按钮（用 `key` 变化强制重挂载）。
- **验收标准**：人为在任一 App 内 `throw new Error('test')`，只有该窗口显示错误提示，其余桌面与窗口不受影响。

### P0-3 存档导入路径未做字段归一化（可让股市/合成器崩溃）

- **位置**：`src/context/GameContext.tsx:1259-1270`（`loadStateFromBase64`）
- **现状**：它与 `src/utils/storage.ts:319-356` 的 `loadSavedState()` **不是同一套逻辑**：不做 `normalizeStocks()`、不做逐字段深合并、不调 `applyDailyReset()`。
- **可复现的崩溃**：
  - 导入的存档 `stocks: []` → `StockMarketApp.tsx:12/18/120`：`selectedStock` 为 `undefined` → 读取 `selectedStock.price` → `TypeError`（股市窗口白屏）
  - 导入的存档缺 `prefs.synthGrid` → `SynthwaveApp.tsx:106/121`：`grid[trackIdx]` 为 `undefined` → `next[trackIdx][stepIdx] = ...` → `TypeError`
- **附带问题**：`src/utils/storage.ts:366-404` 的 `exportSaveData` / `importSaveData` 中，**`importSaveData` 全项目没有任何地方 import（死代码）**；`exportSaveData` 只被 `SystemSettingsApp.tsx:4` 用于导出。
- **建议修法**：`loadStateFromBase64` 改为「`JSON.parse` → 复用 `storage.ts` 的归一化逻辑 → `applyDailyReset`」，即把它与 `loadSavedState` 收敛到同一个 `normalizeState(parsed)` 纯函数；并给 `stocks` 增加「数组为空则回退 `INITIAL_STOCKS`」的防御。
- **验收标准**：导出存档 → 手工把 `stocks` 改成 `[]`、删掉 `prefs.synthGrid` → 导入 → 打开股市与 8Bit 编曲机，均不报错。

---

## 3. 🟠 P1 逻辑 / 数值 Bug

### P1-4 把副作用写进了 `setState` 的 updater（StrictMode 下会执行两次）

- **位置（多处）**：
  - `src/components/apps/SnakeApp.tsx:115-174`：`setSnake(prev => { ... setScore(...); addCredits(pts); spawnFood(newSnake); SoundFX.playLevelUp(); ... })`
  - `src/context/GameContext.tsx:655-667`：`tapWoodenFish` 的 updater 内调 `SoundFX.playWoodenFish(...)`
  - `src/context/GameContext.tsx`：`buyUpgrade` / `buyStock` / `sellStock` / `feedPet` / `buyEstate` / `installPetChip` 的 updater 内均调用了 `SoundFX.*` / `confetti` / `Math.random()`
  - `src/context/GameContext.tsx:1211-1229`：`buyInsiderTip` 在 updater 内用 `Math.random()` 选被拉升的股票，同时靠闭包变量 `message` 往外传文案
- **影响**：React 在开发模式（本项目 `main.tsx:7` 使用了 `<StrictMode>`）会**双调用** updater 函数，以暴露副作用：

| 症状 | 具体后果 |
| --- | --- |
| 音效播放两次 | 敲木鱼、吃食物、平仓等音效重复叠放 |
| 嵌套 setState 触发两次 | 吃一个食物 `setScore(s => s + pts)` / `addCredits(pts)` 可能结算两份 |
| 随机数取两次 | `buyInsiderTip` 弹出的股票名与**实际被拉升的股票可能不是同一只**；股价 tick、宠物衰减随机值前后不一致 |

- **建议修法**：updater 保持**纯函数**，只做 `prev → next` 的计算；副作用（音效、confetti、其他 setState、`Math.random()`）一律移到 updater **之外**执行（需要随机结果时先算好，或先把随机结果写进 updater 的参数）。
- **验收标准**：dev 模式下敲一次木鱼只响一声；吃一个食物只加一份分/币；内幕提示文案里的股票与列表上显示 `💡内幕拉升中` 的股票一致。
- **备注**：生产构建下 StrictMode 的双调用不生效，因此这是**开发期可见、生产期隐患**的问题，但"updater 非纯函数"本身仍属反模式。

### P1-5 用闭包变量当返回值（`return ok` / `return message`）不可靠

- **位置**：
  - `GameContext.tsx:844` `consumeItem` → `return message`
  - `GameContext.tsx:721` `convertMeritToCredits` → `return true/false`
  - `GameContext.tsx:758` `buyEstate`、`:948` `installPetChip`、`:1095` `buyStock`、`:1141` `sellStock` → `return true/false`
  - `GameContext.tsx:1228` `buyInsiderTip` → `return message`
  - `GameContext.tsx:1395` `unlockGachaItem` → `return isNew`（GachaApp 的「NEW!」角标依赖它）
- **现状**：均为 `let ok = false; setState(prev => { ...; ok = true; }); return ok;`。
- **为什么不可靠**：这种写法依赖 React 的内部优化——当该 fiber 的待处理 lanes 为空时会**同步预演一次** updater（`eagerState`）。一旦同一次事件回调中**之前已经 setState 过**（lanes 非空），预演就会被跳过，updater 推迟到渲染阶段执行，此时函数早已 `return`，调用方拿到的是初始值 `null / false`。
- **可推断的失效场景（建议复核）**：`consumeItem` 处理情绪价值道具时会先走 `triggerEffect('lantern' | 'meteor')` → 内部 `setVisualEffect(...)`（占住 lanes）→ 紧接着 `return message` 返回 `null` → `SystemSettingsApp.tsx:93-95` 的 `if (msg) alert(msg)` 静默无反馈。即：**使用【祈福天灯】【量子流星雨使用权】时没有任何提示**，但道具已被消耗、全屏特效已播放。
- **建议修法**：不要用 updater 做返回值通道。改为在 updater 外基于 `stateRef.current` 判定业务条件并同步返回结果：

```ts
const item = stateRef.current.inventory.find(i => i.id === itemId);
if (!item || item.count <= 0) return null;
// 先算出 message/效果，再单一 setState 落库
```
- **验收标准**：为 `consumeItem` 补一个单测（或在函数首尾打 `console.log`），验证「天灯 / 流星雨」两条路径的返回值非 null。

### P1-6 解除静音会把主音量重置为 0.3

- **位置**：`src/audio/SoundFX.ts:34-39`
- **现状**：`setMuted(false)` 里硬编码 `this.masterGain.gain.setValueAtTime(0.3, ...)`，与用户的 `state.soundVolume` 无关。
- **复现**：系统设置里把主音量拖到 5% → 点两次状态栏喇叭（静音/取消静音）→ 音量跳回 30%。
- **建议修法**：引擎内维护 `private currentVolume`，`setVolume()` 与取消静音都读它。
- **验收标准**：任意音量下调静音再取消，音量保持不变。

### P1-7 赛博电台绕过了主音量与静音

- **位置**：`src/audio/CyberRadio.ts:34-52`
- **现状**：`CyberRadio` 自己 `new AudioContext()` 并把 `masterGain` 直连 `ctx.destination`，不经过 `SoundFX.masterGain`；`CyberRadio.setVolume()` 全项目无人调用（`StatusBar.tsx:13-19` 只调 `start()/stop()`）。
- **影响**：状态栏「静音」与主音量对电台完全无效；电台音量恒为 0.25。
- **建议修法**：让电台复用 `SoundFX` 的 AudioContext 与 masterGain（暴露 `SoundFX.getMasterGain()`），或在静音/音量变化时同步 `CyberRadio.setVolume()`。
- **验收标准**：电台播放中点击静音 → 立即静音；调低主音量 → 电台同步变小。

### P1-8 「作为工具/货币消耗」的道具会二次触发自己的属性效果（双重收益）

- **位置**：
  - `GachaApp.tsx:30-34`：`consumeItem(ticketItem!.id)` 消耗【赛博扭蛋抽奖券】用于抽卡 → 同时触发 `ITEM_EFFECTS['赛博扭蛋抽奖券'] = { credits: 150 }`（`gameLogic.ts:109`）
  - `ForgeApp.tsx:200`：`consumeItem(oreItem.id)` 注入【九天玄晶矿石】→ 同时 +60 功德（`gameLogic.ts:108`）
  - `MinesweeperApp.tsx:238`：`consumeItem(probeItem.id)` 用探针透视 → 同时 +$60 / +30 功德（`gameLogic.ts:107`）
  - `TerminalApp.tsx:503`：`consumeItem(zeroDayItem.id)` 用 0-Day 入侵 → 同时 +$500 / +200 功德（`gameLogic.ts:105`）
- **影响**：设计上这些道具是"当作货币/工具花掉"，却额外白送一份属性奖励，破坏数值设计（例如每张抽奖券实际价值 = 一次免费抽（约 $200）+ $150 现金）。
- **建议修法**：新增只扣数量的接口（如 `spendItem(id, n)`），"工具消耗"路径改用它；`applyItemEffect` 只在"使用道具"按钮里调用。
- **验收标准**：用抽奖券抽卡后，赛博币不增加；用探针透视后只有棋盘变化，金币/功德不变。

### P1-9 十连抽「保底必出 SR+」未实现

- **位置**：`GachaApp.tsx:19-54`（UI 文案在 `:128`：`单抽 $200 / 十连 $1800（优先消耗抽奖券）；保底必出 SR+ 稀有藏品！`）
- **现状**：每张独立 roll：UR 5% / SSR 17% / SR 33% / R 45%，**没有任何 pity 或十连兜底**（十连全 R 概率约 0.03%）。
- **影响**：文案承诺与实现不符，属"假保底"。
- **建议修法**：十连前先 roll 一遍，若结果中无 SR 及以上，将最后一张强制替换为 `SR/SSR/UR` 池中随机项。
- **验收标准**：连续大量十连中不存在「10 张全 R」的结果。

### P1-10 盲盒概率文案算错

- **位置**：`MarketApp.tsx:133` 文案「65% 稀有 / 30% 史诗 / 8% 传说」（合计 **103%**）；实现 `gameLogic.ts:323-330` 实为 `roll < 0.6 → rare`、`< 0.92 → epic`、否则 legendary，即 **60% / 32% / 8%**。
- **建议修法**：文案改为 60% / 32% / 8%（或改代码去匹配文案）。
- **验收标准**：文案与实现一致，且百分比合计 100%。

### P1-11 炼宝炉的全局键盘监听没有「当前窗口」判断

- **位置**：`src/components/apps/ForgeApp.tsx:166-184`
- **现状**：直接在 `window` 上监听 `ArrowLeft/Right/Up/Down`、`KeyA/D/W/S` 并 `preventDefault()`，**没有** `activeWindowId === 'forge'` 判断。对比：`DungeonApp.tsx:441`、`SnakeApp.tsx:85`、`SynthwaveApp.tsx:104` 都做了该判断。
- **三个具体后果**：
  1. 同时打开「八卦炼宝炉」与「霓虹深渊」时，按方向键**两个游戏同时响应**（地下城走一步 + 八卦炉滑一次）
  2. 窗口被最小化时组件仍挂载（`Window.tsx:186` 是 `display:none`，并未卸载），按键依然会被它吃掉
  3. `preventDefault()` 是全局的，其他 App 里用方向键滚动长列表（交易所、日报）会失效
- **建议修法**：加 `const isMain = activeWindowId === 'forge';`，在 effect 内 `if (!isMain) return;`，并把 `isMain` 加进依赖。
- **验收标准**：两个游戏同时打开时，只有聚焦的那个响应方向键。

### P1-12 地下城「神龛」可无限复用

- **位置**：`src/components/apps/DungeonApp.tsx:247-255`（进入分支）、`307-329`（`shrineSacrifice`）
- **现状**：踩上神龛后 `targetTile.type` 不会被改成 `'empty'`，离开再踩回来即可重复触发：
  - 「虔诚礼拜」= 回满血 + 150 功德（无限刷）
  - 「鲜血献祭」= 永久 +15 攻击（只受当前血量限制，而礼拜又能回满血）
- **建议修法**：使用一次后把该 tile 置为 `'empty'`。
- **验收标准**：同一格神龛只能获得一次奖励。

### P1-13 地下城直接修改处于 state 中的对象（oxlint immutability 警告）

- **位置**：`DungeonApp.tsx:258` `targetTile.type = 'empty';`
- **现状**：`targetTile` 是当前 `map` state 里 tile 的引用，就地修改；虽然后续 `[...map.map(row => [...row])]` 又把结果拷了回去（所以目前表现正确），但：
  - oxlint 报 `react(immutability)`：`This value cannot be modified` / `Cannot modify local variables after render completes`
  - 一旦后续引入 `React.memo`、`useMemo` 或并发渲染，会出现**界面不更新**的隐蔽 bug
- **建议修法**：先深拷贝 `map`，再在新副本上改 tile。
- **验收标准**：开箱后宝箱格正确变为空地，且不再出现 immutability 警告。

### P1-14 终端的反刷冷却只存在组件 ref 中（可绕过）

- **位置**：`src/components/apps/TerminalApp.tsx:47-48`（`lastHackAtRef`、`HACK_COOLDOWN_MS = 15000`），使用处 `:473-481`
- **现状**：关闭终端窗口 → 组件卸载 → ref 归零 → 重开终端即可立刻再次 `hack`。同理，终端 `history`、虚拟文件系统 `fs`、`processes` 全部随窗口关闭丢失。
- **建议修法**：冷却时间戳、命令历史（可截断保留）、虚拟 FS 至少其中之一移入全局存档或 `sessionStorage`。
- **验收标准**：`hack` 后关窗重开，仍提示冷却剩余秒数。

### P1-15 转盘九环满时被替换掉的是「最新」的环

- **位置**：`src/components/apps/WheelLifeApp.tsx:239`
- **现状**：`[newRing, ...prev.rings.slice(0, 8)]` —— 新环插到队首，`slice(0, 8)` 保留旧数组的 0~7，**丢掉的是 index 8（最后附加、也就是最新的那个环）**，而不是最早的。
- **建议修法**：改为 `[...prev.rings.slice(1), newRing].slice(-9)` 或明确按 `years/atkBonus` 排序后保留前 9。
- **验收标准**：满 9 环后，新获得的环替换掉最早的环。

### P1-16 渡劫门槛按 1.6^n 增长，后期成为软锁

- **位置**：`WheelLifeApp.tsx:272` `maxSoulPower: Math.floor(prev.maxSoulPower * 1.6)`
- **现状**：100 → 200 → 320 → 512 → 819 → …，而魂力来源仅为「转盘 +100 / 灵芝 +200」。
- **影响**：约 15 次突破后单次所需魂力已达数十万，实际不可达。
- **建议修法**：改为线性增长（如 `+150`）或设增长上限。
- **验收标准**：`npx` 计算 20 次突破后的门槛仍在可达成量级。

### P1-17 宠物探索：按钮阈值与函数实现不一致

- **位置**：按钮 `CyberPetApp.tsx:304-326`（禁用条件分别为 `energy < 20 / < 35 / < 50`），函数 `GameContext.tsx:953`（`startPetExplore`）
- **现状**：函数只校验 `energy < 20` 且**统一只扣 20 点**，与按钮展示的"耗时 30s / 60s / 120s"阶梯并不对应；同时 `exploreDuration` 的传入值（30/60/120）决定奖励档次，但体力成本完全相同。
- **建议修法**：把体力消耗改为与档位挂钩（如 20/35/50），或统一按钮为 `< 20`。
- **验收标准**：三档探索的体力消耗与按钮禁用阈值一致。

### P1-18 扫雷：难度切换重复初始化 + 首点可能直接踩雷

- **位置**：`MinesweeperApp.tsx:98-100`（`useEffect(..., [difficulty, initBoard])`）与 `:305-308`（按钮 onClick 里又调 `initBoard(d)`）→ 一次点击会初始化两遍。
- **另**：`initBoard:63-72` 随机布雷时可落在首次点击的格子上，无「首点保护」。
- **建议修法**：删掉按钮里的 `initBoard` 调用（交给 effect）；`handleClickCell` 首击时若踩雷则重排或把雷挪走。
- **验收标准**：切难度只生成一次棋盘；第一次点击永远不会爆。

### P1-19 斗地主：AI 叫地主的判定可疑

- **位置**：`src/components/apps/DouDizhuApp.tsx:392-394`
- **现状**：`landlord = s1 >= 3 || s1 >= s2 ? 1 : 2;` —— 由于 `s1 >= 3` 优先成立，可能出现 AI1 手牌评分低于 AI2 却仍然当地主的情况。
- **建议修法**：`landlord = s1 >= s2 ? 1 : 2;`
- **验收标准**：玩家不叫时，地主总是分高的那一方。

### P1-20 剪贴板写入无错误处理

- **位置**：`SystemSettingsApp.tsx:19`（导出存档）、`DailyReportApp.tsx:172`（复制日报）
- **现状**：`navigator.clipboard.writeText(...)` 未 `await`、未 `catch`，随后立刻 `setCopied(true)`。非 HTTPS/局域网访问或权限被拒时会静默失败，界面却显示"已复制"。
- **建议修法**：`await + try/catch`，失败时走 `showAlert` 提示，并提供 `document.execCommand('copy')` 兜底。
- **验收标准**：在禁用剪贴板权限的场景下给出明确错误提示而非"已复制"。

### P1-21 每日津贴的守卫只在 UI 层

- **位置**：`DailyReportApp.tsx:127/162-167` 用渲染期的 `alreadyClaimed` 判断；`GameContext.tsx:1398` `claimDailyReportReward` **自身不校验日期**且无条件 `return true`。
- **影响**：快速连点（或未来加批量/快捷键触发）存在重复领取（每次 +$300 + 小红花）的隐患。
- **建议修法**：把 `if (stateRef.current.lastDailyReportDate === today) return false;` 放进函数内部，作为唯一致判断点。
- **验收标准**：同一天内第二次调用返回 false 且不加钱。

---

## 4. 🟡 P2 经济系统没有闭环（多处可无限刷资源）

> 这是本作最"体感失衡"的部分：赛博币几乎没有价值，因为存在多条零成本、零冷却的产出路径。

### P2-22 零成本零冷却的无限产出清单

| # | 位置 | 行为 | 每次收益 | 冷却/成本 |
| --- | --- | --- | --- | --- |
| a | `TerminalApp.tsx:553-562` `ddos` | 输入一条命令 | **+$50** | **无**（对比 `hack` 有 15s 冷却） |
| b | `TerminalApp.tsx:650-659` `mine` | 输入一条命令 | +5 算力 / +60 功德 / +$30 | **无** |
| c | `ForgeApp` 全体（`initGame`、`move`） | 按住方向键玩 2048 | 合并 Lv≥2 送功德、Lv≥3 直接产出可交易法宝（`聚灵八卦镜` 回收 182、`开天诛仙真器` 回收 **14000**） | **无**，且「重起炉灶」免费重置 |
| d | `WheelLifeApp.tsx:279-323` 斗魂场 | 反复挑战「内存泄漏怪」 | 每局净 +$200（约 6 次点击），`startArena` 每次重置玩家血量 | **无门票、无冷却** |
| e | `CyberPetApp.tsx:40-76` 敏捷特训 | 10 秒小游戏 | 命中数 ×10 经验 → 快速升级涨战力 | **无成本、无冷却** |
| f | `DesktopPet.tsx:68-74` | 桌宠随机「刨冷钱包」 | +$50~100（约每 30 秒一次，被动） | 自动 |

- **建议修法**：为 a/b/c/e 加最小成本或冷却（例如 `ddos` 加 30 秒冷却、`mine` 消耗算力、八卦炉产出法宝设每日上限或收取功德）；斗魂场加门票或失败惩罚。
- **验收标准**：连续重复同一操作 10 次，收益总量有明确上限（不会线性无限增长）。

### P2-23 转盘期望值为正 + 功德↔赛博币套利

- **位置**：`WheelLifeApp.tsx:173-248`
- **现状**：抽一次花 30 币（或 50 功德），14 格中有 `$200`、`$500`、`功德 +300`、`功德 +400` 等；而功德可按 1:0.8 自由换回赛博币（`WoodenFishApp.tsx:315`）。
- **套利链**：30 币 → 抽到 300 功德 → 换回 240 币，净赚 210 币，且可无限循环。
- **建议修法**：降低货币类格子的面额，或对「功德→赛博币」设每日兑换上限。

### P2-24 内幕拉升 + 百倍杠杆 = 稳定暴赚

- **位置**：拉升来源 `GameContext.tsx:1339`（`boostTicks` 期间漂移 `Math.random()*0.02`，即 0~2%/每秒，持续 90 秒）；结算 `GameContext.tsx:1106-1109`（`pnl = margin * (1 + 涨跌幅 * leverage)`）
- **现状**：`buyInsiderTip` 只需 $100，100x 杠杆下标的上涨 1% 即让保证金翻倍；90 秒窗口内可持续兑现。
- **建议修法**：对杠杆收益设上限、给内幕提示加冷却，或让拉升幅度与杠杆联动衰减。

### P2-25 加仓会覆盖整仓杠杆

- **位置**：`GameContext.tsx:1071-1085`（`buyStock` 内的 `avgCost/leverage/margin` 计算）
- **现状**：再次买入同一标的时 `leverage` 被新值直接覆盖，但 `margin` 与 `ownedAmount` 是累加的 → 「先 100x 买 1 份，再 1x 买 1 份」会让整仓按 1x 结算。
- **建议修法**：要么按加权平均计算杠杆，要么禁止在同一持仓上改变杠杆（只允许加仓同杠杆），要么平仓再开。
- **验收标准**：持仓信息面板显示的杠杆与结算使用的杠杆一致。

### P2-26 与 UI 不符：宣称的印花税/滑点并不存在

- **位置**：`StockMarketApp.tsx:149-157` 显示「【职场暴富羁绊生效中】：股票交易全部印花税与滑点永久免除 (0 费率)！」；`gameLogic.ts:384` 的羁绊描述也写了"印花税永久减免为 0"。
- **现状**：`buyStock` / `sellStock` 里**没有任何费率计算**，即"免税"是一句空话（羁绊实际只生效了"日报津贴翻倍"，见 `GameContext.tsx:1398`）。
- **建议修法**：要么实现基础费率（再由此羁绊减免），要么改文案为实际生效的效果。

---

## 5. 🔵 P3 性能与渲染

### P3-27 全局 Context 每秒重建，导致所有打开的应用每秒重渲染

- **位置**：`src/context/GameContext.tsx:1274-1385`（1 秒 tick 更新 state）、`:1460-1500`（Provider 的 `value` 对象每次渲染新建）
- **影响**：主循环每秒 `setState` 一次 → Provider value 引用变化 → **所有 `useGame()` 消费者每秒重渲染**，包括 K 线 Canvas 重绘、14×14 扫雷网格（196 个按钮）、贪吃蛇 Canvas、终端全部历史行。
- **建议修法（收益最大）**：
  1. 拆分 Context：把「每秒变动的经济数据（merit/credits/stocks…）」与「稳定的操作函数」分开成两个 Provider/Context
  2. 或改用外部 store（zustand / `useSyncExternalStore`）配合选择器订阅
  3. 至少给昂贵的应用层加 `React.memo` + 只订阅所需切片
- **验收标准**：仅打开「系统设置」时，1 秒内的重渲染次数从 ~1 次/秒降为 0。

### P3-28 拖拽窗口时每次 mousemove 都 setState

- **位置**：`src/components/desktop/Window.tsx:94-124`（`handlePointerMove` → `updateWindowPos/updateWindowSize`）
- **影响**：一次拖动触发几十到上百次 `windows` 数组更新 → 连带 Desktop 与全部 Window 重渲染（叠加 P3-27 更明显），可感知掉帧。
- **建议修法**：拖拽期间只更新本地 ref 并用 `transform` 直接改 DOM（或 `requestAnimationFrame` 节流），松手时再一次性提交到全局 state。

### P3-29 每秒把整个存档序列化写 localStorage

- **位置**：`GameContext.tsx:590-592`（`useEffect` 依赖整个 `state` → 每次都 `saveState(state)`）
- **影响**：每秒一次 `JSON.stringify(整个 state)` + 同步写盘（`storage.ts:358-364`），state 随背包/新闻/交易日志增长而变大。
- **建议修法**：debounce 到 3~5 秒，或对比序列化结果无变化则跳过；也可只在窗口 `visibilitychange/beforeunload` 时强制落盘。

### P3-30 背景 Canvas 的渲染与尺寸问题

- **位置**：`src/components/desktop/BackgroundCanvas.tsx`
- **问题**：
  1. `:70-76` `minimal`（纯深色）模式下仍持续 `requestAnimationFrame` 空转
  2. `:78-112` nebula 模式每帧绘制两个**全屏 radial gradient**（大半径、每帧重建），CPU 占用高
  3. `:60-63` `columns/drops`（矩阵雨）只在首次按初始宽度计算，窗口 resize 后不重算 → 列数错位；`stars/raindrops` 同理，resize 后可能出现画外粒子
  4. Canvas 未按 `devicePixelRatio` 缩放（`:15-16` 直接 `canvas.width = window.innerWidth`）→ 高分屏背景发虚
- **建议修法**：`minimal` 时停掉 RAF；nebula 用离屏 canvas 预渲染渐变贴图；resize 时重建 `drops` 数组；按 DPR 设置 canvas 尺寸。

### P3-31 在 render 阶段调用 `Math.random()` / `Date.now()`

- **位置（oxlint `react(purity)` 已报）**：
  - `Desktop.tsx:295`（`left: ${(i*5.5 + Math.random()*4)%100}%`，放天灯特效）
  - `Desktop.tsx:315`（流星的随机位置）
  - `StockMarketApp.tsx:275`（分红倒计时用 `Date.now()`）
  - `MinesweeperApp.tsx:145/149/159`
- **影响**：每次重渲染随机值都变 → 叠加 P3-27 的"每秒重渲染"，**放天灯/流星雨的粒子位置每秒抖动闪烁**；分红倒计时也会跳动。
- **建议修法**：用 `useMemo` 固定随机数组（依赖 `visualEffect.id`）；倒计时改为 state + 定时器驱动。

### P3-32 终端历史无限增长

- **位置**：`TerminalApp.tsx:80-83`（`newLines = [...history, ...]`，仅 `clear` 命令会清空）
- **建议修法**：超过 N 行（如 300）截断最早的记录。

---

## 6. ⚪ P4 一致性 / 文案 / 死代码 / 可访问性

### P4-33 `animate-pulse-fast` 完全失效（Tailwind v4 未加载 JS 配置）

- **位置**：使用处 `WoodenFishApp.tsx:285`；定义处 `tailwind.config.js:30-34`（`animation['pulse-fast']`）
- **原因**：项目用 Tailwind **v4**（`index.css:1` 只有 `@import "tailwindcss"`），v4 是 CSS-first，**不会自动加载 `tailwind.config.js`**，必须显式写 `@config "../tailwind.config.js";`。我已反查产物 CSS：`pulse-fast` **完全未生成** → 木鱼金色光环的脉冲动画没有生效。
- **建议修法（二选一）**：
  1. 在 `index.css` 顶部加 `@config "../tailwind.config.js";`（同时让 `colors.cyber.*`、`boxShadow.neon-*` 也复活）
  2. 删除 `tailwind.config.js`，把这一个动画用 v4 语法写进 CSS：`@theme { --animate-pulse-fast: pulse 1s cubic-bezier(0.4,0,0.6,1) infinite; }`
- **验收标准**：构建产物 CSS 中出现 `animate-pulse-fast` 规则。

### P4-34 `no-scrollbar` 类不存在（滚动条仍会显示）

- **位置**：`Taskbar.tsx:126`、`DailyReportApp.tsx:207`、`GachaApp.tsx:185`（意图是隐藏横向滚动条）
- **现状**：`index.css` 与 Tailwind v4 都没有 `no-scrollbar` 定义，产物 CSS 也未生成 → 类被忽略。
- **建议修法**：在 `index.css` 补：

```css
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
```

### P4-35 `window.confirm` 未被统一接管，与自定义弹窗风格割裂

- **现状**：`GameContext.tsx:478-499` 只拦截了 `window.alert` 并有自定义 `CyberDialog`；但 4 处 `window.confirm` 仍是浏览器原生弹窗：`Taskbar.tsx:83`、`WheelLifeApp.tsx:167`、`DungeonApp.tsx:510`、`SystemSettingsApp.tsx:210`。而且 `dialog.onCancel` 的能力（`types/index.ts:60`、`Desktop.tsx:243-253`）已实现却无人使用。
- **建议修法**：在 Context 里补 `showConfirm(title, msg): Promise<boolean>`（或事件队列版），把这 4 处替换掉。
- **验收标准**：重置存档、重选武魂、撤离地牢等确认框均为赛博风格弹窗。

### P4-36 CRT 开关不持久化

- **位置**：`src/utils/storage.ts:350` 硬编码 `crtEffect: false`
- **现状**：用户打开 CRT 扫描线，刷新后自动关闭（注释说是"防止眼疲劳"，但与"设置项持久化"的直觉冲突，状态栏/设置页都有开关）。
- **建议修法**：保留用户选择；若确实想默认关闭，只在**首次**（无存档时）为 false。

### P4-37 使用了已废弃的 `escape` / `unescape`

- **位置**：`storage.ts:367`（`exportSaveData`）、`storage.ts:372`（`importSaveData`）、`GameContext.tsx:1259+`（`loadStateFromBase64`）
- **建议修法**：改用 `TextEncoder` + `btoa`（二进制安全），避免非 ASCII 字符与特殊码位被破坏。

### P4-38 涨跌配色与国内习惯相反

- **位置**：`StockMarketApp.tsx:57`（`isUp ? '#00ff66' : '#ff0055'`）、`:175`、`:195`、`TerminalApp.tsx:628`
- **现状**：**涨=绿、跌=红**（欧美习惯）。中国用户默认预期 **红涨绿跌**。
- **建议修法**：默认改为红涨绿跌，或提供配色开关。

### P4-39 文档与新手指引漂移

- **位置**：`README.md`（仅介绍 8 个应用）、`start.bat:8-9`
- **现状**：
  - README 只列了 8 个应用，实际 `Desktop.tsx:66-85` 有 **18 个**（量子扫雷、赛博钓鱼、交易所、斗地主、八卦炼宝炉、盲盒扭蛋、摸鱼日报、成就殿堂、转盘修仙等均未提及）
  - `start.bat` 先 `start http://localhost:5173` 再 `npm run dev`，服务器尚未就绪，浏览器会先打开一个连接失败的页面，需要手动刷新
- **建议修法**：README 补齐应用清单；`start.bat` 调换顺序，或在 dev 前加延时/健康检查。

### P4-40 大量未使用的 import / 变量（112 条 warning 的主要来源）

- **说明**：`tsconfig.app.json` 里 `noUnusedLocals: false`、`noUnusedParameters: false`，所以不影响构建，但污染 lint 结果、掩盖真正的问题。
- **典型**：
  - `DungeonApp.tsx:2`：`Shield / Sword / Trophy / RefreshCw / ArrowRight / ShoppingCart` 全未使用
  - `StockMarketApp.tsx:2,9`：7 个 icon + `addCredits` 未使用
  - `TerminalApp.tsx:5,24`：`listDir`、`showAlert` 未使用
  - `ForgeApp.tsx:5,14`：`ForgeTier`、`totalForged` 未使用
  - `MinesweeperApp.tsx:39`：`probesUsed` 未使用
  - `GameContext.tsx:3,451`：`StockItem`、`topZ`（`focusWindow` 里算了没用上）未使用
- **建议修法**：`npx oxlint --fix` 后人工复核（尤其是 `totalForged`、`probesUsed`、`topZ` —— 这些可能**本应参与 UI 展示或层级计算，属于"忘了用"的功能缺口**，修之前先确认设计意图）。

---

## 7. 建议的修复顺序（给执行方）

1. **P0-1 → P0-2 → P0-3**：先止血，保证不白屏、存档导入不崩
2. **P1-4 → P1-5**：把 `GameContext` 的 updater 改成纯函数并把返回值通道改成显式返回，这是后续所有数值问题的根
3. **P1-6 / P1-7**：音频（静音/音量）一致性，用户最容易感知
4. **P1-8 / P1-9 / P1-10**：道具双重收益与抽卡文案/保底
5. **P1-11 ~ P1-21**：各小游戏的独立逻辑 bug（可并行、互不影响）
6. **P2-22 ~ P2-26**：经济平衡（需先定"每小时可获得的赛博币上限"这一设计目标）
7. **P3-27 / P3-28 / P3-31**：性能（P3-27 收益最大，但改动面也最大，建议最后做）
8. **P4**：清洁度与文案，可随时穿插

---

## 8. 最小验证清单（每条都可手动复现）

| # | 操作 | 预期（修好前） | 对应条目 |
| --- | --- | --- | --- |
| 1 | 打开桌宠 → 点「桌面放养中」关闭 | dev 控制台出现 `Rendered fewer hooks than expected`，页面白屏 | P0-1 |
| 2 | 终端里连打 10 次 `ddos` | 赛博币正好 +$500，无任何冷却 | P2-22a |
| 3 | 打开木鱼开「狂暴超频」敲击，对比飘字与实际功德 | 开发模式下音效重叠、数值可能翻倍 | P1-4 |
| 4 | 系统设置导出存档 → 手改 `stocks: []` → 导入 → 开股市 | 崩溃 / 白屏 | P0-3 |
| 5 | 同时开「八卦炼宝炉」+「霓虹深渊」，按方向键 | 两个界面同时响应 | P1-11 |
| 6 | 使用【祈福天灯】 | 道具消失、特效播放，但**没有提示弹窗**（返回值失效） | P1-5 |
| 7 | 主音量拖到 5% → 静音 → 取消静音 | 音量跳回 30% | P1-6 |
| 8 | 播放赛博电台 → 点静音 | 电台继续响 | P1-7 |
| 9 | 用扭蛋券抽一次 | 抽卡同时赛博币 +$150 | P1-8 |
| 10 | 地下城踩神龛礼拜 → 离开 → 再踩 | 每次都能回满血 +150 功德 | P1-12 |

---

## 9. 本次审查的边界说明

- 全程**只读**，未修改、未新增项目源码；仅运行了 `oxlint` / `tsc --noEmit` / `tsc -b --dry`（不产出文件）并读取了既有 `dist/` 产物。
- `oxlint` 的 112 条 warning 中，`react(set-state-in-effect)`（AmbienceApp:79、StockMarketApp:23、SynthwaveApp:161、ForgeApp:47、MinesweeperApp:99、CommandPalette:44/212）多为风格提示，未逐条列为问题；如需可按原样修。
- 标记为**「建议复核」**的条目（P1-4 的数值翻倍后果、P1-5 的天灯/流星雨失效场景）基于 React 的 updater 预演（eagerState）与 StrictMode 双调用机制推导，建议执行方补日志/单测确认后再改。

### 附录A：`oxlint` 的 2 条 Error 原文

```
src/components/desktop/DesktopPet.tsx:24:3: React Hook "useEffect" is called conditionally. React Hooks must be called in the exact same order in every component render. [Error/react-hooks(rules-of-hooks)]
src/components/desktop/DesktopPet.tsx:42:3: React Hook "useEffect" is called conditionally. React Hooks must be called in the exact same order in every component render. [Error/react-hooks(rules-of-hooks)]
```

### 附录B：`oxlint` 全部输出（114 problems）

```text
src/components/apps/AmbienceApp.tsx:2:10: Identifier 'CloudRain' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/AmbienceApp.tsx:2:21: Identifier 'Server' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/AmbienceApp.tsx:2:29: Identifier 'Wind' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/AmbienceApp.tsx:2:82: Identifier 'Flame' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/AmbienceApp.tsx:2:89: Identifier 'Waves' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/AmbienceApp.tsx:2:96: Identifier 'CheckCircle' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/AmbienceApp.tsx:79:7: Calling setState synchronously within an effect can trigger cascading renders [Warning/react(set-state-in-effect)]
src/components/desktop/DesktopPet.tsx:2:10: Identifier 'Heart' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/DesktopPet.tsx:2:17: Identifier 'Sparkles' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/DesktopPet.tsx:2:27: Identifier 'X' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/DesktopPet.tsx:7:38: Variable 'toggleDesktopPetRoam' is declared but never used. Unused variables should start with a '_'. [Warning/eslint(no-unused-vars)]
src/components/desktop/DesktopPet.tsx:7:60: Variable 'showAlert' is declared but never used. Unused variables should start with a '_'. [Warning/eslint(no-unused-vars)]
src/components/desktop/DesktopPet.tsx:27:7: Cannot access variable while it is being initialized [Warning/react(immutability)]
src/components/desktop/DesktopPet.tsx:24:3: React Hook "useEffect" is called conditionally. React Hooks must be called in the exact same order in every component render. [Error/react-hooks(rules-of-hooks)]
src/components/desktop/DesktopPet.tsx:42:3: React Hook "useEffect" is called conditionally. React Hooks must be called in the exact same order in every component render. [Error/react-hooks(rules-of-hooks)]
src/components/apps/DailyReportApp.tsx:2:26: Identifier 'Sparkles' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/DailyReportApp.tsx:2:43: Identifier 'Coffee' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/DailyReportApp.tsx:2:63: Identifier 'RefreshCw' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/MarketApp.tsx:8:3: Identifier 'ALL_TRADEABLE' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/GachaApp.tsx:2:10: Identifier 'Gift' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/GachaApp.tsx:2:26: Identifier 'Trophy' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/GachaApp.tsx:2:34: Identifier 'HelpCircle' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/GachaApp.tsx:2:46: Identifier 'CheckCircle' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/GachaApp.tsx:2:73: Identifier 'Zap' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/CyberPetApp.tsx:2:36: Identifier 'Compass' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/CyberPetApp.tsx:2:45: Identifier 'Award' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/CyberPetApp.tsx:2:52: Identifier 'Shield' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/CyberPetApp.tsx:2:60: Identifier 'Sparkles' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/CyberPetApp.tsx:2:75: Identifier 'Target' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/CyberPetApp.tsx:2:83: Identifier 'Play' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/DesktopContextMenu.tsx:2:85: Identifier 'ExternalLink' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/StockMarketApp.tsx:2:36: Identifier 'DollarSign' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/StockMarketApp.tsx:2:48: Identifier 'Zap' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/StockMarketApp.tsx:2:64: Identifier 'AlertTriangle' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/StockMarketApp.tsx:2:79: Identifier 'Building' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/StockMarketApp.tsx:2:89: Identifier 'Home' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/StockMarketApp.tsx:2:95: Identifier 'Shield' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/StockMarketApp.tsx:2:103: Identifier 'Award' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/StockMarketApp.tsx:9:39: Variable 'addCredits' is declared but never used. Unused variables should start with a '_'. [Warning/eslint(no-unused-vars)]
src/components/apps/StockMarketApp.tsx:275:87: Cannot call impure function during render [Warning/react(purity)]
src/components/apps/StockMarketApp.tsx:23:7: Calling setState synchronously within an effect can trigger cascading renders [Warning/react(set-state-in-effect)]
src/components/apps/SynthwaveApp.tsx:2:34: Identifier 'Music' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/SynthwaveApp.tsx:2:41: Identifier 'Sparkles' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/SynthwaveApp.tsx:2:51: Identifier 'Volume2' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/SynthwaveApp.tsx:115:10: Cannot access refs during render [Warning/react(refs)]
src/components/apps/SynthwaveApp.tsx:161:7: Calling setState synchronously within an effect can trigger cascading renders [Warning/react(set-state-in-effect)]
src/components/apps/TrophyHallApp.tsx:2:10: Identifier 'Trophy' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/TrophyHallApp.tsx:2:31: Identifier 'CheckCircle2' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/TrophyHallApp.tsx:2:51: Identifier 'Sparkles' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/TrophyHallApp.tsx:2:61: Identifier 'Star' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/Taskbar.tsx:2:10: Identifier 'Terminal' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/Taskbar.tsx:2:20: Identifier 'Shield' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/Taskbar.tsx:2:28: Identifier 'Sparkles' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/Taskbar.tsx:2:38: Identifier 'TrendingUp' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/Taskbar.tsx:2:50: Identifier 'Music' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/Taskbar.tsx:2:57: Identifier 'Dog' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/Taskbar.tsx:2:62: Identifier 'Coffee' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/Taskbar.tsx:2:70: Identifier 'Settings' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/DungeonApp.tsx:2:10: Identifier 'Shield' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/DungeonApp.tsx:2:30: Identifier 'Sword' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/DungeonApp.tsx:2:37: Identifier 'Trophy' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/DungeonApp.tsx:2:45: Identifier 'RefreshCw' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/DungeonApp.tsx:2:66: Identifier 'ArrowRight' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/DungeonApp.tsx:2:78: Identifier 'ShoppingCart' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/DungeonApp.tsx:258:7: This value cannot be modified [Warning/react(immutability)]
src/components/apps/DungeonApp.tsx:258:7: Cannot modify local variables after render completes [Warning/react(immutability)]
src/components/apps/DungeonApp.tsx:446:66: React Hook useEffect has a missing dependency: 'movePlayer' [Warning/react-hooks(exhaustive-deps)]
src/components/apps/SnakeApp.tsx:2:10: Identifier 'Play' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/SnakeApp.tsx:2:16: Identifier 'RotateCcw' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/SnakeApp.tsx:2:35: Identifier 'Sparkles' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/SnakeApp.tsx:2:45: Identifier 'Zap' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/SnakeApp.tsx:2:50: Identifier 'Shield' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/SnakeApp.tsx:41:9: Cannot access refs during render [Warning/react(refs)]
src/components/apps/SnakeApp.tsx:109:51: React Hook useEffect has a missing dependency: 'state' [Warning/react-hooks(exhaustive-deps)]
src/components/desktop/Desktop.tsx:11:13: Identifier 'AlertTriangle' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/Desktop.tsx:11:28: Identifier 'CheckCircle' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/Desktop.tsx:11:41: Identifier 'Info' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/Desktop.tsx:11:47: Identifier 'Sparkles' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/Desktop.tsx:295:41: Cannot call impure function during render [Warning/react(purity)]
src/components/desktop/CommandPalette.tsx:2:18: Identifier 'Terminal' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/CommandPalette.tsx:2:28: Identifier 'AppWindow' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/CommandPalette.tsx:2:48: Identifier 'Sparkles' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/CommandPalette.tsx:4:10: Identifier 'AppId' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/desktop/CommandPalette.tsx:44:7: Calling setState synchronously within an effect can trigger cascading renders [Warning/react(set-state-in-effect)]
src/components/desktop/CommandPalette.tsx:212:5: Calling setState synchronously within an effect can trigger cascading renders [Warning/react(set-state-in-effect)]
src/components/apps/SystemSettingsApp.tsx:2:10: Identifier 'Download' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/SystemSettingsApp.tsx:2:20: Identifier 'Upload' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/SystemSettingsApp.tsx:2:54: Identifier 'Package' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/SystemSettingsApp.tsx:2:76: Identifier 'Award' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/SystemSettingsApp.tsx:2:83: Identifier 'BookOpen' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/ForgeApp.tsx:2:17: Identifier 'Sparkles' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/ForgeApp.tsx:2:38: Identifier 'Award' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/ForgeApp.tsx:2:88: Identifier 'Zap' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/ForgeApp.tsx:5:23: Identifier 'ForgeTier' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/ForgeApp.tsx:14:10: Variable 'totalForged' is declared but never used. Unused variables should start with a '_'. [Warning/eslint(no-unused-vars)]
src/components/apps/ForgeApp.tsx:47:5: Calling setState synchronously within an effect can trigger cascading renders [Warning/react(set-state-in-effect)]
src/components/apps/MinesweeperApp.tsx:2:18: Identifier 'Sparkles' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/MinesweeperApp.tsx:2:28: Identifier 'RefreshCw' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/MinesweeperApp.tsx:39:10: Variable 'probesUsed' is declared but never used. Unused variables should start with a '_'. [Warning/eslint(no-unused-vars)]
src/components/apps/MinesweeperApp.tsx:145:20: Cannot call impure function during render [Warning/react(purity)]
src/components/apps/MinesweeperApp.tsx:149:30: Cannot call impure function during render [Warning/react(purity)]
src/components/apps/MinesweeperApp.tsx:159:32: Cannot call impure function during render [Warning/react(purity)]
src/components/apps/MinesweeperApp.tsx:99:5: Calling setState synchronously within an effect can trigger cascading renders [Warning/react(set-state-in-effect)]
src/components/apps/DouDizhuApp.tsx:228:15: Variable 'wingCount' is declared but never used. Unused variables should start with a '_'. [Warning/eslint(no-unused-vars)]
src/components/apps/DouDizhuApp.tsx:71:17: Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components. [Warning/react(only-export-components)]
src/components/apps/DouDizhuApp.tsx:475:10: React Hook useEffect has a missing dependency: 'game' [Warning/react-hooks(exhaustive-deps)]
src/components/apps/TerminalApp.tsx:5:58: Identifier 'listDir' is imported but never used. [Warning/eslint(no-unused-vars)]
src/components/apps/TerminalApp.tsx:24:94: Variable 'showAlert' is declared but never used. Unused variables should start with a '_'. [Warning/eslint(no-unused-vars)]
src/components/apps/TerminalApp.tsx:43:8: Cannot access refs during render [Warning/react(refs)]
src/context/GameContext.tsx:3:67: Identifier 'StockItem' is imported but never used. [Warning/eslint(no-unused-vars)]
src/context/GameContext.tsx:451:10: Variable 'topZ' is declared but never used. Unused variables should start with a '_'. [Warning/eslint(no-unused-vars)]
src/context/GameContext.tsx:1538:14: Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components. [Warning/react(only-export-components)]
src/context/GameContext.tsx:453:11: Cannot access refs during render [Warning/react(refs)]
src/context/GameContext.tsx:680:19: React Hook useCallback has a missing dependency: 'UPGRADE_COSTS' [Warning/react-hooks(exhaustive-deps)]

114 problems
```
