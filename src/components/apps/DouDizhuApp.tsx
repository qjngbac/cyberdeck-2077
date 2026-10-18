import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Crown, Bot as RobotIcon, User } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';
import { formatCredits, isGachaSeriesComplete } from '../../utils/gameLogic';

/* ---------------- Cards & combos ---------------- */

interface Card {
  id: string;
  rank: number; // 3..14 (3..A), 15=2, 16=小王, 17=大王
  suit: string; // ♠ ♥ ♣ ♦ or 🃏
}

const RANK_LABEL: Record<number, string> = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王',
};

const SUITS = ['♠', '♥', '♣', '♦'];

function buildDeck(): Card[] {
  const deck: Card[] = [];
  let i = 0;
  for (let r = 3; r <= 15; r++) {
    for (const s of SUITS) deck.push({ id: `c${i++}`, rank: r, suit: s });
  }
  deck.push({ id: `c${i++}`, rank: 16, suit: '🃏' });
  deck.push({ id: `c${i++}`, rank: 17, suit: '🃏' });
  for (let k = deck.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [deck[k], deck[j]] = [deck[j], deck[k]];
  }
  return deck;
}

type ComboType =
  | 'single' | 'pair' | 'trio' | 'trio1' | 'trio2'
  | 'straight' | 'pairseq' | 'plane' | 'plane1' | 'plane2'
  | 'four2' | 'four2pair' | 'bomb' | 'rocket';

interface Combo {
  type: ComboType;
  main: number;   // decisive rank
  len: number;    // straight/pairseq/plane length (units)
  cards: Card[];
}

const TYPE_LABEL: Record<ComboType, string> = {
  single: '单张', pair: '对子', trio: '三张', trio1: '三带一', trio2: '三带二',
  straight: '顺子', pairseq: '连对', plane: '飞机', plane1: '飞机带翅膀', plane2: '飞机带对翅',
  four2: '四带二', four2pair: '四带两对', bomb: '炸弹', rocket: '王炸',
};

function counts(cards: Card[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of cards) m.set(c.rank, (m.get(c.rank) ?? 0) + 1);
  return m;
}

function isSeq(ranks: number[]): boolean {
  for (let i = 1; i < ranks.length; i++) if (ranks[i] !== ranks[i - 1] + 1) return false;
  return true;
}

function pickCards(cards: Card[], rank: number, n: number): Card[] {
  return cards.filter((c) => c.rank === rank).slice(0, n);
}

/**
 * 翅膀校验（宽松通行版，界面上有公示）：
 * · 翅膀点数不得与机身重叠（调用方已按点数剔除）
 * · 翅膀里不得藏着炸弹（4 张同点）—— 炸弹不能被拆成单翅甩掉
 * · 大小王不得同时出现在翅膀里 —— 王炸同理
 * · 一对当作两张单翅是允许的（多数线上斗地主的判定）
 */
function validWings(wingCards: Card[], wingSize: number): boolean {
  const wm = counts(wingCards);
  if (wm.get(16) === 1 && wm.get(17) === 1) return false;
  for (const [, cnt] of wm) {
    if (cnt >= 4) return false;
    if (wingSize === 2 && cnt !== 2) return false;
  }
  return true;
}

/** Parse a selection into a legal combo (or null).
 *  `prefer` 是上家正在压的牌：同样 12 张三连三张既能读成「飞机 ×4」也能读成
 *  「飞机带三单 ×3」，按上家的读法优先，免得多义牌组被误判成压不过。 */
export function parseCombo(cards: Card[], prefer: Combo | null = null): Combo | null {
  const n = cards.length;
  if (n === 0) return null;
  const m = counts(cards);
  const ranks = [...m.keys()].sort((a, b) => a - b);

  if (n === 2 && m.get(16) === 1 && m.get(17) === 1) return { type: 'rocket', main: 17, len: 1, cards };
  if (n === 1) return { type: 'single', main: ranks[0], len: 1, cards };
  if (n === 2 && ranks.length === 1) return { type: 'pair', main: ranks[0], len: 1, cards };
  if (n === 3 && ranks.length === 1) return { type: 'trio', main: ranks[0], len: 1, cards };
  if (n === 4 && ranks.length === 1) return { type: 'bomb', main: ranks[0], len: 1, cards };

  if (n === 4 && ranks.length === 2) {
    const trio = ranks.find((r) => m.get(r) === 3);
    if (trio !== undefined) return { type: 'trio1', main: trio, len: 1, cards };
  }
  if (n === 5 && ranks.length === 2) {
    const trio = ranks.find((r) => m.get(r) === 3);
    if (trio !== undefined && m.get(ranks.find((r) => m.get(r) === 2)!) === 2) {
      return { type: 'trio2', main: trio, len: 1, cards };
    }
  }

  // straight: all singles, consecutive, max ≤ A
  if (n >= 5 && ranks.length === n && isSeq(ranks) && ranks[ranks.length - 1] <= 14) {
    return { type: 'straight', main: ranks[ranks.length - 1], len: n, cards };
  }
  // pair sequence
  if (n >= 6 && n % 2 === 0 && ranks.every((r) => m.get(r) === 2) && isSeq(ranks) && ranks[ranks.length - 1] <= 14) {
    return { type: 'pairseq', main: ranks[ranks.length - 1], len: n / 2, cards };
  }
  // plane family: pure trios / trios + k singles / trios + k pairs
  const planeCands: Combo[] = [];
  if (n >= 6 && n % 3 === 0 && ranks.every((r) => m.get(r) === 3) && isSeq(ranks) && ranks[ranks.length - 1] <= 14) {
    planeCands.push({ type: 'plane', main: ranks[ranks.length - 1], len: n / 3, cards });
  }

  // plane with wings: n = 4k (singles) or 5k (pairs)
  const trioRanks = ranks.filter((r) => m.get(r) === 3 && r <= 14);
  if (trioRanks.length >= 2) {
    // every consecutive window of k trio ranks, highest body first
    const windows = (k: number): number[][] => {
      const out: number[][] = [];
      for (let i = 0; i + k <= trioRanks.length; i++) {
        const w = trioRanks.slice(i, i + k);
        if (isSeq(w)) out.push(w);
      }
      return out.reverse();
    };
    const tryPlane = (wingSize: number, type: ComboType): Combo | null => {
      const k = n / (3 + wingSize);
      if (!Number.isInteger(k) || k < 2) return null;
      for (const chosen of windows(k)) {
        const wingCards = cards.filter((c) => !chosen.includes(c.rank));
        if (wingCards.length !== k * wingSize) continue;
        if (!validWings(wingCards, wingSize)) continue;
        return { type, main: chosen[chosen.length - 1], len: k, cards };
      }
      return null;
    };
    const p1 = tryPlane(1, 'plane1');
    if (p1) planeCands.push(p1);
    const p2 = tryPlane(2, 'plane2');
    if (p2) planeCands.push(p2);
  }
  if (planeCands.length) {
    const matching = prefer ? planeCands.find((c) => beats(c, prefer)) : undefined;
    return matching ?? planeCands[0];
  }

  // four with two / two pairs
  if (n === 6) {
    const quad = ranks.find((r) => m.get(r) === 4);
    if (quad !== undefined && validWings(cards.filter((c) => c.rank !== quad), 1)) {
      return { type: 'four2', main: quad, len: 1, cards };
    }
  }
  if (n === 8) {
    const quad = ranks.find((r) => m.get(r) === 4);
    if (quad !== undefined) {
      const others = ranks.filter((r) => r !== quad);
      const otherCards = cards.filter((c) => c.rank !== quad);
      if (others.every((r) => m.get(r) === 2) && validWings(otherCards, 2)) return { type: 'four2pair', main: quad, len: 1, cards };
    }
  }

  return null;
}

