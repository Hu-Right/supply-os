/**
 * 落地页通用 UI（配色常量 + 标题装饰）
 * Landing page shared UI (palette + decorated section title)
 *
 * @module features/training/components/landing-ui
 * @description 设计图 1:1 还原的通用视觉元素：深藏青主色、品牌绿、
 *              居中标题两侧的「线+圆点」装饰。
 */

/** 主藏青色（Hero/深色区背景） Main navy — 设计图采样 #022049 */
export const NAVY = "#022049";
/** 品牌绿（按钮/强调） Brand green — 设计图采样 #0CAF8C */
export const GREEN = "#0CAF8C";
/** 品牌绿 hover */
export const GREEN_HOVER = "#0A9B7C";
/** 深绿（价格/强调文字） Deep green — 采样 #069E78 */
export const GREEN_DEEP = "#069E78";
/** 墨蓝（图形/标题） Ink navy — 采样 #0A2A55 */
export const INK = "#0A2A55";
/** 浅色区背景 Light bg — 统一柔和浅蓝灰 #F5F8FB */
export const BG_LIGHT = "#F5F8FB";
/** 卡片描边 Border — 柔和描边 #E5EBF3 */
export const BORDER = "#E5EBF3";

/** 标题侧边装饰（左：线+点+点；右：点+点+线） */
function Deco({ flip = false }: { flip?: boolean }) {
  return (
    <span className={`hidden sm:flex items-center gap-1.5 ${flip ? "flex-row-reverse" : ""}`} aria-hidden>
      <span className="h-0.5 w-10 rounded-full bg-[#0AA09B]/70" />
      <span className="w-1.5 h-1.5 rounded-full bg-[#0AA09B]" />
      <span className="w-2 h-2 rounded-full bg-[#0AA09B]" />
    </span>
  );
}

/** 居中标题（含装饰线与可选副标题） Centered decorated section title */
export function SectionTitle({ title, sub, light = false }: { title: string; sub?: string; light?: boolean }) {
  return (
    <div className="text-center mb-10">
      <div className="flex items-center justify-center gap-4">
        <Deco />
        <h2 className={`text-2xl md:text-3xl font-black tracking-wide ${light ? "text-white" : "text-[#0A2A55]"}`}>
          {title}
        </h2>
        <Deco flip />
      </div>
      {sub && (
        <p className={`mt-4 text-sm md:text-base ${light ? "text-slate-300" : "text-slate-600"}`}>{sub}</p>
      )}
    </div>
  );
}
