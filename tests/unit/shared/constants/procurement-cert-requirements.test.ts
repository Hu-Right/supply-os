import { describe, it, expect } from "vitest";
import {
  CERT_REQUIREMENT_MAX,
  parseCertRequirements,
  serializeCertRequirements,
} from "@/shared/constants/procurement-cert-requirements";

describe("shared/constants/procurement-cert-requirements", () => {
  it("解析字典项：默认强制、有效锚点、非自填", () => {
    expect(
      parseCertRequirements([
        { code: "ISO9001", name: "ISO9001 质量管理体系认证", mandatory: false, requireValid: true, note: "现行有效" },
      ]),
    ).toEqual([
      {
        code: "ISO9001",
        name: "ISO9001 质量管理体系认证",
        custom: false,
        mandatory: false,
        note: "现行有效",
        requireValid: true,
      },
    ]);
  });

  it("无 code 视为自输入", () => {
    const [item] = parseCertRequirements([{ name: "某国本地认证" }]);
    expect(item.custom).toBe(true);
    expect(item.mandatory).toBe(true);
  });

  it("兼容 JSON 字符串；非法 JSON 返回空数组", () => {
    expect(parseCertRequirements('[{"code":"CE","name":"CE"}]')).toHaveLength(1);
    expect(parseCertRequirements("{bad json")).toEqual([]);
    expect(parseCertRequirements(null)).toEqual([]);
  });

  it("丢弃空行；note 超长截断", () => {
    const parsed = parseCertRequirements([
      { code: "", name: "  " },
      { code: "CE", name: "CE", note: "x".repeat(500) },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].note.length).toBe(200);
  });

  it("最多保留 20 条", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ code: `C${i}`, name: `C${i}` }));
    expect(parseCertRequirements(many)).toHaveLength(CERT_REQUIREMENT_MAX);
  });

  it("序列化空列表为 null，非空为 JSON", () => {
    expect(serializeCertRequirements([])).toBeNull();
    expect(serializeCertRequirements([{ code: "CE", name: "CE" }])).toContain('"code":"CE"');
  });
});
