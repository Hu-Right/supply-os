/**
 * 弹窗背景滚动锁 Hook
 * Body Scroll Lock Hook
 *
 * @module shared/ui/useScrollLock
 * @description 弹窗打开期间锁定 body 滚动，卸载/关闭时恢复。
 *              模块级引用计数支持多弹窗叠加（全部关闭才解锁）；
 *              锁定时按滚动条宽度补偿 padding，避免页面内容左右跳动
 *              （RTL 下 Chrome 等浏览器滚动条在左侧，按 html.dir 选择补偿方向）。
 *              Locks body scroll while a modal is open and restores it on close.
 *              Module-level ref count supports stacked modals; compensates
 *              scrollbar width to prevent layout shift (side-aware for RTL).
 */

import { useEffect } from "react";

let lockCount = 0;
let savedOverflow = "";
let savedPadding = "";
let savedPaddingSide: "paddingRight" | "paddingLeft" = "paddingRight";

/**
 * 锁定页面背景滚动
 * Lock page background scroll
 *
 * @param active 是否激活锁定（默认 true；受控弹窗可传 open 状态）
 */
export function useScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      // RTL 文档下多数浏览器将垂直滚动条置于左侧，补偿到对应一侧
      savedPaddingSide =
        document.documentElement.dir === "rtl" ? "paddingLeft" : "paddingRight";
      savedOverflow = document.body.style.overflow;
      savedPadding = document.body.style[savedPaddingSide];
      document.body.style.overflow = "hidden";
      if (scrollbarWidth > 0) {
        document.body.style[savedPaddingSide] = `${scrollbarWidth}px`;
      }
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow;
        document.body.style[savedPaddingSide] = savedPadding;
      }
    };
  }, [active]);
}
