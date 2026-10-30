-- 受援国说明文字整串别名 2026-10-30：`Multiple destinations (see the Countries or
-- territories tab)` 72 行——括号转逗号后第二段是说明文字不可命中，整串注册为
-- Multi-Country region 别名最干净。回滚：DELETE WHERE source_ref='seed:gap-aliases-20261030c';
INSERT IGNORE INTO country_aliases (canonical, country_code, alias, kind, name_i18n, is_active, source_ref)
SELECT 'Multi-Country', NULL, 'Multiple destinations (see the Countries or territories tab)',
       'region', JSON_OBJECT('zh','多国'), 1, 'seed:gap-aliases-20261030c';
SELECT COUNT(*) AS inserted FROM country_aliases WHERE source_ref='seed:gap-aliases-20261030c';
