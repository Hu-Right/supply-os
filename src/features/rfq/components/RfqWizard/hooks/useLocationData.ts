/**
 * 省市区三级联动 Hook
 * @module features/rfq/components/RfqWizard/hooks/useLocationData
 */
import { useState, useEffect } from "react";
import { cities as chinaCities, areas as chinaAreas } from "@/data/chinaDivision";
import type { RfqFormState } from "../../../types";

/**
 * 管理省→市→区/县级联数据加载
 * @param form - 表单状态（需要 provinceId、cityId 字段）
 */
export function useLocationData(form: RfqFormState) {
  const [citiesList, setCitiesList] = useState<typeof chinaCities>([]);
  const [districtsList, setDistrictsList] = useState<typeof chinaAreas>([]);

  // 省份变化时加载城市列表
  useEffect(() => {
    if (!form.provinceId) {
      setCitiesList([]);
      setDistrictsList([]);
      return;
    }
    const provinceCode = String(form.provinceId).padStart(2, "0");
    setCitiesList(chinaCities.filter((c) => c.provinceCode === provinceCode));
    setDistrictsList([]);
  }, [form.provinceId]);

  // 城市变化时加载区/县列表
  useEffect(() => {
    if (!form.cityId) {
      setDistrictsList([]);
      return;
    }
    const cityCode = String(form.cityId).padStart(4, "0");
    setDistrictsList(chinaAreas.filter((a) => a.cityCode === cityCode));
  }, [form.cityId]);

  return { citiesList, districtsList };
}
