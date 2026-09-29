/**
 * 产品关键词组 API client（/api/user/keyword-groups，spec §4.2）
 * @module core/api/keywordGroups
 * @description 读走 apiCached（TTL + 飞行中去重）：搜索面板「我的词组」下拉此前每次
 *              点开都直连一次全量查询（服务端权益门控 + 列表共 4 次串行往返），
 *              缓存后二次/并发点开零网络。词组是**用户私有**数据而缓存键只有 URL，
 *              故写后必须失效、换账号必须由调用方主动失效（见 invalidateKeywordGroups）。
 */
import { api, apiCached, clearApiCache } from "@/core/http";
import { CACHE_TTL_STANDARD_MS } from "@/shared/constants/time";

export interface KeywordGroup {
  id: number;
  name: string;
  terms: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface Envelope<T> { code: number; message: string; data: T; }

/** 唯一端点常量：缓存键与失效前缀同源，避免字面量散落导致漏失效 */
const ENDPOINT = "/api/user/keyword-groups";

/**
 * 跨标签页失效水位键：只存时间戳，不存任何业务数据。
 * apiCached 的缓存是模块级 Map = **每个标签页各一份**，只在写接口里 clearApiCache
 * 只能清掉发起写的那个标签页，对端标签页会继续脏读到 TTL 过期。
 * 浏览器原生保证 storage 事件不在源标签页自触，故接收端不需再广播，无回环风险。
 */
const CROSS_TAB_KEY = "supply-os:kw-groups:invalidated-at";

/**
 * 失效「我的词组」读缓存（仅本标签页）。
 * 三个写接口内部自动调用并跨标签页广播；跨账号切换时由持有 userId 的调用方
 * 显式调用（与 useNoticeSearch 清 /api/notices 同一口径）。
 */
export function invalidateKeywordGroups(): void {
  clearApiCache(ENDPOINT);
}

/** 写成功后：清本标签页缓存，并敲水位键通知其他标签页 */
function invalidateAcrossTabs(): void {
  invalidateKeywordGroups();
  try {
    window.localStorage.setItem(CROSS_TAB_KEY, String(Date.now()));
  } catch {
    // 隐私模式 / 配额满：退化为本标签页失效，其他标签页最长脏到 TTL 自然过期
  }
}

if (typeof window !== "undefined") {
  // 与 api-client 的跨标签页 Token 同步同一机制
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === CROSS_TAB_KEY) invalidateKeywordGroups();
  });
}

/**
 * 读取我的词组（含档位标记；无权益返回空数组不报错）。
 * @param force 跳过缓存直取（管理页写后 reload 无需传，写接口已自动失效）
 */
export async function fetchKeywordGroups(
  force = false,
): Promise<{ entitled: boolean; groups: KeywordGroup[] }> {
  // 信封在本模块唯一处解包：漏读 .data 会让下拉恒空（历史踩坑，测试已钉死）
  const res = await apiCached<Envelope<{ entitled: boolean; groups: KeywordGroup[] }>>(
    ENDPOINT,
    CACHE_TTL_STANDARD_MS,
    undefined,
    force,
  );
  return res.data;
}

export async function createKeywordGroup(name: string, terms: string[]): Promise<{ id: number }> {
  // api() 第二参对 body 自动 JSON 序列化并补 Content-Type（api-client.ts:223/227），
  // 此处直接传对象，避免 JSON.stringify 双重序列化
  const res = await api<Envelope<{ id: number }>>(ENDPOINT, {
    method: "POST",
    body: { name, terms },
  });
  invalidateAcrossTabs();
  return res.data;
}

export async function updateKeywordGroup(
  id: number,
  patch: { name?: string; terms?: string[] },
): Promise<void> {
  await api(`${ENDPOINT}/${id}`, { method: "PATCH", body: patch });
  invalidateAcrossTabs();
}

export async function deleteKeywordGroup(id: number): Promise<void> {
  await api(`${ENDPOINT}/${id}`, { method: "DELETE" });
  invalidateAcrossTabs();
}
