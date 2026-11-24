/**
 * 生态伙伴服务询盘弹窗
 * Eco Partner Service Inquiry Modal
 *
 * @module features/services/components/PartnerInquiryModal
 * @description 用户侧结构化询盘：预填目标伙伴（slug/category 落 leads.extra 供运营分派），
 *              POST /api/leads type=eco_partner_inquiry。登录态提交（未登录由服务端 401，
 *              前端 toast 提示），行为与全局咨询弹窗一致。
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
import type { EcoPartner } from "../api";

export interface PartnerInquiryModalProps {
  partner: EcoPartner;
  onClose: () => void;
}

interface InquiryFormData {
  companyName: string;
  contactPerson: string;
  contactMethod: string;
  region: string;
  needs: string;
}

export function PartnerInquiryModal({ partner, onClose }: PartnerInquiryModalProps) {
  const { t } = useLocale();
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<InquiryFormData>({
    defaultValues: { companyName: "", contactPerson: "", contactMethod: "", region: "", needs: "" },
  });
  const { handleSubmit, formState: { isSubmitting } } = form;

  const onSubmit = handleSubmit(async (data) => {
    try {
      const regionSuffix = data.region ? `（${t("svcInquiryRegion")}：${data.region}）` : "";
      await api<{ success: boolean }>("/api/leads", {
        method: "POST",
        body: {
          companyName: data.companyName,
          contactPerson: data.contactPerson,
          contactMethod: data.contactMethod,
          notes: `[${t("svcInquiryTag")}·${partner.name}] ${data.needs}${regionSuffix}`,
          type: "eco_partner_inquiry",
          industry: "Services",
          // 伙伴维度进 leads.extra（partner_id/partner_category），CRM 侧按此分派转介
          partnerId: partner.slug,
          partnerCategory: partner.category,
        } as unknown as BodyInit,
      });
      setSubmitted(true);
      window.setTimeout(onClose, 2200);
    } catch {
      toast.error(t("consultSubmitFail"));
    }
  });

  const inputCls =
    "w-full px-3 py-1.5 text-xs bg-slate-50 rounded-lg border border-slate-200 focus:ring-1 focus:ring-teal-500";

  return (
    <FormModal
      open
      onClose={onClose}
      closeOnBackdrop={false}
      title={t("svcInquiryTitle")}
      submitted={submitted}
      successView={
        <div className="space-y-3">
          <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800">{t("svcInquiryDoneTitle")}</h4>
          <p className="text-xs text-slate-500">{t("svcInquiryDoneDesc")}</p>
        </div>
      }
    >
      {/* 咨询对象（只读展示，提交时随 extra 落库） */}
      <div className="mb-3 flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2">
        <span className="text-xs font-bold text-slate-500">{t("svcInquiryTarget")}</span>
        <span className="text-xs font-extrabold text-teal-700">{partner.name}</span>
      </div>

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
            name="region"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("svcInquiryRegion")}</FormLabel>
                <FormControl>
                  <input type="text" className={inputCls} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="needs"
            rules={{ required: t("formError") }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("svcInquiryNeeds")}</FormLabel>
                <FormControl>
                  <Textarea rows={3} className={inputCls} {...field} />
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
              {t("svcInquirySubmit")}
            </Button>
          </div>
        </form>
      </Form>
    </FormModal>
  );
}

PartnerInquiryModal.displayName = "PartnerInquiryModal";
