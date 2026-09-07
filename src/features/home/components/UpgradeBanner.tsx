/**
 * 会员升级横幅 — 根据登录态差异化 CTA
 * Upgrade Banner — Login-state-aware CTA
 *
 * @module features/home/components/UpgradeBanner
 * @description 未登录 → 注册引导；免费用户 → 升级引导；
 *              付费会员 → 续费/升级提示。
 */
import { useState, useEffect } from "react";
import { Crown } from "lucide-react";
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";

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
      <section className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-gradient-to-r from-teal-50 to-blue-50 rounded-2xl border border-teal-200 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Crown className="w-10 h-10 text-teal-500" />
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">注册解锁更多商机与供应商资源</h3>
              <p className="text-sm text-slate-600">收藏保存 · 订阅提醒 · 优先查看</p>
            </div>
          </div>
          <a
            href="/membership"
            className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors whitespace-nowrap"
          >
            免费注册
          </a>
        </div>
      </section>
    );
  }

  // 付费会员：续费/升级提示
  if (authUser && planName) {
    return (
      <section className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Crown className="w-10 h-10 text-amber-500" />
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">当前套餐：{planName}</h3>
              <p className="text-sm text-slate-600">续费或升级套餐，解锁更多权益</p>
            </div>
          </div>
          <a
            href="/membership"
            className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors whitespace-nowrap"
          >
            管理套餐
          </a>
        </div>
      </section>
    );
  }

  // 免费用户（默认）：升级引导
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
