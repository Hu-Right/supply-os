/**
 * 服务生态页面
 * Services Ecosystem Page
 *
 * @module features/services/pages/ServicesPage
 * @description 服务生态页面入口，展示所有服务项和成功案例
 *              Services ecosystem page entry, displays all service items and success stories
 */

import { useLocale } from "@/core/i18n";
import { ServiceCard } from "../components/ServiceCard";
import { SuccessStories } from "../components/SuccessStories";
import { SERVICES, SUCCESS_STORIES } from "../data";

export interface ServicesPageProps {
  onBookService: () => void;
}

export default function ServicesPage({ onBookService }: ServicesPageProps) {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((service, idx) => (
          <ServiceCard
            key={idx}
            service={service}
            onBook={onBookService}
            bookLabel={t("bookServiceNow")}
          />
        ))}
      </div>

      <SuccessStories stories={SUCCESS_STORIES} title={t("successStory")} />
    </div>
  );
}

ServicesPage.displayName = "ServicesPage";
