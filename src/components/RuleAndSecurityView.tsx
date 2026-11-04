"use client";

import React, { useState } from "react";
import { POLICY_RULES_DB } from "../domain/policy-rules-db";
import { DiagnosticSnapshot } from "../domain/schema";
import {
  buildSecureNotificationMessage,
  resolveSecureLinkAccess,
} from "../engines/security-notification";
import {
  Bell,
  CheckCircle2,
  Database,
  KeyRound,
  Lock,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

interface RuleAndSecurityViewProps {
  snapshot: DiagnosticSnapshot;
  companyName: string;
}

export function RuleAndSecurityView({
  snapshot,
  companyName,
}: RuleAndSecurityViewProps) {
  const [channel, setChannel] = useState<"KAKAO_ALIMTALK" | "SMS">("KAKAO_ALIMTALK");
  const [reportTier, setReportTier] = useState<"L1" | "L2" | "L3">("L3");
  const [sessionExpiredSim, setSessionExpiredSim] = useState<boolean>(false);
  const [otpInput, setOtpInput] = useState<string>("");
  const [otpVerified, setOtpVerified] = useState<boolean>(false);

  const notification = buildSecureNotificationMessage({
    channel,
    recipientMaskedPhone: "010-****-8291",
    companyName,
    reportTier,
    tokenId: "SEC-99281-A",
    snapshotVersion: snapshot.versionNumber,
  });

  const accessState = resolveSecureLinkAccess(
    {
      tokenId: "SEC-99281-A",
      snapshotId: snapshot.snapshotId,
      expiresAt: sessionExpiredSim ? "2026-11-01T00:00:00Z" : "2026-11-05T09:00:00Z",
      isExpired: sessionExpiredSim,
      otpVerifiedForExpiredSession: otpVerified,
    },
    otpVerified ? "482910" : undefined
  );

  const handleVerifyOtp = () => {
    if (/^\d{6}$/.test(otpInput.trim())) {
      setOtpVerified(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. 정책 룰 엔진 마스터 DB 현황 */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-sky-600" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                정책 룰 엔진 (Policy Rule Engine) 마스터 DB
              </h2>
              <p className="text-xs text-slate-500">
                중진공·소진공·기보·신보·지역신보·지자체 최신 공고 버전관리, 예산소진 상태 및 복수사업자 채무 분리 반영 룰
              </p>
            </div>
          </div>
          <span className="text-xs font-mono bg-slate-100 text-slate-700 px-3 py-1 rounded-full">
            스냅샷 기록 룰 수: {POLICY_RULES_DB.length}개 공고
          </span>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-2.5 px-3">기관 및 공고명</th>
                <th className="py-2.5 px-3">버전</th>
                <th className="py-2.5 px-3">예산 상태</th>
                <th className="py-2.5 px-3">기본/우대 한도</th>
                <th className="py-2.5 px-3">인정 우대항목 (Rule Matched 기준)</th>
                <th className="py-2.5 px-3">복수 사업자·관계법인 채무 분리 반영 룰</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {POLICY_RULES_DB.map((rule) => (
                <tr key={rule.ruleId} className="hover:bg-slate-50/80">
                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-900">{rule.institutionName}</div>
                    <div className="text-slate-600">{rule.programName}</div>
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-700">{rule.ruleVersion}</td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                        rule.budgetStatus === "OPEN"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {rule.budgetStatus === "OPEN" ? "접수중" : "예산소진임박"} (잔여{" "}
                      {rule.remainingBudgetRatioPct}%)
                    </span>
                  </td>
                  <td className="py-3 px-3 font-semibold text-slate-800">
                    {(rule.baseMaxLimitMkrw / 100).toFixed(1)}억 / 우대{" "}
                    {(rule.preferentialMaxLimitMkrw / 100).toFixed(1)}억
                    <div className="text-[11px] text-slate-500 font-normal">
                      {rule.indicativeRateRange}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex flex-wrap gap-1">
                      {rule.acceptedPreferences.map((ap) => (
                        <span
                          key={ap.type}
                          className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 text-[11px]"
                        >
                          {ap.type}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-slate-600 max-w-xs leading-relaxed">
                    {rule.exposureAggregationRule.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. 보안 알림(Kakao 알림톡 / SMS) 및 세션 만료 OTP 인증 시뮬레이터 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-500" />
              리포트 완료 알림톡 / SMS 보안 링크 발송기
            </h3>
            <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
              민감 재무·신용정보 본문 노출: 0건 (안전)
            </span>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setChannel("KAKAO_ALIMTALK")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                channel === "KAKAO_ALIMTALK"
                  ? "bg-amber-400 text-slate-950 border-amber-500"
                  : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              Kakao 알림톡
            </button>
            <button
              onClick={() => setChannel("SMS")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                channel === "SMS"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              안심 보안 SMS
            </button>
            {(["L1", "L2", "L3"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setReportTier(t)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${
                  reportTier === t
                    ? "bg-sky-600 text-white border-sky-600"
                    : "bg-white text-slate-600 border-slate-200"
                }`}
              >
                {t} 리포트
              </button>
            ))}
          </div>

          <div className="mt-4 p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs whitespace-pre-line leading-relaxed border border-slate-700">
            {notification.messageBody}
          </div>
          <div className="mt-3 text-[11px] text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            본문 내 매출액·체납·연체·신용점수·대출잔액 등 민감정보 포함 여부:{" "}
            <strong className="text-emerald-700">
              {notification.containsSensitiveData ? "검출됨(위험)" : "미포함(검증 통과)"}
            </strong>
          </div>
        </div>

        {/* 보안 링크 세션 검증 및 만료 세션 휴대폰 일회성 인증(OTP) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-600" />
              보안 링크 세션 관리 & 만료 세션 일회성 OTP 인증
            </h3>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-700">세션 상태 시뮬레이션:</span>
            <button
              onClick={() => {
                setSessionExpiredSim(false);
                setOtpVerified(false);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                !sessionExpiredSim
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              유효 세션 (24시간 이내)
            </button>
            <button
              onClick={() => {
                setSessionExpiredSim(true);
                setOtpVerified(false);
                setOtpInput("482910");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                sessionExpiredSim
                  ? "bg-rose-600 text-white border-rose-600"
                  : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              만료된 보안 세션 (24시간 경과)
            </button>
          </div>

          <div className="mt-4 p-4 rounded-xl border bg-slate-50 border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                접근 제어 결과 ({accessState.accessMode})
              </span>
              <span
                className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                  accessState.accessGranted
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {accessState.accessGranted ? "열람 허용" : "일회성 OTP 인증 필요"}
              </span>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              {accessState.statusMessage}
            </p>

            {sessionExpiredSim && !otpVerified && (
              <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  placeholder="6자리 인증번호 (예: 482910)"
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono w-44"
                />
                <button
                  onClick={handleVerifyOtp}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  휴대폰 일회성 인증 후 마이페이지 조회
                </button>
              </div>
            )}

            {sessionExpiredSim && otpVerified && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  휴대폰 일회성 인증 완료 → <strong>마이페이지 보안 보관함(MYPAGE_ARCHIVE)</strong>으로 안전하게 리다이렉트되었습니다.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
