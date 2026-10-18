import React, { useState, useEffect, useRef } from 'react';
import { FileText, Copy, Check, Zap, Award } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';
import { ESTATE_DEFS, formatCredits, getMarketValue, getSellPrice, isGachaSeriesComplete } from '../../utils/gameLogic';

type RoleStyle = 'tech' | 'product' | 'ops' | 'moyu';

/** 与核心层 claimDailyReportReward 的单调判据保持一致（20 小时，而不是「换个日历就又是一天」）。 */
const REPORT_INTERVAL_MS = 20 * 3600 * 1000;
const FLOWER_NAME = '年度优秀员工小红花';

/** 无放回抽样：池子够大时绝不重复，池子不够才允许重复（否则三条要点 62.5% 概率撞句）。 */
const pickMany = (arr: string[], n: number): string[] => {
  if (arr.length === 0 || n <= 0) return [];
  if (arr.length < n) return Array.from({ length: n }, () => arr[Math.floor(Math.random() * arr.length)]);
  const pool = [...arr];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const j = Math.floor(Math.random() * pool.length);
    out.push(pool[j]);
    pool.splice(j, 1);
  }
  return out;
};

/** C(pool, need) —— 用于如实公示「这个风格究竟能拼出几种日报」。 */
const combinationsOf = (pool: number, need: number): number => {
  if (pool <= 0 || need <= 0) return 0;
  if (pool < need) return pool ** need;
  let c = 1;
  for (let i = 0; i < need; i++) c = (c * (pool - i)) / (i + 1);
  return Math.round(c);
};

interface StyleConfig {
  name: string;
  icon: string;
  desc: string;
  templates: {
    work: string[];
    logic: string[];
    plan: string[];
    reflection: string[];
  };
}

const STYLES: Record<RoleStyle, StyleConfig> = {
  tech: {
    name: '技术极客',
    icon: '👨‍💻',
    desc: '聚焦高并发底层架构重构与零宕机容灾治理',
    templates: {
      work: [
        '完成分布式高并发微服务链路的熔断治理，成功将全链路 P99 延迟降低 0.042ms。',
        '深入重构核心业务模型底层数据结构，消灭了 14 处内存潜在死锁隐患。',
        '编写并落地灰度金丝雀发布策略，赋能整个产研团队实现无人值守平滑发布。',
        '排查并攻坚线上高危 0-Day 线程挂起漏洞，沉淀了自动化单元测试回归套件。',
      ],
      logic: [
        '遵循云原生与微内核设计哲学，以解耦为抓手，完成业务链路与数据中台的彻底解绑。',
        '从第一性原理出发，重构状态机流转生命周期，让系统具备自我愈合的容灾韧性。',
      ],
      plan: [
        '持续监控量子集群算力水位，拉齐底层缓存淘汰策略的颗粒度。',
        '推进全链路压测常态化，探索无服务器架构在边缘节点的降本增效打法。',
      ],
      reflection: [
        '“代码不是写出来的，而是沉淀出来的；优雅的架构从不需要多余的注释。”',
      ],
    },
  },
  product: {
    name: '产品大牛',
    icon: '👔',
    desc: '聚焦用户心智沉淀、商业价值闭环与痛点打法',
    templates: {
      work: [
        '拉齐多方产研颗粒度，深度洞察核心下沉用户心智，输出 2.0 商业化矩阵 PRD。',
        '针对端到端核心转化漏洞，梳理出 3 条高频赋能路径并完成闭环验证。',
        '组织召开跨部门协同对齐会，重新定调 Q3 核心抓手与降本增效北极星指标。',
        '拆解竞品护城河底层逻辑，制定并复盘了差异化用户留存飞轮增长打法。',
      ],
      logic: [
        '通过将碎片化场景聚合成多维生态，打通信息茧房，实现端到端生态价值变现。',
        '以小步快跑的敏捷姿态，建立从流量沉淀到高净值转化的正向飞轮机制。',
      ],
      plan: [
        '与交互及研发团队深度复盘排期，保障重点迭代版本的颗粒度无缝对齐。',
        '探索 AI 交互赋能新范式，挖掘长尾用户的隐性痛点与潜在付费心智。',
      ],
      reflection: [
        '“不要为了做功能而做功能，我们交付的不是需求，而是高维认知与用户价值。”',
      ],
    },
  },
  ops: {
    name: '运营增长',
    icon: '📈',
    desc: '聚焦公私域联动、全域流量裂变与认知破圈',
    templates: {
      work: [
        '打通公私域多触点引流抓手，通过精细化人群包圈选实现 ROI 环比提升 340%。',
        '设计并落地裂变裂化传播矩阵，拉动社交链路自驱传播，成功打破圈层壁垒。',
        '复盘上周全链路运营投放转化漏斗，剔除低效渠道并重新调配资源打法。',
        '联合行业头部生态伙伴开展跨界联动，赋能品牌心智在泛科技领域的深度渗透。',
      ],
      logic: [
        '依托精细化用户生命周期模型，以内容为载体、以社交为抓手，驱动复利式自增长。',
        '打法必须下沉且具备穿透力，才能在存量博弈市场中建立不可替代的用户粘性。',
      ],
      plan: [
        '铺设次周社群私域冷启动物料，建立高忠诚度种子用户护城河。',
        '跟进 A/B 测试实验组转化效果，沉淀标准化裂变 SOP 与实战操盘方法论。',
      ],
      reflection: [
        '“流量的终点是心智，打法的核心是共鸣；沉淀确定性，拥抱指数级增长。”',
      ],
    },
  },
  moyu: {
    name: '带薪摸鱼',
    icon: '🛋️',
    desc: '薛定谔在岗哲学、战略性呼吸发呆与认知沉淀',
    templates: {
      work: [
        '全天候维持「薛定谔的键盘敲击状态」，成功让路过的 3 位领导误以为正在深度思考。',
        '深度开展带薪如厕天人感应 45 分钟，在静思中领悟了宇宙万物与代码的本质联系。',
        '持续监控公司内网饮水机水温与咖啡机出豆速度，确保打工人日常生理水分内循环。',
        '假装阅读《高并发架构实战》PDF，实则在赛博木鱼中完成了 800 次无上大功德敲击。',
      ],
      logic: [
        '多做多错，少做少错，不做不错；只要需求足够复杂，放一放它自己就会被取消。',
        '带薪发呆不是摸鱼，而是在高强度内卷的大环境下，给疲惫的灵魂注入超导润滑油。',
      ],
      plan: [
        '明天继续准点打卡并在 17:59:58 做好离开工位的量子力学校准准备。',
        '探寻公司各楼层无死角带薪摸鱼避风港，进一步优化防产品经理巡查的雷达预警机制。',
      ],
      reflection: [
        '“只要我准点下班，我就没有被剥削；只要我心怀功德，工位就是我的修仙道场。”',
      ],
    },
  },
};

