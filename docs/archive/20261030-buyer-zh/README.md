# 20261030 买家中文化批次 SQL/TSV 归档

原提交 19f135e7 曾 force-add 进 `runtime/`，因门禁 R1/R2 禁止跟踪 `runtime/`（clone 隐身文件），
2026-10-30 迁入本目录。本批次为回滚依据，故随仓保留。

- `agency-alias-zh-head-20261030.sql`：45 家头部机构定名（canonical=alias 决策，含回滚语句）
- `buyer-translation-zh-head-20261030.sql`：同源 45 家 buyer_translation 行（键=SHA2(UPPER(TRIM))）
- `alias-to-bt-sync-20261030.sql` / `alias-backfill-from-bt-20261030.sql`：别名↔bt 三向对齐
  （canonical 形式补行、今日批次名回填别名表统一大小写变体）
- `hand-fill-zh-20261030.tsv` / `hand-fill-zh-20261030b.tsv`：两批手翻（728+527 名，c≥16 已清）
- `bak-buyer-translation-rawkey-20261030.tsv`：裸串键重复行删除前备份（14 行）
