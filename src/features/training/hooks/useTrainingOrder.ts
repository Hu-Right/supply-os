/**
 * 培训订单创建与支付回调适配
 * @module features/training/hooks/useTrainingOrder
 */
import { useCallback } from "react";
import {
  createTrainingOrder,
  fetchTrainingOrderStatus,
  mockPayTrainingOrder,
  saveTrainingParticipants,
  type LandingCourse,
  type TrainingParticipant,
} from "../api";

export function useTrainingOrder(
  course: LandingCourse | null,
  selectedScheduleId: number | null,
  registrationId: number | null | undefined,
  participantCount: number,
  pendingParticipants: TrainingParticipant[] | null,
  onClose: () => void,
) {
  const handleCreateOrder = useCallback(
    async (provider: "alipay" | "wechat") => {
      if (!course) throw new Error("COURSE_NOT_FOUND");
      const result = await createTrainingOrder({
        course_id: course.id,
        schedule_id: selectedScheduleId ?? null,
        registration_id: registrationId ?? null,
        participant_count: participantCount,
        provider,
      });
      return {
        order_no: result.order_no,
        provider: result.provider,
        qr_code: result.qr_code,
        pay_url: result.pay_url,
      };
    },
    [course, selectedScheduleId, registrationId, participantCount],
  );

  const handleQueryStatus = useCallback(
    (orderNo: string) => fetchTrainingOrderStatus(orderNo),
    [],
  );

  const handleMockConfirm = useCallback(
    async (orderNo: string) => { await mockPayTrainingOrder(orderNo); },
    [],
  );

  // 支付成功：先展示成功 UI，再异步保存学员信息
  const handlePaymentSuccess = useCallback(
    (orderNo: string) => {
      if (pendingParticipants) {
        saveTrainingParticipants(orderNo, pendingParticipants)
          .then(() => console.log(`[TrainingPayment] 学员信息已保存 (order: ${orderNo})`))
          .catch((err) => console.error(`[TrainingPayment] 学员信息保存失败 (order: ${orderNo}):`, err));
      }
      setTimeout(onClose, 2000);
    },
    [pendingParticipants, onClose],
  );

  return { handleCreateOrder, handleQueryStatus, handleMockConfirm, handlePaymentSuccess };
}
