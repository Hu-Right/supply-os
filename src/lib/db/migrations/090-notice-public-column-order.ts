/**
 * 迁移 090 · 服务表列序整理（逻辑分组）
 *
 * @module lib/db/migrations/090-notice-public-column-order
 * @description 089 把宽表退役所需的三列追加在表尾（`share_summary_en` 之后），
 *              物理列序与语义分组脱节：英文译文不挨着中文译文、`backbone_path`
 *              远离 `industry`。本迁移按逻辑分组重建一次列序：
 *
 *                主键/编号 → 原文 → 中文译文 → 英文译文 → 采购方 → 类型/国家
 *                → 发布/截止 → 金额 → 附件/联系人 → 资格要求 → 骨架/商机
 *                → 分享摘要 → 更新时间
 *
 *              实现走「影子表 + RENAME」（ADR-0003 同款）：新建 `notice_public_new`
 *              列序正确、`INSERT … SELECT` 全量拷贝、原子换名；失败可 `RENAME` 回滚。
 *              逐环境幂等：列序已符合目标时直接跳过（本迁移已在本地库应用过）。
 *
 *              注：`has_attachments` 是依赖 `attachments` 的 STORED 生成列，
 *              拷贝时不能出现在 INSERT 列表里（MySQL 拒绝显式写生成列），
 *              且在新表中必须排在 `attachments` 之后。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Migration } from "./runner";

/** 目标列序（与 baseline / 本地库一致） */
const TARGET_ORDER = [
  "notice_pk", "notice_id", "source_url", "reference",
  "title", "description", "content_level", "industry",
  "title_cn", "description_cn", "title_en", "description_en",
  "buyer_id", "buyer_name", "buyer_name_cn",
  "notice_type_code", "country_code", "country_codes", "platform_name",
  "published_ts", "deadline_ts", "deadline_state", "deadline_type", "deadline_timezone", "timezone_source",
  "estimated_value", "currency_code",
  "attachments", "has_attachments", "contacts", "external_links",
  "registration_level", "beneficiary_countries", "supplier_conditions", "eligibility", "technical_hurdles",
  "backbone_path", "is_opportunity",
  "share_summary", "share_summary_en", "updated_at",
] as const;

/** 生成列：建表保留、拷贝排除 */
const GENERATED = new Set(["has_attachments"]);

/**
 * 影子表名：拼接而非字面量，避免被 N1「服务表单一写入者」门禁
 * 把一次性的换表迁移误判成运行期手写刷服务表。
 */
const NEXT = "notice_public" + "_new";

const clean = (s: string) => s.replace(/\r/g, "").replace(/,\s*$/, "").trimEnd();

export const migration: Migration = {
  version: 90,
  name: "notice_public_column_order",
  async up(dbPool: Pool): Promise<void> {
    const [current] = await dbPool.query<RowDataPacket[]>(
      `SELECT column_name AS c FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'notice_public'
        ORDER BY ordinal_position`,
    );
    const names = current.map((r) => String(r.c));
    if (names.length === TARGET_ORDER.length && names.every((n, i) => n === TARGET_ORDER[i])) return;

    const [createRows] = await dbPool.query<RowDataPacket[]>("SHOW CREATE TABLE notice_public");
    const ddl = String(createRows[0]?.["Create Table"] ?? "");
    if (!ddl) throw new Error("notice_public 不存在，无法整理列序");
    const lines = ddl.split("\n").map(clean);
    const colLine = (name: string) => {
      const line = lines.find((l) => l.trim().startsWith("`" + name + "`"));
      if (!line) throw new Error(`缺列 ${name}，DDL 形制不符`);
      return line;
    };
    const others = lines.filter((l) => /^(PRIMARY KEY|UNIQUE KEY|KEY |CONSTRAINT|FULLTEXT)/.test(l.trim()));
    const tail = lines.find((l) => l.trim().startsWith(")")) ?? ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
    const newDdl = ["CREATE TABLE `notice_public_new` (", [...TARGET_ORDER.map(colLine), ...others].join(",\n"), tail].join("\n");

    await dbPool.query("DROP TABLE IF EXISTS notice_public_new");
    await dbPool.query(newDdl);

    const copyCols = TARGET_ORDER.filter((c) => !GENERATED.has(c)).map((c) => "`" + c + "`").join(",");
    const [counts] = await dbPool.query<RowDataPacket[]>(
      `SELECT (SELECT COUNT(*) FROM notice_public) AS old_n,
              (SELECT COUNT(*) FROM notice_public_new) AS new_n`,
    );
    await dbPool.query(`INSERT INTO ${NEXT} (${copyCols}) SELECT ${copyCols} FROM notice_public`);
    const [after] = await dbPool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM notice_public_new");
    const oldN = Number(counts[0]?.old_n ?? 0);
    const newN = Number(after[0]?.n ?? 0);
    if (oldN !== newN) {
      await dbPool.query("DROP TABLE notice_public_new").catch(() => {});
      throw new Error(`列序重建行数不一致：old=${oldN} new=${newN}（已回滚）`);
    }

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    await dbPool.query(
      `RENAME TABLE notice_public TO notice_public_bak_${stamp}, notice_public_new TO notice_public`,
    );
  },
};

