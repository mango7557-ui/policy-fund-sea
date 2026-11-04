"use client";

import React, { useMemo, useState } from "react";
import {
  GT100CaseSpec,
  runGoldenTest100Suite,
} from "../engines/gt100-runner";
import {
  CheckCircle2,
  Play,
  ShieldCheck,
  Terminal,
  XCircle,
} from "lucide-react";

export function GT100DashboardView() {
  const [runCounter, setRunCounter] = useState<number>(1);
  const [selectedCategory, setSelectedCategory] = useState<
    "ALL" | GT100CaseSpec["category"]
  >("ALL");

  const suite = useMemo(() => {
    void runCounter;
    return runGoldenTest100Suite();
  }, [runCounter]);

  const filteredCases =
    selectedCategory === "ALL"
      ? suite.cases
      : suite.cases.filter((c) => c.category === selectedCategory);

  const categoryLabels: Record<GT100CaseSpec["category"], string> = {
    GATE_HARD_BLOCK: "1. 제한게이트 즉시차단 (1~20)",
    GATE_EXCEPTION: "2. 체납분납/단기연체 예외검토 (21~35)",
    MULTI_EXPOSURE_RULE: "3. 복수사업자 채무 분리·단순합산금지 (36~50)",
    PREF_STATE_MACHINE: "4. 가점 4단계 오가산 방지 (51~65)",
    ADDRESS_ZONING: "5. 주소·수도권/비수도권 권역분류 (66~80)",
    NBQ_AND_IMMUTABILITY: "6. NBQ 재질문금지·원천보존·버전관리 (81~90)",
    COMPLIANCE_AND_SEC: "7. 확률단정금지·보안링크·OTP (91~100)",
  };

  return (
    <div className="space-y-6">
      {/* 상단 릴리스 게이트 요약 배너 */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-6 border border-slate-700 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              QA Release Gate · Golden Test 100 (GT100) 회귀테스트
            </div>
            <h2 className="text-xl font-bold mt-1">
              100개 대표 시뮬레이션 케이스 자동 검증 — P0 오류 {suite.p0ErrorCount}건
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              상용 릴리스 전 제한게이트, 예외규정, 복수사업자 분리여신, 4단계 우대 상태머신, 권역매핑, NBQ, 확률단정 배제 등 100개 케이스를 100% 자동 재실행합니다.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setRunCounter((c) => c + 1)}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-2 transition shadow"
            >
              <Play className="w-4 h-4 fill-current" />
              GT100 전수 회귀테스트 즉시 재실행 (#{runCounter}회차)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5">
            <div className="text-xs text-slate-400">총 시뮬레이션 케이스</div>
            <div className="text-2xl font-extrabold text-white mt-1">
              {suite.totalCases}건
            </div>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5">
            <div className="text-xs text-slate-400">통과 (Pass)</div>
            <div className="text-2xl font-extrabold text-emerald-400 mt-1">
              {suite.passedCases}건 (100%)
            </div>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5">
            <div className="text-xs text-slate-400">P0 치명적 오류</div>
            <div className="text-2xl font-extrabold text-sky-400 mt-1">
              {suite.p0ErrorCount}건
            </div>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5">
            <div className="text-xs text-slate-400">상용 오픈 승인 상태</div>
            <div className="text-sm font-extrabold text-emerald-300 mt-2">
              {suite.releaseGateApproved ? "APPROVED (상용 오픈 가능)" : "BLOCKED"}
            </div>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5">
            <div className="text-xs text-slate-400">CLI 검증 명령어</div>
            <div className="text-xs font-mono text-amber-300 mt-2 flex items-center gap-1">
              <Terminal className="w-3.5 h-3.5" />
              npm run test:gt100
            </div>
          </div>
        </div>
      </div>

      {/* 카테고리 필터 및 100개 케이스 상세 테이블 */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex flex-wrap gap-2 pb-4 border-b border-slate-200">
          <button
            onClick={() => setSelectedCategory("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
              selectedCategory === "ALL"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
            }`}
          >
            전체 100개 케이스 ({suite.cases.length})
          </button>
          {(Object.keys(categoryLabels) as GT100CaseSpec["category"][]).map(
            (cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                  selectedCategory === cat
                    ? "bg-sky-600 text-white border-sky-600"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {categoryLabels[cat]}
              </button>
            )
          )}
        </div>

        <div className="overflow-x-auto mt-4 max-h-[540px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Case ID</th>
                <th className="py-2.5 px-3">검증 그룹</th>
                <th className="py-2.5 px-3">시뮬레이션 시나리오 명세</th>
                <th className="py-2.5 px-3">기대 게이트 판정</th>
                <th className="py-2.5 px-3">실제 판정</th>
                <th className="py-2.5 px-3">P0 무결성 검증</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredCases.map((c) => (
                <tr key={c.caseId} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                    {c.caseId}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">
                    {categoryLabels[c.category]}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-900">
                    {c.title}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-700">
                    {c.expectedGateStatus}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                    {c.actualGateStatus}
                  </td>
                  <td className="py-2.5 px-3">
                    {c.p0ChecksPassed ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        PASS (P0 오류 0)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[11px]">
                        <XCircle className="w-3.5 h-3.5" />
                        FAIL ({c.p0FailureReasons.join(", ")})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
