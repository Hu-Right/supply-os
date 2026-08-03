/**
 * 公告详情骨架屏
 * Notice Detail Skeleton
 *
 * @module features/procurement/components/NoticeDetailSkeleton
 * @description 已解锁公告拓展详情加载中的占位结构（标签/来源链接/解锁详情面板），
 *              以骨架屏替代锁定面板避免闪烁。
 *              Placeholder structure shown while the unlocked extended details
 *              are loading, preventing a locked-panel flash.
 */

export function NoticeDetailSkeleton() {
  return (
    <div data-testid="detail-skeleton" className="space-y-5 animate-pulse">
      {/* 标签区占位（标题 + UNSPSC chips，与真实 chip 同款底色/边框） */}
      <div>
        <div className="h-5 w-24 bg-slate-200 rounded mb-2" />
        <div className="flex flex-wrap gap-2">
          {[56, 72, 64, 80, 60, 68].map((width, index) => (
            <div
              key={index}
              className="h-6 rounded-md border border-slate-200 bg-slate-50"
              style={{ width }}
            />
          ))}
        </div>
      </div>

      {/* 来源链接占位（text-sm 行高） */}
      <div className="h-5 w-40 bg-slate-200 rounded" />

      {/* 解锁详情面板占位（对齐 NoticeUnlockedDetails：teal-200 边框 + 章节结构） */}
      <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-4">
        {/* 面板标题：图标 + 文本 */}
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-teal-200/80" />
          <div className="h-4 w-32 bg-teal-100 rounded" />
        </div>

        {/* 元信息三列白卡（label + value） */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="bg-white border border-slate-100 rounded-lg p-3">
              <div className="h-3 w-16 bg-slate-200 rounded" />
              <div className="h-3.5 w-24 bg-slate-200 rounded mt-2" />
            </div>
          ))}
        </div>

        {/* 原始链接：小节标题 + 链接行 */}
        <div>
          <div className="h-3 w-20 bg-slate-200 rounded mb-2" />
          <div className="h-3.5 w-36 bg-slate-100 rounded" />
        </div>

        {/* 联系人：小节标题 + 白卡（姓名/邮箱/电话三行） */}
        <div>
          <div className="h-3 w-20 bg-slate-200 rounded mb-2" />
          <div className="space-y-2">
            {[0, 1].map((index) => (
              <div key={index} className="bg-white border border-slate-100 rounded-lg p-3 space-y-1.5">
                <div className="h-3.5 w-32 bg-slate-200 rounded" />
                <div className="h-3 w-48 max-w-full bg-slate-100 rounded" />
                <div className="h-3 w-28 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* 投标拆解框：图标标题 + 四行列表 */}
        <div className="rounded-lg border border-teal-100 bg-white p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-3.5 h-3.5 rounded bg-teal-100" />
            <div className="h-3.5 w-28 bg-slate-200 rounded" />
          </div>
          <div className="space-y-2 ps-4">
            <div className="h-3 w-full bg-slate-100 rounded" />
            <div className="h-3 w-11/12 bg-slate-100 rounded" />
            <div className="h-3 w-4/5 bg-slate-100 rounded" />
            <div className="h-3 w-2/3 bg-slate-100 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
