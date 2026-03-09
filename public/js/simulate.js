// public/js/simulate.js
// 시뮬레이션 탭 UI 컨트롤러

// ── 슬라이더 레이블 업데이트 ──
function updateSkewLabel(val) {
  const v = parseInt(val);
  let text;
  if (v === 0)        text = '중립 (0)';
  else if (v < 0) {
    const abs = Math.abs(v);
    if (abs <= 20)      text = `약한 하향 (-${abs})`;
    else if (abs <= 50) text = `보통 하향 (-${abs})`;
    else if (abs <= 80) text = `강한 하향 (-${abs})`;
    else                text = `완전 하향 (-${abs})`;
  } else {
    if (v <= 20)        text = `약한 상향 (+${v})`;
    else if (v <= 50)   text = `보통 상향 (+${v})`;
    else if (v <= 80)   text = `강한 상향 (+${v})`;
    else                text = `완전 상향 (+${v})`;
  }
  document.getElementById('s-skew-val').textContent = text;
}

function updateMarginLabel(val) {
  const pct = (val / 100).toFixed(2);
  document.getElementById('s-margin-val').textContent = pct + '%';
}

// ── 과거 데이터 보정 토글 ──
function toggleCorrection() {
  const on  = document.getElementById('s-correction').checked;
  const bar = document.getElementById('correctionBar');
  bar.classList.toggle('correction-on', on);

  if (on) {
    const stats = getHistoryStats();
    if (!stats || stats.count === 0) {
      alert('저장된 과거 데이터가 없습니다.\n먼저 [과거 데이터] 탭에서 데이터를 입력해주세요.');
      document.getElementById('s-correction').checked = false;
      bar.classList.remove('correction-on');
      return;
    }
    // 과거 오차율로 안전마진 자동 반영
    const autoMargin = Math.max(1, Math.min(20, Math.round(Math.abs(stats.avgErrorRate) * 10000)));
    document.getElementById('s-margin').value = autoMargin;
    updateMarginLabel(autoMargin);
    document.getElementById('correctionSub').textContent =
      `${stats.count}건 데이터 반영 · 평균오차율 ${stats.avgErrorRate >= 0 ? '+' : ''}${(stats.avgErrorRate * 100).toFixed(3)}%`;
  } else {
    document.getElementById('s-margin').value = 3;
    updateMarginLabel(3);
    document.getElementById('correctionSub').textContent =
      getHistoryStats()?.count > 0
        ? `저장된 과거 데이터 ${getHistoryStats().count}건`
        : '저장된 과거 데이터 없음';
  }
}

// ── 시뮬레이션 실행 ──
function runSimulation() {
  const baseRaw  = document.getElementById('s-base').value.replace(/,/g, '');
  const limitRaw = document.getElementById('s-limit').value;

  if (!baseRaw || !limitRaw) {
    alert('예비가격 기초금액과 낙찰하한율을 입력해주세요.');
    return;
  }

  const basePrice       = parseInt(baseRaw);
  const lowerLimitRate  = parseFloat(limitRaw) / 100;
  const isAsymmetric    = document.querySelector('input[name="s-method"]:checked').value === 'asymmetric';
  const skewRaw         = parseInt(document.getElementById('s-skew').value);   // -100 ~ +100
  const voteSkew        = skewRaw / 100;   // -1.0 ~ +1.0 (음수=하향, 양수=상향)
  const safetyMarginRate= parseInt(document.getElementById('s-margin').value) / 10000;
  const competitorCount = parseInt(document.getElementById('s-competitor').value) || 5;
  const title           = document.getElementById('s-title').value.trim();
  const correctionOn    = document.getElementById('s-correction').checked;

  if (isNaN(basePrice) || basePrice <= 0) { alert('올바른 기초금액을 입력해주세요.'); return; }
  if (isNaN(lowerLimitRate) || lowerLimitRate <= 0) { alert('올바른 낙찰하한율을 입력해주세요.'); return; }

  // 과거 오차율 보정값
  let correctionOffset = 0;
  if (correctionOn) {
    const stats = getHistoryStats();
    if (stats && stats.count > 0) correctionOffset = stats.avgErrorRate;
  }

  // 로딩 표시
  document.getElementById('sim-loading').style.display = 'block';
  document.getElementById('sim-result').innerHTML = '';
  document.getElementById('sim-load-msg').textContent = '10만 회 몬테카를로 시뮬레이션 실행 중...';

  // DOM 업데이트 후 비동기 실행 (UI 블로킹 방지)
  setTimeout(() => {
    try {
      const result = runBidSimulation({
        basePrice,
        lowerLimitRate: lowerLimitRate + correctionOffset,
        isAsymmetric,
        voteSkew,
        safetyMarginRate,
        competitorCount,
      });

      document.getElementById('sim-loading').style.display = 'none';
      renderSimResult(result, { title, correctionOn, correctionOffset, basePrice, lowerLimitRate });
    } catch(e) {
      document.getElementById('sim-loading').style.display = 'none';
      alert('시뮬레이션 오류: ' + e.message);
    }
  }, 50);
}

