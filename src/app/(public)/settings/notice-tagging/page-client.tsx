"use client";
/**
 * 公告打标任务页（/settings/notice-tagging）
 * @description 后台运维入口（ADMIN_EMAILS 门禁）：给「无 UGT 归属」的活跃公告按正文语义
 *              匹配品目码。管道 = stage1 定域 → stage2 召回+选点 → stage3 zoom-in 精化
 *              → 形制/树内/深度/置信四闸落笔（写 crm_notice_attribution_nodes，低置信把
 *              AI 建议回写队列待人工确认）。任务在服务端后台运行，关闭页面不影响进度。
 *              参照 intelligence-daily SystemLabel 的任务卡片交互：条数上限 → 开始 →
 *              轮询进度 → 可停（当前批次完成后退出）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Input } from "@/shared/ui";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import {
  fetchTaggingStatus, startTaggingRun, stopTaggingRun,
  type TaggingRunStatus, type TaggingStats,
} from "@/core/api/noticeTagging";
import { useIsAdmin } from "@/shared/hooks/useIsAdmin";

const RUN_LIMIT_MAX = 2000;
const fmt = (n: number) => Number(n || 0).toLocaleString("zh-CN");

export default function NoticeTaggingPageClient() {
  const isAdmin = useIsAdmin();
  const [stats, setStats] = useState<TaggingStats | null>(null);
  const [run, setRun] = useState<TaggingRunStatus | null>(null);
  const [limit, setLimit] = useState<string>("200");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetchTaggingStatus();
      setStats(r.stats);
      setRun(r.run);
    } catch {
      /* 轮询失败静默（下次再取） */
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
    pollRef.current = setInterval(() => void load(), 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isAdmin, load]);

  const handleStart = async () => {
    const n = Math.floor(Number(limit) || 0);
    if (n < 1) {
      toast.error("请填入本次处理条数上限（正整数）");
      return;
    }
    setStarting(true);
    try {
      const r = await startTaggingRun(Math.min(n, RUN_LIMIT_MAX));
      if (r.ok) {
        toast.success(r.message);
        setRun(r.run);
      } else {
        toast.error(r.message);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "启动失败");
    } finally {
      setStarting(false);
      setConfirmOpen(false);
    }
  };

  const handleStop = async () => {
    try {
      await stopTaggingRun();
      toast.success("已请求停止，当前批次完成后退出");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "停止失败");
    }
  };

  if (!isAdmin) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        无后台运维权限。本页仅对 ADMIN_EMAILS 白名单中的账号开放（配置后重启生效）。
      </Card>
    );
  }

  const running = run?.running ?? false;
  const phaseText = !run
    ? "…"
    : running
      ? run.phase === "loading"
        ? "加载品目树…"
        : "正在分类"
      : run.finishedAt
        ? "已结束"
        : "未在运行";
  const percent = running && run && run.limit ? Math.min(99, Math.round((100 * run.processed) / run.limit)) : run?.finishedAt ? 100 : 0;

  return (
    <div className="space-y-6">
      {/* 覆盖统计 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "活跃公告总数", value: fmt(stats?.totalNotices ?? 0) },
          { label: "已有品目归属", value: fmt(stats?.coveredNotices ?? 0) },
          { label: "待归属", value: fmt(stats?.uncoveredNotices ?? 0) },
          { label: "覆盖率", value: `${stats?.coverage ?? 0}%` },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-xl font-bold">{c.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.label}</p>
          </Card>
        ))}
      </div>

      {/* 任务控制 */}
      <Card className="p-5">
        <h2 className="mb-2 font-semibold">品目打标任务</h2>
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          给「无品目归属」的活跃公告按正文语义匹配 UGT 品目码，写落点表 crm_notice_attribution_nodes
          （source=ai_content），落笔前过形制/树内/深度/置信四道闸；低置信公告只回填 AI
          建议到待确认队列（见「公告管理」页人工确认）。每条公告约 2~3 次 LLM
          调用，写库后自动推进宽表与搜索。任务在服务端后台运行，关闭页面不影响进度。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            本次处理条数上限
            <Input
              type="number"
              min={1}
              max={RUN_LIMIT_MAX}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              disabled={running}
              className="w-28"
            />
          </label>
          <Button onClick={() => setConfirmOpen(true)} disabled={running || starting}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            开始打标
          </Button>
          {running && (
            <Button variant="outline" onClick={handleStop} className="text-destructive">
              <Square className="h-4 w-4" />
              停止（当前批次完成后退出）
            </Button>
          )}
        </div>
      </Card>

      {/* 任务进度 */}
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">任务进度</h2>
        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-secondary-100">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            阶段：{phaseText}
            {run?.stopRequested && running ? "（已请求停止，当前批次完成后退出）" : ""}
          </p>
          {run && (
            <>
              <p>
                已处理 {fmt(run.processed)}
                {run.limit ? ` / 上限 ${fmt(run.limit)}` : ""} 条｜AI 落笔 {fmt(run.written)}｜低置信留人工 {fmt(run.lowConf)}｜不沾边 {fmt(run.none)}｜被闸拒 {fmt(run.rejected)}
              </p>
              <p>
                队列积压（待人工确认口径）{fmt(stats?.intakePending ?? 0)} 条｜本轮 LLM {fmt(run.usage.calls)} 次调用｜输入 {fmt(run.usage.promptTokens)} tok / 输出 {fmt(run.usage.completionTokens)} tok
              </p>
              {run.startedAt && (
                <p className="text-xs">
                  开始 {new Date(run.startedAt).toLocaleString("zh-CN")}
                  {run.finishedAt ? `｜结束 ${new Date(run.finishedAt).toLocaleString("zh-CN")}` : ""}
                </p>
              )}
            </>
          )}
        </div>
      </Card>

      {/* 最近错误 */}
      {run && run.recentErrors.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold text-destructive">最近错误（{run.recentErrors.length}）</h2>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {run.recentErrors.map((e, i) => (
              <li key={i} className="break-all">{e}</li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="启动公告打标"
        description={`将调用 AI 为最多 ${fmt(Math.floor(Number(limit) || 0))} 条无归属公告匹配 UGT 品目码并写入库（低置信留人工）。确认开始？`}
        confirmLabel="开始打标"
        onConfirm={handleStart}
      />
    </div>
  );
}
