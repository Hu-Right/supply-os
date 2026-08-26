/**
 * 英文国家名 → 中文名映射表
 * English Country Name → Chinese Name Mapping
 *
 * @module server/data/countryNames
 * @description 覆盖国际公共采购数据库中可能出现的全部国家英文名及变体，
 *              中文环境下优先显示中文名，其他语言回退英文原名。
 */

export const COUNTRY_NAME_ZH: Record<string, string> = {
  // ── A ─
  "Afghanistan": "阿富汗",
  "Albania": "阿尔巴尼亚",
  "Algeria": "阿尔及利亚",
  "Angola": "安哥拉",
  "Antigua and Barbuda": "安提瓜和巴布达",
  "Argentina": "阿根廷",
  "Armenia": "亚美尼亚",
  "Australia": "澳大利亚",
  "Austria": "奥地利",
  "Azerbaijan": "阿塞拜疆",
  // ── B ──
  "Bahamas": "巴哈马",
  "Bahrain": "巴林",
  "Bangladesh": "孟加拉国",
  "Barbados": "巴巴多斯",
  "Belarus": "白俄罗斯",
  "Belgium": "比利时",
  "Belize": "伯利兹",
  "Benin": "贝宁",
  "Bhutan": "不丹",
  "Bolivia": "玻利维亚",
  "Plurinational State of Bolivia": "玻利维亚",
  "Bolivia, Plurinational State of": "玻利维亚",
  "Bolivarian Republic of Venezuela": "委内瑞拉",
  "Bosnia and Herzegovina": "波黑",
  "Botswana": "博茨瓦纳",
  "Brazil": "巴西",
  "Brasil": "巴西",
  "Brunei": "文莱",
  "Bulgaria": "保加利亚",
  "Burkina Faso": "布基纳法索",
  "Burundi": "布隆迪",
  // ── C ──
  "Cabo Verde": "佛得角",
  "Cambodia": "柬埔寨",
  "Cameroon": "喀麦隆",
  "Canada": "加拿大",
  "Central African Republic": "中非共和国",
  "Chad": "乍得",
  "Chile": "智利",
  "China": "中国",
  "PRC": "中国",
  "P.R.C": "中国",
  "People's Republic of China": "中国",
  "China, People's Republic of": "中国", // 反向格式
  "Colombia": "哥伦比亚",
  "Comoros": "科摩罗",
  "Congo": "刚果（布）",
  "Republic of the Congo": "刚果（布）",
  "Congo, Republic of": "刚果（布）",
  "Congo, Democratic Republic of the": "刚果（金）",
  "Congo, The Democratic Republic of the": "刚果（金）", // ISO 3166 标准格式
  "Democratic Republic of the Congo": "刚果（金）",
  "DRC": "刚果（金）",
  "COD": "刚果（金）",
  "COG": "刚果（布）",
  "Costa Rica": "哥斯达黎加",
  "Côte d'Ivoire": "科特迪瓦",
  "Croatia": "克罗地亚",
  "Cuba": "古巴",
  "Cyprus": "塞浦路斯",
  "Czech Republic": "捷克",
  "Czechia": "捷克",
  // ── D ──
  "Denmark": "丹麦",
  "Djibouti": "吉布提",
  "Dominica": "多米尼克",
  "Dominican Republic": "多米尼加",
  // ── E ──
  "Ecuador": "厄瓜多尔",
  "Egypt": "埃及",
  "El Salvador": "萨尔瓦多",
  "Equatorial Guinea": "赤道几内亚",
  "Eritrea": "厄立特里亚",
  "Estonia": "爱沙尼亚",
  "Eswatini": "斯威士兰",
  "Ethiopia": "埃塞俄比亚",
  // ── F ──
  "Fiji": "斐济",
  "Finland": "芬兰",
  "France": "法国",
  // ── G ──
  "Gabon": "加蓬",
  "Gambia": "冈比亚",
  "Georgia": "格鲁吉亚",
  "Germany": "德国",
  "Ghana": "加纳",
  "Greece": "希腊",
  "Grenada": "格林纳达",
  "Guatemala": "危地马拉",
  "Guinea": "几内亚",
  "Guinea-Bissau": "几内亚比绍",
  "Guyana": "圭亚那",
  // ── H ──
  "Haiti": "海地",
  "Honduras": "洪都拉斯",
  "Hungary": "匈牙利",
  // ── I ──
  "Iceland": "冰岛",
  "India": "印度",
  "IND": "印度",
  "Indonesia": "印度尼西亚",
  "IDN": "印度尼西亚",
  "Iran": "伊朗",
  "Iran, Islamic Republic of": "伊朗",
  "Iraq": "伊拉克",
  "Ireland": "爱尔兰",
  "Israel": "以色列",
  "Italy": "意大利",
  // ── J ──
  "Jamaica": "牙买加",
  "Japan": "日本",
  "JPN": "日本",
  "Jordan": "约旦",
  // ── K ──
  "Kazakhstan": "哈萨克斯坦",
  "Kenya": "肯尼亚",
  "Kiribati": "基里巴斯",
  "Korea, Democratic People's Republic of": "朝鲜",
  "Democratic People's Republic of Korea": "朝鲜",
  "North Korea": "朝鲜",
  "D.P.R.K": "朝鲜",
  "Korea, Republic of": "韩国",
  "Republic of Korea": "韩国",
  "South Korea": "韩国",
  "R.O.K": "韩国",
  "Kuwait": "科威特",
  "Kyrgyzstan": "吉尔吉斯斯坦",
  // ─ L ──
  "Laos": "老挝",
  "Lao People's Democratic Republic": "老挝",
  "Lao PDR": "老挝",
  "Latvia": "拉脱维亚",
  "Lebanon": "黎巴嫩",
  "Lesotho": "莱索托",
  "Liberia": "利比里亚",
  "Libya": "利比亚",
  "Liechtenstein": "列支敦士登",
  "Lithuania": "立陶宛",
  "Luxembourg": "卢森堡",
  // ── M ─
  "Madagascar": "马达加斯加",
  "Malawi": "马拉维",
  "Malaysia": "马来西亚",
  "Maldives": "马尔代夫",
  "Mali": "马里",
  "Malta": "马耳他",
  "Marshall Islands": "马绍尔群岛",
  "Mauritania": "毛里塔尼亚",
  "Mauritius": "毛里求斯",
  "Mexico": "墨西哥",
  "Micronesia": "密克罗尼西亚",
  "Federated States of Micronesia": "密克罗尼西亚",
  "Moldova": "摩尔多瓦",
  "Republic of Moldova": "摩尔多瓦",
  "Moldova, Republic of": "摩尔多瓦",
  "Monaco": "摩纳哥",
  "Mongolia": "蒙古",
  "Montenegro": "黑山",
  "Morocco": "摩洛哥",
  "Mozambique": "莫桑比克",
  "Myanmar": "缅甸",
  "MMR": "缅甸",
  // ── N ──
  "Namibia": "纳米比亚",
  "Nauru": "瑙鲁",
  "Nepal": "尼泊尔",
  "New Caledonia": "新喀里多尼亚",
  "Netherlands": "荷兰",
  "The Netherlands": "荷兰",
  "Netherlands, The": "荷兰",
  "New Zealand": "新西兰",
  "Nicaragua": "尼加拉瓜",
  "Niger": "尼日尔",
  "Nigeria": "尼日利亚",
  "NGA": "尼日利亚",
  "North Macedonia": "北马其顿",
  "Macedonia": "北马其顿",
  "The former Yugoslav Republic of Macedonia": "北马其顿",
  "Norway": "挪威",
  // ── O ──
  "Oman": "阿曼",
  // ── P ──
  "Pakistan": "巴基斯坦",
  "PAK": "巴基斯坦",
  "Palau": "帕劳",
  "Palestine": "巴勒斯坦",
  "Palestine, State of": "巴勒斯坦",
  "Occupied Palestinian Territory": "巴勒斯坦",
  "West Bank and Gaza": "巴勒斯坦",
  "Panama": "巴拿马",
  "Papua New Guinea": "巴布亚新几内亚",
  "Paraguay": "巴拉圭",
  "Peru": "秘鲁",
  "Philippines": "菲律宾",
  "The Philippines": "菲律宾",
  "Philippine": "菲律宾",
  "Republic of the Philippines": "菲律宾",
  "PHL": "菲律宾",
  "Poland": "波兰",
  "Portugal": "葡萄牙",
  // ── Q ──
  "Qatar": "卡塔尔",
  // ── R ──
  "Romania": "罗马尼亚",
  "Russia": "俄罗斯",
  "Russian Federation": "俄罗斯",
  "The Russian Federation": "俄罗斯",
  "RUS": "俄罗斯",
  "Rwanda": "卢旺达",
  // ── S ──
  "Saint Kitts and Nevis": "圣基茨和尼维斯",
  "Saint Lucia": "圣卢西亚",
  "Saint Vincent and the Grenadines": "圣文森特和格林纳丁斯",
  "Samoa": "萨摩亚",
  "San Marino": "圣马力诺",
  "Sao Tome and Principe": "圣多美和普林西比",
  "Saudi Arabia": "沙特阿拉伯",
  "KSA": "沙特阿拉伯",
  "SAU": "沙特阿拉伯",
  "Senegal": "塞内加尔",
  "Serbia": "塞尔维亚",
  "Serbia, Republic of": "塞尔维亚", // 官方全称
  "Seychelles": "塞舌尔",
  "Sierra Leone": "塞拉利昂",
  "Singapore": "新加坡",
  "SGP": "新加坡",
  "Slovakia": "斯洛伐克",
  "Slovak Republic": "斯洛伐克",
  "Slovenia": "斯洛文尼亚",
  "Solomon Islands": "所罗门群岛",
  "Somalia": "索马里",
  "South Africa": "南非",
  "ZAF": "南非",
  "Africa do Sul": "南非",      // 葡萄牙语
  "África do Sul": "南非",     // 葡萄牙语（带重音）
  "Afrique du Sud": "南非",     // 法语
  "Suid-Afrika": "南非",        // 南非荷兰语
  "South Sudan": "南苏丹",
  "Spain": "西班牙",
  "Sri Lanka": "斯里兰卡",
  "LKA": "斯里兰卡",
  "Sudan": "苏丹",
  "Suriname": "苏里南",
  "Sweden": "瑞典",
  "Switzerland": "瑞士",
  "Syria": "叙利亚",
  "Syrian Arab Republic": "叙利亚",
  // ── T ──
  "Taiwan": "中国台湾",
  "Taiwan, Province of China": "中国台湾",
  "Republic of China": "中国台湾",
  "ROC": "中国台湾",
  "Tajikistan": "塔吉克斯坦",
  "Tanzania": "坦桑尼亚",
  "United Republic of Tanzania": "坦桑尼亚",
  "Tanzania, United Republic of": "坦桑尼亚",
  "TZA": "坦桑尼亚",
  "Thailand": "泰国",
  "THA": "泰国",
  "Timor-Leste": "东帝汶",
  "Togo": "多哥",
  "Tonga": "汤加",
  "Trinidad and Tobago": "特立尼达和多巴哥",
  "Tunisia": "突尼斯",
  "Turkey": "土耳其",
  "Türkiye": "土耳其",
  "TUR": "土耳其",
  "Turkmenistan": "土库曼斯坦",
  "Tuvalu": "图瓦卢",
  // ── U ──
  "Uganda": "乌干达",
  "UGA": "乌干达",
  "Ukraine": "乌克兰",
  "United Arab Emirates": "阿联酋",
  "UAE": "阿联酋",
  "ARE": "阿联酋",
  "United Kingdom": "英国",
  "The United Kingdom": "英国",
  "UK": "英国",
  "U.K.": "英国",
  "GBR": "英国",
  "Great Britain": "英国",
  "England": "英国",
  "United States": "美国",
  "United States of America": "美国",
  "The United States": "美国",
  "USA": "美国",
  "U.S.": "美国",
  "U.S.A.": "美国",
  "US": "美国",
  "CHN": "中国",
  "Uruguay": "乌拉圭",
  "Uzbekistan": "乌兹别克斯坦",
  // ── V ──
  "Vanuatu": "瓦努阿图",
  "Venezuela": "委内瑞拉",
  "Venezuela, Bolivarian Republic of": "委内瑞拉",
  "Vietnam": "越南",
  "Viet Nam": "越南",
  "VNM": "越南",
  // ── Y ──
  "Yemen": "也门",
  "YEM": "也门",
  // ── Z ──
  "Zambia": "赞比亚",
  "ZMB": "赞比亚",
  "Zimbabwe": "津巴布韦",
  "ZWE": "津巴布韦",
  // ── 港澳 ──
  "Hong Kong": "中国香港",
  "Hong Kong SAR": "中国香港",
  "Hong Kong SAR, China": "中国香港",
  "Macao": "中国澳门",
  "Macao SAR": "中国澳门",
  "Macao SAR, China": "中国澳门",
  // ── 区域分组 / 特殊标记 ──
  "Eastern and Southern Africa": "东部和南部非洲",
  "Western and Central Africa": "西部和中部非洲",
  "Southwest Indian Ocean": "西南印度洋",
  "Multi-Country": "多国",
  "Regional": "区域",
  // ── 大小写变体 ──
  "america": "美国",
  "America": "美国",
  // ── 英文变体 / 拼写错误 / HTML 实体 ──
  "Turkiye": "土耳其",
  "T&#252;rkiye": "土耳其",
  "Cote d'Ivoire": "科特迪瓦",
  "Cote d’Ivoire": "科特迪瓦",
  "C&#244;te d'Ivoire": "科特迪瓦",
  "Côte d’Ivoire": "科特迪瓦",
  "Kyrgyz Republic": "吉尔吉斯斯坦",
  "Kosovo": "科索沃",
  "Dem. Rep. Congo": "刚果（金）",
  "RDC": "刚果（金）",
  "DRC - Angola": "刚果（金）-安哥拉",
  "Cape Verde": "佛得角",
  "The Gambia": "冈比亚",
  "Lybia": "利比亚",
  "Bolivia (Plurinational State of)": "玻利维亚",
  "St. Lucia": "圣卢西亚",
  "St Maarten": "圣马丁",
  "Sint Maarten": "圣马丁",
  "Palestine / West Bank & Gaza": "巴勒斯坦",
  "Greenland": "格陵兰",
  "Jersey": "泽西岛",
  "Niue": "纽埃",
  "Bermuda": "百慕大",
  "Cook Islands": "库克群岛",
  "Saint Pierre and Miquelon": "圣皮埃尔和密克隆",
  "Netherlands Antilles": "荷属安的列斯",
  "RCA": "中非共和国",
  "Sultanate": "阿曼",
  // ── 斜杠变体 / 数据源非标准格式 ──
  "Myanmar/Burma": "缅甸",
  "Burma/Myanmar": "缅甸",
  // ── 子国家/地区误作国家名（数据库中高频出现的非标准值）──
  // 注意：以下条目同时存在于 SUB_COUNTRY_ZH，此处保留是为了
  // getCountryDisplayName() 的快速路径（该函数不查 SUB_COUNTRY_ZH）。
  // normalizeCountry() 会先命中此处，结果一致（均指向同一国家中文名）。
  // 菲律宾省份
  "/，Basilan": "菲律宾",
  "Basilan": "菲律宾",
  "La Union": "菲律宾",
  "Ilocos Norte": "菲律宾",
  "Ilocos Sur": "菲律宾",
  "Cagayan": "菲律宾",
  "Isabela": "菲律宾",
  // 斯里兰卡城市
  "Colombo": "斯里兰卡",
  // 肯尼亚郡
  "Mombasa": "肯尼亚",
  "Nairobi": "肯尼亚",
  // 巴西州/市
  "Rio de Janeiro": "巴西",
  "Sao Paulo": "巴西",
  "São Paulo": "巴西",
  "Minas Gerais": "巴西",
  "Bahia": "巴西",
  "Parana": "巴西",
  "Paraná": "巴西",
  // 印度邦/城市
  "Mumbai": "印度",
  "Delhi": "印度",
  "Kolkata": "印度",
  "Maharashtra": "印度",
  // 哥伦比亚城市/省
  "Bogota": "哥伦比亚",
  "Bogotá": "哥伦比亚",
  // 秘鲁城市
  "Lima": "秘鲁",
  // 法语名（联合国数据源常见） ──
  "Mauritanie": "毛里塔尼亚",
  "Tchad": "乍得",
  "Cameroun": "喀麦隆",
  "Comores": "科摩罗",
  "Guinée": "几内亚",
  "Guinée Equatoriale": "赤道几内亚",
  // ── 区域分组 / 特殊标记（补充） ──
  "Multiple destinations": "多个目的地",
  "Central Asia": "中亚",
  "Central Africa": "中部非洲",
  "Southern Africa": "南部非洲",
  "Horn of Africa": "非洲之角",
  "Africa": "非洲",
  "Asia": "亚洲",
  "Caribbean": "加勒比地区",
  "Latin America and the Carib": "多国",
  "Latin America and the Caribbean": "多国",
  "Latin America": "多国",
  "East Asia and Pacific": "东亚和太平洋",
  "Europe Non EU 27": "多国",        // 欧洲非欧盟27国
  "Europe": "多国",                   // 欧洲（区域名）
  "Pacific 1": "太平洋地区",
  "Western Balkans": "西巴尔干",
  "OECS Countries": "东加勒比国家组织",
  "Global": "全球",
  "Worldwide": "全球",
  "Multinational": "多国",
  "International": "国际",
  // ── 数据质量问题：非国家名被写入 country 字段（归一化为 Unknown）──
  "Unknown": "未知",
  "N/A": "未知",
  "Not specified": "未知",
  "Not Available": "未知",
  "None": "未知",
  "Other": "未知",
  // ── 数据库已有中文名（反向映射）──
  "英国": "英国",
  "美国": "美国",
  "中国": "中国",
  "法国": "法国",
  "德国": "德国",
  "日本": "日本",
  "韩国": "韩国",
  "俄罗斯": "俄罗斯",
  "巴西": "巴西",
  "印度": "印度",
  "澳大利亚": "澳大利亚",
  "加拿大": "加拿大",
  "意大利": "意大利",
  "西班牙": "西班牙",
  "葡萄牙": "葡萄牙",
  "荷兰": "荷兰",
  "比利时": "比利时",
  "瑞士": "瑞士",
  "奥地利": "奥地利",
  "瑞典": "瑞典",
  "挪威": "挪威",
  "丹麦": "丹麦",
  "芬兰": "芬兰",
  "波兰": "波兰",
  "捷克": "捷克",
  "匈牙利": "匈牙利",
  "罗马尼亚": "罗马尼亚",
  "希腊": "希腊",
  "土耳其": "土耳其",
  "埃及": "埃及",
  "南非": "南非",
  "尼日利亚": "尼日利亚",
  "肯尼亚": "肯尼亚",
  "沙特阿拉伯": "沙特阿拉伯",
  "阿联酋": "阿联酋",
  "以色列": "以色列",
  "伊朗": "伊朗",
  "伊拉克": "伊拉克",
  "巴基斯坦": "巴基斯坦",
  "孟加拉国": "孟加拉国",
  "印度尼西亚": "印度尼西亚",
  "马来西亚": "马来西亚",
  "新加坡": "新加坡",
  "泰国": "泰国",
  "越南": "越南",
  "菲律宾": "菲律宾",
  "缅甸": "缅甸",
  "柬埔寨": "柬埔寨",
  "老挝": "老挝",
  "蒙古": "蒙古",
  "朝鲜": "朝鲜",
  "墨西哥": "墨西哥",
  "阿根廷": "阿根廷",
  "智利": "智利",
  "秘鲁": "秘鲁",
  "哥伦比亚": "哥伦比亚",
  "委内瑞拉": "委内瑞拉",
  "厄瓜多尔": "厄瓜多尔",
  "玻利维亚": "玻利维亚",
  "乌拉圭": "乌拉圭",
  "巴拉圭": "巴拉圭",
  "古巴": "古巴",
  "巴拿马": "巴拿马",
  "哥斯达黎加": "哥斯达黎加",
  "危地马拉": "危地马拉",
  "洪都拉斯": "洪都拉斯",
  "萨尔瓦多": "萨尔瓦多",
  "尼加拉瓜": "尼加拉瓜",
  "多米尼加": "多米尼加",
  "海地": "海地",
  "牙买加": "牙买加",
  "特立尼达和多巴哥": "特立尼达和多巴哥",
  "摩洛哥": "摩洛哥",
  "阿尔及利亚": "阿尔及利亚",
  "突尼斯": "突尼斯",
  "利比亚": "利比亚",
  "苏丹": "苏丹",
  "埃塞俄比亚": "埃塞俄比亚",
  "坦桑尼亚": "坦桑尼亚",
  "乌干达": "乌干达",
  "加纳": "加纳",
  "塞内加尔": "塞内加尔",
  "喀麦隆": "喀麦隆",
  "科特迪瓦": "科特迪瓦",
  "刚果（金）": "刚果（金）",
  "刚果（布）": "刚果（布）",
  "安哥拉": "安哥拉",
  "莫桑比克": "莫桑比克",
  "赞比亚": "赞比亚",
  "津巴布韦": "津巴布韦",
  "博茨瓦纳": "博茨瓦纳",
  "纳米比亚": "纳米比亚",
  "马达加斯加": "马达加斯加",
  "马拉维": "马拉维",
  "卢旺达": "卢旺达",
  "布隆迪": "布隆迪",
  "索马里": "索马里",
  "马里": "马里",
  "尼日尔": "尼日尔",
  "乍得": "乍得",
  "布基纳法索": "布基纳法索",
  "几内亚": "几内亚",
  "塞拉利昂": "塞拉利昂",
  "利比里亚": "利比里亚",
  "多哥": "多哥",
  "贝宁": "贝宁",
  "加蓬": "加蓬",
  "赤道几内亚": "赤道几内亚",
  "中非共和国": "中非共和国",
  "刚果": "刚果",
  "中国香港": "中国香港",
  "中国澳门": "中国澳门",
  "中国台湾": "中国台湾",
  // ── ISO 3166-1 alpha-2 代码（数据库可能存储 ISO 代码而非英文全名）──
  "AF": "阿富汗", "AL": "阿尔巴尼亚", "DZ": "阿尔及利亚", "AO": "安哥拉",
  "AR": "阿根廷", "AM": "亚美尼亚", "AU": "澳大利亚", "AT": "奥地利",
  "AZ": "阿塞拜疆", "BD": "孟加拉国", "BY": "白俄罗斯", "BE": "比利时",
  "BJ": "贝宁", "BO": "玻利维亚", "BA": "波黑", "BW": "博茨瓦纳",
  "BR": "巴西", "BF": "布基纳法索", "BI": "布隆迪", "KH": "柬埔寨",
  "CM": "喀麦隆", "CA": "加拿大", "CF": "中非共和国", "TD": "乍得",
  "CL": "智利", "CN": "中国", "CO": "哥伦比亚", "CR": "哥斯达黎加",
  "HR": "克罗地亚", "CU": "古巴", "CY": "塞浦路斯", "CZ": "捷克",
  "DK": "丹麦", "DJ": "吉布提", "DO": "多米尼加", "EC": "厄瓜多尔",
  "EG": "埃及", "SV": "萨尔瓦多", "GQ": "赤道几内亚", "ER": "厄立特里亚",
  "EE": "爱沙尼亚", "ET": "埃塞俄比亚", "FJ": "斐济", "FI": "芬兰",
  "FR": "法国", "GA": "加蓬", "GM": "冈比亚", "GE": "格鲁吉亚",
  "DE": "德国", "GH": "加纳", "GR": "希腊", "GT": "危地马拉",
  "GN": "几内亚", "GY": "圭亚那", "HT": "海地", "HN": "洪都拉斯",
  "HU": "匈牙利", "IN": "印度", "ID": "印度尼西亚", "IR": "伊朗",
  "IQ": "伊拉克", "IL": "以色列", "IT": "意大利", "JM": "牙买加",
  "JP": "日本", "JO": "约旦", "KZ": "哈萨克斯坦", "KE": "肯尼亚",
  "KW": "科威特", "KG": "吉尔吉斯斯坦", "LA": "老挝", "LV": "拉脱维亚",
  "LB": "黎巴嫩", "LS": "莱索托", "LR": "利比里亚", "LY": "利比亚",
  "LT": "立陶宛", "MK": "北马其顿", "MG": "马达加斯加", "MW": "马拉维",
  "MY": "马来西亚", "ML": "马里", "MR": "毛里塔尼亚", "MU": "毛里求斯",
  "MX": "墨西哥", "MD": "摩尔多瓦", "MN": "蒙古", "ME": "黑山",
  "MA": "摩洛哥", "MZ": "莫桑比克", "MM": "缅甸", "NA": "纳米比亚",
  "NP": "尼泊尔", "NL": "荷兰", "NZ": "新西兰", "NI": "尼加拉瓜",
  "NE": "尼日尔", "NG": "尼日利亚", "NO": "挪威", "OM": "阿曼",
  "PK": "巴基斯坦", "PA": "巴拿马", "PY": "巴拉圭", "PE": "秘鲁",
  "PH": "菲律宾", "PL": "波兰", "PT": "葡萄牙", "QA": "卡塔尔",
  "RO": "罗马尼亚", "RU": "俄罗斯", "RW": "卢旺达", "SA": "沙特阿拉伯",
  "SN": "塞内加尔", "RS": "塞尔维亚", "SL": "塞拉利昂", "SG": "新加坡",
  "SK": "斯洛伐克", "SI": "斯洛文尼亚", "SO": "索马里", "ZA": "南非",
  "ES": "西班牙", "LK": "斯里兰卡", "SD": "苏丹", "SR": "苏里南",
  "SZ": "斯威士兰", "SE": "瑞典", "CH": "瑞士", "SY": "叙利亚",
  "TW": "台湾", "TJ": "塔吉克斯坦", "TZ": "坦桑尼亚", "TH": "泰国",
  "TG": "多哥", "TT": "特立尼达和多巴哥", "TN": "突尼斯", "TR": "土耳其",
  "UG": "乌干达", "UA": "乌克兰", "AE": "阿联酋", "GB": "英国",
  "UY": "乌拉圭", "UZ": "乌兹别克斯坦", "VE": "委内瑞拉",
  "VN": "越南", "YE": "也门", "ZM": "赞比亚", "ZW": "津巴布韦",
};

