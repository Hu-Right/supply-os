/**
 * SQL 列清单拼接：全项目唯一负责「列间分隔符」的地方
 *
 * @module lib/utils/sql-columns
 * @description 规则只有一条：**列片段本身不许带逗号**，分隔符一律由本函数插入。
 *              反例（曾是线上事故）：`const treSelect = "tre.title_tr AS title_en,"` 拼在
 *              `FROM` 前 → MySQL 1064，「相似公告」接口静默失败三周而单测全绿
 *              （测试 mock 了 pool.query，压根不解析 SQL）。
 *              带逗号的片段现在直接抛错：宁可请求期报「片段写错了」，也不要让库收到
 *              一条语法不合法的 SQL。分隔符只有一个出处，就不存在「谁负责补逗号」的歧义。
 * @invariants
 *              I1 返回值里相邻列之间恰有一个 ", "，首尾无逗号
 *              I2 falsy（"" / false / null / undefined）与纯空白片段被剔除，不产生空列位
 *              I3 任何片段带首/尾逗号 ⇒ 抛错，不静默清洗
 */

/** 参与拼接的列：字符串为一段，falsy 表示该列本次不启用（条件列） */
export type SqlColumnPart = string | false | null | undefined;

const TRAILING_COMMA = /,$/;
const LEADING_COMMA = /^,/;

/**
 * 把若干列片段拼成 SELECT 里的列清单。
 * @example
 *   columns(
 *     "n.id, n.title",                       // 固定列可整段给出（段内自己用逗号分隔）
 *     locale && "tr.title_tr AS title_i18n", // 条件列：不启用传 falsy
 *     "tre.title_tr AS title_en",            // 末列同样不带逗号
 *   )
 */
export function columns(...parts: SqlColumnPart[]): string {
  const kept: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    const text = part.trim();
    if (text === "") continue;
    if (TRAILING_COMMA.test(text) || LEADING_COMMA.test(text)) {
      throw new Error(`[sql-columns] 列片段不得自带分隔符（逗号由 columns() 统一插入）：${text}`);
    }
    kept.push(text);
  }
  if (kept.length === 0) {
    throw new Error("[sql-columns] 列清单不能为空：空 SELECT 不是合法 SQL");
  }
  return kept.join(", ");
}
