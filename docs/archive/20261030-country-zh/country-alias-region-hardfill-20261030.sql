-- region 别名硬编码重插 2026-10-30（前批 seed:gap-aliases-20261030 的 region 段用 JOIN
-- 取 region 行信息，静默漏插 4 条——整串 LAC 等；本批把 canonical/kind/zh 全部显式写死，
-- 不再依赖 JOIN，IGNORE 兜底重复。已存在的不受影响。
-- 回滚：DELETE FROM country_aliases WHERE source_ref='seed:gap-region-aliases-20261030';

INSERT IGNORE INTO country_aliases (canonical, country_code, alias, kind, name_i18n, is_active, source_ref) VALUES
('Multi-Country', NULL, 'Multinational', 'region', JSON_OBJECT('zh','多国'), 1, 'seed:gap-region-aliases-20261030'),
('Global',        NULL, 'World',        'region', JSON_OBJECT('zh','全球'), 1, 'seed:gap-region-aliases-20261030'),
('Global',        NULL, 'Worldwide',    'region', JSON_OBJECT('zh','全球'), 1, 'seed:gap-region-aliases-20261030'),
('Pacific 1',     NULL, 'Pacific 2',    'region', JSON_OBJECT('zh','太平洋地区'), 1, 'seed:gap-region-aliases-20261030'),
('Latin America and the Caribbean', NULL, 'Latin America and the Caribbean', 'region', JSON_OBJECT('zh','拉丁美洲和加勒比'), 1, 'seed:gap-region-aliases-20261030'),
('Latin America and the Caribbean', NULL, 'Latin America and the Caribbean, Northern America', 'region', JSON_OBJECT('zh','拉丁美洲和加勒比'), 1, 'seed:gap-region-aliases-20261030');

SELECT COUNT(*) AS inserted FROM country_aliases WHERE source_ref='seed:gap-region-aliases-20261030';
SELECT canonical, alias FROM country_aliases WHERE alias='Latin America and the Caribbean, Northern America';
