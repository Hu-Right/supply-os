/**
 * server/utils/fileLogger.ts 测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";

// Mock fs 模块，避免真实文件写入
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

// 确保 LOG_TO_CONSOLE=false 避免测试输出噪音
const origLogConsole = process.env.LOG_TO_CONSOLE;

describe("createLogger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LOG_TO_CONSOLE = "false";
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    process.env.LOG_TO_CONSOLE = origLogConsole;
  });

  it("info 写入正确格式日志", async () => {
    // 动态导入确保 mock 生效
    const { createLogger } = await import("../../../server/utils/fileLogger");
    const logger = createLogger("test-prefix");
    logger.info("hello world");

    expect(fs.appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining("test-prefix-"),
      expect.stringContaining("[test-prefix] INFO: hello world"),
      "utf-8",
    );
  });

  it("warn 写入正确格式日志", async () => {
    const { createLogger } = await import("../../../server/utils/fileLogger");
    const logger = createLogger("test-prefix");
    logger.warn("warning msg");

    expect(fs.appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining("test-prefix-"),
      expect.stringContaining("[test-prefix] WARN: warning msg"),
      "utf-8",
    );
  });

  it("error 写入正确格式日志", async () => {
    const { createLogger } = await import("../../../server/utils/fileLogger");
    const logger = createLogger("test-prefix");
    logger.error("error msg");

    expect(fs.appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining("test-prefix-"),
      expect.stringContaining("[test-prefix] ERROR: error msg"),
      "utf-8",
    );
  });

  it("日志文件名包含日期", async () => {
    const { createLogger } = await import("../../../server/utils/fileLogger");
    const logger = createLogger("daily");
    logger.info("check date");

    const filename = vi.mocked(fs.appendFileSync).mock.calls[0][0] as string;
    // 文件名格式: daily-YYYY-MM-DD.log
    expect(filename).toMatch(/daily-\d{4}-\d{2}-\d{2}\.log/);
  });

  it("目录不存在时自动创建", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const { createLogger } = await import("../../../server/utils/fileLogger");
    const logger = createLogger("mkdir-test");
    logger.info("trigger mkdir");

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  it("不同前缀生成不同日志文件", async () => {
    const { createLogger } = await import("../../../server/utils/fileLogger");
    const loggerA = createLogger("module-a");
    const loggerB = createLogger("module-b");
    loggerA.info("from A");
    loggerB.info("from B");

    const fileA = vi.mocked(fs.appendFileSync).mock.calls[0][0] as string;
    const fileB = vi.mocked(fs.appendFileSync).mock.calls[1][0] as string;
    expect(fileA).toContain("module-a-");
    expect(fileB).toContain("module-b-");
    expect(fileA).not.toBe(fileB);
  });
});
