/**
 * 翻译通道超时守护：为 fetch 加 AbortController 截止时间。
 * 超时统一抛 Error("CHANNEL_TIMEOUT")，落入链上既有 catch 降级路径；
 * 仅传输层守护，不改动请求 URL/headers/body（本地差异约束）。
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // race 兜底：即使底层 fetch 实现忽略 signal（如测试替身），超时仍能触发
    return await Promise.race([
      fetch(url, { ...init, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("CHANNEL_TIMEOUT")),
          { once: true }
        );
      }),
    ]);
  } catch (err: unknown) {
    if (controller.signal.aborted) throw new Error("CHANNEL_TIMEOUT", { cause: err });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
