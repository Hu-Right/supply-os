/**
 * 期次选择与人数管理
 * @module features/training/hooks/useTrainingSchedule
 */
import { useMemo, useState } from "react";
import type { LandingCourse, LandingSchedule } from "../api";

export function useTrainingSchedule(
  schedules: LandingSchedule[],
  course: LandingCourse | null,
  defaultScheduleId?: number | null,
) {
  const openSchedules = useMemo(() => schedules.filter((s) => s.status === "open"), [schedules]);

  const initialScheduleId = useMemo(() => {
    if (defaultScheduleId) return defaultScheduleId;
    if (openSchedules.length === 0) return null;
    return openSchedules[0].id;
  }, [defaultScheduleId, openSchedules]);

  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(initialScheduleId);
  const [participantCount, setParticipantCount] = useState(1);

  const unitPrice = course?.unit_price ?? 0;
  const totalAmount = Math.round(unitPrice * participantCount * 100) / 100;

  const hasMultipleSchedules = openSchedules.length > 1;
  const scheduleSelected = !hasMultipleSchedules || selectedScheduleId !== null;
  const selectedSchedule = schedules.find((s) => s.id === selectedScheduleId) ?? null;

  return {
    openSchedules,
    selectedScheduleId,
    setSelectedScheduleId,
    participantCount,
    setParticipantCount,
    totalAmount,
    hasMultipleSchedules,
    scheduleSelected,
    selectedSchedule,
  };
}
