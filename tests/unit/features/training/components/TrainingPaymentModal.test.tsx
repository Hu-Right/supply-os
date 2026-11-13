/**
 * TrainingPaymentModal 组件测试 — 收敛后的两阶段流程
 *
 * 覆盖：
 *   - 阶段一：企业信息 + 学员名单一次收集
 *   - 提交时把**全部学员**交给报名接口（一次写 N 行），并带着返回的 ids 进入支付
 *   - 阶段二：下单回传 registration_ids（不再传人数）
 *   - 支付成功不再补写学员（旧的 fire-and-forget 已删除）
 *
 * @module features/training/components/TrainingPaymentModal.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mock 依赖 ─────────────────────────────────────────────────────────────────

vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
}));

const mockSubmitTrainingRegister = vi.fn();
const mockCreateTrainingOrder = vi.fn();
const mockFetchTrainingOrderStatus = vi.fn();
const mockMockPayTrainingOrder = vi.fn();

vi.mock("@/features/training/api", () => ({
  submitTrainingRegister: (...args: unknown[]) => mockSubmitTrainingRegister(...args),
  createTrainingOrder: (...args: unknown[]) => mockCreateTrainingOrder(...args),
  fetchTrainingOrderStatus: (...args: unknown[]) => mockFetchTrainingOrderStatus(...args),
  mockPayTrainingOrder: (...args: unknown[]) => mockMockPayTrainingOrder(...args),
}));

vi.mock("@/shared/components/PaymentModalCore", () => ({
  default: (props: {
    amount: number;
    currency: string;
    canSubmit: boolean;
    onClose: () => void;
    onCreateOrder: (provider: "alipay" | "wechat") => Promise<unknown>;
    onSuccess: (orderNo: string) => void;
    summaryNode: React.ReactNode;
    chooseExtra: React.ReactNode;
  }) => (
    <div data-testid="payment-modal-core">
      <span data-testid="payment-amount">{props.amount}</span>
      <span data-testid="payment-currency">{props.currency}</span>
      <span data-testid="payment-can-submit">{String(props.canSubmit)}</span>
      <button onClick={() => { void props.onCreateOrder("alipay").catch(() => {}); }}>Create Order</button>
      <button onClick={() => props.onSuccess("TEST-ORDER-001")}>Mock Pay</button>
      <button onClick={props.onClose}>Close Payment</button>
      {props.summaryNode}
      {props.chooseExtra}
    </div>
  ),
}));

vi.mock("@/shared/ui", () => ({
  Button: ({ children, onClick, ...props }: React.PropsWithChildren<{ onClick?: () => void; [key: string]: unknown }>) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
  SelectableCard: ({ children, selected, onClick }: { children: React.ReactNode; selected: boolean; onClick: () => void }) => (
    <div data-testid={`selectable-card-${selected ? "selected" : "unselected"}`} onClick={onClick}>{children}</div>
  ),
}));

// ParticipantForm mock：提交两位学员，验证“一次写全”
vi.mock("@/features/training/components/ParticipantForm", () => ({
  default: ({ onSubmit, onClose, participantCount, preFormError, preFormSubmitting, preFormSection, scheduleSelector, participantCountSelector }: {
    onSubmit: (participants: Array<{ participant_no: number; full_name: string; phone: string | null }>) => void;
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
      <button
        onClick={() => onSubmit([
          { participant_no: 1, full_name: "张三", phone: "13800000001" },
          { participant_no: 2, full_name: "李四", phone: "13800000002" },
        ])}
      >
        Submit Participants
      </button>
      <button onClick={onClose}>Close Form</button>
    </div>
  ),
}));

vi.mock("@/features/training/components/CompanyInfoSection", () => ({
  __esModule: true,
  default: ({ value, onChange }: { value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) => (
    <div data-testid="company-info-section">
      <input
        data-testid="company-name-input"
        value={value.company_name as string}
        onChange={(e) => onChange({ ...value, company_name: e.target.value })}
      />
    </div>
  ),
}));

vi.mock("@/core/http", () => ({
  ApiError: class ApiError extends Error {
    constructor(message: string) { super(message); this.name = "ApiError"; }
  },
}));

import TrainingPaymentModal from "@/features/training/components/TrainingPaymentModal";
import type { LandingCourse, LandingSchedule } from "@/features/training/api";

function makeCourse(overrides?: Partial<LandingCourse>): LandingCourse {
  return {
    id: 1, nameZh: "联合国采购研修班", nameEn: "UN Procurement Training",
    descriptionZh: "desc", descriptionEn: null, unitPrice: 1000, currency: "CNY", includes: [],
    ...overrides,
  };
}

function makeSchedule(overrides?: Partial<LandingSchedule>): LandingSchedule {
  return {
    id: 1, periodNumber: 1, startDate: "2026-09-15", city: "北京",
    format: "线下", status: "open", capacity: 30, enrolledCount: 10,
    ...overrides,
  };
}

const defaultProps = {
  onClose: vi.fn(),
  course: makeCourse(),
  schedules: [makeSchedule()],
  defaultScheduleId: null,
};

/** 填公司名并提交 → 进入支付阶段 */
async function enterPaymentPhase() {
  fireEvent.change(screen.getByTestId("company-name-input"), { target: { value: "测试公司" } });
  fireEvent.click(screen.getByText("Submit Participants"));
  await waitFor(() => expect(screen.getByTestId("payment-modal-core")).toBeInTheDocument());
}

