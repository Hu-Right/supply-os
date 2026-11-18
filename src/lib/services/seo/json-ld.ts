/**
 * JSON-LD 安全序列化 + 站点实体
 * Safe JSON-LD serialization for <script type="application/ld+json">
 *
 * @module lib/services/seo/json-ld
 * @description 结构化数据里的字段大量来自采集数据（公告标题/描述等），
 *              直接 JSON.stringify 不转义 "<"：`</script>` 会闭合标签并执行任意 JS。
 *              全站唯一出口，禁止各页面自行 JSON.stringify。
 */
import { absoluteUrl } from "./site";

/** 序列化为可安全内联进 <script> 的 JSON 字符串 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** 站点实体（多处 JSON-LD 的 provider/publisher 共用，避免名字与 URL 各写一份） */
export const SITE_ENTITY = {
  "@type": "Organization" as const,
  name: "云境·国际采购平台",
  url: absoluteUrl(""),
};