/**
 * 子国家/地区 → 所属国家中文名映射
 * Sub-national Region → Parent Country Chinese Name
 *
 * @description 数据库 country 字段存在将省/州/城市名误存为国家名的情况，
 *              此表覆盖高频出现的非标准值，将其归并到所属国家的中文名。
 */
export const SUB_COUNTRY_ZH: Record<string, string> = {
  // ── 菲律宾省份 ──
  "Basilan": "菲律宾",
  "Kalinga": "菲律宾",
  "La Union": "菲律宾",
  "Ilocos Norte": "菲律宾",
  "Ilocos Sur": "菲律宾",
  "Cagayan": "菲律宾",
  "Isabela": "菲律宾",
  "Pangasinan": "菲律宾",
  "Zamboanga": "菲律宾",
  "Davao": "菲律宾",
  "Cebu": "菲律宾",
  "Batangas": "菲律宾",
  "Laguna": "菲律宾",
  "Cavite": "菲律宾",
  "Bulacan": "菲律宾",
  "Rizal": "菲律宾",
  "Quezon": "菲律宾",
  "Palawan": "菲律宾",
  "Antique": "菲律宾",
  "Bohol": "菲律宾",
  "Leyte": "菲律宾",
  "Samar": "菲律宾",
  "Misamis": "菲律宾",
  "Bukidnon": "菲律宾",
  "Agusan": "菲律宾",
  "Surigao": "菲律宾",
  "Negros": "菲律宾",
  "Mindoro": "菲律宾",
  // ── 斯里兰卡城市 ──
  "Colombo": "斯里兰卡",
  "Kandy": "斯里兰卡",
  "Galle": "斯里兰卡",
  // ── 肯尼亚郡/城市 ──
  "Mombasa": "肯尼亚",
  "Nairobi": "肯尼亚",
  "Kisumu": "肯尼亚",
  "Nakuru": "肯尼亚",
  // ── 巴西州/市 ──
  "Rio de Janeiro": "巴西",
  "Sao Paulo": "巴西",
  "São Paulo": "巴西",
  "Minas Gerais": "巴西",
  "Bahia": "巴西",
  "Parana": "巴西",
  "Paraná": "巴西",
  "Rio Grande do Sul": "巴西",
  "Santa Catarina": "巴西",
  "Pernambuco": "巴西",
  "Ceara": "巴西",
  "Ceará": "巴西",
  "Goias": "巴西",
  "Goiás": "巴西",
  "Distrito Federal": "巴西",
  // ── 印度邦/城市 ──
  "Mumbai": "印度",
  "Delhi": "印度",
  "Kolkata": "印度",
  "Chennai": "印度",
  "Maharashtra": "印度",
  "Karnataka": "印度",
  "Tamil Nadu": "印度",
  "Gujarat": "印度",
  "Rajasthan": "印度",
  "Kerala": "印度",
  // ── 哥伦比亚城市 ──
  "Bogota": "哥伦比亚",
  "Bogotá": "哥伦比亚",
  "Medellin": "哥伦比亚",
  "Medellín": "哥伦比亚",
  "Cali": "哥伦比亚",
  "Barranquilla": "哥伦比亚",
  // ── 秘鲁城市 ──
  "Lima": "秘鲁",
  "Arequipa": "秘鲁",
  "Cusco": "秘鲁",
  // ── 墨西哥州/城市 ──
  "Mexico City": "墨西哥",
  "Ciudad de Mexico": "墨西哥",
  "Jalisco": "墨西哥",
  "Nuevo Leon": "墨西哥",
  "Nuevo León": "墨西哥",
  // ── 印尼城市 ──
  "Jakarta": "印度尼西亚",
  "Surabaya": "印度尼西亚",
  "Bali": "印度尼西亚",
  // ── 尼日利亚州/城市 ──
  "Lagos": "尼日利亚",
  "Abuja": "尼日利亚",
  // ── 坦桑尼亚城市 ──
  "Dar es Salaam": "坦桑尼亚",
  "Dodoma": "坦桑尼亚",
  // ── 越南城市 ──
  "Ho Chi Minh": "越南",
  "Hanoi": "越南",
  "Hà Nội": "越南",
  // ── 泰国城市 ──
  "Bangkok": "泰国",
  "Chiang Mai": "泰国",
  // ── 马来西亚州/城市 ──
  "Penang": "马来西亚",
  "Johor": "马来西亚",
  "Selangor": "马来西亚",
  "Kuala Lumpur": "马来西亚",
  // ── 孟加拉国城市 ──
  "Dhaka": "孟加拉国",
  "Chittagong": "孟加拉国",
  // ── 荷兰海外领土 ──
  "Caribbean Netherlands": "荷兰",
  "Bonaire": "荷兰",
  "Sint Eustatius": "荷兰",
  "Saba": "荷兰",
  "Aruba": "荷兰",
  "Curacao": "荷兰",
  "Curaçao": "荷兰",
  "Sint Maarten": "荷兰",
  // ── 索马里兰（索马里北部自治地区）──
  "Somaliland": "索马里",
};

