/**
 * 短信发送服务
 * SMS Service
 *
 * @module server/services/sms
 * @description 发送短信验证码。支持 mock 模式（控制台打印）与阿里云 SMS。
 *              阿里云模式下，验证码由阿里云生成并通过短信发送，同时返回给我们存储。
 *              环境变量缺失时优雅降级，抛出明确错误供上层处理。
 */

const SMS_PROVIDER = process.env.SMS_PROVIDER || "mock"; // "mock" | "aliyun"
const SMS_ACCESS_KEY_ID = process.env.SMS_ACCESS_KEY_ID;
const SMS_ACCESS_KEY_SECRET = process.env.SMS_ACCESS_KEY_SECRET;
const SMS_SIGN_NAME = process.env.SMS_SIGN_NAME || "恒创联众";
const SMS_TEMPLATE_CODE = process.env.SMS_TEMPLATE_CODE || "100001";

// 阿里云客户端懒加载单例
let _aliyunClient: any = null;

/** 是否已配置短信服务（mock 模式始终可用） */
export function isSmsConfigured(): boolean {
  if (SMS_PROVIDER === "mock") return true;
  return Boolean(SMS_ACCESS_KEY_ID && SMS_ACCESS_KEY_SECRET);
}

/** 获取或创建阿里云 SMS 客户端 */
function getAliyunClient(): any {
  if (_aliyunClient) return _aliyunClient;

  // 动态导入，避免 mock 模式下加载 SDK
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const China_Dypnsapi = require("@alicloud/dypnsapi20170525");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const OpenApi = require("@alicloud/openapi-client");

    const config = new OpenApi.Config({
      accessKeyId: SMS_ACCESS_KEY_ID,
      accessKeySecret: SMS_ACCESS_KEY_SECRET,
      endpoint: "dypnsapi.aliyuncs.com",
    });
    _aliyunClient = new China_Dypnsapi.default(config);
    return _aliyunClient;
  } catch (err) {
    throw new Error(`SMS_SDK_INIT_FAILED: ${(err as Error).message}`);
  }
}

/**
 * 发送短信验证码（阿里云模式）
 * 阿里云生成验证码、发送短信、并返回验证码明文
 *
 * @param phone - 目标手机号（中国大陆 11 位）
 * @returns 阿里云生成的验证码明文（需调用方存入数据库）
 */
export async function sendSmsVerificationCode(phone: string): Promise<string> {
  if (SMS_PROVIDER === "mock") {
    // Mock 模式：自己生成验证码，打印到控制台
    const code = String(Math.floor(100000 + Math.random() * 900000));
    console.log(`[SMS-MOCK] → ${phone}: 验证码 ${code}`);
    return code;
  }

  if (!isSmsConfigured()) {
    throw new Error("SMS_NOT_CONFIGURED");
  }

  // 阿里云 SMS 发送
  const client = getAliyunClient();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Models = require("@alicloud/dypnsapi20170525");

  const request = new Models.SendSmsVerifyCodeRequest({
    phoneNumber: phone,
    signName: SMS_SIGN_NAME,
    templateCode: SMS_TEMPLATE_CODE,
    templateParam: JSON.stringify({ code: "##code##", min: "10" }),
    codeLength: 6,
    validTime: 600, // 10 分钟
    codeType: 1,    // 纯数字
    returnVerifyCode: true,
  });

  try {
    const response = await client.sendSmsVerifyCode(request);
    const body = response.body;

    if (body?.code === "OK" && body?.model?.verifyCode) {
      console.log(`[SMS-ALIYUN] ✓ 验证码发送成功: ${phone}`);
      return String(body.model.verifyCode);
    }

    throw new Error(`SMS_SEND_FAILED: ${body?.message || body?.code || "unknown"}`);
  } catch (err: any) {
    if (err.message?.startsWith("SMS_")) throw err;
    throw new Error(`SMS_SEND_ERROR: ${err.message}`);
  }
}
