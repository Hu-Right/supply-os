/**
 * 法律声明页面共享渲染组件
 * Legal Document Page — shared renderer
 *
 * @description 读取 public/legal/ 下的纯文本文件，按段落渲染为语义化 HTML。
 *              以数字开头的行视为章节标题（h2），其余为正文段落。
 *              自动过滤"法律依据与版本说明"及之后的内部参考内容。
 */
import fs from "node:fs";
import path from "node:path";

interface LegalPageProps {
  filename: string;
}

export function LegalPageContent({ filename }: LegalPageProps) {
  // 允许清单校验 + basename：filename 仅允许 legal 目录下的平铺 .txt 文档名
  const safeName = path.basename(filename);
  if (!/^[a-z0-9-]+\.txt$/.test(safeName)) {
    throw new Error(`非法的法律文档文件名: ${filename}`);
  }
  const filePath = path.join(process.cwd(), "public", "legal", safeName);
  const raw = fs.readFileSync(filePath, "utf-8");

  // 截断：去掉"法律依据与版本说明"之后的内部参考内容
  const cutoff = raw.indexOf("法律依据与版本说明");
  const text = cutoff > 0 ? raw.slice(0, cutoff).trimEnd() : raw;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 跳过内部标记行
    if (trimmed.startsWith("上线使用说明") || trimmed.startsWith("上线前必须核验") || trimmed.startsWith("上线前必须补齐")) continue;
    if (trimmed.startsWith("网站上线版") || trimmed.startsWith("内部技术实施文件") || trimmed.startsWith("网站正式规则")) continue;
    if (trimmed.startsWith("HYPERLINK")) continue;
    if (trimmed === "// This is the omitted part") continue;

    // 章节标题：以数字+点开头（如 "1." "3.1" "七、"）
    const isHeading = /^\d+[.、]/.test(trimmed) || /^[一二三四五六七八九十]+[、]/.test(trimmed);

    if (isHeading) {
      elements.push(
        <h2 key={key++} className="text-lg font-bold text-slate-900 mt-8 mb-3 pb-2 border-b border-slate-100">
          {trimmed}
        </h2>,
      );
    } else if (trimmed === "OS NEO SMART") {
      // 跳过顶部品牌名
      continue;
    } else if (/^(说明|核心规则摘要|适用说明|强制执行项)/.test(trimmed)) {
      // 特殊提示块
      elements.push(
        <div key={key++} className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800 my-4">
          {trimmed}
        </div>,
      );
    } else {
      elements.push(
        <p key={key++} className="mb-3">
          {trimmed}
        </p>,
      );
    }
  }

  return <>{elements}</>;
}
