import { describe, it, expect } from "vitest";
import {
  CERT_REQUIREMENT_MAX,
  parseCertRequirements,
  serializeCertRequirements,
} from "@/shared/constants/procurement-cert-requirements";

describe("shared/constants/procurement-cert-requirements", () => {
  it("解析字典项：默认强制、非自填", () => {
    expect(parseCertRequirements([{ code: "ISO9001", name: "ISO9001 质量管理体系认证" }])).toEqual([
      { code: "ISO9001", name: "ISO9001 质量管理体系认证", custom: false, mandatory: true },
    ]);
  });

  it("加分项保留 mandatory=false", () => {
    expect(parseCertRequirements([{ code: "ISO14001", name: "ISO14001", mandatory: false }])[0].mandatory).toBe(false);
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

  it("丢弃空行；旧数据里的 note/requireValid 被忽略", () => {
    const parsed = parseCertRequirements([
      { code: "", name: "  " },
      { code: "CE", name: "CE", note: "旧备注", requireValid: true },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({ code: "CE", name: "CE", custom: false, mandatory: true });
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
