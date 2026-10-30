-- 别名表 zh → buyer_translation 回填 2026-10-30（第二日批次）。
-- 背景：买家别名行（agency_aliases）有 zh 而 buyer_translation 只有「原始名/手工登记名」的行，
-- canonical 形式的 buyer_name（重建后服务表 buyer_name 的实际取值）在 bt 无行 →
-- 列表页 buyer_name_cn 空（10-29 canonical 美化批次的已登记隐患，本批次正式补平）。
-- 同时修复 170 行错位残留中「bt.buyer_name 字节 ≠ 别名 canonical」的部分。
--
-- 语义：bt.buyer_name 必须与别名 canonical **字节一致**（构建 Map 键区分大小写）；
-- canonical 是重建后 np.buyer_name 的统一形态（normalizeBuyerCountry 经 alias 折叠所有变体）。
-- 键派生实测：buyer_key = SHA2(UPPER(TRIM(buyer_name)),256)。
-- 回滚：DELETE FROM buyer_translation WHERE source_hash LIKE CONCAT('%', SHA2('alias-sync-20261030|x',256), '%')
--   不可行（哈希混淆）——改为按 translated_at 时间戳回查（本批次执行时间见 updated_at）。

-- 0) 预检：别名行带 zh 的总数与待插行数
SELECT COUNT(*) AS alias_zh_total FROM agency_aliases
 WHERE is_active=1 AND JSON_EXTRACT(name_i18n,'$.zh') IS NOT NULL;
SELECT COUNT(*) AS to_insert FROM agency_aliases aa
 WHERE aa.is_active=1 AND JSON_EXTRACT(aa.name_i18n,'$.zh') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM buyer_translation bt
        WHERE bt.buyer_key = SHA2(UPPER(TRIM(aa.canonical)),256));

-- 1) canonical 名去裸串键旧行（备份 SELECT 见 alias-to-bt-sync-backup.sql；上一步实测 0 行）
-- 同一实体多个别名行 canonical 大小写不同（如 KPT 两种写法）会撞同一 SHA 键：
-- 先按键收敛 alias canonical 到 MIN 形，再建临时表，保证一键一行。
CREATE TEMPORARY TABLE tmp_alias_canon AS
SELECT MIN(canonical) AS canonical, MIN(zh) AS zh
  FROM (
    SELECT aa.canonical, JSON_UNQUOTE(JSON_EXTRACT(aa.name_i18n,'$.zh')) AS zh,
           SHA2(UPPER(TRIM(aa.canonical)),256) AS ck
      FROM agency_aliases aa
     WHERE aa.is_active=1 AND JSON_EXTRACT(aa.name_i18n,'$.zh') IS NOT NULL
  ) x GROUP BY ck;

UPDATE agency_aliases aa
  JOIN tmp_alias_canon t ON SHA2(UPPER(TRIM(aa.canonical)),256) = SHA2(UPPER(TRIM(t.canonical)),256)
   SET aa.canonical = t.canonical
 WHERE aa.canonical <> t.canonical;

DELETE bt FROM buyer_translation bt
  JOIN tmp_alias_canon t ON bt.buyer_name = t.canonical
 WHERE bt.buyer_key <> SHA2(UPPER(TRIM(t.canonical)),256);

-- 2) 插入 canonical 形式的 bt 行（键=大写 SHA2，与既有行冲突则跳过）
INSERT INTO buyer_translation (buyer_key, buyer_name, buyer_name_zh, status, source_hash, translated_at, updated_at)
SELECT SHA2(UPPER(TRIM(t.canonical)),256), t.canonical, t.zh, 'translated',
       SHA2(CONCAT('alias-sync-20261030|', UPPER(TRIM(t.canonical))),256),
       UNIX_TIMESTAMP(), UNIX_TIMESTAMP()
  FROM tmp_alias_canon t
 WHERE NOT EXISTS (SELECT 1 FROM buyer_translation bt
        WHERE bt.buyer_key = SHA2(UPPER(TRIM(t.canonical)),256));

-- 3) 错位修复：np 空中文、且其名命中别名键、bt 行 buyer_name 与 canonical 字节不一致的，
--    把 bt.buyer_name 拉齐为 canonical（键不变，重建后必命中）
UPDATE buyer_translation bt
  JOIN (SELECT DISTINCT p.buyer_name AS np_name
          FROM notice_public p
         WHERE p.buyer_name IS NOT NULL AND p.buyer_name <> ''
           AND (p.buyer_name_cn IS NULL OR p.buyer_name_cn = '')) np ON np.np_name = bt.buyer_name
  JOIN agency_aliases aa ON aa.normalized_alias = UPPER(TRIM(bt.buyer_name))
   SET bt.buyer_name = aa.canonical, bt.updated_at = UNIX_TIMESTAMP()
 WHERE bt.buyer_name <> aa.canonical
   AND JSON_EXTRACT(aa.name_i18n,'$.zh') IS NOT NULL
   AND bt.buyer_name_zh IS NOT NULL AND bt.buyer_name_zh <> '';

-- 4) 验证：np 空中文 & sha 键中文可用 的行数应显著下降
SELECT COUNT(*) AS still_unmatched FROM notice_public p
 WHERE p.buyer_name IS NOT NULL AND p.buyer_name <> ''
   AND (p.buyer_name_cn IS NULL OR p.buyer_name_cn = '')
   AND EXISTS (SELECT 1 FROM buyer_translation bt
        WHERE bt.buyer_key = SHA2(UPPER(TRIM(p.buyer_name)),256)
          AND bt.buyer_name_zh IS NOT NULL AND bt.buyer_name_zh <> ''
          AND bt.status='translated');

DROP TEMPORARY TABLE tmp_alias_canon;
