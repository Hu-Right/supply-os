/**
 * 拉丁/西里尔 → 汉字 音节音译核心（离线，无外部依赖）
 *
 * 切分策略（自左向右，贪心最长匹配）：
 *   1) 已知整音节表（含 CVC / 双元音）最长优先；
 *   2) 声母 + 元音；
 *   3) 韵尾只在「不是下一音节声母」时吞入（避免 tha-ra 被切成 thar-a）。
 * 目标是稳定、可读、纯中文；头部高频名由人工词典覆盖。
 */

export function foldLatin(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/ø/g, "o").replace(/Ø/g, "O")
    .replace(/ł/g, "l").replace(/Ł/g, "L")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae").replace(/Æ/g, "AE")
    .replace(/œ/g, "oe").replace(/Œ/g, "OE")
    .replace(/þ/g, "th").replace(/ð/g, "d")
    .replace(/ı/g, "i");
}

const CYR = {
  а:"a", б:"b", в:"v", г:"g", ґ:"g", д:"d", е:"e", ё:"e", є:"ye", ж:"zh", з:"z", и:"i",
  і:"i", ї:"yi", й:"y", к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r", с:"s", т:"t",
  у:"u", ф:"f", х:"kh", ц:"ts", ч:"ch", ш:"sh", щ:"shch", ъ:"", ы:"y", ь:"", э:"e",
  ю:"yu", я:"ya",
};
export function cyrToLatin(s) {
  return [...String(s).toLowerCase()].map((ch) => CYR[ch] ?? ch).join("");
}

const CV = {
  "":  { a:"阿", e:"埃", i:"伊", o:"奥", u:"乌", y:"伊" },
  b:   { a:"巴", e:"贝", i:"比", o:"博", u:"布", y:"比" },
  c:   { a:"卡", e:"塞", i:"奇", o:"科", u:"库", y:"西" },
  ch:  { a:"查", e:"切", i:"奇", o:"乔", u:"楚", y:"奇" },
  d:   { a:"达", e:"德", i:"迪", o:"多", u:"杜", y:"迪" },
  f:   { a:"法", e:"费", i:"菲", o:"福", u:"富", y:"菲" },
  g:   { a:"加", e:"格", i:"吉", o:"戈", u:"古", y:"吉" },
  h:   { a:"哈", e:"赫", i:"希", o:"霍", u:"胡", y:"希" },
  j:   { a:"贾", e:"杰", i:"吉", o:"乔", u:"朱", y:"吉" },
  k:   { a:"卡", e:"凯", i:"基", o:"科", u:"库", y:"基" },
  kh:  { a:"哈", e:"赫", i:"希", o:"霍", u:"胡", y:"希" },
  l:   { a:"拉", e:"莱", i:"利", o:"洛", u:"卢", y:"利" },
  m:   { a:"马", e:"梅", i:"米", o:"莫", u:"穆", y:"米" },
  n:   { a:"纳", e:"内", i:"尼", o:"诺", u:"努", y:"尼" },
  p:   { a:"帕", e:"佩", i:"皮", o:"波", u:"普", y:"皮" },
  ph:  { a:"法", e:"费", i:"菲", o:"福", u:"富", y:"菲" },
  q:   { a:"卡", e:"凯", i:"基", o:"科", u:"库", y:"基" },
  r:   { a:"拉", e:"雷", i:"里", o:"罗", u:"鲁", y:"里" },
  s:   { a:"萨", e:"塞", i:"西", o:"索", u:"苏", y:"西" },
  sh:  { a:"沙", e:"谢", i:"希", o:"肖", u:"舒", y:"希" },
  t:   { a:"塔", e:"特", i:"蒂", o:"托", u:"图", y:"蒂" },
  th:  { a:"塔", e:"特", i:"蒂", o:"托", u:"图", y:"蒂" },
  ts:  { a:"察", e:"采", i:"齐", o:"措", u:"楚", y:"齐" },
  v:   { a:"瓦", e:"韦", i:"维", o:"沃", u:"武", y:"维" },
  w:   { a:"瓦", e:"韦", i:"维", o:"沃", u:"伍", y:"维" },
  x:   { a:"沙", e:"塞", i:"西", o:"索", u:"苏", y:"西" },
  y:   { a:"亚", e:"耶", i:"伊", o:"约", u:"尤", y:"伊" },
  z:   { a:"扎", e:"泽", i:"齐", o:"佐", u:"祖", y:"齐" },
  zh:  { a:"扎", e:"热", i:"日", o:"若", u:"茹", y:"日" },
};

