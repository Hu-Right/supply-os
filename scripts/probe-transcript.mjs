// 临时探测：会话历史里是否还有计划文档 C/D/E/F/G 章的完整内容（只读）
import fs from "node:fs";
const f = "C:\\Users\\YPKJ\\.qoder\\cache\\projects\\supply-os-a4f5a8f5\\conversation-history\\e72cd53d\\e72cd53d.jsonl";
if (!fs.existsSync(f)) {
  console.log("TRANSCRIPT_NOT_FOUND");
  process.exit(0);
}
const c = fs.readFileSync(f, "utf8");
console.log("FILE_SIZE=", c.length);
for (const probe of ["C.3.5", "E.4", "D.10 复验中被驳回", "F.6 六维度归位总表", "通俗版导读", "# C.", "# E.", "D.11 待决项优先级总览"]) {
  console.log(`HAS[${probe}]=`, c.includes(probe));
}
