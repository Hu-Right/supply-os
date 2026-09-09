"use client";

/**
 * RFQ 采购方发布需求页 — 浅色重构版
 * RFQ Page — Light Theme Redesign
 *
 * @module app/(public)/rfq/page-client
 * @description 组合各区块组件的薄壳，不包含业务逻辑。
 *              页面结构 / Page structure:
 *   1. 浅色 Hero — 双 CTA 与能力标签
 *   2. 发布向导（8 栏主列）+ sticky 侧栏（服务/顾问/草稿，4 栏）
 *   3. 需求广场 — 关键词/行业/国家/预算筛选
 *   4. 响应流程时间线
 *   根容器显式铺 #F5F8FB 浅色底（负 margin 反贴 main 内边距，整幅浅色）。
 */
import { useCallback, useState } from "react";

import { useAuth } from "@/core/auth";
import { ErrorBoundary, PageErrorFallback } from "@/shared/ui";
import {
  LightHero, ResponseFlow, RfqPlaza, RfqSidebar, RfqWizard,
  hasDraftProgress, mergeDraftWithDefaults, useRfqDraft,
} from "@/features/rfq";
import type { RfqFormState } from "@/features/rfq";

function RfqPageContent() {
  const { authUser } = useAuth();
  const draft = useRfqDraft();
  const [wizardKey, setWizardKey] = useState(0);

  /** 有实际填写进度才落草稿（空表单不存） */
  const handleDataChange = useCallback(
    (data: RfqFormState) => {
      if (hasDraftProgress(data)) draft.save(data);
    },
    [draft],
  );

  const handlePublished = useCallback(() => draft.clear(), [draft]);

  const scrollToForm = useCallback(() => {
    document.getElementById("rfq-form")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleClearDraft = useCallback(() => {
    draft.clear();
    // 重挂载向导以回到空白表单
    setWizardKey((k) => k + 1);
  }, [draft]);

  return (
    // 负 margin 反贴 <main> 的内边距，让浅色底铺满整个内容区（根治画布透底发黑）
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8 bg-[#F5F8FB] px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <LightHero />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 min-w-0">
            {draft.ready && (
              <RfqWizard
                key={wizardKey}
                initialData={mergeDraftWithDefaults(draft.data)}
                authContact={{ name: authUser?.nickname ?? "", email: authUser?.email ?? "" }}
                onDataChange={handleDataChange}
                onPublished={handlePublished}
              />
            )}
          </div>
          <aside className="lg:col-span-4 min-w-0">
            <div className="lg:sticky lg:top-28">
              <RfqSidebar
                hasDraft={draft.ready && draft.savedAt !== null}
                savedAt={draft.savedAt}
                onResume={scrollToForm}
                onClearDraft={handleClearDraft}
              />
            </div>
          </aside>
        </div>

        <RfqPlaza />
        <ResponseFlow />
      </div>
    </div>
  );
}

export default function PageClient() {
  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <RfqPageContent />
    </ErrorBoundary>
  );
}
