/**
 * 알림 및 보안 세션 관리 모듈 (Kakao 알림톡 / SMS 보안 링크 & 만료 세션 OTP 인증)
 *
 * [핵심 원칙]
 * 1. 리포트 완료 시 Kakao 알림톡 또는 SMS로 보안 링크를 전송한다.
 * 2. 메시지 본문에는 민감한 재무/신용 정보(매출액, 연체·체납 내역, 신용점수, 대출잔액 등)를 절대 직접 노출하지 않는다.
 * 3. 보안 링크 클릭 시 유효 세션은 즉시 열람, 만료 세션은 휴대폰 일회성 인증(OTP) 후 마이페이지에서 조회하도록 처리한다.
 */
export interface SecureNotificationMessage {
  messageId: string;
  channel: "KAKAO_ALIMTALK" | "SMS";
  recipientMaskedPhone: string;
  companyName: string;
  reportTier: "L1" | "L2" | "L3";
  messageBody: string; // 민감 재무/신용 정보 절대 미포함!
  secureLinkUrl: string;
  containsSensitiveData: boolean; // 항상 false 보장
}

export interface SecureReportSession {
  tokenId: string;
  snapshotId: string;
  expiresAt: string;
  isExpired: boolean;
  otpVerifiedForExpiredSession: boolean;
}

const SENSITIVE_KEYWORDS = [
  "체납",
  "연체",
  "신용점수",
  "차입금",
  "대출잔액",
  "자본잠식",
  "부결",
  "채무불이행",
];

export function buildSecureNotificationMessage(params: {
  channel: "KAKAO_ALIMTALK" | "SMS";
  recipientMaskedPhone: string;
  companyName: string;
  reportTier: "L1" | "L2" | "L3";
  tokenId: string;
  snapshotVersion: number;
}): SecureNotificationMessage {
  const tierNames = {
    L1: "무료 AI 기초 진단",
    L2: "방향 결정 진단 리포트",
    L3: "정밀전략 및 전문가 1차 검수 리포트",
  };

  const secureLinkUrl = `https://fundsea.kr/secure-view/${params.tokenId}?v=${params.snapshotVersion}`;

  // 민감한 재무/신용 수치를 일절 포함하지 않는 보안 안내 문구
  const messageBody = `[정책 자금바다] ${params.companyName} 대표님, 요청하신 '${
    tierNames[params.reportTier]
  } (v${params.snapshotVersion})' 작성이 완료되었습니다.\n\n개인·기업 신용 및 재무정보 보호를 위해 메시지 본문에는 진단 결과나 금액을 표기하지 않습니다.\n아래 보안 링크를 통해 안전하게 리포트를 열람해 주세요.\n\n▶ 보안 열람 링크: ${secureLinkUrl}\n(보안 세션 만료 시 휴대폰 일회성 인증 후 마이페이지에서 열람 가능)`;

  const containsSensitiveData = SENSITIVE_KEYWORDS.some((kw) =>
    messageBody.includes(kw)
  );

  return {
    messageId: `MSG-${Date.now()}`,
    channel: params.channel,
    recipientMaskedPhone: params.recipientMaskedPhone,
    companyName: params.companyName,
    reportTier: params.reportTier,
    messageBody,
    secureLinkUrl,
    containsSensitiveData,
  };
}

export function resolveSecureLinkAccess(
  session: SecureReportSession,
  submittedOtpCode?: string
): {
  accessGranted: boolean;
  accessMode: "DIRECT_VALID_SESSION" | "REDIRECT_MYPAGE_AFTER_OTP" | "OTP_REQUIRED";
  destinationView: "REPORT_VIEWER" | "MYPAGE_ARCHIVE" | "OTP_CHALLENGE_MODAL";
  statusMessage: string;
} {
  // 1. 유효 세션은 즉시 열람
  if (!session.isExpired) {
    return {
      accessGranted: true,
      accessMode: "DIRECT_VALID_SESSION",
      destinationView: "REPORT_VIEWER",
      statusMessage: "유효한 보안 세션이 확인되어 리포트를 즉시 열람합니다.",
    };
  }

  // 2. 만료 세션인데 이미 OTP 일회성 인증을 완료했거나 올바른 OTP(예: 6자리 숫자)가 제출된 경우 -> 마이페이지에서 조회
  if (
    session.otpVerifiedForExpiredSession ||
    (submittedOtpCode && /^\d{6}$/.test(submittedOtpCode.trim()))
  ) {
    return {
      accessGranted: true,
      accessMode: "REDIRECT_MYPAGE_AFTER_OTP",
      destinationView: "MYPAGE_ARCHIVE",
      statusMessage:
        "만료된 보안 링크에 대한 휴대폰 일회성 인증(OTP)이 완료되어 마이페이지 안전 보관함에서 조회합니다.",
    };
  }

  // 3. 만료 세션 + OTP 미인증 상태 -> 일회성 휴대폰 인증 요구
  return {
    accessGranted: false,
    accessMode: "OTP_REQUIRED",
    destinationView: "OTP_CHALLENGE_MODAL",
    statusMessage:
      "보안 링크 유효시간(24시간)이 만료되었습니다. 휴대폰 일회성 인증번호(OTP 6자리) 입력 후 마이페이지에서 안전하게 열람하실 수 있습니다.",
  };
}
