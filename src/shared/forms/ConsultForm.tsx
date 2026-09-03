/**
 * 咨询预约表单
 * Consultation Booking Form
 *
 * @module shared/forms/ConsultForm
 * @description 全局咨询预约弹窗，由 layout-shell 通过 supply-os:consult 事件唤起。
 *              提交后写入 CRM 线索（type: consulting_advisor），成功页 2.2 秒后自动关闭。
 *              使用 FormModal 外壳 + react-hook-form 表单组件集（迁移模式示范）。
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

export interface ConsultFormProps {
  onClose: () => void;
}

interface ConsultFormData {
  companyName: string;
  contactPerson: string;
  phone: string;
  notes: string;
}

export function ConsultForm({ onClose }: ConsultFormProps) {
  const { t } = useLocale();
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<ConsultFormData>({
    defaultValues: { companyName: "", contactPerson: "", phone: "", notes: "" },
  });
  const { handleSubmit, formState: { isSubmitting } } = form;

  const onSubmit = handleSubmit(async (data) => {
    try {
      await api<{ success: boolean }>("/api/leads", {
        method: "POST",
        body: {
          companyName: data.companyName,
          contactPerson: data.contactPerson,
          contactMethod: data.phone,
          notes: `[咨询顾问申请] ${data.notes}`,
          type: "consulting_advisor",
          industry: "Services",
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
      title={t("consultTitle")}
      submitted={submitted}
      successView={
        <div className="space-y-3">
          <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800">{t("consultBookedTitle")}</h4>
          <p className="text-xs text-slate-500">{t("consultBookedDesc")}</p>
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
                  <input
                    type="text"
                    placeholder={t("consultCompanyPlaceholder")}
                    className={inputCls}
                    {...field}
                  />
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
                  <input
                    type="text"
                    placeholder={t("consultPersonPlaceholder")}
                    className={inputCls}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="phone"
            rules={{ required: t("formError") }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("consultFormPhone")}</FormLabel>
                <FormControl>
                  <input
                    type="text"
                    placeholder={t("consultPhonePlaceholder")}
                    className={inputCls}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("formConsultNeeds")}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    placeholder={t("consultNotesPlaceholder")}
                    className={inputCls}
                    {...field}
                  />
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
              {t("consultSubmitBtn")}
            </Button>
          </div>
        </form>
      </Form>
    </FormModal>
  );
}
