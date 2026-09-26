/**
 * 产品关键词组 API client（/api/user/keyword-groups，spec §4.2）
 * @module core/api/keywordGroups
 */
import { api } from "@/core/http";

export interface KeywordGroup {
  id: number;
  name: string;
  terms: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface Envelope<T> { code: number; message: string; data: T; }

export async function fetchKeywordGroups(): Promise<{ entitled: boolean; groups: KeywordGroup[] }> {
  const res = await api<Envelope<{ entitled: boolean; groups: KeywordGroup[] }>>("/api/user/keyword-groups");
  return res.data;
}

export async function createKeywordGroup(name: string, terms: string[]): Promise<{ id: number }> {
  // api() 第二参对 body 自动 JSON 序列化并补 Content-Type（api-client.ts:223/227），
  // 此处直接传对象，避免 JSON.stringify 双重序列化
  const res = await api<Envelope<{ id: number }>>("/api/user/keyword-groups", {
    method: "POST",
    body: { name, terms },
  });
  return res.data;
}

export async function updateKeywordGroup(
  id: number,
  patch: { name?: string; terms?: string[] },
): Promise<void> {
  await api(`/api/user/keyword-groups/${id}`, {
    method: "PATCH",
    body: patch,
  });
}

export async function deleteKeywordGroup(id: number): Promise<void> {
  await api(`/api/user/keyword-groups/${id}`, { method: "DELETE" });
}