const FINAL = { n:"恩", m:"姆", ng:"昂", r:"尔", l:"尔", s:"斯", t:"特", k:"克", p:"普", d:"德", z:"兹", x:"克斯" };

/** 双元音（声母之后） */
const DIPH = {
  ai:"艾", au:"奥", ay:"艾", ea:"亚", ee:"伊", ei:"埃", eu:"欧", ey:"埃",
  ie:"耶", ii:"伊", io:"尼奥", iu:"尤", oa:"瓦", oe:"奥", oi:"瓦", oo:"乌",
  ou:"乌", ua:"瓦", ue:"韦", ui:"维", uo:"沃", uy:"维", ya:"亚", ye:"耶",
  yo:"约", yu:"尤", ae:"埃", ao:"奥",
};

/** 已知整音节（最长优先） */
const SYL = {
  // -an / -en / -in / -on / -un
  ban:"班", can:"坎", cen:"森", cin:"钦", con:"孔", cun:"昆", dan:"丹", den:"登", din:"丁",
  don:"东", dun:"敦", fan:"凡", fen:"芬", fon:"丰", fun:"丰", gan:"甘", gen:"根", gin:"金",
  gon:"贡", gun:"贡", han:"汉", hen:"亨", hin:"欣", hon:"洪", hun:"洪", jan:"詹", jen:"詹",
  jin:"金", jon:"琼", jun:"琼", kan:"坎", ken:"肯", kin:"金", kon:"孔", kun:"昆", lan:"兰",
  len:"伦", lin:"林", lon:"隆", lun:"伦", man:"曼", men:"门", min:"明", mon:"蒙", mun:"蒙",
  nan:"南", nen:"嫩", nin:"宁", non:"农", nun:"农", pan:"潘", pen:"彭", pin:"平", pon:"蓬",
  pun:"蓬", ran:"兰", ren:"伦", rin:"林", ron:"龙", run:"伦", san:"桑", sen:"森", sin:"辛",
  son:"松", sun:"孙", shan:"尚", shen:"申", shin:"欣", shun:"顺", tan:"坦", ten:"滕", tin:"廷",
  ton:"通", tun:"通", van:"万", ven:"文", vin:"文", von:"冯", zan:"赞", zen:"曾", zin:"津",
  zon:"宗", zun:"宗", an:"安", en:"恩", in:"因", on:"翁", un:"温", am:"阿姆", em:"埃姆", om:"奥姆", um:"乌姆",
  // -ar / -er / -ir / -or / -ur
  bar:"巴尔", ber:"贝尔", bir:"比尔", bor:"博尔", bur:"布尔", car:"卡尔", cer:"切尔", cir:"奇尔",
  cor:"科尔", cur:"库尔", dar:"达尔", der:"德尔", dir:"迪尔", dor:"多尔", dur:"杜尔", far:"法尔",
  fer:"费尔", fir:"菲尔", for:"福尔", fur:"富尔", gar:"加尔", ger:"格尔", gir:"吉尔", gor:"戈尔",
  gur:"古尔", har:"哈尔", her:"赫尔", hir:"希尔", hor:"霍尔", hur:"胡尔", kar:"卡尔", ker:"克尔",
  kir:"基尔", kor:"科尔", kur:"库尔", lar:"拉尔", ler:"勒尔", lir:"利尔", lor:"洛尔", lur:"卢尔",
  mar:"马尔", mer:"梅尔", mir:"米尔", mor:"莫尔", mur:"穆尔", nar:"纳尔", ner:"内尔", nir:"尼尔",
  nor:"诺尔", nur:"努尔", par:"帕尔", per:"佩尔", pir:"皮尔", por:"波尔", pur:"普尔", rar:"拉尔",
  rer:"雷尔", rir:"里尔", ror:"罗尔", rur:"鲁尔", sar:"萨尔", ser:"塞尔", sir:"西尔", sor:"索尔",
  sur:"苏尔", tar:"塔尔", ter:"特尔", tir:"蒂尔", tor:"托尔", tur:"图尔", var:"瓦尔", ver:"维尔",
  vir:"维尔", vor:"沃尔", vur:"武尔", ar:"阿尔", er:"埃尔", ir:"伊尔", or:"奥尔", ur:"乌尔",
  // 韵尾 ng
  ang:"昂", eng:"恩", ing:"英", ong:"翁", ung:"翁", bang:"邦", dang:"当", fang:"方", gang:"冈",
  hang:"杭", kang:"康", lang:"朗", mang:"芒", nang:"南", pang:"庞", rang:"朗", sang:"桑",
  tang:"唐", wang:"旺", zang:"藏", chang:"昌", shang:"尚", zhang:"张", thang:"唐", phang:"芳",
  // 常见整词片段
  ber:"贝尔", berg:"贝格", burg:"堡", borg:"堡", dorf:"多夫", feld:"费尔德", haus:"豪斯",
  hausen:"豪森", stadt:"施塔特", stein:"施泰因", bach:"巴赫", mann:"曼", man:"曼",
  son:"森", sen:"森", quist:"奎斯特", qvist:"奎斯特", gren:"格伦", lund:"隆德",
  holm:"霍尔姆", strom:"斯特罗姆", bergen:"卑尔根", fjord:"峡湾",
  // 希腊/拉丁词尾
  ia:"尼亚", io:"尼奥", ius:"尤斯", eus:"乌斯", ous:"乌斯", eum:"乌姆", aum:"奥姆",
  ov:"诺夫", ova:"诺娃", ev:"耶夫", eva:"耶娃", ich:"伊奇", vich:"维奇", wicz:"维奇",
  sky:"斯基", skiy:"斯基", ski:"斯基", ska:"斯卡", sko:"斯科", enko:"延科", enka:"延卡",
  ino:"伊诺", ina:"伊娜", etti:"埃蒂", etto:"埃托", ini:"伊尼", ano:"阿诺", ana:"阿娜",
  // 西语/葡语常见
  ez:"埃斯", es:"斯", os:"奥斯", us:"乌斯", is:"伊斯", as:"阿斯", az:"阿斯", iz:"伊斯",
  // 其他高频
  que:"克", qui:"基", gue:"格", gui:"吉", ghi:"吉", che:"凯", chi:"基", schi:"斯基",
  mau:"毛", pau:"保", tau:"陶", sau:"绍", nau:"瑙", lau:"劳", hau:"豪", gau:"高",
  zon:"松", son:"松", zan:"桑", quan:"权", quanh:"光",
  ri:"里", ro:"罗", ru:"鲁", sta:"斯塔", sto:"斯托", stu:"斯图", ste:"斯特", sti:"斯蒂",
  stra:"斯特拉", stre:"斯特雷", stri:"斯特里", sp:"斯普", sk:"斯克",

};

