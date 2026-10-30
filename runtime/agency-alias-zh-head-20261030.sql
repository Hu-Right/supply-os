-- agency_aliases 买家中文头部批次 2026-10-30（统一中文第五批：巡检清单 Top50 定名，43 INSERT + 2 存量 UPDATE）
-- 口径：绝对准确（用户 2026-10-30 重申）——只登记证据充分的确定译名，zh 纯中文，
--       别名键与库内 buyer_name 必须归一键级一致（JS normalizeAliasKey 只做 trim+大写，
--       变音/不可见字符差异会让内存快照 miss；大小写变体由归一键自然覆盖）。
--       【canonical=alias 决策】canonical 一律取原始买家名本形，不做 en 美化：
--       canonical 会在重建时回填 notice_public.buyer_name（notice-core normalizeBuyerCountry），
--       而 buyer_name_cn 的查表键（buyer_translation.buyer_name，区分大小写的 TRIM 精确匹配）
--       只有原始形态有行——canonical 一旦美化，重建后列表页中文全部丢失（10-29 批次的美化
--       canonical 存在同样隐患，未处理，见批次报告）。
-- 取证：notice_public 国别分布（模糊泛名全部单一国家）+ 标题样本（FME=巴西市政教育基金
--       学校餐食采购、Water and Sanitation 标题含 DWS）+ 外部检索核实标准中文名
--       （IIT Roorkee=鲁尔基分校、eThekwini 官方中文名=德班都会市、FACT=特拉凡科肥料与化学品
--       有限公司、Эрдэнэт үйлдвэр=额尔登特矿业公司、Дарханы төмөрлөгийн үйлдвэр=达尔汗冶金厂、
--       Belmedtechnika=白俄罗斯医疗技术公司〔明斯克国有医疗设备供应企业〕、
--       Thai e-GP 的 Bangkok=曼谷市政府〔BMA〕、PGIMER=昌迪加尔医学教育与研究研究生院）。
-- 跳过（宁缺毋假，不硬翻）：Ministerie van Defensie（荷比同名 142:28，沿用 10-29 复核决定）/
--   Sellbuy Limited（GE 176 条，标题全是"摩尔多瓦官方语言"模板废话，实体存疑，疑似垃圾源）/
--   Nonprofit organization（60+ 国通用标签，非真实买家名，宜走占位剔除而非翻译）/
--   "Error 500 (Server Error)!!..."（爬虫把 Google 错误页当买家名，524 条，数据脏污需归一化层剔除）。
-- 风险注记：Tourism / Public Works / Water and Sanitation 三个泛名当前 100% 南非来源
--   （南非 eTenders 门户的部门字段），若他国门户未来出现同名买家会被本表罩住——
--   月度巡检（agency-coverage.sql）覆盖复检时留意。
-- 配套：buyer_translation 同步批次见 runtime/buyer-translation-zh-head-20261030.sql
--   （列表页 buyer_name_cn 与本表 zh 必须一致）；两表落位后跑定向重建脚本
--   scripts/tools/notice-public-rebuild-buyers.ts 刷新服务表已有行。
-- 回滚：DELETE FROM agency_aliases WHERE source_ref IN ('zh-head-20261030');
--   UPDATE agency_aliases SET canonical='FUNDO MUNICIPAL DE EDUCACAO - FME', name_i18n=NULL WHERE id=1374;
--   UPDATE agency_aliases SET name_i18n=NULL WHERE id=928;

