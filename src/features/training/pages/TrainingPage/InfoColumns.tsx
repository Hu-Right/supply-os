/**
 * 课程安排 + 学员反馈 + 报名权益（三列布局）
 * @module features/training/pages/TrainingPage/InfoColumns
 */
import { Calendar, Clock, FileText, MapPin, CheckCircle2, Award } from "lucide-react";
import { ENROLLMENT_BENEFITS } from "./constants";

export function InfoColumns() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 课程安排 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold">3</span>
          课程安排
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: Calendar, label: "开课频次", value: "每月1期，滚动开课" },
            { icon: Clock, label: "时长", value: "2天线下集中研修（16课时）" },
            { icon: FileText, label: "交付物", value: "课件+模板+清单+案例库+工具包" },
            { icon: MapPin, label: "形式", value: "杭州线下为主，提供线上回放" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label}>
                <Icon className="w-5 h-5 text-teal-600 mb-1" />
                <p className="text-2xs font-bold text-slate-500">{item.label}</p>
                <p className="text-xs font-bold text-slate-800">{item.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 学员反馈/案例成果 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold">4</span>
          学员反馈 / 案例成果
        </h3>
        <div className="space-y-3">
          {[
            "通过课程掌握了UN平台规则与投标方法，成功入驻UNGM平台。",
            "课程中的标书模板和拆标方法非常实用，3周内完成首套标书。",
            "在老师指导下锁定目标订单，已进入投标评估阶段。",
          ].map((fb, i) => (
            <div key={i} className="text-xs text-slate-600 border-l-2 border-teal-400 pl-3 py-1">
              &ldquo;{fb}&rdquo;
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "完成平台入驻", sub: "UNGM注册成功" },
            { label: "建立投标资料包", sub: "形成标准资料体系" },
            { label: "锁定目标订单", sub: "进入投标评估环节" },
          ].map((r) => (
            <div key={r.label}>
              <p className="text-xs font-extrabold text-teal-700">{r.label}</p>
              <p className="text-2xs text-slate-400">{r.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 报名权益（深色侧栏） */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 text-white">
        <h3 className="text-base font-extrabold mb-4 flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-400" /> 报名权益
        </h3>
        <ul className="space-y-2.5 mb-5">
          {ENROLLMENT_BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2 text-xs text-slate-200">
              <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              {b}
            </li>
          ))}
        </ul>
        <button className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-bold text-sm transition-colors mb-2">
          立即报名
        </button>
        <button className="w-full bg-white/10 hover:bg-white/20 text-white py-2.5 rounded-xl text-xs font-bold transition-colors">
          咨询顾问了解详情
        </button>
      </div>
    </div>
  );
}
