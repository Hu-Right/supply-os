/**
 * 中国行政区划数据 — 省级（23 省 + 5 自治区 + 4 直辖市，共 31 条，不含港澳台）
 *
 * @module data/china-division/provinces
 * @description 2026-10 首包治理：原 339KB 单文件按层级拆分，
 *              消费方只 import 所需层（provinces 仅 ~2KB，此前被 areas 全量拖进
 *              RFQ 路由首包）。数据本体与拆分前逐字一致，未做任何改值。
 */

export const provinces = [
  {
    "code": "11",
    "name": "北京市"
  },
  {
    "code": "12",
    "name": "天津市"
  },
  {
    "code": "13",
    "name": "河北省"
  },
  {
    "code": "14",
    "name": "山西省"
  },
  {
    "code": "15",
    "name": "内蒙古自治区"
  },
  {
    "code": "21",
    "name": "辽宁省"
  },
  {
    "code": "22",
    "name": "吉林省"
  },
  {
    "code": "23",
    "name": "黑龙江省"
  },
  {
    "code": "31",
    "name": "上海市"
  },
  {
    "code": "32",
    "name": "江苏省"
  },
  {
    "code": "33",
    "name": "浙江省"
  },
  {
    "code": "34",
    "name": "安徽省"
  },
  {
    "code": "35",
    "name": "福建省"
  },
  {
    "code": "36",
    "name": "江西省"
  },
  {
    "code": "37",
    "name": "山东省"
  },
  {
    "code": "41",
    "name": "河南省"
  },
  {
    "code": "42",
    "name": "湖北省"
  },
  {
    "code": "43",
    "name": "湖南省"
  },
  {
    "code": "44",
    "name": "广东省"
  },
  {
    "code": "45",
    "name": "广西壮族自治区"
  },
  {
    "code": "46",
    "name": "海南省"
  },
  {
    "code": "50",
    "name": "重庆市"
  },
  {
    "code": "51",
    "name": "四川省"
  },
  {
    "code": "52",
    "name": "贵州省"
  },
  {
    "code": "53",
    "name": "云南省"
  },
  {
    "code": "54",
    "name": "西藏自治区"
  },
  {
    "code": "61",
    "name": "陕西省"
  },
  {
    "code": "62",
    "name": "甘肃省"
  },
  {
    "code": "63",
    "name": "青海省"
  },
  {
    "code": "64",
    "name": "宁夏回族自治区"
  },
  {
    "code": "65",
    "name": "新疆维吾尔自治区"
  }
];