-- 0) 批次装载（单一事实源：下方所有校验与 INSERT 都从这里取值）
CREATE TEMPORARY TABLE tmp_zh_batch_20261030 (
  alias     VARCHAR(255) PRIMARY KEY,
  zh        VARCHAR(255) NOT NULL
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
INSERT INTO tmp_zh_batch_20261030 (alias, zh) VALUES
('Delhi Development Authority','德里发展局'),
('DG,BSF,MHA','印度内政部边境安全部队'),
('Archaeological Survey of India','印度考古调查局'),
('Defence Research and Development Organisation','印度国防研究与发展组织'),
('Delhi University','德里大学'),
('Indian Institute of Technology Roorkee','印度理工学院鲁尔基分校'),
('Assam Rifles - MHA','印度内政部阿萨姆步枪队'),
('Food Corporation of India','印度粮食公司'),
('Engineers India Limited,MoPNG','印度工程有限公司'),
('DG, Indo-Tibetan Border Police Force','印藏边境警察部队'),
('DG,CRPF,MHA','印度内政部中央后备警察部队'),
('Postgraduate Institute of Medical and Education and Research Chandigarh','昌迪加尔医学教育与研究研究生院'),
('The Fertilisers And Chemicals Travancore Ltd.','特拉凡科肥料与化学品有限公司'),
('NHPC Limited','印度国家水电公司'),
('Bhabha Atomic Research Centre','巴巴原子研究中心'),
('South African National Roads Agency Soc Limited (SANRAL)','南非国家公路局'),
('Road Accident Fund','南非道路事故基金'),
('Ethekwini Metropolitan Municipality','德班都会市'),
('National Research Foundation','南非国家研究基金会'),
('Air Traffic and Navigation Services Company Limited','南非空中交通与导航服务公司'),
('Kwazulu Natal - Public Works (Head Office)','夸祖鲁-纳塔尔省公共工程部（总部）'),
('KZN Growth Fund Trust','夸祖鲁-纳塔尔省增长基金信托'),
('Transnet National Ports Authority','南非国家港务局'),
('Water and Sanitation','南非水与卫生部'),
('Tourism','南非旅游部'),
('Public Works','南非公共工程部'),
('Miejskie Przedsiębiorstwo Wodociągów i Kanalizacji w m. st. Warszawie S.A.','华沙市自来水与污水处理股份公司'),
('PKP Polskie Linie Kolejowe S.A.','波兰铁路线路股份公司'),
('KOMENDA GŁÓWNA POLICJI','波兰国家警察总局'),
('Gemeente Rotterdam','鹿特丹市政府'),
('London Borough of Haringey','伦敦哈林盖区'),
('Newry, Mourne and Down District Council (NMD)','纽里-莫恩-唐区议会'),
('Ředitelství silnic a dálnic s. p.','捷克公路与高速公路管理局'),
('Servicio de Salud de las Illes Balears','巴利阿里群岛卫生服务局'),
('MONTEPUT DOO PODGORICA','波德戈里察蒙特普特公司'),
('The Belmedtechnical','白俄罗斯医疗技术公司'),
('Эрдэнэт үйлдвэр','额尔登特矿业公司'),
('Дарханы төмөрлөгийн үйлдвэр','达尔汗冶金厂'),
('ENERGY, DEPARTMENT OF','美国能源部'),
('Manitoba Transportation and Infrastructure - Tendering and Contracts','马尼托巴省交通与基础设施厅'),
('The Ministry of Internal Affairs of Georgia','格鲁吉亚内务部'),
('Nepal Electricity Authority','尼泊尔电力局'),
('DIRECCION GENERAL DE AERONAUTICA CIVIL','智利民航总局'),
('Bangkok','曼谷市政府'),
('FME','巴西市政教育基金');

-- 1) 校验一：归一键级一致性 —— 应返回 0 行
--    notice_public 同一买家常存多种大小写变体（JS normalizeAliasKey 只做 trim+大写，
--    一个别名行覆盖全部大小写变体）；真正的 miss 源是变音/不可见字符差异，
--    故按「大写折叠后 HEX 逐字节相等」判定，大小写差异放行。
SELECT t.alias AS fold_mismatch, HEX(np.buyer_name) AS db_hex, HEX(t.alias) AS file_hex
  FROM tmp_zh_batch_20261030 t
  JOIN notice_public np ON np.buyer_name = t.alias
 WHERE HEX(UPPER(np.buyer_name)) <> HEX(UPPER(t.alias))
 GROUP BY t.alias, db_hex, file_hex;

