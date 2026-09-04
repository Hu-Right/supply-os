/**
 * 用户 ID 访问 Hook
 * useUserId Hook
 *
 * @module core/auth/useUserId
 * @description 收拢前端散落的 authUser?.id 访问，提供统一的身份标识入口。
 *              未登录时返回 null，避免消费方重复写可选链。
 */
import { useAuth } from "./AuthContext";

/** 当前登录用户的内部 ID；未登录返回 undefined */
export function useUserId(): number | undefined {
  const { authUser } = useAuth();
  return authUser?.id;
}