function beats(a: Combo, b: Combo | null): boolean {
  if (!b) return true;
  if (a.type === 'rocket') return true;
  if (b.type === 'rocket') return false;
  if (a.type === 'bomb') return b.type === 'bomb' ? a.main > b.main : true;
  if (b.type === 'bomb') return false;
  return a.type === b.type && a.len === b.len && a.main > b.main;
}

/* ---------------- AI ---------------- */

function handScore(hand: Card[]): number {
  let s = 0;
  const m = counts(hand);
  for (const [r, c] of m) {
    if (r === 17) s += 5;
    else if (r === 16) s += 3;
    else if (r === 15) s += 2;
    else if (r === 14) s += 1;
    else if (r === 13) s += 1;
    if (c === 4) s += 3;
  }
  return s;
}

/** 自由出牌的拆牌表：一把走完 → 最长顺子 → 三带 → 真单张 → 对子 → 炸弹收尾。
 *  炸弹与王炸只在能一把打完或无路可走时才甩，绝不硬拆对子出单张。 */
function planLead(hand: Card[]): Combo | null {
  if (hand.length === 0) return null;
  const whole = parseCombo(hand);
  if (whole) return whole;

  const m = counts(hand);
  const ranks = [...m.keys()].sort((a, b) => a - b);

  // 最长顺子（≥5，不含 2 与王），不再只试 len=5
  let best: number[] = [];
  let cur: number[] = [];
  for (const r of ranks) {
    if (r <= 14 && (m.get(r) ?? 0) >= 1) {
      cur = cur.length && r === cur[cur.length - 1] + 1 ? [...cur, r] : [r];
      if (cur.length > best.length) best = [...cur];
    } else cur = [];
  }
  if (best.length >= 5) {
    return {
      type: 'straight', main: best[best.length - 1], len: best.length,
      cards: best.map((r) => pickCards(hand, r, 1)[0]),
    };
  }

  // 三张：配一张真正的单牌当翅膀，凑不出单翅就光出三张
  const trioR = ranks.find((r) => m.get(r) === 3 && r <= 14);
  if (trioR !== undefined) {
    const trio = pickCards(hand, trioR, 3);
    const rest = hand.filter((c) => c.rank !== trioR);
    const rm = counts(rest);
    const kicker = [...rm.keys()].filter((r) => rm.get(r) === 1 && r <= 15).sort((a, b) => a - b)[0];
    if (kicker !== undefined) return { type: 'trio1', main: trioR, len: 1, cards: [...trio, ...pickCards(rest, kicker, 1)] };
    return { type: 'trio', main: trioR, len: 1, cards: trio };
  }

  // 单张只从「真的是单张」的点数里挑，王与 2 留着压牌
  const singles = ranks.filter((r) => m.get(r) === 1 && r <= 15);
  if (singles.length) return { type: 'single', main: singles[0], len: 1, cards: pickCards(hand, singles[0], 1) };

  const pairR = ranks.find((r) => m.get(r) === 2);
  if (pairR !== undefined) return { type: 'pair', main: pairR, len: 1, cards: pickCards(hand, pairR, 2) };

  const lastSingle = ranks.find((r) => m.get(r) === 1);
  if (lastSingle !== undefined) return { type: 'single', main: lastSingle, len: 1, cards: pickCards(hand, lastSingle, 1) };

  const bombR = ranks.find((r) => m.get(r) === 4);
  if (bombR !== undefined) return { type: 'bomb', main: bombR, len: 1, cards: pickCards(hand, bombR, 4) };

  return { type: 'single', main: ranks[0], len: 1, cards: pickCards(hand, ranks[0], 1) };
}

/** Smallest combo that beats `required` from `hand` (null if none).
 *  `notes` 记录「不得不拆牌」的说明，`banned` 用于复验失败后换一批候选。 */
