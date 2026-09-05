"use client";

/**
 * 新首页 — 客户端骨架
 * New Homepage — Client Skeleton
 *
 * @description 按设计图模块01的骨架结构搭建，各区块后续填充真实数据与交互。
 *              Skeleton structure based on design module 01; sections to be filled with real data.
 *
 * 页面结构 / Page structure:
 *   1. Hero 区 — 双搜索入口（找采购机会 / 找供应商）
 *   2. 实时数字墙 — 6 个规模指标
 *   3. 三栏内容 — 今日热门商机 / 优质供应商 / 最新 RFQ 询价（统一搜索 notice_type=RFQ）
 *   4. 会员升级横幅
 *   5. 产品路径 — 从找标到中标 4 步
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { getCountryDisplayName } from "@/shared/data/countryNames";
import { Search, Building2, Globe, Users, Crown, TrendingUp } from "lucide-react";
import { WorldMapChart } from "@/shared/ui/charts/WorldMapChart";

/** Hero 区 — 双搜索入口 + 热门标签 */
function HeroSection() {
  const { t } = useLocale();
  const router = useRouter();
  const [procurementQuery, setProcurementQuery] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");

  const hotProcurementTags = ["医疗设备", "新能源", "工程机械", "建材", "电力设备", "UN/世行", "非洲", "东南亚"];
  const hotSupplierTags = ["光伏组件", "氧化铝", "发电机组", "医疗耗材", "道路机械", "钢材"];

  const handleProcurementSearch = () => {
    if (procurementQuery.trim()) {
      router.push(`/procurement?q=${encodeURIComponent(procurementQuery.trim())}`);
    } else {
      router.push("/procurement");
    }
  };

  const handleSupplierSearch = () => {
    if (supplierQuery.trim()) {
      router.push(`/supplier?q=${encodeURIComponent(supplierQuery.trim())}`);
    } else {
      router.push("/supplier");
    }
  };

  return (
    <section className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 py-16 px-4 overflow-hidden">
      {/* 地球纹理背景占位 */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-teal-500/20 to-transparent" />
      </div>

      <div className="relative px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
          全球公共采购与跨境供应链机会平台
        </h1>
        <p className="text-slate-300 text-base mb-8 max-w-2xl">
          聚合全球公共与大型机构采购机会，数据实时更新，助您抢占先机。
        </p>

        {/* 双搜索入口 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl">
          {/* 采购机会搜索 */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-5 h-5 text-teal-400" />
              <span className="text-white font-bold text-sm">搜索采购机会</span>
              <span className="text-slate-400 text-xs">(招标 / 采购 / 项目)</span>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={procurementQuery}
                onChange={(e) => setProcurementQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleProcurementSearch()}
                placeholder="搜索采购主题 / 产品关键词 / UNSPSC / 地区 / 采购机构"
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                onClick={handleProcurementSearch}
                className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap"
              >
                搜索商机
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-slate-400 text-xs">热门搜索：</span>
              {hotProcurementTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setProcurementQuery(tag);
                    router.push(`/procurement?q=${encodeURIComponent(tag)}`);
                  }}
                  className="text-xs text-teal-300 hover:text-teal-200 hover:underline transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* 供应商搜索 */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-5 h-5 text-teal-400" />
              <span className="text-white font-bold text-sm">查找供应商与产品</span>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={supplierQuery}
                onChange={(e) => setSupplierQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSupplierSearch()}
                placeholder="搜索产品 / 公司名称 / 资质 / 国家 / 认证"
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                onClick={handleSupplierSearch}
                className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap"
              >
                找供应商
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-slate-400 text-xs">热门产品：</span>
              {hotSupplierTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setSupplierQuery(tag);
                    router.push(`/supplier?q=${encodeURIComponent(tag)}`);
                  }}
                  className="text-xs text-teal-300 hover:text-teal-200 hover:underline transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** 数字跳动动画 Hook */
function useCountUp(target: number, duration = 1500): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    let start = 0;
    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutQuart
      const eased = 1 - Math.pow(1 - progress, 4);
      start = Math.floor(eased * target);
      setCount(start);
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

/** 格式化数字 — 直接展示，不带单位 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/** 单个统计卡片 — 带数字跳动动画 */
function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: number; sub: string; icon: typeof Globe; color: string;
}) {
  const animatedValue = useCountUp(value);
  return (
    <div className="text-center group">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 mb-2 group-hover:bg-slate-200 transition-colors">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <p className="text-2xl md:text-3xl font-extrabold text-slate-900">{formatNumber(animatedValue)}</p>
      <p className="text-xs font-bold text-slate-700 mt-1">{label}</p>
      <p className="text-2xs text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}

/** 实时数字墙 — 调用现有 API，10 分钟自动刷新 */
function StatsWall() {
  const [noticeStats, setNoticeStats] = useState<{
    active: number; todayNew: number;
  } | null>(null);
  const [countryCount, setCountryCount] = useState(0);
  const [supplierTotal, setSupplierTotal] = useState(0);

  const fetchStats = () => {
    // 复用现有 /api/notices/stats（含 todayNew）
    api<{ active: number; todayNew: number }>("/api/notices/stats")
      .then((data) => setNoticeStats({ active: data.active, todayNew: data.todayNew ?? 0 }))
      .catch(() => {});
    // 复用现有 /api/notices/countries 取国家数量
    api<Array<{ country: string; count: number }>>("/api/notices/countries")
      .then((data) => setCountryCount(data.length))
      .catch(() => {});
    // 复用现有 /api/suppliers 取供应商总数
    api<{ total: number }>("/api/suppliers?page=1&pageSize=1")
      .then((data) => setSupplierTotal(data.total ?? 0))
      .catch(() => {});
  };

  useEffect(() => {
    fetchStats();
    const timer = setInterval(fetchStats, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const stats = [
    { label: "采购机会总量", value: noticeStats?.active ?? 0, sub: "未过期可投标", icon: Globe, color: "text-teal-600" },
    { label: "今日新增", value: noticeStats?.todayNew ?? 0, sub: "实时更新", icon: TrendingUp, color: "text-blue-600" },
    { label: "覆盖国家 / 地区", value: countryCount, sub: "政府 & 国际组织", icon: Search, color: "text-purple-600" },
    { label: "供应商", value: supplierTotal, sub: "已入驻平台", icon: Building2, color: "text-amber-600" },
    { label: "海外展厅 / 履约节点", value: 16, sub: "全球布局", icon: Users, color: "text-rose-600" },
  ];

  return (
    <section className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-200 py-10 px-4">
      <div className="px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
        {stats.map((s, i) => (
          <StatCard key={i} {...s} />
        ))}
      </div>
    </section>
  );
}

/** 三栏卡片共用的宽表字段口径（与列表页 NoticeCard 一致） */
interface HomeNoticeItem {
  id: number; title: string; country: string; estimated_value: string; deadline_sec: number | null;
  title_i18n?: string; title_en?: string; agency?: string; agency_i18n?: string;
}

/** 三栏内容区 — 热门商机 / 优质供应商 / RFQ 需求 */
function ContentColumns() {
  const { locale } = useLocale();
  const [suppliers, setSuppliers] = useState<Array<{
    id: string; nameZh: string; countryZh: string; cityZh: string; complianceLabelsZh: string[];
  }>>([]);
  const [hotNotices, setHotNotices] = useState<HomeNoticeItem[]>([]);
  const [rfqNotices, setRfqNotices] = useState<HomeNoticeItem[]>([]);

  // 与 NoticeCard 相同的宽表字段回退链：本地化标题 / 机构 i18n / 国家 中文名
  const displayTitle = (n: HomeNoticeItem) => n.title_i18n || n.title_en || n.title;
  const displayAgency = (n: HomeNoticeItem) => n.agency_i18n || n.agency || "";
  const displayCountry = (n: HomeNoticeItem) => getCountryDisplayName(n.country, locale);
  const displayBudget = (n: HomeNoticeItem) =>
    n.estimated_value && n.estimated_value !== "0.00"
      ? `USD ${Number(n.estimated_value).toLocaleString()}`
      : "预算详谈";
  // 兜底显示：宽表 NULLIF 后 deadline_sec 可能为 null；正常数据已被 deadline_from 过滤为未截止。
  // 超长截止（框架协议/动态采购系统可达数年）显示具体日期，避免"截止 2154 天"式观感（规划 §8 数据质量）
  const deadlineLabel = (n: HomeNoticeItem) => {
    if (!n.deadline_sec || n.deadline_sec <= 0) return "无截止日期";
    const left = Math.ceil((new Date(n.deadline_sec * 1000).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (left <= 0) return "已截止";
    if (left > 365) {
      const d = new Date(n.deadline_sec * 1000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} 截止`;
    }
    return `截止 ${left} 天`;
  };

  useEffect(() => {
    // 获取已审核的优质供应商（最新 3 条）
    api<{ items: Array<{ id: string; nameZh: string; countryZh: string; cityZh: string; complianceLabelsZh: string[] }> }>("/api/suppliers?page=1&pageSize=3&sort=latest")
      .then((data) => setSuppliers(data.items ?? []))
      .catch(() => {});

    // 热门商机：仅取运营精选（is_featured=1），与主流列表同管道（统一搜索 → Meili → 宽表详情）；
    // deadline_from=北京时区今天 排除过期/无截止，首页只推可行动机会
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    api<{ items: HomeNoticeItem[] }>(`/api/notices/unified-search?page=1&page_size=3&featured=1&sort=newest&deadline_from=${today}`)
      .then((data) => setHotNotices((data.items ?? []).slice(0, 3)))
      .catch(() => {});

    // 获取最新 RFQ 询价类公告（统一搜索 notice_type=RFQ，2026-09-06 起真数据渲染）
    api<{ items: HomeNoticeItem[] }>(`/api/notices/unified-search?page=1&page_size=3&notice_type=RFQ&sort=newest&deadline_from=${today}`)
      .then((data) => setRfqNotices((data.items ?? []).slice(0, 3)))
      .catch(() => {});
  }, []);

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 热门商机 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <Globe className="w-5 h-5 text-teal-600" />
              今日热门商机
            </h3>
            <a href="/procurement" className="text-xs text-teal-600 font-bold hover:underline">
              查看全部 →
            </a>
          </div>
          <div className="space-y-4">
            {hotNotices.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">暂无今日精选商机</div>
            ) : (
              hotNotices.map((notice) => {
                const budget = displayBudget(notice);
                return (
                  <a key={notice.id} href={`/procurement?notice_id=${notice.id}`} className="block group">
                    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="shrink-0 w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                        <Globe className="w-4 h-4 text-teal-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 group-hover:text-teal-700 transition-colors line-clamp-2">
                          {displayTitle(notice)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 truncate">
                          {[displayAgency(notice), displayCountry(notice)].filter(Boolean).join(" · ")}
                        </p>
                        <div className="flex items-center justify-between mt-1 text-xs">
                          <span className="font-semibold text-slate-700">{budget}</span>
                          <span className="text-amber-600">{deadlineLabel(notice)}</span>
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })
            )}
          </div>
        </div>

        {/* 优质供应商 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              优质供应商推荐
            </h3>
            <a href="/supplier" className="text-xs text-teal-600 font-bold hover:underline">
              查看全部 →
            </a>
          </div>
          <div className="space-y-4">
            {suppliers.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">加载中...</div>
            ) : (
              suppliers.map((supplier) => (
                <a key={supplier.id} href={`/supplier?id=${supplier.id}`} className="block group">
                  <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 group-hover:text-blue-700 transition-colors truncate">
                        {supplier.nameZh}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{supplier.countryZh} · {supplier.cityZh}</p>
                      {supplier.complianceLabelsZh && supplier.complianceLabelsZh.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {supplier.complianceLabelsZh.slice(0, 3).map((label, j) => (
                            <span key={j} className="text-2xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>

        {/* 最新 RFQ 询价公告（真数据：统一搜索 notice_type=RFQ） */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-amber-600" />
              最新 RFQ 询价
            </h3>
            <a href="/procurement?notice_type=RFQ" className="text-xs text-teal-600 font-bold hover:underline">
              查看全部 →
            </a>
          </div>
          <div className="space-y-4 flex-1">
            {rfqNotices.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">暂无 RFQ 询价公告</div>
            ) : (
              rfqNotices.map((notice) => {
                const budget = displayBudget(notice);
                return (
                  <a key={notice.id} href={`/procurement?notice_id=${notice.id}`} className="block group">
                    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                        <Search className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-2xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
                            询价公告 (RFQ)
                          </span>
                        </div>
                        <p className="text-sm font-bold text-slate-800 group-hover:text-amber-700 transition-colors line-clamp-2">
                          {displayTitle(notice)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 truncate">
                          {[displayAgency(notice), displayCountry(notice)].filter(Boolean).join(" · ")}
                        </p>
                        <div className="flex items-center justify-between mt-1 text-xs">
                          <span className="font-semibold text-slate-700">{budget}</span>
                          <span className="text-amber-600">{deadlineLabel(notice)}</span>
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })
            )}
          </div>
          {/* 采购方发布需求入口（规划模块13的转化入口） */}
          <a
            href="/rfq"
            className="mt-4 flex items-center justify-center gap-1.5 border border-dashed border-amber-300 hover:border-amber-400 hover:bg-amber-50 rounded-lg py-2.5 text-xs font-bold text-amber-700 transition-colors"
          >
            我是采购方，免费发布询价需求 →
          </a>
        </div>
      </div>
    </section>
  );
}

/** 会员升级横幅（占位） */
function UpgradeBanner() {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-6">
      <div className="bg-gradient-to-r from-amber-50 to-teal-50 rounded-2xl border border-amber-200 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Crown className="w-10 h-10 text-amber-500" />
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">升级会员，解锁更多商机与供应商资源</h3>
            <p className="text-sm text-slate-600">更早发现 · 更全数据 · 更高转化</p>
          </div>
        </div>
        <a
          href="/membership"
          className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors whitespace-nowrap"
        >
          立即升级会员
        </a>
      </div>
    </section>
  );
}

export default function PageClient() {
  return (
    <div className="min-h-screen bg-slate-50">
      <HeroSection />
      <StatsWall />
      <WorldMapSection />
      <ContentColumns />
      <UpgradeBanner />
    </div>
  );
}

/** 全球商机地图区块 */
function WorldMapSection() {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
          <Globe className="w-5 h-5 text-teal-600" />
          全球商机分布
        </h2>
        <p className="text-sm text-slate-500 mt-1">鼠标悬停查看各国未过期商机数量</p>
      </div>
      <WorldMapChart />
    </section>
  );
}
