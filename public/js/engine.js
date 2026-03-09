/**
 * ═══════════════════════════════════════════════════════
 * 입찰 낙찰가 예측 몬테카를로 시뮬레이션 코어 엔진 v1.0
 * ═══════════════════════════════════════════════════════
 *
 * @param {object} params
 * @param {number}  params.basePrice          - 예비가격기초금액 (원, VAT 포함 여부는 UI에서 표시)
 * @param {number}  params.lowerLimitRate     - 낙찰하한율 (예: 87.995% → 0.87995)
 * @param {boolean} params.isAsymmetric       - 비대칭 여부 (true: 위7/아래8, false: ±2% 균등)
 * @param {number}  params.voteSkew           - 투표 상향 쏠림 강도 0.0~1.0 (0=중립, 1=완전상향)
 * @param {number}  params.safetyMarginRate   - 안전마진율 (기본 0.0003, 과거데이터 보정 시 동적)
 * @param {number}  params.competitorCount    - 경쟁사 수
 * @param {number}  iterations                - 시뮬레이션 횟수 (고정 100,000)
 */
function runBidSimulation(params) {
  const {
    basePrice,
    lowerLimitRate,
    isAsymmetric      = false,
    voteSkew          = 0.0,    // 0: 중립, 1: 완전 상향 쏠림
    safetyMarginRate  = 0.0003,
    competitorCount   = 5,
  } = params;

  const iterations = 100000;
  const estimatedPrices = new Float64Array(iterations); // 메모리 효율화

  // ─────────────────────────────────────────
  // 1. 10만 회 시뮬레이션 루프 (DOM 접근 금지)
  // ─────────────────────────────────────────
  for (let i = 0; i < iterations; i++) {
    const prelimPrices = new Float64Array(15);

    // STEP 1: 복수예비가격 15개 생성
    if (isAsymmetric) {
      // 방식 B: 위(+구간) 7개, 아래(-구간) 8개
      for (let j = 0; j < 7; j++)
        prelimPrices[j] = Math.round(basePrice * (1 + Math.random() * 0.02));
      for (let j = 7; j < 15; j++)
        prelimPrices[j] = Math.round(basePrice * (1 - Math.random() * 0.02));
    } else {
      // 방식 A: ±2% 균등
      for (let j = 0; j < 15; j++) {
        const rate = (Math.random() * 0.04) - 0.02;
        prelimPrices[j] = Math.round(basePrice * (1 + rate));
      }
    }

    // STEP 2: 투표 시뮬레이션 (가중치 적용 - 최적화 버전)
    // voteSkew=0: 완전 랜덤(균등), voteSkew=1: 상단 가격에 완전 쏠림
    // 방식: Fisher-Yates 셔플 후 가중치로 상단 편향 조정
    const sorted = [
      prelimPrices[0], prelimPrices[1], prelimPrices[2], prelimPrices[3],
      prelimPrices[4], prelimPrices[5], prelimPrices[6], prelimPrices[7],
      prelimPrices[8], prelimPrices[9], prelimPrices[10],prelimPrices[11],
      prelimPrices[12],prelimPrices[13],prelimPrices[14]
    ].sort((a, b) => a - b);

    // 누적 가중치 배열 사전 계산 (O(15) 고정)
    const cumWeights = new Float64Array(15);
    let wSum = 0;
    for (let k = 0; k < 15; k++) {
      wSum += 1 + voteSkew * (k / 14) * 2;
      cumWeights[k] = wSum;
    }

    // 가중치 기반 비복원 추출 4개 (배열 splice 없이 마킹 방식)
    const selected = new Float64Array(4);
    const used = new Uint8Array(15);
    for (let pick = 0; pick < 4; pick++) {
      // 남은 항목 누적 가중치 재계산
      let remaining = 0;
      for (let k = 0; k < 15; k++) if (!used[k]) remaining += 1 + voteSkew * (k / 14) * 2;
      let rand = Math.random() * remaining;
      let cumul = 0;
      for (let k = 0; k < 15; k++) {
        if (used[k]) continue;
        cumul += 1 + voteSkew * (k / 14) * 2;
        if (rand <= cumul) {
          selected[pick] = sorted[k];
          used[k] = 1;
          break;
        }
      }
    }

    // STEP 3: 산술평균 + 1원 단위 절상 ★ 핵심 규칙 ★
    const sum = selected.reduce((a, b) => a + b, 0);
    estimatedPrices[i] = Math.ceil(sum / 4);
  }

  // ─────────────────────────────────────────
  // 2. 결과 정렬 및 통계 분석 (메모리 내 연산)
  // ─────────────────────────────────────────
  estimatedPrices.sort();

  const getPercentile = (p) => estimatedPrices[Math.floor(iterations * p)];

  // 백분위 주요 포인트
  const p10 = getPercentile(0.10);
  const p25 = getPercentile(0.25);
  const p50 = getPercentile(0.50);
  const p75 = getPercentile(0.75);
  const p90 = getPercentile(0.90);

  // 전략별 타겟 예정가격
  const targets = {
    aggressive : p10,  // 공격형: 예정가 낮게 깔릴 때 베팅
    neutral    : p50,  // 최적형: 중앙값 (기댓값)
    defensive  : p90,  // 안정형: 예정가 높게 형성 방어
  };

  // STEP 4: 최종 투찰가 계산 (하한선 + 안전마진 절상)
  const calculateBid = (targetEstPrice) =>
    Math.ceil(targetEstPrice * lowerLimitRate + basePrice * safetyMarginRate);

  // 마지노선 (하한선)
  const lowerCutline = Math.ceil(p50 * lowerLimitRate);

  // ─────────────────────────────────────────
  // 3. 경쟁사 시뮬레이션
  // - 경쟁사들도 동일한 분포에서 투찰한다고 가정
  // - 우리가 각 전략가로 투찰했을 때 1등(최저가) 확률
  // ─────────────────────────────────────────
  const winRates = {};
  ['aggressive', 'neutral', 'defensive'].forEach(strategy => {
    const ourBid = calculateBid(targets[strategy]);
    let winCount = 0;
    for (let i = 0; i < 10000; i++) {
      // 경쟁사 각각 p25~p75 구간에서 랜덤 투찰 (현실적 가정)
      let allBelowUs = true;
      for (let c = 0; c < competitorCount; c++) {
        const compIdx = Math.floor(Math.random() * iterations);
        const compBid = calculateBid(estimatedPrices[compIdx]);
        // 경쟁사가 하한선 위이면서 우리보다 낮으면 우리 탈락
        if (compBid >= lowerCutline && compBid < ourBid) {
          allBelowUs = false;
          break;
        }
      }
      if (allBelowUs) winCount++;
    }
    winRates[strategy] = Math.round(winCount / 100); // %
  });

  // ─────────────────────────────────────────
  // 4. 히스토그램 데이터 생성 (Chart.js용)
  // ─────────────────────────────────────────
  const BUCKET_COUNT = 50;
  const minPrice = estimatedPrices[0];
  const maxPrice = estimatedPrices[iterations - 1];
  const bucketSize = Math.ceil((maxPrice - minPrice) / BUCKET_COUNT);
  const histogram = Array(BUCKET_COUNT).fill(0);
  for (let i = 0; i < iterations; i++) {
    const idx = Math.min(
      Math.floor((estimatedPrices[i] - minPrice) / bucketSize),
      BUCKET_COUNT - 1
    );
    histogram[idx]++;
  }
  const histLabels = Array.from({ length: BUCKET_COUNT }, (_, i) =>
    Math.round(minPrice + i * bucketSize)
  );

  // ─────────────────────────────────────────
  // 5. 결과 반환
  // ─────────────────────────────────────────
  return {
    // 입력값 요약
    inputs: {
      basePrice,
      lowerLimitRate,
      isAsymmetric,
      voteSkew,
      safetyMarginRate,
      competitorCount,
      iterations,
    },

    // 예정가격 분포
    distribution: {
      min : estimatedPrices[0],
      p10, p25, p50, p75, p90,
      max : estimatedPrices[iterations - 1],
    },

    // 하한선
    lowerCutline,

    // 전략별 타겟 예정가격
    targets,

    // 최종 투찰 추천가
    recommendedBids: {
      aggressive : calculateBid(targets.aggressive),
      neutral    : calculateBid(targets.neutral),
      defensive  : calculateBid(targets.defensive),
    },

    // 경쟁사 대비 낙찰 확률
    winRates,

    // 히스토그램
    histogram: { labels: histLabels, data: histogram, bucketSize },
  };
}
