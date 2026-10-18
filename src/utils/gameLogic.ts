import { GameState, InventoryItem } from '../types';

/**
 * Single source of truth for cross-app game rules:
 * achievements (with real, applied bonuses), real estate & merit multipliers.
 */

export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
  reward: string;
  check: (state: GameState) => boolean;
}

// Each unlocked achievement grants a real +5% global merit gain (stackable).
export const MERIT_BONUS_PER_ACHIEVEMENT = 0.05;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'a1', title: '第一桶金', desc: '拥有超过 ₵5,000 赛博币', icon: '💰', reward: '全局功德获取 +5%', check: (s) => s.credits >= 5000 },
  { id: 'a2', title: '赛博道祖', desc: '累计功德超过 1,000 点', icon: '📿', reward: '全局功德获取 +5%', check: (s) => s.totalMeritGained >= 1000 },
  { id: 'a3', title: '木鱼圣手', desc: '累计手动敲击木鱼 100 次', icon: '🪘', reward: '全局功德获取 +5%', check: (s) => s.totalClicks >= 100 },
  { id: 'a4', title: '华尔街之狼', desc: '持有任意股票多空仓位', icon: '📈', reward: '全局功德获取 +5%', check: (s) => s.stocks.some((st) => st.ownedAmount > 0) },
  { id: 'a5', title: '机甲伙伴', desc: '机甲宠物达到 3 级以上', icon: '🐕', reward: '全局功德获取 +5%', check: (s) => s.pet.level >= 3 },
  { id: 'a6', title: '武魂觉醒', desc: '在转盘修仙中成功觉醒武魂', icon: '🎡', reward: '全局功德获取 +5%', check: (s) => !!s.wheelLife?.awakenedSoul },
  { id: 'a7', title: '极客黑客', desc: '终端挖矿使算力达到 15 GH/s', icon: '💻', reward: '全局功德获取 +5%', check: (s) => s.hashrate >= 15 },
  { id: 'a8', title: '法宝收藏家', desc: '背包拥有超过 3 种法宝道具', icon: '🎁', reward: '全局功德获取 +5%', check: (s) => s.inventory.length >= 3 },
];

export function getUnlockedAchievementIds(state: GameState): Set<string> {
  const ever = new Set(state.unlockedAchievements || []);
  ACHIEVEMENTS.forEach((a) => {
    if (a.check(state)) ever.add(a.id);
  });
  return ever;
}

/** Achievements are permanent: once earned they stay earned even if the underlying
 *  condition goes away again (spending the $5,000 of a1, closing the a4 position …). */
export function getUnlockedAchievementCount(state: GameState): number {
  return getUnlockedAchievementIds(state).size;
}

/** Global merit multiplier from unlocked achievements (1.0 ~ 1.4). */
export function getAchievementMultiplier(state: GameState): number {
  return 1 + MERIT_BONUS_PER_ACHIEVEMENT * getUnlockedAchievementCount(state);
}

/**
 * Every multiplier that the collection/achievement pages promise as
 * 「全场功德」. Applied to BOTH manual taps and the automatic per-second
 * income — previously the god synergy and the m3 crown only boosted taps, so
 * idle players silently got none of what the text promised.
 */
export function getGlobalMeritMultiplier(state: GameState): number {
  const godBonus = isGachaSeriesComplete(state, 'god') ? 1.5 : 1;
  const m3Double = (state.claimedMilestones || []).includes('m3') ? 2 : 1;
  return getAchievementMultiplier(state) * godBonus * m3Double;
}

/** Final merit gained per wooden-fish tap (click upgrade × overdrive × global multiplier). */
export function getMeritPerTap(state: GameState, mult: number = 1): number {
  return Math.round(state.meritPerClick * mult * getGlobalMeritMultiplier(state));
}

export interface EstateDef {
  id: string;
  name: string;
  price: number;
  icon: string;
  desc: string;
  yield: number; // credits per payout cycle
}

export const ESTATE_PAYOUT_INTERVAL_MS = 60_000;

export const ESTATE_DEFS: EstateDef[] = [
  { id: 'car', name: '赛博磁悬浮跑车', price: 5000, icon: '🏎️', desc: '夜之城炫酷座驾，拉风属性拉满', yield: 100 },
  { id: 'yacht', name: '反重力巡航飞艇', price: 20000, icon: '🛸', desc: '高空奢华派对，租金源源不断', yield: 500 },
  { id: 'penthouse', name: '夜之城顶层全景豪宅', price: 100000, icon: '🏙️', desc: '俯瞰霓虹不夜城，顶级地段', yield: 3000 },
  { id: 'mars-superpod', name: '火星量子超算中心', price: 500000, icon: '🛰️', desc: '人类算力巅峰，躺赚之王', yield: 20000 },
];

export function getOwnedEstates(state: GameState): EstateDef[] {
  return ESTATE_DEFS.filter((e) => state.estates.includes(e.id));
}

export function getEstateIncomePerMinute(state: GameState): number {
  return getOwnedEstates(state).reduce((acc, e) => acc + e.yield, 0);
}

/**
 * Effect of every usable inventory item, keyed by item NAME.
 * Using an item consumes one and applies this effect.
 */
export interface ItemEffect {
  credits?: number;
  merit?: number;
  petExp?: number;
  petEnergy?: number;
  petHappiness?: number;
  petHunger?: number;
}

