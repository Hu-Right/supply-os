import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { registerSupplier, fetchCustomSuppliers } from "@/features/supplier/api";
import { server } from "@/__tests__/mocks/server";

describe("Supplier API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registerSupplier posts a normalized body (comma split + ungmCode field)", async () => {
    let received: any = null;
    server.use(
      http.post("/api/suppliers", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ id: 99, status: "pending" });
      })
    );

    const result = await registerSupplier({
      nameZh: "  测试供应商  ",
      nameEn: "",
      type: "international",
      industryZh: "机械",
      countryZh: "中国",
      cityZh: "上海",
      ungmCode: " 12345678 ",
      mainProductsZh: "泵, 阀门，管件",
      complianceLabelsZh: "ISO9001，CE",
      contactPerson: "张三",
      contactEmail: "zhang@test.com",
      contactPhone: "13800000000",
    });

    expect(result).toEqual({ id: 99, status: "pending" });
    // 名称去空格；英文名缺省由中文兜底
    expect(received.nameZh).toBe("测试供应商");
    expect(received.nameEn).toBe("测试供应商");
    // 编码字段名严格为 ungmCode，且已去空格
    expect(received.ungmCode).toBe("12345678");
    // 逗号（中/英文）切分为数组
    expect(received.mainProductsZh).toEqual(["泵", "阀门", "管件"]);
    expect(received.complianceLabelsZh).toEqual(["ISO9001", "CE"]);
    // 数组字段中英同源
    expect(received.mainProductsEn).toEqual(["泵", "阀门", "管件"]);
    expect(received.complianceLabelsEn).toEqual(["ISO9001", "CE"]);
  });

  it("registerSupplier throws with server error message on failure", async () => {
    server.use(
      http.post("/api/suppliers", () =>
        HttpResponse.json({ error: "必填字段缺失" }, { status: 400 })
      )
    );

    await expect(
      registerSupplier({
        nameZh: "X",
        nameEn: "",
        type: "domestic",
        industryZh: "",
        countryZh: "",
        cityZh: "",
        ungmCode: "",
        mainProductsZh: "",
        complianceLabelsZh: "",
        contactPerson: "a",
        contactEmail: "a@b.com",
        contactPhone: "",
      })
    ).rejects.toThrow("必填字段缺失");
  });

  it("fetchCustomSuppliers returns the supplier list", async () => {
    server.use(
      http.get("/api/suppliers/custom", () =>
        HttpResponse.json([{ id: 1, nameZh: "自定义 A" }])
      )
    );

    const list = await fetchCustomSuppliers();
    expect(list).toHaveLength(1);
    expect(list[0].nameZh).toBe("自定义 A");
  });

  it("fetchCustomSuppliers throws on non-ok response", async () => {
    server.use(
      http.get("/api/suppliers/custom", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 })
      )
    );

    await expect(fetchCustomSuppliers()).rejects.toThrow();
  });
});