// ── 결과 렌더링 ──
function renderSimResult(r, meta) {
  const fmt  = n => Math.round(n).toLocaleString() + '원';
  const fmtR = n => (n * 100).toFixed(3) + '%';
  const { title, correctionOn, correctionOffset, basePrice, lowerLimitRate } = meta;

  const corrBadge = correctionOn
    ? `<span class="tag tag-b">과거데이터 보정 ON · ${correctionOffset >= 0 ? '+' : ''}${(correctionOffset * 100).toFixed(3)}%p</span>`
    : `<span class="tag tag-gray">보정 OFF</span>`;

  const vatBadge = `<span class="tag tag-gray">VAT 포함</span>`;

  // 전략 카드 색상
  const stratConfig = {
    aggressive : { label:'🔴 공격형', sub:'예정가 하위 10% 베팅', color:'var(--red)',   bg:'#fde8e8' },
    neutral    : { label:'🟡 최적형', sub:'중앙값 (기댓값)',       color:'var(--amber)', bg:'#fff3e0' },
    defensive  : { label:'🟢 안정형', sub:'예정가 상위 90% 방어', color:'var(--green)', bg:'#e8f5ec' },
  };

  const stratHtml = ['aggressive','neutral','defensive'].map(key => {
    const cfg     = stratConfig[key];
    const bid     = r.recommendedBids[key];
    const target  = r.targets[key];
    const win     = r.winRates[key];
    const rate    = (bid / basePrice * 100).toFixed(3);
    const winColor= win >= 60 ? 'var(--green)' : win >= 30 ? 'var(--amber)' : 'var(--red)';

    return `
      <div class="strat-card" style="border-left:4px solid ${cfg.color};background:${cfg.bg}20;">
        <div class="strat-card-head">
          <span class="strat-card-label" style="color:${cfg.color}">${cfg.label}</span>
          <span class="strat-card-sub">${cfg.sub}</span>
        </div>
        <div class="strat-card-price">${fmt(bid)}</div>
        <div class="strat-card-meta">
          <span>예정가 대비 <strong>${rate}%</strong></span>
          <span>타겟 예정가 ${fmt(target)}</span>
          <span style="color:${winColor}">낙찰확률 <strong>${win}%</strong></span>
        </div>
      </div>`;
  }).join('');

  document.getElementById('sim-result').innerHTML = `

    <!-- 핵심 수치 배너 -->
    <div class="sim-key-banner">
      <div class="sim-key-item">
        <div class="sim-key-label">예비가격 기초금액</div>
        <div class="sim-key-value">${fmt(basePrice)}</div>
        <div class="sim-key-sub">VAT 포함</div>
      </div>
      <div class="sim-key-arrow">→</div>
      <div class="sim-key-item sim-key-main">
        <div class="sim-key-label">최종 예정가격 <span class="sim-key-badge">중앙값 P50</span></div>
        <div class="sim-key-value sim-key-highlight">${fmt(r.distribution.p50)}</div>
        <div class="sim-key-sub">기초금액 대비 <strong>${((r.distribution.p50 / basePrice - 1) * 100).toFixed(3)}%</strong></div>
      </div>
      <div class="sim-key-arrow">→</div>
      <div class="sim-key-item sim-key-danger">
        <div class="sim-key-label">낙찰 마지노선</div>
        <div class="sim-key-value">${fmt(r.lowerCutline)}</div>
        <div class="sim-key-sub">하한율 ${fmtR(lowerLimitRate)} 적용</div>
      </div>
    </div>

    <!-- 조건 요약 배너 -->
    <div class="sim-banner">
      <div class="sim-banner-left">
        <div class="sim-banner-title">${title || '시뮬레이션 결과'}</div>
        <div class="sim-banner-badges">${vatBadge} ${corrBadge}</div>
        <div class="sim-banner-info">
          경쟁사 <strong>${r.inputs.competitorCount}개사</strong> &nbsp;·&nbsp;
          방식 <strong>${r.inputs.isAsymmetric ? 'B (비대칭)' : 'A (균등)'}</strong> &nbsp;·&nbsp;
          쏠림 <strong>${r.inputs.voteSkew >= 0 ? '+' : ''}${(r.inputs.voteSkew * 100).toFixed(0)}</strong> &nbsp;·&nbsp;
          마진 <strong>${(r.inputs.safetyMarginRate * 100).toFixed(2)}%</strong>
        </div>
      </div>
      <div class="sim-banner-iter">
        <div class="sim-banner-iter-num">100,000</div>
        <div class="sim-banner-iter-label">회 시뮬레이션</div>
      </div>
    </div>

    <!-- 전략 카드 3종 -->
    <div class="strat-cards">${stratHtml}</div>

    <!-- 분포 및 히스토그램 -->
    <div class="res-grid">
      <div class="res-box">
        <div class="res-box-head">예정가격 분포 통계</div>
        <div class="res-box-body">
          <table class="info-tbl">
            <tr><td class="k">최솟값</td><td class="v">${fmt(r.distribution.min)}</td></tr>
            <tr><td class="k">하위 10% (P10)</td><td class="v">${fmt(r.distribution.p10)}</td></tr>
            <tr><td class="k">하위 25% (P25)</td><td class="v">${fmt(r.distribution.p25)}</td></tr>
            <tr><td class="k">중앙값 (P50)</td><td class="v" style="color:var(--blue);font-weight:800">${fmt(r.distribution.p50)}</td></tr>
            <tr><td class="k">상위 25% (P75)</td><td class="v">${fmt(r.distribution.p75)}</td></tr>
            <tr><td class="k">상위 10% (P90)</td><td class="v">${fmt(r.distribution.p90)}</td></tr>
            <tr><td class="k">최댓값</td><td class="v">${fmt(r.distribution.max)}</td></tr>
            <tr><td class="k">낙찰 마지노선</td><td class="v" style="color:var(--red)">${fmt(r.lowerCutline)}</td></tr>
          </table>
        </div>
      </div>

      <div class="res-box">
        <div class="res-box-head">예정가격 분포 히스토그램</div>
        <div class="res-box-body" style="position:relative;height:220px;">
          <canvas id="histChart"></canvas>
        </div>
      </div>
    </div>

    <!-- AI 복사 버튼 -->
    <div class="copy-panel">
      <div class="copy-panel-title">📋 AI 채팅용 분석 요청 복사</div>
      <div class="copy-panel-sub">아래 버튼을 클릭하면 시뮬레이션 결과 + AI 분석 요청 프롬프트가 클립보드에 복사됩니다</div>
      <button class="btn btn-secondary" onclick="copyAiPrompt()">📋 AI 프롬프트 복사</button>
    </div>

    <div class="disc">⚠ 본 시뮬레이션은 통계적 확률 기반 참고 자료입니다. 실제 투찰 전 공고 원문 및 현장 상황을 반드시 확인하세요.</div>
  `;

  // 히스토그램 렌더링
  renderHistogram(r.histogram, r.lowerCutline, r.recommendedBids);

  // AI 프롬프트 데이터 저장
  window._lastSimResult = { r, meta };

  document.getElementById('sim-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 히스토그램 Chart.js ──
let histChartInstance = null;
function renderHistogram(hist, lowerCutline, bids) {
  if (histChartInstance) { histChartInstance.destroy(); histChartInstance = null; }

  const ctx = document.getElementById('histChart');
  if (!ctx) return;

  // 마지노선 이하 구간 빨간색
  const colors = hist.labels.map(label =>
    label < lowerCutline ? '#e74c3c44' : '#1a5a8a44'
  );
  const borders = hist.labels.map(label =>
    label < lowerCutline ? '#e74c3c' : '#1a5a8a'
  );

  histChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: hist.labels.map(l => (l / 10000).toFixed(0) + '만'),
      datasets: [{
        label: '빈도수',
        data: hist.data,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1,
        borderRadius: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => Math.round(hist.labels[items[0].dataIndex]).toLocaleString() + '원',
            label: (item) => `빈도: ${item.raw.toLocaleString()}회`,
          }
        }
      },
      scales: {
        x: { ticks: { font: { size: 9 }, maxRotation: 45 } },
        y: { ticks: { font: { size: 9 } } }
      }
    }
  });
}

