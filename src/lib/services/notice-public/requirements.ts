/**
 * 公告结构化资格要求读取（详情页口径）
 *
 * @module lib/services/notice-public/requirements
 * @description 读 `notice_requirement_items` 最新一版，映射成对外视图（camelCase）。
 *              与 `notice_public.eligibility/supplier_conditions/technical_hurdles` 三列是
 *              两套口径：三列＝源站原话；本函数＝抽出来"要满足什么"，供资格条件清单渲染。
 *              失败/未抽取一律返回空数组——详情主体不因抽取表未就绪而失败。
 */
import type { Pool } from "mysql2/promise";
import { FeasibilityReportRepo } from "../../repos/feasibility-report.repo";

/** 对外视图：一条资格要求 */
export interface NoticeRequirementView {
  /** 同版本内稳定序号 */
  seq: number;
  /** certification/experience/financial/personnel/localization/registration/technical/
   *  commercial/delivery/submission/bond/language/warranty/other */
  type: string;
  /** mandatory=废标项·scored=评分项·preferred=加分项 */
  importance: string;
  /** 业务可读标题 */
  title: string;
  /** 公告原文片段（证据锚点；与标题相同或为空时不下发） */
  rawText?: string;
  /** 抽取置信度 0~1；未知为 null */
  confidence: number | null;
}

/**
 * 读取一条公告最新版本的结构化要求项。
 * @param pool MySQL 连接池
 * @param noticePk 公告业务主键（= notice_public.notice_pk）
 */
export async function loadNoticeRequirements(pool: Pool, noticePk: number): Promise<NoticeRequirementView[]> {
  try {
    const repo = new FeasibilityReportRepo(pool);
    const { rows } = await repo.getLatestRequirements(noticePk);
    const views: NoticeRequirementView[] = [];
    for (const row of rows) {
      const title = String(row.title ?? "").trim();
      if (!title) continue;
      const seq = Number(row.seq);
      const raw = typeof row.raw_text === "string" ? row.raw_text.trim() : "";
      const confidence = row.confidence == null ? null : Number(row.confidence);
      views.push({
        seq: Number.isFinite(seq) ? seq : views.length + 1,
        type: String(row.requirement_type ?? ""),
        importance: String(row.importance ?? ""),
        title,
        ...(raw && raw !== title ? { rawText: raw } : {}),
        confidence: confidence != null && Number.isFinite(confidence) ? confidence : null,
      });
    }
    return views;
  } catch {
    // 表缺失/查询失败：按"未抽取"处理，不让详情页 500
    return [];
  }
}
