/**
 * 展厅页面
 * Showroom Page
 *
 * @module features/showroom/pages/ShowroomPage
 * @description 展厅页面入口，展示展厅列表和筛选
 *              Showroom page entry, displays showroom list and filters
 */

import { useState, useMemo, useEffect } from "react";
import { Globe, Search, Filter } from "lucide-react";
import { useLocale, pickLocale } from "@/core/i18n";
import { EXHIBITION_HALLS } from "@/data";
import type { ExhibitionHall } from "@/types";
import { Input, Select } from "@/shared/ui";
import { ShowroomCard } from "../components/ShowroomCard";
import { RegisterForm } from "../components/RegisterForm";
import { onAppEvent, emitAppEvent } from "@/core/events";

export default function ShowroomPage() {
  const { t, locale } = useLocale();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [selectedShowroom, setSelectedShowroom] = useState<ExhibitionHall | null>(null);

  // 监听页头横幅"入驻海外展厅"事件，打开注册表单
  useEffect(() => {
    return onAppEvent("supply-os:open-showroom-register", () => {
      setSelectedShowroom(null);
      setShowRegisterForm(true);
    });
  }, []);

  // 计算可用地区和国家
  const availableRegions = useMemo(() => {
    const regions = new Set<string>();
    EXHIBITION_HALLS.forEach((h) => regions.add(pickLocale(locale, h.regionZh, h.regionEn)));
    return Array.from(regions);
  }, [locale]);

  const availableCountries = useMemo(() => {
    const countries = new Set<string>();
    EXHIBITION_HALLS.forEach((h) => {
      const region = pickLocale(locale, h.regionZh, h.regionEn);
      if (!selectedRegion || region === selectedRegion) {
        countries.add(pickLocale(locale, h.countryZh, h.countryEn));
      }
    });
    return Array.from(countries);
  }, [locale, selectedRegion]);

  // 筛选展厅
  const filteredShowrooms = useMemo(() => {
    return EXHIBITION_HALLS.filter((eh) => {
      const region = pickLocale(locale, eh.regionZh, eh.regionEn);
      const country = pickLocale(locale, eh.countryZh, eh.countryEn);
      const name = pickLocale(locale, eh.nameZh, eh.nameEn);
      const desc = pickLocale(locale, eh.descriptionZh, eh.descriptionEn);

      const matchesSearch =
        !searchTerm ||
        name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        desc.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRegion = !selectedRegion || region === selectedRegion;
      const matchesCountry = !selectedCountry || country === selectedCountry;

      return matchesSearch && matchesRegion && matchesCountry;
    });
  }, [locale, searchTerm, selectedRegion, selectedCountry]);

  const handleReset = () => {
    setSelectedRegion("");
    setSelectedCountry("");
    setSearchTerm("");
  };

  const handleRegister = (showroom: ExhibitionHall | null) => {
    setSelectedShowroom(showroom);
    setShowRegisterForm(true);
  };

  const handleConsult = (_showroom: ExhibitionHall | null) => {
    emitAppEvent("supply-os:consult");
  };

  return (
    <div className="space-y-6">
      {/* Active Filters */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <div className="relative w-1/3 min-w-[280px]">
          <Search className="absolute start-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
          <Input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="h-4 w-4 text-slate-400" />}
          />
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center space-x-1 text-xs text-slate-500">
            <Filter className="h-3.5 w-3.5 text-teal-600" />
            <span>{t("regionFilter")}:</span>
          </div>

          <Select
            value={selectedRegion}
            onChange={(e) => {
              setSelectedRegion(e.target.value);
              setSelectedCountry("");
            }}
            className="w-28 px-3 py-1.5 text-xs"
          >
            <option value="">{t("allRegions")}</option>
            {availableRegions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>

          <Select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="w-28 px-3 py-1.5 text-xs"
            disabled={!selectedRegion}
          >
            <option value="">{t("allCountries")}</option>
            {availableCountries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>

          {(selectedRegion || selectedCountry || searchTerm) && (
            <button
              onClick={handleReset}
              className="text-xs font-bold text-rose-600 hover:underline"
            >
              {t("resetFilter")}
            </button>
          )}
        </div>
      </div>

      {/* List of Exhibitions */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredShowrooms.length > 0 ? (
          filteredShowrooms.map((eh) => (
            <ShowroomCard
              key={eh.id}
              showroom={eh}
              onApply={handleRegister}
              onConsult={handleConsult}
            />
          ))
        ) : (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-slate-400">
            <Globe className="mx-auto mb-2 h-12 w-12 text-slate-300" />
            <p>{t("noData")}</p>
          </div>
        )}
      </div>

      {/* Register Form Overlay */}
      {showRegisterForm && (
        <RegisterForm
          selectedShowroom={selectedShowroom}
          onClose={() => {
            setShowRegisterForm(false);
            setSelectedShowroom(null);
          }}
          onSuccess={() => {
            setShowRegisterForm(false);
            setSelectedShowroom(null);
          }}
        />
      )}
    </div>
  );
}

ShowroomPage.displayName = "ShowroomPage";
