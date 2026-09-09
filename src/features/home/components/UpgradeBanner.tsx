/**
 * 会员升级横幅 — 根据登录态差异化 CTA
 * Upgrade Banner — Login-state-aware CTA
 *
 * @module features/home/components/UpgradeBanner
 * @description 深色背景 + 皇冠 + 4权益点 + 金色CTA按钮。
 *              根据登录态差异化：未登录→注册，免费→升级，付费→管理。
 */
import { memo } from "react";
import {
  Crown, Search, Unlock, Filter, ArrowRight,
} from "lucide-react";
import { useAuth } from "@/core/auth";
import { useMembershipStatus } from "@/features/membership";

/** 会员升级横幅（根据登录态差异化） */
export const UpgradeBanner = memo(function UpgradeBanner() {
  const { authUser, authReady } = useAuth();
  const planName = useMembershipStatus(!!authUser);

  // 未登录：注册引导
  if (authReady && !authUser) {
    return (
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
    );
  }

  // 付费会员：管理套餐
  if (authUser && planName) {
    return (
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
    );
  }

  // 免费用户（默认）：升级引导 — 深色背景 + 皇冠 + 4权益点 + 金色CTA
  return (
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
  );
});
