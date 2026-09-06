/**
 * 国旗图组件（本地 /flags/{iso}.svg，源自 flag-icons 包 4x3 SVG）
 * Country flag image component
 *
 * @module shared/ui/CountryFlag
 * @description 输入英文国家名（宽表 country_std 口径），经 COUNTRY_NAME_ISO2
 *              全量映射（308 键，生成物见 shared/data/countryIso2）转为 ISO2，
 *              渲染本地国旗图；名称未命中时回退地球图标。
 *              本地资产不依赖外链（flagcdn 在部分网络环境不可达）。
 */
import { Globe } from "lucide-react";
import { COUNTRY_NAME_ISO2 } from "@/shared/data/countryIso2";

/** 国家英文名 → ISO2：直接匹配 → 逗号重排（"Congo, DR of the"→"dr of the congo"）→ 首段 → 去 the */
export function lookupCountryIso2(name: string): string | undefined {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  if (COUNTRY_NAME_ISO2[n]) return COUNTRY_NAME_ISO2[n];
  if (n.includes(", ")) {
    const reordered = n.split(", ").reverse().join(" ");
    if (COUNTRY_NAME_ISO2[reordered]) return COUNTRY_NAME_ISO2[reordered];
    const first = n.split(",")[0].trim();
    if (COUNTRY_NAME_ISO2[first]) return COUNTRY_NAME_ISO2[first];
  }
  if (n.startsWith("the ") && COUNTRY_NAME_ISO2[n.slice(4)]) return COUNTRY_NAME_ISO2[n.slice(4)];
  return undefined;
}

export function CountryFlag({ name, className = "h-3.5 w-5" }: { name: string; className?: string }) {
  const iso = lookupCountryIso2(name);
  if (!iso) return <Globe className={`${className} text-slate-300 shrink-0`} />;
  return (
    <img
      src={`/flags/${iso}.svg`}
      alt=""
      loading="lazy"
      className={`${className} shrink-0 rounded-[2px] object-cover`}
      onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
    />
  );
}
