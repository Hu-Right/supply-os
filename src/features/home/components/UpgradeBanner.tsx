/**
 * 会员升级横幅 — 100% 还原设计图
 * Upgrade Banner — 100% Design Mockup
 *
 * @module features/home/components/UpgradeBanner
 * @description 深色背景 + 皇冠 + 4权益点 + 金色CTA按钮。
 *              根据登录态差异化：未登录→注册，免费→升级，付费→管理。
 */
import { useState, useEffect } from "react";
import {
  Crown, Search, Unlock, Filter, ArrowRight,
  Star, Bell, FileText, Building2, Code, Headphones, Globe,
  Eye, TrendingUp, Shield,
} from "lucide-react";
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";

/** 变现动作卡片数据 */
const MONETIZATION_ACTIONS = [
  { icon: Eye, title: "注册", desc: "快速注册获取更多权限" },
  { icon: Star, title: "收藏与提醒", desc: "收藏商机/供应商订阅更新提醒" },
  { icon: FileText, title: "单条解锁", desc: "单条商机付费解锁查看详细信息" },
  { icon: Crown, title: "会员升级", desc: "解锁更多商机、联系方式与高级功能" },
  { icon: Building2, title: "企业版", desc: "多账号协作、数据导出与深度服务" },
  { icon: Code, title: "API", desc: "数据对接与集成支持企业系统" },
  { icon: Headphones, title: "顾问服务", desc: "投标辅导、合规咨询与本地化服务" },
  { icon: Globe, title: "海外展厅入驻", desc: "展示企业与产品获取海外询盘" },
];

/** 页面价值卡片数据 */
const PAGE_VALUES = [
  {
    icon: Eye,
    title: "10秒看懂平台",
    desc: "有大量商机与供应商资源",
    sub: "用数据 + 内容组合，快速建立信任",
  },
  {
    icon: TrendingUp,
    title: "让流量先搜索，再注册，再升级付费",
    desc: "搜索满足需求，注册沉淀，升级变现",
    sub: "",
  },
  {
    icon: Shield,
    title: "首页直接承担获客、转化与品牌信任三重任务",
    desc: "集规模展示、价值传递与变现转化于一体",
    sub: "",
  },
];

/** 会员升级横幅（根据登录态差异化） */
export function UpgradeBanner() {
  const { authUser, authReady } = useAuth();
  const [planName, setPlanName] = useState<string | null>(null);

  useEffect(() => {
    if (!authUser) return;
    api<{ current_plan_name: string | null }>("/api/membership/status")
      .then((data) => setPlanName(data.current_plan_name))
      .catch(() => {});
  }, [authUser]);

  // 未登录：注册引导
  if (authReady && !authUser) {
    return (
      <>
        <section className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Crown className="w-12 h-12 text-amber-400" />
              <div>
                <h3 className="text-lg font-extrabold text-white">注册解锁更多商机与供应商资源</h3>
                <p className="text-sm text-slate-300">更早发现 · 更全数据 · 更高转化</p>
              </div>
            </div>
            <a href="/membership" className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors whitespace-nowrap">
              免费注册
            </a>
          </div>
        </section>
        {/* 变现动作 */}
        <MonetizationSection />
        {/* 页面价值 */}
        <PageValueSection />
      </>
    );
  }

  // 付费会员：管理套餐
  if (authUser && planName) {
    return (
      <>
        <section className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-amber-900 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Crown className="w-12 h-12 text-amber-400" />
              <div>
                <h3 className="text-lg font-extrabold text-white">当前套餐：{planName}</h3>
                <p className="text-sm text-slate-300">续费或升级套餐，解锁更多权益</p>
              </div>
            </div>
            <a href="/membership" className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors whitespace-nowrap">
              管理套餐
            </a>
          </div>
        </section>
        <MonetizationSection />
        <PageValueSection />
      </>
    );
  }

  // 免费用户（默认）：升级引导 — 100% 还原设计图
  return (
    <>
      <section className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 rounded-2xl p-6 md:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* 左侧：皇冠 + 文案 */}
            <div className="flex items-start gap-4">
              <Crown className="w-12 h-12 text-amber-400 shrink-0 mt-1" />
              <div>
                <h3 className="text-xl font-extrabold text-white mb-1">
                  升级会员，解锁更多商机与供应商资源
                </h3>
                <p className="text-sm text-slate-300">更早发现 · 更全数据 · 更高转化</p>
              </div>
            </div>
            {/* 右侧：4权益点 + CTA */}
            <div className="flex flex-col items-end gap-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {[
                  { icon: Search, label: "无限查看商机", sub: "全平台商机不限量查看" },
                  { icon: Unlock, label: "联系方式解锁", sub: "获取采购方联系方式" },
                  { icon: Filter, label: "高级筛选与导出", sub: "数据导出与自定义分析" },
                  { icon: Crown, label: "专属顾问服务", sub: "1对1投标辅导" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex items-start gap-2">
                      <Icon className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-white">{item.label}</p>
                        <p className="text-2xs text-slate-400">{item.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4">
                <a href="/membership" className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
                  了解会员权益 <ArrowRight className="w-3 h-3" />
                </a>
                <a href="/membership" className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors whitespace-nowrap shadow-lg shadow-amber-500/20">
                  立即升级会员
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* 变现动作 */}
      <MonetizationSection />
      {/* 页面价值 */}
      <PageValueSection />
    </>
  );
}

/** 变现动作区域 */
function MonetizationSection() {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-10">
      <div className="text-center mb-8">
        <h2 className="text-xl font-extrabold text-slate-900">变现动作</h2>
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="w-8 h-px bg-teal-500" />
          <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
          <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
          <span className="w-8 h-px bg-teal-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
        {MONETIZATION_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <div key={action.title} className="text-center group">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 mb-2 group-hover:bg-teal-50 transition-colors">
                <Icon className="w-5 h-5 text-slate-600 group-hover:text-teal-600 transition-colors" />
              </div>
              <p className="text-xs font-bold text-slate-900">{action.title}</p>
              <p className="text-2xs text-slate-400 mt-0.5 leading-tight">{action.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** 页面价值区域 */
function PageValueSection() {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-10 bg-slate-50">
      <div className="text-center mb-8">
        <h2 className="text-xl font-extrabold text-slate-900">页面价值</h2>
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="w-8 h-px bg-teal-500" />
          <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
          <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
          <span className="w-8 h-px bg-teal-500" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {PAGE_VALUES.map((v) => {
          const Icon = v.icon;
          return (
            <div key={v.title} className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-teal-50 mb-4">
                <Icon className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 mb-2">{v.title}</h3>
              <p className="text-xs text-slate-600 font-medium">{v.desc}</p>
              {v.sub && <p className="text-2xs text-slate-400 mt-1">{v.sub}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
