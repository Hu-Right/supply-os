import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Crown,
  ExternalLink,
  Heart,
  Lock,
  Search,
  SlidersHorizontal,
  WalletCards,
  X
} from "lucide-react";

type Lang = "zh" | "en";

type UnspscOption = {
  id: number;
  code: string;
  title_zh?: string;
  title_en?: string;
  title?: string;
  name?: string;
};

type NoticeItem = {
  id: number;
  notice_id?: string;
  reference?: string;
  title: string;
  notice_type?: string;
  agency?: string;
  organization?: string;
  country?: string;
  deadline?: string;
  estimated_value?: string;
  description?: string;
  source_url?: string;
  url?: string;
  contacts?: Array<{ name?: string; email?: string; phone?: string; telephone?: string; title?: string; role?: string }>;
  documents?: Array<{ name?: string; url?: string }>;
  procurement_files?: Array<{ name?: string; url?: string }>;
  external_links?: Array<{ name?: string; title?: string; url?: string }>;
  agency_full?: string;
  published_date?: string;
  difficulty?: string;
  registration_level?: string;
  key_contacts?: string;
  unspsc_codes?: Array<{ code?: string; name?: string; description?: string }>;
  core_locked?: boolean;
  unlock_type?: string;
  unlocked_at?: string;
};

type NoticeResponse = {
  items?: NoticeItem[];
  total?: number;
  pageSize?: number;
  page_size?: number;
};

type MembershipPlan = {
  plan_code: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  duration_days?: number | null;
  unlock_quota: number;
  free_quota: number;
  plan_type: string;
};

type MembershipStatus = {
  membership_tier: string;
  free_quota: number;
  free_used: number;
  free_remaining: number;
  paid_unlocks: number;
  paid_quota_total?: number;
  paid_quota_used?: number;
  paid_quota_remaining?: number;
  active_subscriptions?: Array<{ plan_code: string; status: string; expires_at?: string | null }>;
  entitlements?: Array<{
    id: number;
    plan_code: string;
    quota_total: number;
    quota_used: number;
    quota_remaining: number;
    expires_at?: string | null;
  }>;
};

type PaymentOrder = {
  order_no: string;
  provider: "alipay" | "wechat" | "mock";
  plan_code: string;
  notice_id?: number | null;
  amount: number;
  currency?: string;
  status: string;
  payment_mode?: "configured" | "mock";
  pay_url?: string;
  qr_code_url?: string;
};

type PaymentHistoryRow = {
  order_no?: string;
  status?: string;
  plan_code?: string;
  notice_id?: number | null;
  amount?: number;
  currency?: string;
  paid_at?: string;
  created_at?: string;
  unlock_type?: string;
  unlocked_at?: string;
  notice?: Pick<NoticeItem, "id" | "title" | "agency" | "country" | "notice_id" | "reference"> | null;
};

type Props = {
  userKey?: string;
  isVip: boolean;
  onRequireLogin: () => void;
  lang?: Lang;
};

const PAGE_SIZE = 9;
const FREE_DETAIL_VIEW_LIMIT = 3;
const apiCache = new Map<string, Promise<any>>();

const fetchJsonCached = <T,>(url: string): Promise<T> => {
  const cached = apiCache.get(url);
  if (cached) return cached;

  const request = fetch(url).then((res) => {
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  });
  apiCache.set(url, request);
  request.catch(() => apiCache.delete(url));
  return request;
};

