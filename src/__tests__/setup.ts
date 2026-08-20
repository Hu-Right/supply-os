/**
 * vitest 全局 setup（jsdom 环境）
 *
 * @description 测试基建修复（Phase 0.1，2026-08-20）：vitest.config.ts 引用的
 *              本文件此前缺失，导致所有测试套件无法加载（"测试体系断裂"遗留项）。
 *              现恢复为最小可用实现；后续前端测试需要的全局 mock 在此集中添加。
 */

// jsdom 不提供 matchMedia，前端组件测试常用兜底
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

export {};