function findBeat(
  rawHand: Card[],
  required: Combo | null,
  allowBomb: boolean,
  notes?: string[],
  banned?: Set<string>
): Combo | null {
  const hand = banned && banned.size ? rawHand.filter((c) => !banned.has(c.id)) : rawHand;
  const m = counts(hand);
  const ranks = [...m.keys()].sort((a, b) => a - b);
  const hasRocket = (m.get(16) ?? 0) >= 1 && (m.get(17) ?? 0) >= 1;

  // 出这一手会拆掉什么：0 = 干净，越大越不该动（保住三张/炸弹/王炸与 2、王这些控制牌）
  const costIn = (mm: Map<number, number>, r: number, need: number) => {
    const cnt = mm.get(r) ?? 0;
    let c = Math.max(0, cnt - need) * 6;
    if (r >= 16 && hasRocket) c += 20;
    return c + Math.max(0, r - 14) * 2;
  };
  const orderIn = (mm: Map<number, number>, pool: number[], need: number) =>
    pool.map((r) => ({ r, cost: costIn(mm, r, need) })).sort((a, b) => a.cost - b.cost || a.r - b.r);
  const flagBreak = (mm: Map<number, number>, r: number, need: number) => {
    if (!notes) return;
    const cnt = mm.get(r) ?? 0;
    const what =
      r >= 16 && hasRocket ? '王炸'
      : cnt === 4 ? `${RANK_LABEL[r]} 的炸弹`
      : cnt === 3 && need < 3 ? `${RANK_LABEL[r]} 的三张`
      : cnt === 2 && need === 1 ? `${RANK_LABEL[r]} 的对子`
      : '';
    if (what) notes.push(`忍痛拆开${what}`);
  };

  if (!required) return planLead(hand);

  const trySameType = (): Combo | null => {
    const req = required!;
    const t = req.type;
    const above = (need: number) => ranks.filter((r) => (m.get(r) ?? 0) >= need && r > req.main);
    switch (t) {
      case 'single':
      case 'pair':
      case 'trio': {
        const need = t === 'single' ? 1 : t === 'pair' ? 2 : 3;
        const best = orderIn(m, above(need), need)[0];
        if (!best) return null;
        if (best.cost > 0) flagBreak(m, best.r, need);
        return { type: t, main: best.r, len: 1, cards: pickCards(hand, best.r, need) };
      }
      case 'trio1':
      case 'trio2': {
        const body = orderIn(m, above(3), 3)[0];
        if (!body) return null;
        if (body.cost > 0) flagBreak(m, body.r, 3);
        const trio = pickCards(hand, body.r, 3);
        const rest = hand.filter((c) => c.rank !== body.r);
        const rm = counts(rest);
        const need = t === 'trio1' ? 1 : 2;
        const wing = orderIn(rm, [...rm.keys()].filter((x) => x <= 15 && (rm.get(x) ?? 0) >= need), need)[0];
        if (!wing) return null;
        if (wing.cost > 0) flagBreak(rm, wing.r, need);
        return { type: t, main: body.r, len: 1, cards: [...trio, ...pickCards(rest, wing.r, need)] };
      }
      case 'straight':
      case 'pairseq': {
        const unit = t === 'straight' ? 1 : 2;
        const len = req.len;
        // 在所有能压过的窗口里挑「拆牌代价最小、点数最小」的那个
        let pick: { top: number; cost: number; cards: Card[] } | null = null;
        for (let start = 3; start + len - 1 <= 14; start++) {
          const top = start + len - 1;
          if (top <= req.main) continue;
          const seq = Array.from({ length: len }, (_, i) => start + i);
          if (!seq.every((r) => (m.get(r) ?? 0) >= unit)) continue;
          const cost = seq.reduce((acc, r) => acc + costIn(m, r, unit), 0);
          if (!pick || cost < pick.cost || (cost === pick.cost && top < pick.top)) {
            pick = { top, cost, cards: seq.flatMap((r) => pickCards(hand, r, unit)) };
          }
        }
        return pick ? { type: t, main: pick.top, len, cards: pick.cards } : null;
      }
      case 'plane':
      case 'plane1':
      case 'plane2': {
        const k = req.len;
        const wing = t === 'plane' ? 0 : t === 'plane1' ? 1 : 2;
        for (let start = 3; start + k - 1 <= 14; start++) {
          const seq = Array.from({ length: k }, (_, i) => start + i);
          const top = start + k - 1;
          if (top <= req.main) continue;
          if (!seq.every((r) => (m.get(r) ?? 0) >= 3)) continue;
          const trioCards = seq.flatMap((r) => pickCards(hand, r, 3));
          if (wing === 0) return { type: 'plane', main: top, len: k, cards: trioCards };
          const rest = hand.filter((c) => !seq.includes(c.rank));
          const rm = counts(rest);
          if (rest.length < k * wing) continue;
          // 翅膀优先每个点数各出一小组，且不带王，避免拆炸弹/王炸
          const pool = orderIn(rm, [...rm.keys()].filter((x) => x <= 15 && (rm.get(x) ?? 0) >= wing), wing).map((x) => x.r);
          const wings: Card[] = [];
          const picked = new Set<string>();
          const takeFrom = (wr: number, want: number) => {
            for (const c of rest) {
              if (want <= 0) break;
              if (c.rank !== wr || picked.has(c.id)) continue;
              picked.add(c.id);
              wings.push(c);
              want -= 1;
            }
          };
          for (const wr of pool) {
            if (wings.length >= k * wing) break;
            takeFrom(wr, wing);
          }
          // 单翅不够分散时再用同点的第二张补齐（一对当两单，宽松规则）
          if (wing === 1) for (const wr of pool) takeFrom(wr, k - wings.length);
          if (wings.length < k * wing) continue;
          if (wing === 1) return { type: 'plane1', main: top, len: k, cards: [...trioCards, ...wings] };
          return { type: 'plane2', main: top, len: k, cards: [...trioCards, ...wings] };
        }
        return null;
      }
      case 'four2':
      case 'four2pair': {
        const body = orderIn(m, above(4), 4)[0];
        if (!body) return null;
        const quad = pickCards(hand, body.r, 4);
        const rest = hand.filter((c) => c.rank !== body.r);
        const rm = counts(rest);
        const need = t === 'four2' ? 1 : 2;
        const pool = orderIn(rm, [...rm.keys()].filter((x) => (rm.get(x) ?? 0) >= need && !(hasRocket && x >= 16)), need);
        if (pool.length < 2) return null;
        const chosen = pool.slice(0, 2);
        for (const x of chosen) if (x.cost > 0) flagBreak(rm, x.r, need);
        return { type: t, main: body.r, len: 1, cards: [...quad, ...chosen.flatMap((x) => pickCards(rest, x.r, need))] };
      }
      default:
        return null;
    }
  };

  const normal = trySameType();
  if (normal) return normal;

  if (allowBomb) {
    const bombRank = ranks.find((r) => m.get(r) === 4);
    if (bombRank !== undefined && (!required || required.type !== 'bomb' || bombRank > required.main)) {
      return { type: 'bomb', main: bombRank, len: 1, cards: pickCards(hand, bombRank, 4) };
    }
    if (m.get(16) && m.get(17)) {
      return { type: 'rocket', main: 17, len: 1, cards: pickCards(hand, 16, 1).concat(pickCards(hand, 17, 1)) };
    }
  }
  return null;
}

