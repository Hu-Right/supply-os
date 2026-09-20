/**
 * 供应商资源库管理页（Client）
 * @module app/(public)/settings/supplier-pool/page-client
 */
"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Building2, AlertCircle, Trash2, Edit3, Check, X, ShieldAlert, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/core/i18n";
import { useUserId } from "@/core/auth/useUserId";
import { useEnterpriseInfo } from "@/features/auth/hooks/useEnterpriseInfo";
import { api } from "@/core/http";
import { emitAppEvent } from "@/core/events";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";

interface PoolItem {
  pool_id: number;
  supplier_id: number | null;
  qualification_id: number | null;
  company: string;
  industry: string;
  has_qualification: number;
  notes: string | null;
  source: string;
  created_at: string;
}

export default function SupplierPoolPageClient() {
  const { t } = useLocale();
  const userId = useUserId();
  const { bound, loading: enterpriseLoading } = useEnterpriseInfo();
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
  const [candidates, setCandidates] = useState<Array<{ id: number; company: string; industry: string; in_pool: number }>>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [addByIdLoading, setAddByIdLoading] = useState<number | null>(null);

  const fetchList = useCallback(async () => {
    if (!userId) return;
    setListError(false);
    try {
      const res = await api<{ data?: { list?: PoolItem[] } }>("/api/user/supplier-pool");
      setItems(res.data?.list || []);
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
        const res = await api<{ data?: { candidates?: typeof candidates } }>(
          `/api/user/supplier-pool/search?q=${encodeURIComponent(kw)}`,
        );
        if (!cancelled) setCandidates(res.data?.candidates || []);
      } catch {
        if (!cancelled) setCandidates([]);
      } finally {
        if (!cancelled) { setSearching(false); setSearched(true); }
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); setSearching(false); };
  }, [companyName, showAdd]);

  const handleAdd = async () => {
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
  };

  /** 候选确认添加：按点选的 supplierId 精确入库，不做模糊猜测 */
  const handleAddById = async (supplierId: number, companyNameStr: string) => {
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
  };

  const handleRemove = async () => {
    if (!removing) return;
    setRemoveLoading(true);
    try {
      await api(`/api/user/supplier-pool/${removing.pool_id}`, { method: "DELETE" });
      toast.success(t("supplierPoolRemoveSuccess") || "已移除");
      setRemoving(null);
      fetchList();
      emitAppEvent("supply-os:supplier-pool-changed");
    } catch (err: any) {
      toast.error(err?.message || t("supplierPoolRemoveFailed") || "移除失败，请稍后重试");
    } finally {
      setRemoveLoading(false);
    }
  };

  const handleSaveNotes = async (poolId: number) => {
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
  };

  // 企业用户无权访问
  if (!enterpriseLoading && bound) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-8 text-center">
        <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <p className="text-sm font-bold text-amber-800 mb-1">
          {t("supplierPoolEnterpriseDenied") || "供应商资源库仅对外贸员开放"}
        </p>
        <p className="text-2xs text-amber-600">
          {t("supplierPoolEnterpriseDeniedHint") || "您已绑定企业，请使用企业身份进行 AI 适配评分。"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground">
          {t("supplierPoolTitle") || "供应商资源库"}
        </h2>
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 text-sm font-bold transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t("supplierPoolAdd") || "添加合作工厂"}
        </button>
      </div>

      {/* 添加表单 */}
      {showAdd && (
        <div className="rounded-xl border border-purple-100 bg-purple-50/30 p-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={t("supplierPoolCompanyName") || "输入公司名称"}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={addLoading || !companyName.trim()}
              className="rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-bold transition-colors"
            >
              {addLoading ? "..." : t("supplierPoolAdd") || "添加"}
            </button>
          </div>
          {addMessage && (
            <p className={`text-xs ${addError ? "text-rose-600" : "text-emerald-600"} flex items-center gap-1`}>
              {addError && <AlertCircle className="w-3 h-3" />}
              {addMessage}
            </p>
          )}

          {/* 候选列表：平台目录命中项点选确认，避免模糊匹配误加 */}
          {companyName.trim().length >= 2 && (
            <div className="space-y-1">
              {searching && (
                <p className="text-2xs text-slate-400">{t("supplierPoolSearching") || "搜索中…"}</p>
              )}
              {!searching && candidates.length > 0 && (
                <>
                  <p className="text-2xs font-bold text-slate-500">
                    {t("supplierPoolCandidatesTitle") || "平台目录候选（点选添加）"}
                  </p>
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={!!c.in_pool || addByIdLoading !== null}
                      onClick={() => handleAddById(c.id, c.company)}
                      className="w-full flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-purple-300 hover:bg-purple-50/40 disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:bg-white transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{c.company}</p>
                        {c.industry && <p className="text-2xs text-slate-500">{c.industry}</p>}
                      </div>
                      {c.in_pool ? (
                        <span className="text-2xs text-emerald-600 border border-emerald-200 bg-emerald-50 rounded px-1.5 py-0.5">
                          {t("supplierPoolAlreadyInPool") || "已添加"}
                        </span>
                      ) : (
                        <span className="text-2xs text-purple-600 font-bold">
                          {addByIdLoading === c.id ? "…" : (t("supplierPoolAdd") || "添加")}
                        </span>
                      )}
                    </button>
                  ))}
                </>
              )}
              {!searching && searched && candidates.length === 0 && (
                <p className="text-2xs text-slate-400">
                  {t("supplierPoolNoCandidate") || "没有匹配的平台供应商"}
                </p>
              )}
              {!searching && companyName.trim() && (
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={addLoading}
                  className="w-full flex items-center justify-center gap-1 rounded-lg border border-dashed border-purple-300 bg-white px-3 py-2 text-2xs font-bold text-purple-600 hover:bg-purple-50/40 disabled:opacity-50 transition-colors"
                >
                  {addLoading ? "…" : (t("supplierPoolCreateAnyway") || "未找到匹配？仍要添加「{name}」").replace("{name}", companyName.trim())}
                </button>
              )}
            </div>
          )}

          <p className="text-2xs text-slate-500">
            {t("supplierPoolAddHint") || "输入公司名称后，系统会自动匹配平台供应商目录。未匹配到的公司会创建基础记录，你可以后续补充诊断信息。"}
          </p>
        </div>
      )}

      {/* 列表 */}
      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100" />)}
        </div>
      ) : listError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-8 text-center">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <p className="text-sm text-rose-700 mb-4">
            {t("supplierPoolLoadFailed") || "资源库加载失败，请稍后重试"}
          </p>
          <button
            type="button"
            onClick={fetchList}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 px-4 py-2 text-sm font-bold transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t("supplierPoolRetry") || "重试"}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-1">
            {t("supplierPoolEmpty") || "你还没有添加合作工厂"}
          </p>
          <p className="text-2xs text-slate-400">
            {t("supplierPoolEmptyHint") || "输入公司名称即可添加，完善诊断信息可提升 AI 匹配准确度"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.pool_id} className="rounded-xl border border-slate-100 bg-white p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-800 truncate">{item.company || "未知"}</p>
                    {item.has_qualification ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-2xs font-bold">
                        {t("supplierPoolDiagDone") || "已完善"}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-2xs font-bold">
                        {t("supplierPoolDiagPending") || "待完善"}
                      </span>
                    )}
                  </div>
                  {item.industry && (
                    <p className="text-2xs text-slate-500 mt-0.5">{item.industry}</p>
                  )}
                  {editingId === item.pool_id ? (
                    <div className="flex items-center gap-1.5 mt-2">
                      <input
                        type="text"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-purple-400"
                        placeholder={t("supplierPoolNotes") || "备注"}
                      />
                      <button onClick={() => handleSaveNotes(item.pool_id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:bg-slate-50 rounded">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    item.notes && <p className="text-2xs text-slate-400 mt-0.5 truncate">{item.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={`/procurement/qualification?poolId=${item.pool_id}`}
                    className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded transition-colors"
                    title={item.has_qualification
                      ? (t("supplierPoolUpdateDiag") || "更新诊断表")
                      : (t("supplierPoolFillDiag") || "填写诊断表")}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => { setEditingId(item.pool_id); setEditNotes(item.notes || ""); }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded transition-colors"
                    title={t("supplierPoolEditNotes") || "编辑备注"}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setRemoving(item)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                    title={t("supplierPoolRemove") || "移除"}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
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
