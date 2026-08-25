/**
 * 全局事件总线（类型安全封装 window CustomEvent）
 * Typed global event bus wrapping window CustomEvent
 *
 * @module core/events
 * @description 集中声明全部 `supply-os:*` 事件及其载荷类型。
 *              事件名保持既有字符串不变，与旧代码/测试完全互操作。
 *              Single registry of all `supply-os:*` events and payload types.
 */

/** 支付事件载荷（App.tsx PaymentModal 打开参数） */
export interface PayEventDetail {
  code: string;
  name: string;
  price: number;
  currency: string;
  noticeId?: number | null;
  returnUrl?: string;
  /** 订单类型：'new'（新购，默认）/ 'upgrade'（升级补差） */
  orderType?: "new" | "upgrade";
  /** 升级时的当前套餐 code（服务端校验用） */
  originalPlanCode?: string;
}

/** 事件名 → 载荷类型映射；void 表示无载荷 */
export interface AppEventMap {
  "supply-os:require-login": void;
  "supply-os:unauthorized": { endpoint: string };
  "supply-os:require-vip": void;
  "supply-os:open-account": void;
  "supply-os:consult": void;
  "supply-os:pay": PayEventDetail;
  "supply-os:notice-paid": { noticeId: number };
  "supply-os:crm-refresh": void;
  "supply-os:industry-prefs-updated": void;
  "supply-os:open-supplier-register": void;
  "supply-os:open-showroom-register": void;
}

export type AppEventName = keyof AppEventMap;

/** 派发全局事件 Emit a global app event */
export function emitAppEvent<K extends AppEventName>(
  name: K,
  ...detail: AppEventMap[K] extends void ? [] : [AppEventMap[K]]
): void {
  window.dispatchEvent(new CustomEvent(name, { detail: detail[0] }));
}

/** 订阅全局事件，返回解绑函数 Subscribe; returns an unsubscribe function */
export function onAppEvent<K extends AppEventName>(
  name: K,
  handler: (detail: AppEventMap[K]) => void,
): () => void {
  const listener = (e: Event) => handler((e as CustomEvent).detail as AppEventMap[K]);
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}
