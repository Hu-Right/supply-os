/**
 * 系统配置公开端点
 * Public system config endpoints (no auth required)
 *
 * @module routes/system.routes
 */
import { Router } from "express";
import fs from "fs";
import path from "path";
import type { AppContext } from "../context";

/** 构建时生成的版本号文件（dist/version.json） */
function readBuildVersion(): string {
  try {
    const versionFile = path.join(process.cwd(), "dist", "version.json");
    const data = JSON.parse(fs.readFileSync(versionFile, "utf-8"));
    return data.version || "";
  } catch {
    // 开发环境或 version.json 不存在时，用 package.json 版本号 + 时间戳
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );
      return `${pkg.version || "0.0.0"}-dev`;
    } catch {
      return "unknown";
    }
  }
}

export function createSystemRouter(ctx: AppContext): Router {
  const router = Router();
  const { systemRepo } = ctx;

  // ICP 备案号准静态，服务端内存缓存 10 分钟，避免每次穿透 DB
  let icpCache: { bah: string; ts: number } | null = null;
  const ICP_CACHE_TTL = 10 * 60 * 1000;

  router.get("/api/system/icp", async (_req, res) => {
    try {
      const now = Date.now();
      if (icpCache && now - icpCache.ts < ICP_CACHE_TTL) {
        res.setHeader("Cache-Control", "public, max-age=600");
        return res.json(icpCache);
      }
      const bah = await systemRepo.getIcpBah();
      icpCache = { bah, ts: now };
      res.setHeader("Cache-Control", "public, max-age=600");
      res.json(icpCache);
    } catch {
      res.json({ bah: "" });
    }
  });

  // 获取当前部署版本号（前端轮询比对，检测新版本）
  // 不缓存，确保前端始终拿到最新版本号
  router.get("/api/system/version", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.json({ version: readBuildVersion() });
  });

  return router;
}
