/**
 * 邮件身份 / 认证配置（纯函数，零副作用，便于单测）
 *
 * @module lib/services/email-config
 * @description 发件人身份与 DKIM 签名的唯一解析入口：
 *              - From 默认值与 Reply-To 由 env 决定，避免各调用点各写一份；
 *              - DKIM 三项（域/选择器/私钥）齐全才启用，私钥支持单行 `\n` 转义；
 *              - 营销/邀约类邮件的 List-Unsubscribe 头只在这里构造。
 *
 *              域名侧的 SPF/DKIM/DMARC 仍需在 DNS 配置，可用
 *              `npm run check:email-dns` 自检。
 */

/** 未配置 SMTP_FROM 时的兜底发件人（仅本地调试；生产必须显式配置且域名已完成认证） */
export const DEFAULT_MAIL_FROM = '"国际采购供应链平台" <noreply@supply-os.com>';

/** 只读环境变量视图（便于测试注入；process.env 满足该形状） */
export type MailEnv = Record<string, string | undefined>;

export interface MailIdentity {
  from: string;
  replyTo?: string;
}

/** From / Reply-To：Reply-To 未配置时不下发该头 */
export function resolveMailIdentity(env: MailEnv = process.env): MailIdentity {
  const from = env.SMTP_FROM?.trim() || DEFAULT_MAIL_FROM;
  const replyTo = env.SMTP_REPLY_TO?.trim();
  return replyTo ? { from, replyTo } : { from };
}

export interface MailDkimConfig {
  domainName: string;
  keySelector: string;
  privateKey: string;
}

/** 应用侧 DKIM：三项齐全才启用；私钥允许在 .env 里用 `\n` 表示换行 */
export function resolveDkimConfig(env: MailEnv = process.env): MailDkimConfig | undefined {
  const domainName = env.SMTP_DKIM_DOMAIN?.trim();
  const keySelector = env.SMTP_DKIM_SELECTOR?.trim();
  const privateKey = env.SMTP_DKIM_PRIVATE_KEY?.trim();
  if (!domainName || !keySelector || !privateKey) return undefined;
  return { domainName, keySelector, privateKey: privateKey.replace(/\\n/g, "\n") };
}

/**
 * 批量/邀约邮件的退订头。
 *
 * 只加 List-Unsubscribe：门户退订接口是「POST JSON token + 确认页」，
 * 不满足 RFC 8058 One-Click 的表单 POST 约定，因此不加 List-Unsubscribe-Post。
 */
export function unsubscribeHeaders(url: string): Record<string, string> {
  const trimmed = String(url ?? "").trim();
  return trimmed ? { "List-Unsubscribe": `<${trimmed}>` } : {};
}
