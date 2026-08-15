/**
 * 按需补翻触发器
 * Back-translation Trigger
 *
 * @module server/services/notice-search/translation-trigger
 * @description 搜索结果中缺失当前 locale 翻译的公告，异步触发补翻。
 *              与搜索逻辑解耦，未来可替换为事件驱动。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { NoticesRepo } from "../../repos/notices.repo";
import { getTranslatedNoticeDetail } from "../translation/notice";

/**
 * 异步触发缺失翻译的补翻（不阻塞当前响应）
 * @param rows 搜索结果行
 * @param locale 当前语言环境
 * @param noticesRepo 公告仓库
 * @param pool 数据库连接池
 * @param maxItems 最多触发补翻的数量（默认 9）
 */
export function triggerBackTranslation(
  rows: RowDataPacket[],
  locale: string,
  noticesRepo: NoticesRepo,
  pool: Pool,
  maxItems = 9,
): void {
  const missingRows = rows.filter((row) => !row.title_i18n);
  const toTranslate = missingRows.slice(0, maxItems);
  if (toTranslate.length === 0) return;

  void Promise.all(
    toTranslate.map(async (row) => {
      try {
        const tr = await getTranslatedNoticeDetail(Number(row.id), locale, noticesRepo, pool);
        row.title_i18n = tr.title || null;
        row.description_i18n = tr.description || null;
      } catch { /* 翻译失败不影响列表主体 */ }
    }),
  );
}