const copy = {
  zh: {
    back: "返回采购列表",
    poolTitle: "国际公共采购 采购线索池",
    poolDesc: "按 UNSPSC 分类筛选公开采购机会，登录后可免费查看 3 条详情。",
    total: "共",
    items: "条",
    freeTrial: "免费体验",
    vipActive: "会员权益有效",
    level: "级分类",
    search: "搜索标题/机构/国家",
    loading: "正在加载...",
    currentPage: "当前第",
    page: "页",
    eachPage: "每页",
    noMatch: "没有匹配的线索，请调整分类或关键词。",
    prev: "上一页",
    next: "下一页",
    show: "显示",
    detail: "查看详情",
    budgetPending: "预算待更新",
    unknownAgency: "未知机构",
    global: "全球",
    noDeadline: "暂无截止时间",
    interested: "感兴趣",
    subscribeNotice: "订阅商机",
    freeUnlock: "免费查看",
    freeUsedUp: "免费次数已用完",
    memberUnlock: "会员查看",
    quotaTitle: "查看额度",
    freeQuota: "免费额度",
    paidQuota: "付费额度",
    used: "已用",
    remaining: "剩余",
    actionTip: "前 3 次可直接查看详情，之后可购买单次解锁、套餐或会员服务继续查看。",
    actionSuccess: "已记录兴趣，顾问可据此提供商机解读。",
    subscribedSuccess: "已订阅该商机，后续可通过邮件或顾问跟进。",
    freeLimit: "免费详情查看已超过 3 次，请选择单次解锁、套餐或会员服务继续查看。",
    unlockFail: "解锁失败，请稍后再试。",
    freeUnlockOk: "免费查看成功。",
    paidUnlockOk: "已解锁该商机。",
    orderCreated: "支付订单已创建，请在打开的支付页面完成付款。",
    orderFail: "创建支付订单失败。",
    paidFail: "支付状态确认失败。",
    paidOk: "会员权益已生效。",
    metaNo: "编号",
    agency: "机构",
    country: "国家/地区",
    budget: "预算",
    description: "采购说明",
    tags: "分类标签",
    noDesc: "该线索暂无公开描述。顾问服务可补充采购说明、联系方式和投标风险拆解。",
    lockedCoreTitle: "核心信息已隐藏",
    lockedCoreDesc: "真实机构、联系方式、拆解文件和分类明细将在解锁核验通过后展示。",
    products: "解锁产品",
    productsDesc: "选择单次解锁、尝鲜包、周卡或年卡，支付成功后自动发放查看额度。",
    close: "关闭",
    alipay: "支付宝",
    wechat: "微信支付",
    choosePay: "立即支付",
    creatingOrder: "正在处理...",
    orderNo: "订单号",
    mockNote: "当前为本地模拟支付，确认后会自动发放权益。",
    mockPaid: "确认完成",
    paymentTip: "支付完成后系统会自动确认订单并发放对应查看额度。",
    paidServiceTitle: "付费服务包括",
    paidServiceContact: "采购方或项目联系方式获取指导与跟进建议",
    paidServiceAnalysis: "1 对 1 深度解读投标商机、资质、UNSPSC、交付与报价风险",
    paidServiceProcess: "支付宝/微信在线支付后自动发放查看额度",
    paidServiceManualNote: "需要深度顾问服务时，可在年卡权益基础上继续对接顾问。"
  },
  en: {
    back: "Back to notices",
    poolTitle: "International Public Procurement Leads",
    poolDesc: "Filter public procurement notices by UNSPSC. Logged-in users can view 3 details for free.",
    total: "Total",
    items: "items",
    freeTrial: "Free quota",
    vipActive: "Member active",
    level: "level",
    search: "Search title / agency / country",
    loading: "Loading...",
    currentPage: "Page",
    page: "",
    eachPage: "page size",
    noMatch: "No matching notices. Adjust filters or keywords.",
    prev: "Previous",
    next: "Next",
    show: "Showing",
    detail: "View detail",
    budgetPending: "Budget pending",
    unknownAgency: "Unknown agency",
    global: "Global",
    noDeadline: "No deadline",
    interested: "Express interest",
    subscribeNotice: "Subscribe lead",
    freeUnlock: "Free view",
    freeUsedUp: "Free views used up",
    memberUnlock: "Member view",
    quotaTitle: "View quota",
    freeQuota: "Free quota",
    paidQuota: "Paid quota",
    used: "Used",
    remaining: "Remaining",
    actionTip: "The first 3 details are free. Buy a single unlock, package or membership to keep viewing.",
    actionSuccess: "Interest recorded.",
    subscribedSuccess: "Lead subscribed.",
    freeLimit: "Free detail views are used up. Choose a single unlock, package or membership to keep viewing.",
    unlockFail: "Unlock failed. Please try again later.",
    freeUnlockOk: "Free view succeeded.",
    paidUnlockOk: "Lead unlocked.",
    orderCreated: "Payment order created. Complete payment in the page that opened.",
    orderFail: "Failed to create payment order.",
    paidFail: "Payment confirmation failed.",
    paidOk: "Benefits are active.",
    metaNo: "Reference",
    agency: "Agency",
    country: "Country",
    budget: "Budget",
    description: "Description",
    tags: "UNSPSC tags",
    noDesc: "No public description yet. Advisor service can enrich contacts, requirements and bid risks.",
    lockedCoreTitle: "Core information hidden",
    lockedCoreDesc: "Agency, contact guidance, analysis files and classification details are shown only after unlock verification.",
    products: "Unlock products",
    productsDesc: "Choose single unlock, starter package, weekly card or annual card. Quota is issued after payment.",
    close: "Close",
    alipay: "Alipay",
    wechat: "WeChat Pay",
    choosePay: "Pay now",
    creatingOrder: "Processing...",
    orderNo: "Order no.",
    mockNote: "Local mock payment is active. Confirm to issue benefits.",
    mockPaid: "Confirmed",
    paymentTip: "After payment succeeds, the system confirms the order and issues view quota automatically.",
    paidServiceTitle: "Paid service includes",
    paidServiceContact: "Buyer or project contact guidance and follow-up suggestions",
    paidServiceAnalysis: "1-on-1 bid opportunity analysis: qualification, UNSPSC, delivery and pricing risk",
    paidServiceProcess: "Alipay or WeChat Pay issues view quota automatically after payment",
    paidServiceManualNote: "For deeper advisory work, continue with advisor support on top of the annual card."
  }
};

const getOptionLabel = (item: UnspscOption, lang: Lang) => {
  const title = lang === "zh" ? item.title_zh || item.title || item.name : item.title_en || item.title || item.name || item.title_zh;
  return `${item.code || ""}${item.code ? " - " : ""}${title || "Unnamed category"}`;
};

const formatMoney = (price: number, currency = "CNY") => {
  return `${currency || "CNY"} ${Number(price || 0).toFixed(0)}`;
};

