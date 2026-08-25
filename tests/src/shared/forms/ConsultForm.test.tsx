/**
 * shared/forms/ConsultForm 组件测试
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsultForm } from "@/shared/forms/ConsultForm";
import { api } from "@/core/http";

const mockApi = vi.mocked(api);

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("ConsultForm", () => {
  const onClose = vi.fn();

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("渲染表单标题和输入字段", () => {
    render(<ConsultForm onClose={onClose} />);
    expect(screen.getByText("consultTitle")).toBeInTheDocument();
    expect(screen.getByText("formConsultCompany")).toBeInTheDocument();
    expect(screen.getByText("consultFormContactName")).toBeInTheDocument();
    expect(screen.getByText("consultFormPhone")).toBeInTheDocument();
    expect(screen.getByText("formConsultNeeds")).toBeInTheDocument();
  });

  it("渲染提交和取消按钮", () => {
    render(<ConsultForm onClose={onClose} />);
    expect(screen.getByText("consultSubmitBtn")).toBeInTheDocument();
    expect(screen.getByText("cancel")).toBeInTheDocument();
  });

  it("输入字段可编辑", async () => {
    const user = userEvent.setup();
    render(<ConsultForm onClose={onClose} />);
    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "测试公司");
    expect(inputs[0]).toHaveValue("测试公司");
  });

  it("提交成功后显示成功页", async () => {
    mockApi.mockResolvedValueOnce({ success: true });
    const user = userEvent.setup();
    render(<ConsultForm onClose={onClose} />);

    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "公司名");
    await user.type(inputs[1], "联系人");
    await user.type(inputs[2], "13800000000");
    await user.click(screen.getByText("consultSubmitBtn"));

    await waitFor(() => {
      expect(screen.getByText("consultBookedTitle")).toBeInTheDocument();
    });
  });

  it("提交成功后 2.2 秒自动关闭", async () => {
    vi.useFakeTimers();
    mockApi.mockResolvedValueOnce({ success: true });
    render(<ConsultForm onClose={onClose} />);

    // 直接通过 DOM 操作填写表单并点击提交
    const inputs = screen.getAllByRole("textbox");
    // 使用 fireEvent 代替 userEvent 以兼容假定时器
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(inputs[0], { target: { value: "公司名" } });
    fireEvent.change(inputs[1], { target: { value: "联系人" } });
    fireEvent.change(inputs[2], { target: { value: "13800000000" } });
    fireEvent.click(screen.getByText("consultSubmitBtn"));

    // 推进微任务队列让 Promise resolve
    await act(async () => { vi.advanceTimersByTime(0); });

    // 确认成功页出现
    expect(screen.getByText("consultBookedTitle")).toBeInTheDocument();

    // 快进 2.2 秒触发 setTimeout(onClose, 2200)
    act(() => { vi.advanceTimersByTime(2200); });
    expect(onClose).toHaveBeenCalled();
  });

  it("提交失败时不显示成功页", async () => {
    mockApi.mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<ConsultForm onClose={onClose} />);

    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "公司名");
    await user.type(inputs[1], "联系人");
    await user.type(inputs[2], "13800000000");
    await user.click(screen.getByText("consultSubmitBtn"));

    await waitFor(() => {
      expect(screen.queryByText("consultBookedTitle")).not.toBeInTheDocument();
    });
  });

  it("取消按钮触发 onClose", async () => {
    const user = userEvent.setup();
    render(<ConsultForm onClose={onClose} />);
    await user.click(screen.getByText("cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("调用 api 发送 POST 请求", async () => {
    mockApi.mockResolvedValueOnce({ success: true });
    const user = userEvent.setup();
    render(<ConsultForm onClose={onClose} />);

    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "ACME");
    await user.type(inputs[1], "张三");
    await user.type(inputs[2], "13800000000");
    await user.click(screen.getByText("consultSubmitBtn"));

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        "/api/leads",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
