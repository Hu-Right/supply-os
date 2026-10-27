/**
 * 词组选择器 —— 双分区：「官方精选」（公开，全员可用）+「我的词组」（product_keyword_lib 权益）。
 *
 * 门控重构（官方词组上线）：旧实现「无权益点按钮直接弹升级框、根本进不了弹层」，
 * 与「官方精选全员可用」冲突。改为按钮一律进 Popover，升级判定下沉到「我的词组」区
 * 那一行（点击仍触发 onLocked 弹升级框）——VIP 权益本身没有放宽，放宽的只是入口。
 *
 * 加载策略（性能根因修复，原文随迁 + 官方区扩展）：
 * · 读走 apiCached：点开只付一次「缓存查询」，TTL 内二次/并发点开不再打网络。
 * · 官方区与我的词组并行加载（Promise.allSettled）：任一失败不拖累另一区渲染。
 * · 有数据就不清空：refetch 期间沿用上一次视图，消除「弹层先空白再蹦出内容」的打开延迟感。
 * · 失败 ≠ 无权益：我的词组网络异常保留旧数据 + 可重试，不伪装成「去管理词组」空态。
 * · 换账号必须失效用户区（缓存键只有 URL 而词组私有）；官方区是公开数据，与账号无关，不清。
 *
 * @module features/procurement/components/advanced-search/KeywordGroupPicker
 */
import { useState, useCallback, useEffect, useRef, useMemo, memo } from "react";
import { useLocale } from "@/core/i18n";
import { useUserId } from "@/core/auth/useUserId";
import {
  fetchKeywordGroups, fetchOfficialKeywordGroups, invalidateKeywordGroups,
  type KeywordGroup, type OfficialKeywordGroup,
} from "@/core/api/keywordGroups";
import { Popover, PopoverTrigger, PopoverContent } from "@/shared/ui";

export const KeywordGroupPicker = memo(function KeywordGroupPicker({
  onPick,
  entitled,
  onLocked,
}: {
  onPick: (terms: string[]) => void;
  entitled: boolean;
  onLocked: () => void;
}) {
  const { t } = useLocale();
  const userId = useUserId();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ entitled: boolean; groups: KeywordGroup[] } | null>(null);
  const [failed, setFailed] = useState(false);
  // 官方区独立 state：公开数据、账号切换不清（见下 useEffect）
  const [official, setOfficial] = useState<OfficialKeywordGroup[] | null>(null);

  const load = useCallback(async () => {
    const [u, o] = await Promise.allSettled([fetchKeywordGroups(), fetchOfficialKeywordGroups()]);
    if (u.status === "fulfilled") { setData(u.value); setFailed(false); }
    // 只在「从未取到过」时才让「我的词组」区出现可重试占位；取到过则保留旧视图
    else setFailed(true);
    if (o.status === "fulfilled") setOfficial(o.value.groups);
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  // 账号切换：只清「我的词组」缓存与视图（与 useNoticeSearch 清 /api/notices 同口径）；
  // 官方区是公开数据，跨账号一致，保留不清。
  const prevUserIdRef = useRef(userId);
  useEffect(() => {
    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;
    invalidateKeywordGroups();
    setData(null);
    setFailed(false);
  }, [userId]);

  // 官方区按 categoryCode 分组，保持服务端 (sort_order,id) 序（Map 保插入序）
  const officialByCat = useMemo(() => {
    const m = new Map<string | null, OfficialKeywordGroup[]>();
    for (const g of official ?? []) {
      const k = g.categoryCode;
      const arr = m.get(k);
      if (arr) arr.push(g); else m.set(k, [g]);
    }
    return [...m.entries()];
  }, [official]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" data-testid="kw-group-picker"
          className="text-xs font-bold text-teal-700 hover:text-teal-800">
          {t("procurement_myKeywordGroups") || "我的词组"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="max-h-72 overflow-y-auto">
          {/* ── 官方精选：全员可用，不依赖登录态与 entitled ── */}
          {officialByCat.length > 0 && (
            <div className="mb-1">
              <p className="px-2 py-1 text-2xs font-bold uppercase tracking-wide text-slate-400">
                {t("procurement_officialKeywordGroups") || "官方精选"}
              </p>
              {officialByCat.map(([cat, groups]) => (
                <div key={cat ?? "_"}>
                  {cat && (
                    <p className="px-2 py-0.5 text-2xs text-slate-400">
                      {t("procurement_kwCategoryPrefix").replace("{code}", cat)}
                    </p>
                  )}
                  {groups.map((g) => (
                    <button key={`o-${g.id}`} type="button" data-testid="kw-official-item"
                      onClick={() => { onPick(g.terms); setOpen(false); }}
                      className="w-full text-left px-2 py-2 rounded-md text-sm hover:bg-secondary-50">
                      {g.name}
                      <span className="block text-2xs text-slate-400 truncate">{g.terms.join("、")}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* ── 我的词组：product_keyword_lib 门控保留在此区 ── */}
          <p className="px-2 py-1 text-2xs font-bold uppercase tracking-wide text-slate-400">
            {t("procurement_myKeywordGroups") || "我的词组"}
          </p>
          {!entitled ? (
            <button
              type="button"
              data-testid="kw-group-locked"
              onClick={onLocked}
              className="block w-full px-2 py-3 text-center text-xs text-slate-500 hover:text-teal-700"
            >
              {t("procurement_kwGroupsSectionLocked") || t("procurement_kwGroupsLocked")}
            </button>
          ) : !data && failed ? (
            <button
              type="button"
              data-testid="kw-group-retry"
              onClick={() => void load()}
              className="block w-full px-2 py-3 text-center text-xs text-rose-600 hover:text-rose-700"
            >
              {t("errorBoundaryRetry")}
            </button>
          ) : !data ? (
            <p className="px-2 py-3 text-center text-xs text-slate-400">{t("uiLoadingDots")}</p>
          ) : data.groups.length === 0 ? (
            <a href="/settings/keyword-library" className="block px-2 py-3 text-center text-xs text-slate-500 hover:text-teal-700">
              {t("procurement_manageKeywordGroups")}
            </a>
          ) : (
            <>
              {data.groups.map((g) => (
                <button key={g.id} type="button"
                  onClick={() => { onPick(g.terms); setOpen(false); }}
                  className="w-full text-left px-2 py-2 rounded-md text-sm hover:bg-secondary-50">
                  {g.name}
                  <span className="block text-2xs text-slate-400 truncate">{g.terms.join("、")}</span>
                </button>
              ))}
              <a href="/settings/keyword-library" className="block px-2 py-2 text-xs text-teal-700 hover:underline">
                {t("procurement_manageKeywordGroups")}
              </a>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});