describe("TrainingPaymentModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmitTrainingRegister.mockResolvedValue({ success: true, id: 101, ids: [101, 102], count: 2 });
  });

  describe("阶段一：报名信息", () => {
    it("初始渲染显示 ParticipantForm 与 CompanyInfoSection", () => {
      render(<TrainingPaymentModal {...defaultProps} />);
      expect(screen.getByTestId("participant-form")).toBeInTheDocument();
      expect(screen.getByTestId("company-info-section")).toBeInTheDocument();
    });

    it("参训人数默认为 1", () => {
      render(<TrainingPaymentModal {...defaultProps} />);
      expect(screen.getByTestId("participant-count")).toHaveTextContent("1");
    });

    it("企业名称缺失时拦截，不调用报名接口", async () => {
      render(<TrainingPaymentModal {...defaultProps} />);
      fireEvent.click(screen.getByText("Submit Participants"));
      await waitFor(() => expect(screen.getByTestId("pre-form-error")).toBeInTheDocument());
      expect(mockSubmitTrainingRegister).not.toHaveBeenCalled();
    });

    it("提交时把全部学员一次交给报名接口（不再只交第一位）", async () => {
      render(<TrainingPaymentModal {...defaultProps} />);
      await enterPaymentPhase();

      expect(mockSubmitTrainingRegister).toHaveBeenCalledWith(expect.objectContaining({
        company_name: "测试公司",
        schedule_id: 1,
        participants: [
          { participant_no: 1, full_name: "张三", phone: "13800000001" },
          { participant_no: 2, full_name: "李四", phone: "13800000002" },
        ],
      }));
    });

    it("报名接口失败时留在阶段一并显示错误", async () => {
      mockSubmitTrainingRegister.mockRejectedValue(new Error("网络错误"));
      render(<TrainingPaymentModal {...defaultProps} />);

      fireEvent.change(screen.getByTestId("company-name-input"), { target: { value: "测试公司" } });
      fireEvent.click(screen.getByText("Submit Participants"));

      await waitFor(() => expect(screen.getByTestId("pre-form-error")).toBeInTheDocument());
      expect(screen.queryByTestId("payment-modal-core")).not.toBeInTheDocument();
    });
  });

  describe("阶段二：支付", () => {
    it("金额 = 单价 × 人数", async () => {
      render(<TrainingPaymentModal {...defaultProps} course={makeCourse({ unitPrice: 500 })} />);
      await enterPaymentPhase();
      expect(screen.getByTestId("payment-amount")).toHaveTextContent("500");
    });

    it("下单回传 registration_ids，不再传人数", async () => {
      mockCreateTrainingOrder.mockResolvedValue({
        success: true, orderNo: "TR1", provider: "alipay", amount: 1000,
        currency: "CNY", qrCodeUrl: null, payUrl: null, status: "pending", expiresAt: "2026-11-13T00:00:00Z",
      });
      render(<TrainingPaymentModal {...defaultProps} />);
      await enterPaymentPhase();

      fireEvent.click(screen.getByText("Create Order"));

      await waitFor(() => expect(mockCreateTrainingOrder).toHaveBeenCalledWith({
        course_id: 1,
        schedule_id: 1,
        registration_ids: [101, 102],
        provider: "alipay",
      }));
    });

    it("支付成功不再补写学员（名单在报名阶段已落库）", async () => {
      render(<TrainingPaymentModal {...defaultProps} />);
      await enterPaymentPhase();

      fireEvent.click(screen.getByText("Mock Pay"));
      // 旧实现会在这里调 saveTrainingParticipants；该函数已从 api 模块删除，
      // 若组件仍尝试调用，上面的 mock 工厂会因找不到导出而直接失败。
      await waitFor(() => expect(screen.getByTestId("payment-modal-core")).toBeInTheDocument());
    });

    it("canSubmit 需要已拿到报名 ids", async () => {
      render(<TrainingPaymentModal {...defaultProps} />);
      await enterPaymentPhase();
      expect(screen.getByTestId("payment-can-submit")).toHaveTextContent("true");
    });
  });

  describe("关闭行为", () => {
    it("阶段一关闭调用 onClose", () => {
      const onClose = vi.fn();
      render(<TrainingPaymentModal {...defaultProps} onClose={onClose} />);
      fireEvent.click(screen.getByText("Close Form"));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
