/**
 * 管理运维 — 用户管理路由
 * Admin user management routes
 *
 * @module server/routes/admin/user-mgmt.routes
 * @description 管理员人工通道：帮用户重置密码/更换邮箱、邮件发送记录查询。
 */
import { Router } from "express";
import type { AppContext } from "../../context";
import { asyncHandler } from "../../middleware/errorHandler";
import { hashPassword } from "../../services/auth";
import { validatePassword } from "../../utils/passwordPolicy";
import { requireAdmin } from "./middleware";

export function createAdminUserMgmtRouter(ctx: AppContext): Router {
  const router = Router();

  // 管理员人工通道：帮用户重置密码
  router.post("/api/admin/users/:userKey/reset-password", requireAdmin, asyncHandler(async (req, res) => {
    const userKey = String(req.params.userKey || "").trim().toLowerCase();
    const newPassword = String(req.body.new_password || "");

    if (!userKey) {
      res.status(400).json({ success: false, message: "缺少 userKey 参数" });
      return;
    }
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
      res.status(400).json({ success: false, message: pwCheck.message });
      return;
    }

    const user = await ctx.admin.usersRepo.findByKey(userKey);
    if (!user) {
      res.status(404).json({ success: false, message: "用户不存在" });
      return;
    }

    const newHash = await hashPassword(newPassword);
    await ctx.admin.usersRepo.updatePassword(userKey, newHash, "bcrypt");

    res.json({
      success: true,
      message: `用户 ${userKey} 的密码已重置`,
      user_key: userKey,
    });
  }));

  // 管理员人工通道：帮用户更换邮箱
  router.post("/api/admin/users/:userKey/reset-email", requireAdmin, asyncHandler(async (req, res) => {
    const userKey = String(req.params.userKey || "").trim().toLowerCase();
    const newEmail = String(req.body.new_email || "").trim().toLowerCase();

    if (!userKey) {
      res.status(400).json({ success: false, message: "缺少 userKey 参数" });
      return;
    }
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      res.status(400).json({ success: false, message: "请输入有效的邮箱地址" });
      return;
    }

    const user = await ctx.admin.usersRepo.findByKey(userKey);
    if (!user) {
      res.status(404).json({ success: false, message: "用户不存在" });
      return;
    }

    const existingUser = await ctx.admin.usersRepo.findByKey(newEmail);
    if (existingUser) {
      res.status(409).json({ success: false, message: "该邮箱已被其他用户使用" });
      return;
    }

    // N6 收敛（2026-08-20）：邮箱更新经 UsersRepo 唯一端口
    await ctx.admin.usersRepo.updateUserEmail(userKey, newEmail);

    res.json({
      success: true,
      message: `用户邮箱已从 ${userKey} 更换为 ${newEmail}`,
      old_email: userKey,
      new_email: newEmail,
    });
  }));

  // 管理员查询：邮件发送记录
  router.get("/api/admin/email-logs", requireAdmin, asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit), 10) || 50, 1), 200);
    const failedOnly = String(req.query.failed_only ?? "false").toLowerCase() === "true";

    // N6 收敛（2026-08-20）：邮件日志查询经 AuthRepo 唯一端口
    const rows = await ctx.user.authRepo.listPasswordResets({ failedOnly, limit });

    res.json({
      success: true,
      count: (rows as any[]).length,
      logs: rows,
    });
  }));

  return router;
}
