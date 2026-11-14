/**
 * F02 产品清单导入单测（CSV/TSV 与 XLSX 解析）
 * @module tests/unit/lib/services/procurement/spreadsheet
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseDelimited, parseProductList, parseXlsx, rowsToItems } from "@/lib/services/procurement/spreadsheet";

describe("CSV/TSV 解析", () => {
  it("带表头：按列名映射到明细字段", async () => {
    const csv = "标包,产品名称,规格,数量,单位\nLOT-01,学生课桌,双人钢木,2000,套\nLOT-01,学生椅,钢架,3000,把\n";
    const r = await parseProductList(Buffer.from(csv, "utf8"), "list.csv");
    expect(r.skipped).toBe(0);
    expect(r.items).toEqual([
      { lotNo: "LOT-01", nameZh: "学生课桌", spec: "双人钢木", quantity: 2000, qtyUnit: "套" },
      { lotNo: "LOT-01", nameZh: "学生椅", spec: "钢架", quantity: 3000, qtyUnit: "把" },
    ]);
  });

  it("无表头：按 名称/规格/数量/单位/标包 顺序", () => {
    const r = rowsToItems([
      ["电子白板", "86 寸触摸", "100", "台", ""],
      ["", "", "", "", ""],
      ["讲台", "木质", "20", "张", "LOT-02"],
    ]);
    expect(r.items).toHaveLength(2);
    expect(r.items[1]).toMatchObject({ nameZh: "讲台", lotNo: "LOT-02", quantity: 20 });
  });

  it("引号包裹与转义引号、逗号不串列", () => {
    const rows = parseDelimited('产品,规格,数量,单位\n"课桌,可调节",双人,10,套\n');
    expect(rows[1][0]).toBe("课桌,可调节");
    expect(rows[1][3]).toBe("套");
  });

  it("Tab 分隔自动识别", () => {
    const rows = parseDelimited("名称\t规格\t数量\t单位\n投影仪\t4K\t5\t台\n");
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe("投影仪");
  });
});

describe("XLSX 解析", () => {
  async function makeXlsx(): Promise<Buffer> {
    const zip = new JSZip();
    zip.file(
      "xl/sharedStrings.xml",
      '<?xml version="1.0"?><sst><si><t>产品名称</t></si><si><t>规格</t></si><si><t>数量</t></si><si><t>单位</t></si><si><t>课桌</t></si><si><t>双人</t></si><si><t>套</t></si></sst>',
    );
    zip.file(
      "xl/worksheets/sheet1.xml",
      '<?xml version="1.0"?><worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2"><v>1500</v></c><c r="D2" t="s"><v>6</v></c></row>' +
        "</sheetData></worksheet>",
    );
    return zip.generateAsync({ type: "nodebuffer" });
  }

  it("sharedStrings + 数值单元格 → 明细", async () => {
    const rows = await parseXlsx(await makeXlsx());
    expect(rows[0]).toEqual(["产品名称", "规格", "数量", "单位"]);
    const r = rowsToItems(rows);
    expect(r.items).toEqual([{ lotNo: "", nameZh: "课桌", spec: "双人", quantity: 1500, qtyUnit: "套" }]);
  });

  it("非 xlsx/csv 扩展名 → 明确报错", async () => {
    await expect(parseProductList(Buffer.from("x"), "a.pdf")).rejects.toThrow("UNSUPPORTED_FORMAT");
  });
});
