import assert from "node:assert/strict";
import { before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import config from "../../../postcss.config.mjs";
import { analyzeCss } from "../../../scripts/lib/css-compat.mjs";

let root;
before(async () => {
  const plugins = await Promise.all(
    config.plugins.map(async (entry) => {
      const [name, options] = Array.isArray(entry) ? entry : [entry, {}];
      return (await import(name)).default(options);
    })
  );
  const source = new URL("../../../src/app/globals.css", import.meta.url);
  const css = await readFile(source, "utf8");
  root = (
    await postcss(plugins).process(
      css + '\n@source inline("text-start ps-9 start-0 me-2 bg-gradient-to-r bg-gradient-to-br");',
      { from: fileURLToPath(source) }
    )
  ).root;
});

function values(prop) {
  const result = [];
  root.walkDecls(prop, (decl) => result.push(decl.value));
  return result;
}

test("保留文字起始方向，不固定为 left", () => assert.ok(values("text-align").includes("start")));
test("保留输入框逻辑内边距", () => assert.ok(values("padding-inline-start").length > 0));
test("保留图标逻辑定位", () => assert.ok(values("inset-inline-start").length > 0));
test("保留尾侧逻辑间距", () => assert.ok(values("margin-inline-end").length > 0));
test("保留传统渐变方向回退", () => {
  const positions = values("--tw-gradient-position");
  assert.ok(positions.includes("to right"));
  assert.ok(positions.includes("to bottom right"));
});
test("真实管线产物满足回退门禁", () => {
  assert.deepEqual(analyzeCss(root.toString()).errors, []);
});
test("渐变仍然生成背景图声明", () => {
  let found = false;
  root.walkRules((rule) => {
    if (rule.selector.startsWith(".bg-gradient-to-r:")) {
      rule.walkDecls("background-image", () => {
        found = true;
      });
    }
  });
  assert.ok(found);
});
test("关键垂直居中有传统 transform 回退", () => {
  assert.ok(values("transform").includes("translateY(-50%)"));
});
test("级联层已经展开", () => {
  let layers = 0;
  root.walkAtRules("layer", () => layers++);
  assert.equal(layers, 0);
});
