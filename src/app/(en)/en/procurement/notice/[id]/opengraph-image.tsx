/**
 * English notice share card (OG image, 1200×630)
 *
 * Rendered on demand when a social crawler first fetches the page, then cached by
 * revalidate — never pre-generated for the whole notice corpus.
 */
import { OG_SIZE, renderNoticeShareCard, renderOgFallback } from "@/lib/services/seo/notice-og";
import { loadNoticeShareCard } from "@/lib/services/seo/notice-og-data";

export const alt = "Yunjing · International Procurement Platform — global procurement intelligence";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 86400;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const noticePk = /^\d+$/.test(id) ? Number(id) : 0;
  const card = noticePk > 0 ? await loadNoticeShareCard(noticePk, "en").catch(() => null) : null;
  return card ? renderNoticeShareCard(card, "en") : renderOgFallback("en");
}