export const ITEM_EFFECTS: Record<string, ItemEffect> = {
  '极客高能冰美式': { petEnergy: 40, petHappiness: 20 },
  '超导液氮冰美式': { petEnergy: 40, petHappiness: 25 },
  '量子养生枸杞茶': { petEnergy: 30, petHappiness: 20 },
  '量子不卡顿散热片': { credits: 120 },
  '深夜加班能量豚骨拉面': { petHunger: 50, petHappiness: 10 },
  '机械小黄鸭 (Debug神器)': { merit: 80 },
  '产品经理需求退散符': { merit: 200 },
  'Bug 消除神针': { merit: 300 },
  '带薪顿悟舍利子': { merit: 500 },
  '死锁反弹无敌袈裟': { merit: 800 },
  '防脱发纳米生发液': { merit: 100, petHappiness: 40 },
  '单元测试全绿令': { credits: 150 },
  '神级降维工牌': { credits: 250 },
  '量子金条 (兑换券)': { credits: 1000 },
  'DDR7 赛博内存条 (128G)': { petExp: 100 },
  '宠物升级芯片': { petExp: 200 },

  // ---- 跨软件联动与产出道具 (Cross-App Synergy Items) ----
  // Use-value is deliberately below the 70% buyback so a free drop can never be
  // "used" at 100% of its market price to route around the exchange spread.
  '0-Day 漏洞特征码': { credits: 350, merit: 150 },
  '量子加密冷钱包': { credits: 800 },
  '量子探针': { credits: 60, merit: 30 },
  '九天玄晶矿石': { merit: 60 },
  '赛博扭蛋抽奖券': { credits: 150 },
  '年度优秀员工小红花': { petHunger: 100, petEnergy: 100, petHappiness: 100 },

  // ---- 八卦炼宝炉高阶法宝 (Artifact Forge Output) ----
  '凡铁玄晶': { merit: 30 },
  '淬火辟邪剑': { merit: 80, petExp: 40 },
  '聚灵八卦镜': { merit: 180, petExp: 80 },
  '太虚定风珠': { merit: 400, petExp: 160 },
  '紫霄神雷剑': { merit: 900, petExp: 300 },
  '翻天量子印': { merit: 2000, petExp: 600 },
  '混沌造化青莲': { merit: 5000, credits: 2000, petExp: 1200 },
  '开天诛仙真器': { merit: 12000, credits: 6000, petExp: 3000 },
};

/** Describe what using an item will do (for the inventory UI / toast). */
export function describeItemEffect(item: InventoryItem): string {
  const flavor = EMOTIONAL_FLAVOR[item.name];
  if (flavor) return `✨ 情绪价值道具：${flavor}`;
  const eff = ITEM_EFFECTS[item.name];
  if (!eff) return '稀有收藏品，暂无主动效果';
  const parts: string[] = [];
  if (eff.credits) parts.push(`赛博币 +₵${formatNumber(eff.credits)}`);
  if (eff.merit) parts.push(`功德 +${eff.merit}`);
  if (eff.petExp) parts.push(`宠物经验 +${eff.petExp}`);
  if (eff.petEnergy) parts.push(`宠物电量 +${eff.petEnergy}`);
  if (eff.petHappiness) parts.push(`宠物心情 +${eff.petHappiness}`);
  if (eff.petHunger) parts.push(`宠物饱食 +${eff.petHunger}`);
  return parts.join('，');
}

/* ------------------------------------------------------------------ */
/* 赛博交易所 — item catalog, pricing & shop stock (closed-loop economy) */
/* ------------------------------------------------------------------ */

