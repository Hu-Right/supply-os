import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useInfiniteScroll } from "@/shared/ui/useInfiniteScroll";

// Mock IntersectionObserver for jsdom
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
const mockUnobserve = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: mockObserve,
    disconnect: mockDisconnect,
    unobserve: mockUnobserve,
  }));
});

describe("useInfiniteScroll", () => {
  it("returns sentinelRef", () => {
    const { result } = renderHook(() =>
      useInfiniteScroll({
        enabled: true,
        loading: false,
        hasMore: true,
        onLoadMore: vi.fn(),
      })
    );
    expect(result.current).toBeDefined();
    expect(result.current.current).toBeNull(); // ref starts null until attached
  });

  it("does not create observer when disabled", () => {
    renderHook(() =>
      useInfiniteScroll({
        enabled: false,
        loading: false,
        hasMore: true,
        onLoadMore: vi.fn(),
      })
    );
    expect(mockObserve).not.toHaveBeenCalled();
  });

  it("does not create observer when loading", () => {
    renderHook(() =>
      useInfiniteScroll({
        enabled: true,
        loading: true,
        hasMore: true,
        onLoadMore: vi.fn(),
      })
    );
    expect(mockObserve).not.toHaveBeenCalled();
  });

  it("does not create observer when no more items", () => {
    renderHook(() =>
      useInfiniteScroll({
        enabled: true,
        loading: false,
        hasMore: false,
        onLoadMore: vi.fn(),
      })
    );
    expect(mockObserve).not.toHaveBeenCalled();
  });
});
