/**
 * 数据库连接配置校验（zod schema）
 *
 * @module lib/db/db-config
 * @description env 派生的连接配置在建池前经 zod 运行时校验：非法配置 fail-fast，
 *              同时确保进入连接池的每个字段都通过了字符集/范围约束。
 */
import { z } from "zod";

export const DbConfigSchema = z.object({
  host: z
    .string()
    .regex(/^([a-zA-Z0-9.-]+|\[[0-9a-fA-F:]+\])$/, "非法数据库主机"),
  port: z.number().int().min(1).max(65535),
  user: z.string().regex(/^[a-zA-Z0-9_.-]*$/, "非法数据库用户名"),
  password: z.string().regex(/^[^;`\\]*$/, "数据库密码含非法字符（; ` \\）"),
  database: z.string().regex(/^[a-zA-Z0-9_.-]*$/, "非法数据库名"),
});

export type DbConfig = z.infer<typeof DbConfigSchema>;

/** 校验数据库连接配置，非法即 throw（zod ZodError，附中文问题列表） */
export function assertValidDbConfig(cfg: DbConfigInput): DbConfig {
  return DbConfigSchema.parse(cfg);
}

export interface DbConfigInput {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}