/** AI 落库前统一复验：候选必须能被 parseCombo 解析成合法牌型，且真的压得过上家，
 *  否则换掉这批牌再试 —— 杜绝「牌型标签错到让下家按错的 type/len 应牌」。 */
function findBeatVerified(hand: Card[], required: Combo | null, allowBomb: boolean, notes: string[]): Combo | null {
  const banned = new Set<string>();
  for (let attempt = 0; attempt < 3; attempt++) {
    const cand = findBeat(hand, required, allowBomb, notes, banned);
    if (!cand) return null;
    for (const c of cand.cards) banned.add(c.id);
    const re = parseCombo(cand.cards, required);
    if (re && (!required || beats(re, required))) return re;
    notes.push('临时拼出的牌型不合规则，已改选别的');
  }
  return null;
}

/** 一次 AI 决策：纯函数，跑在 setState 之外，避免 StrictMode 双调用重复音效/日志。 */
function decideAiMove(cur: DDZState, ai: number): { move: Combo | null; note: string | null } {
  const hand = cur.hands[ai];
  const required = cur.lastPlay ? cur.lastPlay.combo : null;
  const lastBy = cur.lastPlay?.player ?? -1;
  const isTeammatePlay = cur.landlord !== ai && lastBy >= 0 && cur.landlord !== lastBy && lastBy !== ai;
  const notes: string[] = [];
  let move: Combo | null = null;

  if (required) {
    if (isTeammatePlay) {
      const teammateRemaining = cur.hands[lastBy].length;
      const canWinImmediately = hand.length <= required.cards.length;
      if (teammateRemaining <= 2 && !canWinImmediately) {
        move = null; // 队友只差 1-2 张就赢了，放他走
      } else if (required.type === 'bomb' || required.type === 'rocket' || required.main >= 15) {
        move = null; // 队友已祭出压制级大牌，不浪费手牌
      } else {
        move = findBeatVerified(hand, required, false, notes);
      }
    } else {
      // 对家牌少才值得甩炸弹：任何人手里只剩 ≤4 张、地主看两个农民都 ≤6 张、
      // 或自己已经短到需要抢节奏时才动用炸弹。
      const foes = [0, 1, 2].filter((p) => p !== ai);
      const foeClose = Math.min(...foes.map((p) => cur.hands[p].length)) <= 4;
      const peasantsLow = cur.landlord === ai && Math.max(...foes.map((p) => cur.hands[p].length)) <= 6;
      const allowBomb = foeClose || peasantsLow || hand.length <= 6 || required.main >= 15;
      move = findBeatVerified(hand, required, allowBomb, notes);
    }
  } else {
    move = findBeatVerified(hand, null, false, notes);
  }

  return { move, note: notes.length ? [...new Set(notes)].join('，') : null };
}

/* ---------------- Game state ---------------- */

const BASE_STAKE = 100;
const AI_NAMES = ['赛博老K', '霓虹阿姐'];

type SpringKind = 'none' | 'spring' | 'anti';

interface DDZState {
  hands: Card[][]; // 0 = me, 1 = right AI, 2 = left AI
  landlord: number;
  bottom: Card[];
  turn: number;
  lastPlay: { player: number; combo: Combo } | null;
  passStreak: number;
  multiplier: number;
  phase: 'bidding' | 'playing' | 'over';
  landlordWon: boolean | null;
  finishedBy: number | null;
  lastAction: Record<number, 'play' | 'pass' | null>;
  /** 各家实际出牌手数：春天/反春天的判定依据，也是「逃单判负」的门槛。 */
  plays: Record<number, number>;
  spring: SpringKind;
  /** AI 拆牌/改口的战况说明（只是展示，不参与判定）。 */
  log: string | null;
}

interface NetInfo {
  claimed: number;   // 规则应得/应扣
  applied: number;   // addCredits 实际入账（余额钳 0 时会小于 claimed）
  iWon: boolean;
  abandoned: boolean;
  spring: SpringKind;
  multiplier: number;
  god: boolean;
}

const ORDER = [0, 1, 2]; // me → right AI → left AI
const nextTurn = (p: number) => ORDER[(ORDER.indexOf(p) + 1) % 3];
const SPRING_LABEL: Record<SpringKind, string> = { none: '', spring: '春天', anti: '反春天' };
const LS_FAST_KEY = 'CYBERDECK_OS_2077_DDZ_FAST';

const moneyText = (v: number) => `${v >= 0 ? '+' : '-'}${formatCredits(Math.abs(Math.round(v)))}`;

/** 手牌一多就换窄牌面并互相叠压，20 张也只剩一行，不会盖住出牌按钮。 */
const handTight = (n: number) => n >= 13;
const handShift = (n: number) => (n <= 12 ? 0 : Math.min(22, 2 + (n - 12) * 2));