/**
 * 清理国家名原始值中的常见脏数据前缀
 *
 * @description 数据库中存在 "/，Basilan" 等含非法前缀的值，
 *              此函数在归一化之前调用，剥离非国家名垃圾字符。
 */
export function cleanCountryRaw(raw: string): string {
  let cleaned = raw.trim();
  // 剥离 "/"、"/，"、"/, " 等前缀（数据源格式错误）
  cleaned = cleaned.replace(/^[\/]+\s*[，,]?\s*/, "");
  // 剥离前导标点（逗号、分号、冒号、竖线等）
  cleaned = cleaned.replace(/^[,;:|]+\s*/, "");
  // HTML 实体解码（&#NNN; 和 &#xHHH;），处理 "T&#252;rkiye" 等编码变体
  cleaned = cleaned.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  cleaned = cleaned.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  // 括号转逗号："Korea (Democratic...)" → "Korea, Democratic..."
  cleaned = cleaned.replace(/\s*\(([^)]+)\)/g, ", $1");
  // 下划线转空格（国家名不含下划线，辅助机构名归一化）
  cleaned = cleaned.replace(/_/g, " ");
  return cleaned.trim();
}

/**
 * 常见国家次级区域中文名映射表
 * Chinese Name Mapping for Common Sub-national Regions
 *
 * @description 数据库 country 字段存在 "Canada, British Columbia" 这类"国家, 区域"值，
 *              此表覆盖高频区域；未收录的区域在显示时保留英文并置于括号内。
 */
