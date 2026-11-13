/**
 * 轻量文件日志模块
 *
 * 日志目录 = LOG_DIR，未配置时落到 <cwd>/logs，按日期分文件：auto-translate-2026-08-01.log
 * 同时保留 console 输出（可通过 LOG_TO_CONSOLE=false 关闭）
 *
 * 【为什么不用 __dirname】2026-11-13 线上排查：生产构建会把 __dirname 常量折叠成构建机的绝对路径
 * （当时产物里是 "/ROOT/src/lib/utils"），于是日志全写到 /ROOT/src/lib/logs —— 既不在项目目录，
 * 也没有任何轮转，77 天堆了 2.1G。改为显式配置：生产在 .env.production 设 LOG_DIR（如
 * /var/log/supply-os），交给 logrotate 轮转；开发不配则落 <cwd>/logs。
 */
import fs from "fs";
import path from "path";

const LOG_DIR = path.resolve(process.env.LOG_DIR ?? path.join(process.cwd(), "logs"));
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
  // basename 防路径穿越：filename 仅允许 LOG_DIR 下的平铺文件名
  const filePath = path.join(LOG_DIR, path.basename(filename));
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