/** 结束判定：春天 = 地主赢且两个农民一把没出过；反春天 = 农民赢且地主只出过开局那一手。 */
function finishGame(prev: DDZState, winner: number): DDZState {
  const plays = prev.plays || { 0: 0, 1: 0, 2: 0 };
  const landlordWon = winner === prev.landlord;
  const farmers = [0, 1, 2].filter((p) => p !== prev.landlord);
  const spring: SpringKind =
    landlordWon && farmers.every((f) => (plays[f] ?? 0) === 0)
      ? 'spring'
      : !landlordWon && (plays[prev.landlord] ?? 0) <= 1
      ? 'anti'
      : 'none';
  return {
    ...prev,
    phase: 'over',
    finishedBy: winner,
    landlordWon,
    spring,
    log: spring === 'none' ? prev.log : `🌸 ${SPRING_LABEL[spring]}！倍率再 ×2`,
  };
}

export const DouDizhuApp: React.FC = () => {
  const { state, addCredits, notify } = useGame();
  const [game, setGame] = useState<DDZState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hintCards, setHintCards] = useState<Set<string>>(new Set());
  const [net, setNet] = useState<NetInfo | null>(null);
  const [fast, setFast] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_FAST_KEY) === '1';
    } catch {
      return false;
    }
  });
  const settleRef = useRef(false);
  // 卸载结算与音效都要读「最新」状态，updater 里不能放副作用，所以走 ref
  const gameRef = useRef<DDZState | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  /** 结算：addCredits 的返回值才是真实入账增量（余额钳 0），文案一律按它来写。 */
  const settleOnce = useCallback(
    (g: DDZState, abandoned: boolean) => {
      if (settleRef.current) return;
      settleRef.current = true;
      const iAmLandlord = g.landlord === 0;
      const base = iAmLandlord ? 2 * BASE_STAKE : BASE_STAKE;
      const iWon = !abandoned && g.landlordWon === iAmLandlord;
      const springMult = g.spring !== 'none' ? 2 : 1;
      const god = iWon && isGachaSeriesComplete(stateRef.current, 'god');
      const claimed = (iWon ? base : -base) * g.multiplier * springMult * (god ? 2 : 1);
      const applied = addCredits(claimed);
      setNet({ claimed, applied, iWon, abandoned, spring: g.spring, multiplier: g.multiplier * springMult, god });
      if (abandoned) {
        SoundFX.playAlert();
        notify({
          title: '中途逃单判负',
          body: `牌局没打完就关窗，按输一局结算：${moneyText(applied)}。`,
          icon: '🪟',
          tone: 'error',
        });
      } else if (claimed > 0) SoundFX.playLevelUp();
      else SoundFX.playAlert();
    },
    [addCredits, notify]
  );

  // 逃单结算只跑在卸载清理里，且必须读最新的 settleOnce —— 用 ref 桥接，effect 依赖留空
  const settleRef2 = useRef(settleOnce);
  useEffect(() => {
    settleRef2.current = settleOnce;
  });
  useEffect(() => {
    return () => {
      const g = gameRef.current;
      if (!g || g.phase !== 'playing') return;
      // StrictMode 的 mount→unmount→mount 抖动时一张牌都还没出，不算逃单
      if ((g.plays?.[0] ?? 0) < 1) return;
      settleRef2.current(g, true);
    };
  }, []);

  const startGame = () => {
    const deck = buildDeck();
    const hands = [deck.slice(0, 17), deck.slice(17, 34), deck.slice(34, 51)];
    hands.forEach((h) => h.sort((a, b) => b.rank - a.rank));
    const bottom = deck.slice(51);
    setGame({
      hands,
      landlord: -1,
      bottom,
      turn: 0,
      lastPlay: null,
      passStreak: 0,
      multiplier: 1,
      phase: 'bidding',
      landlordWon: null,
      finishedBy: null,
      lastAction: { 0: null, 1: null, 2: null },
      plays: { 0: 0, 1: 0, 2: 0 },
      spring: 'none',
      log: null,
    });
    setSelected(new Set());
    setHintCards(new Set());
    setNet(null);
    settleRef.current = false;
    SoundFX.playLevelUp();
  };

  const callLandlord = (want: boolean) => {
    if (want) SoundFX.playLevelUp(); // 音效在 updater 外，StrictMode 双调用不会响两次
    setGame((prev) => {
      if (!prev || prev.phase !== 'bidding') return prev;
      let landlord: number;
      if (want) landlord = 0;
      else {
        const s1 = handScore(prev.hands[1]);
        const s2 = handScore(prev.hands[2]);
        landlord = s1 >= s2 ? 1 : 2;
      }
      const hands = prev.hands.map((h, i) => (i === landlord ? [...h, ...prev.bottom].sort((a, b) => b.rank - a.rank) : h));
      return {
        ...prev,
        landlord,
        hands,
        turn: landlord,
        phase: 'playing',
        lastAction: { 0: null, 1: null, 2: null },
      };
    });
  };

  // 正常打完一局的结算
  useEffect(() => {
    if (!game || game.phase !== 'over') return;
    settleOnce(game, false);
  }, [game, settleOnce]);

  const applyMove = useCallback((player: number, combo: Combo | null, note?: string | null) => {
    setGame((prev) => {
      if (!prev || prev.phase !== 'playing' || prev.turn !== player) return prev;
      const prevActions = prev.lastAction || { 0: null, 1: null, 2: null };
      const plays = prev.plays || { 0: 0, 1: 0, 2: 0 };

      if (!combo) {
        const passStreak = prev.passStreak + 1;
        if (passStreak >= 2) {
          const newLeader = prev.lastPlay ? prev.lastPlay.player : nextTurn(player);
          return {
            ...prev,
            turn: newLeader,
            lastPlay: null,
            passStreak: 0,
            lastAction: { 0: null, 1: null, 2: null },
          };
        }
        return {
          ...prev,
          turn: nextTurn(player),
          passStreak,
          lastAction: { ...prevActions, [player]: 'pass' },
        };
      }

      const hands = prev.hands.map((h, i) => (i === player ? h.filter((c) => !combo.cards.some((cc) => cc.id === c.id)) : h));
      const isBomb = combo.type === 'bomb' || combo.type === 'rocket';
      const next: DDZState = {
        ...prev,
        hands,
        lastPlay: { player, combo },
        passStreak: 0,
        multiplier: isBomb ? prev.multiplier * 2 : prev.multiplier,
        turn: nextTurn(player),
        lastAction: { ...prevActions, [player]: 'play' },
        plays: { ...plays, [player]: (plays[player] ?? 0) + 1 },
        // AI 的拆牌说明挂在自己手里，轮到自己出牌时清掉
        log: note ?? (player === 0 ? null : prev.log),
      };
      if (hands[player].length === 0) return finishGame(next, player);
      return next;
    });
  }, []);

  // AI turn driver —— 决策跑在 setState 之外，音效/日志只在真正落库那一次发出
  const gamePhase = game?.phase;
  const gameTurn = game?.turn;
  const aiDelay = fast ? 180 : 850;
  useEffect(() => {
    if (gamePhase !== 'playing' || gameTurn === 0 || gameTurn === undefined) return;
    const ai = gameTurn;
    const timer = setTimeout(() => {
      const current = gameRef.current;
      if (!current || current.phase !== 'playing' || current.turn !== ai) return;
      const { move, note } = decideAiMove(current, ai);
      if (move && (move.type === 'bomb' || move.type === 'rocket')) SoundFX.playSlash();
      applyMove(ai, move, note ? `${AI_NAMES[ai - 1]}${note}` : null);
    }, aiDelay);
    return () => clearTimeout(timer);
  }, [gameTurn, gamePhase, aiDelay, applyMove]);

  /* ---------------- UI helpers ---------------- */

  const toggleCard = (id: string) => {
    SoundFX.playKeyClick();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const humanPlay = () => {
    if (!game || game.turn !== 0 || game.phase !== 'playing') return;
    const cards = game.hands[0].filter((c) => selected.has(c.id));
    const required = game.lastPlay ? game.lastPlay.combo : null;
    const combo = parseCombo(cards, required);
    if (!combo) {
      SoundFX.playAlert();
      return;
    }
    if (required && !beats(combo, required)) {
      SoundFX.playAlert();
      return;
    }
    if (combo.type === 'bomb' || combo.type === 'rocket') SoundFX.playSlash();
    setSelected(new Set());
    setHintCards(new Set());
    applyMove(0, combo);
  };

  const humanPass = () => {
    if (!game || game.turn !== 0) return;
    if (!game.lastPlay) return;
    setSelected(new Set());
    setHintCards(new Set());
    applyMove(0, null);
  };

  const showHint = () => {
    if (!game || game.turn !== 0) return;
    const required = game.lastPlay ? game.lastPlay.combo : null;
    const notes: string[] = [];
    const move = findBeatVerified(game.hands[0], required, true, notes);
    if (!move) {
      SoundFX.playAlert();
      setHintCards(new Set());
      setSelected(new Set());
      return;
    }
    setSelected(new Set(move.cards.map((c) => c.id)));
    setHintCards(new Set(move.cards.map((c) => c.id)));
  };

  const toggleFast = () => {
    const next = !fast;
    setFast(next);
    try {
      localStorage.setItem(LS_FAST_KEY, next ? '1' : '0');
    } catch {
      // 存储不可用就只保留在本次会话里
    }
    SoundFX.playKeyClick();
  };

  /* ---------------- Render ---------------- */

  const renderCard = (
    card: Card,
    opts: { selected?: boolean; hint?: boolean; small?: boolean; tight?: boolean; shift?: number; z?: number; onClick?: () => void } = {}
  ) => {
    const isRed = card.suit === '♥' || card.suit === '♦' || card.rank >= 16;
    const isJoker = card.rank >= 16;
    return (
      <div
        key={card.id}
        onClick={opts.onClick}
        style={{ marginLeft: opts.shift, zIndex: opts.z }}
        className={`relative rounded-md border flex flex-col items-center justify-center font-black transition-all select-none ${
          opts.onClick ? 'cursor-pointer hover:-translate-y-2' : ''
        } ${
          // 手牌一多就收窄牌面并互相叠压，20 张也不会堆到 3~4 行挡住操作区
          opts.small ? 'w-7 h-10 text-[10px] shrink-0' : opts.tight ? 'w-9 h-14 text-xs shrink-0' : 'w-11 h-16 text-sm shrink-0'
        } ${
          opts.selected
            ? 'bg-cyan-100 border-cyan-400 -translate-y-4 shadow-neon-cyan ring-2 ring-cyan-400'
            : opts.hint
            ? 'bg-yellow-100 border-yellow-400 -translate-y-2'
            : 'bg-slate-100 border-slate-400 shadow-sm'
        }`}
      >
        <span className={isRed ? 'text-red-600 leading-none' : 'text-slate-800 leading-none'}>
          {isJoker ? (card.rank === 17 ? '大王' : '小王') : RANK_LABEL[card.rank]}
        </span>
        {!isJoker && <span className={`${isRed ? 'text-red-500' : 'text-slate-600'} text-[10px] leading-none mt-0.5`}>{card.suit}</span>}
      </div>
    );
  };

  const seatBadge = (idx: number) => {
    if (!game || game.landlord < 0) return null;
    return game.landlord === idx ? (
      <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-500 text-slate-950 font-black flex items-center gap-0.5"><Crown size={9} />地主</span>
    ) : (
      <span className="text-[9px] px-1 py-0.5 rounded bg-slate-700 text-slate-300 font-bold">农民</span>
    );
  };

  const aiSeat = (idx: number, align: 'left' | 'right') => {
    const isPlayingThisRound = game?.lastPlay?.player === idx;
    const hasPassed = game?.lastAction?.[idx] === 'pass';
    return (
      <div className={`flex flex-col gap-1.5 ${align === 'left' ? 'items-start' : 'items-end'}`}>
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-600 flex items-center justify-center">
            <RobotIcon size={16} className="text-cyan-400" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-200 flex items-center gap-1">
              {AI_NAMES[idx - 1]} {seatBadge(idx)}
            </div>
            <div className="text-[9px] text-slate-400 flex items-center gap-1">
              <span>{game ? `${game.hands[idx].length} 张牌` : ''}</span>
              {game?.turn === idx && game.phase === 'playing' && (
                <span className="text-yellow-400 font-bold animate-pulse">思考中…</span>
              )}
            </div>
          </div>
        </div>
        {/* last played cards / pass badge */}
        <div className="min-h-[2.2rem] flex items-center">
          {isPlayingThisRound && game?.lastPlay ? (
            <div className="flex gap-0.5 flex-wrap max-w-[180px]">
              {game.lastPlay.combo.cards.map((c) => renderCard(c, { small: true }))}
            </div>
          ) : hasPassed ? (
            <span className="text-[10px] font-bold text-slate-400 px-2 py-0.5 rounded bg-slate-900/90 border border-slate-700">
              不要
            </span>
          ) : (
            <span className="text-[9px] text-slate-600">{game?.phase === 'playing' ? '—' : ''}</span>
          )}
        </div>
      </div>
    );
  };

  if (!game) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-4 text-center space-y-4 font-mono text-xs select-none">
        <div className="text-5xl">🃏</div>
        <div>
          <div className="text-base font-black text-cyan-300 text-glow-cyan">赛博斗地主 · 人机对战</div>
          <div className="text-slate-400 text-[11px] mt-1">与两位 AI (赛博老K / 霓虹阿姐) 三人局，支持叫地主、顺子连对飞机炸弹王炸。</div>
        </div>
        <div className="text-[10px] text-slate-400 space-y-1 bg-slate-900/80 border border-slate-800 rounded-xl p-3 max-w-sm text-left">
          <div>• 底注 ₵{BASE_STAKE}：地主赢/输双倍，农民单倍</div>
          <div>• 每出一个炸弹/王炸，全场倍率 ×2</div>
          <div>• 春天（地主赢且两个农民一把没出过）/ 反春天（农民赢且地主只出过开局那一手）：倍率再 ×2</div>
          <div>• 飞机带翅膀：翅膀不得与机身同点，不得拆炸弹或拆王炸；一对可当作两张单翅（宽松规则，与多数线上斗地主一致）</div>
          <div>• 四带二同理：带的两张不得是大小王凑成的王炸</div>
          <div>• 中途关窗：已经出过牌后直接关闭窗口，按「判负」立即结算，别想跑单</div>
          <div>• 赢了赚赛博币，输了扣赛博币（余额最低扣到 0，结算面板按实际入账显示）</div>
        </div>
        <button
          onClick={startGame}
          className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:brightness-110 text-slate-950 font-black text-sm shadow-neon-cyan"
        >
          🃏 开始对局
        </button>
      </div>
    );
  }

  if (game.phase === 'bidding') {
    return (
      <div className="flex flex-col h-full items-center justify-center p-4 text-center space-y-4 font-mono text-xs select-none">
        <div className="text-3xl">🃏</div>
        <div className="text-sm font-black text-yellow-300">叫地主阶段</div>
        <div className="flex gap-0.5 flex-wrap justify-center max-w-md">
          {game.hands[0].map((c, idx) => renderCard(c, { tight: handTight(game.hands[0].length), shift: idx === 0 ? undefined : -handShift(game.hands[0].length), z: idx + 1 }))}
        </div>
        <div className="text-slate-400 text-[10px]">叫地主可以拿 3 张底牌并先出牌，但输赢都双倍！</div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => callLandlord(true)}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 text-slate-950 font-black shadow-neon-gold"
          >
            👑 叫地主
          </button>
          <button
            onClick={() => callLandlord(false)}
            className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold border border-slate-600"
          >
            不叫 (让 AI 当)
          </button>
        </div>
      </div>
    );
  }

  const me = game.hands[0];
  const myTurn = game.turn === 0 && game.phase === 'playing';
  const canPass = myTurn && !!game.lastPlay;
  const iAmLandlord = game.landlord === 0;
  const handOverlap = handShift(me.length);
  // 春天/反春天还在「望」里时给个实时提示，免得结算突然 ×2 看不懂
  const farmersPlays = [0, 1, 2].filter((p) => p !== game.landlord).reduce((a, f) => a + (game.plays?.[f] ?? 0), 0);
  const springWatch =
    game.phase === 'playing' && game.landlord >= 0
      ? farmersPlays === 0
        ? '春天在望'
        : (game.plays?.[game.landlord] ?? 0) <= 1
        ? '反春天在望'
        : ''
      : '';
  const selectedCards = me.filter((c) => selected.has(c.id));
  const required = game.lastPlay ? game.lastPlay.combo : null;
  // 和 humanPlay 用同一个 prefer，多义牌组的读数才不会两边不一致
  const selectedCombo = parseCombo(selectedCards, required);
  const canPlay = myTurn && selectedCombo !== null && (!required || beats(selectedCombo, required));

  return (
    <div className="flex flex-col h-full font-mono text-xs select-none">
      {/* Top: AI seats */}
      <div className="flex items-start justify-between p-2">
        {aiSeat(2, 'left')}
        {/* Center info */}
        <div className="text-center">
          <div className="text-[10px] text-slate-400">底牌</div>
          <div className="flex gap-0.5 justify-center my-1">
            {game.bottom.map((c) => renderCard(c, { small: true }))}
          </div>
          <div className="text-[10px] text-yellow-300 font-bold">倍率 ×{game.multiplier}</div>
          {springWatch && <div className="text-[9px] text-pink-300 font-bold">🌸 {springWatch} ×2</div>}
        </div>
        {aiSeat(1, 'right')}
      </div>

      {/* Middle: turn indicator */}
      <div className="text-center text-[10px] text-slate-400 py-0.5">
        {game.phase === 'over' ? (
          <span className={`font-black text-sm ${game.landlordWon === iAmLandlord ? 'text-green-400' : 'text-red-400'}`}>
            {game.landlordWon === iAmLandlord ? '🎉 你赢了！' : '💀 你输了…'}
          </span>
        ) : myTurn ? (
          <span className="text-cyan-300 font-bold animate-pulse">轮到你出牌{game.lastPlay ? `（要压过 ${TYPE_LABEL[game.lastPlay.combo.type]}）` : '（自由出牌）'}</span>
        ) : (
          <span>等待 {game.turn === 1 ? AI_NAMES[0] : AI_NAMES[1]} 出牌…</span>
        )}
      </div>

      {/* Center Table: Active Trick / Last Played Cards */}
      <div className="flex-1 flex flex-col items-center justify-center px-2 min-h-[4rem]">
        {game.lastPlay ? (
          <div className="flex flex-col items-center gap-1 animate-in fade-in zoom-in-95 duration-150">
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5 font-bold">
              <span>{game.lastPlay.player === 0 ? '【我】' : `【${AI_NAMES[game.lastPlay.player - 1]}】`}</span>
              <span className="text-cyan-300">当前出牌：{TYPE_LABEL[game.lastPlay.combo.type]}</span>
            </div>
            <div className="flex gap-1 flex-wrap justify-center max-w-md py-0.5">
              {game.lastPlay.combo.cards.map((c) => renderCard(c, { small: false }))}
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-500 py-2 font-semibold flex items-center gap-1">
            <span>✨ 桌面已清空，获得自由出牌权</span>
          </div>
        )}
        {game.log && (
          <div className="text-[9px] text-amber-300/90 mt-1 max-w-md text-center leading-tight">📣 {game.log}</div>
        )}
      </div>

      {/* Game over panel */}
      {game.phase === 'over' && net && (
        <div className="text-center space-y-1 pb-1">
          <div className="text-[11px] text-slate-300">
            净胜负：<span className={net.applied > 0 ? 'text-green-400 font-black' : 'text-red-400 font-black'}>
              {moneyText(net.applied)}
            </span>
            {net.applied !== net.claimed && (
              <span className="ml-1.5 text-[10px] text-slate-500">
                (按规则应{net.claimed > 0 ? '收' : '扣'} {formatCredits(Math.abs(net.claimed))}，余额见底实{net.claimed > 0 ? '收' : '扣'} {formatCredits(Math.abs(net.applied))})
              </span>
            )}
            {net.abandoned && <span className="ml-1.5 text-[10px] text-red-400 font-bold">[中途逃单判负]</span>}
            <span className="ml-2 text-slate-500">{iAmLandlord ? '(你是地主)' : '(你是农民)'}</span>
          </div>
          <div className="text-[10px] text-slate-400">
            倍率来源：炸弹/王炸 ×{game.multiplier}
            {net.spring !== 'none' && <span className="text-pink-300 font-bold"> · {SPRING_LABEL[net.spring]} ×2</span>}
            {net.god && <span className="text-yellow-300 font-bold animate-pulse"> · ✨神仙羁绊 ×2</span>}
            <span className="ml-1 text-slate-300 font-bold">= 总倍率 ×{net.multiplier}</span>
          </div>
          <button onClick={startGame} className="px-5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black text-xs shadow-neon-cyan">
            🔄 再来一局
          </button>
        </div>
      )}

      {/* My hand */}
      <div className="px-2">
        {/* Selected Combo Info Banner */}
        {selectedCards.length > 0 && (
          <div className="text-[10px] text-center font-bold pb-1 flex items-center justify-center gap-1.5">
            <span className="text-slate-400">已选中 {selectedCards.length} 张:</span>
            {selectedCombo ? (
              <span className={canPlay ? 'text-green-400' : 'text-yellow-400'}>
                【{TYPE_LABEL[selectedCombo.type]}】{canPlay ? ' (可压过/出牌)' : ' (压不过上家)'}
              </span>
            ) : (
              <span className="text-red-400">【不合规则牌型】</span>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-0.5 justify-center pt-1 pb-1 min-h-[3.8rem] items-end">
          {me.map((c, idx) =>
            renderCard(c, {
              selected: selected.has(c.id),
              hint: hintCards.has(c.id) && !selected.has(c.id),
              tight: handTight(me.length),
              shift: idx === 0 ? undefined : -handOverlap,
              z: idx + 1,
              onClick: myTurn ? () => toggleCard(c.id) : undefined,
            })
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-2 py-1.5 border-t border-slate-800">
          <div className="text-[9px] text-slate-500 mr-1 flex items-center gap-1">
            <User size={10} /> 我 {seatBadge(0)}
          </div>
          <button
            onClick={humanPlay}
            disabled={!myTurn || !canPlay}
            className={`px-4 py-1.5 rounded-lg font-black text-xs transition-all ${
              canPlay
                ? 'bg-green-600 hover:bg-green-500 text-white shadow-neon-green cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
            }`}
          >
            出牌
          </button>
          <button
            onClick={humanPass}
            disabled={!canPass}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold text-xs border border-slate-600 cursor-pointer"
          >
            不要
          </button>
          <button
            onClick={showHint}
            disabled={!myTurn}
            className="px-3 py-1.5 rounded-lg bg-purple-950 hover:bg-purple-900 disabled:opacity-40 border border-purple-500/50 text-purple-300 font-bold text-xs cursor-pointer"
          >
            💡 提示
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-[10px]"
            >
              重选
            </button>
          )}
          <button
            onClick={toggleFast}
            title="AI 出牌节奏：正常 0.85s / 加速 0.18s"
            className={`px-2 py-1.5 rounded border text-[10px] font-bold cursor-pointer transition-colors ${
              fast
                ? 'bg-amber-950 border-amber-500/60 text-amber-300'
                : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200'
            }`}
          >
            {fast ? '⚡ 已加速' : '🐢 加速'}
          </button>
          <div className="text-[9px] text-slate-500 ml-1">剩 {me.length} 张</div>
        </div>
      </div>
    </div>
  );
};
