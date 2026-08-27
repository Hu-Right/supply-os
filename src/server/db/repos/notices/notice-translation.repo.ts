/**
 * 公告翻译数据访问层
 * Notice Translation Repository
 *
 * @module server/repos/notices/notice-translation.repo
 * @description 操作 crm_notice_translations 表。
 */
import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";

export class NoticeTranslationRepo {
  constructor(private pool: Pool) {}

  /** 公告译文缓存（无缓存返回 null；description_tr 可能为 null） */
  async findTranslationCache(noticeId: number, lang: string): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT title_tr, description_tr FROM crm_notice_translations WHERE notice_id = ? AND lang = ? LIMIT 1",
      [noticeId, lang],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 仅更新译文描述（机会表覆盖重翻 / 描述补翻） */
  async updateTranslationDescription(noticeId: number, lang: string, descriptionTr: string, model: string): Promise<void> {
    await this.pool.query(
      `UPDATE crm_notice_translations SET description_tr = ?, model = ? WHERE notice_id = ? AND lang = ?`,
      [descriptionTr, model, noticeId, lang],
    );
  }

  /** 公告译文缓存 upsert（descriptionTr 传 null 时仅缓存标题） */
  async upsertTranslation(
    noticeId: number,
    lang: string,
    titleTr: string,
    descriptionTr: string | null,
    model: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO crm_notice_translations (notice_id, lang, title_tr, description_tr, model)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title_tr = VALUES(title_tr), description_tr = VALUES(description_tr), model = VALUES(model)`,
      [noticeId, lang, titleTr, descriptionTr, model],
    );
  }

  /** 指定语言译文是否已存在（英文中枢兜底前置检查） */
  async hasTranslation(noticeId: number, lang: string): Promise<boolean> {
    const [rows] = await this.pool.query(
      "SELECT id FROM crm_notice_translations WHERE notice_id = ? AND lang = ? LIMIT 1",
      [noticeId, lang],
    );
    return (rows as RowDataPacket[]).length > 0;
  }

  /** 英文中枢兜底 upsert（已有字段不被 null 覆盖） */
  async upsertEnPivotTranslation(
    noticeId: number,
    titleTr: string | null,
    descriptionTr: string | null,
    model: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO crm_notice_translations (notice_id, lang, title_tr, description_tr, model)
       VALUES (?, 'en', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title_tr = COALESCE(VALUES(title_tr), title_tr),
         description_tr = COALESCE(VALUES(description_tr), description_tr)`,
      [noticeId, titleTr, descriptionTr, model],
    );
  }
}
