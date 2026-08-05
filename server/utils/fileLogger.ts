/**
 * 轻量文件日志模块
 * 
 * 日志写入 server/logs/ 目录，按日期分文件：auto-translate-2026-08-01.log
 * 同时保留 console 输出（可通过 LOG_TO_CONSOLE=false 关闭）
 */
import fs from "fs";
import path from "path";

const LOG_DIR = path.resolve(path.dirname(typeof __filename !== "undefined" ? __filename : __dirname), "..", "logs");
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

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
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
