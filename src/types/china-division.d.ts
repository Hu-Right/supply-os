declare module "china-division" {
  interface Province {
    code: string;
    name: string;
  }
  interface City {
    code: string;
    name: string;
    provinceCode: string;
  }
  interface Area {
    code: string;
    name: string;
    cityCode: string;
  }
  const data: {
    provinces: Province[];
    cities: City[];
    areas: Area[];
    [key: string]: unknown;
  };
  export = data;
}
