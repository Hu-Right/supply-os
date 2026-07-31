-- ============================================================================
-- 存量 passthrough 污染清理（诊断 D4）
-- 目标库：192.168.1.2 生产库（人工执行，勿自动化）
-- 前置条件：Task 1（passthrough 不落库守卫）已上线，否则清后再写脏。
-- 原文都在源表 crm_bid_notices，删除缓存行即恢复按需重译能力，无数据丢失风险。
-- 执行顺序：① 预检 → ② 备份 → ③ 人工确认后删除 → ④ 复查
-- ============================================================================

-- ① 预检：查看 model 分布与 passthrough 污染规模（只读，安全）
SELECT model, lang, COUNT(*) AS rows_cnt
FROM crm_notice_translations
GROUP BY model, lang ORDER BY rows_cnt DESC;

-- ① 预检：抽样确认 passthrough 行确为"译文=原文"的污染行（只读，安全）
SELECT t.notice_id, t.lang, LEFT(t.title_tr, 80) AS title_tr, LEFT(n.title, 80) AS title_src
FROM crm_notice_translations t
JOIN crm_bid_notices n ON n.id = t.notice_id
WHERE t.model = 'same-lang-passthrough' LIMIT 20;

-- ② 备份：污染行整表快照（可重复执行前先 DROP 旧备份表）
CREATE TABLE crm_notice_translations_bak_passthrough AS
SELECT * FROM crm_notice_translations WHERE model = 'same-lang-passthrough';

-- ③ 删除（⚠️ 人工确认预检与备份行数一致后再执行）
DELETE FROM crm_notice_translations WHERE model = 'same-lang-passthrough';

-- ④ 复查：应为 0；同时记录备份表行数作为清理数量
SELECT COUNT(*) AS remaining FROM crm_notice_translations WHERE model = 'same-lang-passthrough';
SELECT COUNT(*) AS backed_up FROM crm_notice_translations_bak_passthrough;

-- 说明：'skip-same-lang' 标记行（Task 4 引入，title_tr 为 NULL）不在清理范围，
-- 它们是防重扫机制的一部分，勿删。
