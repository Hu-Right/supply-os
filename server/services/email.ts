/**
 * 邮件发送服务
 * Email Service
 *
 * @module server/services/email
 * @description 基于 nodemailer + 阿里云 SMTP 发送系统邮件（验证码等）。
 *              环境变量缺失时优雅降级，抛出明确错误供上层处理。
 */
import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || '"国际采购供应链平台" <noreply@supply-os.com>';

/** 是否已配置 SMTP（未配置时邮件功能优雅降级） */
export function isEmailConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

/** 获取 transporter（懒初始化单例） */
function getTransporter() {
  if (!isEmailConfigured()) {
    throw new Error("SMTP_NOT_CONFIGURED");
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

/**
 * 发送找回密码验证码邮件
 * Send password reset verification code email
 */
export async function sendPasswordResetEmail(email: string, code: string): Promise<void> {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: "找回密码 - 验证码",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>找回密码</h2>
        <p>您的验证码为：</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px;
                    padding: 16px; background: #f1f5f9; border-radius: 8px;
                    text-align: center; margin: 16px 0;">
          ${code}
        </div>
        <p style="color: #64748b; font-size: 14px;">
          验证码 15 分钟内有效。如非本人操作，请忽略此邮件。
        </p>
      </div>
    `,
  });
}
