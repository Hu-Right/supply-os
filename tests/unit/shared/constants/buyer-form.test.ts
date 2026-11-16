import { describe, it, expect } from "vitest";
import { missingBuyerFields } from "@/shared/constants/buyer-form";

const base = {
  orgName: "云境示例采购有限公司",
  buyerRole: "end_buyer",
  country: "中国",
  regNo: "91330100MA00000000",
  officialEmail: "buyer@example.com",
  authContactName: "张三",
  hasLicense: true,
  hasAgentAuthDoc: false,
};

describe("shared/constants/buyer-form missingBuyerFields", () => {
  it("最终采购方：必填齐全 → 无缺失", () => {
    expect(missingBuyerFields(base)).toEqual([]);
  });

  it("空白字符串视为缺失", () => {
    expect(
      missingBuyerFields({ ...base, orgName: "  ", country: "", officialEmail: "\t" }),
    ).toEqual(["org_name", "country", "official_email"]);
  });

  it("未上传执照 → 缺 license", () => {
    expect(missingBuyerFields({ ...base, hasLicense: false })).toEqual(["license"]);
  });

  it("代理采购：未上传代理授权文件 → 缺 agent_auth_doc", () => {
    expect(
      missingBuyerFields({ ...base, buyerRole: "authorized_agent", hasAgentAuthDoc: false }),
    ).toEqual(["agent_auth_doc"]);
  });

  it("代理采购：已有代理授权文件 → 通过", () => {
    expect(
      missingBuyerFields({ ...base, buyerRole: "authorized_agent", hasAgentAuthDoc: true }),
    ).toEqual([]);
  });

  it("最终采购方不要求代理授权文件", () => {
    expect(missingBuyerFields({ ...base, buyerRole: "end_buyer" })).toEqual([]);
  });

  it("缺失项按表单顺序返回", () => {
    expect(
      missingBuyerFields({
        orgName: "",
        buyerRole: "",
        country: "",
        regNo: "",
        officialEmail: "",
        authContactName: "",
        hasLicense: false,
        hasAgentAuthDoc: false,
      }),
    ).toEqual([
      "org_name",
      "buyer_role",
      "country",
      "reg_no",
      "official_email",
      "auth_contact_name",
      "license",
    ]);
  });
});
