/**
 * 剪贴板复制（自 NoticeDetail/ShareModal.tsx 上收，行为逐字不变）。
 *
 * 跨组件可复用的浏览器纯工具：安全上下文（HTTPS/localhost）优先用异步 Clipboard API；
 * 否则（如局域网 http://192.168.x.x）navigator.clipboard 不可用，回退到
 * document.execCommand("copy")。兜底优先选中弹窗内已渲染的元素（el）——
 * Radix Dialog 有焦点陷阱，挂到 document.body 的临时节点会被抢焦点导致选中失效。
 * 返回是否成功。
 *
 * @module shared/utils/clipboard
 */
export async function copyToClipboard(text: string, el?: HTMLInputElement | null): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* Clipboard API 被拒（权限/失焦等），继续走 execCommand 兜底 */
    }
  }
  try {
    if (el) {
      el.focus();
      el.select();
      if (document.execCommand("copy")) return true;
    }
    // 末位兜底：无可用弹窗内元素时临时挂一个 textarea
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
