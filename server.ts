/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 本地开发从 .env 读取环境变量（YOUDAO_APP_KEY 等）；无 .env 时静默跳过，
// 不影响 AI Studio 的运行时注入
import "dotenv/config";
import { startServer } from "./server/bootstrap";

startServer();
