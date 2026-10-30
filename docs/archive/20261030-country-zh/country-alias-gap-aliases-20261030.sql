-- country_aliases 真解析缺口补录 + 区域别名 2026-10-30（巡检 A 面清单逐个补，用户拍板）。
-- 口径：alias=库内 raw 实形（HEX 级一致由 IGNORE+运行清洗兜底）；country 行的
-- canonical/code/name_i18n 从既有 canonical 行取（JOIN 去重取 MIN），保持 entry 语义一致。
-- 多国/区域主干不在此文件：notice-core region→ZZ 保留码分支（构建层）+ 前端 ZZ 特判，
-- 既有 region 行（Multi-Country/Global/Pacific 1/Eastern and Southern Africa...）直接生效。
-- 回滚：DELETE FROM country_aliases WHERE source_ref='seed:gap-aliases-20261030';

-- 0) 预检：目标 canonical 均须存在（缺失即本批次需人工核对）
SELECT v.canonical AS canonical_missing, v.alias AS alias_missing FROM (
  VALUES ROW('Gambia','Gambia, The'), ROW('Gambia','Gambia (The)'),
         ROW('Egypt','Egypt, Arab Republic of'), ROW('Tunisia','Tunisie'),
         ROW('Somalia','Somali'), ROW('Sao Tome and Principe','São Tomé'),
         ROW('Guinea-Bissau','Guinée Bissau'),
         ROW('Saint Vincent and the Grenadines','St. Vincent and the Grenadines'),
         ROW('Hong Kong','Hong Kong, Special Administrative Region of China'),
         ROW('Philippines','Metro Manila'), ROW('Philippines','Leyte'), ROW('Philippines','Tarlac'),
         ROW('Philippines','Bukidnon'), ROW('Philippines','Camiguin'),
         ROW('Philippines','Lanao Del Norte'), ROW('Philippines','Misamis Occidental'),
         ROW('Philippines','Misamis Oriental'), ROW('Philippines','Agusan Del Norte'),
         ROW('Philippines','Camarines Sur')
  ) AS v(canonical, alias)
  LEFT JOIN (SELECT DISTINCT canonical FROM country_aliases WHERE is_active=1 AND kind='country') c
    ON c.canonical = v.canonical
  WHERE c.canonical IS NULL;

-- 1) country 真缺口别名（alias 逐个人工核对自巡检 A 面 raw 原形）
INSERT IGNORE INTO country_aliases (canonical, country_code, alias, kind, name_i18n, is_active, source_ref)
SELECT c.canonical, c.cc, v.alias, 'country', c.ni, 1, 'seed:gap-aliases-20261030'
  FROM (
    VALUES ROW('Gambia, The','Gambia'), ROW('Gambia (The)','Gambia'),
           ROW('Egypt, Arab Republic of','Egypt'), ROW('Tunisie','Tunisia'),
           ROW('Somali','Somalia'), ROW('São Tomé','Sao Tome and Principe'),
           ROW('Guinée Bissau','Guinea-Bissau'),
           ROW('St. Vincent and the Grenadines','Saint Vincent and the Grenadines'),
           ROW('Hong Kong, Special Administrative Region of China','Hong Kong'),
           ROW('Metro Manila','Philippines'), ROW('Leyte','Philippines'), ROW('Tarlac','Philippines'),
           ROW('Bukidnon','Philippines'), ROW('Camiguin','Philippines'),
           ROW('Lanao Del Norte','Philippines'), ROW('Misamis Occidental','Philippines'),
           ROW('Misamis Oriental','Philippines'), ROW('Agusan Del Norte','Philippines'),
           ROW('Camarines Sur','Philippines')
  ) AS v(alias, canonical)
  JOIN (
    SELECT canonical, MIN(country_code) AS cc, MIN(name_i18n) AS ni
      FROM country_aliases WHERE is_active=1 AND kind='country'
     GROUP BY canonical
  ) c ON c.canonical = v.canonical;

-- 2) 区域别名（canonical 指既有 region 行；Latin America and the Caribbean 为新 region 行）
INSERT IGNORE INTO country_aliases (canonical, country_code, alias, kind, name_i18n, is_active, source_ref)
SELECT 'Latin America and the Caribbean', NULL, 'Latin America and the Caribbean',
       'region', JSON_OBJECT('zh','拉丁美洲和加勒比'), 1, 'seed:gap-aliases-20261030';

INSERT IGNORE INTO country_aliases (canonical, country_code, alias, kind, name_i18n, is_active, source_ref)
SELECT r.canonical, NULL, v.alias, 'region', r.ni, 1, 'seed:gap-aliases-20261030'
  FROM (
    VALUES ROW('Multinational','Multi-Country'), ROW('World','Global'), ROW('Worldwide','Global'),
           ROW('Pacific 2','Pacific 1'),
           ROW('Latin America and the Caribbean','Latin America and the Caribbean'),
           ROW('Latin America and the Caribbean, Northern America','Latin America and the Caribbean')
  ) AS v(alias, canonical)
  JOIN (
    SELECT canonical, MIN(name_i18n) AS ni FROM country_aliases
     WHERE is_active=1 AND kind='region' GROUP BY canonical
  ) r ON r.canonical = v.canonical;

-- 3) 验证：新别名行数（两段合计应 ≥25）；抽查可解析
SELECT COUNT(*) AS inserted FROM country_aliases WHERE source_ref='seed:gap-aliases-20261030';
SELECT canonical, alias, kind, country_code FROM country_aliases
 WHERE source_ref='seed:gap-aliases-20261030' AND alias IN ('Gambia, The','Tunisie','Metro Manila','Multinational');
