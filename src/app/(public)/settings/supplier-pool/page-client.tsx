/**
 * 供应商资源库管理页（Client）
 * @module app/(public)/settings/supplier-pool/page-client
 */
"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Building2, AlertCircle, Trash2, Edit3, Check, X, ShieldAlert } from "lucide-react";
import { useLocale } from "@/core/i18n";
import { useUserId } from "@/core/auth/useUserId";
import { useEnterpriseInfo } from "@/features/auth/hooks/useEnterpriseInfo";
import { api } from "@/core/http";

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
  const [showAdd, setShowAdd] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addMessage, setAddMessage] = useState("");
  const [addError, setAddError] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState("");

  const fetchList = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await api<{ list: PoolItem[] }>("/api/user/supplier-pool");
      setItems(res.list || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchList(); }, [fetchList]);

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
    } catch (err: any) {
      setAddMessage(err?.message || "添加失败");
      setAddError(true);
    }
    setAddLoading(false);
  };

  const handleRemove = async (poolId: number) => {
    try {
      await api(`/api/user/supplier-pool/${poolId}`, { method: "DELETE" });
      fetchList();
    } catch { /* ignore */ }
  };

  const handleSaveNotes = async (poolId: number) => {
    try {
      await api(`/api/user/supplier-pool/${poolId}`, {
        method: "PATCH",
        body: { notes: editNotes },
      });
      setEditingId(null);
      fetchList();
    } catch { /* ignore */ }
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
                  <button
                    onClick={() => { setEditingId(item.pool_id); setEditNotes(item.notes || ""); }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded transition-colors"
                    title={t("supplierPoolEditNotes") || "编辑备注"}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleRemove(item.pool_id)}
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
    </div>
  );
}
