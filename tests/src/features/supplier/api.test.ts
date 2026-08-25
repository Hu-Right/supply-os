/**
 * src/features/supplier/api.ts 测试
 * 覆盖 registerSupplier, fetchSuppliers, fetchSuppliersPaginated, fetchSupplierContact
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiMock = vi.fn();
vi.mock("@/core/http", () => ({
  api: (...args: any[]) => apiMock(...args),
}));

import {
  registerSupplier,
  fetchSuppliers,
  fetchSuppliersPaginated,
  fetchSupplierContact,
} from "@/features/supplier/api";

const baseInput = {
  nameZh: "测试公司",
  nameEn: "Test Co",
  type: "domestic" as const,
  industryZh: "制造业",
  countryZh: "中国",
  cityZh: "上海",
  ungmCode: "UNG-001",
  mainProductsZh: "产品A, 产品B，产品C",
  complianceLabelsZh: "ISO9001, CE",
  contactPerson: "张三",
  contactEmail: "test@example.com",
  contactPhone: "13800000000",
};

describe("registerSupplier", () => {
  beforeEach(() => apiMock.mockReset());

  it("POST /api/suppliers + 逗号分隔拆分为数组", async () => {
    apiMock.mockResolvedValue({ id: 1 });
    await registerSupplier(baseInput);
    expect(apiMock).toHaveBeenCalledWith("/api/suppliers", expect.objectContaining({
      method: "POST",
    }));
    const body = apiMock.mock.calls[0][1].body;
    expect(body.mainProductsZh).toEqual(["产品A", "产品B", "产品C"]);
    expect(body.complianceLabelsZh).toEqual(["ISO9001", "CE"]);
    expect(body.nameZh).toBe("测试公司");
    expect(body.nameEn).toBe("Test Co");
  });

  it("nameEn 为空 → 用 nameZh 兜底", async () => {
    apiMock.mockResolvedValue({ id: 1 });
    await registerSupplier({ ...baseInput, nameEn: "" });
    const body = apiMock.mock.calls[0][1].body;
    expect(body.nameEn).toBe("测试公司");
  });

  it("ungmCode 为空 → undefined", async () => {
    apiMock.mockResolvedValue({ id: 1 });
    await registerSupplier({ ...baseInput, ungmCode: "" });
    const body = apiMock.mock.calls[0][1].body;
    expect(body.ungmCode).toBeUndefined();
  });
});

describe("fetchSuppliers", () => {
  beforeEach(() => apiMock.mockReset());

  it("GET /api/suppliers?lang=xxx", async () => {
    apiMock.mockResolvedValue([]);
    await fetchSuppliers("zh");
    expect(apiMock).toHaveBeenCalledWith("/api/suppliers?lang=zh");
  });

  it("语言编码安全（encodeURIComponent）", async () => {
    apiMock.mockResolvedValue([]);
    await fetchSuppliers("zh-CN");
    expect(apiMock).toHaveBeenCalledWith("/api/suppliers?lang=zh-CN");
  });
});

describe("fetchSuppliersPaginated", () => {
  beforeEach(() => apiMock.mockReset());

  it("含分页 + 筛选参数", async () => {
    apiMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    await fetchSuppliersPaginated("en", { page: 2, pageSize: 10, q: "water", type: "international" });
    const url = apiMock.mock.calls[0][0];
    expect(url).toContain("lang=en");
    expect(url).toContain("page=2");
    expect(url).toContain("pageSize=10");
    expect(url).toContain("q=water");
    expect(url).toContain("type=international");
  });

  it("无可选参数 → 仅 lang + page", async () => {
    apiMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    await fetchSuppliersPaginated("zh", { page: 1 });
    const url = apiMock.mock.calls[0][0];
    expect(url).toContain("lang=zh");
    expect(url).toContain("page=1");
    expect(url).not.toContain("pageSize");
    expect(url).not.toContain("q=");
  });
});

describe("fetchSupplierContact", () => {
  beforeEach(() => apiMock.mockReset());

  it("GET /api/suppliers/:id/contact?user_key=xxx", async () => {
    apiMock.mockResolvedValue({ contactPerson: "张三" });
    await fetchSupplierContact("42", "user@test.com");
    expect(apiMock).toHaveBeenCalledWith(
      "/api/suppliers/42/contact?user_key=user%40test.com"
    );
  });
});
