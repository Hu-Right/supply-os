/**
 * 公告访问判定（行业墙 + 套餐档位）
 *
 * 2026-09-29 起访问是**两层且关系**：
 *  ① 行业墙：行业限定档（industry_scoped）只能访问绑定 L1 大类内的公告 —— canAccessNotice；
 *  ② 套餐：notice_view 权益格已包含（非免费档）。
 * 2026-11-27 单条解锁/次数体系下线：notice_access_grants 存根与 notice_view 配额消耗
 * 已退役，本判定不再读取解锁记录 —— 免费档（free/无订阅）一律锁定。
 *
 * 内容类接口（译文/AI 产物/报告等）必须走 assertNoticeContentAccess，
 * 不要各自手写判定 —— 历史上只抄了②、漏抄①，造成行业墙可被旁路。
 */
import type { BenefitSystemRepo } from "../repos/benefit-system.repo";
import { NOTICE_VIEW_BENEFIT } from "./benefit-matrix";

import type { Pool } from "mysql2/promise";
import { canAccessNotice } from "./industry-scope";
import { routeError } from "../middleware/route-handler";
import { EC_CONTENT_LOCKED, EC_OUT_OF_CATEGORY, EC_VIP_ONLY } from "@/shared/constants/api";

export interface NoticeContentAccessParams {
  dbPool: Pool;
  benefitRepo: BenefitSystemRepo;
  userId: number;
  noticeId: number;
  /** 可选内容权益码（如 notice_translation / ai_match）；不传只做行业墙 + 套餐 */
  benefit?: string;
  /** 权益不满足时的提示（缺省按通用文案） */
  benefitMessage?: string;
}

/**
 * 内容类接口的统一访问闸口（详情/正文/译文/AI 产物/报告等）。
 *
 * 判定顺序与 /detail 保持一致：先行业墙（403 outOfCategory）→ 再锁定（403 coreLocked）
 * → 最后内容权益（403 feature）。任何返回公告内容（含译文）的接口都必须先过这里，
 * 否则行业限定档用户能拿订阅行业外的公告 ID 旁路行业墙。
 */
export async function assertNoticeContentAccess(params: NoticeContentAccessParams): Promise<void> {
  const { dbPool, benefitRepo, userId, noticeId } = params;
  const allowedByIndustry = await canAccessNotice(dbPool, benefitRepo, userId, noticeId);
  if (!allowedByIndustry) {
    routeError(403, EC_OUT_OF_CATEGORY, "该公告不在您订阅的行业范围内", { outOfCategory: true });
  }
  const access = await resolveNoticeAccess({ userId, benefitRepo });
  if (!access.accessibleByPlan) {
    routeError(403, EC_CONTENT_LOCKED, "公告已锁定，请先解锁", { coreLocked: true });
  }
  if (params.benefit && !(await benefitRepo.isEntitled(userId, params.benefit))) {
    routeError(403, EC_VIP_ONLY, params.benefitMessage || "当前套餐不包含该内容", { feature: params.benefit });
  }
}

export interface NoticeAccess {
  /** 套餐本身已包含公告查看（notice_view 权益格放行，非免费档） */
  accessibleByPlan: boolean;
}

export async function resolveNoticeAccess(params: {
  userId: number;
  benefitRepo: BenefitSystemRepo;
}): Promise<NoticeAccess> {
  const { userId, benefitRepo } = params;
  const plan = await benefitRepo.findActivePlanForUser(userId);
  if (!plan || plan.plan_code === "free") return { accessibleByPlan: false };

  const entitled = await benefitRepo.isEntitled(userId, NOTICE_VIEW_BENEFIT);
  return { accessibleByPlan: entitled };
}
