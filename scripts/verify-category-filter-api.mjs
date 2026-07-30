// API 端到端验证（只读）：直连 /api/notices 校验分类筛选真实返回
const BASE = "http://127.0.0.1:3039";

const segs = [
  ["A", 100], ["B", 101], ["C", 102], ["D", 103], ["E", 104],
  ["F", 105], ["G", 106], ["H", 107], ["I", 108], ["J", 109],
];

const get = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
};

const run = async () => {
  const all = await get("/api/notices?page=1&page_size=1");
  console.log("1.不选分类 total:", all.total ?? all.pagination?.total ?? JSON.stringify(Object.keys(all)));

  let sum = 0;
  for (const [code, id] of segs) {
    const t0 = Date.now();
    const r = await get(`/api/notices?code_id=${id}&page=1&page_size=1`);
    const total = r.total ?? r.pagination?.total ?? 0;
    sum += Number(total);
    console.log(`2.${code}(code_id=${id}) total=${total}  ${Date.now() - t0}ms`);
  }
  console.log("2a.十大类 total 相加:", sum);

  // 二级 / 三级
  for (const [label, id] of [["81000000(二级)", 107371], ["81100000(三级)", 107372], ["81101500(四级)", 108783]]) {
    const r = await get(`/api/notices?code_id=${id}&page=1&page_size=1`);
    console.log(`3.${label} total=${r.total ?? r.pagination?.total}`);
  }

  // 跨类可见性：用 q 精准定位同一公告，验证它在 E 与 J 两个大类筛选下均出现
  // （page_size 上限 30，直接翻页找不到排序靠后的公告，故用关键词收窄）
  const target = process.env.TARGET_NOTICE_ID || "24774";
  const targetQ = process.env.TARGET_Q || "";
  if (targetQ) {
    for (const [code, id] of [["E", 104], ["J", 109]]) {
      const r = await get(`/api/notices?code_id=${id}&q=${encodeURIComponent(targetQ)}&page=1&page_size=30`);
      const items = r.items ?? r.data ?? r.notices ?? [];
      const found = items.some((it) => String(it.id) === target);
      console.log(`4.公告 ${target} 在 ${code} 大类 + q="${targetQ}" 结果中找到:`, found, `(返回 ${items.length} 条)`);
    }
  } else {
    console.log("4.跳过跨类可见性（未传 TARGET_Q），请用 TARGET_Q=<标题片段> 重跑");
  }

  // 单类结果内无重复（page_size 服务端上限 30）
  const r = await get("/api/notices?code_id=109&page=1&page_size=30");
  const ids = (r.items ?? r.data ?? r.notices ?? []).map((it) => String(it.id));
  console.log(`5.J 首页 ${ids.length} 条，去重后 ${new Set(ids).size} 条，无重复:`, ids.length === new Set(ids).size);

  // 组合筛选：大类 + 关键词（参数名是 q）应明显收窄
  const comboBase = await get("/api/notices?code_id=109&page=1&page_size=1");
  const combo = await get("/api/notices?code_id=109&q=maintenance&page=1&page_size=1");
  const baseTotal = comboBase.total ?? comboBase.pagination?.total;
  const comboTotal = combo.total ?? combo.pagination?.total;
  console.log(`6.J total=${baseTotal} → J + q=maintenance total=${comboTotal}，已收窄:`, Number(comboTotal) < Number(baseTotal));
};

run().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
