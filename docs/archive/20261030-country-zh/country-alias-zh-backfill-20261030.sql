-- country_aliases 中文国名反向注册为别名 2026-10-30。
-- 背景：表 633 国已 100% 带 zh（name_i18n.zh）与 ISO 码，但 alias 形态全为英文系
-- （含 ISO/ccTLD/重音变体）；数据源偶尔直接给中文名（如 bid_notices.country="塞尔维亚"），
-- 归一键对不上 → country_code 落空、beneficiary 回退原文。本批次把 zh 反向注册为别名，
-- 使中文原始值直接命中。region 行同样处理（63 行，文本内区域中文识别同理受益）。
-- 口径：alias=zh、canonical/code/kind/name_i18n 与该 canonical 的 country 行完全一致
-- （快照按 alias 行取 entry，中文行必须携带与英文行相同的 entry 语义）；
-- normalized_alias 对中文为原样（NFD/大写不动 CJK），与运行期 normalizeCountryKey 一致。
-- 回滚：DELETE FROM country_aliases WHERE source_ref='seed:zh-as-alias-20261030';

-- 0) 预检：待插行数 / 与既有键冲突数（应冲突极少，IGNORE 兜底）
SELECT COUNT(*) AS to_insert FROM (
  SELECT canonical, JSON_UNQUOTE(JSON_EXTRACT(name_i18n,'$.zh')) AS zh
    FROM country_aliases
   WHERE is_active=1 AND kind IN ('country','region')
     AND JSON_EXTRACT(name_i18n,'$.zh') IS NOT NULL AND JSON_EXTRACT(name_i18n,'$.zh')<>''
   GROUP BY canonical, country_code, kind, JSON_UNQUOTE(JSON_EXTRACT(name_i18n,'$.zh'))
) t;
SELECT t.zh AS zh_key_conflict FROM (
  SELECT canonical, country_code, kind, JSON_UNQUOTE(JSON_EXTRACT(name_i18n,'$.zh')) AS zh
    FROM country_aliases
   WHERE is_active=1 AND kind IN ('country','region')
     AND JSON_EXTRACT(name_i18n,'$.zh') IS NOT NULL AND JSON_EXTRACT(name_i18n,'$.zh')<>''
   GROUP BY canonical, country_code, kind, JSON_UNQUOTE(JSON_EXTRACT(name_i18n,'$.zh'))
) t JOIN country_aliases ca ON ca.normalized_alias = UPPER(TRIM(t.zh))
 GROUP BY t.zh;

-- 1) 插入（IGNORE 跳过占用键）
INSERT IGNORE INTO country_aliases (canonical, country_code, alias, kind, name_i18n, is_active, source_ref)
SELECT t.canonical, t.country_code, t.zh, t.kind, t.name_i18n, 1, 'seed:zh-as-alias-20261030'
  FROM (
    SELECT canonical, country_code, kind, name_i18n,
           JSON_UNQUOTE(JSON_EXTRACT(name_i18n,'$.zh')) AS zh
      FROM country_aliases
     WHERE is_active=1 AND kind IN ('country','region')
       AND JSON_EXTRACT(name_i18n,'$.zh') IS NOT NULL AND JSON_EXTRACT(name_i18n,'$.zh')<>''
     GROUP BY canonical, country_code, kind, name_i18n, JSON_UNQUOTE(JSON_EXTRACT(name_i18n,'$.zh'))
  ) t;

-- 2) 验证：应返回与待插数一致的行数； Serbian 抽查应返回 塞尔维亚 行
SELECT COUNT(*) AS inserted FROM country_aliases WHERE source_ref='seed:zh-as-alias-20261030';
SELECT canonical, country_code, kind FROM country_aliases WHERE alias='塞尔维亚' AND is_active=1;
