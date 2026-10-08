import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// t() 实现可切换：默认返回键名，个别用例让它回空串，用来钉住表单里成片的
// `t(key) || 中文兜底` 分支（服务端 bundle 缺键时的真实行为）。
const { tState } = vi.hoisted(() => ({ tState: { impl: (key: string) => key } }));
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => tState.impl(key), locale: "zh" }),
}));

import { EnterpriseEditForm } from "@/features/auth/components/EnterpriseEditForm";

// AuthLicenseImage 会拉取执照图（jsdom 无 fetch/createObjectURL）：桩为永不 resolve，
// 使其确定性地停在 loading，避免测试结束后异步 setState 触发 act 告警。
const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("EnterpriseEditForm", () => {
  it("渲染分组编辑表格与保存/取消按钮", () => {
    render(<EnterpriseEditForm initial={null} saving={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("settingsBasicInfo")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseGroupContact")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseGroupBusiness")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseSave")).toBeInTheDocument();
    expect(screen.getByText("authEnterpriseCancel")).toBeInTheDocument();
  });

  it("已绑定初始值回填到输入框", () => {
    render(
      <EnterpriseEditForm
        initial={{ company: "宝通集团", contact: "卢慧慧" } as never}
        saving={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const values = inputs.map((i) => i.value);
    expect(values).toContain("宝通集团");
    expect(values).toContain("卢慧慧");
  });

  it("填齐必填后点击保存回调 onSubmit", () => {
    const onSubmit = vi.fn();
    render(
      <EnterpriseEditForm
        initial={{
          company: "X", credit_code: "91330000MA1234567X", legal_rep: "张三",
          province: "浙江省", city: "杭州市", address: "某路1号",
          contact: "Y", phone: "123", industry: "IT", products: "P", type: "factory",
        } as never}
        saving={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        licenseUrl="/uploads/license/test.jpg"
      />,
    );
    fireEvent.click(screen.getByText("authEnterpriseSave"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as Record<string, string>;
    expect(payload).toHaveProperty("company");
    expect(payload).toHaveProperty("province", "浙江省");
    expect(payload).toHaveProperty("type", "factory");
    // 国家/国家代码不提交
    expect(payload).not.toHaveProperty("country");
    expect(payload).not.toHaveProperty("country_code");
  });

  it("点击取消回调 onCancel", () => {
    const onCancel = vi.fn();
    render(<EnterpriseEditForm initial={null} saving={false} onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("authEnterpriseCancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("必填缺失时阻断提交并红字点名", () => {
    const onSubmit = vi.fn();
    render(<EnterpriseEditForm initial={null} saving={false} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("authEnterpriseSave"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/authEnterpriseRequiredMissing/)).toBeInTheDocument();
  });

  it("t() 缺键时分组标题与字段标签回落中文兜底；带上已有行回填也不报错", () => {
    tState.impl = () => "";
    try {
      render(
        <EnterpriseEditForm
          initial={{ company: "宝通集团", country_code: "US", province: "" } as never}
          saving={false}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          licenseUrl="/uploads/license/x.jpg"
        />,
      );
      expect(screen.getByText("基本信息")).toBeInTheDocument();
      expect(screen.getByText("联系信息")).toBeInTheDocument();
      // 回填值落在 input.value 里（不是文本节点），按值断言
      const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
      expect(inputs.map((i) => i.value)).toContain("宝通集团");
    } finally {
      tState.impl = (key: string) => key;
    }
  });
});
