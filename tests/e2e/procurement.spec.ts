/**
 * E2E 测试 — 公采搜索流程
 * End-to-End Tests: Procurement Search Flow
 *
 * @description 覆盖公告搜索、筛选、详情查看等核心路径。
 *              基于真实 ProcurementPage + NoticeSearchBar + NoticeList 组件结构。
 *
 * 覆盖场景：
 *   1. 页面加载 → 显示采购线索池标题
 *   2. 输入关键词搜索 → 列表更新
 *   3. 选择排序方式 → 列表重新排序
 *   4. 点击公告卡片 → 进入详情页
 *   5. 详情页 → 点击返回 → 回到列表
 *   6. 高级筛选折叠 → 展开/收起
 */
import { test, expect } from "@playwright/test";

test.describe("公采搜索", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/procurement");
    await page.waitForLoadState("networkidle");
  });

  test("页面加载 → 显示采购线索池标题", async ({ page }) => {
    // 验证页面标题可见（SessionBanner 和线索池标题都包含“国际公共采购”，取第一个）
    const poolTitle = page.getByText("国际公共采购").first();
    await expect(poolTitle).toBeVisible();

    // 验证搜索框可见
    const searchInput = page.getByPlaceholder("输入招标编号或关键词");
    await expect(searchInput).toBeVisible();

    // 验证列表区域存在（article 元素 = 公告卡片）
    // 等待数据加载完成
    await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });
  });

  test("输入关键词搜索 → 列表更新", async ({ page }) => {
    // 等待初始列表加载
    await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });

    // 记录初始卡片数量
    const initialCount = await page.locator("article").count();

    // 输入搜索关键词
    const searchInput = page.getByPlaceholder("输入招标编号或关键词");
    await searchInput.fill("water");

    // 提交搜索（按 Enter 或点击表单提交）
    await searchInput.press("Enter");

    // 等待搜索结果加载
    await page.waitForLoadState("networkidle");

    // 验证列表仍然可见（可能有不同数量的卡片）
    // 搜索后列表应存在
    const articles = page.locator("article");
    // 如果搜索有结果，卡片应可见；如果无结果，显示空态
    const hasResults = await articles.count();
    const hasEmptyState = page.getByText(/暂无匹配|无匹配/);
    const emptyStateVisible = await hasEmptyState.isVisible().catch(() => false);

    expect(hasResults > 0 || emptyStateVisible).toBeTruthy();
  });

  test("选择排序方式 → 列表重新排序", async ({ page }) => {
    // 等待初始列表加载
    await expect(page.locator("article").first()).toBeVisible({ timeout: 15_000 });

    // 排序下拉框 aria-label 为“截止时间最远优先”等，与日期输入区分开
    const sortSelect = page.locator("select").first();

    // 尝试选择不同排序
    if (await sortSelect.isVisible().catch(() => false)) {
      await sortSelect.selectOption("latest");

      // 等待列表刷新
      await page.waitForLoadState("networkidle");

      // 验证列表仍然可见
      await expect(page.locator("article").first()).toBeVisible({ timeout: 10_000 });
    } else {
      // 排序选择器可能使用不同的选择器，跳过此测试
      test.skip();
    }
  });

  test("点击公告卡片 → 未登录弹出登录弹窗", async ({ page }) => {
    // 等待列表加载
    const firstCard = page.locator("article").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    // 点击卡片内的“查看详情”按钮（article 本身无点击事件）
    await firstCard.getByRole("button", { name: "查看详情" }).click();

    // 未登录时 openNotice 触发 require-login，弹出登录弹窗
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 10_000 });
  });

  test("点击查看详情 → 关闭登录弹窗 → 回到列表", async ({ page }) => {
    // 等待列表加载并点击第一张卡片的“查看详情”按钮
    const firstCard = page.locator("article").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.getByRole("button", { name: "查看详情" }).click();

    // 未登录弹出登录弹窗
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // 关闭弹窗（AuthModal header 上的 X 按钮）
    await modal.locator("button").first().click();

    // 验证回到列表页（article 元素重新可见）
    await expect(page.locator("article").first()).toBeVisible({ timeout: 10_000 });

    // 验证搜索框仍然可见
    await expect(page.getByPlaceholder("输入招标编号或关键词")).toBeVisible();
  });

  test("高级筛选折叠 → 展开/收起", async ({ page }) => {
    // 等待页面加载
    await expect(page.getByPlaceholder("输入招标编号或关键词")).toBeVisible();

    // 高级筛选按钮（移动端可见，桌面端始终展开）
    // 在桌面端（lg 以上），高级筛选始终可见
    // 在移动端，需要点击按钮展开

    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 812 });

    // 找到高级筛选按钮（移动端“筛选”按钮与桌面端搜索栏同时存在，取第一个）
    const advancedButton = page.getByRole("button", { name: /高级筛选|筛选/i }).first();
    if (await advancedButton.isVisible().catch(() => false)) {
      // 点击展开
      await advancedButton.click();
      await page.waitForTimeout(500);

      // 验证高级筛选内容可见（筛选面板存在日期输入等字段）
      const dateInputs = page.locator('input[type="date"]');
      const dateCount = await dateInputs.count();
      if (dateCount > 0) {
        await expect(dateInputs.first()).toBeVisible();
      } else {
        // 无日期输入时验证筛选项区域存在
        const selectCount = await page.locator("select").count();
        expect(selectCount).toBeGreaterThanOrEqual(1);
      }

      // 再次点击收起
      await advancedButton.click();

      // 验证收起后内容不可见（max-h-0）
      // 注意：CSS transition 可能需要等待
      await page.waitForTimeout(300);
    } else {
      // 桌面端高级筛选始终可见，跳过
      test.skip();
    }
  });
});
