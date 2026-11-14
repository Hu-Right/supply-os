/**
 * 迁移 022 · 采购主体认证表单精简：联系人合并 + 下线字段标注
 *
 * @module server/db/migrations/022-buyer-form-slim
 * @description 2026-11 用户反馈"认证要填的信息太多"。逐字段核对消费方后确认：
 *              24 项里只有 9 项影响系统行为，其余仅存档。表单收敛为 12 项：
 *                · 保留必填：法定名称 / 采购权限 / 注册国家 / 注册号码 / 执照 / 企业邮箱 / 联系人姓名
 *                · 保留选填：税务编号 / 联系电话 / 官网 / 联系人电话 / 联系人邮箱 / 外部规则
 *                · 合并：`leader_*`（项目负责人 4 项）与 `auth_contact_*`（授权联系人 3 项）
 *                  是两套联系人，规则只读 `auth_contact_name` → 统一为后者，前者不再收集
 *                · 下线（不再收集、库列保留）：org_type / address / deliver_country /
 *                  deliver_city / fund_source / budget_status / procurement_experience
 *
 *              本迁移做两件有实际价值的事：
 *              ① **数据合并回填**：仅填过 leader_* 的历史主体，把联系人补到 auth_contact_*，
 *                 否则新表单显示为空、用户以为资料丢了（身份字段未变，不触发重核验）。
 *              ② 表注释声明下线口径，避免后人看到空列又把它加回表单。
 *
 *              刻意**不 DROP 列**：站外核验后台直连本库读取主体资料，删列可能直接打挂它的
 *              SELECT；等确认后台查询集合后再单开一轮迁移清理。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 22,
  name: "buyer_form_slim",
  async up(dbPool: Pool): Promise<void> {
    // ① 联系人合并：auth_contact_* 为空时用 leader_* 补齐（只补空，不覆盖已有值）
    await dbPool.query(
      `UPDATE procurement_buyers
          SET auth_contact_name = leader_name
        WHERE (auth_contact_name IS NULL OR auth_contact_name = '')
          AND leader_name IS NOT NULL AND leader_name <> ''`,
    );
    await dbPool.query(
      `UPDATE procurement_buyers
          SET auth_contact_phone = leader_phone
        WHERE (auth_contact_phone IS NULL OR auth_contact_phone = '')
          AND leader_phone IS NOT NULL AND leader_phone <> ''`,
    );
    await dbPool.query(
      `UPDATE procurement_buyers
          SET auth_contact_email = leader_email
        WHERE (auth_contact_email IS NULL OR auth_contact_email = '')
          AND leader_email IS NOT NULL AND leader_email <> ''`,
    );

    // ② 表注释：记录"哪些列已从表单下线"，避免后人误加回去
    await dbPool.query(
      "ALTER TABLE `procurement_buyers` COMMENT = " +
        "'采购方主体（F01）：身份与采购权限认证，verified 为正式发布前置。" +
        "2026-11 表单精简后以下列仅历史留档、不再收集：org_type/address/deliver_country/deliver_city/" +
        "fund_source/budget_status/procurement_experience/leader_name/leader_title/leader_phone/leader_email" +
        "（负责人已并入 auth_contact_*）'",
    );
  },
};
