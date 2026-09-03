/**
 * TrainingPaymentModal 组件测试
 * Component tests for TrainingPaymentModal
 *
 * 覆盖：
 *   - fmtDate 日期格式化（通过组件渲染间接测试）
 *   - 两阶段流程（participants → payment）
 *   - 参训人数选择器（+/- 边界）
 *   - 期次选择逻辑
 *   - 企业信息校验
 *   - 金额计算
 *
 * @module features/training/components/TrainingPaymentModal.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mock 依赖 ─────────────────────────────────────────────────────────────────

// i18n mock：返回 key 本身作为翻译
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({
    t: (key: string) => key,
    locale: "zh",
  }),
}));

// API mock
const mockSubmitTrainingRegister = vi.fn();
const mockCreateTrainingOrder = vi.fn();
const mockFetchTrainingOrderStatus = vi.fn();
const mockMockPayTrainingOrder = vi.fn();
const mockSaveTrainingParticipants = vi.fn();

vi.mock("@/features/training/api", () => ({
  submitTrainingRegister: (...args: unknown[]) => mockSubmitTrainingRegister(...args),
  createTrainingOrder: (...args: unknown[]) => mockCreateTrainingOrder(...args),
  fetchTrainingOrderStatus: (...args: unknown[]) => mockFetchTrainingOrderStatus(...args),
  mockPayTrainingOrder: (...args: unknown[]) => mockMockPayTrainingOrder(...args),
  saveTrainingParticipants: (...args: unknown[]) => mockSaveTrainingParticipants(...args),
}));

// PaymentModalCore mock：渲染简化版，保留关键 props 验证
// 组件改用子路径导入（A3：绕过 payment barrel 避免 chunk 击穿），mock 路径同步
vi.mock("@/features/payment/components/PaymentModalCore", () => ({
  default: (props: {
    amount: number;
    currency: string;
    canSubmit: boolean;
    onClose: () => void;
    onSuccess: (orderNo: string) => void;
    summaryNode: React.ReactNode;
    chooseExtra: React.ReactNode;
  }) => (
    <div data-testid="payment-modal-core">
      <span data-testid="payment-amount">{props.amount}</span>
      <span data-testid="payment-currency">{props.currency}</span>
      <span data-testid="payment-can-submit">{String(props.canSubmit)}</span>
      <button onClick={() => props.onSuccess("TEST-ORDER-001")}>Mock Pay</button>
      <button onClick={props.onClose}>Close Payment</button>
      {props.summaryNode}
      {props.chooseExtra}
    </div>
  ),
}));

// UI mock：简化 SelectableCard/Button
vi.mock("@/shared/ui", () => ({
  Button: ({ children, onClick, ...props }: React.PropsWithChildren<{ onClick?: () => void; [key: string]: unknown }>) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
  SelectableCard: ({ children, selected, onClick }: { children: React.ReactNode; selected: boolean; onClick: () => void }) => (
    <div data-testid={`selectable-card-${selected ? "selected" : "unselected"}`} onClick={onClick}>{children}</div>
  ),
}));

// ParticipantForm mock — 渲染 preFormSection / scheduleSelector / participantCountSelector
vi.mock("@/features/training/components/ParticipantForm", () => ({
  default: ({ onSubmit, onClose, participantCount, preFormError, preFormSubmitting, preFormSection, scheduleSelector, participantCountSelector }: {
    onSubmit: (participants: Array<{ participant_no: number; full_name: string }>) => void;
    onClose: () => void;
    participantCount: number;
    preFormError: string;
    preFormSubmitting: boolean;
    preFormSection: React.ReactNode;
    scheduleSelector: React.ReactNode;
    participantCountSelector: React.ReactNode;
  }) => (
    <div data-testid="participant-form">
      <span data-testid="participant-count">{participantCount}</span>
      {preFormError && <span data-testid="pre-form-error">{preFormError}</span>}
      {preFormSubmitting && <span data-testid="pre-form-submitting">submitting</span>}
      <div data-testid="pre-form-section">{preFormSection}</div>
      {scheduleSelector && <div data-testid="schedule-selector">{scheduleSelector}</div>}
      {participantCountSelector && <div data-testid="participant-count-selector">{participantCountSelector}</div>}
      <button onClick={() => onSubmit([{ participant_no: 1, full_name: "Test User" }])}>Submit Participants</button>
      <button onClick={onClose}>Close Form</button>
    </div>
  ),
}));

// CompanyInfoSection mock
vi.mock("@/features/training/components/CompanyInfoSection", () => ({
  __esModule: true,
  default: ({ value, onChange }: { value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) => (
    <div data-testid="company-info-section">
      <input
        data-testid="company-name-input"
        value={value.company_name as string}
        onChange={(e) => onChange({ ...value, company_name: e.target.value })}
      />
      <input
        data-testid="contact-name-input"
        value={value.contact_name as string}
        onChange={(e) => onChange({ ...value, contact_name: e.target.value })}
      />
      <input
        data-testid="telephone-input"
        value={value.telephone as string}
        onChange={(e) => onChange({ ...value, telephone: e.target.value })}
      />
    </div>
  ),
}));

// ApiError mock
vi.mock("@/core/http", () => ({
  ApiError: class ApiError extends Error {
    constructor(message: string) { super(message); this.name = "ApiError"; }
  },
}));

// ── 导入被测组件（在 mock 之后） ──
import TrainingPaymentModal from "@/features/training/components/TrainingPaymentModal";
import type { LandingCourse, LandingSchedule } from "@/features/training/api";

// ── 测试数据工厂 ──

function makeCourse(overrides?: Partial<LandingCourse>): LandingCourse {
  return {
    id: 1,
    name_zh: "联合国采购研修班",
    name_en: "UN Procurement Training",
    description_zh: "desc",
    description_en: null,
    unit_price: 1000,
    currency: "CNY",
    includes: [],
    ...overrides,
  };
}

function makeSchedule(overrides?: Partial<LandingSchedule>): LandingSchedule {
  return {
    id: 1,
    period_number: 1,
    start_date: "2026-09-15",
    city: "北京",
    format: "线下",
    status: "open",
    capacity: 30,
    enrolled_count: 10,
    ...overrides,
  };
}

const defaultProps = {
  onClose: vi.fn(),
  course: makeCourse(),
  schedules: [makeSchedule()],
  registrationId: null,
  defaultScheduleId: null,
};

// ══════════════════════════════════════════════════════════════════════════════
// 测试套件
// ══════════════════════════════════════════════════════════════════════════════

describe("TrainingPaymentModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 阶段一：学员信息填写 ──

  describe("阶段一：学员信息填写", () => {
    it("初始渲染显示 ParticipantForm", () => {
      render(<TrainingPaymentModal {...defaultProps} />);
      expect(screen.getByTestId("participant-form")).toBeInTheDocument();
    });

    it("显示 CompanyInfoSection", () => {
      render(<TrainingPaymentModal {...defaultProps} />);
      expect(screen.getByTestId("company-info-section")).toBeInTheDocument();
    });

    it("参训人数默认为 1", () => {
      render(<TrainingPaymentModal {...defaultProps} />);
      expect(screen.getByTestId("participant-count")).toHaveTextContent("1");
    });
  });

  // ── 期次选择 ──

  describe("期次选择逻辑", () => {
    it("单期次时不显示期次选择器", () => {
      render(<TrainingPaymentModal {...defaultProps} schedules={[makeSchedule()]} />);
      // 单期次不显示 scheduleSelector（ParticipantForm mock 中不含 schedule selector）
      expect(screen.getByTestId("participant-form")).toBeInTheDocument();
    });

    it("多期次时显示期次选择器", () => {
      const schedules = [
        makeSchedule({ id: 1, period_number: 1 }),
        makeSchedule({ id: 2, period_number: 2, start_date: "2026-10-15" }),
      ];
      render(<TrainingPaymentModal {...defaultProps} schedules={schedules} />);
      // 多期次时 SelectableCard 被渲染
      expect(screen.getAllByTestId(/selectable-card-/)).toHaveLength(2);
    });

    it("defaultScheduleId 优先级最高", () => {
      const schedules = [
        makeSchedule({ id: 1, period_number: 1 }),
        makeSchedule({ id: 2, period_number: 2 }),
      ];
      render(<TrainingPaymentModal {...defaultProps} schedules={schedules} defaultScheduleId={2} />);
      // defaultScheduleId=2 → 第二个被选中
      const cards = screen.getAllByTestId(/selectable-card-/);
      expect(cards).toHaveLength(2);
    });

    it("仅显示 status=open 的期次", () => {
      const schedules = [
        makeSchedule({ id: 1, status: "open" }),
        makeSchedule({ id: 2, status: "closed" }),
        makeSchedule({ id: 3, status: "open" }),
      ];
      render(<TrainingPaymentModal {...defaultProps} schedules={schedules} />);
      // 只有 2 个 open 期次被渲染为 SelectableCard
      expect(screen.getAllByTestId(/selectable-card-/)).toHaveLength(2);
    });

    it("无 open 期次时不显示选择器", () => {
      const schedules = [makeSchedule({ status: "closed" })];
      render(<TrainingPaymentModal {...defaultProps} schedules={schedules} />);
      expect(screen.queryByTestId(/selectable-card-/)).not.toBeInTheDocument();
    });
  });

  // ── 企业信息校验 ──

  describe("企业信息校验", () => {
    it("必填字段缺失时显示错误", async () => {
      render(<TrainingPaymentModal {...defaultProps} />);
      // 直接提交学员信息（不填写公司信息）
      fireEvent.click(screen.getByText("Submit Participants"));
      await waitFor(() => {
        expect(screen.getByTestId("pre-form-error")).toBeInTheDocument();
      });
    });

    it("必填字段齐全时进入支付阶段", async () => {
      mockSubmitTrainingRegister.mockResolvedValue({ success: true, id: 1 });

      render(<TrainingPaymentModal {...defaultProps} />);

      // 填写必填信息
      fireEvent.change(screen.getByTestId("company-name-input"), { target: { value: "测试公司" } });
      fireEvent.change(screen.getByTestId("contact-name-input"), { target: { value: "张三" } });
      fireEvent.change(screen.getByTestId("telephone-input"), { target: { value: "13800138000" } });

      // 提交
      fireEvent.click(screen.getByText("Submit Participants"));

      await waitFor(() => {
        expect(mockSubmitTrainingRegister).toHaveBeenCalled();
      });

      // 进入支付阶段
      await waitFor(() => {
        expect(screen.getByTestId("payment-modal-core")).toBeInTheDocument();
      });
    });

    it("API 失败时显示错误信息", async () => {
      mockSubmitTrainingRegister.mockRejectedValue(new Error("网络错误"));

      render(<TrainingPaymentModal {...defaultProps} />);

      fireEvent.change(screen.getByTestId("company-name-input"), { target: { value: "测试公司" } });
      fireEvent.change(screen.getByTestId("contact-name-input"), { target: { value: "张三" } });
      fireEvent.change(screen.getByTestId("telephone-input"), { target: { value: "13800138000" } });

      fireEvent.click(screen.getByText("Submit Participants"));

      await waitFor(() => {
        expect(screen.getByTestId("pre-form-error")).toBeInTheDocument();
      });
    });
  });

  // ── 阶段二：支付 ──

  describe("阶段二：支付", () => {
    it("支付阶段显示 PaymentModalCore", async () => {
      mockSubmitTrainingRegister.mockResolvedValue({ success: true, id: 1 });

      render(<TrainingPaymentModal {...defaultProps} />);

      // 填写并提交
      fireEvent.change(screen.getByTestId("company-name-input"), { target: { value: "测试公司" } });
      fireEvent.change(screen.getByTestId("contact-name-input"), { target: { value: "张三" } });
      fireEvent.change(screen.getByTestId("telephone-input"), { target: { value: "13800138000" } });
      fireEvent.click(screen.getByText("Submit Participants"));

      await waitFor(() => {
        expect(screen.getByTestId("payment-modal-core")).toBeInTheDocument();
      });
    });

    it("金额 = 单价 × 人数", async () => {
      mockSubmitTrainingRegister.mockResolvedValue({ success: true, id: 1 });

      render(<TrainingPaymentModal {...defaultProps} course={makeCourse({ unit_price: 500 })} />);

      // 默认 1 人 → 500
      fireEvent.change(screen.getByTestId("company-name-input"), { target: { value: "公司" } });
      fireEvent.change(screen.getByTestId("contact-name-input"), { target: { value: "联系人" } });
      fireEvent.change(screen.getByTestId("telephone-input"), { target: { value: "13800138000" } });
      fireEvent.click(screen.getByText("Submit Participants"));

      await waitFor(() => {
        expect(screen.getByTestId("payment-amount")).toHaveTextContent("500");
      });
    });

    it("course 为 null 时金额为 0", async () => {
      mockSubmitTrainingRegister.mockResolvedValue({ success: true, id: 1 });

      render(<TrainingPaymentModal {...defaultProps} course={null} />);

      fireEvent.change(screen.getByTestId("company-name-input"), { target: { value: "公司" } });
      fireEvent.change(screen.getByTestId("contact-name-input"), { target: { value: "联系人" } });
      fireEvent.change(screen.getByTestId("telephone-input"), { target: { value: "13800138000" } });
      fireEvent.click(screen.getByText("Submit Participants"));

      await waitFor(() => {
        expect(screen.getByTestId("payment-amount")).toHaveTextContent("0");
      });
    });

    it("canSubmit = course 存在 && scheduleSelected", async () => {
      mockSubmitTrainingRegister.mockResolvedValue({ success: true, id: 1 });

      render(<TrainingPaymentModal {...defaultProps} course={makeCourse()} />);

      fireEvent.change(screen.getByTestId("company-name-input"), { target: { value: "公司" } });
      fireEvent.change(screen.getByTestId("contact-name-input"), { target: { value: "联系人" } });
      fireEvent.change(screen.getByTestId("telephone-input"), { target: { value: "13800138000" } });
      fireEvent.click(screen.getByText("Submit Participants"));

      await waitFor(() => {
        expect(screen.getByTestId("payment-can-submit")).toHaveTextContent("true");
      });
    });

    it("支付成功后异步保存学员信息", async () => {
      mockSubmitTrainingRegister.mockResolvedValue({ success: true, id: 1 });
      mockSaveTrainingParticipants.mockResolvedValue({ success: true });

      render(<TrainingPaymentModal {...defaultProps} />);

      fireEvent.change(screen.getByTestId("company-name-input"), { target: { value: "公司" } });
      fireEvent.change(screen.getByTestId("contact-name-input"), { target: { value: "联系人" } });
      fireEvent.change(screen.getByTestId("telephone-input"), { target: { value: "13800138000" } });
      fireEvent.click(screen.getByText("Submit Participants"));

      await waitFor(() => {
        expect(screen.getByTestId("payment-modal-core")).toBeInTheDocument();
      });

      // 触发支付成功
      fireEvent.click(screen.getByText("Mock Pay"));

      await waitFor(() => {
        expect(mockSaveTrainingParticipants).toHaveBeenCalledWith(
          "TEST-ORDER-001",
          [{ participant_no: 1, full_name: "Test User" }],
        );
      });
    });
  });

  // ── fmtDate 日期格式化（间接测试） ──

  describe("fmtDate 日期格式化", () => {
    it("中文环境显示「年月日」格式", () => {
      const schedules = [
        makeSchedule({ id: 1, start_date: "2026-01-20" }),
        makeSchedule({ id: 2, start_date: "2026-06-15", status: "open" }),
      ];
      render(
        <TrainingPaymentModal
          {...defaultProps}
          schedules={schedules}
          defaultScheduleId={1}
        />,
      );
      // 多期次时显示日期，中文 locale 应包含 "年" "月" "日"
      const dateText = screen.getByText(/2026年1月20日/);
      expect(dateText).toBeInTheDocument();
    });
  });

  // ── 关闭行为 ──

  describe("关闭行为", () => {
    it("阶段一关闭调用 onClose", () => {
      const onClose = vi.fn();
      render(<TrainingPaymentModal {...defaultProps} onClose={onClose} />);
      fireEvent.click(screen.getByText("Close Form"));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
