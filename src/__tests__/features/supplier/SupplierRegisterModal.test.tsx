import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SupplierRegisterModal } from "@/features/supplier/components/SupplierRegisterModal";
import { registerSupplier } from "@/features/supplier/api";

// t 返回 key，便于按 i18n key 断言文案
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

vi.mock("@/features/supplier/api", () => ({
  registerSupplier: vi.fn(),
}));

const mockedRegisterSupplier = vi.mocked(registerSupplier);

const fillRequiredFields = () => {
  // 表单 label 以 i18n key 渲染
  const inputs = screen.getAllByRole("textbox");
  // 依次为：nameZh、nameEn、ungmCode、contactPerson、mainProductsZh（email 为 type=email）
  fireEvent.change(inputs[0], { target: { value: "测试机械有限公司" } });
  fireEvent.change(inputs[3], { target: { value: "张三" } });
  fireEvent.change(screen.getByPlaceholderText("supplierRegEmailPlaceholder"), {
    target: { value: "zhang@example.com" },
  });
  fireEvent.change(inputs[4], { target: { value: "数控机床, 加工中心" } });
};

describe("SupplierRegisterModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRegisterSupplier.mockResolvedValue({ id: "s1" } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the registration form with title and labels", () => {
    render(<SupplierRegisterModal onClose={vi.fn()} />);
    expect(screen.getByText("supplierRegTitle")).toBeInTheDocument();
    expect(screen.getByText("supplierRegNameZhLabel")).toBeInTheDocument();
    expect(screen.getByText("supplierRegSubmitBtn")).toBeInTheDocument();
    // 行业下拉默认选中"机械"
    const selects = screen.getAllByRole("combobox");
    expect(selects[0]).toHaveValue("domestic");
    expect(selects[1]).toHaveValue("机械");
  });

  it("blocks submission and shows formError when required fields are empty", async () => {
    render(<SupplierRegisterModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("supplierRegSubmitBtn"));

    expect(await screen.findByText("formError")).toBeInTheDocument();
    expect(mockedRegisterSupplier).not.toHaveBeenCalled();
  });

  it("blocks submission when only part of required fields are filled", async () => {
    render(<SupplierRegisterModal onClose={vi.fn()} />);
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "只填公司名" } });
    fireEvent.click(screen.getByText("supplierRegSubmitBtn"));

    expect(await screen.findByText("formError")).toBeInTheDocument();
    expect(mockedRegisterSupplier).not.toHaveBeenCalled();
  });

  it("submits with hidden defaults and mirrors contactPerson to contactPhone", async () => {
    const onRegistered = vi.fn();
    render(<SupplierRegisterModal onClose={vi.fn()} onRegistered={onRegistered} />);
    fillRequiredFields();
    fireEvent.click(screen.getByText("supplierRegSubmitBtn"));

    await act(async () => {});
    expect(mockedRegisterSupplier).toHaveBeenCalledTimes(1);
    const payload = mockedRegisterSupplier.mock.calls[0][0];
    expect(payload.nameZh).toBe("测试机械有限公司");
    expect(payload.contactPerson).toBe("张三");
    expect(payload.contactPhone).toBe("张三");
    expect(payload.contactEmail).toBe("zhang@example.com");
    expect(payload.mainProductsZh).toBe("数控机床, 加工中心");
    // 隐藏默认值
    expect(payload.type).toBe("domestic");
    expect(payload.industryZh).toBe("机械");
    expect(payload.countryZh).toBe("中国");
    expect(payload.complianceLabelsZh).toBe("ISO9001, CE认证");
    expect(onRegistered).toHaveBeenCalled();
  });

  it("shows success state, dispatches crm-refresh and auto-closes after 3s", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const refreshListener = vi.fn();
    window.addEventListener("supply-os:crm-refresh", refreshListener);

    render(<SupplierRegisterModal onClose={onClose} />);
    fillRequiredFields();
    fireEvent.click(screen.getByText("supplierRegSubmitBtn"));
    // 冲刷 registerSupplier 的微任务链
    await act(async () => {});

    expect(screen.getByText("formSuccess")).toBeInTheDocument();
    expect(refreshListener).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    window.removeEventListener("supply-os:crm-refresh", refreshListener);
  });

  it("shows the server error message when registration fails", async () => {
    mockedRegisterSupplier.mockRejectedValue(new Error("名称已被注册"));
    render(<SupplierRegisterModal onClose={vi.fn()} />);
    fillRequiredFields();
    fireEvent.click(screen.getByText("supplierRegSubmitBtn"));

    expect(await screen.findByText("名称已被注册")).toBeInTheDocument();
    // 失败后仍停留在表单态
    expect(screen.getByText("supplierRegSubmitBtn")).toBeInTheDocument();
  });

  it("non-Error rejection falls back to formError", async () => {
    mockedRegisterSupplier.mockRejectedValue("plain string");
    render(<SupplierRegisterModal onClose={vi.fn()} />);
    fillRequiredFields();
    fireEvent.click(screen.getByText("supplierRegSubmitBtn"));

    expect(await screen.findByText("formError")).toBeInTheDocument();
  });

  it("cancel and close buttons trigger onClose", () => {
    const onClose = vi.fn();
    render(<SupplierRegisterModal onClose={onClose} />);
    fireEvent.click(screen.getByText("cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
