/**
 * 邮件发送服务
 * Email Service
 *
 * @module server/services/email
 * @description 基于 nodemailer + 阿里云 SMTP 发送系统邮件（验证码等）。
 *              环境变量缺失时优雅降级，抛出明确错误供上层处理。
 */
import nodemailer from "nodemailer";
import { createLogger } from "@/lib/utils/fileLogger";

const log = createLogger("email");

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
    log.info(`找回密码邮件发送成功 to=${email}`);
  } catch (err) {
    const errMsg = (err as Error).message || "未知错误";
    log.error(`找回密码邮件发送失败 to=${email}: ${errMsg}`);
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
    log.info(`注册验证邮件发送成功 to=${email}`);
  } catch (err) {
    const errMsg = (err as Error).message || "未知错误";
    log.error(`注册验证邮件发送失败 to=${email}: ${errMsg}`);
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
    log.info(`邮箱绑定邮件发送成功 to=${email}`);
  } catch (err) {
    const errMsg = (err as Error).message || "未知错误";
    log.error(`邮箱绑定邮件发送失败 to=${email}: ${errMsg}`);
    resetTransporter();
    throw err;
  }
}

// ── RFQ 采购闭环邮件触达（⑦报价通知 / ⑩中标通知 / 发布邀约） ──

/** 通用系统邮件发送：复用 transporter 单例，失败清单例并上抛（调用方 best-effort 捕获）。 */
async function dispatchEmail(email: string, subject: string, html: string, tag: string): Promise<void> {
  const transporter = getTransporter();
  const cfg = getSmtpConfig();
  try {
    await transporter.sendMail({ from: cfg.from, to: email, subject, html });
    log.info(`${tag} 邮件发送成功 to=${email}`);
  } catch (err) {
    log.error(`${tag} 邮件发送失败 to=${email}: ${(err as Error).message || "未知错误"}`);
    resetTransporter();
    throw err;
  }
}

/** 轻量邮件外壳（与验证码邮件同风格，480px 卡片）。 */
function emailShell(title: string, inner: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">${title}</h2>
      ${inner}
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">本邮件由国际采购供应链平台自动发送，请勿直接回复。</p>
    </div>
  `;
}

/** 发布邀约：邀请认证供应商就某采购需求报价。 */
export async function sendRfqInviteEmail(
  email: string,
  opts: { rfqTitle: string; rfqLink: string; deadlineText?: string; budgetText?: string },
): Promise<void> {
  const meta = [opts.budgetText ? `预算：${opts.budgetText}` : "", opts.deadlineText ? `截止：${opts.deadlineText}` : ""]
    .filter(Boolean)
    .join(" ｜ ");
  await dispatchEmail(
    email,
    "新采购需求邀请您报价",
    emailShell("新采购需求邀请您报价", `
      <p>平台有一条与您相关的采购需求，欢迎登录查看详情并提交报价：</p>
      <div style="padding: 12px 16px; background: #f8fafc; border-radius: 8px; margin: 12px 0;">
        <strong>${opts.rfqTitle}</strong>
        ${meta ? `<div style="color: #64748b; font-size: 14px; margin-top: 4px;">${meta}</div>` : ""}
      </div>
      <p><a href="${opts.rfqLink}" style="display:inline-block;padding:10px 18px;background:#0d9488;color:#fff;border-radius:8px;text-decoration:none;">查看需求并报价</a></p>
    `),
    "RFQ邀约",
  );
}

/** 报价到达：通知采购方收到一条新报价。 */
export async function sendRfqQuoteReceivedEmail(
  email: string,
  opts: { rfqTitle: string; rfqLink: string },
): Promise<void> {
  await dispatchEmail(
    email,
    "收到一条新报价",
    emailShell("收到一条新报价", `
      <p>您的采购需求<strong>《${opts.rfqTitle}》</strong>收到一条供应商报价。</p>
      <p><a href="${opts.rfqLink}" style="display:inline-block;padding:10px 18px;background:#0d9488;color:#fff;border-radius:8px;text-decoration:none;">登录查看报价并比价</a></p>
    `),
    "RFQ收到报价",
  );
}

/** 中标通知：恭喜供应商在某采购需求中中选。 */
export async function sendRfqAwardedEmail(
  email: string,
  opts: { rfqTitle: string; rfqLink: string },
): Promise<void> {
  await dispatchEmail(
    email,
    "恭喜：您已中选采购需求",
    emailShell("恭喜：您已中选", `
      <p>恭喜！您在采购需求<strong>《${opts.rfqTitle}》</strong>中中选。</p>
      <p><a href="${opts.rfqLink}" style="display:inline-block;padding:10px 18px;background:#0d9488;color:#fff;border-radius:8px;text-decoration:none;">查看中标详情</a></p>
    `),
    "RFQ中标",
  );
}

/** 落选通知：告知供应商本次未被选中。 */
export async function sendRfqRejectedEmail(
  email: string,
  opts: { rfqTitle: string; rfqLink: string },
): Promise<void> {
  await dispatchEmail(
    email,
    "采购需求报价结果",
    emailShell("报价结果", `
      <p>您参与的采购需求<strong>《${opts.rfqTitle}》</strong>已完成供应商选定，本次未被选中。</p>
      <p>欢迎继续关注需求广场的其他采购需求。</p>
      <p><a href="${opts.rfqLink}" style="display:inline-block;padding:10px 18px;background:#0d9488;color:#fff;border-radius:8px;text-decoration:none;">查看需求详情</a></p>
    `),
    "RFQ落选",
  );
}
