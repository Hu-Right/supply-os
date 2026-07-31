/**
 * 有道翻译 API 账号池
 * Youdao Translation API Account Pool
 *
 * @module server/services/translation/youdaoPool
 * @description 支持多账号轮转：当前账号配额耗尽（有道错误码 108/109/110/111）时
 *   自动切换到下一个可用账号，冷却至次日零点后恢复。
 *   配置方式（.env）：
 *   - 兼容旧格式：YOUDAO_APP_KEY + YOUDAO_APP_SECRET（视为账号 #0）
 *   - 多账号扩展：YOUDAO_APP_KEY_1 / YOUDAO_APP_SECRET_1 … 最多 _10
 *   所有账号均不可用时翻译链自动降级 DeepSeek，对调用方透明。
 */
import { channelConfigured } from "../../config/env";

export type YoudaoAccount = { appKey: string; appSecret: string };

/** 有道 API 配额/余额相关错误码（触发账号轮转） */
const QUOTA_ERROR_CODES = new Set(["108", "109", "110", "111"]);

class YoudaoPool {
  private accounts: YoudaoAccount[] = [];
  /** 当前优先使用的账号下标 */
  private current = 0;
  /** 各账号的冷却到期时间戳（配额耗尽后冷却至次日零点） */
  private exhaustedUntil: number[] = [];
  /** 懒加载标记：首次访问时从 env 初始化（兼容测试中后设 env 的场景） */
  private loaded = false;

  /** 从 env 加载账号：旧格式 + 编号扩展，去重由配置者自行保证 */
  private ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    // 旧格式兼容
    const legacyKey = process.env.YOUDAO_APP_KEY;
    const legacySecret = process.env.YOUDAO_APP_SECRET;
    if (channelConfigured(legacyKey) && channelConfigured(legacySecret)) {
      this.accounts.push({ appKey: legacyKey!, appSecret: legacySecret! });
    }
    // 编号扩展：_1 … _10
    for (let i = 1; i <= 10; i++) {
      const key = process.env[`YOUDAO_APP_KEY_${i}`];
      const secret = process.env[`YOUDAO_APP_SECRET_${i}`];
      if (channelConfigured(key) && channelConfigured(secret)) {
        this.accounts.push({ appKey: key!, appSecret: secret! });
      }
    }
    this.exhaustedUntil = new Array(this.accounts.length).fill(0);
    if (this.accounts.length > 0) {
      console.log(`[youdao-pool] 已加载 ${this.accounts.length} 个有道账号`);
    }
  }

  /** 池中账号总数 */
  get size(): number {
    this.ensureLoaded();
    return this.accounts.length;
  }

  /**
   * 获取当前可用账号（跳过冷却中的），全部耗尽返回 null。
   * 返回值附带 index 供 markExhausted 定位。
   */
  getActive(): (YoudaoAccount & { index: number }) | null {
    this.ensureLoaded();
    const now = Date.now();
    for (let i = 0; i < this.accounts.length; i++) {
      const idx = (this.current + i) % this.accounts.length;
      if (this.exhaustedUntil[idx] <= now) {
        return { ...this.accounts[idx], index: idx };
      }
    }
    return null;
  }

  /**
   * 标记账号配额耗尽，冷却至次日零点，指针推进到下一个。
   * 有道配额按自然日重置，冷却到零点即可恢复。
   */
  markExhausted(index: number) {
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    this.exhaustedUntil[index] = tomorrow.getTime();
    this.current = (index + 1) % Math.max(this.accounts.length, 1);
    console.warn(
      `[youdao-pool] 账号 #${index + 1} 配额耗尽，冷却至 ${tomorrow.toISOString()}，切换至 #${this.current + 1}`
    );
  }

  /** 判断有道错误码是否为配额/余额类（触发轮转） */
  isQuotaError(code: string): boolean {
    return QUOTA_ERROR_CODES.has(code);
  }

  /** 仅测试用：手动覆盖冷却时间 */
  overrideCooldownForTest(index: number, timestamp: number) {
    this.exhaustedUntil[index] = timestamp;
  }

  /** 仅测试用：重置懒加载状态，下次访问时重新从 env 加载 */
  resetForTest() {
    this.accounts = [];
    this.current = 0;
    this.exhaustedUntil = [];
    this.loaded = false;
  }
}

/** 全局单例——模块加载时从 env 初始化 */
export const youdaoPool = new YoudaoPool();
