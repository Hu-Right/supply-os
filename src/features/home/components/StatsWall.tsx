/**
 * 实时数字墙 — 6 个规模指标
 * Stats Wall — 6 Real-time Scale Indicators
 *
 * @module features/home/components/StatsWall
 * @description 调用现有 API 获取统计数字，10 分钟自动刷新，
 *              每个指标带数字跳动动画。
 */
import { useState, useEffect } from "react";
import { Search, Building2, Globe, Users, TrendingUp, ShieldCheck } from "lucide-react";
import { api } from "@/core/http";
import { useCountUp } from "../hooks/useCountUp";

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
export function StatsWall() {
  const [noticeStats, setNoticeStats] = useState<{
    active: number; todayNew: number;
  } | null>(null);
  const [countryCount, setCountryCount] = useState(0);
  const [supplierTotal, setSupplierTotal] = useState(0);
  const [certifiedCount, setCertifiedCount] = useState(0);

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
    // 认证供应商数量
    api<{ total: number }>("/api/suppliers?page=1&pageSize=1&status=approved")
      .then((data) => setCertifiedCount(data.total ?? 0))
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
    { label: "认证供应商", value: certifiedCount, sub: "已核验资质", icon: ShieldCheck, color: "text-emerald-600" },
    { label: "海外展厅 / 履约节点", value: 16, sub: "全球布局", icon: Users, color: "text-rose-600" },
  ];

  return (
    <section className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-200 py-10 px-4">
      <div className="px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
        {stats.map((s, i) => (
          <StatCard key={i} {...s} />
        ))}
      </div>
    </section>
  );
}
