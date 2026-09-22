import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeCss } from "../../../scripts/lib/css-compat.mjs";

const passCases = [
  ["普通样式", ".a{color:red;padding:1rem}"],
  ["完全被后续声明覆盖的旧值", ".a{--pos:to right in oklab}.a{--pos:to right}"],
  [
    "注释和字符串不当作语法",
    '/* @layer x{} */ .a{content:"@layer oklch( &";background:url("/lab(icon).svg")}',
  ],
  ["压缩后的颜色增强", ".a{color:red}@supports(color:oklch(.5 .1 20)){.a{color:oklch(.5 .1 20)}}"],
  [
    "空白与大小写",
    ".a { color: red } @supports (color: OKLCH(.5 .1 20)) { .a { color: OKLCH(.5 .1 20) } }",
  ],
  ["同规则声明回退", ".a{color:red;color:oklch(.5 .1 20)}"],
  [
    "变量必须通过守卫增强",
    ".a{--tone:red}@supports(color:color-mix(in srgb,red,blue)){.a{--tone:color-mix(in srgb,red,blue)}}",
  ],
  [
    "肯定合取守卫",
    ".a{--tone:red}@supports (color:color-mix(in srgb,red,blue)) and (display:grid){.a{--tone:color-mix(in srgb,red,blue)}}",
  ],
  [
    "相同媒体条件中的回退",
    "@media(min-width:40rem){.a{color:red}@supports(color:oklch(.5 .1 20)){.a{color:oklch(.5 .1 20)}}}",
  ],
  [
    "无条件回退可覆盖媒体增强",
    ".a{color:red}@media(min-width:40rem){@supports(color:oklch(.5 .1 20)){.a{color:oklch(.5 .1 20)}}}",
  ],
  [
    "合并选择器中的回退",
    ".a,.b{color:red}@supports(color:oklch(.5 .1 20)){.a{color:oklch(.5 .1 20)}}",
  ],
  [
    "渐变插值参数的回退",
    ".a{--pos:to right}@supports(background-image:linear-gradient(in oklab,red,blue)){.a{--pos:to right in oklab}}",
  ],
];
for (const [name, css] of passCases) {
  test(`放行：${name}`, () => assert.deepEqual(analyzeCss(css).errors, []));
}

const failCases = [
  ["级联层", "@layer base{.a{color:red}}"],
  ["层顺序声明", "@layer base,utilities;"],
  ["嵌套选择器", ".a{&:hover{color:red}}"],
  ["无 ampersand 的嵌套", ".a{span{color:red}}"],
  ["无回退的现代颜色", ".a{color:oklch(.5 .1 20)}"],
  [
    "守卫不能代替回退",
    "@supports(color:color-mix(in srgb,red,blue)){.a{color:color-mix(in srgb,red,blue)}}",
  ],
  ["变量不能靠连续声明回退", ".a{--tone:red;--tone:color-mix(in srgb,red,blue)}"],
  ["无关守卫", ".a{--tone:red}@supports(display:grid){.a{--tone:color-mix(in srgb,red,blue)}}"],
  [
    "自定义属性探测并不验证颜色支持",
    ".a{--tone:red}@supports(--probe:color-mix(in srgb,red,blue)){.a{--tone:color-mix(in srgb,red,blue)}}",
  ],
  [
    "变量声明中包含函数不等于能力探测",
    ".a{--tone:red}@supports(color:var(--x,color-mix(in srgb,red,blue))){.a{--tone:color-mix(in srgb,red,blue)}}",
  ],
  [
    "否定守卫",
    ".a{--tone:red}@supports not (color:color-mix(in srgb,red,blue)){.a{--tone:color-mix(in srgb,red,blue)}}",
  ],
  [
    "析取不能保证支持",
    ".a{--tone:red}@supports (color:color-mix(in srgb,red,blue)) or (display:grid){.a{--tone:color-mix(in srgb,red,blue)}}",
  ],
  [
    "另一选择器的回退无效",
    ".b{color:red}@supports(color:oklch(.5 .1 20)){.a{color:oklch(.5 .1 20)}}",
  ],
  [
    "移动端不能使用桌面专属回退",
    "@media(min-width:80rem){.a{color:red}}@supports(color:oklch(.5 .1 20)){.a{color:oklch(.5 .1 20)}}",
  ],
  ["嵌套函数也需要回退", ".a{background:linear-gradient(red,color-mix(in srgb,red,blue))}"],
  ["变量内渐变插值", ".a{--pos:to right in oklab}"],
  [
    "受限覆盖不能清除旧值",
    ".a{--pos:to right in oklab}@media(min-width:80rem){.a{--pos:to right}}",
  ],
  ["不接受空产物", "/* empty */"],
  ["CSS 语法错误", ".a{color:red"],
];
for (const [name, css] of failCases) {
  test(`拦截：${name}`, () => assert.ok(analyzeCss(css).errors.length > 0));
}

test("报告静态门禁不能保证的旧内核特性", () => {
  const result = analyzeCss(
    "@property --x{syntax:'<number>';initial-value:0;inherits:false}.a:where(:not(:last-child)){translate:0 -50%}"
  );
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((message) => message.includes(":where")));
  assert.ok(result.warnings.some((message) => message.includes("@property")));
  assert.ok(result.warnings.some((message) => message.includes("translate")));
});
