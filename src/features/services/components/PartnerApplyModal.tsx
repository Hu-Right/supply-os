/**
 * 生态伙伴入驻申请弹窗
 * Eco Partner Application Modal
 *
 * @module features/services/components/PartnerApplyModal
 * @description 伙伴侧入驻意向申请（承接自发报名；邀约伙伴走线下），
 *              POST /api/leads type=partner_application（免登录，服务端白名单）。
 *              申请进 CRM 线索池，资质三件套（营业执照/能力证明/区域核实）人工审核后
 *              才落 eco_partner 表上架——宁缺毋假。
 */

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useLocale } from "@/core/i18n";
import { FormModal, Button, Textarea } from "@/shared/ui";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/shared/ui/Form";
import { api } from "@/core/http";
import { ECO_PARTNER_CATEGORIES } from "@/data/services";

export interface PartnerApplyModalProps {
  onClose: () => void;
}

interface ApplyFormData {
  companyName: string;
  contactPerson: string;
  contactMethod: string;
  category: string;
  regions: string;
  intro: string;
}

export function PartnerApplyModal({ onClose }: PartnerApplyModalProps) {
  const { t } = useLocale();
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<ApplyFormData>({
    defaultValues: { companyName: "", contactPerson: "", contactMethod: "", category: "", regions: "", intro: "" },
  });
  const { handleSubmit, formState: { isSubmitting } } = form;

  const onSubmit = handleSubmit(async (data) => {
    try {
      const categoryLabel =
        ECO_PARTNER_CATEGORIES.find((c) => c.key === data.category)?.label ?? data.category;
      await api<{ success: boolean }>("/api/leads", {
        method: "POST",
        body: {
          companyName: data.companyName,
          contactPerson: data.contactPerson,
          contactMethod: data.contactMethod,
          notes: `[${t("svcApplyTag")}] ${t("svcApplyCategory")}：${categoryLabel}${data.regions ? ` / ${t("svcApplyRegions")}：${data.regions}` : ""}${data.intro ? ` / ${data.intro}` : ""}`,
          type: "partner_application",
          industry: "Services",
          partnerCategory: data.category,
        } as unknown as BodyInit,
      });
      setSubmitted(true);
      window.setTimeout(onClose, 2200);
    } catch {
      toast.error(t("consultSubmitFail"));
    }
  });

  const inputCls =
    "w-full px-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500";

  return (
    <FormModal
      open
      onClose={onClose}
      closeOnBackdrop={false}
      title={t("svcApplyTitle")}
      submitted={submitted}
      successView={
        <div className="space-y-3">
          <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800">{t("svcApplyDoneTitle")}</h4>
          <p className="text-xs text-slate-500">{t("svcApplyDoneDesc")}</p>
        </div>
      }
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField
            name="companyName"
            rules={{ required: t("formError") }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("formConsultCompany")}</FormLabel>
                <FormControl>
                  <input type="text" placeholder={t("consultCompanyPlaceholder")} className={inputCls} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="contactPerson"
            rules={{ required: t("formError") }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("consultFormContactName")}</FormLabel>
                <FormControl>
                  <input type="text" placeholder={t("consultPersonPlaceholder")} className={inputCls} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="contactMethod"
            rules={{ required: t("formError") }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("consultFormPhone")}</FormLabel>
                <FormControl>
                  <input type="text" placeholder={t("consultPhonePlaceholder")} className={inputCls} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="category"
            rules={{ required: t("formError") }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("svcApplyCategory")}</FormLabel>
                <FormControl>
                  <select className={inputCls} {...field}>
                    <option value="" disabled>——</option>
                    {ECO_PARTNER_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="regions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("svcApplyRegions")}</FormLabel>
                <FormControl>
                  <input type="text" className={inputCls} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="intro"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("svcApplyIntro")}</FormLabel>
                <FormControl>
                  <Textarea rows={2} className={inputCls} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="dark" size="sm" loading={isSubmitting}>
              {t("svcApplySubmit")}
            </Button>
          </div>
        </form>
      </Form>
    </FormModal>
  );
}

PartnerApplyModal.displayName = "PartnerApplyModal";
