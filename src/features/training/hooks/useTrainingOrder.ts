/**
 * 培训订单创建与支付回调适配
 * @module features/training/hooks/useTrainingOrder
 *
 * 2026-11-13 收敛：学员名单在报名阶段已落库，本 hook 不再承担「支付成功后补写学员」的职责。
 * 下单时只回传 registration_ids，人数与期次由服务端按报名行校验。
 */
import { useCallback } from "react";
import {
  createTrainingOrder,
  fetchTrainingOrderStatus,
  mockPayTrainingOrder,
  type LandingCourse,
} from "../api";

export function useTrainingOrder(
  course: LandingCourse | null,
  selectedScheduleId: number | null,
  registrationIds: number[] | null,
  onClose: () => void,
) {
  const handleCreateOrder = useCallback(
    async (provider: "alipay" | "wechat") => {
      if (!course) throw new Error("COURSE_NOT_FOUND");
      if (!registrationIds || registrationIds.length === 0) {
        throw new Error("REGISTRATION_REQUIRED");
      }
      const result = await createTrainingOrder({
        course_id: course.id,
        schedule_id: selectedScheduleId,
        registration_ids: registrationIds,
        provider,
      });
      // 建单响应体与弹窗订单形状同名同形（都是 camelCase 契约），直接透传，
      // 弹窗只读 orderNo / provider / qrCodeUrl / payUrl 四个字段。
      return result;
    },
    [course, selectedScheduleId, registrationIds],
  );

  const handleQueryStatus = useCallback(
    (orderNo: string) => fetchTrainingOrderStatus(orderNo),
    [],
  );

  const handleMockConfirm = useCallback(
    async (orderNo: string) => { await mockPayTrainingOrder(orderNo); },
    [],
  );

  // 支付成功：名单早在报名阶段已写入，这里只负责展示成功态并关闭弹窗
  const handlePaymentSuccess = useCallback(
    (_orderNo: string) => { setTimeout(onClose, 2000); },
    [onClose],
  );

  return { handleCreateOrder, handleQueryStatus, handleMockConfirm, handlePaymentSuccess };
}