export interface ItemDef {
  name: string;
  icon: string;
  desc: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

/** The gacha pool doubles as the tradeable item catalog. */
export const GACHA_POOL: ItemDef[] = [
  { name: '产品经理需求退散符', icon: '📜', desc: '相传贴在工位上，方圆十米内任何新增需求都会凭空消失', rarity: 'legendary' },
  { name: 'Bug 消除神针', icon: '💉', desc: '一针扎进主板，线上所有 NullPointerException 自动愈合', rarity: 'legendary' },
  { name: '带薪顿悟舍利子', icon: '📿', desc: '含在嘴里，摸鱼时大脑自动完成全栈系统重构', rarity: 'legendary' },
  { name: '死锁反弹无敌袈裟', icon: '🥋', desc: '受到周五上线需求攻击时，100% 概率反弹给提需求的人', rarity: 'legendary' },
  { name: '防脱发纳米生发液', icon: '🧴', desc: '涂抹后头顶生成高密度耐热量子毛囊', rarity: 'epic' },
  { name: '单元测试全绿令', icon: '✅', desc: '无需编写测试用例，CI/CD 流水线强行全绿通过', rarity: 'epic' },
  { name: '神级降维工牌', icon: '🏷️', desc: '佩戴后在公司拥有「薛定谔在岗」隐身状态', rarity: 'epic' },
  { name: 'DDR7 赛博内存条 (128G)', icon: '💾', desc: '可喂食机甲宠物，提升大量算力与经验', rarity: 'epic' },
  { name: '量子金条 (兑换券)', icon: '🪙', desc: '使用后兑换 ₵1,000 赛博币，童叟无欺', rarity: 'epic' },
  { name: '量子养生枸杞茶', icon: '🍵', desc: '饮用后精神百倍，延年益寿消除疲劳', rarity: 'rare' },
  { name: '超导液氮冰美式', icon: '☕', desc: '精神状态 +80，打工人续命终极神水', rarity: 'rare' },
  { name: '量子不卡顿散热片', icon: '📡', desc: '降低 CPU 温度 50 度，主频瞬间超频至 9.9GHz', rarity: 'rare' },
  { name: '深夜加班能量豚骨拉面', icon: '🍜', desc: '美味高能，宠物与打工人共享佳肴', rarity: 'common' },
  { name: '机械小黄鸭 (Debug神器)', icon: '🦆', desc: '对着它倾诉代码，它会默默为你点头', rarity: 'common' },
];

/** Shop-exclusive goods (never appear in the gacha pool). */
export const SHOP_EXCLUSIVE: ItemDef[] = [
  { name: '宠物升级芯片', icon: '🔧', desc: '注入机甲宠物体内，直接获得 200 点升级经验', rarity: 'epic' },
  // ---- 情绪价值 & 纯收藏 (no stat effects, pure joy) ----
  { name: '赛博烟花礼盒', icon: '🎆', desc: '燃放一场夜之城全屏烟花秀，仪式感直接拉满', rarity: 'epic' },
  { name: '赛博加特林连环烟花', icon: '🎇', desc: '狂暴加特林连环烟花大喷发，夜空绽放超导粒子光芒', rarity: 'legendary' },
  { name: '赛博香槟王2077', icon: '🍾', desc: '开瓶喷涌金黄泡沫，全场欢呼庆祝今日财富自由与零Bug', rarity: 'legendary' },
  { name: '赛博功德金光发生器', icon: '💡', desc: '全身沐浴在超导量子佛光之中，方圆十里邪祟退散', rarity: 'rare' },
  { name: '黄金尖叫鸡', icon: '🐔', desc: '按压发出魔性长鸣惨叫，彻底释放打工人积攒的所有怨念', rarity: 'common' },
  { name: '赛博暴富金币雨', icon: '🌧️', desc: '召唤一场夜之城金币豪雨，爽快感直接爆表', rarity: 'epic' },
  { name: '线上Bug装作没看见符', icon: '🙈', desc: '贴在屏幕边角，只要我不去刷新监控大盘，事故就追不上我', rarity: 'common' },
  { name: '赛博恋爱脑阻断剂', icon: '💖', desc: '智者不入爱河，建设美丽中国！理智值瞬间拉满', rarity: 'rare' },
  { name: '彩虹独角兽跨屏狂奔', icon: '🦄', desc: '召唤一只梦幻彩虹独角兽踏着七彩流光横穿桌面', rarity: 'epic' },
  { name: '至尊猫屎拿铁', icon: '☕', desc: '品一口极致奢华的猫咪精选咖啡豆，工位秒变塞纳河畔', rarity: 'rare' },
  { name: '祈福天灯', icon: '🏮', desc: '放一盏天灯飞向量子夜空，为永不宕机祈福', rarity: 'rare' },
  { name: '量子流星雨使用权', icon: '🌠', desc: '召唤一场流星雨划过夜之城，许愿有效期 24 小时', rarity: 'epic' },
  { name: '电子招财猫摆件', icon: '🐱', desc: '招财猫的电子分身，永远对你比心，纯纯情绪价值', rarity: 'rare' },
  { name: '锦鲤王官方复刻摆件', icon: '🐟', desc: '传说赛博锦鲤王的 1:1 复刻摆件，放在工位镇宅', rarity: 'legendary' },
  { name: '虚拟电子花束', icon: '💐', desc: '送给 code review 你代码的人，恶意自动 -50%', rarity: 'common' },
  { name: '年度摸鱼先锋奖杯', icon: '🏆', desc: '老板含泪颁发的至高荣誉，含金量未知但含糖量满分', rarity: 'legendary' },
  // ---- 跨软件联动与产出专属 ----
  { name: '0-Day 漏洞特征码', icon: '👾', desc: '量子扫雷掉落！在黑客终端中 hack 入侵可保证 100% 成功并掠夺双倍赏金！', rarity: 'legendary' },
  { name: '量子加密冷钱包', icon: '🔐', desc: '量子扫雷掉落！装载着古老加密资产，可在交易所直接高价变现', rarity: 'legendary' },
  { name: '量子探针', icon: '🔮', desc: '钓鱼与机甲宠物探索掉落！在赛博量子扫雷中可直接透视排除 1 颗地雷', rarity: 'rare' },
  { name: '九天玄晶矿石', icon: '💎', desc: '敲击电子木鱼掉落！八卦炼宝炉合成高阶本命法宝的核心原料', rarity: 'rare' },
  { name: '赛博扭蛋抽奖券', icon: '🎫', desc: '股市大赚或黑客入侵掉落！可在盲盒扭蛋机中免费抽取 1 次珍稀藏品', rarity: 'epic' },
  { name: '年度优秀员工小红花', icon: '🌸', desc: '生成每日摸鱼日报获得！喂食宠物可瞬间回满全部状态与精力', rarity: 'epic' },
  // ---- 八卦炼宝炉阶梯法宝 ----
  { name: '凡铁玄晶', icon: '⚪', desc: '一阶基础灵矿，八卦炉合成产物', rarity: 'common' },
  { name: '淬火辟邪剑', icon: '🗡️', desc: '二阶辟邪飞剑，初具灵气', rarity: 'common' },
  { name: '聚灵八卦镜', icon: '🪞', desc: '三阶聚灵法器，温养神魂', rarity: 'rare' },
  { name: '太虚定风珠', icon: '🔮', desc: '四阶定风宝珠，可镇地水火风', rarity: 'rare' },
  { name: '紫霄神雷剑', icon: '⚡', desc: '五阶紫霄天雷所铸飞剑，威能浩荡', rarity: 'epic' },
  { name: '翻天量子印', icon: '🧱', desc: '六阶重型法印，一印祭出山河崩塌', rarity: 'epic' },
  { name: '混沌造化青莲', icon: '🪷', desc: '七阶先天灵宝，造化神妙不绝', rarity: 'legendary' },
  { name: '开天诛仙真器', icon: '⚔️', desc: '八阶极道真仙道器，辟开混沌破灭乾坤', rarity: 'legendary' },
];

export const ALL_TRADEABLE: ItemDef[] = [...GACHA_POOL, ...SHOP_EXCLUSIVE];

export function getItemDef(name: string): ItemDef | undefined {
  return ALL_TRADEABLE.find((i) => i.name === name);
}

/** Reference credit value per item — shop sells at 100%, buyback pays 70%. */
const MARKET_VALUE: Record<string, number> = {
  '产品经理需求退散符': 900,
  'Bug 消除神针': 1100,
  '带薪顿悟舍利子': 1400,
  '死锁反弹无敌袈裟': 1600,
  '防脱发纳米生发液': 420,
  '单元测试全绿令': 320,
  '神级降维工牌': 480,
  'DDR7 赛博内存条 (128G)': 350,
  '量子金条 (兑换券)': 1000,
  '量子养生枸杞茶': 120,
  '超导液氮冰美式': 140,
  '量子不卡顿散热片': 180,
  '深夜加班能量豚骨拉面': 90,
  '机械小黄鸭 (Debug神器)': 130,
  '宠物升级芯片': 320,
  '赛博烟花礼盒': 500,
  '赛博加特林连环烟花': 666,
  '赛博香槟王2077': 888,
  '赛博功德金光发生器': 300,
  '黄金尖叫鸡': 99,
  '赛博暴富金币雨': 666,
  '线上Bug装作没看见符': 250,
  '赛博恋爱脑阻断剂': 199,
  '彩虹独角兽跨屏狂奔': 400,
  '至尊猫屎拿铁': 180,
  '祈福天灯': 300,
  '量子流星雨使用权': 800,
  '电子招财猫摆件': 260,
  '锦鲤王官方复刻摆件': 1200,
  '虚拟电子花束': 180,
  '年度摸鱼先锋奖杯': 1500,

  // 跨软件联动与产出
  '0-Day 漏洞特征码': 800,
  '量子加密冷钱包': 1500,
  '量子探针': 150,
  '九天玄晶矿石': 90,
  '赛博扭蛋抽奖券': 200,
  '年度优秀员工小红花': 350,

  // 炼宝炉阶梯法宝价值
  '凡铁玄晶': 40,
  '淬火辟邪剑': 100,
  '聚灵八卦镜': 260,
  '太虚定风珠': 600,
  '紫霄神雷剑': 1400,
  '翻天量子印': 3200,
  '混沌造化青莲': 8000,
  '开天诛仙真器': 20000,
};

/** Flavor text for emotional-value & collectible items (no stat effects). */
export const EMOTIONAL_FLAVOR: Record<string, string> = {
  '赛博烟花礼盒': '夜之城上空绽放了一场盛大的全屏烟花秀！',
  '赛博加特林连环烟花': '哒哒哒！加特林烟花向夜空疯狂喷吐绚烂火雨，整座夜之城为你瞩目！',
  '赛博香槟王2077': '嘭的一声巨响！香槟金沫四溢，赛博朋克音浪响起，庆祝财富自由与零事故！',
  '赛博功德金光发生器': '超导佛光普照全屏！你的灵魂获得了高维量子升华。',
  '黄金尖叫鸡': '“喔——喔——喔——！！” 尖叫鸡发出撕心裂肺的鸣叫，所有疲惫与压力烟消云散！',
  '赛博暴富金币雨': '无数闪耀的赛博硬币从天而降，哗啦啦的金币撞击声让你感到无比富有！',
  '线上Bug装作没看见符': '装作没看见符已贴好！只要我不去刷新报警大盘，线上就一片祥和太平。',
  '赛博恋爱脑阻断剂': '吞服完毕！心中无女人，拔剑自然神；心中无恋爱，代码跑得快！',
  '彩虹独角兽跨屏狂奔': '七彩流光在屏幕上飞驰，独角兽踏着赛博星云欢快地奔向天际！',
  '至尊猫屎拿铁': '你优雅地啜饮了一口至尊猫屎拿铁，整个人散发出贵族摸鱼的高级香气。',
  '祈福天灯': '天灯载着你的愿望缓缓飞向量子夜空……',
  '量子流星雨使用权': '量子流星雨划过夜之城，快许愿！',
  '电子招财猫摆件': '招财猫已上岗，正在对你疯狂比心，情绪价值 +10086。',
  '锦鲤王官方复刻摆件': '锦鲤王摆件镇守工位，今天也是欧气满满的一天！',
  '虚拟电子花束': '花束已送达，空气中弥漫着赛博玫瑰香。',
  '年度摸鱼先锋奖杯': '奖杯正在工位上闪闪发光，同事们投来羡慕的目光。',
};

const RARITY_FALLBACK_VALUE: Record<string, number> = { common: 60, rare: 150, epic: 450, legendary: 1000 };

export function getMarketValue(name: string, rarity: ItemDef['rarity']): number {
  return MARKET_VALUE[name] ?? RARITY_FALLBACK_VALUE[rarity] ?? 60;
}

export const SELL_RATE = 0.7;

export function getSellPrice(name: string, rarity: ItemDef['rarity']): number {
  return Math.max(5, Math.floor(getMarketValue(name, rarity) * SELL_RATE));
}

export function getBuyPrice(name: string, rarity: ItemDef['rarity']): number {
  return getMarketValue(name, rarity);
}

/** Always-stocked convenience goods. */
export const SHOP_STAPLES: string[] = ['超导液氮冰美式', '深夜加班能量豚骨拉面', '宠物升级芯片'];

/** Deterministic per-day rotation of 3 featured goods. */
export function getDailyShopStock(dateStr: string): string[] {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
  const pool = ALL_TRADEABLE.filter((i) => !SHOP_STAPLES.includes(i.name));
  const picks: string[] = [];
  let seed = hash;
  while (picks.length < 3 && pool.length > 0) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const idx = seed % pool.length;
    picks.push(pool[idx].name);
    pool.splice(idx, 1);
  }
  return picks;
}

