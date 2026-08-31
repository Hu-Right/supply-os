/**
 * /promotion — 员工推广工具页
 * Employee Promotion Tools Page
 *
 * @module app/(public)/promotion/page
 * @description 员工自助生成推广二维码，编码内容为本站 /r/[code] 链接，
 *              扫码后直接写入 ref_code Cookie 并跳转落地页，不依赖任何第三方服务。
 */
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/services/seo/site";
import PromotionQRCode from "@/features/crm/components/PromotionQRCode";

export const metadata: Metadata = {
  title: "推广工具 | Supply OS",
  description: "员工推广二维码生成工具，生成专属推广链接与二维码",
  alternates: {
    canonical: absoluteUrl("/promotion"),
  },
};

export default function PromotionPage() {
  return (
    <div className="mx-auto max-w-xl py-8">
      <PromotionQRCode />
    </div>
  );
}