export const REGION_NAME_ZH: Record<string, string> = {
  // ── 加拿大省份/地区 ──
  "British Columbia": "不列颠哥伦比亚",
  "Alberta": "艾伯塔",
  "Ontario": "安大略",
  "Quebec": "魁北克",
  "Québec": "魁北克",
  "Manitoba": "曼尼托巴",
  "Saskatchewan": "萨斯喀彻温",
  "Nova Scotia": "新斯科舍",
  "New Brunswick": "新不伦瑞克",
  "Newfoundland and Labrador": "纽芬兰与拉布拉多",
  "Prince Edward Island": "爱德华王子岛",
  "Northwest Territories": "西北地区",
  "Yukon": "育空",
  "Nunavut": "努纳武特",
  // ── 澳大利亚州/领地 ──
  "New South Wales": "新南威尔士",
  "Victoria": "维多利亚",
  "Queensland": "昆士兰",
  "South Australia": "南澳大利亚",
  "Western Australia": "西澳大利亚",
  "Tasmania": "塔斯马尼亚",
  "Australian Capital Territory": "首都领地",
  "Northern Territory": "北领地",
  // ── 英国构成国/地区 ──
  "Scotland": "苏格兰",
  "Wales": "威尔士",
  "Northern Ireland": "北爱尔兰",
};