// ── AI 프롬프트 복사 ──
function copyAiPrompt() {
  if (!window._lastSimResult) return;
  const { r, meta } = window._lastSimResult;
  const fmt  = n => Math.round(n).toLocaleString();
  const fmtR = n => (n * 100).toFixed(3);
  const { title, correctionOn, correctionOffset, basePrice, lowerLimitRate } = meta;

  // 과거 데이터 요약
  const stats   = getHistoryStats();
  const histSummary = stats && stats.count > 0
    ? `과거 데이터 ${stats.count}건 · 평균 낙찰률 ${(stats.avgBidRate * 100).toFixed(2)}% · 평균 오차율 ${(stats.avgErrorRate * 100).toFixed(3)}%`
    : '과거 데이터 없음';

  const prompt = `[입찰 몬테카를로 시뮬레이션 결과 - AI 분석 요청]

■ 공고 정보
공고명: ${title || '(미입력)'}
예비가격 기초금액: ${fmt(basePrice)}원 (VAT 포함)
낙찰하한율: ${fmtR(lowerLimitRate)}%
낙찰 마지노선: ${fmt(r.lowerCutline)}원
경쟁사 수: ${r.inputs.competitorCount}개사

■ 시뮬레이션 조건
횟수: 10만 회 몬테카를로
복수예비가격 방식: ${r.inputs.isAsymmetric ? '방식 B (비대칭 7상/8하)' : '방식 A (균등 ±2%)'}
투표 쏠림: ${r.inputs.voteSkew >= 0 ? '+' : ''}${(r.inputs.voteSkew * 100).toFixed(0)} (${r.inputs.voteSkew < 0 ? '하향 쏠림' : r.inputs.voteSkew === 0 ? '중립' : '상향 쏠림'})
과거 데이터 보정: ${correctionOn ? `ON (${correctionOffset >= 0 ? '+' : ''}${(correctionOffset * 100).toFixed(3)}%p)` : 'OFF'}

■ 예정가격 분포 (10만 회)
최솟값: ${fmt(r.distribution.min)}원
P10:   ${fmt(r.distribution.p10)}원
P50:   ${fmt(r.distribution.p50)}원 (중앙값)
P90:   ${fmt(r.distribution.p90)}원
최댓값: ${fmt(r.distribution.max)}원

■ 투찰 추천가 3종
🔴 공격형 (P10 베팅): ${fmt(r.recommendedBids.aggressive)}원 | 예정가대비 ${(r.recommendedBids.aggressive / basePrice * 100).toFixed(3)}% | 낙찰확률 ${r.winRates.aggressive}%
🟡 최적형 (P50 중앙): ${fmt(r.recommendedBids.neutral)}원 | 예정가대비 ${(r.recommendedBids.neutral / basePrice * 100).toFixed(3)}% | 낙찰확률 ${r.winRates.neutral}%
🟢 안정형 (P90 방어): ${fmt(r.recommendedBids.defensive)}원 | 예정가대비 ${(r.recommendedBids.defensive / basePrice * 100).toFixed(3)}% | 낙찰확률 ${r.winRates.defensive}%

■ 과거 데이터 현황
${histSummary}

---
AI에게 요청:
위 시뮬레이션 결과를 바탕으로 다음을 분석해줘.
1. 이번 입찰의 경쟁 강도 평가
2. 세 가지 전략 중 이번 공고에 가장 적합한 전략 추천 및 이유
3. 주요 리스크 요인
4. 최종 투찰가 1원 단위 추천`;

  navigator.clipboard.writeText(prompt).then(() => {
    const btn = document.querySelector('.copy-panel .btn');
    const orig = btn.textContent;
    btn.textContent = '✅ 복사 완료!';
    btn.style.background = 'var(--green)';
    setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 2000);
  }).catch(() => {
    // 클립보드 API 실패 시 textarea로 대체
    const ta = document.createElement('textarea');
    ta.value = prompt;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    alert('복사 완료!');
  });
}

// ── 공고 조회에서 시뮬레이션으로 연결 ──
function goSimulateFromModal(bid) {
  document.getElementById('s-title').value = bid.title || '';
  if (bid.preBidPrice && bid.preBidPrice > 0) {
    document.getElementById('s-base').value = bid.preBidPrice.toLocaleString();
  }
  switchTab('simulate');
  closeModal();
}
