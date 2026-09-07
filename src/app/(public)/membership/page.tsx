/**
 * /membership — ISR (revalidate: 3600)
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/services/seo/site";
import { SUPPORTED_LOCALE_CODES } from "@/core/i18n";
import PageClient from "./page-client";

export const revalidate = 3600;

const I18N_METADATA: Record<string, { title: string; description: string; ogTitle: string; ogDescription: string }> = {
  zh: {
    title: "会员套餐 — 解锁高级功能 | 云境·国际采购平台",
    description: "云境·国际采购平台会员套餐：解锁更多采购公告、供应商数据、CRM 功能，助力企业高效拓展全球采购业务。",
    ogTitle: "会员套餐 | 云境·国际采购平台",
    ogDescription: "解锁更多采购公告、供应商数据、CRM 功能，助力全球业务拓展。",
  },
  en: {
    title: "Membership Plans — Unlock Premium Features | Supply OS",
    description: "Supply OS membership plans: unlock more procurement notices, supplier data, and CRM features to help your business expand globally.",
    ogTitle: "Membership Plans | Supply OS",
    ogDescription: "Unlock more procurement notices, supplier data, and CRM features for global business expansion.",
  },
  ar: {
    title: "خطط العضوية — فتح الميزات المميزة | Supply OS",
    description: "خطط عضوية Supply OS: افتح المزيد من إشعارات المشتريات وبيانات الموردين وميزات CRM.",
    ogTitle: "خطط العضوية | Supply OS",
    ogDescription: "افتح المزيد من إشعارات المشتريات وبيانات الموردين وميزات CRM للتوسع العالمي.",
  },
  es: {
    title: "Planes de Membresía — Desbloquear Funciones Premium | Supply OS",
    description: "Planes de membresía de Supply OS: desbloquee más avisos de compras, datos de proveedores y funciones de CRM.",
    ogTitle: "Planes de Membresía | Supply OS",
    ogDescription: "Desbloquee más avisos de compras, datos de proveedores y funciones de CRM para la expansión global.",
  },
  fr: {
    title: "Plans d'adhésion — Débloquer les fonctionnalités premium | Supply OS",
    description: "Plans d'adhésion Supply OS : débloquez plus d'avis de marchés, de données fournisseurs et de fonctionnalités CRM.",
    ogTitle: "Plans d'adhésion | Supply OS",
    ogDescription: "Débloquez plus d'avis de marchés, de données fournisseurs et de fonctionnalités CRM pour l'expansion mondiale.",
  },
  ru: {
    title: "Тарифные планы — Разблокировать премиум-функции | Supply OS",
    description: "Тарифные планы Supply OS: разблокируйте больше уведомлений о закупках, данных поставщиков и функций CRM.",
    ogTitle: "Тарифные планы | Supply OS",
    ogDescription: "Разблокируйте больше уведомлений о закупках, данных поставщиков и функций CRM для глобального расширения.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  let locale = "zh";
  try {
    const headersList = await headers();
    const xLocale = headersList.get("x-locale");
    if (xLocale && (SUPPORTED_LOCALE_CODES as readonly string[]).includes(xLocale)) {
      locale = xLocale;
    }
  } catch {
    // headers() may throw outside request context
  }
  const meta = I18N_METADATA[locale] || I18N_METADATA.zh;
  return {
    title: meta.title,
    description: meta.description,
    openGraph: {
      title: meta.ogTitle,
      description: meta.ogDescription,
      type: "website",
    },
    alternates: {
      canonical: absoluteUrl("/membership"),
      languages: {
        "x-default": absoluteUrl("/membership"),
        zh: absoluteUrl("/membership?locale=zh"),
        en: absoluteUrl("/membership?locale=en"),
        ar: absoluteUrl("/membership?locale=ar"),
        es: absoluteUrl("/membership?locale=es"),
        fr: absoluteUrl("/membership?locale=fr"),
        ru: absoluteUrl("/membership?locale=ru"),
      },
    },
  };
}

export default function MembershipPage() {
  return <PageClient />;
}
