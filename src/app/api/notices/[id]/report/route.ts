/**
 * GET /api/notices/:id/report — 报告下载（docx 流式）
 *
 * @module app/api/notices/[id]/report/route
 * @description /report/preview 端点已拆分到 report/preview/route.ts。
 */
import { createHash } from "crypto";
import { promises as fs } from "fs";
import nodePath from "path";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { findQualifiedOpportunityForNotice } from "@/lib/services/notices/featured";
import { findPublicDetail } from "@/lib/services/notice-public/read";
import { BID_FEASIBILITY_REPORT_BENEFIT } from "@/lib/services/benefit-matrix";
import { loadPlatformAliasSnapshot } from "@/lib/services/platform/alias-store";
import { platformInfo } from "@/lib/services/platform/resolve";
import { resolveNoticeAccess } from "@/lib/services/notice-access";
import {
  buildBidReportDocx,
  mergeBidReportRow,
  bidReportFileName,
} from "@/lib/services/bid-report";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const reportCacheDir = () => nodePath.join(process.cwd(), "runtime", "bid_reports");

import {
  EC_NOTICE_NOT_FOUND_404, EC_ACCESS_FORBIDDEN, EC_REPORT_NOT_AVAILABLE,
} from "@/shared/constants/api";

export const GET = withRoute<{ params: Promise<{ id: string }> }>(
  async (req, { params }) => {
    const auth = await requireUserKeyOrThrow(req);

    const { id } = await params;
    const noticeId = Number(id);
    const userId = auth.userId;

    if (!noticeId) {
      routeError(400, EC_NOTICE_NOT_FOUND_404, "请先登录并指定公告");
    }

    const ctx = getContext();
    const { unlockRepo } = ctx.notice;
    const opportunitiesRepo = ctx.opportunitiesRepo;

    const access = await resolveNoticeAccess({
      userId,
      noticeId,
      unlockRepo,
      benefitRepo: ctx.benefitSystemRepo,
    });
    if (!access.unlock && !access.accessibleByPlan) {
      routeError(403, EC_ACCESS_FORBIDDEN, "公告已锁定，请先解锁", { core_locked: true });
    }

    // 投标可行性报告属企业级工具（2026-10-29）：企业/人工档可下载；个人档引导升级企业版
    if (!(await ctx.benefitSystemRepo.isEntitled(userId, BID_FEASIBILITY_REPORT_BENEFIT))) {
      routeError(403, EC_ACCESS_FORBIDDEN, "中文拆解报告为企业版权益", { feature: BID_FEASIBILITY_REPORT_BENEFIT });
    }

    const service = await findPublicDetail(ctx.dbPool, noticeId);
    if (!service) routeError(404, EC_NOTICE_NOT_FOUND_404, "公告不存在");
    // 报告公共字段一律取服务表；商机只补标题/中文正文/拆单内容。
    const notice = {
      id: service.notice_pk,
      notice_id: service.notice_id,
      reference: service.reference,
      title: service.title,
      notice_type: service.notice_type_code,
      registration_level: service.registration_level,
      agency: service.buyer_name,
      agency_full: service.buyer_name_cn || service.buyer_name,
      country: service.country_code,
      published_date: service.published_ts
        ? new Date(Number(service.published_ts) * 1000).toISOString().slice(0, 10)
        : "",
      deadline: service.deadline_ts
        ? new Date(Number(service.deadline_ts) * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC"
        : "",
      deadline_timezone: service.deadline_timezone,
      estimated_value: service.estimated_value == null
        ? ""
        : `${service.estimated_value} ${service.currency_code || ""}`.trim(),
      industry: service.industry,
      description: service.description,
      description_cn: service.description_cn,
      source_url: service.source_url,
      source_platform: service.platform_name,
      beneficiary_countries: service.beneficiary_countries,
      documents: service.attachments,
      external_links: service.external_links,
      contacts: service.contacts,
    };

    const qualified = await findQualifiedOpportunityForNotice(ctx.dbPool, {
      id: service.notice_pk,
      notice_id: service.notice_id,
    });
    if (!qualified) routeError(404, EC_REPORT_NOT_AVAILABLE, "报告不可用");

    const fullOpportunity = await opportunitiesRepo.findFullById(Number(qualified.id));
    const opportunity = fullOpportunity || qualified;

    const row = mergeBidReportRow(notice, opportunity);
    // 平台展示名改由 platform_aliases 表驱动（唯一入口）：解析 url/码后注入 row.platform_display
    const platformSnap = await loadPlatformAliasSnapshot(ctx.dbPool);
    row.platform_display = platformInfo(String(row.source_url || row.source_platform || ""), platformSnap)?.canonical ?? "";
    const fileName = bidReportFileName(row);

    const fingerprint = createHash("md5")
      .update(`${opportunity.id}|${String(opportunity.update_time || "")}`)
      .digest("hex")
      .slice(0, 12);
    const cacheDir = reportCacheDir();
    const cachePath = nodePath.join(cacheDir, `bid_report_${noticeId}_${opportunity.id}_${fingerprint}.docx`);

    let buffer: Buffer | null = null;
    try {
      buffer = await fs.readFile(cachePath);
    } catch {
      // 缓存未命中：生成
    }
    if (!buffer) {
      buffer = await buildBidReportDocx(row);
      try {
        await fs.mkdir(cacheDir, { recursive: true });
        const stale = (await fs.readdir(cacheDir)).filter(
          (f) => f.startsWith(`bid_report_${noticeId}_`) && f !== nodePath.basename(cachePath),
        );
        await Promise.all(stale.map((f) => fs.unlink(nodePath.join(cacheDir, f)).catch(() => undefined)));
        await fs.writeFile(cachePath, buffer);
      } catch {
        // 缓存写失败不影响下载
      }
    }

    const asciiName = `bid_report_${noticeId}.docx`;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": DOCX_MIME,
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": String(buffer.length),
      },
    });
  },
);