const ONSETS = ["shch","sch","tch","str","chr","thr","shr","sph","ph","th","sh","ch","kh","zh","ts","br","tr","dr","pr","gr","kr","fr","vr","bl","pl","kl","gl","fl","sl","sm","sn","sp","st","sk","sw","b","c","d","f","g","h","j","k","l","m","n","p","q","r","s","t","v","w","x","y","z"];
const VOWELS = "aeiouy";

function isOnsetStart(w, i) {
  for (const o of ONSETS) {
    if (w.startsWith(o, i)) {
      const v = w[i + o.length];
      if (v && VOWELS.includes(v)) return true;
    }
  }
  return false;
}

/** 单词 → 汉字串 */
export function translitWord(raw) {
  let w = foldLatin(raw).toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return "";
  let tail = "";
  for (const [suf, zh] of [["ovich","奥维奇"],["evich","耶维奇"],["skiy","斯基"],["sky","斯基"],["ski","斯基"],["ska","斯卡"],["sko","斯科"],["vich","维奇"],["wicz","维奇"],["enko","延科"],["ova","诺娃"],["ev","耶夫"],["ov","诺夫"]]) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) { tail = zh; w = w.slice(0, -suf.length); break; }
  }
  const out = [];
  let i = 0;
  let guard = 0;
  while (i < w.length && guard < 60) {
    guard += 1;
    // 1) 已知整音节（2..6 字符，最长优先）
    let hit = null;
    for (let len = Math.min(6, w.length - i); len >= 2; len -= 1) {
      const s = w.slice(i, i + len);
      if (!SYL[s]) continue;
      // 跨音节保护：整音节以辅音结尾而后接元音 → 说明它吞掉了下一音节的声母
      const last = s[s.length - 1];
      const next = w[i + len];
      if (!VOWELS.includes(last) && next && VOWELS.includes(next)) continue;
      hit = { ch: SYL[s], len };
      break;
    }
    if (hit) { out.push(hit.ch); i += hit.len; continue; }
    // 2) C+l/r 复辅音（bre→布雷 / tra→特拉），必须在元音校验之前
    {
      const c1 = w[i], c2 = w[i + 1], v2 = w[i + 2];
      if (CV[c1] && (c2 === "r" || c2 === "l") && v2 && VOWELS.includes(v2)) {
        out.push((CV[c1].u ?? CV[c1].a) + (CV[c2]?.[v2] ?? ""));
        i += 3;
        continue;
      }
    }
    // 3) 声母 + 元音
    let onset = null;
    for (const o of ONSETS) {
      if (!w.startsWith(o, i)) continue;
      const vv = w[i + o.length];
      if (vv && CV[o]?.[vv]) { onset = o; break; }
    }
    if (!onset) {
      // 回退：取单字母声母（若紧跟元音）
      const single = w[i];
      if (CV[single]?.[w[i + 1]]) onset = single;
    }
    const oLen = onset ? onset.length : 0;
    const v = w[i + oLen];
    if (!v || !VOWELS.includes(v)) { i += 1; continue; }
    // 3) 双元音
    const pair = w.slice(i + oLen, i + oLen + 2);
    if (DIPH[pair]) {
      out.push((onset && CV[onset] ? CV[onset][v] : CV[""][v]) + DIPH[pair]);
      i += oLen + 2;
      continue;
    }
    const base = CV[onset ?? ""]?.[v] ?? CV[""][v] ?? "";
    i += oLen + 1;
    // 4) 韵尾：本位若已是下一音节的声母，就绝不吞成韵尾
    let coda = "";
    if (!isOnsetStart(w, i)) {
      for (const c of ["ng", "n", "m", "r", "l", "s", "t", "k", "p", "d", "z", "x"]) {
        if (!w.startsWith(c, i)) continue;
        const after = i + c.length;
        if (after < w.length && VOWELS.includes(w[after]) && (c === "r" || c === "l")) break;
        if (after < w.length && isOnsetStart(w, after)) break;
        coda = c; i = after; break;
      }
    }
    out.push(base + (coda ? (FINAL[coda] ?? "") : ""));
  }
  return out.join("") + tail;
}

/** 短语级音译：按词切分，逐词音译后拼接 */
export function translitPhrase(text) {
  return String(text)
    .split(/[\s,;:()\[\]"'’“”«»/\\|]+/)
    .filter(Boolean)
    .map((w) => translitWord(w))
    .join("");
}
