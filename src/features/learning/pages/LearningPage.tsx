/**
 * 联合国采购与国际投标学习区
 * Learning Center Page
 *
 * @module features/learning/pages/LearningPage
 * @description 资料卡片网格(3×2) + FAQ。
 *              从数据库 API 加载资料和已购状态。
 */
import { useAuth } from "@/core/auth";
import { api } from "@/core/http";
import { toast } from "sonner";
import { FAQS } from "../constants";
import {
  BookOpen, FileText, Shield, Award, GraduationCap, Globe,
  ArrowRight, Lock,
} from "lucide-react";
import { FAQPanel } from "../components/FAQPanel";
import { useLearningMaterials } from "../hooks/useLearningMaterials";
import type { LearningMaterial } from "@/types";
import { emitAppEvent } from "@/core/events";

/** 分类 → 图标与配色映射 */
const CATEGORY_STYLE: Record<string, { icon: typeof BookOpen; tagColor: string; iconColor: string }> = {
  "指南": { icon: BookOpen, tagColor: "bg-teal-50 text-teal-700 border-teal-200", iconColor: "text-blue-600" },
  "模板": { icon: FileText, tagColor: "bg-blue-50 text-blue-700 border-blue-200", iconColor: "text-indigo-600" },
  "合规": { icon: Shield, tagColor: "bg-amber-50 text-amber-700 border-amber-200", iconColor: "text-emerald-600" },
  "案例": { icon: Award, tagColor: "bg-purple-50 text-purple-700 border-purple-200", iconColor: "text-rose-600" },
  "知识": { icon: GraduationCap, tagColor: "bg-rose-50 text-rose-700 border-rose-200", iconColor: "text-purple-600" },
  "资源": { icon: Globe, tagColor: "bg-emerald-50 text-emerald-700 border-emerald-200", iconColor: "text-teal-600" },
};

const DEFAULT_STYLE = { icon: FileText, tagColor: "bg-slate-50 text-slate-700 border-slate-200", iconColor: "text-slate-600" };

/** 根据资料属性生成访问权限文案 */
function getAccessLabel(material: LearningMaterial): string {
  if (material.price === 0 || !material.isPremium) return "免费预览 | 会员下载";
  if (material.price && material.price > 0) return `专业版 ¥${material.price.toFixed(0)}`;
  return "会员专享";
}

export default function LearningPage() {
  const { authUser } = useAuth();
  const { materials, purchasedIds, loading, bumpDownloadCount } = useLearningMaterials();

  const handleDownload = async (material: LearningMaterial) => {
    let url = material.fileUrl;
    let name = material.fileName || material.titleZh;
    if (!url) {
      try {
        const data = await api<{ fileUrl: string; fileName: string }>(
          `/api/learning/materials/${encodeURIComponent(material.id)}/content`,
        );
        url = data.fileUrl;
        name = data.fileName || name;
      } catch {
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
      body: { material_id: material.id, file_name: name },
    })
      .then(() => bumpDownloadCount(material.id))
      .catch((err) => console.warn("[LearningPage] 下载追踪上报失败:", err));
  };

  const handleBuyMaterial = (material: LearningMaterial) => {
    if (!authUser) { emitAppEvent("supply-os:require-login"); return; }
    emitAppEvent("supply-os:pay", {
      code: `material_${material.id}`, name: material.titleZh, price: material.price ?? 0, currency: "CNY",
    });
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
      {/* ══ 资料卡片网格 ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {materials.map((lm) => {
          const style = CATEGORY_STYLE[lm.categoryZh] || DEFAULT_STYLE;
          const Icon = style.icon;
          const access = getAccessLabel(lm);
          const isPurchased = purchasedIds.has(lm.id);
          const isLocked = lm.isPremium && !isPurchased;

          return (
            <div key={lm.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className={`px-2 py-0.5 rounded border text-2xs font-bold ${style.tagColor}`}>
                  {lm.categoryZh || "资料"}
                </span>
                <Icon className={`w-8 h-8 ${style.iconColor} opacity-70`} />
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 mb-1">《{lm.titleZh}》</h3>
              <p className="text-2xs text-slate-400 mb-2 flex items-center gap-1">
                {isLocked && <Lock className="w-3 h-3" />}
                {access}
              </p>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">{lm.summaryZh}</p>
              <div className="flex items-center gap-1 text-xs font-bold text-teal-600">
                <button
                  type="button"
                  onClick={() => isLocked ? handleBuyMaterial(lm) : handleDownload(lm)}
                  className="hover:underline cursor-pointer"
                >
                  {isLocked ? "会员解锁" : "阅读下载"}
                </button>
                <ArrowRight className="w-3 h-3" />
                <span className="text-slate-400 font-medium">同类采购机会</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ══ FAQ ═══ */}
      <FAQPanel faqs={FAQS} />
    </div>
  );
}

LearningPage.displayName = "LearningPage";
