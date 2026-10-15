/**
 * 本表引用点扫描器（fs 侧口子）—— 判据的唯一实现处
 *
 * 为什么单独成模块：静态扫描取证、阶段一前置闸、防复活门禁三方都要问同一句
 * 「这一列还有没有本表的读写点」。鼓成三份实现必漂（同「SQL 列清单分隔符只能
 * 有一个出处」红线），所以把「走目录 + 取文本 + 交给 plan 的 noticeSqlRefs 判定」
 * 收敛到这里；纯判定逻辑在 notices-slim-plan.mjs，本模块只负责喂文件。
 *
 * 只读：不写库、不写文件。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { noticeSqlRefs, waiverFor } from "../notices-slim-plan.mjs";

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "coverage", "dist", "runtime", "temp"]);
const EXTS = new Set([".ts", ".tsx", ".mjs", ".cjs", ".js"]);

function* walk(dir) {
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return; // 目录不存在（如夹具根）静默跳过
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (EXTS.has(name.slice(name.lastIndexOf(".")))) yield p;
  }
}

/**
 * 扫描本表读写点，并把人工豁免项单拎出来而不是静默丢弃。
 *
 * 为什么要返回 waived 而非直接过滤掉就完事：豁免是一个**会变旧**的东西。写错的豁免
 * 与放宽判据的后果相同（真引用被静默放行），所以调用方必须能看见「今日哪些豁免真的拦到了东西」，
 * 才能报出已失效的豁免。findNoticeRefSites() 保留为只回未豁免命中的薄包装，
 * 阶段一前置闸等旧调用方行为不变。
 * @param {string} root 仓库根
 * @param {string[]} cols 待查列名
 * @param {string[]} dirs 扫描目录（默认 src/scripts/tests，与 opp 轮一档口径一致）
 * @param {string[]} selfFiles 相对路径黑名单：本工具自身必然提及列名，不算读写点
 * @returns {{sites: {file:string,col:string,count:number,sample:string}[], waived: {file:string,col:string,count:number,sample:string,reason:string}[]}}
 */
export function scanNoticeRefs(root, cols, dirs = ["src", "scripts", "tests"], selfFiles = []) {
  const sites = [];
  const waived = [];
  for (const d of dirs) {
    for (const abs of walk(join(root, d))) {
      const rel = relative(root, abs).replace(/\\/g, "/");
      // DDL 留底快照（scripts/ops/*.sql）是回滚依据，不是读写方；不排掉会让一列
      // 凭空多出 4 处「假引用」，把可删的列判成不可删
      if (selfFiles.includes(rel) || rel.endsWith(".sql")) continue;
      const text = readFileSync(abs, "utf8");
      for (const col of cols) {
        const hits = noticeSqlRefs(text, col);
        if (!hits.length) continue;
        const rec = { file: rel, col, count: hits.length, sample: hits[0] };
        const w = waiverFor(rel, col);
        if (w) waived.push({ ...rec, reason: w.reason });
        else sites.push(rec);
      }
    }
  }
  return { sites, waived };
}

/**
 * 只回未豁免的本表读写点（旧口径调用方用这个）。
 * @returns {{file:string,col:string,count:number,sample:string}[]}
 */
export function findNoticeRefSites(root, cols, dirs = ["src", "scripts", "tests"], selfFiles = []) {
  return scanNoticeRefs(root, cols, dirs, selfFiles).sites;
}