/** Mystery box: ₵2,500 → guaranteed rare-or-better item. */
export const MYSTERY_BOX_PRICE = 2500;

export function rollMysteryBox(): ItemDef {
  const rare = GACHA_POOL.filter((i) => i.rarity === 'rare');
  const epic = GACHA_POOL.filter((i) => i.rarity === 'epic');
  const legendary = GACHA_POOL.filter((i) => i.rarity === 'legendary');
  const roll = Math.random();
  const sub = roll < 0.6 ? rare : roll < 0.92 ? epic : legendary;
  return sub[Math.floor(Math.random() * sub.length)];
}

/* ------------------------------------------------------------------ */
/* 🔮 八卦炼宝炉 — Forge Tiers & Mechanics                            */
/* ------------------------------------------------------------------ */

export interface ForgeTier {
  level: number;
  name: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
  desc: string;
}

export const FORGE_TIERS: ForgeTier[] = [
  { level: 1, name: '凡铁玄晶', icon: '⚪', color: 'text-slate-300', bg: 'bg-slate-800/80', border: 'border-slate-600', desc: '一阶玄铁灵矿，万物铸造之基' },
  { level: 2, name: '淬火辟邪剑', icon: '🗡️', color: 'text-cyan-300', bg: 'bg-cyan-950/80', border: 'border-cyan-500/50', desc: '二阶辟邪青锋，隐透森森寒光' },
  { level: 3, name: '聚灵八卦镜', icon: '🪞', color: 'text-blue-300', bg: 'bg-blue-950/80', border: 'border-blue-500/50', desc: '三阶聚灵法宝，映照天地灵息' },
  { level: 4, name: '太虚定风珠', icon: '🔮', color: 'text-purple-300', bg: 'bg-purple-950/80', border: 'border-purple-500/50', desc: '四阶玄空定风宝珠，万风莫侵' },
  { level: 5, name: '紫霄神雷剑', icon: '⚡', color: 'text-pink-300', bg: 'bg-pink-950/80', border: 'border-pink-500/50', desc: '五阶九天玄雷淬炼，斩妖灭魔' },
  { level: 6, name: '翻天量子印', icon: '🧱', color: 'text-amber-300', bg: 'bg-amber-950/80', border: 'border-amber-500/50', desc: '六阶重力坍缩法印，镇压山河' },
  { level: 7, name: '混沌造化青莲', icon: '🪷', color: 'text-emerald-300', bg: 'bg-emerald-950/80', border: 'border-emerald-500/50', desc: '七阶混沌青莲，万般因果造化' },
  { level: 8, name: '开天诛仙真器', icon: '⚔️', color: 'text-yellow-300', bg: 'bg-yellow-950/90', border: 'border-yellow-400', desc: '八阶极道真器，逆乱乾坤混沌' },
];

