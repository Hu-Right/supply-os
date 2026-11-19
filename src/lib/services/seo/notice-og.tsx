/**
 * 公告分享卡（OG 图）渲染器
 * @module lib/services/seo/notice-og
 *
 * @description 1200×630 分享卡：深色底 + 品牌 logo + 类型徽标 + 标题 + 摘要 +
 *             采购方/国家/截止 + 页脚。中英各一套文案，由 opengraph-image 路由按需渲染，
 *             首次被社交平台抓取时生成、之后按 revalidate 缓存（不为全量公告预生成）。
 *
 *              字体：public/fonts/SimHei.ttf（仓库已随附），模块级缓存一次读取；
 *              satori 不内联系统字体，中文必须显式给字体数据。
 */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NoticeShareCard, OgLocale } from "./notice-og-data";

export const OG_SIZE = { width: 1200, height: 630 } as const;

let fontPromise: Promise<Buffer> | null = null;
let logoPromise: Promise<string> | null = null;

function loadFont(): Promise<Buffer> {
  fontPromise ??= readFile(path.join(process.cwd(), "public", "fonts", "SimHei.ttf"));
  return fontPromise;
}

function loadLogo(): Promise<string> {
  logoPromise ??= readFile(path.join(process.cwd(), "public", "logo.png"))
    .then((buf) => `data:image/png;base64,${buf.toString("base64")}`);
  return logoPromise;
}

async function loadFlag(code: string | null): Promise<string | null> {
  if (!code || !/^[a-z]{2}$/i.test(code)) return null;
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "flags", `${code.toLowerCase()}.svg`));
    return `data:image/svg+xml;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** satori 不支持 -webkit-line-clamp：按字符预算手工截断（中英预算不同） */
function clampText(text: string, max: number): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/[，、；：,;:\s]+$/, "")}…`;
}

interface Copy {
  brand: string;
  brandSub: string;
  buyer: string;
  country: string;
  tagline: string;
}

function copyOf(locale: OgLocale): Copy {
  return locale === "zh"
    ? {
        brand: "云境",
        brandSub: "国际采购平台",
        buyer: "采购方",
        country: "国家 / 地区",
        tagline: "全球政府采购情报 · 每日更新",
      }
    : {
        brand: "Yunjing",
        brandSub: "INTERNATIONAL PROCUREMENT",
        buyer: "BUYER",
        country: "COUNTRY",
        tagline: "Global procurement intelligence, updated daily",
      };
}

function MetaBlock({
  label,
  value,
  accent = false,
  marginLeft = 0,
}: {
  label: string;
  value: string;
  accent?: boolean;
  marginLeft?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginLeft }}>
      <div style={{ fontSize: 14, letterSpacing: 2.5, color: "#7C8CA3", fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 9, fontSize: 25, fontWeight: 700, color: accent ? "#5EEAD4" : "#E2E8F0" }}>{value}</div>
    </div>
  );
}

