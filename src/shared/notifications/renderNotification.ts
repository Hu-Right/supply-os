/**
 * 站内通知文案渲染（type + payload → 多语言标题/正文）
 *
 * @module shared/notifications/renderNotification
 * @description 通知的标题/正文不在后端拼中文：后端只存稳定 `type` 与参数 `payload`，
 *              前端按 type 用 `t()` 渲染，7 语言才站得住（否则一处后端文案毁掉整套 i18n）。
 *              `title`/`body` 仅作兜底：类型未知（历史数据或未来新增类型未配文案）时原样显示。
 *
 *              新增通知类型时必须同时：① 在 lib 侧写入 type/payload；② 这里登记 titleKey/bodyKey；
 *              ③ 补 7 语言词条（`notifT*` / `notifB*`）。
 */

export interface NotificationLike {
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown> | null;
}

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface Rendered {
  title: string;
  body: string;
}

/** payload 取值：统一转成字符串/数字，缺失给空串（`t()` 的 {x} 占位不能是 undefined） */
function p(n: NotificationLike, key: string): string {
  const v = n.payload?.[key];
  if (v == null) return "";
  return String(v);
}

export function renderNotification(t: TFn, n: NotificationLike): Rendered {
  switch (n.type) {
    case "procurement.published": {
      const reference = p(n, "reference");
      const tenderNo = p(n, "tenderNo");
      return {
        title: t("notifTProcurementPublished"),
        body: tenderNo
          ? t("notifBProcurementPublished", { reference, tenderNo })
          : t("notifBProcurementPublishedNoTender", { reference }),
      };
    }
    case "procurement.need_info":
      return {
        title: t("notifTProcurementNeedInfo"),
        body: t("notifBProcurementNeedInfo", { reference: p(n, "reference") }),
      };
    case "procurement.expired":
      return {
        title: t("notifTProcurementExpired"),
        body: t("notifBProcurementExpired", { reference: p(n, "reference") }),
      };
    case "procurement.matched":
      return {
        title: t("notifTProcurementMatched"),
        body: t("notifBProcurementMatched", { reference: p(n, "reference"), count: p(n, "count") }),
      };
    case "buyer.verified":
      return { title: t("notifTBuyerVerified"), body: t("notifBBuyerVerified") };
    case "buyer.need_info": {
      // 认证页已不再展示核验历史：意见只能从这里看到，缺了用户就真不知道要补什么
      const note = p(n, "note");
      return {
        title: t("notifTBuyerNeedInfo"),
        body: note ? `${t("notifBBuyerNeedInfo")} ${t("notifBBuyerOpinion", { note })}` : t("notifBBuyerNeedInfo"),
      };
    }
    case "buyer.restricted": {
      const note = p(n, "note");
      return {
        title: t("notifTBuyerRestricted"),
        body: note ? `${t("notifBBuyerRestricted")} ${t("notifBBuyerOpinion", { note })}` : t("notifBBuyerRestricted"),
      };
    }
    // ── 后台审核类（2026-11 统一收口）────────────────────────────────────────
    case "procurement.authorization_verified":
      return {
        title: t("notifTAuthorizationVerified"),
        body: t("notifBAuthorizationVerified", { reference: p(n, "reference") }),
      };
    case "procurement.authorization_rejected":
      return {
        title: t("notifTAuthorizationRejected"),
        body: t("notifBAuthorizationRejected", {
          reference: p(n, "reference"),
          reason: p(n, "reason") || t("notifNoReason"),
        }),
      };
    case "procurement.auto_review": {
      const failed = Array.isArray(n.payload?.failed) ? (n.payload?.failed as unknown[]).map(String) : [];
      const items = failed.map((code) => autoCheckLabel(t, code)).join(t("notifListSeparator"));
      return {
        title: t("notifTAutoReview"),
        body: t("notifBAutoReview", {
          reference: p(n, "reference"),
          count: failed.length || Number(p(n, "count") || 0),
          items: items || t("notifNoDetail"),
        }),
      };
    }
    default:
      // 未知类型：原样显示后端兜底快照，至少不让用户面对一条空白通知
      return { title: n.title || n.type, body: n.body };
  }
}

/** 自动初审失败项代码 → 多语言标签（只认机判的 4 项，其余留人工不算"待确认"） */
function autoCheckLabel(t: TFn, code: string): string {
  switch (code) {
    case "completeness":
      return t("notifAutoCheckCompleteness");
    case "timing_sanity":
      return t("notifAutoCheckTiming");
    case "compliance":
      return t("notifAutoCheckCompliance");
    case "duplication":
      return t("notifAutoCheckDuplication");
    default:
      return code;
  }
}


/** 通知分类（列表页筛选）：采购需求 / 账户与认证 / 其他 */
export type NotificationGroup = "procurement" | "account" | "other";

export function groupOf(type: string): NotificationGroup {
  if (type.startsWith("procurement.")) return "procurement";
  if (type.startsWith("buyer.")) return "account";
  return "other";
}

/** 分组 → 类型前缀（用于服务端 `type_prefix` 过滤） */
export function prefixOfGroup(g: NotificationGroup): string | null {
  if (g === "procurement") return "procurement.";
  if (g === "account") return "buyer.";
  return null;
}