/* ------------------------------------------------------------------ */
/* 🎁 赛博盲盒扭蛋机 — Collection Series & Items                      */
/* ------------------------------------------------------------------ */

export type GachaSeriesId = 'god' | 'work' | 'cyber' | 'pet';

export interface GachaCollectionItem {
  id: string;
  name: string;
  series: GachaSeriesId;
  icon: string;
  rarity: 'R' | 'SR' | 'SSR' | 'UR';
  desc: string;
  quote: string;
}

export const GACHA_SERIES_INFO: Record<GachaSeriesId, { name: string; icon: string; desc: string; synergyDesc: string }> = {
  god: {
    name: '赛博神仙系列',
    icon: '🕉️',
    desc: '供奉赛博高维真仙，神力护体',
    synergyDesc: '【神仙羁绊】：集齐全套后，全场敲木鱼功德获取 +50%，斗地主胜局赛博币收益翻倍！',
  },
  work: {
    name: '打工人职场系列',
    icon: '💼',
    desc: '反抗内卷与沉淀黑话的至高荣誉勋章',
    synergyDesc: '【职场暴富】：集齐全套后，每日日报摸鱼津贴翻倍（₵600），股票交易印花税永久减免为 0！',
  },
  cyber: {
    name: '荒原机甲系列',
    icon: '🦾',
    desc: '夜之城顶级军工义体与传奇装备模型',
    synergyDesc: '【纳米强化】：集齐全套后，街机贪吃蛇移速提升并获得自动吸取食物的强力磁铁光环！',
  },
  pet: {
    name: '萌宠痛包系列',
    icon: '🐾',
    desc: '机甲电子宠物最爱的小挂件与玩具',
    synergyDesc: '【萌宠庇护】：集齐全套后，机甲宠物饱食与电量衰减速度减半，荒原探索经验获取 +50%！',
  },
};

