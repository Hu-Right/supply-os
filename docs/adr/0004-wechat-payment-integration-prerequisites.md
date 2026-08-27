# ADR-0004: 微信支付接入前置条件

- **状态**：已接受（作为未来接入的强制前置清单）
- **日期**：2026-08-28
- **背景**：健康度评估发现 WechatProvider 存在未实现验签的 stub 代码

## 背景

`src/lib/payment/WechatProvider.ts` 当前的 `verifyCallback` 是一个
无条件返回 `verified: true` 的占位实现（未验证 `Wechatpay-Signature`、
未 AES-256-GCM 解密 `resource`）。**当前不构成风险**：

- `crm_payment_provider_configs` 表中仅有 alipay（live）一行配置；
- `WECHAT_APP_ID` / `WECHAT_MCH_ID` 环境变量未设置 →
  `PaymentService.initDefault` 的微信注册条件永不满足，策略从未注册。

## 决策

在以下三项前置条件全部完成前，**禁止**配置微信环境变量或数据库配置行
（即保持微信策略处于未注册状态）：

### 前置 1：v3 回调验签 + 解密

- 用平台公钥验证 `Wechatpay-Signature`（签名串 `timestamp\nnonce\nbody\n`，
  头部取 `Wechatpay-Timestamp` / `Wechatpay-Nonce`）；
- 用 APIv3 密钥 AES-256-GCM 解密 `resource.ciphertext`；
- `out_trade_no` / `amount.total` 必须从**解密后**的 JSON 读取
  （当前 stub 读的是真实回调不存在的顶层字段）；
- notify 路由需把原始 body 文本 + 三个签名头透传给 verifyCallback。

### 前置 2：失败必须返回 HTTP 5xx

微信 v3 仅对非 2xx 状态重试。`/api/payment/notify` 的微信分支失败时
必须返回 `status: 500`（当前返回 200 + `{"code":"FAIL"}` 会杀死重试链，
导致钱已收但订单永久 pending）。支付宝分支保持明文 `fail` 不变。

### 前置 3：移除 stub 行为

- `createPaymentUrl` 不得返回 `STUB_` 前缀的假 prepay/QR
  （当前假二维码会让 UI 展示一个永远无法完成的支付渠道）；
- `queryOrderStatus` 不得硬编码 `pending`（轮询对账永远无法确认）；
- `config-status` 路由需如实上报微信配置状态。

## 后果

- 接入微信时按本清单逐项实现并在沙箱验证后，方可配置生产密钥；
- 微信策略注册条件（双 env 或配置行存在）保持现状即可作为天然开关。
