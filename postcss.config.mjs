/**
 * PostCSS 配置
 *
 * 管线顺序（PostCSS 按数组顺序依次执行）：
 *   1. @tailwindcss/postcss —— 先生成完整 CSS（含 @layer/原生嵌套/color-mix 等新语法）
 *   2. postcss-preset-env —— 展开级联层、嵌套，并补充可静态转换的回退。
 *
 * browsers 仅指定 CSS 转换目标，不代表 Next.js 或整站支持这些最低版本。
 * 百度真机故障还需结合实际内核、资源响应和缓存检查，不能仅凭构建结果归因。
 * 逻辑属性由浏览器按最近的 dir 解析，禁止固定为 LTR，以免破坏阿拉伯语和嵌套方向。
 */
export default {
  plugins: [
    "@tailwindcss/postcss",
    [
      "postcss-preset-env",
      {
        features: {
          "logical-properties-and-values": false,
        },
        // 尽力提供旧语法回退；完整支持范围仍以真机验收为准。
        browsers: [
          "chrome >= 64",
          "edge >= 79",
          "firefox >= 68",
          "safari >= 12",
          "ios_saf >= 12",
          "and_chr >= 64",
          "and_ff >= 68",
          "samsung >= 9",
        ],
      },
    ],
  ],
};