export const GACHA_ITEMS: GachaCollectionItem[] = [
  // 赛博神仙系列 (6件)
  { id: 'g_god_1', series: 'god', name: '纳米加特林菩萨手办', icon: '🪷', rarity: 'UR', desc: '六根清净贫铀弹，一息三千六百转，大慈大悲度世人', quote: '“施主，贫僧这一梭子下去，你心结自解。”' },
  { id: 'g_god_2', series: 'god', name: '量子太上老君金印', icon: '🪙', rarity: 'SSR', desc: '通体镀金，印面刻有八卦二进制定理', quote: '“道可道，非常道；代码能跑即可，切莫重构。”' },
  { id: 'g_god_3', series: 'god', name: '赛博关公夜光义体', icon: '🗡️', rarity: 'SSR', desc: '青龙偃月刀连接等离子能源包，忠义无双', quote: '“过五关斩六将，单骑斩尽一切 NullPointerException！”' },
  { id: 'g_god_4', series: 'god', name: '全息混天绫小哪吒', icon: '🔥', rarity: 'SR', desc: '脚踩风火磁悬浮轮，头顶红缨双马尾', quote: '“我命由我不由天，加班不过十点半！”' },
  { id: 'g_god_5', series: 'god', name: '赛博财神聚宝盆', icon: '💰', rarity: 'SR', desc: '盆中不断溢出流动数据金币粒子', quote: '“恭喜发财，万币归宗，股市天天飘红！”' },
  { id: 'g_god_6', series: 'god', name: '净坛使者量子烤乳猪', icon: '🍖', rarity: 'R', desc: '外焦里嫩的纯数据虚拟烤猪，香气扑鼻', quote: '“师傅，前方有带薪下午茶，快去歇歇吧！”' },

  // 打工人职场系列 (6件)
  { id: 'g_work_1', series: 'work', name: '准点下班纯金工牌', icon: '🎖️', rarity: 'UR', desc: '18:00:00 准时鸣响并自动打卡的钛合金防摔工牌', quote: '“多待一秒，都是对神圣劳动法的亵渎。”' },
  { id: 'g_work_2', series: 'work', name: '摸鱼先锋保温杯', icon: '🥤', rarity: 'SSR', desc: '内置微型冷核聚变加热管，枸杞泡茶百年不凉', quote: '“多喝热水，少管闲事，延年益寿，长命百岁。”' },
  { id: 'g_work_3', series: 'work', name: '带薪如厕金马桶模型', icon: '🚽', rarity: 'SSR', desc: '打工人每天在马桶上静思的灵魂避风港', quote: '“只要我蹲得足够久，我每天都在领无风险分红。”' },
  { id: 'g_work_4', series: 'work', name: '需求退散八卦工位镜', icon: '🪞', rarity: 'SR', desc: '正面贴在显示器后，产品经理走近会自动折射迷路', quote: '“退！退！退！下周再提，今年已封版！”' },
  { id: 'g_work_5', series: 'work', name: '咖啡续命输液架', icon: '☕', rarity: 'SR', desc: '浓缩冷萃静脉直饮设备，眼皮绝不下垂', quote: '“我的身体里流淌的不是血液，是98号冷萃。”' },
  { id: 'g_work_6', series: 'work', name: '绩效3.75先锋大红花', icon: '🏵️', rarity: 'R', desc: '大厂打工人梦寐以求的年度殊荣', quote: '“今天我也是拉齐颗粒度的赋能先锋！”' },

  // 荒原机甲系列 (6件)
  { id: 'g_cyber_1', series: 'cyber', name: '斯安威斯坦神经骨骼模型', icon: '🦾', rarity: 'UR', desc: '启动瞬间世界陷入极慢子弹时间，夜之城传奇同款', quote: '“在这个世界上，没有什么能快过光，除了我的下班打卡。”' },
  { id: 'g_cyber_2', series: 'cyber', name: '军用级微型螳螂刀手办', icon: '⚔️', rarity: 'SSR', desc: '纳米级高频振动锋刃，切水果如有神助', quote: '“一刀划破迷雾，夜之城没有活着的传奇。”' },
  { id: 'g_cyber_3', series: 'cyber', name: '微型冷聚变反应堆挂件', icon: '⚛️', rarity: 'SSR', desc: '散发出幽蓝色的切伦科夫辐射荧光', quote: '“清洁能源，安全环保，可持续供电五百年。”' },
  { id: 'g_cyber_4', series: 'cyber', name: '强尼银手复刻吉他', icon: '🎸', rarity: 'SR', desc: '通电后狂响重金属摇滚和反叛旋律', quote: '“醒醒，武士！我们要把这座城市烧成灰！”' },
  { id: 'g_cyber_5', series: 'cyber', name: '夜之城全息霓虹明信片', icon: '🌃', rarity: 'SR', desc: '从太平洲望向荒坂塔的立体全息光栅卡片', quote: '“欢迎来到夜之城，这里梦想与垃圾齐飞。”' },
  { id: 'g_cyber_6', series: 'cyber', name: '赛博朋克重装机械拳套', icon: '🥊', rarity: 'R', desc: '重达五十公斤的动力锤拳套模型', quote: '“道理讲不通的时候，让拳套来和你说说。”' },

  // 萌宠痛包系列 (6件)
  { id: 'g_pet_1', series: 'pet', name: '机甲柴犬限定痛包', icon: '🐕', rarity: 'UR', desc: '透明夹层里塞满了会眨眼的像素柴犬小公仔', quote: '“带上本汪，走遍荒原都不怕迷路！”' },
  { id: 'g_pet_2', series: 'pet', name: '赛博猫咪全息霓虹耳麦', icon: '🎧', rarity: 'SSR', desc: '猫耳处支持 1600 万色 RGB 跑马灯流动', quote: '“喵喵喵？你刚刚说的需求，本喵一个字都没听清。”' },
  { id: 'g_pet_3', series: 'pet', name: '彩虹独角兽车头尾灯', icon: '🦄', rarity: 'SSR', desc: '点亮后在身后留下一道炫彩虹光轨迹', quote: '“冲向星辰大海，身后是七彩的彩虹屁！”' },
  { id: 'g_pet_4', series: 'pet', name: '仓鼠永动机超导滚轮', icon: '🐹', rarity: 'SR', desc: '仓鼠在上面跑一小时，能给整座机房供电', quote: '“跑跑跑，越跑电量越足，生命在于运动！”' },
  { id: 'g_pet_5', series: 'pet', name: '电子锦鲤转运祈福牌', icon: '🐟', rarity: 'SR', desc: '摇一摇清脆作响，上面刻着「天天涨停」', quote: '“锦鲤附体，逢考必过，抽卡必出金色传说！”' },
  { id: 'g_pet_6', series: 'pet', name: '机械小鸽子咕咕时钟', icon: '🕊️', rarity: 'R', desc: '每到整点准时探出头：“咕咕咕，该放鸽子了！”', quote: '“改天一定，下次一定，今天先摸了！”' },
];

