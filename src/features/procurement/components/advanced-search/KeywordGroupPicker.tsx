/**
 * 词组选择器（自 AdvancedSearchPanel.tsx 拆出，行为不变）— product_keyword_lib 权益；
 * 无权益时点击触发升级弹窗（不再内嵌锁定态）。
 *
 * 加载策略（性能根因修复，原文随迁）：
 * · 读走 apiCached：点开只付一次「缓存查询」，TTL 内二次/并发点开不再打网络，
 *   也不再触发服务端 4 次串行往返（权益 3 查 + 列表 1 查）。
 * · 有数据就不清空：refetch 期间沿用上一次视图，消除「弹层先空白再蹦出内容」的打开延迟感。
 * · 失败 ≠ 无权益：旧实现把网络异常写成 { entitled:false, groups:[] }，用户看到的是
 *   「去管理词组」空态，权益像凭空掉了——真实故障被吞掉。改为保留旧数据 + 可重试。
 * · 换账号必须失效：缓存键只有 URL，而词组是用户私有数据，不清会串号。
 *
 * 半容器（自带读取状态与账号切换清理）；仍套 memo——父面板的关键词草稿输入等
 * 与本题无关的重渲染不再触发本组件 reconcile（props 均由父侧 useCallback 稳定）。
 *
 * @module features/procurement/components/advanced-search/KeywordGroupPicker
 */
import { useState, useCallback, useEffect, useRef, memo } from "react";
import { useLocale } from "@/core/i18n";
import { useUserId } from "@/core/auth/useUserId";
import {
  fetchKeywordGroups, invalidateKeywordGroups, type KeywordGroup,
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

  const load = useCallback(async () => {
    try {
      const next = await fetchKeywordGroups();
      setData(next);
      setFailed(false);
    } catch {
      // 只在「从未成功过」时才让弹层出现占位；已有数据时静默保留旧视图
      setFailed(true);
    }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  // 账号切换：清掉上一位用户的词组缓存与视图（与 useNoticeSearch 清 /api/notices 同口径）
  const prevUserIdRef = useRef(userId);
  useEffect(() => {
    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;
    invalidateKeywordGroups();
    setData(null);
    setFailed(false);
  }, [userId]);

  // 无权益：不进入词库弹层，点击即弹升级框（门控判定来自服务端 gates，前端不猜档位）
  if (!entitled) {
    return (
      <button
        type="button"
        data-testid="kw-group-picker"
        onClick={onLocked}
        className="text-xs font-bold text-teal-700 hover:text-teal-800"
      >
        {t("procurement_myKeywordGroups") || "我的词组"}
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" data-testid="kw-group-picker"
          className="text-xs font-bold text-teal-700 hover:text-teal-800">
          {t("procurement_myKeywordGroups") || "我的词组"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        {/* 从未取到数据且已失败 → 可重试；取到过 → 一律展示旧数据（含 refetch 期间），不再整块空白 */}
        {!data && failed ? (
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
          <div className="max-h-56 overflow-y-auto">
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
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});
