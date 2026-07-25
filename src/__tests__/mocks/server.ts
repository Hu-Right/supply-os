import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * MSW Server for Vitest (Node environment)
 *
 * 在 jsdom 环境中使用 setupServer 拦截 fetch 请求。
 * 各测试文件可通过 import { server } from "./server" 来：
 *   - server.use(...)  覆盖默认 handler
 *   - server.resetHandlers()  恢复默认 handlers
 *   - server.close()  关闭拦截
 */
export const server = setupServer(...handlers);
