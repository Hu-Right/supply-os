-- 别名表回填（自 buyer_translation 今日批次）2026-10-30。
-- 目的：① 统一大小写变体——构建时 normalizeBuyerCountry 经 alias 折叠所有变体到
--   canonical（=alias=选定写法），重建后服务表 buyer_name 单形，bt 查表必命中；
--   ② 首页卡片链（enrichAgencyI18n）与列表页同步获得同一中文。
-- 范围：今日（2026-10-30）经人工/严格规则确认的全部 bt 行——不触碰 10-29 机翻行。
-- canonical=alias 决策照旧（不做 en 美化，防重建后中文断链）。
-- 键冲突（uk_normalized_alias 已被其他行占用）由 INSERT IGNORE 跳过并报告。

-- 0) 预检：今日批次行数与已占用键数
SELECT COUNT(*) AS bt_today_rows FROM buyer_translation
 WHERE translated_at >= UNIX_TIMESTAMP('2026-10-30 00:00:00')
   AND buyer_name_zh IS NOT NULL AND buyer_name_zh <> '' AND status = 'translated';
SELECT COUNT(*) AS key_occupied FROM buyer_translation bt
 WHERE bt.translated_at >= UNIX_TIMESTAMP('2026-10-30 00:00:00')
   AND bt.buyer_name_zh IS NOT NULL AND bt.buyer_name_zh <> '' AND bt.status='translated'
   AND EXISTS (SELECT 1 FROM agency_aliases aa
        WHERE aa.normalized_alias = UPPER(TRIM(bt.buyer_name)));

-- 1) 回填（IGNORE 跳过占用键）
INSERT IGNORE INTO agency_aliases (canonical, alias, name_i18n, is_active, source_ref)
SELECT bt.buyer_name, bt.buyer_name,
       JSON_OBJECT('zh', bt.buyer_name_zh), 1, 'zh-bt-fill-20261030'
  FROM buyer_translation bt
 WHERE bt.translated_at >= UNIX_TIMESTAMP('2026-10-30 00:00:00')
   AND bt.buyer_name_zh IS NOT NULL AND bt.buyer_name_zh <> '' AND bt.status = 'translated';

-- 2) 验证：本批次落表行数
SELECT COUNT(*) AS inserted FROM agency_aliases WHERE source_ref = 'zh-bt-fill-20261030';
