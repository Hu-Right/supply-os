#!/usr/bin/env node
/** 只服务生产前端产物，不导入 Next runtime 或 instrumentation，不连接业务数据库。 */
import { createServer } from "node:http";
import { readFile, access } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const appDir = resolve(".next/server/app");
const staticDir = resolve(".next/static");
const publicDir = resolve("public");
const port = Number(process.env.STYLE_SMOKE_PORT || 4173);
await access(resolve(appDir, "showroom.html"));
const version = (await readFile(".next/BUILD_ID", "utf8")).trim();
const fixtures = {
  "/api/system/icp": { bah: "" },
  "/api/system/links": [],
  "/api/system/version": { version },
  "/api/catalog/country-name-map": {
    countries: { China: "中国" },
    regions: { Asia: "亚洲" },
    zhToEn: { 中国: "China" },
  },
};
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".rsc": "text/x-component",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

const server = createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (Object.hasOwn(fixtures, pathname)) {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(request.method === "HEAD" ? undefined : JSON.stringify(fixtures[pathname]));
      return;
    }
    if (pathname.startsWith("/api/")) {
      response.writeHead(501).end("API 不在样式测试的只读样例中");
      return;
    }
    let base = publicDir;
    let path = pathname;
    if (pathname.startsWith("/_next/static/")) {
      base = staticDir;
      path = pathname.slice("/_next/static".length);
    } else if (!extname(pathname)) {
      base = appDir;
      path = `${pathname === "/" ? "/showroom" : pathname}${request.headers.rsc === "1" ? ".rsc" : ".html"}`;
    }
    const file = resolve(base, `.${path}`);
    if (!file.startsWith(`${base}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(file)] || "application/octet-stream",
      "Cache-Control": base === staticDir ? "public, max-age=31536000, immutable" : "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    const missing = error.code === "ENOENT" || error.code === "EISDIR";
    if (!missing) console.error("[style-smoke] 请求失败", error);
    response.writeHead(missing ? 404 : 500).end();
  }
});
server.listen(port, "127.0.0.1", () => console.log(`生产前端产物测试：http://127.0.0.1:${port}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());
