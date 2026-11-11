/**
 * 统计数据带 — 一主两次的实时规模指标
 * Stat Strip — one headline metric + two subordinate quality metrics
 *
 * @module features/supplier/pages/SupplierPage/StatsWall
 * @description 2026-11-11 由「三个等分卡片」改成「单行数据带」。换形态的三个理由：
 *              1) 等分卡片把 93,487 和 29 摆成对等关系，读者抓不到主次；小数字
 *                 填在大卡片里还显出「这库没人」的空洞感。
 *              2) `[实时数]` 被重复三遍当装饰，而底层其实是 10 分钟一轮的轮询，
 *                 叫「实时」名不副实——现在收敛成右侧一个真实的「更新于 HH:mm」。
 *              3) 供应商页的主任务是筛和看结果，统计不该独占一整行首屏。
 *
 *              数字不再拼 "+"：searchable / verified / commodityMatched 都是
 *              COUNT(*) 的精确值，加号只会让人怀疑到底多少，削弱可信度。
 *
 *              文案口径：三个 label 都是「跟在数字后面的名词/形容词短语」，
 *              所以各 locale 的值要按后缀语序写（zh 主指标带量词「家」），
 *              不能写成独立标题。
 */
import { Fragment } from "react";
import { ShieldCheck } from "lucide-react";
import { formatPlainNumber } from "@/shared/utils/format";

interface SubStat {
  /** 计数值（精确值，展示层不加近似符号） */
  value: number;
  /** 数字后的说明短语 */
  label: string;
  icon: typeof ShieldCheck;
}

interface StatsWallProps {
  /** 主指标：库内可检索供应商总数 */
  total: number;
  /** 主指标说明短语 */
  totalLabel: string;
  /** 次级指标：品质与覆盖维度，字号低于主指标 */
  subs: SubStat[];
  /** 「更新于 14:32」整串文案；取数失败时为 null，此时整段不渲染 */
  updatedText: string | null;
}

export function StatsWall({ total, totalLabel, subs, updatedText }: StatsWallProps) {
  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-2.5 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-xs">
      {/* 主指标：全条唯一的大字号焦点 */}
      <p className="flex items-baseline gap-1.5">
        {/* dir="ltr" 锁数字方向：RTL 下「93,487」会被双向算法排成「487,93」 */}
        <span dir="ltr" className="text-2xl md:text-3xl font-extrabold text-slate-900 tabular-nums">
          {formatPlainNumber(total)}
        </span>
        <span className="text-xs font-bold text-slate-500">{totalLabel}</span>
      </p>

      {subs.map((s) => (
        <Fragment key={s.label}>
          <span className="hidden sm:block h-5 w-px bg-slate-200" aria-hidden="true" />
          <p className="flex items-center gap-1.5">
            <s.icon className="h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden="true" />
            <span dir="ltr" className="text-base font-extrabold text-slate-800 tabular-nums">
              {formatPlainNumber(s.value)}
            </span>
            <span className="text-2xs text-slate-500">{s.label}</span>
          </p>
        </Fragment>
      ))}

      {updatedText && <p className="ms-auto text-2xs text-slate-400">{updatedText}</p>}
    </section>
  );
}
