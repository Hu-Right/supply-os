/**
 * src/features/showroom/api.ts 测试
 * 覆盖 submitShowroomRegister
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiMock = vi.fn();
vi.mock("@/core/http", () => ({
  api: (...args: any[]) => apiMock(...args),
}));

import { submitShowroomRegister } from "@/features/showroom/api";

describe("submitShowroomRegister", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it("POST /api/leads + type=exhibition_register", async () => {
    apiMock.mockResolvedValue({ id: 1 });
    const formData = {
      companyName: "测试公司",
      country: "China",
      city: "北京",
      contactPerson: "张三",
      contactMethod: "13800000000",
      email: "test@example.com",
      industry: "制造业",
      mainProducts: "机械零件",
      hasIntlProcurement: true,
      notes: "测试备注",
    };
    await submitShowroomRegister(formData);
    expect(apiMock).toHaveBeenCalledWith("/api/leads", expect.objectContaining({
      method: "POST",
    }));
    const body = apiMock.mock.calls[0][1].body;
    expect(body.type).toBe("exhibition_register");
    expect(body.companyName).toBe("测试公司");
  });
});