/**
 * 中文国家名 → 英文原名反向映射（用于数据库已存储中文名的情况）
 * E3 优化：导出供 API 端点使用，前端不再维护独立副本
 */
export const ZH_TO_EN: Record<string, string> = {
  "英国": "United Kingdom",
  "美国": "United States",
  "中国": "China",
  "法国": "France",
  "德国": "Germany",
  "日本": "Japan",
  "韩国": "South Korea",
  "俄罗斯": "Russia",
  "巴西": "Brazil",
  "印度": "India",
  "澳大利亚": "Australia",
  "加拿大": "Canada",
  "意大利": "Italy",
  "西班牙": "Spain",
  "葡萄牙": "Portugal",
  "荷兰": "Netherlands",
  "比利时": "Belgium",
  "瑞士": "Switzerland",
  "奥地利": "Austria",
  "瑞典": "Sweden",
  "挪威": "Norway",
  "丹麦": "Denmark",
  "芬兰": "Finland",
  "波兰": "Poland",
  "捷克": "Czech Republic",
  "匈牙利": "Hungary",
  "罗马尼亚": "Romania",
  "希腊": "Greece",
  "土耳其": "Turkey",
  "埃及": "Egypt",
  "南非": "South Africa",
  "尼日利亚": "Nigeria",
  "肯尼亚": "Kenya",
  "沙特阿拉伯": "Saudi Arabia",
  "阿联酋": "United Arab Emirates",
  "以色列": "Israel",
  "伊朗": "Iran",
  "伊拉克": "Iraq",
  "巴基斯坦": "Pakistan",
  "孟加拉国": "Bangladesh",
  "印度尼西亚": "Indonesia",
  "马来西亚": "Malaysia",
  "新加坡": "Singapore",
  "泰国": "Thailand",
  "越南": "Vietnam",
  "菲律宾": "Philippines",
  "缅甸": "Myanmar",
  "柬埔寨": "Cambodia",
  "老挝": "Laos",
  "蒙古": "Mongolia",
  "朝鲜": "North Korea",
  "墨西哥": "Mexico",
  "阿根廷": "Argentina",
  "智利": "Chile",
  "秘鲁": "Peru",
  "哥伦比亚": "Colombia",
  "委内瑞拉": "Venezuela",
  "厄瓜多尔": "Ecuador",
  "玻利维亚": "Bolivia",
  "乌拉圭": "Uruguay",
  "巴拉圭": "Paraguay",
  "古巴": "Cuba",
  "巴拿马": "Panama",
  "哥斯达黎加": "Costa Rica",
  "危地马拉": "Guatemala",
  "洪都拉斯": "Honduras",
  "萨尔瓦多": "El Salvador",
  "尼加拉瓜": "Nicaragua",
  "多米尼加": "Dominican Republic",
  "海地": "Haiti",
  "牙买加": "Jamaica",
  "特立尼达和多巴哥": "Trinidad and Tobago",
  "摩洛哥": "Morocco",
  "阿尔及利亚": "Algeria",
  "突尼斯": "Tunisia",
  "利比亚": "Libya",
  "苏丹": "Sudan",
  "埃塞俄比亚": "Ethiopia",
  "坦桑尼亚": "Tanzania",
  "乌干达": "Uganda",
  "加纳": "Ghana",
  "塞内加尔": "Senegal",
  "喀麦隆": "Cameroon",
  "科特迪瓦": "Côte d'Ivoire",
  "刚果（金）": "Democratic Republic of the Congo",
  "刚果（布）": "Republic of the Congo",
  "安哥拉": "Angola",
  "莫桑比克": "Mozambique",
  "赞比亚": "Zambia",
  "津巴布韦": "Zimbabwe",
  "博茨瓦纳": "Botswana",
  "纳米比亚": "Namibia",
  "马达加斯加": "Madagascar",
  "马拉维": "Malawi",
  "卢旺达": "Rwanda",
  "布隆迪": "Burundi",
  "索马里": "Somalia",
  "马里": "Mali",
  "尼日尔": "Niger",
  "乍得": "Chad",
  "布基纳法索": "Burkina Faso",
  "几内亚": "Guinea",
  "塞拉利昂": "Sierra Leone",
  "利比里亚": "Liberia",
  "多哥": "Togo",
  "贝宁": "Benin",
  "加蓬": "Gabon",
  "赤道几内亚": "Equatorial Guinea",
  "中非共和国": "Central African Republic",
  "刚果": "Congo",
  "中国香港": "Hong Kong",
  "中国澳门": "Macao",
  "中国台湾": "Taiwan",
  "东部和南部非洲": "Eastern and Southern Africa",
  "西部和中部非洲": "Western and Central Africa",
  "西南印度洋": "Southwest Indian Ocean",
  "多国": "Multi-Country",
  "区域": "Regional",
};