async function render(
  props: { title: string; summary: string | null; typeLabel: string; countryLabel: string; buyer: string; deadline: string | null; deadlineIsCst: boolean; flag: string | null },
  locale: OgLocale,
): Promise<ImageResponse> {
  const [font, logo] = await Promise.all([loadFont(), loadLogo()]);
  const copy = copyOf(locale);
  const zh = locale === "zh";
  const deadlineLabel = zh
    ? (props.deadlineIsCst ? "投标截止（北京时间）" : "投标截止")
    : (props.deadlineIsCst ? "DEADLINE (CST)" : "DEADLINE");

  return new ImageResponse(
    (
      <div
        style={{
          width: OG_SIZE.width,
          height: OG_SIZE.height,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          padding: "54px 64px",
          background: "linear-gradient(135deg, #0A1422 0%, #0D1A2B 55%, #0A1422 100%)",
          fontFamily: "SimHei",
          color: "#F8FAFC",
        }}
      >
        {/* 背景装饰：同心圆环 */}
        <div style={{ position: "absolute", right: -190, top: -150, width: 760, height: 760, borderRadius: 380, border: "1px solid rgba(45,212,191,0.14)", display: "flex" }} />
        <div style={{ position: "absolute", right: -90, top: -50, width: 560, height: 560, borderRadius: 280, border: "1px solid rgba(45,212,191,0.10)", display: "flex" }} />
        <div style={{ position: "absolute", right: 10, top: 30, width: 360, height: 360, borderRadius: 180, border: "1px solid rgba(45,212,191,0.07)", display: "flex" }} />

        {/* 顶部：品牌 + 国家 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 62, height: 62, borderRadius: 16, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 16 }}>
              <img src={logo} width={46} height={46} alt="" />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 27, fontWeight: 700 }}>{copy.brand}</div>
              <div style={{ fontSize: 15, color: "#94A3B8", letterSpacing: 2, marginTop: 4 }}>{copy.brandSub}</div>
            </div>
          </div>
          {props.countryLabel ? (
            <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", border: "1px solid rgba(148,163,184,0.28)", borderRadius: 999, background: "rgba(15,23,42,0.45)" }}>
              {props.flag ? (
                <img src={props.flag} width={34} height={24} alt="" style={{ borderRadius: 4 }} />
              ) : null}
              <div style={{ marginLeft: props.flag ? 12 : 0, fontSize: 17, color: "#CBD5E1", fontWeight: 700 }}>{props.countryLabel}</div>
            </div>
          ) : null}
        </div>

        {/* 类型徽标 */}
        {props.typeLabel ? (
          <div style={{ display: "flex", alignItems: "center", alignSelf: "flex-start", marginTop: 46, padding: "9px 18px", borderRadius: 999, background: "rgba(20,184,166,0.14)", border: "1px solid rgba(45,212,191,0.45)", color: "#5EEAD4", fontSize: 19, fontWeight: 700 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: "#2DD4BF", marginRight: 10, display: "flex" }} />
            {props.typeLabel}
          </div>
        ) : null}

        {/* 标题 */}
        <div style={{ display: "flex", width: 1020, marginTop: 20, fontSize: zh ? 56 : 44, lineHeight: 1.26, fontWeight: 700, letterSpacing: 0.5 }}>
          {clampText(props.title, zh ? 34 : 86)}
        </div>

        {/* 摘要 */}
        {props.summary ? (
          <div style={{ display: "flex", width: 1010, marginTop: 18, fontSize: zh ? 21 : 20, lineHeight: 1.6, color: "#A6B4C6" }}>
            {clampText(props.summary, zh ? 92 : 178)}
          </div>
        ) : null}

        {/* 元信息 */}
        <div style={{ display: "flex", marginTop: 34 }}>
          <MetaBlock label={copy.buyer} value={clampText(props.buyer || "—", 28)} />
          <MetaBlock label={copy.country} value={clampText(props.countryLabel || "—", 24)} marginLeft={64} />
          <MetaBlock label={deadlineLabel} value={props.deadline ?? "—"} accent marginLeft={64} />
        </div>

        {/* 页脚 */}
        <div style={{ position: "absolute", left: 64, right: 64, bottom: 44, display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(148,163,184,0.18)", paddingTop: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#94A3B8", letterSpacing: 1 }}>osneosmart.com</div>
          <div style={{ fontSize: 17, color: "#64748B" }}>{copy.tagline}</div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "SimHei", data: font, weight: 400, style: "normal" },
        { name: "SimHei", data: font, weight: 700, style: "normal" },
      ],
    },
  );
}

/** 公告分享卡（数据缺失时由调用方退回 renderOgFallback） */
export async function renderNoticeShareCard(card: NoticeShareCard, locale: OgLocale): Promise<ImageResponse> {
  return render(
    {
      title: card.title,
      summary: card.summary,
      typeLabel: card.typeLabel,
      countryLabel: card.countryLabel,
      buyer: card.buyerLabel,
      deadline: card.deadlineLabel,
      deadlineIsCst: card.deadlineIsCst,
      flag: await loadFlag(card.countryCode),
    },
    locale,
  );
}

/** 兜底卡：公告不存在/查询失败时仍然返回一张品牌图，避免社交平台抓到 500 */
export async function renderOgFallback(locale: OgLocale): Promise<ImageResponse> {
  return render(
    {
      title: locale === "zh" ? "全球政府采购情报" : "Global procurement intelligence",
      summary:
        locale === "zh"
          ? "联合国、各国政府及国际组织的招标与采购公告，每日更新。"
          : "Tenders and procurement notices from the UN, governments and international organisations, updated daily.",
      typeLabel: "",
      countryLabel: "",
      buyer: "",
      deadline: null,
      deadlineIsCst: false,
      flag: null,
    },
    locale,
  );
}
