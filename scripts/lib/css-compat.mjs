import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import valueParser from "postcss-value-parser";

const COLOR_FUNCTIONS = new Set(["color-mix", "oklch", "oklab", "lch", "lab", "color"]);
const COLOR_SPACES = new Set(["oklab", "oklch", "lab", "lch"]);
const normalize = (text) => text.replace(/\s+/g, "").toLowerCase();

function inspectValue(value) {
  const features = new Set();
  let dynamic = false;
  const parsed = valueParser(value);
  function inspectInterpolation(nodes) {
    const words = nodes
      .filter((node) => node.type === "word")
      .map((node) => node.value.toLowerCase());
    if (words.some((word, index) => word === "in" && COLOR_SPACES.has(words[index + 1]))) {
      features.add("gradient-interpolation");
    }
  }
  inspectInterpolation(parsed.nodes);
  parsed.walk((node) => {
    if (node.type !== "function") return;
    const name = node.value.toLowerCase();
    if (name === "url") return false;
    if (name === "var") dynamic = true;
    if (COLOR_FUNCTIONS.has(name)) features.add(name);
    if (name.endsWith("gradient")) inspectInterpolation(node.nodes);
  });
  return { features, dynamic };
}

function ancestors(node) {
  const result = [];
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "atrule") result.unshift(parent);
  }
  return result;
}

// 只认可肯定、合取的能力探测；not/or 不能证明当前分支支持所用特性。
function guardedFeatures(scopes) {
  const features = new Set();
  for (const scope of scopes) {
    if (scope.name.toLowerCase() !== "supports" || /\b(?:not|or)\b/i.test(scope.params)) continue;
    const nodes = valueParser(scope.params).nodes.filter(
      (node) => !["space", "comment"].includes(node.type)
    );
    // 限定为 (普通属性: 静态值) 的肯定测试；自定义属性和 var() 接受未知 token，不能证明支持。
    if (
      !nodes.every((node, index) =>
        index % 2
          ? node.type === "word" && node.value.toLowerCase() === "and"
          : node.type === "function" && node.value === ""
      )
    )
      continue;
    for (const node of nodes.filter((_, index) => index % 2 === 0)) {
      const parts = node.nodes.filter((part) => !["space", "comment"].includes(part.type));
      if (parts[0]?.type !== "word" || parts[0].value.startsWith("--") || parts[1]?.value !== ":")
        continue;
      const value = inspectValue(valueParser.stringify(parts.slice(2)));
      if (!value.dynamic) for (const feature of value.features) features.add(feature);
    }
  }
  return features;
}

function selectors(rule) {
  return selectorParser()
    .astSync(rule.selector)
    .nodes.map((node) => node.toString().trim());
}

/**
 * 检查本项目约定的静态回退策略，不宣称验证任意浏览器的完整 CSS/JS 兼容性。
 * 回退要求同属性、同选择器、先于增强声明，且不能仅存在于更窄的条件分支。
 */
export function analyzeCss(css, from = "stylesheet.css") {
  const errors = [];
  const warningSet = new Set();
  let root;
  try {
    root = postcss.parse(css, { from });
  } catch (error) {
    return { errors: [error.message], warnings: [], declarations: 0 };
  }
  const report = (node, message) =>
    errors.push(
      `${from}:${node.source?.start?.line ?? 1}:${node.source?.start?.column ?? 1} ${message}`
    );
  root.walkAtRules((node) => {
    const name = node.name.toLowerCase();
    if (name === "layer") report(node, "残留 @layer：级联层尚未展开");
    if (name === "property") warningSet.add("@property 初始化分支仍需目标内核验证");
  });
  root.walkRules((rule) => {
    let nested = false;
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === "rule") nested = true;
    }
    try {
      selectorParser((ast) => {
        ast.walkNesting(() => {
          nested = true;
        });
        ast.walkPseudos((node) => {
          if ([":where", ":is", ":has"].includes(node.value)) {
            warningSet.add(`${node.value} 选择器仍需目标内核验证`);
          }
        });
      }).processSync(rule.selector);
    } catch (error) {
      report(rule, `选择器解析失败：${error.message}`);
    }
    if (nested) report(rule, "残留原生嵌套选择器");
  });

  const declarations = [];
  root.walkDecls((decl) => {
    if (["translate", "rotate", "scale"].includes(decl.prop)) {
      warningSet.add(`${decl.prop} 独立变换仍需目标内核验证`);
    }
    const scopes = ancestors(decl);
    const value = inspectValue(decl.value);
    declarations.push({ decl, scopes, ...value });
  });
  if (!declarations.length) errors.push(`${from}: 没有可检查的 CSS 声明`);

  const fallbacks = new Map();
  for (const [index, item] of declarations.entries()) {
    const { decl, scopes, features, dynamic } = item;
    if (decl.parent.type !== "rule") continue;
    let targets;
    try {
      targets = selectors(decl.parent);
    } catch {
      continue; // 上面的选择器检查已经记录硬错误。
    }
    const property = decl.prop.startsWith("--") ? decl.prop : decl.prop.toLowerCase();
    const keys = targets.map((selector) => `${selector}\n${property}`);
    const conditions = scopes.map(
      (scope) => `${scope.name.toLowerCase()}:${normalize(scope.params)}`
    );
    if (!features.size) {
      for (const key of keys) {
        const previous = fallbacks.get(key) ?? [];
        previous.push({ conditions, important: !!decl.important });
        fallbacks.set(key, previous);
      }
      continue;
    }
    // 同优先级、同条件、同选择器的后续普通声明完全覆盖旧值，不把死声明误报为风险。
    const superseded = declarations
      .slice(index + 1)
      .some(
        (later) =>
          !later.features.size &&
          later.decl.prop === decl.prop &&
          !!later.decl.important === !!decl.important &&
          later.decl.parent.type === "rule" &&
          later.decl.parent.selector === decl.parent.selector &&
          later.scopes.length === scopes.length &&
          later.scopes.every(
            (scope, i) =>
              scope.name === scopes[i].name &&
              normalize(scope.params) === normalize(scopes[i].params)
          )
      );
    if (superseded) continue;
    const guarded = guardedFeatures(scopes);
    // 自定义属性及含 var() 的声明会推迟验证，连续声明不能充当安全回退。
    if (
      (property.startsWith("--") || dynamic) &&
      [...features].some((feature) => !guarded.has(feature))
    ) {
      report(decl, `${property}: 动态现代值缺少对应的肯定 @supports 守卫`);
    }
    const hasFallback = keys.every((key) =>
      (fallbacks.get(key) ?? []).some(
        (candidate) =>
          candidate.important === !!decl.important &&
          candidate.conditions.every((condition) => conditions.includes(condition))
      )
    );
    if (!hasFallback)
      report(decl, `${property}: ${[...features].join("/")} 缺少同选择器、同条件范围的前置回退`);
  }
  return { errors, warnings: [...warningSet], declarations: declarations.length };
}
