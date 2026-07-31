/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";

export function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

