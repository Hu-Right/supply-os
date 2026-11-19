/**
 * 中文公告分享卡（OG image，1200×630）
 *
 * 首次被社交平台抓取时按需渲染，之后按 revalidate 缓存；不为全量公告预生成。
 * 数据只读 notice_public 公开字段；摘要优先 share_summary，空则现场回退。
 */
import { OG_SIZE, renderNoticeShareCard, renderOgFallback } from "@/lib/services/seo/notice-og";
import { loadNoticeShareCard } from "@/lib/services/seo/notice-og-data";

export const alt = "云境 · 国际采购平台 — 全球政府采购情报";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 86400;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const noticePk = /^\d+$/.test(id) ? Number(id) : 0;
  const card = noticePk > 0 ? await loadNoticeShareCard(noticePk, "zh") : null;
  return card ? renderNoticeShareCard(card, "zh") : renderOgFallback("zh");
}
