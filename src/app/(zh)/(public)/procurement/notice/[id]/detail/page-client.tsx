"use client";

/**
 * 用户公告详情页 — 客户端装配
 *
 * @description 复用列表页的详情动作编排（useNoticeActions）与详情组件（NoticeDetail），
 *              只是把承载容器从「列表页内切换」换成独立路由。
 *              未登录时只提示登录，不渲染详情；登录后自动拉取并展示。
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, useUserId } from "@/core/auth";
import { emitAppEvent } from "@/core/events";
import { NoticeDetail } from "@/features/procurement/components/NoticeDetail";
import { useNoticeActions } from "@/features/procurement/hooks/useNoticeActions";
import type { NoticeItem } from "@/features/procurement/types";

function Centered({ text }: { text: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-teal-500" />
        {text}
      </div>
    </div>
  );
}

function LoginPrompt({ onPublic }: { onPublic: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-lg font-extrabold text-slate-900">登录后查看完整公告详情</h1>
      <p className="mt-2 text-sm text-slate-500">
        完整描述、采购方联系方式、采购文件与 AI 解读需要登录后查看；未登录可先看公开摘要。
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => emitAppEvent("supply-os:require-login")}
          className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700"
        >
          立即登录
        </button>
        <button
          type="button"
          onClick={onPublic}
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-teal-400 hover:text-teal-700"
        >
          查看公开摘要
        </button>
      </div>
    </div>
  );
}

export default function PageClient() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const router = useRouter();
  const { authUser, authReady, isVip } = useAuth();
  const userId = useUserId();
  const [notice, setNotice] = useState<NoticeItem | null>(null);
  const startedRef = useRef(false);
  const promptedRef = useRef(false);

  const actions = useNoticeActions({
    userId,
    isVip,
    authReady,
    items: [],
    setSelectedNotice: setNotice,
    trackClick: () => {},
    trackDetailOpen: () => {},
  });

  useEffect(() => {
    if (!authReady) return;
    if (!Number.isFinite(id) || id <= 0) {
      router.replace("/procurement");
      return;
    }
    if (!authUser) {
      if (!promptedRef.current) {
        promptedRef.current = true;
        emitAppEvent("supply-os:require-login");
      }
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    void actions.openNoticeById(id);
    // actions 的 openNoticeById 每次渲染都是新引用，这里只允许首次执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, authUser, id, router]);

  if (!authReady) return <Centered text="加载中…" />;
  if (!authUser) return <LoginPrompt onPublic={() => router.push(`/procurement/notice/${id || ""}`)} />;
  if (!notice?.title) return <Centered text="正在加载公告详情…" />;

  return (
    <NoticeDetail
      notice={notice}
      actionMessage={actions.actionMessage}
      membership={actions.membership}
      membershipReady={actions.membershipReady}
      detailSettled={actions.detailSettledPk === notice.noticePk}
      canUsePaidQuota={actions.canUsePaidQuota}
      isVip={isVip}
      totalRemaining={actions.totalRemaining}
      isLoggedIn
      onBack={() => router.push("/procurement")}
      onExpressInterest={actions.handleExpressInterest}
      onAccess={(n) => void actions.handleGrantAccess(n)}
      onOpenNotice={(n) => router.push(`/procurement/notice/${n.noticePk}/detail`)}
      favorited={actions.isFavorite(notice.noticePk)}
      onToggleFavorite={() => void actions.toggleFavorite(notice.noticePk)}
    />
  );
}
