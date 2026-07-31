/**
 * 验证 POST /api/admin/sync-bridge 鉴权中间件三分支行为（不连真实库，dbPool 用桩）：
 *   1. 未配置 ADMIN_API_TOKEN → 503 fail-closed；
 *   2. 已配置但令牌缺失/错误 → 401；
 *   3. x-admin-token 或 Authorization: Bearer 携带正确令牌 → 200。
 * 运行：node ./node_modules/tsx/dist/cli.mjs scripts/verify-admin-auth.mjs
 */
import express from "express";
import { createAdminRouter } from "../server/routes/admin.routes";

// dbPool 桩：sync-bridge 响应先行返回，后台回填在桩上空跑，不影响断言
const ctx = { dbPool: { query: async () => [[]], execute: async () => [[]] } };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(base, headers = {}) {
  const res = await fetch(`${base}/api/admin/sync-bridge`, { method: "POST", headers });
  return { status: res.status, body: await res.json() };
}

async function withServer(fn) {
  const app = express();
  app.use(createAdminRouter(ctx));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

// 分支 1：未配置令牌 → 503
delete process.env.ADMIN_API_TOKEN;
await withServer(async (base) => {
  const r = await request(base);
  check("未配置 ADMIN_API_TOKEN → 503 fail-closed", r.status === 503, `status=${r.status} msg=${r.body.message}`);
});

// 分支 2/3：配置令牌后校验
process.env.ADMIN_API_TOKEN = "test-token-1234567890";
await withServer(async (base) => {
  const missing = await request(base);
  check("令牌缺失 → 401", missing.status === 401, `status=${missing.status}`);

  const wrong = await request(base, { "x-admin-token": "wrong-token" });
  check("令牌错误 → 401", wrong.status === 401, `status=${wrong.status}`);

  const viaHeader = await request(base, { "x-admin-token": "test-token-1234567890" });
  check("x-admin-token 正确 → 200", viaHeader.status === 200, `status=${viaHeader.status} success=${viaHeader.body.success}`);

  const viaBearer = await request(base, { Authorization: "Bearer test-token-1234567890" });
  check("Authorization: Bearer 正确 → 200", viaBearer.status === 200, `status=${viaBearer.status} success=${viaBearer.body.success}`);
});

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? "\n全部通过" : `\n${failed.length} 项失败`);
// 等后台回填 Promise 收尾，避免 process.exit 与待定异步句柄竞争（Windows 下会触发 libuv 断言崩溃）
await new Promise((r) => setTimeout(r, 200));
process.exit(failed.length === 0 ? 0 : 1);
