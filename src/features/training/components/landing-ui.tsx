/**
 * 落地页通用 UI（Apple 风格 — 柔和中性色调 + 充足留白）
 * Landing page shared UI (Apple-inspired palette + generous whitespace)
 *
 * @module features/training/components/landing-ui
 * @description 柔和浅灰主色、藏青色仅点缀、
 *              居中标题两侧的「线+圆点」装饰。
 */

/** 主藏青色（仅点缀色） Main navy — accent only */
export const NAVY = "#0A2A55";
/** 品牌绿（按钮/强调） Brand green */
export const GREEN = "#0CAF8C";
/** 品牌绿 hover */
export const GREEN_HOVER = "#0A9B7C";
/** 深绿（价格/强调文字） Deep green */
export const GREEN_DEEP = "#069E78";
/** 墨蓝（图形/标题） Ink navy */
export const INK = "#1a1a2e";
/** 浅色区背景 Light bg — 极浅灰 #FAFBFC */
export const BG_LIGHT = "#FAFBFC";
/** 卡片描边 Border — 极柔和 #F0F0F0 */
export const BORDER = "#F0F0F0";

/** 标题侧边装饰（左：线+点+点；右：点+点+线）— 柔和灰色 */
function Deco({ flip = false }: { flip?: boolean }) {
  return (
    <span className={`hidden sm:flex items-center gap-1.5 ${flip ? "flex-row-reverse" : ""}`} aria-hidden>
      <span className="h-px w-12 rounded-full bg-slate-300/60" />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400/50" />
      <span className="w-2 h-2 rounded-full bg-slate-300/40" />
    </span>
  );
}

/** 居中标题（含装饰线与可选副标题）— Apple 风格大字号 + 充足留白 */
export function SectionTitle({ title, sub, light = false }: { title: string; sub?: string; light?: boolean }) {
  return (
    <div className="text-center mb-14">
      <div className="flex items-center justify-center gap-4">
        <Deco />
        <h2 className={`text-3xl md:text-4xl font-extrabold tracking-tight ${light ? "text-white" : "text-slate-900"}`}>
          {title}
        </h2>
        <Deco flip />
      </div>
      {sub && (
        <p className={`mt-5 text-base md:text-lg font-normal ${light ? "text-slate-300" : "text-slate-500"} max-w-2xl mx-auto leading-relaxed`}>{sub}</p>
      )}
    </div>
  );
}
