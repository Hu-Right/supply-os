/**
 * F02 产品清单导入单测（仅 XLSX）
 * @module tests/unit/lib/services/procurement/spreadsheet
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { parseProductList, parseXlsx, rowsToItems } from "@/lib/services/procurement/spreadsheet";

describe("明细行映射", () => {
  it("无表头：按 名称/规格/数量/单位/标包 顺序", () => {
    const r = rowsToItems([
      ["电子白板", "86 寸触摸", "100", "台", ""],
      ["", "", "", "", ""],
      ["讲台", "木质", "20", "张", "LOT-02"],
    ]);
    expect(r.items).toHaveLength(2);
    expect(r.items[1]).toMatchObject({ nameZh: "讲台", lotNo: "LOT-02", quantity: 20 });
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

  it("只接受 xlsx：pdf / csv 一律明确报错", async () => {
    await expect(parseProductList(Buffer.from("x"), "a.pdf")).rejects.toThrow("UNSUPPORTED_FORMAT");
    await expect(parseProductList(Buffer.from("产品,规格\n课桌,双人"), "list.csv")).rejects.toThrow(
      "UNSUPPORTED_FORMAT",
    );
  });

  it("下载的 Excel 模板本身可被导入解析", async () => {
    const buffer = readFileSync("public/downloads/templates/procurement-items-import-template.xlsx");
    const r = await parseProductList(buffer, "procurement-items-import-template.xlsx");
    expect(r.items.length).toBe(3);
    expect(r.items[0]).toMatchObject({ nameZh: "学生课桌椅", quantity: 5000, qtyUnit: "套" });
  });
});
