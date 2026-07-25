/**
 * 海外展厅类型
 * Exhibition Hall Types
 *
 * @module types/exhibition
 * @description 海外展厅实体，包含中英文双语字段、地区/国家/城市、特色产品和容量信息
 *              Exhibition hall entity with bilingual fields, region/country/city, featured products, and capacity
 */

export interface ExhibitionHall {
  id: string;
  nameZh: string;
  nameEn: string;
  regionZh: string;
  regionEn: string;
  countryZh: string;
  countryEn: string;
  cityZh: string;
  cityEn: string;
  descriptionZh: string;
  descriptionEn: string;
  bannerUrl: string;
  featuredProductsZh: string[];
  featuredProductsEn: string[];
  capacityValue: string;
}
