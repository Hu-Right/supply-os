/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
export function safeJson<T = unknown>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  try {
    return JSON.parse(value as string) as T[];
  } catch {
    return [];
  }
}

export function preferValue<T, U>(primary: T | null | undefined, fallback: U): T | U {
  if (primary === null || primary === undefined || primary === "") return fallback;
  if (Array.isArray(primary) && primary.length === 0) return fallback;
  return primary;
}