export default function ProcurementNoticesPool({ userKey, isVip, onRequireLogin, lang = "zh" }: Props) {
  const text = copy[lang];
  const [levels, setLevels] = useState<Array<UnspscOption[]>>([[], [], [], [], []]);
  const [selectedIds, setSelectedIds] = useState<string[]>(["", "", "", "", ""]);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<NoticeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [serverPageSize, setServerPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null);
  const [query, setQuery] = useState("");
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [paywallNotice, setPaywallNotice] = useState<NoticeItem | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<"alipay" | "wechat">("alipay");
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrder | null>(null);
  const [busyPlanCode, setBusyPlanCode] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryRow[]>([]);
  const [unlockHistory, setUnlockHistory] = useState<PaymentHistoryRow[]>([]);
  const noticesRequestSeq = useRef(0);

  const totalPages = Math.max(1, Math.ceil(total / serverPageSize));
  const paidPlans = plans.filter((plan) => Number(plan.price) > 0);
  const paidRemaining = Number(membership?.paid_quota_remaining || 0);
  const freeRemaining = Number(membership?.free_remaining ?? 2);
  const freeQuota = Number(membership?.free_quota ?? 2);
  const canUsePaidQuota = isVip || paidRemaining > 0;
  const getDetailViewCountKey = () => `procurement_detail_views_${userKey || "guest"}`;

  const getDetailViewCount = () => {
    if (typeof window === "undefined") return 0;
    return Number(window.localStorage.getItem(getDetailViewCountKey()) || 0);
  };

  const setDetailViewCount = (count: number) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(getDetailViewCountKey(), String(count));
  };

  const loadUnlockedNoticeDetail = async (noticeId: number) => {
    if (!userKey) return false;
    try {
      const res = await fetch(`/api/notices/${noticeId}/detail?user_key=${encodeURIComponent(userKey)}`, { cache: "no-store" });
      if (!res.ok) return false;
      const data = await res.json();
      setSelectedNotice((prev) => (prev?.id === noticeId ? { ...prev, ...data } : { ...data, id: noticeId }));
      setPaywallNotice(null);
      return true;
    } catch {
      return false;
    }
  };

  const deepestCodeId = useMemo(() => {
    for (let i = selectedIds.length - 1; i >= 0; i -= 1) {
      if (selectedIds[i]) return selectedIds[i];
    }
    return "";
  }, [selectedIds]);

  const refreshMembership = async (useCache = false) => {
    if (!userKey) {
      setMembership(null);
      return;
    }
    try {
      const url = `/api/membership/status?user_key=${encodeURIComponent(userKey)}`;
      const data = useCache
        ? await fetchJsonCached<MembershipStatus>(url)
        : await fetch(url).then((res) => res.json());
      if (!useCache) apiCache.set(url, Promise.resolve(data));
      setMembership(data);
    } catch {
      setMembership(null);
    }
  };

  const refreshPaymentHistory = async () => {
    if (!userKey) {
      setPaymentHistory([]);
      setUnlockHistory([]);
      return;
    }
    try {
      const [ordersRes, unlocksRes] = await Promise.all([
        fetch(`/api/payment/orders?user_key=${encodeURIComponent(userKey)}&limit=3`, { cache: "no-store" }),
        fetch(`/api/payment/unlocks?user_key=${encodeURIComponent(userKey)}&limit=3`, { cache: "no-store" }),
      ]);
      const orders = ordersRes.ok ? await ordersRes.json() : {};
      const unlocks = unlocksRes.ok ? await unlocksRes.json() : {};
      setPaymentHistory(Array.isArray(orders.list) ? orders.list : []);
      setUnlockHistory(Array.isArray(unlocks.list) ? unlocks.list : []);
    } catch {
      setPaymentHistory([]);
      setUnlockHistory([]);
    }
  };

  useEffect(() => {
    fetchJsonCached<UnspscOption[]>("/api/unspsc/industries")
      .then((data) => setLevels((prev) => [Array.isArray(data) ? data : [], prev[1], prev[2], prev[3], prev[4]]))
      .catch(() => setError("Failed to load UNSPSC categories."));

    fetchJsonCached<MembershipPlan[]>("/api/membership/plans")
      .then((data) => setPlans(Array.isArray(data) ? data.map((plan) => ({ ...plan, price: Number(plan.price || 0) })) : []))
      .catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    refreshMembership(true);
    refreshPaymentHistory();
  }, [userKey, isVip]);

  useEffect(() => {
    if (!userKey || typeof window === "undefined") return;

    const applyPaymentReturn = async () => {
      const hash = window.location.hash || "";
      if (!hash.startsWith("#procurement")) return;

      const queryIndex = hash.indexOf("?");
      if (queryIndex < 0) return;

      const params = new URLSearchParams(hash.slice(queryIndex + 1));
      const paid = params.get("paid");
      const orderNo = params.get("order_no") || "";
      const tradeNo = params.get("trade_no") || "";
      const noticeId = Number(params.get("notice_id") || 0);
      if (!noticeId) return;

      if (!orderNo) {
        setSelectedNotice((prev) => prev || items.find((item) => item.id === noticeId) || null);
        const opened = await loadUnlockedNoticeDetail(noticeId);
        setActionMessage(opened ? text.paidUnlockOk : text.unlockFail);
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#procurement`);
        return;
      }

      setActionMessage(paid === "0" ? text.paidFail : text.orderCreated);

      try {
        const statusUrl = `/api/payment/orders/${encodeURIComponent(orderNo)}${tradeNo ? `?trade_no=${encodeURIComponent(tradeNo)}` : ""}`;
        const statusRes = await fetch(statusUrl, { cache: "no-store" });
        const status = statusRes.ok ? await statusRes.json() : null;
        if (status?.status === "paid") {
          await loadUnlockedNoticeDetail(noticeId);
          await refreshMembership();
          await refreshPaymentHistory();
          setPaymentOrder({ ...status, plan_code: status.plan_code || "single_89", provider: status.provider || "alipay" });
          setPaymentMessage(text.paidOk);
          setActionMessage(text.paidOk);
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#procurement`);
          return;
        }

        setSelectedNotice((prev) => prev || items.find((item) => item.id === noticeId) || null);
        setPaywallNotice((prev) => prev || items.find((item) => item.id === noticeId) || null);
        setPaymentOrder(status ? { ...status, plan_code: status.plan_code || "single_89", provider: status.provider || "alipay" } : null);
        setPaymentMessage(text.orderCreated);
        startPaymentPolling(orderNo, status?.plan_code || "single_89", noticeId);
      } catch {
        setActionMessage(text.paidFail);
      }
    };

    applyPaymentReturn();
    window.addEventListener("hashchange", applyPaymentReturn);
    return () => window.removeEventListener("hashchange", applyPaymentReturn);
  }, [userKey, items]);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (deepestCodeId) params.set("code_id", deepestCodeId);

    const requestSeq = noticesRequestSeq.current + 1;
    noticesRequestSeq.current = requestSeq;
    setLoading(true);
    setError("");
    fetchJsonCached<NoticeResponse>(`/api/notices?${params.toString()}`)
      .then((json: NoticeResponse) => {
        if (requestSeq !== noticesRequestSeq.current) return;
        const nextPageSize = Number(json.pageSize || json.page_size || PAGE_SIZE);
        setItems(Array.isArray(json.items) ? json.items : []);
        setTotal(Number(json.total || 0));
        setServerPageSize(nextPageSize);
      })
      .catch(() => {
        if (requestSeq === noticesRequestSeq.current) setError("Failed to load procurement notices.");
      })
      .finally(() => {
        if (requestSeq === noticesRequestSeq.current) setLoading(false);
      });
  }, [deepestCodeId, page]);

  const handleLevelChange = async (levelIndex: number, value: string) => {
    const nextSelected = selectedIds.map((id, index) => (index < levelIndex ? id : ""));
    nextSelected[levelIndex] = value;
    setSelectedIds(nextSelected);
    setPage(1);
    setSelectedNotice(null);

    const nextLevels = levels.map((list, index) => (index <= levelIndex ? list : []));
    if (value && levelIndex < 4) {
      try {
        const children = await fetchJsonCached<UnspscOption[]>(`/api/unspsc/children?parent_id=${encodeURIComponent(value)}`);
        nextLevels[levelIndex + 1] = Array.isArray(children) ? children : [];
      } catch {
        nextLevels[levelIndex + 1] = [];
      }
    }
    setLevels(nextLevels);
  };

  const openNotice = async (notice: NoticeItem) => {
    if (!userKey) {
      onRequireLogin();
      return;
    }

    const currentViews = getDetailViewCount();
    if (!isVip && currentViews >= FREE_DETAIL_VIEW_LIMIT) {
      setSelectedNotice(notice);
      setPaywallNotice(notice);
      setPaymentOrder(null);
      setPaymentMessage("");
      setActionMessage(text.freeLimit);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    await fetch(`/api/notices/${notice.id}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_key: userKey })
    }).catch(() => undefined);

    if (!isVip) setDetailViewCount(currentViews + 1);
    setSelectedNotice(notice);
    setPaywallNotice(null);
    setPaymentOrder(null);
    setActionMessage("");
    await loadUnlockedNoticeDetail(notice.id);
    await refreshMembership();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const unlockNotice = async (notice: NoticeItem, unlockType?: "free" | "single" | "subscription") => {
    if (!userKey) {
      onRequireLogin();
      return false;
    }

    if (!unlockType && !canUsePaidQuota && freeRemaining <= 0) {
      setSelectedNotice(notice);
      setPaywallNotice(notice);
      setPaymentOrder(null);
      setPaymentMessage("");
      setActionMessage(text.freeLimit);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    }

    const nextUnlockType = unlockType || (canUsePaidQuota ? "subscription" : "free");
    const res = await fetch(`/api/notices/${notice.id}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_key: userKey,
        unlock_type: nextUnlockType,
        price: nextUnlockType === "single" ? 89 : 0
      })
    });

    if (res.status === 402) {
      setSelectedNotice(notice);
      setPaywallNotice(notice);
      setPaymentOrder(null);
      setPaymentMessage("");
      setActionMessage(text.freeLimit);
      await refreshMembership();
      return false;
    }

    if (!res.ok) {
      setActionMessage(text.unlockFail);
      await refreshMembership();
      return false;
    }

    await refreshMembership();
    await refreshPaymentHistory();
    setActionMessage(nextUnlockType === "free" ? text.freeUnlockOk : text.paidUnlockOk);
    await loadUnlockedNoticeDetail(notice.id);
    return true;
  };

  const expressInterest = async (notice: NoticeItem, interestType: "interested" | "subscribed") => {
    if (!userKey) {
      onRequireLogin();
      return;
    }

    const res = await fetch(`/api/notices/${notice.id}/interest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_key: userKey, interest_type: interestType })
    });

    if (!res.ok) {
      setActionMessage("Action failed. Please try again later.");
      return;
    }

    setPaywallNotice(notice);
    setPaymentOrder(null);
    setPaymentMessage("");
    setActionMessage(interestType === "subscribed" ? text.subscribedSuccess : text.actionSuccess);
    await refreshMembership();
  };

  const createPaymentOrder = async (planCode: string) => {
    if (busyPlanCode) return;
    if (!userKey || !paywallNotice) {
      onRequireLogin();
      return;
    }

    setBusyPlanCode(planCode);
    setPaymentMessage("");
    setActionMessage("");

    try {
      const res = await fetch("/api/payment/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_key: userKey,
          plan_code: planCode,
          notice_id: paywallNotice.id,
          provider: paymentProvider,
          return_url: `${window.location.origin}${window.location.pathname}#procurement`,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || text.orderFail);
      }

      const order = await res.json();
      setPaymentOrder({ ...order, plan_code: planCode });
      setPaymentMessage(text.orderCreated);
      setActionMessage(text.orderCreated);
      await refreshPaymentHistory();
      if (order.pay_url && order.provider !== "mock") {
        const payWindow = window.open(order.pay_url, "_blank");
        if (!payWindow) window.location.href = order.pay_url;
      }
      startPaymentPolling(order.order_no, planCode, paywallNotice.id);
    } catch (err: any) {
      setPaymentMessage(err?.message || text.orderFail);
      setActionMessage(err?.message || text.orderFail);
    } finally {
      setBusyPlanCode("");
    }
  };

  const startPaymentPolling = (orderNo: string, planCode: string, noticeId?: number) => {
    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts += 1;
      try {
        const res = await fetch(`/api/payment/orders/${encodeURIComponent(orderNo)}`);
        if (res.ok) {
          const status = await res.json();
          if (status.status === "paid") {
            window.clearInterval(timer);
            const targetNotice = paywallNotice || (noticeId ? items.find((item) => item.id === noticeId) : null);
            if (targetNotice) {
              await unlockNotice(targetNotice, planCode === "single_89" ? "single" : "subscription");
            } else if (noticeId) {
              await loadUnlockedNoticeDetail(noticeId);
            }
            setPaymentMessage(text.paidOk);
            setActionMessage(text.paidOk);
            await refreshMembership();
            await refreshPaymentHistory();
          }
          if (status.status === "closed" || status.status === "failed") {
            window.clearInterval(timer);
            setPaymentMessage(text.paidFail);
            setActionMessage(text.paidFail);
          }
        }
      } catch {
        // keep polling until timeout
      }
      if (attempts >= 80) {
        window.clearInterval(timer);
        setPaymentMessage(text.paidFail);
      }
    }, 3000);
  };

  const markPaymentPaid = async () => {
    if (!paymentOrder || !paywallNotice) return;

    const res = await fetch(`/api/payments/${paymentOrder.order_no}/mock-paid`, { method: "POST" });
    if (!res.ok) {
      setActionMessage(text.paidFail);
      return;
    }
    await unlockNotice(paywallNotice, paymentOrder.plan_code === "single_89" ? "single" : "subscription");
    setPaymentOrder(null);
    setPaywallNotice(null);
    await refreshMembership();
    await refreshPaymentHistory();
    setActionMessage(text.paidOk);
  };

  const openHistoryNotice = async (row: PaymentHistoryRow) => {
    const noticeId = Number(row.notice_id || row.notice?.id || 0);
    if (!noticeId) return;
    setSelectedNotice({
      id: noticeId,
      title: row.notice?.title || row.order_no || "",
      notice_id: row.notice?.notice_id,
      reference: row.notice?.reference,
      agency: row.notice?.agency,
      country: row.notice?.country,
      core_locked: true,
    });
    setActionMessage("");
    await loadUnlockedNoticeDetail(noticeId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const visibleItems = items.filter((item) => {
    if (!query.trim()) return true;
    const haystack = `${item.title} ${item.agency || ""} ${item.country || ""} ${item.reference || ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  if (selectedNotice) {
    const coreUnlocked = selectedNotice.core_locked === false;
    const visibleAgency = coreUnlocked
      ? selectedNotice.agency_full || selectedNotice.agency || selectedNotice.organization || text.unknownAgency
      : text.lockedCoreTitle;
    const unlockedContacts = selectedNotice.contacts || [];
    const unlockedFiles = [...(selectedNotice.documents || []), ...(selectedNotice.procurement_files || [])].filter((item) => item?.url || item?.name);
    const unlockedLinks = selectedNotice.external_links || [];
    return (
      <div className="space-y-5">
        <button
          onClick={() => setSelectedNotice(null)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="w-4 h-4" />
          {text.back}
        </button>

        <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-6 max-[900px]:grid-cols-1">
            <main className="min-w-0 space-y-5">
              <div className="border-b border-slate-100 pb-5">
                <p className="text-xs font-black text-teal-600 uppercase tracking-wider">{selectedNotice.notice_type || "Procurement Notice"}</p>
                <h3 className="text-2xl md:text-3xl font-extrabold text-slate-950 mt-2 leading-tight">{selectedNotice.title}</h3>
                <p className="text-sm text-slate-500 mt-3">
                  {visibleAgency} 路 {selectedNotice.country || text.global} 路 {selectedNotice.deadline || text.noDeadline}
                </p>
              </div>

              {actionMessage && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                  {actionMessage}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                {[
                  [text.metaNo, selectedNotice.reference || selectedNotice.notice_id || "-"],
                  [text.agency, visibleAgency],
                  [text.country, selectedNotice.country || "-"],
                  [text.budget, selectedNotice.estimated_value || text.budgetPending]
                ].map(([label, value]) => (
                  <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <p className="font-black text-slate-400 uppercase">{label}</p>
                    <p className="font-bold text-slate-800 mt-1 break-words">{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <h4 className="text-sm font-extrabold text-slate-900 mb-2">{text.description}</h4>
                <p className="text-sm text-slate-600 leading-7 whitespace-pre-line break-words">
                  {selectedNotice.description || text.noDesc}
                </p>
              </div>

              {coreUnlocked ? (
                <>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900 mb-2">{text.tags}</h4>
                    <div className="flex flex-wrap gap-2">
                      {(selectedNotice.unspsc_codes || []).slice(0, 16).map((code, index) => (
                        <span key={`${code.code || index}`} className="px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-xs font-mono text-slate-600">
                          {code.code || code.name || code.description}
                        </span>
                      ))}
                    </div>
                  </div>

                  <section className="rounded-xl border border-teal-100 bg-teal-50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-4 h-4 text-teal-700" />
                      <h4 className="text-sm font-extrabold text-teal-950">已解锁交付信息</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border border-teal-100 bg-white p-3">
                        <p className="font-black text-slate-900 mb-2">采购方/机构信息</p>
                        <div className="space-y-1.5 text-slate-600 leading-5">
                          <p><span className="font-bold text-slate-500">机构全称：</span>{selectedNotice.agency_full || selectedNotice.agency || selectedNotice.organization || "-"}</p>
                          <p><span className="font-bold text-slate-500">国家/地区：</span>{selectedNotice.country || "-"}</p>
                          <p><span className="font-bold text-slate-500">发布日期：</span>{selectedNotice.published_date || "-"}</p>
                          <p><span className="font-bold text-slate-500">原始链接：</span>{selectedNotice.url ? <a className="font-black text-blue-700 hover:text-blue-900" href={selectedNotice.url} target="_blank" rel="noreferrer">打开公告</a> : "-"}</p>
                        </div>
                      </div>

                      <div className="rounded-lg border border-teal-100 bg-white p-3">
                        <p className="font-black text-slate-900 mb-2">联系方式</p>
                        <div className="space-y-2 text-slate-600 leading-5">
                          {selectedNotice.key_contacts && <p>{selectedNotice.key_contacts}</p>}
                          {unlockedContacts.length === 0 && !selectedNotice.key_contacts && <p className="text-slate-400">当前源公告未公开电话/邮箱，建议通过原始公告文件或平台留言入口跟进。</p>}
                          {unlockedContacts.map((contact, index) => (
                            <div key={`${contact.name || "contact"}-${index}`} className="rounded-md bg-slate-50 border border-slate-100 px-2 py-1.5">
                              <p className="font-bold text-slate-800">{contact.name || contact.title || contact.role || `联系人 ${index + 1}`}</p>
                              <p>{contact.email || contact.phone || contact.telephone || "未公开邮箱/电话"}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg border border-teal-100 bg-white p-3 text-xs">
                      <p className="font-black text-slate-900 mb-2">采购文件/拆解材料</p>
                      <div className="space-y-2">
                        {unlockedFiles.length === 0 && <p className="text-slate-400">暂无可下载文件。</p>}
                        {unlockedFiles.map((file, index) => (
                          <a
                            key={`${file.url || file.name}-${index}`}
                            className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 hover:border-blue-200"
                            href={file.url || "#"}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span className="font-bold text-slate-700 truncate">{file.name || `采购文件 ${index + 1}`}</span>
                            <ExternalLink className="w-4 h-4 shrink-0 text-blue-600" />
                          </a>
                        ))}
                        {unlockedLinks.map((link, index) => (
                          <a
                            key={`${link.url || link.name || index}`}
                            className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 hover:border-blue-200"
                            href={link.url || "#"}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span className="font-bold text-slate-700 truncate">{link.name || link.title || `外部链接 ${index + 1}`}</span>
                            <ExternalLink className="w-4 h-4 shrink-0 text-blue-600" />
                          </a>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg border border-teal-100 bg-white p-3 text-xs">
                      <p className="font-black text-slate-900 mb-2">投标拆解建议</p>
                      <ul className="list-disc pl-4 space-y-1.5 leading-6 text-slate-600">
                        <li>紧急度：{selectedNotice.difficulty || "待评估"}；注册门槛：{selectedNotice.registration_level || "待确认"}。</li>
                        <li>预算参考：{selectedNotice.estimated_value || "未公开"}；截止时间：{selectedNotice.deadline || text.noDeadline}。</li>
                        <li>分类代码：{(selectedNotice.unspsc_codes || []).map((code) => code.code).filter(Boolean).slice(0, 4).join(", ") || "待补充"}。</li>
                        <li>下一步：下载 RFQ/附件，核对资质、交付时间、报价币种和文件签章要求后再提交。</li>
                      </ul>
                    </div>
                  </section>

                </>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                  <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-700" />
                    {text.lockedCoreTitle}
                  </h4>
                  <p className="text-sm text-amber-900 leading-7 mt-2">{text.lockedCoreDesc}</p>
                </div>
              )}
            </main>

            <aside className="sticky top-24 h-fit space-y-4 max-[900px]:static">
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <button
                  onClick={() => expressInterest(selectedNotice, "interested")}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-black hover:bg-blue-700"
                >
                  <Heart className="w-4 h-4" />
                  {text.interested}
                </button>
                <button
                  onClick={() => expressInterest(selectedNotice, "subscribed")}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-black hover:bg-slate-800"
                >
                  <Bell className="w-4 h-4 text-amber-300" />
                  {text.subscribeNotice}
                </button>
                <button
                  onClick={() => unlockNotice(selectedNotice)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-100 text-teal-800 text-sm font-black hover:bg-teal-200"
                >
                  <Lock className="w-4 h-4" />
                  {canUsePaidQuota ? text.memberUnlock : freeRemaining > 0 ? `${text.freeUnlock}?${text.remaining} ${freeRemaining}?` : text.freeUsedUp}
                </button>

                <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 space-y-2">
                  <p className="font-black text-slate-800 flex items-center gap-2">
                    <WalletCards className="w-4 h-4 text-teal-600" />
                    {text.quotaTitle}
                  </p>
                  <p>{text.freeQuota}: {text.used} {membership?.free_used ?? 0}/{freeQuota}, {text.remaining} {freeRemaining}</p>
                  <p>{text.paidQuota}: {text.used} {membership?.paid_quota_used ?? 0}/{membership?.paid_quota_total ?? 0}, {text.remaining} {membership?.paid_quota_remaining ?? 0}</p>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
                  <p className="font-black text-slate-900 flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-600" />
                    {text.paidServiceTitle}
                  </p>
                  <ul className="space-y-1 leading-5 list-disc pl-4">
                    <li>{text.paidServiceContact}</li>
                    <li>{text.paidServiceAnalysis}</li>
                    <li>{text.paidServiceProcess}</li>
                  </ul>
                  <p className="text-[11px] text-amber-800">{text.paidServiceManualNote}</p>
                </div>

                <p className="text-[11px] leading-5 text-slate-500">{text.actionTip}</p>
              </div>

              {paywallNotice && (
                <PaymentPanel
                  plans={paidPlans}
                  provider={paymentProvider}
                  order={paymentOrder}
                  lang={lang}
                  busyPlanCode={busyPlanCode}
                  message={paymentMessage}
                  onProviderChange={setPaymentProvider}
                  onCreateOrder={createPaymentOrder}
                  onMockPaid={markPaymentPaid}
                  onClose={() => {
                    setPaywallNotice(null);
                    setPaymentOrder(null);
                    setPaymentMessage("");
                  }}
                />
              )}
            </aside>
          </div>
        </article>

      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-500" />
              {text.poolTitle}
            </h3>
            <p className="text-xs text-slate-500 mt-1">{text.poolDesc}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 font-bold">{text.total} {total} {text.items}</span>
            <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 font-bold">
              {canUsePaidQuota ? text.vipActive : `${text.freeTrial} ${membership?.free_remaining ?? 2} ${text.items}`}
            </span>
          </div>
        </div>


        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-3">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              {[0, 1, 2, 3, 4].map((level) => (
                <select
                  key={level}
                  value={selectedIds[level]}
                  onChange={(e) => handleLevelChange(level, e.target.value)}
                  disabled={level > 0 && levels[level].length === 0}
                  className="px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">{level + 1}{text.level}</option>
                  {levels[level].map((item) => (
                    <option key={item.id} value={item.id}>{getOptionLabel(item, lang)}</option>
                  ))}
                </select>
              ))}
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={text.search}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-teal-600" />
            {text.currentPage} {page} / {totalPages} {text.page}, {text.eachPage} {serverPageSize} {text.items}
          </span>
          {loading && <span className="font-bold text-teal-600">{text.loading}</span>}
        </div>

        {error && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm font-bold mb-4">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleItems.map((item) => (
            <article key={item.id} className="border border-slate-200 rounded-xl p-4 min-h-64 flex flex-col hover:border-teal-300 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-3">
                <span className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black">
                  {item.notice_type || "Notice"}
                </span>
                <span className="text-[10px] text-slate-500 font-mono text-right">{item.deadline}</span>
              </div>
              <h4 className="text-base font-extrabold text-slate-900 mt-3 line-clamp-2">{item.title}</h4>
              <p className="text-xs text-slate-500 mt-3 line-clamp-3">
                {item.description || text.noDesc}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {(item.core_locked === false ? item.unspsc_codes || [] : []).slice(0, 4).map((code, index) => (
                  <span key={`${code.code || index}`} className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-mono text-slate-600">
                    {code.code || code.name || code.description}
                  </span>
                ))}
              </div>
              <div className="mt-auto pt-4 border-t border-slate-100 flex items-end justify-between gap-3">
                <div className="text-xs min-w-0">
                  <p className="font-black text-slate-800">{item.estimated_value || text.budgetPending}</p>
                  <p className="text-slate-500 truncate">{item.agency || item.organization || text.unknownAgency}</p>
                </div>
                <button
                  onClick={() => openNotice(item)}
                  className="px-3 py-2 rounded-lg bg-teal-100 text-teal-800 text-xs font-black hover:bg-teal-200"
                >
                  {text.detail}
                </button>
              </div>
            </article>
          ))}
        </div>

        {!loading && visibleItems.length === 0 && (
          <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">{text.noMatch}</div>
        )}

        <div className="flex items-center justify-between gap-3 mt-5">
          <p className="text-xs text-slate-500">{text.show} {(page - 1) * serverPageSize + 1} - {Math.min(page * serverPageSize, total)} {text.items}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-50 hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4" />
              {text.prev}
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-50 hover:bg-slate-50"
            >
              {text.next}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}

function PaymentPanel({
  plans,
  provider,
  order,
  lang,
  busyPlanCode,
  message,
  onProviderChange,
  onCreateOrder,
  onMockPaid,
  onClose
}: {
  plans: MembershipPlan[];
  provider: "alipay" | "wechat";
  order: PaymentOrder | null;
  lang: Lang;
  busyPlanCode: string;
  message: string;
  onProviderChange: (provider: "alipay" | "wechat") => void;
  onCreateOrder: (planCode: string) => void;
  onMockPaid: () => void;
  onClose: () => void;
}) {
  const text = copy[lang];

  return (
    <section className="border border-slate-200 rounded-xl bg-white p-4 shadow-lg space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-extrabold text-slate-900">{text.products}</h4>
          <p className="text-[11px] text-slate-500 mt-1 leading-5">{text.productsDesc}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={text.close}
          title={text.close}
          className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {(message || busyPlanCode) && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs font-bold text-blue-800">
          {busyPlanCode ? text.creatingOrder : message}
        </div>
      )}

      {order && (
        <div className="rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm text-teal-900">
          <p className="font-black flex items-center gap-2 break-all">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {text.orderNo}: {order.order_no}
          </p>
          <p className="text-xs mt-1 leading-5">
            {order.payment_mode === "configured" ? text.orderCreated : text.mockNote}
          </p>
          {order.payment_mode !== "configured" && (
            <button onClick={onMockPaid} className="mt-3 px-3 py-2 rounded-lg bg-teal-700 text-white text-xs font-black hover:bg-teal-800">
              {text.mockPaid}
            </button>
          )}
          {order.pay_url && order.payment_mode === "configured" && (
            <button
              type="button"
              onClick={() => window.open(order.pay_url, "_blank")}
              className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-700 text-white text-xs font-black hover:bg-blue-800"
            >
              <ExternalLink className="w-4 h-4" />
              {text.choosePay}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {(["alipay", "wechat"] as const).map((item) => {
          const disabled = item === "wechat";
          return (
          <button
            key={item}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (!disabled) onProviderChange(item);
            }}
            className={`px-3 py-2 rounded-lg border text-xs font-black ${
              disabled
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                : provider === item
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-slate-50 text-slate-600 border-slate-200"
            }`}
          >
            {item === "alipay" ? text.alipay : `${text.wechat}\uff08\u6682\u672a\u5f00\u901a\uff09`}
          </button>
        )})}
      </div>

      <div className="space-y-2.5">
        {plans.map((plan) => (
          <div key={plan.plan_code} className={`border rounded-lg p-3 bg-slate-50 ${order?.plan_code === plan.plan_code ? "border-teal-300 ring-1 ring-teal-100" : "border-slate-200"}`}>
            <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-900">{plan.name}</p>
                <p className="text-[11px] text-slate-500 mt-1 leading-5">{plan.description}</p>
              </div>
              <p className="text-xl font-black text-blue-700 leading-none whitespace-nowrap">{formatMoney(plan.price, plan.currency)}</p>
            </div>
            <button
              type="button"
              disabled={busyPlanCode === plan.plan_code}
              onClick={() => onCreateOrder(plan.plan_code)}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 text-white text-xs font-black hover:bg-blue-700 disabled:opacity-60"
            >
              <CreditCard className="w-4 h-4" />
              {busyPlanCode === plan.plan_code ? text.creatingOrder : order?.plan_code === plan.plan_code ? text.orderNo : text.choosePay}
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">
        {text.paymentTip}
      </div>
    </section>
  );
}
