/**
 * 通知时间格式化（三种来源形状都要吃）
 *
 * @module shared/notifications/formatNotificationTime
 * @description mysql2 不开 `dateStrings` 时，DATETIME 列 `String()` 后是 JS `Date.toString()`
 *              （`Sat Nov 14 2026 23:03:48 GMT+0800 (中国标准时间)`）；开 `dateStrings` 或走 JSON
 *              串时又是 `YYYY-MM-DD HH:mm:ss` / ISO。三种都得能解析——否则页面上会直接裸奔
 *              一长串英文时间（2026-11 实机验证时撞到过）。
 */

/** 统一输出本地 `YYYY-MM-DD HH:mm`；无法解析时原样返回，便于排查而不是显示 Invalid Date */
export function formatNotificationTime(v: string): string {
  if (!v) return "";
  let d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    // "YYYY-MM-DD HH:mm:ss"（空格分隔，部分浏览器不接受）→ 换成 T 再试
    d = new Date(v.replace(" ", "T"));
  }
  if (Number.isNaN(d.getTime())) return v;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
