/**
 * 讲师阵容网格
 * @module features/training/pages/TrainingPage/Instructors
 */
import { Users } from "lucide-react";
import { INSTRUCTORS } from "./constants";

export function Instructors() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold">2</span>
        讲师阵容
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {INSTRUCTORS.map((inst) => (
          <div key={inst.title} className="text-center border border-slate-100 rounded-lg p-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 mx-auto mb-2 flex items-center justify-center">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-xs font-extrabold text-slate-900 mb-1">{inst.title}</p>
            <p className="text-2xs text-slate-500 leading-relaxed">{inst.exp}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
