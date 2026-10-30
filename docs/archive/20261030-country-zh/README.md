# 2026-10-30 国家归一化补充批次

- `country-alias-zh-backfill-20261030.sql`：zh 中文名反向注册为 country_aliases 别名
  （待插 265，新插 151，~114 键已有占用 IGNORE 跳过；回滚语句在文件头）。
  配套：scripts/tools/notice-public-rebuild-country.ts（受援国英文残留 + 无国家码行定向重建，
  5,330 行）、runtime/country-coverage.sql（月度巡检：unresolved 记账/陈旧投影/表健康/
  中文别名哨兵，不跟踪与 agency-coverage.sql 同惯例）。
- 效果：beneficiary 纯拉丁残留 ~2,700→1,033（剩余为多国区域项目原文，MULTI 标记属产品决策）；
  菲律宾 5,909 全中文；无国家码 1,815→1,788。
- 背景：country_aliases zh 种子 2026-10-19 入表，此前构建的行解析失败回退英文原文。
