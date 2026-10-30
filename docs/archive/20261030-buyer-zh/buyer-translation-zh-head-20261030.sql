-- buyer_translation 买家中文同步批次 2026-10-30（与 agency-alias-zh-head-20261030.sql 同一套 45 家）
--
-- 背景：买家中文有双轨展示——
--   ① 首页卡片 agencyI18n：读时解析 agency_aliases（alias-store 快照，10 分钟热更）；
--   ② 采购列表页 NoticeCard / 详情页 buyerNameCn：服务表 notice_public.buyer_name_cn，
--      构建时查本表（buyer_name_zh，TRIM 后**区分大小写**的 Map 精确匹配）。
-- 本表批次让 ② 与 ① 的核实中文完全一致，并补齐 10-29 机翻批次的缺口
-- （FME 透传「FME」、DG,BSF,MHA 机械直译「总监，边防安全部队，内政部」、
--  「民航总局」「警察总局」缺国别、Newry/ENERGY/额尔登特/达尔汗整行缺失）。
--
-- 键派生（对既有 30k 行实测验证）：buyer_key = SHA2(UPPER(TRIM(buyer_name)), 256)。
-- buyer_name 存**选定写法**（与别名表 alias/canonical 同形）：重建后所有大小写变体
-- 经别名归一统一到该形态，Map 查表必命中。
-- source_hash 语义未知（与 buyer_key / SHA2(zh) 均不同），以本批次标记串哈希落值，
-- 不冒充上游来源。status 落 'translated'（与构建过滤条件一致；重复执行不触碰已 reviewed 行）。
--
-- 执行前提：agency-alias-zh-head-20261030.sql 已执行（canonical=alias 收敛），
--          随后跑 scripts/tools/notice-public-rebuild-buyers.ts 刷新服务表已有行。
-- 回滚：本批次行为 UPDATE/INSERT 补名，无结构变更；zh 值可由
--   runtime/agency-alias-zh-head-20261030.sql 头部注释追溯，或按
--   translated_at >= 本批次时间戳回查。10-29 机翻原值未备份——被覆盖的 27 行
--   原值见 git 历史本文件首版的对照注释（本文件首版已存档）。
--
-- 执行后追加修复（2026-10-30）：
-- ① buyer_name 选定写法以**别名行 canonical 的字节实况**为准（SANRAL 源数据官方形为
--   'SOC' 大写，alias 行存的 'Soc' 是巡检 GROUP BY 的任意显示形）——构建时
--   buyerTranslations Map 键区分大小写，buyer_name 必须与 canonical 逐字节一致。
-- ② 删除 14 行裸串键重复行（老灌表脚本对短名用 buyer_key=UPPER(TRIM(buyer_name))
--   本形、长名用 SHA2，同名双行导致 Map 后写覆盖先写随机输赢）；备份在
--   runtime/bak-buyer-translation-rawkey-20261030.tsv。全表仍有 418 行裸串键、
--   15 个重名（其中 1 个不在本批次），待专项治理。
-- ③ buyer_name_cn 刷新需定向重建（--changed 水位不含翻译表）：服务端跑
--   scripts/tools/notice-public-rebuild-buyers.ts --apply（本批次 11,134 行 ×3 轮）。

-- 0) 批次装载（buyer_name 选定写法 + zh；与别名表 tmp 同源核对）
CREATE TEMPORARY TABLE tmp_bt_zh_20261030 (
  buyer_name VARCHAR(255) PRIMARY KEY,
  zh         VARCHAR(500) NOT NULL
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
INSERT INTO tmp_bt_zh_20261030 (buyer_name, zh) VALUES
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
('South African National Roads Agency SOC Limited (SANRAL)','南非国家公路局'),
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

-- 1) 校验一：与别名表批次同源 —— 应返回 0 行（两表 buyer_name 集合与 zh 必须一致）
SELECT t.buyer_name AS mismatch_with_alias
  FROM tmp_bt_zh_20261030 t
  LEFT JOIN agency_aliases aa ON aa.normalized_alias = UPPER(TRIM(t.buyer_name))
 WHERE aa.id IS NULL
    OR JSON_UNQUOTE(JSON_EXTRACT(aa.name_i18n, '$.zh')) <> t.zh
 GROUP BY t.buyer_name;

-- 2) 校验二：buyer_name 本形在服务表真实存在 —— 应返回 0 行（选定写法必须是库内实存变体）
SELECT t.buyer_name AS not_in_service
  FROM tmp_bt_zh_20261030 t
 WHERE NOT EXISTS (SELECT 1 FROM notice_public np WHERE np.buyer_name = t.buyer_name)
 GROUP BY t.buyer_name;

-- 3) UPSERT（buyer_key=SHA2(UPPER(TRIM(buyer_name)),256)，存量行只改 buyer_name/zh/updated_at）
INSERT INTO buyer_translation (buyer_key, buyer_name, buyer_name_zh, status, source_hash, translated_at, updated_at)
SELECT SHA2(UPPER(TRIM(t.buyer_name)), 256), t.buyer_name, t.zh, 'translated',
       SHA2(CONCAT('zh-head-20261030|', UPPER(TRIM(t.buyer_name))), 256),
       UNIX_TIMESTAMP(), UNIX_TIMESTAMP()
  FROM tmp_bt_zh_20261030 t
ON DUPLICATE KEY UPDATE
  buyer_name    = VALUES(buyer_name),
  buyer_name_zh = VALUES(buyer_name_zh),
  updated_at    = VALUES(updated_at);

-- 4) 验证：应返回 45
SELECT COUNT(*) AS aligned
  FROM buyer_translation bt
  JOIN tmp_bt_zh_20261030 t ON bt.buyer_key = SHA2(UPPER(TRIM(t.buyer_name)), 256)
 WHERE bt.buyer_name_zh = t.zh;

DROP TEMPORARY TABLE tmp_bt_zh_20261030;
