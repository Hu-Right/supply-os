/**
 * 邮件发送服务
 * Email Service
 *
 * @module server/services/email
 * @description 基于 nodemailer + 阿里云 SMTP 发送系统邮件（验证码等）。
 *              环境变量缺失时优雅降级，抛出明确错误供上层处理。
 */
import nodemailer from "nodemailer";

/**
 * SMTP 配置读取策略：每次发送时从 process.env 实时读取，
 * 避免模块加载时 const 捕获导致环境变量变更不生效。
 */
function getSmtpConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || '"国际采购供应链平台" <noreply@supply-os.com>',
  };
}

/** 是否已配置 SMTP（未配置时邮件功能优雅降级） */
export function isEmailConfigured(): boolean {
  const { host, user, pass } = getSmtpConfig();
  return Boolean(host && user && pass);
}

/** transporter 懒初始化单例（避免每次发送都创建新连接） */
let _transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

/** 获取 transporter（懒初始化单例；发送失败后自动清除以便重建） */
function getTransporter() {
  const cfg = getSmtpConfig();
  if (!cfg.host || !cfg.user || !cfg.pass) {
    throw new Error("SMTP_NOT_CONFIGURED");
  }
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
  });
  return _transporter;
}

/** 清除 transporter 单例（发送失败时调用，下次发送重建连接） */
function resetTransporter() {
  _transporter = null;
}

/**
 * 发送找回密码验证码邮件
 * Send password reset verification code email
 */
export async function sendPasswordResetEmail(email: string, code: string): Promise<void> {
  const transporter = getTransporter();
  const cfg = getSmtpConfig();
  try {
    await transporter.sendMail({
      from: cfg.from,
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
  } catch (err) {
    resetTransporter();
    throw err;
  }
}

/**
 * 发送注册验证码邮件
 * Send registration verification code email
 */
export async function sendRegistrationVerifyEmail(email: string, code: string): Promise<void> {
  const transporter = getTransporter();
  const cfg = getSmtpConfig();
  try {
    await transporter.sendMail({
      from: cfg.from,
      to: email,
    subject: "注册验证 - 验证码",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>欢迎注册国际采购供应链平台</h2>
        <p>您的注册验证码为：</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px;
                    padding: 16px; background: #f0fdfa; border-radius: 8px;
                    text-align: center; margin: 16px 0; color: #0d9488;">
          ${code}
        </div>
        <p style="color: #64748b; font-size: 14px;">
          验证码 10 分钟内有效。如非本人操作，请忽略此邮件。
        </p>
      </div>
    `,
    });
  } catch (err) {
    resetTransporter();
    throw err;
  }
}

/**
 * 发送邮箱绑定验证码邮件
 * Send email binding verification code email
 */
export async function sendEmailBindingCode(email: string, code: string): Promise<void> {
  const transporter = getTransporter();
  const cfg = getSmtpConfig();
  try {
    await transporter.sendMail({
      from: cfg.from,
      to: email,
    subject: "邮箱绑定 - 验证码",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>邮箱绑定验证</h2>
        <p>您的邮箱绑定验证码为：</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px;
                    padding: 16px; background: #f0fdfa; border-radius: 8px;
                    text-align: center; margin: 16px 0; color: #0d9488;">
          ${code}
        </div>
        <p style="color: #64748b; font-size: 14px;">
          验证码 10 分钟内有效。如非本人操作，请忽略此邮件。
        </p>
      </div>
    `,
    });
  } catch (err) {
    resetTransporter();
    throw err;
  }
}