export const GACHA_COST_CREDITS = 2000;

/** Ten-pull is priced at nine single pulls, as the UI advertises. */
export const GACHA_TEN_PULL_COST = GACHA_COST_CREDITS * 9;

export function getGachaCost(count: number): number {
  const n = Math.max(1, Math.min(10, Math.floor(count) || 1));
  return n === 10 ? GACHA_TEN_PULL_COST : GACHA_COST_CREDITS * n;
}

/** Base drop rates — these are what the UI publishes, and they sum to 1. */
export const GACHA_RATES: Array<{ rarity: 'UR' | 'SSR' | 'SR' | 'R'; p: number }> = [
  { rarity: 'UR', p: 0.05 },
  { rarity: 'SSR', p: 0.17 },
  { rarity: 'SR', p: 0.33 },
  { rarity: 'R', p: 0.45 },
];

/**
 * Counter-based pity. A threshold must sit *near* the natural interval to be a real
 * guarantee: with SR+ already at 55% per pull, a "20 pulls for SR+" pity is dead code
 * (P(hit) ≈ 5e-7) — the same trap as the original "10-pull guarantee" (P ≈ 3.4e-4).
 * These are ~2x the natural interval of the tiers that actually hurt to miss, so they
 * fire for a visible slice of players (≈13%) instead of never.
 */
export const GACHA_PITY_SSR = 12; // forces SSR-or-better
export const GACHA_PITY_UR = 40;  // forces UR


/** A duplicate collection piece refunds this fraction of its base value instead of evaporating. */
export const GACHA_DUPE_REFUND_RATE = 0.35;

/** Base credit value per collection grade — duplicates pay 35% of this back. */
export const GACHA_GRADE_VALUE: Record<GachaRarity, number> = { R: 1000, SR: 3500, SSR: 12000, UR: 35000 };

export function getGachaDupeRefund(rarity: GachaRarity): number {
  return Math.round(GACHA_GRADE_VALUE[rarity] * GACHA_DUPE_REFUND_RATE);
}

export type GachaRarity = 'UR' | 'SSR' | 'SR' | 'R';

export function pickGachaItem(rarity: GachaRarity): GachaCollectionItem {
  const pool = GACHA_ITEMS.filter((i) => i.rarity === rarity);
  const fallback = GACHA_ITEMS.filter((i) => i.rarity === 'R');
  return pool[Math.floor(Math.random() * pool.length)] ?? fallback[0];
}

/** Resolve one pull's rarity, honouring the pity counters (UR pity wins over SSR). */
export function rollGachaRarity(sinceSSR: number, sinceUR: number): { rarity: GachaRarity; pityHit: boolean } {
  if (sinceUR + 1 >= GACHA_PITY_UR) return { rarity: 'UR', pityHit: true };
  if (sinceSSR + 1 >= GACHA_PITY_SSR) return { rarity: 'SSR', pityHit: true };
  let roll = Math.random();
  for (const entry of GACHA_RATES) {
    if (roll < entry.p) return { rarity: entry.rarity, pityHit: false };
    roll -= entry.p;
  }
  return { rarity: 'R', pityHit: false };
}

/** A single resolved pull, returned by the gacha machine action. */
export interface GachaPullOutcome {
  item: GachaCollectionItem;
  isNew: boolean;
  /** Credits refunded because the piece was already in the cabinet. */
  refund: number;
  pityHit: boolean;
}

export function isGachaSeriesComplete(state: GameState, series: GachaSeriesId): boolean {
  const unlocked = new Set(state.gachaUnlockedIds || []);
  const items = GACHA_ITEMS.filter((i) => i.series === series);
  return items.every((i) => unlocked.has(i.id));
}

export function getGachaSynergies(state: GameState): { god: boolean; work: boolean; cyber: boolean; pet: boolean } {
  return {
    god: isGachaSeriesComplete(state, 'god'),
    work: isGachaSeriesComplete(state, 'work'),
    cyber: isGachaSeriesComplete(state, 'cyber'),
    pet: isGachaSeriesComplete(state, 'pet'),
  };
}

/** Compact currency/point formatting — raw `toLocaleString()` overflows the HUD
 *  once the idle numbers reach 1e10, and 1e21 renders as scientific notation. */