export const DailyReportApp: React.FC = () => {
  const { state, claimDailyReportReward, showAlert, notify } = useGame();
  const [style, setStyle] = useState<RoleStyle>('tech');
  const [customKeyword, setCustomKeyword] = useState('');
  const [report, setReport] = useState<string>('');
  const [copied, setCopied] = useState(false);
  // 生成/领取防连点：津贴判据在核心层，这里只保证一次点击只发一次请求
  const [busy, setBusy] = useState(false);
  const claimLockRef = useRef(false);
  // 冷却倒计时用本地心跳驱动（不在 render 里读 Date.now，保持渲染纯净）
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 「今天能不能领」由核心层持久化的时间戳推导，绝不用 toDateString() 自己判断
  const lastReportAt = state.lastDailyReportAt ?? 0;
  const msToNext = Math.max(0, lastReportAt + REPORT_INTERVAL_MS - now);
  const claimReady = msToNext <= 0;
  const hoursToNext = msToNext / 3_600_000;

  const hasWorkSynergy = isGachaSeriesComplete(state, 'work');
  const stipend = hasWorkSynergy ? 600 : 300;
  const flowerValue = getMarketValue(FLOWER_NAME, 'epic');
  const flowerBuyback = getSellPrice(FLOWER_NAME, 'epic');
  // 津贴相对房产分红确实偏小，直接把换算摆出来，别让玩家以为这是笔大钱
  const estateMinutesPerStipend = (stipend / ESTATE_DEFS[0].yield);

  const tpl = STYLES[style].templates;
  const workNeed = customKeyword.trim() ? 2 : 3;
  const styleCombos =
    combinationsOf(tpl.work.length, workNeed) *
    combinationsOf(tpl.logic.length, 1) *
    combinationsOf(tpl.plan.length, 1) *
    combinationsOf(tpl.reflection.length, 1);

  const claimStipend = (): void => {
    // 防连点：一次点击只允许发一次领取请求（真正的判据仍在核心层）
    if (claimLockRef.current) return;
    claimLockRef.current = true;
    setTimeout(() => { claimLockRef.current = false; }, 1000);

    if (!claimReady) {
      SoundFX.playAlert();
      notify({
        title: '津贴冷却中',
        body: `距下次可领还剩 ${hoursToNext.toFixed(1)} 小时（核心判据：距上次入账满 20 小时，改系统时间无效）。`,
        icon: '⏳',
        tone: 'warn',
      });
      return;
    }
    // 一切以核心返回值为准：false 就是没发钱，不能显示成功
    if (claimDailyReportReward()) {
      showAlert(
        `🎉 报告出炉！系统发放本期【带薪合规摸鱼津贴】+${formatCredits(stipend)} 赛博币${hasWorkSynergy ? '（职场羁绊 ×2）' : ''}，并赠送【年度优秀员工小红花】🌸 放入背包！\n距下期津贴还有 20 小时。`,
        '带薪摸鱼津贴到账',
        '🌸',
        'gold',
      );
    } else {
      notify({ title: '津贴未发放', body: '冷却判据未通过（或已在别处领取），本次未入账。', icon: '⚠️', tone: 'error' });
    }
  };

  // Generate Report
  const generateReport = () => {
    if (busy) return;
    setBusy(true);
    setTimeout(() => setBusy(false), 600);
    SoundFX.playKeyClick();
    const s = STYLES[style];
    const workLines = customKeyword.trim() ? pickMany(s.templates.work, 2) : pickMany(s.templates.work, 3);
    const [logicLine] = pickMany(s.templates.logic, 1);
    const [planLine] = pickMany(s.templates.plan, 1);
    const [reflectionLine] = pickMany(s.templates.reflection, 1);

    const kw = customKeyword.trim() ? `【聚焦攻坚：${customKeyword.trim()}】` : '';

    const lines = [
      `📅 赛博工作日报（${new Date().toLocaleDateString()} · ${s.name}范式）`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `【一、 今日核心产出与赋能】`,
      `  1. ${workLines[0] ?? ''}`,
      `  2. ${workLines[1] ?? ''}`,
      kw ? `  3. ${kw} 深度对齐各方诉求，完成核心颗粒度拉齐与闭环交付。` : `  3. ${workLines[2] ?? ''}`,
      ``,
      `【二、 底层逻辑与打法闭环】`,
      `  • ${logicLine}`,
      `  • 坚持降本增效导向，构建跨周期、可持续的确定性增长抓手。`,
      ``,
      `【三、 明日排期与抓手推进】`,
      `  1. ${planLine}`,
      `  2. 保持多触点敏捷协同，及时沉淀方法论，保障关键里程碑按时交付。`,
      ``,
      `【四、 个人认知沉淀与复盘】`,
      `  ${reflectionLine}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `汇报人：CYBERDECK_NODE_77  |  状态：拉齐颗粒度中`,
    ];

    setReport(lines.join('\n'));

    // Claim daily reward — 冷却未到时只提示，不假装发钱
    claimStipend();
  };

  const copyToClipboard = async () => {
    if (!report) return;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(report);
        ok = true;
      }
    } catch {
      // fallback below
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = report;
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
    if (ok) {
      setCopied(true);
      SoundFX.playLevelUp();
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/95 text-slate-200 font-mono select-none overflow-y-auto p-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="text-xl">📄</div>
          <div>
            <div className="text-xs font-black text-green-400 tracking-wider flex items-center gap-1.5">
              <span>CYBER_DAILY_REPORT</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-950 border border-green-500/40 text-green-300">
                大厂黑话生成器
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              一键拉齐颗粒度 · 每 20 小时首次生成领 {formatCredits(stipend)} 与小红花
            </div>
          </div>
        </div>

        {/* Daily Reward Status / Claim Button */}
        <button
          onClick={claimStipend}
          title={claimReady ? '点击领取本期摸鱼津贴' : `距下次可领还剩 ${hoursToNext.toFixed(1)} 小时`}
          className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all ${
            claimReady
              ? 'bg-gradient-to-r from-amber-950 to-yellow-950 border-yellow-500/60 text-yellow-300 shadow-neon-gold animate-pulse cursor-pointer'
              : 'bg-slate-900 border-slate-700 text-slate-400 cursor-pointer'
          }`}
        >
          <Award size={13} className={claimReady ? 'text-yellow-400' : 'text-slate-500'} />
          <span>
            {claimReady
              ? `领取本期津贴 (+${formatCredits(stipend)} & 🌸)`
              : `津贴冷却中 · 剩 ${hoursToNext.toFixed(1)} 小时`}
          </span>
        </button>
      </div>

      {/* Style Tabs */}
      <div className="flex items-center gap-1.5 py-2 shrink-0 overflow-x-auto no-scrollbar">
        {(Object.keys(STYLES) as RoleStyle[]).map((k) => {
          const cfg = STYLES[k];
          const isAct = style === k;
          return (
            <button
              key={k}
              onClick={() => setStyle(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 border ${
                isAct
                  ? 'bg-green-950/80 border-green-400 text-green-300 shadow-neon-green'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{cfg.icon}</span>
              <span>{cfg.name}</span>
            </button>
          );
        })}
      </div>

      {/* Input / Control Row */}
      <div className="flex flex-wrap items-center gap-2 pb-2 shrink-0">
        <input
          type="text"
          value={customKeyword}
          onChange={(e) => setCustomKeyword(e.target.value)}
          placeholder="输入今日关键词 (例: 重构支付网关 / 敲木鱼积德 / 喝冰美式)..."
          className="flex-1 min-w-[220px] px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 focus:border-green-400 focus:outline-none text-xs text-slate-200 placeholder:text-slate-500 font-mono"
        />

        <button
          onClick={generateReport}
          disabled={busy}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:brightness-110 active:scale-95 disabled:opacity-50 text-white font-black text-xs shadow-neon-green cursor-pointer transition-all shrink-0"
        >
          <Zap size={14} />
          <span>{busy ? '生成中…' : '⚡ 一键拉齐颗粒度'}</span>
        </button>
      </div>

      {/* 文案池真实组合数公示 —— 让玩家知道重复不是 bug 也知道自己多久会看腻 */}
      <div className="text-[9px] text-slate-500 pb-2 shrink-0">
        本次【{STYLES[style].name}】要点无放回抽样：产出 {tpl.work.length} 选 {workNeed}（{combinationsOf(tpl.work.length, workNeed)} 种）
        × 逻辑 {tpl.logic.length} 种 × 排期 {tpl.plan.length} 种 × 复盘 {tpl.reflection.length} 种
        = <span className="text-slate-400 font-bold">{styleCombos}</span> 种不同日报；
        第二/三条固定句与「复盘」段目前每风格只有 1 条，是重复度最高的来源。
      </div>

      {/* Generated Report Display Area */}
      <div className="flex-1 min-h-[220px] flex flex-col bg-slate-900/80 rounded-2xl border border-slate-800 p-3 relative shadow-inner">
        {report ? (
          <>
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80 text-[10px] text-slate-400">
              <span className="font-bold text-green-400 flex items-center gap-1">
                <Check size={12} />
                <span>日报生成完毕，颗粒度已精准拉满！</span>
              </span>
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-600 cursor-pointer transition-colors"
              >
                {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                <span>{copied ? '已复制！' : '复制全文'}</span>
              </button>
            </div>
            <textarea
              readOnly
              value={report}
              className="flex-1 w-full bg-transparent resize-none focus:outline-none text-xs text-slate-200 font-mono leading-relaxed overflow-y-auto"
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-2 text-slate-500 py-8">
            <FileText size={32} className="opacity-40" />
            <div className="text-xs font-bold text-slate-400">点击上方按钮，瞬间生成大厂行话日报</div>
            <div className="text-[10px] text-slate-500 max-w-sm">
              每 20 小时首次生成可获得 {formatCredits(stipend)} 摸鱼津贴，并赠送「年度优秀员工小红花」（市价 {formatCredits(flowerValue)}，回收 {formatCredits(flowerBuyback)}）喂食宠物！
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-800 space-y-0.5 shrink-0">
        <div className="flex items-center justify-between">
          <div>支持一键复制到剪贴板，应付周报日报毫无压力</div>
          <div className="text-green-400">🌸 小红花可瞬间回满宠物全部状态</div>
        </div>
        <div className="flex items-center justify-between text-[9px]">
          <div>
            津贴 {formatCredits(stipend)}{hasWorkSynergy ? '（职场羁绊已 ×2）' : ''} ≈ 赛博磁悬浮跑车 {estateMinutesPerStipend.toFixed(0)} 分钟分红；判据为距上次入账满 20 小时
          </div>
          <div>
            🌸 市价 {formatCredits(flowerValue)} / 交易所回收 {formatCredits(flowerBuyback)}
          </div>
        </div>
      </div>
    </div>
  );
};
