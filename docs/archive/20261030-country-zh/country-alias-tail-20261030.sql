-- country_aliases 零头缺口补录 2026-10-30（无国家码 64 行的逐个收尾，用户令：完整）。
-- French Polynesia 为新增 country 行（表原本无此海外领地）；其余为既有 canonical 的别名变体。
-- 留置不补（垃圾名，非国家）："/"×14、"Of"、"Consultancy Services"。
-- 回滚：DELETE FROM country_aliases WHERE source_ref='seed:gap-aliases-20261030b';

-- 0) 预检：目标 country canonical 存在性
SELECT v.canonical AS canonical_missing FROM (
  VALUES ROW('Turkey','Republic of Trkiye'), ROW('Yemen','Yemen, Republic of'),
         ROW('Kazakhstan','Republic of Kazakhstan'), ROW('Philippines','Batangas'),
         ROW('Philippines','Samar'), ROW('Philippines','Kalinga'), ROW('Philippines','Bataan'),
         ROW('Philippines','Aurora'), ROW('Philippines','Surigao Del Norte'),
         ROW('Philippines','Sorsogon'), ROW('Philippines','Pampanga'), ROW('Philippines','Guimaras'),
         ROW('Philippines','Abra'), ROW('Philippines','Sarangani'), ROW('Philippines','Bohol')
) AS v(canonical, alias)
LEFT JOIN (SELECT DISTINCT canonical FROM country_aliases WHERE is_active=1 AND kind='country') c
  ON c.canonical = v.canonical
WHERE c.canonical IS NULL;

-- 1) 别名变体（country）
INSERT IGNORE INTO country_aliases (canonical, country_code, alias, kind, name_i18n, is_active, source_ref)
SELECT c.canonical, c.cc, v.alias, 'country', c.ni, 1, 'seed:gap-aliases-20261030b'
  FROM (
    VALUES ROW('Republic of Trkiye','Turkey'), ROW('Yemen, Republic of','Yemen'),
           ROW('Republic of Kazakhstan','Kazakhstan'), ROW('Batangas','Philippines'),
           ROW('Samar','Philippines'), ROW('Kalinga','Philippines'), ROW('Bataan','Philippines'),
           ROW('Aurora','Philippines'), ROW('Surigao Del Norte','Philippines'),
           ROW('Sorsogon','Philippines'), ROW('Pampanga','Philippines'), ROW('Guimaras','Philippines'),
           ROW('Abra','Philippines'), ROW('Sarangani','Philippines'), ROW('Bohol','Philippines')
  ) AS v(alias, canonical)
  JOIN (
    SELECT canonical, MIN(country_code) AS cc, MIN(name_i18n) AS ni
      FROM country_aliases WHERE is_active=1 AND kind='country' GROUP BY canonical
  ) c ON c.canonical = v.canonical;

-- 2) 新 country 行：French Polynesia（法属波利尼西亚 PF，表原本无）
INSERT IGNORE INTO country_aliases (canonical, country_code, alias, kind, name_i18n, is_active, source_ref)
SELECT 'French Polynesia', 'PF', 'French Polynesia', 'country',
       JSON_OBJECT('zh','法属波利尼西亚'), 1, 'seed:gap-aliases-20261030b';

-- 3) 验证：应 16；抽查
SELECT COUNT(*) AS inserted FROM country_aliases WHERE source_ref='seed:gap-aliases-20261030b';
SELECT canonical, alias, country_code FROM country_aliases WHERE source_ref='seed:gap-aliases-20261030b'
  AND alias IN ('Republic of Trkiye','French Polynesia','Bohol');
