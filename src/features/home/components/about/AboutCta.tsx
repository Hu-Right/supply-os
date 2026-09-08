/**
 * 平台介绍 — CTA 行动召唤区块
 * About CTA — Call to action with dual buttons
 *
 * @module features/home/components/about/AboutCta
 */
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

export function AboutCta() {
  const router = useRouter();

  return (
    <div className="bg-neutral-50/60 border-t border-neutral-100">
      <div className="max-w-3xl mx-auto px-6 sm:px-8 lg:px-8 py-20 md:py-24 text-center">
        <h3 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight">
          准备好开启全球采购之旅？
        </h3>
        <p className="mt-4 text-base text-neutral-500">
          立即搜索实时商机，或注册成为认证供应商
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => router.push("/procurement")}
            className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-8 py-3 text-sm font-semibold text-white hover:bg-teal-700 transition-colors shadow-sm"
          >
            搜索商机
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => router.push("/suppliers/register")}
            className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-8 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            免费注册
          </button>
        </div>
      </div>
    </div>
  );
}
