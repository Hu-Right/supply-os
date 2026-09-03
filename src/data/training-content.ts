/**
 * 研修班落地页静态配置（前端写死，配合六语言 i18n）
 * Training Landing Static Config
 *
 * @module data/training-content
 * @description 研修班落地页的静态内容统一前端写死：
 *              - 文案（常见问题 / 学员反馈 / 课堂分类 / 讲师头衔简介 / 团队姓名）
 *              在六语言翻译文件 src/core/i18n/locales 下各语言的 training.json
 *              （key 前缀 tlFaq* / tlTest* / tlGalCat* / tlIns* / tlRole* / tlTeam*）；
 *              - 纯结构配置（讲师/团队头像路径、课堂照片路径列表、单价兜底值）在本模块。
 *              图片文件本体位于 public/images/training/ 下，路径与文件一一对应；
 *              落地页不再从数据库读取以上任何内容（课程/期次仍走 DB 支撑支付）。
 */
import type { LocaleKey } from "@/core/i18n";

// ── 讲师（核心讲师大卡） ─────────────────────────────────────────────────────

export interface TrainingInstructor {
  id: number;
  /** 姓名 i18n key（tlInsNName） */
  nameKey: LocaleKey;
  /** 头衔 i18n key（tlInsNTitle） */
  titleKey: LocaleKey;
  /** 简介 i18n key（tlInsNBio） */
  bioKey: LocaleKey;
  /** 角色标签（指向 tlRole* 词汇表 key），渲染时 join 前置在简介前 */
  roleKeys: LocaleKey[];
  /** 头像路径（public 下静态文件） */
  avatarPath: string;
}

export const TRAINING_INSTRUCTORS: TrainingInstructor[] = [
  {
    id: 1,
    nameKey: "tlIns1Name",
    titleKey: "tlIns1Title",
    bioKey: "tlIns1Bio",
    roleKeys: ["tlRoleIntlExpert", "tlRoleLecturer"],
    avatarPath: "/images/training/instructors/葛云燕.png",
  },
  {
    id: 2,
    nameKey: "tlIns2Name",
    titleKey: "tlIns2Title",
    bioKey: "tlIns2Bio",
    roleKeys: ["tlRoleIntlExpert", "tlRoleLecturer"],
    avatarPath: "/images/training/instructors/白洁.png",
  },
  {
    id: 3,
    nameKey: "tlIns3Name",
    titleKey: "tlIns3Title",
    bioKey: "tlIns3Bio",
    roleKeys: ["tlRoleLecturer", "tlRoleConsultant", "tlRoleCoach"],
    avatarPath: "/images/training/instructors/Emma.png",
  },
  {
    id: 4,
    nameKey: "tlIns4Name",
    titleKey: "tlIns4Title",
    bioKey: "tlIns4Bio",
    roleKeys: ["tlRoleIntlExpert", "tlRoleConsultant", "tlRoleCoach"],
    avatarPath: "/images/training/instructors/安汉明.png",
  },
];

// ── 团队成员（小头像网格） ─────────────────────────────────────────────────────

export interface TrainingTeamMember {
  id: number;
  /** 姓名 i18n key（tlTeamNName） */
  nameKey: LocaleKey;
  /** 头像路径（public 下静态文件） */
  avatarPath: string;
}

export const TRAINING_TEAM: TrainingTeamMember[] = [
  { id: 1, nameKey: "tlTeam1Name", avatarPath: "/images/training/team/阿比.png" },
  { id: 2, nameKey: "tlTeam2Name", avatarPath: "/images/training/team/Birat.png" },
  { id: 3, nameKey: "tlTeam3Name", avatarPath: "/images/training/team/吉姆.png" },
  { id: 4, nameKey: "tlTeam4Name", avatarPath: "/images/training/team/Joseph.png" },
  { id: 5, nameKey: "tlTeam5Name", avatarPath: "/images/training/team/Elbek.png" },
  { id: 6, nameKey: "tlTeam6Name", avatarPath: "/images/training/team/Honey.png" },
  { id: 7, nameKey: "tlTeam7Name", avatarPath: "/images/training/team/诺兹.png" },
  { id: 8, nameKey: "tlTeam8Name", avatarPath: "/images/training/team/梅恩.png" },
];

// ── 往期课堂照片（分类文案走 i18n；图片路径静态列举） ──────────────────────────

export interface TrainingGalleryCategory {
  id: number;
  /** 分类名称 i18n key（tlGalCatNName） */
  nameKey: LocaleKey;
  /** 分类描述 i18n key（tlGalCatNDesc） */
  descKey: LocaleKey;
  /** 课堂照片路径列表（public 下静态文件，原 DB sort_order 序） */
  images: string[];
}

