import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { registerSupplier, fetchSuppliers, fetchSupplierContact } from "@/features/supplier/api";
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

  it("fetchSuppliers requests the DB list with the lang query", async () => {
    let receivedUrl = "";
    server.use(
      http.get("/api/suppliers", ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json([{ id: "sup-db-72", nameZh: "深圳安博深科技有限公司" }]);
      })
    );

    const list = await fetchSuppliers("fr");
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("sup-db-72");
    expect(receivedUrl).toContain("lang=fr");
  });

  it("fetchSuppliers throws on non-ok response", async () => {
    server.use(
      http.get("/api/suppliers", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 })
      )
    );

    await expect(fetchSuppliers("zh")).rejects.toThrow();
  });

  it("fetchSupplierContact returns plaintext contact with user_key", async () => {
    let receivedUrl = "";
    server.use(
      http.get("/api/suppliers/:id/contact", ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({
          contactPerson: "张三",
          contactPhone: "13800001686",
          contactEmail: "zhangsan@real.com",
        });
      })
    );

    const contact = await fetchSupplierContact("sup-db-72", "vip@test.com");
    expect(contact.contactPhone).toBe("13800001686");
    expect(receivedUrl).toContain("/api/suppliers/sup-db-72/contact");
    expect(receivedUrl).toContain("user_key=vip%40test.com");
  });

  it("fetchSupplierContact throws VIP_REQUIRED on 403", async () => {
    server.use(
      http.get("/api/suppliers/:id/contact", () =>
        HttpResponse.json({ error: "VIP_REQUIRED" }, { status: 403 })
      )
    );

    await expect(fetchSupplierContact("sup-db-72", "free@test.com")).rejects.toThrow(
      "VIP_REQUIRED"
    );
  });
});