/** 按国家名查中文（先精确、后大小写不敏感），未命中返回 null */
function matchCountryZh(name: string): string | null {
  if (COUNTRY_NAME_ZH[name]) return COUNTRY_NAME_ZH[name];
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(COUNTRY_NAME_ZH)) {
    if (key.toLowerCase() === lower) return val;
  }
  return null;
}

/** 按区域名查中文（大小写不敏感），未命中返回 null */
function matchRegionZh(region: string): string | null {
  if (REGION_NAME_ZH[region]) return REGION_NAME_ZH[region];
  const lower = region.toLowerCase();
  for (const [key, val] of Object.entries(REGION_NAME_ZH)) {
    if (key.toLowerCase() === lower) return val;
  }
  return null;
}

/**
 * 解析 "国家, 区域" 形式的区域值（如 "Canada, British Columbia"）。
 * 兼容国家在前与区域在前后两种顺序；国家部分必须可译，否则返回 null 回退原文。
 * 区域未收录时保留英文置于括号内，保证不再整条纯英文展示。
 */
function resolveRegionDisplayName(value: string): string | null {
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // 国家在前："Canada, British Columbia"
  const countryFirst = matchCountryZh(parts[0]);
  if (countryFirst) {
    const region = parts.slice(1).join(", ");
    return `${countryFirst}（${matchRegionZh(region) ?? region}）`;
  }
  // 区域在前："British Columbia, Canada"
  const last = parts[parts.length - 1];
  const countryLast = matchCountryZh(last);
  if (countryLast) {
    const region = parts.slice(0, -1).join(", ");
    return `${countryLast}（${matchRegionZh(region) ?? region}）`;
  }
  return null;
}

/**
 * 获取国家的显示名
 * @param englishName 英文国家名（数据库原始值）
 * @param locale 当前语言环境
 * @returns 中文环境下返回中文名（含区域值解析），其他语言回退英文原名
 */
export function getCountryDisplayName(englishName: string, locale: string): string {
  if (locale !== "zh") return englishName;
  // 先精确匹配
  if (COUNTRY_NAME_ZH[englishName]) return COUNTRY_NAME_ZH[englishName];
  // 大小写不敏感匹配（处理 "america" → "美国" 等）
  const matched = matchCountryZh(englishName);
  if (matched) return matched;
  // "国家, 区域" 值拆分解析（如 "Canada, British Columbia" → "加拿大（不列颠哥伦比亚）"）
  return resolveRegionDisplayName(englishName) ?? englishName;
}

/**
 * 获取国家的英文原名（用于中文环境下显示英文辅助信息）
 * 当数据库已存储中文名时，反向查找英文原名
 */
export function getCountryEnglishName(rawName: string): string {
  // 如果已经是英文（不在中文映射表中），直接返回
  if (!COUNTRY_NAME_ZH[rawName]) return rawName;
  // 如果中文名在反向映射表中，返回英文
  return ZH_TO_EN[rawName] ?? rawName;
}