export const TRAINING_GALLERY_CATEGORIES: TrainingGalleryCategory[] = [
  {
    id: 1,
    nameKey: "tlGalCat1Name",
    descKey: "tlGalCat1Desc",
    images: [
      "/images/training/gallery/课堂讲解/DSC00906-opq4762511137.jpg",
      "/images/training/gallery/课堂讲解/DSC00938-opq4762511646.jpg",
      "/images/training/gallery/课堂讲解/DSC00985-opq4762493008.jpg",
      "/images/training/gallery/课堂讲解/DSC00990-opq4762513130.jpg",
      "/images/training/gallery/课堂讲解/DSC01018-opq4762513236.jpg",
      "/images/training/gallery/课堂讲解/DSC01033-opq4762532909.jpg",
      "/images/training/gallery/课堂讲解/DSC01077-opq4762495367.jpg",
      "/images/training/gallery/课堂讲解/DSC01140-opq4762496596.jpg",
      "/images/training/gallery/课堂讲解/DSC01147-opq4762516510.jpg",
      "/images/training/gallery/课堂讲解/DSC01226-opq4762479507.jpg",
      "/images/training/gallery/课堂讲解/DSC01235-opq4762497901.jpg",
      "/images/training/gallery/课堂讲解/DSC01344-opq4765060492.jpg",
      "/images/training/gallery/课堂讲解/DSC01345-opq4765041869.jpg",
      "/images/training/gallery/课堂讲解/DSC01399-opq4765006364.jpg",
      "/images/training/gallery/课堂讲解/DSC01477-opq4765027011.jpg",
      "/images/training/gallery/课堂讲解/DSC01482-opq4765064540.jpg",
      "/images/training/gallery/课堂讲解/DSC01559-opq4765234753.jpg",
      "/images/training/gallery/课堂讲解/FJ4A3619.JPG",
      "/images/training/gallery/课堂讲解/FJ4A3663.JPG",
      "/images/training/gallery/课堂讲解/FJ4A3715.JPG",
      "/images/training/gallery/课堂讲解/FJ4A3724.JPG",
      "/images/training/gallery/课堂讲解/FJ4A3726.JPG",
      "/images/training/gallery/课堂讲解/FJ4A3732.JPG",
      "/images/training/gallery/课堂讲解/FJ4A3781.JPG",
      "/images/training/gallery/课堂讲解/FJ4A3892.JPG",
      "/images/training/gallery/课堂讲解/FJ4A4013.JPG",
      "/images/training/gallery/课堂讲解/FJ4A4115.JPG",
    ],
  },
  {
    id: 2,
    nameKey: "tlGalCat2Name",
    descKey: "tlGalCat2Desc",
    images: [],
  },
  {
    id: 3,
    nameKey: "tlGalCat3Name",
    descKey: "tlGalCat3Desc",
    images: [
      "/images/training/gallery/学员交流/DSC01044-opq4762533384.jpg",
      "/images/training/gallery/学员交流/DSC01061-opq4762476911.jpg",
      "/images/training/gallery/学员交流/DSC01082-opq4762457354.jpg",
      "/images/training/gallery/学员交流/DSC01357-opq4765042350.jpg",
      "/images/training/gallery/学员交流/DSC01372-opq4765005328.jpg",
      "/images/training/gallery/学员交流/DSC01382-opq4765024522.jpg",
      "/images/training/gallery/学员交流/DSC01529-opq4765046633.jpg",
      "/images/training/gallery/学员交流/DSC01554-opq4765065996.jpg",
      "/images/training/gallery/学员交流/DSC01577-opq4765178410.jpg",
      "/images/training/gallery/学员交流/FJ4A3747.JPG",
      "/images/training/gallery/学员交流/FJ4A3752.JPG",
      "/images/training/gallery/学员交流/FJ4A3797.JPG",
      "/images/training/gallery/学员交流/FJ4A3825.JPG",
      "/images/training/gallery/学员交流/FJ4A3860.JPG",
      "/images/training/gallery/学员交流/FJ4A3947.JPG",
      "/images/training/gallery/学员交流/FJ4A4043.JPG",
    ],
  },
  {
    id: 4,
    nameKey: "tlGalCat4Name",
    descKey: "tlGalCat4Desc",
    images: [
      "/images/training/gallery/课后答疑/DSC01257-opq4762560116.jpg",
      "/images/training/gallery/课后答疑/DSC01327-opq4762747435.jpg",
      "/images/training/gallery/课后答疑/DSC01347-opq4765060868.jpg",
      "/images/training/gallery/课后答疑/DSC01388-opq4765005964.jpg",
      "/images/training/gallery/课后答疑/FJ4A4099.JPG",
      "/images/training/gallery/课后答疑/FJ4A4244.JPG",
      "/images/training/gallery/课后答疑/FJ4A4251.JPG",
      "/images/training/gallery/课后答疑/FJ4A4264.JPG",
      "/images/training/gallery/课后答疑/FJ4A4308.JPG",
      "/images/training/gallery/课后答疑/FJ4A4358.JPG",
      "/images/training/gallery/课后答疑/FJ4A4381.JPG",
      "/images/training/gallery/课后答疑/FJ4A4477.JPG",
      "/images/training/gallery/课后答疑/FJ4A4497.JPG",
      "/images/training/gallery/课后答疑/FJ4A4656.JPG",
    ],
  },
];

// ── 其他 ─────────────────────────────────────────────────────────────────────

/** 课程单价兜底值（DB 无 active 课程时参训方式 A 卡显示用） */
export const TRAINING_FALLBACK_UNIT_PRICE = 2800;
