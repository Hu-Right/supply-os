import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

/**
 * 门禁自测的共享跑具（API 契约门禁族统一使用，2026-10-27）。
 *
 * 统一口径：
 *   - runGate 以子进程跑真实门禁脚本，断言的是**退出码 + 输出文本**，不是内部函数——
 *     门禁改实现不影响自测，除非它真的不拦了；
 *   - makeFixtureRoot 在临时目录造仓库骨架（<root>/src/...），配合门禁的
 *     API_CONTRACT_SCAN_ROOT 把扫描根指过去，因此自测必须覆盖「该拦的拦得住」与
 *     「不该拦的不误伤」两面；
 *   - withFixture 保证临时目录必清，避免自测留下垃圾。
 */

// 本文件在 <repo>/tests/gates/lib/，向上三级才是仓库根
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

/** API 契约门禁族的扫描根环境变量（与 scripts/gates/lib/api-contract.mjs 一致） */
export const SCAN_ROOT_ENV = "API_CONTRACT_SCAN_ROOT";

/** 门禁脚本绝对路径（scripts/gates/<name>） */
export function gatePath(name) {
  return join(REPO_ROOT, "scripts", "gates", name);
}

/** 跑门禁：返回 { code, out }（out = stdout + stderr，便于同时断言通过行与违规行） */
export function runGate(name, env = {}) {
  // cwd 固定为仓库根：未设 SCAN_ROOT 时门禁默认扫当前仓库，不受调用方工作目录影响
  // stdio 全 pipe：门禁的告警行（如 fixture 下的「白名单待收敛」）不泄漏到自测输出，只在断言失败时一并展示
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [gatePath(name)], {
        encoding: "utf8",
        cwd: REPO_ROOT,
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** 在临时目录里按相对路径批量造文件，返回 fixture 仓库根 */
export function makeFixtureRoot(prefix, files) {
  const root = mkdtempSync(join(tmpdir(), prefix + "-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, Array.isArray(content) ? content.join("\n") : content, "utf8");
  }
  return root;
}

/** 造 fixture → 跑断言 → 必清临时目录 */
export function withFixture(prefix, files, assert) {
  const root = makeFixtureRoot(prefix, files);
  try {
    return assert(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** 以 fixture 为扫描根跑门禁 */
export function runAgainst(root, name, env = {}) {
  return runGate(name, { [SCAN_ROOT_ENV]: root, ...env });
}
