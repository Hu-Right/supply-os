/**
 * 课程模块网格
 * @module features/training/pages/TrainingPage/CourseModules
 */
import { COURSE_MODULES } from "./constants";

export function CourseModules() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold">1</span>
        课程模块
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {COURSE_MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <div key={mod.num} className="border border-slate-100 rounded-lg p-3 hover:border-teal-200 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xs font-bold text-teal-600">{mod.num}.</span>
                <Icon className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-extrabold text-slate-900">{mod.title}</span>
              </div>
              <p className="text-2xs text-slate-500 leading-relaxed">{mod.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
