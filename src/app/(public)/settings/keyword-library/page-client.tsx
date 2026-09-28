"use client";
/**
 * 产品关键词库管理页（/settings/keyword-library）
 * @description 词组 CRUD：新建（名称 + 逐行词）、改名、改词、删除。
 *              词组是搜索面板"我的词组"的数据源（Task 9），二期推送监控复用。
 *              无权益呈现：设置页右侧内容区铺满不限宽，故整块用内嵌权益面板把话说清楚
 *              （不打断操作），而非采购面板那种即时门控弹窗。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Lock, Pencil, Trash2 } from "lucide-react";
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

/**
 * 词组切词口径（单一事实源）：换行 / 半角逗号 / 全角逗号 / 顿号 均为分隔符，去重保序。
 * 提交与预览共用此函数，避免“看到的切法”与“实际存的切法”不一致。
 */
function splitTerms(text: string): string[] {
  return Array.from(new Set(text.split(/[\n,，、]/).map((s) => s.trim()).filter(Boolean)));
}

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

  const parseTerms = () => splitTerms(termsText);
  // 切词实时预览（只读），输入不花钱但让用户看清会被切成哪几个词
  const termsPreview = useMemo(() => splitTerms(termsText), [termsText]);

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
    // 未解锁：这里不用弹窗——设置页是用户主动来管理词组的场景，右侧内容区（minmax(0,1fr)）
    // 本来整片空着，正好用来把“这个权益是什么、能干什么、上限多少”一次讲清。
    // 采购面板那边的 UpgradeGateModal 保留：那里是“操作途中撞墙”，需要即时拦住。
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6" data-testid="keyword-library-locked">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <Lock className="h-5 w-5 text-amber-600" />
          </span>
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-2xs font-bold uppercase tracking-wide text-slate-400">
                {t("procurement_kwGroupsLocked")}
              </p>
              <h2 className="mt-1 text-base font-extrabold text-slate-800">
                {t("procurement_upgradeGateKwLibTitle")}
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-slate-600">{t("settingsKwLockedDesc")}</p>
            <ul className="space-y-2">
              {[t("settingsKwBenefit1"), t("settingsKwBenefit2")].map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-slate-700">
                  <Check className="w-4 h-4 shrink-0 mt-0.5 text-teal-600" />
                  <span>{line}</span>
                </li>
              ))}
              {/* 上限复用现有两个带 {max} 的键，不写死数字，避免与常量漂移 */}
              <li className="flex items-start gap-2 text-sm text-slate-700">
                <Check className="w-4 h-4 shrink-0 mt-0.5 text-teal-600" />
                <span>
                  {t("settingsKwTermsHint", { max: MAX_TERMS_PER_GROUP })}
                  {"；"}
                  {t("settingsKwGroupsLimit", { max: MAX_GROUPS_PER_USER })}
                </span>
              </li>
            </ul>
            <a
              href="/membership"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-700"
            >
              {t("procurement_upgradeGateViewPlans")}
            </a>
          </div>
        </div>
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
          {/* 切词预览：分隔符是隐式约定，用户看不见自己被切成几个词；这里实时回显并把计数钉在 20 上限，
              超限直接禁用提交而不是等后端报错 */}
          {termsPreview.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" data-testid="kw-terms-preview">
              {termsPreview.map((term) => (
                <span key={term}
                  className="inline-flex items-center max-w-[12rem] truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700">
                  {term}
                </span>
              ))}
              <span className={`text-2xs font-bold ${termsPreview.length > MAX_TERMS_PER_GROUP ? "text-rose-600" : "text-slate-400"}`}>
                {termsPreview.length}/{MAX_TERMS_PER_GROUP}
              </span>
            </div>
          )}
          <p className="text-2xs text-slate-400">{t("settingsKwGroupsLimit", { max: MAX_GROUPS_PER_USER })}</p>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <Button
              onClick={handleSubmit}
              disabled={!name.trim() || termsPreview.length === 0 || termsPreview.length > MAX_TERMS_PER_GROUP
                || (!editingId && groups.length >= MAX_GROUPS_PER_USER)}
            >
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
