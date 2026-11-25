/**
 * /procurement/country/[slug] — 已并入搜索页（由 proxy 发 308）
 *
 * @description 2026-11-25 · GEO B 路线收口。
 *
 *              背景：国别曾有两套表达——产品里的 `?country=` 筛选器，和 2026-11-18
 *              为承接「巴西 招标」这类词新建的 `/procurement/country/{slug}` 落地页
 *              （`e0a1bd37`）。两者同数据两个 URL：重复内容、内链分裂、维护双份，
 *              且落地页全站只有 1 个内链（近乎孤儿页）。
 *
 *              收口方向：让**搜索页自己**成为国别入口——它已有独立 title/description
 *              与归一 canonical（`/procurement?country={英文国名}`，德国/DE/Germany
 *              三种写法收敛到同一 URL）。
 *
 *              跳转由 `proxy.ts` 在渲染前以 308 发出，**不在这里做**：
 *              页面里调 `permanentRedirect()` 时响应已进入流式渲染，Next 只会往 HTML
 *              插一个客户端 meta 标签（官方文档："in a streaming context, this will
 *              insert a meta tag"），状态码仍是 200 —— 百度蜘蛛与多数抓取器不执行它。
 *
 *              所以本路由只在 proxy 认不出 slug 时兜底：直接 404，不再渲染任何内容。
 *              原落地页实现见 git 历史。
 */
import { notFound } from "next/navigation";

export default function CountryLandingRetired(): never {
  notFound();
}
