/**
 * 成功案例组件
 * Success Stories Component
 *
 * @module features/services/components/SuccessStories
 * @description 成功案例里程碑展示区
 *              Success stories milestone tracker section
 */

import type { SuccessStoryItem } from "../types";

export interface SuccessStoriesProps {
  stories: SuccessStoryItem[];
  title: string;
}

export function SuccessStories({ stories, title }: SuccessStoriesProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-white shadow-md">
      <h4 className="mb-3 text-sm font-bold text-teal-400">{title}</h4>
      <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
        {stories.map((story, idx) => (
          <div key={idx} className="rounded-xl bg-slate-800 p-4">
            <span className="font-mono font-bold text-teal-400">
              {story.date}
            </span>
            <p className="mt-1 font-bold text-slate-200">{story.title}</p>
            <p className="mt-1 select-none text-slate-400">
              {story.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

SuccessStories.displayName = "SuccessStories";
