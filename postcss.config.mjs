/**
 * PostCSS 配置
 *
 * 管线顺序（PostCSS 按数组顺序依次执行）：
 *   1. @tailwindcss/postcss —— 先生成完整 CSS（含 @layer/原生嵌套/color-mix 等新语法）
 *   2. postcss-preset-env  —— 对「成品」做降编译，把新语法拍平/降级为旧内核可解析的写法
 *
 * 背景：Tailwind v4 输出的 @layer / CSS 嵌套 / color-mix() 需要较新的浏览器内核。
 * 手机百度 App 内置 WebView（Chromium 版号偏旧）解析这些语法会整段丢弃规则，表现为「整站无样式」。
 * browsers 目标圈定需要兼容到的旧内核，preset-env 据此决定降级范围。
 *
 * ⚠ 若日后要放宽兼容底线（放弃旧内核），把 browsers 调新即可减小产物体积。
 */
export default {
  plugins: [
    "@tailwindcss/postcss",
    [
      "postcss-preset-env",
      {
        // 兼容目标：覆盖手机百度等旧 Chromium WebView 及老 iOS Safari
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
