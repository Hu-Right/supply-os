/**
 * 公告译文读侧门控回归（2026-11-24 口径 A+3）
 *
 * 口径：译文（notice_translation）是付费权益，免费/个人档没有；无权益账号看到的
 * 必须是原文——标题、正文一起回退，不允许「标题中文、正文原文」的半翻译状态。
 * 这里锁住两件事：① 译文派生列能被完整剔除且不动原文列；② 匿名不查库、直接按无权益处理。
 */
import { describe, it, expect, vi } from "vitest";

import {
  canReadNoticeTranslation,
  maskTranslationFieldList,
  maskTranslationFields,
} from "@/lib/services/notice-public/translation-access";

describe("maskTranslationFields", () => {
  it("剔除全部译文派生列，保留原文列与其它字段", () => {
    const item = {
      noticePk: 7,
      title: "Food raw material procurement",
      titleCn: "食品原料采购",
      titleI18n: "食品原料采购（机翻）",
      titleEn: "Food raw material procurement",
      description: "Élelmiszer alapanyag beszerzése",
      descriptionCn: "食品原料采购",
      descriptionI18n: null,
      descriptionEn: "Food raw material procurement",
      buyerName: "Buyer",
      buyerNameCn: "采购方",
    };

    const masked = maskTranslationFields(item);

    expect(masked).toBe(item);
    expect(Object.keys(masked).sort()).toEqual(
      ["buyerName", "buyerNameCn", "description", "noticePk", "title"].sort(),
    );
    // 原文列必须原样保留
    expect(masked.title).toBe("Food raw material procurement");
    expect(masked.description).toBe("Élelmiszer alapanyag beszerzése");
    // 机构中文名不是译文派生列（卖方实体快照），不参与裁剪
    expect(masked.buyerNameCn).toBe("采购方");
  });

  it("没有译文列时不产生新键、不报错", () => {
    const item = { noticePk: 1, title: "Only original" };
    expect(maskTranslationFields(item)).toEqual({ noticePk: 1, title: "Only original" });
  });

  it("批量版本逐条剔除", () => {
    const list = [
      { noticePk: 1, title: "a", titleCn: "甲" },
      { noticePk: 2, title: "b", descriptionCn: "乙" },
    ];
    const masked = maskTranslationFieldList(list);
    expect(masked.map((i) => Object.keys(i))).toEqual([
      ["noticePk", "title"],
      ["noticePk", "title"],
    ]);
  });
});

describe("canReadNoticeTranslation", () => {
  it("匿名（userId 为空）恒 false，且不应触发权益查询", async () => {
    const repo = { isEntitled: vi.fn(async () => true) };
    await expect(canReadNoticeTranslation(repo, null)).resolves.toBe(false);
    await expect(canReadNoticeTranslation(repo, undefined)).resolves.toBe(false);
    await expect(canReadNoticeTranslation(repo, 0)).resolves.toBe(false);
    expect(repo.isEntitled).not.toHaveBeenCalled();
  });

  it("有权益（企业档）返回 true", async () => {
    const repo = { isEntitled: vi.fn(async () => true) };
    await expect(canReadNoticeTranslation(repo, 42)).resolves.toBe(true);
    expect(repo.isEntitled).toHaveBeenCalledWith(42, "notice_translation");
  });

  it("无权益（免费/个人档）返回 false", async () => {
    const repo = { isEntitled: vi.fn(async () => false) };
    await expect(canReadNoticeTranslation(repo, 43)).resolves.toBe(false);
  });
});
