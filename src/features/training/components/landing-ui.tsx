/**
 * 落地页通用 UI（标题装饰）
 * Landing page shared UI (decorated section title)
 *
 * @module features/training/components/landing-ui
 * @description 设计图 1:1 还原的通用视觉元素：居中标题两侧的「线+圆点」装饰。
 *              色值常量已提取至 @/shared/constants/colors，此处仅保留 re-export 兼容。
 */

// 色值常量已提取至 shared 层，此处 re-export 保持向后兼容
export { NAVY, GREEN, GREEN_HOVER, GREEN_DEEP, INK, BG_LIGHT, BORDER } from "@/shared/constants/colors";

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
