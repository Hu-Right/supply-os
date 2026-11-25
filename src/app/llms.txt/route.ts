/**
 * /llms.txt — 动态生成的 AI 站点说明
 *
 * @description 不再手写 public/llms.txt：公告规模、国家数、供应商数从
 *              getNoticeStats / 供应商 stats 实时读取，避免“37 万/39 万”两套数字。
 *              静态文案 + 动态数字，缓存 10 分钟（与首页统计缓存同口径）。
 */
import { getPool } from "@/lib/db/pool";
import { getContext } from "@/lib/db/context";
import { getNoticeStats } from "@/lib/services/notice-search";

export const dynamic = "force-dynamic";

function nowCst(): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export async function GET() {
  let active: number | null = null;
  let countryCount: number | null = null;
  let searchable: number | null = null;
  let totalSuppliers: number | null = null;

  try {
    const stats = await getNoticeStats(getPool());
    active = stats.active;
    countryCount = stats.countryCount;
  } catch (err) {
    console.error("[llms.txt] 公告统计不可用:", (err as Error).message);
  }
  try {
    const supplier = await getContext().supplier.directoryRepo.getStats();
    searchable = supplier.searchable;
    totalSuppliers = supplier.total;
  } catch (err) {
    console.error("[llms.txt] 供应商统计不可用:", (err as Error).message);
  }

  const asOf = nowCst();
  const scale = active != null
    ? `${active.toLocaleString("zh-CN")} 条有效公告（统计截至 ${asOf}，北京时间）`
    : "有效公告数见首页实时数字";
  const countries = countryCount != null ? `${countryCount} 个国家/地区` : "覆盖国家/地区见「按国家浏览」页";
  const suppliers = searchable != null
    ? `可检索供应商 ${searchable} 家${totalSuppliers != null ? `（库内档案 ${totalSuppliers.toLocaleString("zh-CN")} 家，含未审核）` : ""}`
    : "供应商数见供应商目录页";

  const body = `# 云境·国际采购平台（Yunjing International Procurement Platform）

> 面向中国供应商的全球公共采购情报与投标服务平台：聚合联合国机构、世界银行及各国政府公开招标/采购公告，提供公告检索、供应商目录、投标辅助服务与研修培训。运营主体：杭州云境智展科技有限公司。平台是信息聚合与增值服务提供方，不代表任何官方采购机构。

站点：https://osneosmart.com
语言：中文（主站）、英文（/en）

## 核心页面

- 全球商机（公告检索）：https://osneosmart.com/procurement
- 按国家浏览：https://osneosmart.com/procurement/countries
- 按品目浏览：https://osneosmart.com/procurement/industries
- 供应商目录：https://osneosmart.com/supplier
- 中标情报：https://osneosmart.com/award-intelligence
- 中标案例（30 个独立页，示例）：https://osneosmart.com/award-intelligence/case/1
- 投标服务：https://osneosmart.com/services
- 第三方服务生态：https://osneosmart.com/ecosystem
- 采购需求（RFQ）：https://osneosmart.com/rfq
- 会员套餐与价格：https://osneosmart.com/membership
- 关于我们（运营主体）：https://osneosmart.com/about
- 联系我们：https://osneosmart.com/contact
- 常见问题：https://osneosmart.com/faq
- 标讯来源与使用说明：https://osneosmart.com/notice-source

## 数据说明

- 来源：各国官方采购门户、联合国机构（UNGM、UNDP、UNICEF、WHO、UNOPS、UNHCR 等）、世界银行等公开渠道。
- 规模：${scale}；覆盖 ${countries}。
- 供应商：${suppliers}。
- 更新：每日增量同步；首页规模数字与列表缓存每 10 分钟刷新。
- 口径：有效公告 = 截止时间未过或无截止日的已审核公告；国别计数按国别别名表归一，一条公告涉及多国时会按国别重复计入；品目计数按「一条公告可挂多个大类」的包含口径，不等于公告总数。
- 公告详情公开页展示标题、采购方、国家/地区、截止时间、公告编号与公开摘要；完整描述、联系方式与采购文件需登录或会员权限。
- 价格：个人会员 239 元/月起；具体权益与价格以会员套餐页为准。
- 时效：截止时间统一换算为北京时间；公告原文与官方系统为准，平台可能存在同步延迟或翻译误差。

## 引用与许可

- 引用本站数据请注明来源「云境·国际采购平台（osneosmart.com）」并附原文链接。
- 本站聚合的公告版权归原采购机构所有；转载、商用与批量抓取请先阅读《标讯来源与使用说明》并联系平台。
- 投诉与争议：https://osneosmart.com/complaint

## 联系方式

见 https://osneosmart.com/contact 与 https://osneosmart.com/about（客服邮箱/电话/地址以页面公示为准）。
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
