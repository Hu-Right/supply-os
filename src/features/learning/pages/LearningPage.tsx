/**
 * 知识中心页面 — 100% 还原设计图
 * Learning Center Page — Module 10 Design Mockup
 *
 * @module features/learning/pages/LearningPage
 * @description 深色页头 + 分类Tab + 6内容卡片 + 资料列表 + FAQ。
 *              从数据库 API 加载资料和已购状态。
 */
import { useState } from "react";
import { useLocale } from "@/core/i18n";
import { Button } from "@/shared/ui";
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";
import { toast } from "sonner";
import { FAQS } from "../constants";
import {
  BookOpen, FileText, Shield, Award, GraduationCap, Globe,
  ArrowRight, Lock,
} from "lucide-react";
import { MaterialCard } from "../components/MaterialCard";
import { FAQPanel } from "../components/FAQPanel";
import { useLearningMaterials, type ApiBundle } from "../hooks/useLearningMaterials";
import type { LearningMaterial } from "@/types";
import { emitAppEvent, type PayEventDetail } from "@/core/events";

/* ── 分类Tab ── */
const CATEGORIES = ["UNGM入驻", "UNSPSC", "平台规则", "投标模板", "国际合规", "案例拆解"];

/* ── 6内容卡片 ─ */
const CONTENT_CARDS = [
  {
    tag: "指南", tagColor: "bg-teal-50 text-teal-700 border-teal-200",
    icon: BookOpen, iconColor: "text-blue-600",
    title: "《UNGM中国供应商入驻白皮书》",
    access: "免费预览 | 会员下载",
    desc: "详解UNGM注册流程、材料清单与常见问题，助力快速入驻。",
  },
  {
    tag: "模板", tagColor: "bg-blue-50 text-blue-700 border-blue-200",
    icon: FileText, iconColor: "text-indigo-600",
    title: "《UNSPSC编码匹配实操表》",
    access: "专业版可下载",
    desc: "行业分类与编码匹配模板，提升投标文件标准化能力。",
  },
  {
    tag: "合规", tagColor: "bg-amber-50 text-amber-700 border-amber-200",
    icon: Shield, iconColor: "text-emerald-600",
    title: "《医疗设备国际公采合规清单》",
    access: "会员专享",
    desc: "汇总国际公采合规要点与认证要求，降低合规风险。",
  },
  {
    tag: "案例", tagColor: "bg-purple-50 text-purple-700 border-purple-200",
    icon: Award, iconColor: "text-rose-600",
    title: "《中标案例：从机会筛选到提交》",
    access: "部分免费",
    desc: "真实中标案例复盘，拆解策略、文件要点与时间管理。",
  },
  {
    tag: "知识", tagColor: "bg-rose-50 text-rose-700 border-rose-200",
    icon: GraduationCap, iconColor: "text-purple-600",
    title: "《国际公共采购常见保函条款》",
    access: "专业版",
    desc: "整理各类保函条款与注意事项，规避投标风险点。",
  },
  {
    tag: "资源", tagColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: Globe, iconColor: "text-teal-600",
    title: "《30个高频采购机构入口清单》",
    access: "会员专享",
    desc: "覆盖联合国机构、国际组织及多国政府采购平台入口。",
  },
];

export default function LearningPage() {
  const { t, locale } = useLocale();
  const { authUser } = useAuth();
  const [activeCategory, setActiveCategory] = useState("UNGM入驻");
  const { materials, bundles, purchasedIds, loading, refreshPurchased, bumpDownloadCount } = useLearningMaterials();

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
      .catch((err) => console.warn("[LearningPage] 下载追踪上报失败:", err));
  };

  const handleBuyMaterial = (material: LearningMaterial) => {
    if (!authUser) { emitAppEvent("supply-os:require-login"); return; }
    emitAppEvent("supply-os:pay", {
      code: `material_${material.id}`, name: material.titleZh, price: material.price ?? 0, currency: "CNY",
    });
  };

  const handleBuyBundle = (bundle: ApiBundle) => {
    if (!authUser) { emitAppEvent("supply-os:require-login"); return; }
    emitAppEvent("supply-os:pay", {
      code: `bundle_${bundle.id}`, name: bundle.labelZh, price: bundle.price, currency: "CNY",
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
      {/* ══ 深色页头 ═══ */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 rounded-2xl px-5 sm:px-6 py-8">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white">
          知识中心
          <span className="text-base font-bold text-slate-300 ml-2">|</span>
          <span className="text-base font-bold text-slate-300 ml-2">内容不是独立频道，而是SEO获客 + 会员转化入口</span>
        </h1>
        <p className="text-slate-400 text-sm mt-2 max-w-3xl">
          每篇文章都必须回流到相关采购机会、UNSPSC页面、服务与会员。
        </p>
      </section>

      {/* ══ 分类Tab ═══ */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
              activeCategory === cat
                ? "bg-teal-600 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:border-teal-300"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ══ 6内容卡片 ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {CONTENT_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className={`px-2 py-0.5 rounded border text-2xs font-bold ${card.tagColor}`}>{card.tag}</span>
                <Icon className={`w-8 h-8 ${card.iconColor} opacity-70`} />
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 mb-1">{card.title}</h3>
              <p className="text-2xs text-slate-400 mb-2 flex items-center gap-1">
                {card.access.includes("会员") || card.access.includes("专业") ? (
                  <Lock className="w-3 h-3" />
                ) : null}
                {card.access}
              </p>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">{card.desc}</p>
              <div className="flex items-center gap-1 text-xs font-bold text-teal-600">
                阅读 <ArrowRight className="w-3 h-3" /> 同类采购机会 <ArrowRight className="w-3 h-3" /> 会员解锁
              </div>
            </div>
          );
        })}
      </div>

      {/* ══ 资料列表 + FAQ（原有功能保留） ═══ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-8">
          <div>
            <h3 className="text-base font-extrabold text-slate-800">{t("learningSectionTitle")}</h3>
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
    </div>
  );
}

LearningPage.displayName = "LearningPage";
