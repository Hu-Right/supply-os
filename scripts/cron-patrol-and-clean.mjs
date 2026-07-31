/**
 * 桥接表脏行巡检 + 自动清脏 · 定时任务编排器（线 D / Step 9 运维化）
 *
 * 职责（每日一跑，由 Windows 计划任务自动触发）：
 *   1. 跑 patrol-dirty-bridge.mjs --since 1 --json 巡检（只读）；
 *   2. 若检出新增脏行（退出码 1=WARN / 2=CRITICAL），自动跑
 *      backfill-notice-unspsc-bridge.mjs --execute --only-a 清脏（幂等 UPDATE，
 *      只更正 levelN_id 列、零删除、全程写回滚日志）；
 *   3. 清脏后复跑巡检确认收敛；
 *   4. 全程追加日志到 scripts/cron-logs/patrol-YYYY-MM.log（按月一个文件）；
 *   5. 告警：CRITICAL（新增脏行 > 500，说明 CRM 侧管线未整改）、连库失败、
 *      清脏后仍未收敛三种情况写 ALERT 行；若环境变量 ALERT_WEBHOOK_URL 已配置
 *      （.env 支持），同时 POST 一条 JSON 通知（企业微信/钉钉/Slack 通用格式可自行适配）。
 *
 * 用法：
 *   常规运行由 Windows 计划任务 SupplyOS-DirtyBridgePatrol 每日 08:30 自动触发；
 *   也可随时手动跑：
 *   npm run patrol         标准巡检+按需清脏（等价 node scripts/cron-patrol-and-clean.mjs）
 *   npm run patrol:check   只巡检不清脏（演练/排障，等价 --patrol-only）
 *
 * 退出码：0=正常（含“检出并已清理收敛”）；1=告警（CRITICAL 或清后未收敛，需人工关注）；
 *         2=执行异常（连库失败/子进程崩溃）。
 *
 * 定时挂载（Windows 计划任务，已注册；PowerShell 下 /TR 需单引号包裹内嵌双引号）：
 *   schtasks /Create /F /TN "SupplyOS-DirtyBridgePatrol" /SC DAILY /ST 08:30 `
 *     /TR '"C:\nvm4w\nodejs\node.exe" "<仓库根>\scripts\cron-patrol-and-clean.mjs"'
 * 将来若部署到 Linux 服务器，等价 cron 写法：
 *   30 8 * * * cd /path/to/supply-os && /usr/bin/env node scripts/cron-patrol-and-clean.mjs >> .../cron-stdout.log 2>&1
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 计划任务不保证工作目录，所有路径以本文件位置反推仓库根
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = path.join(ROOT, "scripts", "cron-logs");
const LOCK_FILE = path.join(LOG_DIR, ".patrol.lock");
const PATROL_ONLY = process.argv.includes("--patrol-only");
const SINCE_DAYS = 1; // 与“每日一跑”节奏对齐：只看近 1 天增量

fs.mkdirSync(LOG_DIR, { recursive: true });
const logFile = path.join(LOG_DIR, `patrol-${new Date().toISOString().slice(0, 7)}.log`);

function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}`;
  console.log(msg);
  fs.appendFileSync(logFile, msg + "\n");
}

async function alert(summary, detail) {
  log(`ALERT ${summary} ${JSON.stringify(detail)}`);
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return; // 未配置 webhook 则仅落日志（日志本身即告警存档）
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "supply-os dirty-bridge patrol", summary, detail, ts: new Date().toISOString() }),
    });
    log("ALERT webhook 已发送");
  } catch (e) {
    log(`ALERT webhook 发送失败: ${e.message}`);
  }
}

/** 跑子脚本，日志透传 + 捕获输出（巡检的 --json 尾行用于结构化解析） */
function run(scriptArgs) {
  const r = spawnSync(process.execPath, scriptArgs, { cwd: ROOT, encoding: "utf8", timeout: 30 * 60 * 1000 });
  const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
  out.split("\n").forEach((l) => log(`  | ${l}`));
  return { code: r.status ?? 2, out };
}

function parsePatrolJson(out) {
  // patrol --json 的汇总行是最后一行合法 JSON
  const lines = out.split("\n").reverse();
  for (const l of lines) {
    const s = l.trim();
    if (s.startsWith("{")) { try { return JSON.parse(s); } catch { /* 继续找 */ } }
  }
  return null;
}

async function main() {
  // 并发锁：防止上一轮清脏未结束时下一轮又启动（清脏可能跑数分钟）
  if (fs.existsSync(LOCK_FILE)) {
    const ageMs = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
    if (ageMs < 2 * 60 * 60 * 1000) { log("SKIP 上一轮仍在运行（锁存在且未超 2h），本轮跳过"); return 0; }
    log("WARN 发现超过 2h 的陈旧锁，视为异常残留，继续执行");
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));

  try {
    log(`===== 巡检开始（since=${SINCE_DAYS}d${PATROL_ONLY ? "，patrol-only" : ""}）=====`);
    const patrol = run(["scripts/patrol-dirty-bridge.mjs", "--since", String(SINCE_DAYS), "--json"]);
    const stat = parsePatrolJson(patrol.out);

    if (patrol.code === 3 || !stat) {
      await alert("巡检执行失败（连库异常或输出无法解析）", { exitCode: patrol.code });
      return 2;
    }
    if (patrol.code === 0) {
      log(`OK 近 ${SINCE_DAYS} 天无新增脏行（存量 ${stat.dirtyTotal}，均为 R5 无解基线），本轮结束`);
      return 0;
    }

    // 检出新增脏行：WARN(1) / CRITICAL(2)
    log(`检出近 ${SINCE_DAYS} 天新增脏行 ${stat.newDirty} 行（级别 ${stat.level}）`);
    if (stat.level === "CRITICAL") {
      await alert(`新增脏行 ${stat.newDirty} 行超阈值 500 —— CRM 侧管线大概率未整改，需人工介入推动`, stat);
    }
    if (PATROL_ONLY) { log("patrol-only 模式，跳过清脏"); return stat.level === "CRITICAL" ? 1 : 0; }

    // 自动清脏：动作 A（幂等 UPDATE 更正 levelN_id，零删除，自动写回滚日志）
    log("===== 自动清脏开始（--execute --only-a）=====");
    const clean = run(["scripts/backfill-notice-unspsc-bridge.mjs", "--execute", "--only-a"]);
    if (clean.code !== 0) {
      await alert("清脏脚本执行异常，请人工检查回滚日志", { exitCode: clean.code });
      return 2;
    }

    // 复跑巡检确认收敛（清脏后近 1 天窗口内应无剩余可修脏行）
    log("===== 清脏后复测 =====");
    const recheck = run(["scripts/patrol-dirty-bridge.mjs", "--since", String(SINCE_DAYS), "--json"]);
    const after = parsePatrolJson(recheck.out);
    if (after && after.newDirty < stat.newDirty) {
      log(`收敛确认：新增脏行 ${stat.newDirty} → ${after.newDirty}（剩余为清脏窗口后新写入或 R5 无解码），本轮结束`);
      return 0;
    }
    await alert("清脏后未收敛（可修脏行未减少），请人工排查", { before: stat, after });
    return 1;
  } finally {
    fs.rmSync(LOCK_FILE, { force: true });
  }
}

main().then(
  (code) => process.exit(code),
  async (e) => { await alert("编排器未捕获异常", { message: e.message }); process.exit(2); }
);