export function formatNumber(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${Math.round(n / 1e3)}K`;
  return Math.round(n).toLocaleString();
}

export const formatCredits = (value: number): string => `₵${formatNumber(value)}`;

export interface AchievementMilestone {
  id: string;
  requiredCount: number;
  title: string;
  desc: string;
  rewardDesc: string;
  icon: string;
}

export const ACHIEVEMENT_MILESTONES: AchievementMilestone[] = [
  {
    id: 'm1',
    requiredCount: 3,
    title: '铜阶荣誉领主',
    desc: '累计达成任意 3 项赛博成就',
    rewardDesc: '【赛博扭蛋抽奖券 ×3】直接入包',
    icon: '🥉',
  },
  {
    id: 'm2',
    requiredCount: 6,
    title: '银阶赛博道尊',
    desc: '累计达成任意 6 项赛博成就',
    rewardDesc: '+₵2,000 赛博币，功德 +500 点',
    icon: '🥈',
  },
  {
    id: 'm3',
    requiredCount: 8,
    title: '金阶赛博天尊 2077',
    desc: '达成全部 8 项至高赛博成就',
    rewardDesc: '获得至尊称号「赛博天尊」，+₵5,000 赛博币与功德 +2,000，全场功德（含挂机产出）永久 ×2 翻倍',
    icon: '👑',
  },
];

/* ------------------------------------------------------------------ */
/* 经济闭环 — 每日衰减 / 上限 / 强平 / 算力折旧                        */
/* ------------------------------------------------------------------ */

export interface ReleaseOption {
  id: 'duck' | 'koi' | 'turtle' | 'bug';
  name: string;
  cost: number;
  merit: number;
  msg: string;
}

/** 放生池 prices and base merit — the single source of truth for both the UI and the payout. */
export const RELEASE_OPTIONS: ReleaseOption[] = [
  { id: 'duck', name: '机械小黄鸭', cost: 30, merit: 50, msg: '赛博小黄鸭游向虚空云端，为你消除了一处隐藏死锁！' },
  { id: 'koi', name: '纳米机械锦鲤', cost: 100, merit: 200, msg: '锦鲤一跃龙门，为你全天多头注入祥瑞气息！' },
  { id: 'turtle', name: '量子长寿机械龟', cost: 300, merit: 800, msg: '长寿龟慢悠悠地游荡，打工人发量寿命大幅增加！' },
  { id: 'bug', name: '生产死锁巨型Bug', cost: 500, merit: 1500, msg: '以大智慧度化了生产 Bug，获得佛光普照与功德海量！' },
];

export const MERIT_TO_CREDIT_RATE = 0.8;

/**
 * 放生 pays out in merit which the pond-side exchange turns back into credits at
 * MERIT_TO_CREDIT_RATE. At 1500 merit for $500 the round trip returned 2.4x the
 * stake, compounding without limit ($1,150 → $2,673 in three clicks, measured).
 * Each release today multiplies the merit payout by another 0.85, so from the
 * sixth release the round trip is a net loss and the loop closes itself.
 */
export function getReleaseFactor(todayReleases: number): number {
  return Math.pow(0.85, Math.max(0, todayReleases));
}

/** Merit/credit ratio of a release — break-even against the exchange is 1 / 0.8 = 1.25. */
export function getReleaseRatio(option: ReleaseOption, todayReleases: number): number {
  return (option.merit * getReleaseFactor(todayReleases)) / option.cost;
}

export interface DailyLimits {
  key: string;
  label: string;
  /** full payout up to this many uses … */
  soft: number;
  /** … then payout falls to this fraction. */
  tail: number;
}

export const DAILY_LIMITS: Record<string, DailyLimits> = {
  fish: { key: 'fish', label: '垂钓', soft: 15, tail: 0.1 },
  train: { key: 'train', label: '宠物特训', soft: 20, tail: 0 },
  arena: { key: 'arena', label: '斗魂场', soft: 12, tail: 0.1 },
  forge: { key: 'forge', label: '炼宝出炉', soft: 10, tail: 0 },
  explore: { key: 'explore', label: '荒原探险', soft: 20, tail: 0.15 },
  dungeon: { key: 'dungeon', label: '地牢层数', soft: 30, tail: 0.35 },
};

/** Scale a per-run reward by how often that action was already used today. */
export function dailyDecay(count: number, limits: DailyLimits): number {
  return count >= limits.soft ? limits.tail : 1;
}

export const HASHRATE_CAP = 120;
/** Mining rigs lose a little efficiency at every payout — hashrate is not a permanent claim check. */
export const HASHRATE_DECAY_PER_PAYOUT = 0.03;

export interface PositionLike {
  ownedAmount: number;
  avgCost: number;
  price: number;
  position: 'none' | 'long' | 'short';
  leverage: number;
  margin: number;
}

/** Fraction of the margin that must remain or the position is force-closed. */
export const MAINTENANCE_RATIO = 0.35;

/** Signed mark-to-market PnL of a leveraged position. */
export function getPositionPnl(p: PositionLike): number {
  if (p.ownedAmount <= 0 || p.avgCost <= 0 || p.margin <= 0) return 0;
  const move = (p.price - p.avgCost) / p.avgCost;
  const direction = p.position === 'short' ? -1 : 1;
  return p.margin * direction * move * p.leverage;
}

/** Equity left in the position (credits returned if closed right now), floored at 0. */
export function getPositionEquity(p: PositionLike): number {
  return Math.max(0, p.margin + getPositionPnl(p));
}

/** Liquidation trigger. Without this, a leveraged position could never lose more than its
 *  margin — a 100x "free call option" that paid out unlimited upside on risk-free downside. */
export function shouldLiquidate(p: PositionLike): boolean {
  if (p.ownedAmount <= 0 || p.margin <= 0 || p.avgCost <= 0) return false;
  return getPositionEquity(p) < p.margin * MAINTENANCE_RATIO;
}

