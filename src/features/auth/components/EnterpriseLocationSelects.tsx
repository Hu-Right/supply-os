/**
 * 省→市两级级联选择（对标采购需求地址表单）
 * Enterprise Location Selects
 *
 * @module features/auth/components/EnterpriseLocationSelects
 * @description 省份→城市两级 SearchableSelect 级联，数据源 @/data/chinaDivision。
 *              对外以名称（province/city）读写，内部维护 code 用于级联过滤。
 *              与 supplier 原表 province/city 列对应，不新增列。
 */
import { useEffect, useState } from "react";
import { SearchableSelect } from "@/shared/ui";
import { provinces as chinaProvinces, cities as chinaCities } from "@/data/chinaDivision";
import { useLocale } from "@/core/i18n";

export interface EnterpriseLocationSelectsProps {
  provinceName: string;
  cityName: string;
  onChange: (next: { province: string; city: string }) => void;
}

export function EnterpriseLocationSelects({
  provinceName, cityName, onChange,
}: EnterpriseLocationSelectsProps) {
  const { t } = useLocale();
  // 由名称反查 code 作为初始选中
  const [provinceId, setProvinceId] = useState<number | null>(() => {
    const p = chinaProvinces.find((x) => x.name === provinceName);
    return p ? Number(p.code) : null;
  });
  const [cityId, setCityId] = useState<number | null>(() => {
    const c = chinaCities.find((x) => x.name === cityName);
    return c ? Number(c.code) : null;
  });
  const [citiesList, setCitiesList] = useState<typeof chinaCities>([]);

  // 省份变化 → 刷新城市列表并清空城市
  useEffect(() => {
    if (!provinceId) { setCitiesList([]); return; }
    const provinceCode = String(provinceId).padStart(2, "0");
    setCitiesList(chinaCities.filter((c) => c.provinceCode === provinceCode));
  }, [provinceId]);

  const handleProvince = (id: unknown) => {
    const pid = id ? Number(id) : null;
    const p = chinaProvinces.find((x) => Number(x.code) === pid);
    setProvinceId(pid);
    setCityId(null);
    onChange({ province: p?.name ?? "", city: "" });
  };

  const handleCity = (id: unknown) => {
    const cid = id ? Number(id) : null;
    const c = citiesList.find((x) => Number(x.code) === cid);
    setCityId(cid);
    onChange({ province: provinceName, city: c?.name ?? "" });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <SearchableSelect
        options={chinaProvinces.map((p) => ({ value: Number(p.code), label: p.name }))}
        value={provinceId}
        onChange={handleProvince}
        placeholder={t("authEnterpriseProvincePlaceholder") || "搜索省份"}
      />
      <SearchableSelect
        options={citiesList.map((c) => ({ value: Number(c.code), label: c.name }))}
        value={cityId}
        onChange={handleCity}
        placeholder={provinceId ? (t("authEnterpriseCityPlaceholder") || "搜索城市") : (t("authEnterpriseSelectProvinceFirst") || "先选省份")}
        disabled={!provinceId}
      />
    </div>
  );
}

EnterpriseLocationSelects.displayName = "EnterpriseLocationSelects";
