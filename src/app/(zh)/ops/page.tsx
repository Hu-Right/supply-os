// i18n-allow-file: 运营后台总览（内部页面，仅白名单账号）
/**
 * /ops — 运营后台总览
 */
import Link from "next/link";
import { ChevronRight, ReceiptText } from "lucide-react";

export default function OpsHomePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-secondary-900">运营后台</h1>
        <p className="mt-1 text-xs text-secondary-500">按模块处理内部事务；入口不对外，权限由环境变量白名单控制。</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/ops/invoices" className="group rounded-2xl border border-secondary-200 bg-white p-5 hover:border-primary-300">
          <p className="flex items-center gap-2 text-sm font-bold text-secondary-900"><ReceiptText className="h-4 w-4 text-primary-600" />发票处理</p>
          <p className="mt-1 text-xs leading-relaxed text-secondary-500">查看用户开票申请，接单、录入发票号并上传发票文件，完成开具与红冲。</p>
          <span className="mt-3 inline-flex items-center gap-0.5 text-xs font-semibold text-primary-700">进入模块<ChevronRight className="h-3 w-3" /></span>
        </Link>
      </div>
      <p className="text-[11px] leading-relaxed text-secondary-400">
        当前仅开放发票处理模块。财务账号通过 BILLING_OPS_USER_IDS 配置；未授权账号访问接口会返回 403。
      </p>
    </div>
  );
}
