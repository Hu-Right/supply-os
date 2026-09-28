"use client";
/**
 * 产品关键词库管理页（/settings/keyword-library）
 * @description 词组 CRUD：新建（名称 + 逐行词）、改名、改词、删除。
 *              词组是搜索面板"我的词组"的数据源（Task 9），二期推送监控复用。
 */
import { useCallback, useEffect, useState } from "react";
import { Lock, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/core/i18n";
import { useUserId } from "@/core/auth/useUserId";
import { Input, Button, Textarea } from "@/shared/ui";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import {
  fetchKeywordGroups, createKeywordGroup, updateKeywordGroup, deleteKeywordGroup,
  type KeywordGroup,
} from "@/core/api/keywordGroups";
import { MAX_TERMS_PER_GROUP, MAX_GROUPS_PER_USER } from "@/lib/services/keyword-groups";

export default function KeywordLibraryPageClient() {
  const { t } = useLocale();
  const userId = useUserId();
  const [entitled, setEntitled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<KeywordGroup[]>([]);
  const [name, setName] = useState("");
  const [termsText, setTermsText] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  /** 待删除的词组（ConfirmDialog 目标，与 supplier-pool 移除口径一致） */
  const [removing, setRemoving] = useState<KeywordGroup | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchKeywordGroups();
      setEntitled(data.entitled);
      setGroups(data.groups);
    } catch {
      setEntitled(false);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (userId) void reload(); else setLoading(false); }, [userId, reload]);

  const parseTerms = () =>
    Array.from(new Set(termsText.split(/[\n,，、]/).map((s) => s.trim()).filter(Boolean)));

  const handleSubmit = async () => {
    setError("");
    const terms = parseTerms();
    try {
      if (editingId) await updateKeywordGroup(editingId, { name: name.trim(), terms });
      else await createKeywordGroup(name.trim(), terms);
      setName(""); setTermsText(""); setEditingId(null);
      await reload();
    } catch (e) {
      // 4xx 错误消息（如"已存在同名词组"）为面向用户的文案，非空字符串则直接透出
      setError(e instanceof Error && e.message ? e.message : t("settingsKwSaveFailed"));
    }
  };

  const startEdit = (g: KeywordGroup) => {
    setEditingId(g.id); setName(g.name); setTermsText(g.terms.join("\n"));
  };

  const handleDelete = async () => {
    if (!removing) return;
    setRemoveLoading(true);
    try {
      await deleteKeywordGroup(removing.id);
      toast.success(t("settingsKwDeleted") || "已删除");
      setRemoving(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error && e.message
        ? e.message
        : (t("settingsKwDeleteFailed") || "删除失败，请稍后重试"));
    } finally {
      setRemoveLoading(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">{t("uiLoadingDots") || "..."}</p>;

  if (!userId) {
    return <p className="text-sm text-muted-foreground">{t("settingsKwLoginRequired")}</p>;
  }

  if (!entitled) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 text-center">
        <Lock className="w-8 h-8 text-amber-600 mx-auto mb-3" />
        <p className="text-sm text-amber-700 mb-4">{t("procurement_kwGroupsLocked")}</p>
        <a href="/membership" className="inline-flex items-center rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 text-sm font-bold">
          {t("procurement_advancedDegradedCta")}
        </a>
      </section>
    );
  }

  return (
    <div className="space-y-6" data-testid="keyword-library">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-extrabold text-slate-800 mb-4">
          {editingId ? t("settingsKwEditTitle") : t("settingsKwCreateTitle")}
        </h2>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)}
            placeholder={t("settingsKwNamePlaceholder")} maxLength={100} />
          <Textarea
            value={termsText}
            onChange={(e) => setTermsText(e.target.value)}
            placeholder={t("settingsKwTermsPlaceholder")}
            rows={3}
            className="resize-none"
          />
          <p className="text-2xs text-slate-400">{t("settingsKwTermsHint", { max: MAX_TERMS_PER_GROUP })}</p>
          <p className="text-2xs text-slate-400">{t("settingsKwGroupsLimit", { max: MAX_GROUPS_PER_USER })}</p>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={!name.trim() || !parseTerms().length || (!editingId && groups.length >= MAX_GROUPS_PER_USER)}>
              {editingId ? t("settingsKwSave") : t("settingsKwCreate")}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={() => { setEditingId(null); setName(""); setTermsText(""); }}>
                {t("settingsKwCancel")}
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-extrabold text-slate-800">{t("settingsKwListTitle")}</h2>
          <span className={`text-xs font-bold ${groups.length >= MAX_GROUPS_PER_USER ? "text-rose-600" : "text-slate-400"}`}>
            {groups.length} / {MAX_GROUPS_PER_USER}
          </span>
        </div>
        {groups.length === 0 ? (
          <p className="text-sm text-slate-400">{t("settingsKwEmpty")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {groups.map((g) => (
              <li key={g.id} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800">{g.name}</p>
                  <p className="text-xs text-slate-400 truncate">{g.terms.join("、")}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => startEdit(g)} aria-label="edit"
                    className="text-slate-400 hover:text-teal-700"><Pencil className="w-4 h-4" /></button>
                  <button type="button" onClick={() => setRemoving(g)} aria-label="delete"
                    className="text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 删除二次确认：与 supplier-pool 移除口径一致（danger + loading） */}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={handleDelete}
        variant="danger"
        loading={removeLoading}
        title={t("settingsKwRemoveTitle") || "删除词组"}
        description={removing ? t("settingsKwRemoveConfirm", { name: removing.name }) : ""}
        confirmLabel={t("settingsKwRemove") || "删除"}
      />
    </div>
  );
}
