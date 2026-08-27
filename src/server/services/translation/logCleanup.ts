/**
 * 翻译失败日志自动清理模块
 * Auto-cleanup for translation failure log entries
 *
 * @module server/services/translation/logCleanup
 * @description 当定时翻译（autoTranslate）或批量重试（retryTranslation）成功处理了
 *   之前失败的记录时，自动从日志文件中移除对应的 FAIL 行。
 *
 *   设计原则：
 *   - 惰性初始化：首次调用时才扫描日志文件，构建内存索引
 *   - 非阻塞：标记操作为 O(1) 内存操作，文件写入在轮次结束时批量执行
 *   - 安全：仅移除包含 FAIL 的行，绝不触碰其他日志内容
 *   - 幂等：同一 key 重复标记不会重复清理
 */
import "server-only";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/** 兼容 ESM (tsx dev) 和 CJS (esbuild 生产构建) 两种模块系统 */
function getCurrentDir(): string {
  if (typeof __dirname !== "undefined") return __dirname;
  return path.dirname(fileURLToPath(import.meta.url));
}

const LOG_DIR = path.resolve(getCurrentDir(), "..", "..", "logs");

// ── 内存索引结构 ──
// key = "table:id:lang"  →  该失败记录出现在哪些日志文件的哪些行
interface FailureLocation {
  file: string;       // 日志文件名（如 auto-translate-2026-08-13.log）
  lineIndex: number;  // 行号（0-based）
}

// 全局状态
let failureIndex: Map<string, FailureLocation[]> | null = null;
let cleanedKeys: Set<string> = new Set();
let flushed = false;

/**
 * 惰性扫描日志目录，构建失败记录索引
 * 仅扫描 auto-translate-*.log 文件（翻译定时任务专属日志前缀）
 */
function ensureIndex(): Map<string, FailureLocation[]> {
  if (failureIndex) return failureIndex;

  failureIndex = new Map();

  if (!fs.existsSync(LOG_DIR)) return failureIndex;

  const logFiles = fs.readdirSync(LOG_DIR)
    .filter((f) => f.startsWith("auto-translate-") && f.endsWith(".log"));

  for (const file of logFiles) {
    const filePath = path.join(LOG_DIR, file);
    let lines: string[];
    try {
      lines = fs.readFileSync(filePath, "utf-8").split("\n");
    } catch {
      continue; // 读取失败的文件跳过
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 仅索引包含 FAIL 标记的日志行（与 auto.ts/retry.ts 的日志格式一致）
      if (!line.includes("FAIL")) continue;

      // 解析 table=xxx id=xxx lang=xxx
      const tableMatch = line.match(/table=(\S+)/);
      const idMatch = line.match(/\bid=(\d+)/);
      const langMatch = line.match(/\blang=(\S+)/);
      if (!tableMatch || !idMatch || !langMatch) continue;

      const key = `${tableMatch[1]}:${idMatch[1]}:${langMatch[1]}`;
      const locs = failureIndex.get(key);
      if (locs) {
        locs.push({ file, lineIndex: i });
      } else {
        failureIndex.set(key, [{ file, lineIndex: i }]);
      }
    }
  }

  return failureIndex;
}

/**
 * 标记某条翻译记录已成功处理
 * 当 autoTranslate 或 retryTranslation 成功翻译一条记录后调用，
 * 将该 key 加入待清理集合。实际操作为 O(1) 内存写入，不触发 I/O。
 *
 * @returns 匹配的失败日志行数（0 = 无历史失败记录）
 */
export function markTranslationSuccess(
  table: string,
  id: number,
  lang: string,
): number {
  const index = ensureIndex();
  const key = `${table}:${id}:${lang}`;
  const locs = index.get(key);
  if (locs && locs.length > 0) {
    cleanedKeys.add(key);
    return locs.length;
  }
  return 0;
}

/**
 * 批量刷盘：将已标记成功的日志行从文件中移除
 * 应在翻译轮次结束时调用（非阻塞，异步执行）。
 * 同一进程生命周期内仅实际写入一次（后续调用为 no-op）。
 */
export async function flushCleanedLogs(): Promise<{
  filesModified: number;
  filesDeleted: number;
  linesRemoved: number;
}> {
  if (cleanedKeys.size === 0 || flushed) {
    return { filesModified: 0, filesDeleted: 0, linesRemoved: 0 };
  }

  const index = ensureIndex();

  // 按文件聚合需要移除的行号
  const linesToRemoveByFile = new Map<string, Set<number>>();
  let totalLinesRemoved = 0;

  for (const key of cleanedKeys) {
    const locs = index.get(key);
    if (!locs) continue;
    for (const loc of locs) {
      let set = linesToRemoveByFile.get(loc.file);
      if (!set) {
        set = new Set();
        linesToRemoveByFile.set(loc.file, set);
      }
      set.add(loc.lineIndex);
      totalLinesRemoved++;
    }
  }

  let filesModified = 0;
  let filesDeleted = 0;

  for (const [file, lineIndices] of linesToRemoveByFile) {
    const filePath = path.join(LOG_DIR, file);
    let lines: string[];
    try {
      lines = fs.readFileSync(filePath, "utf-8").split("\n");
    } catch {
      continue;
    }

    const remaining = lines.filter((_, i) => !lineIndices.has(i));
    // 过滤尾部空行
    while (remaining.length > 0 && remaining[remaining.length - 1].trim() === "") {
      remaining.pop();
    }

    if (remaining.length === 0) {
      // 所有失败行已清理，删除文件
      try {
        fs.unlinkSync(filePath);
        filesDeleted++;
      } catch { /* 忽略 */ }
    } else {
      // 重写文件
      try {
        fs.writeFileSync(filePath, remaining.join("\n") + "\n", "utf-8");
        filesModified++;
      } catch { /* 忽略 */ }
    }
  }

  flushed = true;

  if (totalLinesRemoved > 0) {
    console.log(
      `[log-cleanup] 清理完成: 移除 ${totalLinesRemoved} 条失败日志行, ` +
      `修改 ${filesModified} 个文件, 删除 ${filesDeleted} 个空文件`
    );
  }

  return { filesModified, filesDeleted, linesRemoved: totalLinesRemoved };
}

/**
 * 获取当前待清理的日志条目数量（诊断用）
 */
export function getCleanedLogCount(): number {
  return cleanedKeys.size;
}

/**
 * 重置模块状态（仅测试用）
 */
export function _resetLogCleanup(): void {
  failureIndex = null;
  cleanedKeys.clear();
  flushed = false;
}

