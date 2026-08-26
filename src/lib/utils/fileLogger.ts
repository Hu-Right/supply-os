/**
 * 轻量文件日志模块
 * 
 * 日志写入 server/logs/ 目录，按日期分文件：auto-translate-2026-08-01.log
 * 同时保留 console 输出（可通过 LOG_TO_CONSOLE=false 关闭）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/** 兼容 ESM (tsx dev) 和 CJS (esbuild 生产构建) 两种模块系统 */
function getCurrentDir(): string {
  if (typeof __dirname !== "undefined") return __dirname;          // CJS
  return path.dirname(fileURLToPath(import.meta.url));             // ESM
}

const LOG_DIR = path.resolve(getCurrentDir(), "..", "logs");
const LOG_TO_CONSOLE = process.env.LOG_TO_CONSOLE !== "false";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function todayStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 时间戳统一输出北京时间（Asia/Shanghai），与业务调度时区（06:00/13:00 北京时间）保持一致；
// toISOString 输出的是 UTC，比北京时间慢 8 小时，会造成日志时间与调度时间对不上的困惑
function timestamp(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  // hour12: false 时午夜可能输出 "24"，归一到 "00"
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}

function logToFile(filename: string, line: string) {
  ensureLogDir();
  const filePath = path.join(LOG_DIR, filename);
  fs.appendFileSync(filePath, line + "\n", "utf-8");
}

export function createLogger(prefix: string) {
  return {
    warn(msg: string) {
      const line = `[${timestamp()}] [${prefix}] WARN: ${msg}`;
      logToFile(`${prefix}-${todayStr()}.log`, line);
      if (LOG_TO_CONSOLE) console.warn(line);
    },
    error(msg: string) {
      const line = `[${timestamp()}] [${prefix}] ERROR: ${msg}`;
      logToFile(`${prefix}-${todayStr()}.log`, line);
      if (LOG_TO_CONSOLE) console.error(line);
    },
    info(msg: string) {
      const line = `[${timestamp()}] [${prefix}] INFO: ${msg}`;
      logToFile(`${prefix}-${todayStr()}.log`, line);
      if (LOG_TO_CONSOLE) console.log(line);
    },
  };
}
