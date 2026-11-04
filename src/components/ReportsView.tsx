"use client";

import React, { useState } from "react";
import { DiagnosticSnapshot } from "../domain/schema";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Layers,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

interface ReportsViewProps {
  snapshot: DiagnosticSnapshot;
  onJumpToNBQ?: () => void;
}

export function ReportsView({ snapshot, onJumpToNBQ }: ReportsViewProps) {
  const [selectedTier, setSelectedTier] = useState<"L1" | "L2" | "L3" | "L4">("L1");
  const { l1, l2, l3, l4 } = snapshot.reports;

  const badgeStyle =
    l1.headlineBadge === "검토 가능"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/40"
      : l1.headlineBadge === "추가 확인"
      ? "bg-amber-500/15 text-amber-300 border-amber-400/40"
      : "bg-rose-500/15 text-rose-300 border-rose-400/40";

  return (
    <div className="space-y-6">
      {/* L1 ~ L4 상품 체계 선택 탭 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
          {
            tier: "L1" as const,
            name: "L1 무료 AI 진단",
            price: "무료 (즉시 노출)",
            desc: "30초 내 핵심 결론 · 판단근거 · 다음 행동",
          },
          {
            tier: "L2" as const,
            name: "L2 방향 결정 진단",
            price: "19,000원 (영업일 1일)",
            desc: "1~3순위 후보기관 · 잠정 범위 · 분리여신 요약",
          },
          {
            tier: "L3" as const,
            name: "L3 정밀전략 리포트",
            price: "59,000원 (영업일 1~2일)",
            desc: "전문가 1차 검수표 · 1/2/대안 · D1~D5 로드맵",
          },
          {
            tier: "L4" as const,
            name: "L4 실행 컨설팅",
            price: "별도 계약 · 견적",
            desc: "기관 접수 · 사업계획 보완 · 현장실사 케어",
          },
        ].map((item) => {
          const active = selectedTier === item.tier;
          return (
            <button
              key={item.tier}
              onClick={() => setSelectedTier(item.tier)}
              className={`text-left p-4 rounded-xl border transition-all ${
                active
                  ? "bg-slate-900 text-white border-slate-900 shadow-md"
                  : "bg-white text-slate-800 border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    active
                      ? "bg-sky-500/20 text-sky-300"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {item.tier} 등급
                </span>
                <span
                  className={`text-xs font-semibold ${
                    active ? "text-amber-300" : "text-slate-500"
                  }`}
                >
                  {item.price}
                </span>
              </div>
              <div className="font-bold text-base mt-1">{item.name}</div>
              <div
                className={`text-xs mt-1 ${
                  active ? "text-slate-300" : "text-slate-500"
                }`}
              >
                {item.desc}
              </div>
            </button>
          );
        })}
      </div>

      {/* =================================================================== */}
      {/* L1 무료 AI 진단 뷰 (30초 내 첫 화면 핵심 결론, 정밀 금액 단정 금지) */}
      {/* =================================================================== */}
      {selectedTier === "L1" && (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-6 shadow-lg border border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-700/80">
              <div>
                <div className="text-xs uppercase tracking-wider text-sky-400 font-semibold">
                  L1 무료 AI 진단 · 30초 핵심 결론 (스냅샷 v{snapshot.versionNumber})
                </div>
                <h2 className="text-xl md:text-2xl font-bold mt-1">
                  {l1.headlineSummary}
                </h2>
              </div>
              <div
                className={`px-4 py-2 rounded-xl border text-base font-extrabold flex items-center gap-2 ${badgeStyle}`}
              >
                {l1.headlineBadge === "검토 가능" && <CheckCircle2 className="w-5 h-5" />}
                {l1.headlineBadge === "추가 확인" && <AlertTriangle className="w-5 h-5" />}
                {l1.headlineBadge === "현재 곤란" && <ShieldAlert className="w-5 h-5" />}
                판정 결론: {l1.headlineBadge}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {/* 판단 근거 */}
              <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700">
                <h3 className="text-sm font-bold text-sky-300 flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4" />
                  1. 선제적 제한게이트 및 판단 근거
                </h3>
                <ul className="space-y-2 text-xs text-slate-200 leading-relaxed">
                  {l1.judgmentGrounds.map((g, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-sky-400 font-bold">•</span>
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 유력 자금 방향 & 부족 자료 */}
              <div className="space-y-4">
                <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700">
                  <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4" />
                    2. 유력 자금 조달 방향 (L1 단계 정밀 금액 단정 배제)
                  </h3>
                  <ul className="space-y-1.5 text-xs text-slate-200">
                    {l1.promisingDirections.map((d, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold">→</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700">
                  <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4" />
                    3. 확인 및 보완이 필요한 부족 자료
                  </h3>
                  <ul className="space-y-1.5 text-xs text-slate-200">
                    {l1.missingDataList.map((m, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-amber-400 font-bold">•</span>
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* 다음 행동 지침 */}
            <div className="mt-5 bg-sky-950/60 border border-sky-700/50 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-sky-300 mb-1">
                  4. 다음 행동 지침 (Next Action Guide)
                </div>
                <ul className="space-y-1 text-xs text-slate-200">
                  {l1.nextActionGuide.map((act, idx) => (
                    <li key={idx}>• {act}</li>
                  ))}
                </ul>
              </div>
              {snapshot.nextBestQuestion && onJumpToNBQ && (
                <button
                  onClick={onJumpToNBQ}
                  className="shrink-0 px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition"
                >
                  최우선 질문(NBQ) 응답하러 가기 →
                </button>
              )}
            </div>

            {/* 확률 단정 금지 고지 */}
            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{l1.complianceNotice}</span>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* L2 19,000원 진단 (방향 결정: 1~3순위 후보기관, 잠정 조달 범위, 분리여신 요약) */}
      {/* =================================================================== */}
      {selectedTier === "L2" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200">
                  L2 방향 결정 리포트 · 19,000원 ({l2.slaText})
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-2">
                  추천 후보기관 1~3순위 및 잠정 조달 범위 분석
                </h2>
              </div>
              <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-right">
                <div className="text-[11px] text-slate-400">잠정 조달 금액 범위 (단정 금지)</div>
                <div className="text-sm font-bold text-emerald-400">
                  {l2.provisionalAmountRangeSummary}
                </div>
              </div>
            </div>

            {/* 핵심 재무 및 분리 여신 요약 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 my-5">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500">연간 매출액 / 상시근로자</div>
                <div className="text-sm font-bold text-slate-900 mt-1">
                  {l2.financialAndExposureSummary.revenueMkrw !== null
                    ? `${(l2.financialAndExposureSummary.revenueMkrw / 100).toFixed(1)}억 원`
                    : "미확인 (NBQ 대상)"}{" "}
                  /{" "}
                  {l2.financialAndExposureSummary.employeeCount !== null
                    ? `${l2.financialAndExposureSummary.employeeCount}명`
                    : "미확인"}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  업력 {l2.financialAndExposureSummary.businessAgeYears}년
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500">주사업체 직접 기대출</div>
                <div className="text-sm font-bold text-slate-900 mt-1">
                  {l2.financialAndExposureSummary.primaryExposureMkrw}백만 원
                </div>
                <div className="text-[11px] text-emerald-700 mt-0.5">
                  동일기관 한도 산정 시 우선 반영
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200">
                <div className="text-xs text-amber-800">
                  대표자 타 개인사업자 / 관계법인 채무
                </div>
                <div className="text-sm font-bold text-amber-950 mt-1">
                  타 개인 {l2.financialAndExposureSummary.otherSolePropExposureMkrw}백만 / 법인{" "}
                  {l2.financialAndExposureSummary.relatedCorpExposureMkrw}백만
                </div>
                <div className="text-[11px] text-amber-700 mt-0.5">
                  단순 합산 금지 · 기관별 룰에 따라 분리 반영
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500">주소지 및 법정 권역 분류</div>
                <div className="text-xs font-semibold text-slate-800 mt-1 leading-snug">
                  {l2.financialAndExposureSummary.regionalClassificationSummary}
                </div>
              </div>
            </div>

            {/* 1~3순위 추천 후보기관 카드 */}
            <div className="space-y-4">
              {l2.topCandidates.map((cand) => (
                <div
                  key={cand.ruleId}
                  className="rounded-xl border border-slate-200 p-5 hover:border-slate-300 transition bg-white"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-extrabold">
                        {cand.rank}순위 추천
                      </span>
                      <span className="font-bold text-slate-900 text-base">
                        {cand.institutionName} — {cand.programName}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                        룰 버전: {cand.ruleVersion}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500 mr-2">잠정 조달 범위:</span>
                      <span className="text-sm font-extrabold text-sky-700">
                        {cand.estimatedRangeText}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs">
                    <div>
                      <div className="font-bold text-slate-700 mb-1.5">
                        • 후보기관 선정 이유
                      </div>
                      <ul className="space-y-1 text-slate-600">
                        {cand.selectionReasons.map((r, i) => (
                          <li key={i}>- {r}</li>
                        ))}
                      </ul>
                      <div className="mt-2 p-2 rounded bg-slate-50 text-slate-600 border border-slate-200/80">
                        <strong className="text-slate-800">기대출 차감 규칙:</strong>{" "}
                        {cand.exposureDeductionNote}
                      </div>
                    </div>

                    <div>
                      <div className="font-bold text-emerald-700 mb-1.5">
                        • 실제 반영된 우대요인 (Applied: {cand.appliedPreferences.length}건)
                      </div>
                      {cand.appliedPreferences.length === 0 ? (
                        <div className="text-slate-400">
                          현재 공고에서 실제 반영(Applied)된 우대요인 없음
                        </div>
                      ) : (
                        <ul className="space-y-1.5">
                          {cand.appliedPreferences.map((ap, i) => (
                            <li
                              key={i}
                              className="p-2 rounded bg-emerald-50/70 border border-emerald-200 text-emerald-900"
                            >
                              <div className="font-bold">
                                [{ap.state}] {ap.label}
                              </div>
                              <div className="text-[11px] text-emerald-700 mt-0.5">
                                {ap.benefitEffect}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <div className="font-bold text-amber-700 mb-1.5">
                        • 오가산 방지 미반영 항목 및 보완 서류
                      </div>
                      {cand.unappliedPreferences.map((up, i) => (
                        <div
                          key={i}
                          className="p-2 rounded bg-amber-50/70 border border-amber-200 text-amber-900 mb-1.5"
                        >
                          <div className="font-semibold">
                            [{up.state}] {up.label}
                          </div>
                          <div className="text-[11px] text-amber-800 mt-0.5">
                            사유: {up.reasonWhyNotApplied}
                          </div>
                        </div>
                      ))}
                      <div className="text-slate-600 mt-2">
                        <strong className="text-slate-800">필수 준비 서류:</strong>{" "}
                        {cand.requiredMissingDocs.join(", ")}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* L3 59,000원 정밀전략 (전문가 1차 검수표 + 1/2/대안 포트폴리오 + D1~D5 행동목록) */}
      {/* =================================================================== */}
      {selectedTier === "L3" && (
        <div className="space-y-6">
          {/* 전문가 1차 검수표 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <ClipboardCheck className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs font-bold text-indigo-700">
                    L3 정밀전략 리포트 · 59,000원 ({l3.slaText})
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">
                    AI 정밀분석 + 전문가 1차 검수표 (Human-in-the-Loop QA)
                  </h2>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  l3.expertReviewTable.verificationStatus === "검수 완료"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                전문가 검수 상태: {l3.expertReviewTable.verificationStatus}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <div className="text-slate-500">담당 검수 위원</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {l3.expertReviewTable.reviewerName}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {l3.expertReviewTable.reviewerQualification}
                </div>
              </div>
              <div>
                <div className="text-slate-500">검수 완료 일시</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {l3.expertReviewTable.reviewedAt}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  적용 스냅샷: {snapshot.snapshotId}
                </div>
              </div>
              <div>
                <div className="text-slate-500">주요 검수 및 보정 내역</div>
                <ul className="space-y-1 text-slate-700 mt-1">
                  {l3.expertReviewTable.revisionNotes.map((note, idx) => (
                    <li key={idx}>• {note}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 1안 / 2안 / 대안 시나리오 포트폴리오 */}
            <h3 className="text-base font-bold text-slate-900 mt-6 mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              맞춤형 조달 시나리오 포트폴리오 (1안 / 2안 / 대안)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border-2 border-indigo-600 bg-indigo-50/20">
                <div className="text-xs font-extrabold text-indigo-700 uppercase">
                  PLAN A · 최우선 주력 시나리오
                </div>
                <div className="font-bold text-slate-900 text-sm mt-1">
                  {l3.scenarioPortfolio.planA.title}
                </div>
                <div className="text-xs font-semibold text-indigo-800 mt-1">
                  잠정 범위: {l3.scenarioPortfolio.planA.expectedRange}
                </div>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  <strong>특징:</strong> {l3.scenarioPortfolio.planA.prosAndCons}
                </p>
                <p className="text-xs text-slate-800 mt-2 bg-white p-2.5 rounded-lg border border-indigo-100">
                  <strong>실행 전략:</strong> {l3.scenarioPortfolio.planA.executionStrategy}
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <div className="text-xs font-extrabold text-sky-700 uppercase">
                  PLAN B · 병행·보완 시나리오
                </div>
                <div className="font-bold text-slate-900 text-sm mt-1">
                  {l3.scenarioPortfolio.planB.title}
                </div>
                <div className="text-xs font-semibold text-sky-800 mt-1">
                  잠정 범위: {l3.scenarioPortfolio.planB.expectedRange}
                </div>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  <strong>특징:</strong> {l3.scenarioPortfolio.planB.prosAndCons}
                </p>
                <p className="text-xs text-slate-800 mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <strong>실행 전략:</strong> {l3.scenarioPortfolio.planB.executionStrategy}
                </p>
              </div>

              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/20">
                <div className="text-xs font-extrabold text-amber-800 uppercase">
                  CONTINGENCY · 대안 시나리오
                </div>
                <div className="font-bold text-slate-900 text-sm mt-1">
                  {l3.scenarioPortfolio.contingencyPlan.title}
                </div>
                <div className="text-xs font-semibold text-amber-900 mt-1">
                  발동 조건: {l3.scenarioPortfolio.contingencyPlan.triggerCondition}
                </div>
                <p className="text-xs text-slate-800 mt-3 bg-white p-2.5 rounded-lg border border-amber-200">
                  <strong>대응 전략:</strong>{" "}
                  {l3.scenarioPortfolio.contingencyPlan.executionStrategy}
                </p>
              </div>
            </div>

            {/* D1 ~ D5 1주차 구체적 행동목록 */}
            <h3 className="text-base font-bold text-slate-900 mt-6 mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              D1 ~ D5 1주차 구체적 실행 행동목록 (Action Roadmap)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {l3.weekOneActionRoadmap.map((d) => (
                <div
                  key={d.day}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between"
                >
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded bg-slate-900 text-white text-xs font-extrabold">
                      {d.day}
                    </span>
                    <div className="font-bold text-xs text-slate-900 mt-2">
                      {d.title}
                    </div>
                    <ul className="space-y-1 text-[11px] text-slate-600 mt-2">
                      {d.tasks.map((t, idx) => (
                        <li key={idx}>• {t}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] font-semibold text-indigo-700">
                    산출물: {d.deliverable}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* L4 실행 컨설팅 (승인 및 실행금액 확정 보장 불가 원칙 명시) */}
      {/* =================================================================== */}
      {selectedTier === "L4" && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded">
                L4 프리미엄 케어 · 별도 계약 및 견적
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-2">
                {l4.serviceName}
              </h2>
            </div>
            <Award className="w-8 h-8 text-slate-700" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 mb-2">
                전문가 1:1 밀착 케어 제공 범위
              </h3>
              <ul className="space-y-2 text-xs text-slate-700">
                {l4.scopeOfWork.map((s, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-rose-50 border-2 border-rose-200">
              <h3 className="text-sm font-bold text-rose-900 flex items-center gap-2 mb-2">
                <ShieldAlert className="w-4 h-4 text-rose-700" />
                필수 법적 고지 (승인 및 실행금액 확정 보장 불가 원칙)
              </h3>
              <p className="text-xs text-rose-900 leading-relaxed">
                {l4.mandatoryLegalDisclaimer}
              </p>
              <div className="mt-3 text-[11px] font-semibold text-rose-700">
                진행 절차: {l4.contractProcessText}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
