"use client";
/**
 * 公告管理页（/settings/notice-manage）
 * @description 后台运维页（ADMIN_EMAILS 门禁），两个页签：
 *   1) 待人工确认：打标队列里 status=pending 的公告（AI 低置信建议 + 从未判定的新公告），
 *      「采纳建议」一键落 AI 建议码；或「改选」用 UGT 树级联自选（最低 L2）。
 *      确认走双闸（形制+树内）写落点表 source=manual_confirm，并翻队列状态、推宽表。
 *   2) 打标结果：落点表最近写入（AI/人工/legacy），看节点、置信度、依据。
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Select } from "@/shared/ui";
import {
  confirmTagging, fetchPendingSuggestions, fetchTaggingResults, fetchTreeOptions,
  type PendingSuggestion, type TaggingResultRow, type TreeOption,
} from "@/core/api/noticeTagging";
import { useIsAdmin } from "@/shared/hooks/useIsAdmin";

const fmt = (n: number) => Number(n || 0).toLocaleString("zh-CN");
const PAGE_SIZE = 20;

export default function NoticeManagePageClient() {
  const isAdmin = useIsAdmin();
  const [tab, setTab] = useState<"pending" | "results">("pending");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(
          [
            ["pending", "待人工确认"],
            ["results", "打标结果"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${tab === k ? "bg-secondary-100 font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {isAdmin ? tab === "pending" ? <PendingTab /> : <ResultsTab /> : (
        <Card className="p-6 text-sm text-muted-foreground">
          无后台运维权限。本页仅对 ADMIN_EMAILS 白名单中的账号开放（配置后重启生效）。
        </Card>
      )}
    </div>
  );
}

/* ── 页签一：待人工确认 ── */
function PendingTab() {
  const [items, setItems] = useState<PendingSuggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // 正在展开树级联的 noticeId

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r = await fetchPendingSuggestions(p, PAGE_SIZE);
      setItems(r.items);
      setTotal(r.total);
      setPage(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  const doConfirm = async (noticeId: string, code: string) => {
    setConfirming(noticeId);
    try {
      const r = await confirmTagging(noticeId, code);
      toast.success(`已确认落点：${r.nodeName || r.code}`);
      setEditing(null);
      await load(page);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "确认失败");
    } finally {
      setConfirming(null);
    }
  };

  return (
    <div className="space-y-3">
      <Card className="p-4 text-xs text-muted-foreground">
        队列共 {fmt(total)} 条待处理。AI 低置信建议只作参考，确认前请核对公告内容与品目是否相符；落点最低到 L2，确认后立即生效（宽表与搜索同步刷新）。
      </Card>
      {loading ? (
        <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">队列空：没有待人工确认的公告。</Card>
      ) : (
        items.map((it) => (
          <Card key={it.noticeId} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/procurement/notice/${it.noticeId}`} target="_blank" className="line-clamp-2 text-sm font-medium hover:underline">
                  {it.title || "(无标题)"}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {it.noticeId}
                  {it.expired ? "｜已过期" : ""}
                  {it.suggestCode ? (
                    <>
                      ｜AI 建议：<span className="font-medium text-foreground">{it.suggestName || it.suggestCode}</span>（{it.suggestCode}）
                    </>
                  ) : (
                    "｜未判定（可人工归类）"
                  )}
                </p>
                {it.suggestReason && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{it.suggestReason}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {it.suggestCode ? (
                  <Button size="sm" disabled={confirming === it.noticeId} onClick={() => doConfirm(it.noticeId, it.suggestCode)}>
                    {confirming === it.noticeId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    采纳建议
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">待人工归类</span>
                )}
                <Button size="sm" variant="outline" onClick={() => setEditing(editing === it.noticeId ? null : it.noticeId)}>
                  改选 <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {editing === it.noticeId && (
              <div className="mt-3 border-t pt-3">
                <NodeCascade onPick={(code) => doConfirm(it.noticeId, code)} busy={confirming === it.noticeId} />
              </div>
            )}
          </Card>
        ))
      )}
      <Pager page={page} total={total} onPage={(p) => void load(p)} />
    </div>
  );
}

/* ── UGT 树级联（从大类逐层下探，选中即确认） ── */
function NodeCascade({ onPick, busy }: { onPick: (code: string) => void; busy: boolean }) {
  const [levels, setLevels] = useState<{ parent: string; options: TreeOption[] }[]>([{ parent: "", options: [] }]);
  const [picked, setPicked] = useState<string[]>([]); // 每层选中的 key
  const [loadingLevel, setLoadingLevel] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const opts = await fetchTreeOptions("");
        setLevels([{ parent: "", options: opts }]);
      } catch {
        toast.error("品目树加载失败");
      }
    })();
  }, []);

  const pick = async (depth: number, key: string) => {
    const nextPicked = picked.slice(0, depth);
    nextPicked[depth] = key;
    setPicked(nextPicked);
    try {
      setLoadingLevel(true);
      const opts = await fetchTreeOptions(key);
      if (opts.length === 0) {
        onPick(key); // 已是叶子：选中即确认
        return;
      }
      const nextLevels = levels.slice(0, depth + 1);
      nextLevels.push({ parent: key, options: opts });
      setLevels(nextLevels);
    } catch {
      toast.error("下级加载失败");
    } finally {
      setLoadingLevel(false);
    }
  };

  const deepest = picked[picked.length - 1] || "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {levels.map((lv, i) => (
        <Select
          key={`${lv.parent}-${i}`}
          value={picked[i] ?? ""}
          onChange={(e) => void pick(i, e.target.value)}
          disabled={busy || loadingLevel}
          className="max-w-56"
        >
          <option value="">{i === 0 ? "选择大类…" : "选择下级…"}</option>
          {lv.options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.key} {o.nameZh}
            </option>
          ))}
        </Select>
      ))}
      {deepest && (
        <Button size="sm" disabled={busy} onClick={() => onPick(deepest)}>
          确认挂到 {deepest}
        </Button>
      )}
    </div>
  );
}

/* ── 页签二：打标结果 ── */
function ResultsTab() {
  const [items, setItems] = useState<TaggingResultRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number, src: string) => {
    setLoading(true);
    try {
      const r = await fetchTaggingResults(p, PAGE_SIZE, src);
      setItems(r.items);
      setTotal(r.total);
      setPage(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1, source);
  }, [load, source]);

  const SOURCE_LABEL: Record<string, string> = {
    ai_content: "AI",
    manual_confirm: "人工",
    legacy_tag: "存量",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">来源</span>
        <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-40">
          <option value="">全部</option>
          <option value="ai_content">AI 打标</option>
          <option value="manual_confirm">人工确认</option>
          <option value="legacy_tag">存量 legacy</option>
        </Select>
        <span className="text-xs text-muted-foreground">共 {fmt(total)} 条落点</span>
      </div>
      {loading ? (
        <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">公告</th>
                <th className="px-4 py-2.5 font-medium">落点</th>
                <th className="px-4 py-2.5 font-medium">来源</th>
                <th className="px-4 py-2.5 font-medium">置信</th>
                <th className="px-4 py-2.5 font-medium">依据</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={`${r.noticeId}-${r.nodeCode}`} className="border-b last:border-0">
                  <td className="max-w-72 px-4 py-2.5">
                    <Link href={`/procurement/notice/${r.noticeId}`} target="_blank" className="line-clamp-1 hover:underline">
                      {r.title || r.noticeId}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{r.nodeName || r.nodeCode}</span>
                    <span className="ml-1 text-xs text-muted-foreground">{r.nodeCode}（L{r.level}）</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {SOURCE_LABEL[r.source] || r.source}
                    {r.model && <span className="block text-muted-foreground">{r.model}</span>}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{r.confidence ? r.confidence.toFixed(2) : "-"}</td>
                  <td className="max-w-64 px-4 py-2.5 text-xs text-muted-foreground">
                    <span className="line-clamp-2">{r.evidence || "-"}</span>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    暂无落点记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
      <Pager page={page} total={total} onPage={(p) => void load(p, source)} />
    </div>
  );
}

/* ── 分页 ── */
function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        上一页
      </Button>
      <span className="text-xs text-muted-foreground">
        {page} / {pages}
      </span>
      <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        下一页
      </Button>
    </div>
  );
}
