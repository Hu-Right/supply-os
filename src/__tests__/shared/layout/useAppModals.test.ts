import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppModals } from "@/shared/layout/useAppModals";

describe("useAppModals", () => {
  describe("initial state", () => {
    it("all modals are closed initially", () => {
      const { result } = renderHook(() => useAppModals());
      expect(result.current.showAuthModal).toBe(false);
      expect(result.current.showPaymentModal).toBe(false);
      expect(result.current.showConsultForm).toBe(false);
      expect(result.current.mobileMenuOpen).toBe(false);
    });

    it("paymentPlan is null initially", () => {
      const { result } = renderHook(() => useAppModals());
      expect(result.current.paymentPlan).toBeNull();
    });
  });

  describe("auth modal", () => {
    it("opens auth modal via setShowAuthModal", () => {
      const { result } = renderHook(() => useAppModals());
      act(() => {
        result.current.setShowAuthModal(true);
      });
      expect(result.current.showAuthModal).toBe(true);
    });

    it("closes auth modal via setShowAuthModal", () => {
      const { result } = renderHook(() => useAppModals());
      act(() => {
        result.current.setShowAuthModal(true);
        result.current.setShowAuthModal(false);
      });
      expect(result.current.showAuthModal).toBe(false);
    });

    it("opens auth modal via onRequireLogin", () => {
      const { result } = renderHook(() => useAppModals());
      act(() => {
        result.current.onRequireLogin();
      });
      expect(result.current.showAuthModal).toBe(true);
    });
  });

  describe("payment modal", () => {
    it("opens payment modal with plan via onPay", () => {
      const { result } = renderHook(() => useAppModals());
      const payEvent = { planCode: "annual", noticeId: 42 };
      act(() => {
        result.current.onPay(payEvent as any);
      });
      expect(result.current.showPaymentModal).toBe(true);
      expect(result.current.paymentPlan).toEqual(payEvent);
    });

    it("closes payment modal via setShowPaymentModal", () => {
      const { result } = renderHook(() => useAppModals());
      act(() => {
        result.current.setShowPaymentModal(true);
        result.current.setShowPaymentModal(false);
      });
      expect(result.current.showPaymentModal).toBe(false);
    });

    it("clears payment plan via setPaymentPlan", () => {
      const { result } = renderHook(() => useAppModals());
      const payEvent = { planCode: "annual", noticeId: 42 };
      act(() => {
        result.current.onPay(payEvent as any);
        result.current.setPaymentPlan(null);
      });
      expect(result.current.paymentPlan).toBeNull();
    });
  });

  describe("consult form", () => {
    it("opens consult form via setShowConsultForm", () => {
      const { result } = renderHook(() => useAppModals());
      act(() => {
        result.current.setShowConsultForm(true);
      });
      expect(result.current.showConsultForm).toBe(true);
    });

    it("opens consult form via onConsult", () => {
      const { result } = renderHook(() => useAppModals());
      act(() => {
        result.current.onConsult();
      });
      expect(result.current.showConsultForm).toBe(true);
    });

    it("closes consult form via setShowConsultForm", () => {
      const { result } = renderHook(() => useAppModals());
      act(() => {
        result.current.setShowConsultForm(true);
        result.current.setShowConsultForm(false);
      });
      expect(result.current.showConsultForm).toBe(false);
    });
  });

  describe("mobile menu", () => {
    it("opens mobile menu via setMobileMenuOpen", () => {
      const { result } = renderHook(() => useAppModals());
      act(() => {
        result.current.setMobileMenuOpen(true);
      });
      expect(result.current.mobileMenuOpen).toBe(true);
    });

    it("closes mobile menu via setMobileMenuOpen", () => {
      const { result } = renderHook(() => useAppModals());
      act(() => {
        result.current.setMobileMenuOpen(true);
        result.current.setMobileMenuOpen(false);
      });
      expect(result.current.mobileMenuOpen).toBe(false);
    });
  });

  describe("independent state management", () => {
    it("modals can be opened independently", () => {
      const { result } = renderHook(() => useAppModals());
      act(() => {
        result.current.setShowAuthModal(true);
        result.current.setShowConsultForm(true);
      });
      expect(result.current.showAuthModal).toBe(true);
      expect(result.current.showConsultForm).toBe(true);
      expect(result.current.showPaymentModal).toBe(false);
    });

    it("closing one modal does not affect others", () => {
      const { result } = renderHook(() => useAppModals());
      act(() => {
        result.current.setShowAuthModal(true);
        result.current.setShowConsultForm(true);
        result.current.setMobileMenuOpen(true);
        result.current.setShowAuthModal(false);
      });
      expect(result.current.showAuthModal).toBe(false);
      expect(result.current.showConsultForm).toBe(true);
      expect(result.current.mobileMenuOpen).toBe(true);
    });
  });
});
