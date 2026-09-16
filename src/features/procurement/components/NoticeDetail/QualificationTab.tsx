/**
 * 资格条件 Tab 内容
 * Qualification Tab Content
 *
 * @module features/procurement/components/NoticeDetail/QualificationTab
 * @description 展示供应商投标条件、资格要求与技术门槛。
 *              数据来自 notice.supplier_conditions / eligibility / technical_hurdles。
 */
import { ShieldCheck, FileCheck, Wrench } from "lucide-react";
import { useLocale } from "@/core/i18n";
import type { NoticeDetailItem } from "../../types";

interface QualificationTabProps {
  notice: NoticeDetailItem;
  /** 是否已解锁核心信息 */
  coreUnlocked: boolean;
}

/** 渲染一个条件区块 */
function ConditionBlock({
  icon: Icon,
  iconColor,
  title,
  content,
  emptyText,
}: {
  icon: typeof ShieldCheck;
  iconColor: string;
  title: string;
  content: string | undefined;
  emptyText: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-extrabold text-slate-900 mb-2 flex items-center gap-2">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        {title}
      </h4>
      {content && content !== "-" ? (
        <p className="text-sm text-slate-700 leading-7 whitespace-pre-line break-words">
          {content}
        </p>
      ) : (
        <p className="text-sm text-slate-400 italic">{emptyText}</p>
      )}
    </div>
  );
}

export function QualificationTab({ notice, coreUnlocked }: QualificationTabProps) {
  const { t } = useLocale();

  const supplierConditions = notice.supplier_conditions || "";
  const eligibility = notice.eligibility || "";
  const technicalHurdles = notice.technical_hurdles || "";
  const hasContent = supplierConditions || eligibility || technicalHurdles;

  // 未解锁：展示锁定提示
  if (!coreUnlocked) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 text-center">
        <p className="text-sm font-bold text-amber-700">
          {t("procurement_unlockToViewFull") || "解锁后查看完整资格条件"}
        </p>
      </section>
    );
  }

  if (!hasContent) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-slate-500">
          {t("procurement_noQualificationInfo") || "本公告暂无结构化资格条件信息，请参考原始招标文件。"}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h3 className="text-base font-extrabold text-slate-900">
        {t("detail_tabQualification") || "资格条件"}
      </h3>

      <ConditionBlock
        icon={ShieldCheck}
        iconColor="text-teal-600"
        title={t("procurement_supplierConditions") || "供应商投标条件"}
        content={supplierConditions}
        emptyText={t("procurement_noData") || "暂无数据"}
      />

      <ConditionBlock
        icon={FileCheck}
        iconColor="text-blue-600"
        title={t("procurement_eligibility") || "资格要求"}
        content={eligibility}
        emptyText={t("procurement_noData") || "暂无数据"}
      />

      <ConditionBlock
        icon={Wrench}
        iconColor="text-amber-600"
        title={t("procurement_technicalHurdles") || "技术门槛"}
        content={technicalHurdles}
        emptyText={t("procurement_noData") || "暂无数据"}
      />
    </section>
  );
}
