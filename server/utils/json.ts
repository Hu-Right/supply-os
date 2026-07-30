/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
export function safeJson(value: any) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export function preferValue(primary: any, fallback: any) {
  if (primary === null || primary === undefined || primary === "") return fallback;
  if (Array.isArray(primary) && primary.length === 0) return fallback;
  return primary;
}
