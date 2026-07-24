import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningPage from "@/features/learning/pages/LearningPage";

// ── Mock data ──
vi.mock("@/data", () => ({
  TRAINING_DOWNLOAD_MATERIALS: [
    {
      id: "mat1",
      titleZh: "测试材料",
      titleEn: "Test Material",
      categoryZh: "分类",
      categoryEn: "Category",
      summaryZh: "摘要",
      summaryEn: "Summary",
      contentZh: "内容",
      contentEn: "Content",
      fileUrl: "/test.pdf",
      fileName: "test.pdf",
      downloadsCount: 100,
      isPremium: false,
    },
    {
      id: "mat2",
      titleZh: "VIP材料",
      titleEn: "VIP Material",
      categoryZh: "分类",
      categoryEn: "Category",
      summaryZh: "摘要",
      summaryEn: "Summary",
      contentZh: "内容",
      contentEn: "Content",
      fileUrl: "/vip.pdf",
      fileName: "vip.pdf",
      downloadsCount: 50,
      isPremium: true,
    },
  ],
  FAQS: [
    {
      id: "faq1",
      category: "general",
      questionZh: "什么是采购平台？",
      questionEn: "What is procurement platform?",
      answerZh: "这是一个采购平台",
      answerEn: "It is a procurement platform",
    },
  ],
}));

// ── Mock useLocale ──
vi.mock("@/core/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "zh" }),
  pickLocale: (_locale: string, zh: string, en: string) => zh,
}));

// ── Mock useAuth ──
const mockAuth = {
  authUser: { user_key: "u1", email: "test@test.com" } as any,
  isVip: false,
};
vi.mock("@/core/auth", () => ({
  useAuth: () => mockAuth,
}));

describe("LearningPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.authUser = { user_key: "u1", email: "test@test.com" } as any;
    mockAuth.isVip = false;
  });

  it("renders materials and FAQ", async () => {
    render(<LearningPage />);
    await waitFor(() => {
      expect(screen.getByText("测试材料")).toBeInTheDocument();
      expect(screen.getByText("VIP材料")).toBeInTheDocument();
    });
  });

  it("handleDownload creates anchor and triggers download", async () => {
    const createElementSpy = vi.spyOn(document, "createElement");
    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    const removeChildSpy = vi.spyOn(document.body, "removeChild");

    render(<LearningPage />);
    await waitFor(() => {
      expect(screen.getByText("测试材料")).toBeInTheDocument();
    });

    const downloadBtn = screen.getByText("downloadBtn");
    fireEvent.click(downloadBtn);

    // Verify anchor was created and clicked
    expect(createElementSpy).toHaveBeenCalledWith("a");
    expect(appendChildSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it("handleUpgradeClick dispatches require-login for unauthenticated user", async () => {
    mockAuth.authUser = null as any;
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<LearningPage />);
    await waitFor(() => {
      expect(screen.getByText("测试材料")).toBeInTheDocument();
    });

    // Click upgrade button on a premium material
    const upgradeBtn = screen.getByText("upgradeToVip");
    fireEvent.click(upgradeBtn);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "supply-os:require-login" })
    );
    dispatchSpy.mockRestore();
  });

  it("handleUpgradeClick dispatches pay event for authenticated user", async () => {
    mockAuth.isVip = false;
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<LearningPage />);
    await waitFor(() => {
      expect(screen.getByText("测试材料")).toBeInTheDocument();
    });

    const upgradeBtn = screen.getByText("upgradeToVip");
    fireEvent.click(upgradeBtn);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "supply-os:pay" })
    );
    dispatchSpy.mockRestore();
  });
});
