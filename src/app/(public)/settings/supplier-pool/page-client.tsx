/**
 * 供应商资源库管理页（Client — 容器）
 * @module app/(public)/settings/supplier-pool/page-client
 * @description 2026-10 组件化拆分：添加面板/列表行/列表三态移入 ./components/*，
 *              本文件只保留状态编排与 API 动作（行为逐字不变）。
 *              容器回调全部 useCallback 稳定，配合展示组件 memo 隔离无关重渲染。
 */
"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/core/i18n";
import { useUserId } from "@/core/auth/useUserId";
import { api } from "@/core/http";
import { emitAppEvent } from "@/core/events";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { SUPPLIER_POOL_MAX_SIZE } from "@/shared/constants/supplier-pool";
import type { PoolItem, PoolCandidate } from "./components/types";
import { AddPanel } from "./components/AddPanel";
import { PoolItemRow } from "./components/PoolItemRow";
import { PoolListSkeleton, PoolListError, PoolListEmpty } from "./components/PoolListStates";

export default function SupplierPoolPageClient() {
  const { t } = useLocale();
  const userId = useUserId();
  const [items, setItems] = useState<PoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addMessage, setAddMessage] = useState("");
  const [addError, setAddError] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState("");
  /** 待移除的资源库行（ConfirmDialog 的目标） */
  const [removing, setRemoving] = useState<PoolItem | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  /** 候选搜索（两段式添加：先选候选，无命中才手动新建） */
  const [candidates, setCandidates] = useState<PoolCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [addByIdLoading, setAddByIdLoading] = useState<number | null>(null);

  const fetchList = useCallback(async () => {
    if (!userId) return;
    setListError(false);
    try {
      const res = await api<{ list?: PoolItem[] }>("/api/user/supplier-pool");
      setItems(res.list || []);
    } catch {
      // 加载失败必须与空态区分：显示错误态 + 重试，而非伪装成"暂无工厂"
      setListError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // 候选防抖搜索：输入 ≥2 字触发，300ms 静默后请求
  useEffect(() => {
    const kw = companyName.trim();
    if (!showAdd || kw.length < 2) {
      setCandidates([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api<{ candidates?: PoolCandidate[] }>(
          `/api/user/supplier-pool/search?q=${encodeURIComponent(kw)}`,
        );
        if (!cancelled) setCandidates(res.candidates || []);
      } catch {
        if (!cancelled) setCandidates([]);
      } finally {
        if (!cancelled) { setSearching(false); setSearched(true); }
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); setSearching(false); };
  }, [companyName, showAdd]);

  const handleAdd = useCallback(async () => {
    if (!companyName.trim()) return;
    setAddLoading(true);
    setAddMessage("");
    try {
      await api("/api/user/supplier-pool", {
        method: "POST",
        body: { companyName: companyName.trim() },
      });
      setAddMessage(t("supplierPoolAddSuccess") || "添加成功");
      setAddError(false);
      setCompanyName("");
      setShowAdd(false);
      fetchList();
      // 通知全局：资源库已变更 → useHasSupplierPool 重取，settings 排他与顶部引导卡片即时更新
      emitAppEvent("supply-os:supplier-pool-changed");
    } catch (err: any) {
      setAddMessage(err?.message || "添加失败");
      setAddError(true);
    }
    setAddLoading(false);
  }, [companyName, t, fetchList]);

  /** 候选确认添加：按点选的 supplierId 精确入库，不做模糊猜测 */
  const handleAddById = useCallback(async (supplierId: number, companyNameStr: string) => {
    setAddByIdLoading(supplierId);
    try {
      await api("/api/user/supplier-pool", {
        method: "POST",
        body: { supplierId },
      });
      toast.success((t("supplierPoolAddSuccess") || "添加成功") + "：" + companyNameStr);
      setShowAdd(false);
      setCompanyName("");
      setCandidates([]);
      setSearched(false);
      fetchList();
      emitAppEvent("supply-os:supplier-pool-changed");
    } catch (err: any) {
      toast.error(err?.message || "添加失败");
    } finally {
      setAddByIdLoading(null);
    }
  }, [t, fetchList]);

  const handleRemove = useCallback(async () => {
    if (!removing) return;
    setRemoveLoading(true);
    try {
      await api(`/api/user/supplier-pool/${removing.poolId}`, { method: "DELETE" });
      toast.success(t("supplierPoolRemoveSuccess") || "已移除");
      setRemoving(null);
      fetchList();
      emitAppEvent("supply-os:supplier-pool-changed");
    } catch (err: any) {
      toast.error(err?.message || t("supplierPoolRemoveFailed") || "移除失败，请稍后重试");
    } finally {
      setRemoveLoading(false);
    }
  }, [removing, t, fetchList]);

  const handleSaveNotes = useCallback(async (poolId: number) => {
    try {
      await api(`/api/user/supplier-pool/${poolId}`, {
        method: "PATCH",
        body: { notes: editNotes },
      });
      toast.success(t("supplierPoolNotesSaved") || "备注已保存");
      setEditingId(null);
      fetchList();
    } catch (err: any) {
      toast.error(err?.message || t("supplierPoolNotesSaveFailed") || "保存失败，请稍后重试");
    }
  }, [editNotes, t, fetchList]);

  // 行级编辑回调（容器稳定引用，保证 PoolItemRow memo 有效）
  const startEdit = useCallback((item: PoolItem) => {
    setEditingId(item.poolId);
    setEditNotes(item.notes || "");
  }, []);
  const cancelEdit = useCallback(() => setEditingId(null), []);

  // V2（ADR-0004）：企业用户也可拥有供应商资源库，不再拦截本页。

  // 已达上限：列表数 >= 共享常量（与后端限流同源），用于展示与禁用添加入口
  const atLimit = items.length >= SUPPLIER_POOL_MAX_SIZE;
  const countText = (t("supplierPoolCount") || "已添加 {count} / {max} 家")
    .replace("{count}", String(items.length))
    .replace("{max}", String(SUPPLIER_POOL_MAX_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-foreground">
            {t("supplierPoolTitle") || "供应商资源库"}
          </h2>
          {/* 计数：达上限时标红，与后端 40020 拒绝口径一致 */}
          {!loading && !listError && (
            <p className={`mt-0.5 text-2xs font-medium ${atLimit ? "text-rose-600" : "text-slate-500"}`}>
              {countText}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          disabled={atLimit}
          title={atLimit ? (t("supplierPoolLimitReached") || "已达上限，请移除不用的供应商后再添加") : undefined}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 text-sm font-bold transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t("supplierPoolAdd") || "添加合作工厂"}
        </button>
      </div>

      {/* 添加表单 */}
      {showAdd && (
        <AddPanel
          companyName={companyName}
          onCompanyNameChange={setCompanyName}
          onAdd={handleAdd}
          addLoading={addLoading}
          addMessage={addMessage}
          addError={addError}
          candidates={candidates}
          searching={searching}
          searched={searched}
          addByIdLoading={addByIdLoading}
          onAddById={handleAddById}
        />
      )}

      {/* 列表 */}
      {loading ? (
        <PoolListSkeleton />
      ) : listError ? (
        <PoolListError onRetry={fetchList} />
      ) : items.length === 0 ? (
        <PoolListEmpty />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <PoolItemRow
              key={item.poolId}
              item={item}
              editing={editingId === item.poolId}
              editNotes={editingId === item.poolId ? editNotes : ""}
              onEditNotesChange={setEditNotes}
              onSaveNotes={handleSaveNotes}
              onCancelEdit={cancelEdit}
              onStartEdit={startEdit}
              onRemove={setRemoving}
            />
          ))}
        </div>
      )}

      {/* 移除二次确认 */}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={handleRemove}
        variant="danger"
        loading={removeLoading}
        title={t("supplierPoolRemoveTitle") || "移除合作工厂"}
        description={
          removing
            ? (t("supplierPoolRemoveConfirm") || "确定移除「{name}」吗？移除后 AI 智能匹配将不再包含该工厂。")
              .replace("{name}", removing.company || "未知")
            : ""
        }
        confirmLabel={t("supplierPoolRemove") || "移除"}
      />
    </div>
  );
}
