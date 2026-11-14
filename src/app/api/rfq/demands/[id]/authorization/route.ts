/**
 * /api/rfq/demands/[id]/authorization — 授权书签署与状态（七步流程第 4/5 步）
 *
 * @module app/api/rfq/demands/[id]/authorization/route
 * @description POST = 上传签字盖章扫描件 + 在线确认签署（一次动作完成）：身份/时间/IP/
 *              授权书内容哈希/扫描件哈希全部落 rfq_demand_authorization，状态 pending，
 *              由云境核验（→ verified/rejected，流程第 6 步）。GET = 当前版本授权书内容
 *              哈希与最新签署状态（打印页消费）。
 *              版本绑定：revisionNo 必须等于需求当前 revision_no，letterHash 必须与当前
 *              版本的授权书内容哈希一致——改稿重提后两者皆变，旧签署自动失效须重签。
 */
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INVALID_PARAMS,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_STATE_INVALID,
  EC_RFQ_VERSION_CONFLICT,
} from "@/shared/constants/api";
import { DEMAND_STATUS } from "@/shared/constants/rfq-demand";
import { AUTH_SCAN_URL_PREFIX, saveAuthScanFile } from "@/lib/services/file-upload";
import { computeLetterHash } from "@/lib/services/rfq/authorization-letter";
import type { RowDataPacket } from "mysql2/promise";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
/** 允许签署的需求状态：版本已冻结（提交后）到核验完成前 */
const SIGNABLE_STATUSES: readonly string[] = [DEMAND_STATUS.SUBMITTED, DEMAND_STATUS.UNDER_REVIEW];

interface DemandAuthRow extends RowDataPacket {
  id: number;
  buyer_user_id: number;
  status: string;
  revision_no: number;
  reference: string;
  title: string;
  buyer_org_name: string | null;
}

export const GET = withRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const demandId = Number(id);
  if (!Number.isFinite(demandId) || demandId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的需求 ID");
  }

  const pool = getPool();
  const [rows] = await pool.query("SELECT * FROM rfq_demand WHERE id = ? LIMIT 1", [demandId]);
  const row = (rows as DemandAuthRow[])[0];
  if (!row) routeError(404, EC_RFQ_NOT_FOUND, "需求不存在");
  if (Number(row.buyer_user_id) !== auth.userId) {
    routeError(403, EC_FORBIDDEN, "无权查看此需求的授权信息");
  }

  const letterHash = computeLetterHash({
    reference: String(row.reference ?? ""),
    revisionNo: Number(row.revision_no ?? 0),
    buyerOrgName: String(row.buyer_org_name ?? ""),
    projectTitle: String(row.title ?? ""),
  });

  const [recs] = await pool.query(
    `SELECT id, status, signer_name, signed_at, file_key, reject_reason
       FROM rfq_demand_authorization
      WHERE demand_id = ? AND revision_no = ?
      ORDER BY id DESC LIMIT 1`,
    [demandId, Number(row.revision_no ?? 0)],
  );
  const rec = (recs as RowDataPacket[])[0];

  /** 授权状态视图：打印页消费的最小集 */
  const authorizationStatusViewOf = (
    hash: string,
    revision: number,
    recRow: RowDataPacket | undefined,
  ) => ({
    letterHash: hash,
    revisionNo: revision,
    latest: recRow
      ? {
          id: Number(recRow.id),
          status: String(recRow.status),
          signerName: String(recRow.signer_name ?? ""),
          signedAt: Number(recRow.signed_at ?? 0),
          fileUrl: `${AUTH_SCAN_URL_PREFIX}/${String(recRow.file_key ?? "")}`,
          rejectReason: recRow.reject_reason == null ? null : String(recRow.reject_reason),
        }
      : null,
  });

  return NextResponse.json(
    authorizationStatusViewOf(letterHash, Number(row.revision_no ?? 0), rec),
  );
});

export const POST = withRoute<{ params: Promise<{ id: string }> }>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const demandId = Number(id);
  if (!Number.isFinite(demandId) || demandId <= 0) {
    routeError(400, EC_INVALID_PARAMS, "无效的需求 ID");
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    routeError(400, EC_INVALID_PARAMS, "请使用 multipart/form-data 格式上传");
  }
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const signerName = String(formData.get("signerName") || "").trim();
  const letterHash = String(formData.get("letterHash") || "").trim();
  const revisionNo = Number(formData.get("revisionNo") || 0);

  if (!file) routeError(400, EC_INVALID_PARAMS, "请上传签字盖章的扫描件");
  if (!ALLOWED_TYPES.includes(file.type)) {
    routeError(400, EC_INVALID_PARAMS, `仅支持 ${ALLOWED_TYPES.join(", ")} 格式`);
  }
  if (file.size > MAX_SIZE) routeError(400, EC_INVALID_PARAMS, "扫描件不能超过 10MB");
  if (!signerName || signerName.length > 128) {
    routeError(400, EC_INVALID_PARAMS, "请填写授权代表姓名（≤128 字）");
  }
  if (!/^[0-9a-f]{64}$/i.test(letterHash)) routeError(400, EC_INVALID_PARAMS, "授权书内容哈希缺失");

  const pool = getPool();
  const [rows] = await pool.query("SELECT * FROM rfq_demand WHERE id = ? LIMIT 1", [demandId]);
  const row = (rows as DemandAuthRow[])[0];
  if (!row) routeError(404, EC_RFQ_NOT_FOUND, "需求不存在");
  if (Number(row.buyer_user_id) !== auth.userId) {
    routeError(403, EC_FORBIDDEN, "无权签署此需求的授权书");
  }
  if (!SIGNABLE_STATUSES.includes(String(row.status))) {
    routeError(409, EC_RFQ_STATE_INVALID, "需求当前状态不可签署授权书（请先提交审核）");
  }
  // 版本绑定：需求改稿重提后 revision_no 已变，携带旧版本/旧哈希的签署一律拒绝
  if (revisionNo !== Number(row.revision_no ?? 0)) {
    routeError(409, EC_RFQ_VERSION_CONFLICT, "需求版本已变化，请重新打开授权书页面下载并签署最新版");
  }
  const expectedHash = computeLetterHash({
    reference: String(row.reference ?? ""),
    revisionNo: Number(row.revision_no ?? 0),
    buyerOrgName: String(row.buyer_org_name ?? ""),
    projectTitle: String(row.title ?? ""),
  });
  if (letterHash.toLowerCase() !== expectedHash) {
    routeError(400, EC_INVALID_PARAMS, "授权书内容与当前版本不符，请重新打开授权书页面后再签署");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `auth_${demandId}_${auth.userId}_${Date.now()}.${ext}`;
  const { url } = await saveAuthScanFile({
    filename,
    buffer,
    contentType: file.type,
    uploadedBy: auth.userId,
  });

  const ip =
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("x-real-ip") || "";

  const [ins] = await pool.execute(
    `INSERT INTO rfq_demand_authorization
       (demand_id, revision_no, method, letter_hash, file_key, file_hash,
        signer_name, signer_uid, signed_at, confirm_ip, status, created_at, updated_at)
     VALUES (?, ?, 'upload_scan', ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [demandId, Number(row.revision_no ?? 0), letterHash.toLowerCase(), filename, fileHash,
     signerName, auth.userId, nowSec, ip, nowSec, nowSec],
  );

  /** 签署结果视图 */
  const authorizationCreatedViewOf = (id: number, fileUrl: string) => ({
    id,
    status: "pending" as const,
    fileUrl,
  });

  return NextResponse.json(
    authorizationCreatedViewOf(Number((ins as { insertId?: number }).insertId ?? 0), url),
  );
});
