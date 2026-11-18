import type { Metadata } from "next";
import PageClient from "./page-client";

export const metadata: Metadata = {
  title: "个人信息",
  description: "管理您的昵称、手机/邮箱绑定、行业偏好与我的记录。",
};

export default function ProfileSettingsPage() {
  return <PageClient />;
}
