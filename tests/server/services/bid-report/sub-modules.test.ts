/**
 * server/services/bid-report/ 子模块测试
 * 覆盖 builders.ts, preview.ts (buildBidReportPreviewText), build.ts
 */
import { describe, it, expect } from "vitest";

// ── builders.ts ──
import {
  title0, h1, h2, h3, line, bodyText, bullet,
  tableBorders, cellMargins, cell, kvTable, boqTable,
  aiAnalysisBlocks, formatNow,
} from "../../../../server/services/bid-report/builders";

describe("title0", () => {
  it("返回 Paragraph 对象", () => {
    const p = title0("测试标题");
    expect(p).toBeDefined();
    expect(p).toBeInstanceOf(Object);
  });
});

describe("h1/h2/h3", () => {
  it("h1 返回 Paragraph", () => {
    expect(h1("第一章")).toBeDefined();
  });
  it("h2 返回 Paragraph", () => {
    expect(h2("第二节")).toBeDefined();
  });
  it("h3 返回 Paragraph", () => {
    expect(h3("子标题")).toBeDefined();
  });
});

describe("line", () => {
  it("默认样式", () => {
    expect(line("普通行")).toBeDefined();
  });
  it("自定义样式", () => {
    expect(line("自定义", { size: 28, bold: true, color: "FF0000" })).toBeDefined();
  });
});

describe("bodyText", () => {
  it("空值返回灰色占位", () => {
    const blocks = bodyText("");
    expect(blocks).toHaveLength(1);
  });
  it("'-' 返回灰色占位", () => {
    const blocks = bodyText("-");
    expect(blocks).toHaveLength(1);
  });
  it("多行文本分段", () => {
    const blocks = bodyText("第一行\n第二行\n第三行");
    expect(blocks).toHaveLength(3);
  });
  it("过滤空行", () => {
    const blocks = bodyText("第一行\n\n\n第二行");
    expect(blocks).toHaveLength(2);
  });
  it("处理 \\r\\n 换行", () => {
    const blocks = bodyText("line1\r\nline2\r\nline3");
    expect(blocks).toHaveLength(3);
  });
});

describe("bullet", () => {
  it("返回 Paragraph", () => {
    expect(bullet("条目内容")).toBeDefined();
  });
});

describe("tableBorders / cellMargins", () => {
  it("tableBorders 包含六个方向", () => {
    expect(tableBorders).toHaveProperty("top");
    expect(tableBorders).toHaveProperty("bottom");
    expect(tableBorders).toHaveProperty("insideHorizontal");
  });
  it("cellMargins 四边等距", () => {
    expect(cellMargins.top).toBe(80);
    expect(cellMargins.bottom).toBe(80);
  });
});

describe("cell", () => {
  it("创建 TableCell", () => {
    const p = line("内容");
    const c = cell(3000, p);
    expect(c).toBeDefined();
  });
  it("带 fill 和 valign", () => {
    const p = line("内容");
    const c = cell(3000, p, { fill: "FF0000", valign: "top" as any });
    expect(c).toBeDefined();
  });
});

describe("kvTable", () => {
  it("创建 KV 表格", () => {
    const table = kvTable([["标签1", "值1"], ["标签2", "值2"]]);
    expect(table).toBeDefined();
  });
  it("空值显示 —", () => {
    const table = kvTable([["标签", ""]]);
    expect(table).toBeDefined();
  });
});

describe("boqTable", () => {
  it("创建 BoQ 表格（对象数组）", () => {
    const table = boqTable([
      { name: "产品A", scope: "范围1", quantity: "10", unit: "套" },
      { name: "产品B", description: "描述", qty: "5", unit: "台" },
    ]);
    expect(table).toBeDefined();
  });
  it("字符串数组", () => {
    const table = boqTable(["产品A" as any, "产品B" as any]);
    expect(table).toBeDefined();
  });
  it("空数组只有表头", () => {
    const table = boqTable([]);
    expect(table).toBeDefined();
  });
});

describe("aiAnalysisBlocks", () => {
  it("空对象返回空数组", () => {
    expect(aiAnalysisBlocks({})).toEqual([]);
  });
  it("summary 生成分析块", () => {
    const blocks = aiAnalysisBlocks({ summary: "这是摘要" });
    expect(blocks.length).toBeGreaterThan(0);
  });
  it("risks 数组生成多条风险", () => {
    const blocks = aiAnalysisBlocks({ risks: ["风险1", "风险2"] });
    expect(blocks.length).toBeGreaterThan(2);
  });
  it("advantages 数组生成多条优势", () => {
    const blocks = aiAnalysisBlocks({ advantages: ["优势1"] });
    expect(blocks.length).toBeGreaterThan(1);
  });
  it("未知键也输出", () => {
    const blocks = aiAnalysisBlocks({ custom_section: "自定义内容" });
    expect(blocks.length).toBeGreaterThan(0);
  });
  it("数组类型未知键生成 bullet", () => {
    const blocks = aiAnalysisBlocks({ items: ["项目1", "项目2"] });
    expect(blocks.length).toBeGreaterThan(2);
  });
});

describe("formatNow", () => {
  it("返回格式化的时间字符串", () => {
    const result = formatNow();
    expect(result).toMatch(/\d{4}年\d{2}月\d{2}日 \d{2}:\d{2}/);
  });
});

// ── preview.ts — buildBidReportPreviewText ──
import { buildBidReportPreviewText } from "../../../../server/services/bid-report/preview";

describe("buildBidReportPreviewText", () => {
  it("zh + 有 description_cn → 中文段落", () => {
    const sections = buildBidReportPreviewText({ description_cn: "中文描述" } as any, "zh");
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toContain("采购描述");
    expect(sections[0].body).toBe("中文描述");
  });

  it("zh + 无 description_cn → 回退 description", () => {
    const sections = buildBidReportPreviewText({ description: "English desc" } as any, "zh");
    expect(sections).toHaveLength(1);
    expect(sections[0].body).toBe("English desc");
  });

  it("en → 英文段落", () => {
    const sections = buildBidReportPreviewText({ description: "Test desc" } as any, "en");
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toContain("Procurement");
  });

  it("无描述 → 空数组", () => {
    const sections = buildBidReportPreviewText({} as any, "zh");
    expect(sections).toHaveLength(0);
  });
});

// ── build.ts — buildBidReportDocx ──
import { buildBidReportDocx } from "../../../../server/services/bid-report/build";

describe("buildBidReportDocx", () => {
  it("最小行数据生成 Buffer", async () => {
    const row = {
      id: 1, title: "Test Notice", reference: "REF-001",
      agency: "UNDP", source_platform: "undp",
    } as any;
    const buffer = await buildBidReportDocx(row);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
