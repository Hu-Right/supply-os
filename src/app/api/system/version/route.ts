/**
 * GET /api/system/version
 * Phase 1 先行迁移：与 Express 端 readBuildVersion() 逻辑等价。
 * 优先级：BUILD_ID 环境变量 → dist/version.json → package.json-dev → unknown
 */
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  let version = process.env.BUILD_ID || "";

  if (!version) {
    // fallback 1: 读 dist/version.json（构建时生成）
    try {
      const versionFile = path.join(process.cwd(), "dist", "version.json");
      const data = JSON.parse(fs.readFileSync(versionFile, "utf-8"));
      version = data.version || "";
    } catch {
      // fallback 2: package.json 版本号 + 时间戳（开发环境）
      try {
        const pkg = JSON.parse(
          fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8"),
        );
        version = `${pkg.version || "0.0.0"}-dev`;
      } catch {
        version = "unknown";
      }
    }
  }

  return NextResponse.json(
    { version },
    {
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
    },
  );
}
