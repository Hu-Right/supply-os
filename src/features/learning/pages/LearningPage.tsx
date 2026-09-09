/**
 * 学习中心页面（资料库 + 研修班）
 * Learning Center Page — Materials Library + Training Workshop
 *
 * @module features/learning/pages/LearningPage
 * @description 上下布局：资料列表+套餐+FAQ 在上，研修班入口卡片在下
 */

import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";
import { toast } from "sonner";
import { FAQS } from "@/data";
import { MaterialCard } from "../components/MaterialCard";
import { FAQPanel } from "../components/FAQPanel";
import { useLearningMaterials, type ApiBundle } from "../hooks/useLearningMaterials";
import type { LearningMaterial } from "@/types";
import { emitAppEvent, type PayEventDetail } from "@/core/events";
import { GraduationCap, Calendar, Users, Award } from "lucide-react";

export default function LearningPage() {
  const { t, locale } = useLocale();
  const { authUser } = useAuth();
  const router = useRouter();
  const { materials, bundles, purchasedIds, loading, refreshPurchased, bumpDownloadCount } = useLearningMaterials();

  // premium 资料的 fileUrl 不随列表下发（审查 F4）：为空时按需向
  // /content 端点获取（服务端校验登录 + 购买记录）
  const handleDownload = async (fileUrl: string, fileName: string, materialId: string) => {
    let url = fileUrl;
    let name = fileName;
    if (!url) {
      try {
        const data = await api<{ fileUrl: string; fileName: string }>(
          `/api/learning/materials/${encodeURIComponent(materialId)}/content`,
        );
        url = data.fileUrl;
        name = data.fileName || name;
      } catch {
        // 付费资料获取失败必须可见（E2）：此前仅 console 静默，用户无感知
        console.error("[learning] 获取下载地址失败");
        toast.error("获取下载地址失败，请稍后重试或联系客服");
        return;
      }
    }
    if (!url) {
      toast.error("该资料暂无可下载文件，请稍后重试或联系客服");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    void api("/api/training/downloads/track", {
      method: "POST",
      body: { material_id: materialId, file_name: name },
    })
      .then(() => bumpDownloadCount(materialId))
      .catch(() => {});
  };

  const handleBuyMaterial = (material: LearningMaterial) => {
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    emitAppEvent("supply-os:pay", {
      code: `material_${material.id}`,
      name: material.titleZh,
      price: material.price ?? 0,
      currency: "CNY",
    });
  };

  const handleBuyBundle = (bundle: ApiBundle) => {
    if (!authUser) {
      emitAppEvent("supply-os:require-login");
      return;
    }
    emitAppEvent("supply-os:pay", {
      code: `bundle_${bundle.id}`,
      name: bundle.labelZh,
      price: bundle.price,
      currency: "CNY",
    } as PayEventDetail);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ══ 资料库 ═══ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-8">
          <div>
            <h3 className="text-base font-extrabold text-slate-800">
              {t("learningSectionTitle")}
            </h3>
            <p className="mt-1 text-xs text-slate-500">{t("learningSectionDesc")}</p>
          </div>

          <div className="space-y-4">
            {materials.map((lm) => (
              <MaterialCard
                key={lm.id}
                material={lm}
                isPurchased={purchasedIds.has(lm.id)}
                onDownload={handleDownload}
                onBuyMaterial={handleBuyMaterial}
              />
            ))}
          </div>

          {/* 打包购买区域 */}
          {bundles.length > 0 && (
            <div className="rounded-xl border-2 border-dashed border-teal-200 bg-teal-50/50 p-4">
              <h4 className="text-sm font-extrabold text-teal-800 mb-3">{t("learningBundleTitle")}</h4>
              <div className="space-y-2">
                {bundles.map((bundle) => (
                  <Button
                    key={bundle.id}
                    onClick={() => handleBuyBundle(bundle)}
                    variant="outline"
                    className="w-full justify-between rounded-lg border-teal-200 bg-white px-4 py-3 text-sm font-normal hover:border-teal-400 hover:bg-white hover:shadow-sm transition-all cursor-pointer"
                  >
                    <span className="font-bold text-slate-800">{bundle.labelZh}</span>
                    <span className="shrink-0 ml-3 rounded-full bg-teal-600 px-3 py-1 text-xs font-black text-white">
                      ¥{bundle.price.toFixed(1)}
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6 lg:col-span-4">
          <FAQPanel faqs={FAQS} />
        </div>
      </div>

      {/* ══ 研修班入口 ═══ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center shrink-0">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">国际公共采购研修班</h2>
            <p className="text-sm text-slate-500 mt-1">系统学习联合国采购全流程，从入门到中标实战</p>
          </div>
        </div>

        {/* 课程亮点 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { icon: Calendar, label: "线下+线上", desc: "灵活参训方式" },
            { icon: Users, label: "小班授课", desc: "1对1顾问辅导" },
            { icon: Award, label: "结业证书", desc: "行业认可资质" },
            { icon: GraduationCap, label: "实战案例", desc: "真实中标复盘" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="bg-slate-50 rounded-xl p-4 text-center">
                <Icon className="w-6 h-6 text-teal-600 mx-auto mb-2" />
                <div className="text-sm font-bold text-slate-800">{item.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
              </div>
            );
          })}
        </div>

        {/* 课程大纲预览 */}
        <div className="bg-slate-50 rounded-xl p-5 mb-6">
          <h4 className="text-sm font-extrabold text-slate-800 mb-3">课程大纲</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-600">
            {[
              "UNGM 注册与资质升级",
              "UNSPSC 编码匹配实务",
              "招标文件解读与响应",
              "标书制作与翻译要点",
              "国际商务谈判技巧",
              "中标后履约与物流",
            ].map((topic) => (
              <div key={topic} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                {topic}
              </div>
            ))}
          </div>
        </div>

        {/* CTA 按钮 */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => router.push("/training")}
            variant="primary"
            className="flex-1 py-3 text-sm font-bold"
          >
            查看完整课程详情 →
          </Button>
          <Button
            onClick={() => emitAppEvent("supply-os:consult")}
            variant="outline"
            className="flex-1 py-3 text-sm font-bold"
          >
            咨询课程顾问
          </Button>
        </div>
      </div>
    </div>
  );
}

LearningPage.displayName = "LearningPage";