-- 2) 校验二：根本无命中 —— 应返回 0 行（alias 拼写与库内任何 buyer_name 都对不上）
SELECT t.alias AS no_match
  FROM tmp_zh_batch_20261030 t
 WHERE NOT EXISTS (SELECT 1 FROM notice_public np WHERE np.buyer_name = t.alias)
 GROUP BY t.alias;

-- 3) 校验三：唯一键占用 —— 允许且仅允许本批次已有行（重复执行场景），
--    他批次占用（如 FME id=1374、PKP id=928）走下方 3.5 UPDATE，不得 INSERT。
SELECT t.alias AS alias_collision, aa.id, aa.source_ref
  FROM tmp_zh_batch_20261030 t
  JOIN agency_aliases aa ON aa.normalized_alias = UPPER(TRIM(t.alias))
 WHERE aa.source_ref IS NULL OR aa.source_ref <> 'zh-head-20261030'
 GROUP BY t.alias, aa.id, aa.source_ref;

-- 4) INSERT（canonical=alias：见头部【canonical=alias 决策】）
INSERT INTO agency_aliases (canonical, alias, name_i18n, is_active, source_ref)
SELECT alias, alias, JSON_OBJECT('zh', zh), 1, 'zh-head-20261030'
  FROM tmp_zh_batch_20261030
 WHERE NOT EXISTS (SELECT 1 FROM agency_aliases aa WHERE aa.normalized_alias = UPPER(TRIM(tmp_zh_batch_20261030.alias)));

-- 4.5) 存量行补 zh（AfDB 先例：唯一键已被占用则 UPDATE 补名，不 INSERT）
--   id=1374 FME（source_ref=short-name；canonical 一并定为 'FME' 本形，见头部决策）
--   id=928  PKP Polskie Linie Kolejowe S.A.（source_ref=canonical-variants，仅补 zh）
UPDATE agency_aliases
   SET canonical = 'FME',
       name_i18n = JSON_SET(COALESCE(name_i18n, JSON_OBJECT()), '$.zh', '巴西市政教育基金')
 WHERE id = 1374 AND normalized_alias = 'FME';
UPDATE agency_aliases
   SET name_i18n = JSON_SET(COALESCE(name_i18n, JSON_OBJECT()), '$.zh', '波兰铁路线路股份公司')
 WHERE id = 928 AND normalized_alias = 'PKP POLSKIE LINIE KOLEJOWE S.A.';

-- 4.6) 批次内 zh 对齐（本文件改稿后重跑时，把存量批次行的 zh 收敛到本文件口径）
UPDATE agency_aliases aa
  JOIN tmp_zh_batch_20261030 t ON aa.normalized_alias = UPPER(TRIM(t.alias))
   SET aa.name_i18n = JSON_SET(COALESCE(aa.name_i18n, JSON_OBJECT()), '$.zh', t.zh)
 WHERE aa.source_ref = 'zh-head-20261030';

-- 5) 验证：zh_rows 应返回 43（批次 INSERT 行全部带 zh 且 canonical=alias；
--    FME id=1374 / PKP id=928 保留原 source_ref，另行核对）
SELECT COUNT(*) AS zh_rows
  FROM agency_aliases
 WHERE source_ref = 'zh-head-20261030'
   AND JSON_EXTRACT(name_i18n, '$.zh') IS NOT NULL
   AND canonical = alias;
SELECT COUNT(*) AS legacy_zh
  FROM agency_aliases
 WHERE id IN (1374, 928)
   AND JSON_EXTRACT(name_i18n, '$.zh') IS NOT NULL
   AND canonical = alias; -- 应返回 2

DROP TEMPORARY TABLE tmp_zh_batch_20261030;
