/**
 * 供应商自助入驻弹窗
 * Supplier Self-Registration Modal
 *
 * @module features/supplier/components/SupplierRegisterModal
 * @description 供应商自助入驻表单弹窗，提交 POST /api/suppliers。
 *              FormModal 外壳 + react-hook-form（rules 校验 + FormMessage 错误展示）。
 */

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useLocale } from "@/core/i18n";
import { FormModal, Button, Input, Select } from "@/shared/ui";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/shared/ui/Form";
import { registerSupplier, type SupplierRegisterInput } from "../api";
import { emitAppEvent } from "@/core/events";

type SupplierRegisterModalProps = {
  onClose: () => void;
  onRegistered?: () => void;
};

const EMPTY_FORM: SupplierRegisterInput = {
  nameZh: "",
  nameEn: "",
  type: "domestic",
  industryZh: "机械",
  countryZh: "中国",
  cityZh: "",
  ungmCode: "",
  mainProductsZh: "",
  complianceLabelsZh: "ISO9001, CE认证",
  contactPerson: "",
  contactEmail: "",
  contactPhone: "",
};

export function SupplierRegisterModal({ onClose, onRegistered }: SupplierRegisterModalProps) {
  const { t } = useLocale();
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<SupplierRegisterInput>({ defaultValues: EMPTY_FORM });
  const { handleSubmit, setValue, formState: { isSubmitting } } = form;

  const onSubmit = handleSubmit(async (data) => {
    setError("");
    try {
      await registerSupplier(data);
      setSubmitted(true);
      onRegistered?.();
      emitAppEvent("supply-os:crm-refresh");
      setTimeout(() => onClose(), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("formError"));
    }
  });

  return (
    <FormModal
      open
      onClose={onClose}
      className="max-w-2xl"
      title={t("supplierRegTitle")}
      subtitle={t("supplierRegDesc")}
      submitted={submitted}
      successView={
        <div className="space-y-4">
          <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h4 className="text-base font-bold text-slate-800">{t("formSuccess")}</h4>
          <p className="text-xs text-slate-500">
            {t("supplierRegSuccessBefore")}
            <strong>pending</strong>
            {t("supplierRegSuccessAfter")}
          </p>
        </div>
      }
      bodyClassName="max-h-[60vh] overflow-y-auto"
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              name="nameZh"
              rules={{ required: t("formError") }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-extrabold">{t("supplierRegNameZhLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder={t("supplierNameZhPlaceholder")}
                      className="px-3 py-2 text-xs"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="nameEn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-extrabold">{t("supplierRegNameEnLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder={t("supplierNameEnPlaceholder")}
                      className="px-3 py-2 text-xs"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-extrabold">{t("supplierRegTypeLabel")}</FormLabel>
                  <FormControl>
                    <Select className="px-3 py-1.5 text-xs" {...field}>
                      <option value="domestic">{t("supplierTypeDomestic")}</option>
                      <option value="international">{t("supplierTypeIntl")}</option>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="ungmCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-extrabold">{t("supplierRegUngmLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder={t("supplierUnspscPlaceholder")}
                      className="px-3 py-2 text-xs"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="industryZh"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-extrabold">{t("supplierRegIndustryLabel")}</FormLabel>
                  <FormControl>
                    <Select className="px-3 py-1.5 text-xs" {...field}>
                      <option value="机械">{t("industryOptionMachinery")}</option>
                      <option value="电子">{t("industryOptionElectronics")}</option>
                      <option value="建材">{t("industryOptionConstruction")}</option>
                      <option value="医疗">{t("industryOptionMedical")}</option>
                      <option value="化工">{t("industryOptionChemical")}</option>
                    </Select>
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
                  <FormLabel className="text-xs font-extrabold">{t("supplierRegContactLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder={t("supplierContactPlaceholder")}
                      className="px-3 py-2 text-xs"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="contactEmail"
              rules={{ required: t("formError") }}
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel className="text-xs font-extrabold">{t("supplierRegEmailLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder={t("supplierRegEmailPlaceholder")}
                      className="px-3 py-2 text-xs"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="mainProductsZh"
              rules={{ required: t("formError") }}
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel className="text-xs font-extrabold">{t("supplierRegProductsLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder={t("supplierProductsPlaceholder")}
                      className="px-3 py-2 text-xs"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {error && (
            <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="dark" loading={isSubmitting}>
              {t("supplierRegSubmitBtn")}
            </Button>
          </div>
        </form>
      </Form>
    </FormModal>
  );
}

SupplierRegisterModal.displayName = "SupplierRegisterModal";
