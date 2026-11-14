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
    case "buyer.need_info":
      return { title: t("notifTBuyerNeedInfo"), body: t("notifBBuyerNeedInfo") };
    case "buyer.restricted":
      return { title: t("notifTBuyerRestricted"), body: t("notifBBuyerRestricted") };
    default:
      // 未知类型：原样显示后端兜底快照，至少不让用户面对一条空白通知
      return { title: n.title || n.type, body: n.body };
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
