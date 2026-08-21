/**
 * vitest 全局 setup（jsdom 环境）
 *
 * @description 在每个测试文件执行前自动运行，提供测试环境的全局 polyfill。
 *              后续前端测试需要的全局 mock 在此集中添加。
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
