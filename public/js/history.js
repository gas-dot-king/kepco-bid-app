// public/js/history.js
// 과거 낙찰 데이터 관리 (Node.js fs 모듈 연동)

// ── 데이터 로드 ──
async function loadHistory() {
  try {
    const res  = await fetch('/api/history');
    const data = await res.json();
    return data.records || [];
  } catch { return []; }
}

// ── 데이터 저장 ──
async function saveHistory() {
  const title      = document.getElementById('h-title').value.trim();
  const org        = document.getElementById('h-org').value.trim();
  const baseRaw    = document.getElementById('h-base').value.replace(/,/g,'');
  const estRaw     = document.getElementById('h-estimated').value.replace(/,/g,'');
  const bidRaw     = document.getElementById('h-bid').value.replace(/,/g,'');
  const limitRaw   = document.getElementById('h-limit').value;
  const method     = document.getElementById('h-method').value;
  const priceMethod= document.getElementById('h-pricemethod').value;
  const competitor = document.getElementById('h-competitor').value;
  const date       = document.getElementById('h-date').value;
  const memo       = document.getElementById('h-memo').value.trim();

  if (!title || !baseRaw || !bidRaw) {
    alert('공고명, 기초금액, 낙찰금액은 필수 입력입니다.');
    return;
  }

  const base      = parseInt(baseRaw);
  const estimated = parseInt(estRaw) || 0;
  const bidPrice  = parseInt(bidRaw);
  const limit     = parseFloat(limitRaw) || 0;

  // 낙찰률 자동 계산
  const bidRate   = estimated > 0 ? bidPrice / estimated : 0;
  // 예정가 대비 기초금액 오차율 (시뮬레이션 보정용)
  const errorRate = estimated > 0 ? (estimated - base) / base : 0;

  const record = {
    id         : Date.now(),
    title, org,
    basePrice  : base,
    estimatedPrice: estimated,
    bidPrice,
    lowerLimitRate: limit / 100,
    bidRate,
    errorRate,
    method,
    priceMethod,
    competitorCount: parseInt(competitor) || 0,
    date       : date || new Date().toISOString().slice(0,10),
    memo,
  };

  try {
    const res = await fetch('/api/history', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(record),
    });
    if (!res.ok) throw new Error('저장 실패');
    alert('✅ 저장되었습니다!');
    clearHistoryForm();
    renderHistoryTab();
  } catch(e) {
    alert('저장 오류: ' + e.message);
  }
}

// ── 데이터 삭제 ──
async function deleteHistory(id) {
  if (!confirm('이 데이터를 삭제하시겠습니까?')) return;
  try {
    await fetch('/api/history/' + id, { method: 'DELETE' });
    renderHistoryTab();
  } catch(e) {
    alert('삭제 오류: ' + e.message);
  }
}

// ── 통계 계산 ──
function getHistoryStats() {
  if (!window._historyCache || window._historyCache.length === 0) return null;
  const records = window._historyCache;
  const withRate = records.filter(r => r.bidRate > 0);
  const withErr  = records.filter(r => r.errorRate !== undefined);

  return {
    count       : records.length,
    avgBidRate  : withRate.length > 0
      ? withRate.reduce((a, r) => a + r.bidRate, 0) / withRate.length
      : 0,
    avgErrorRate: withErr.length > 0
      ? withErr.reduce((a, r) => a + r.errorRate, 0) / withErr.length
      : 0,
    minBidRate  : withRate.length > 0 ? Math.min(...withRate.map(r => r.bidRate)) : 0,
    maxBidRate  : withRate.length > 0 ? Math.max(...withRate.map(r => r.bidRate)) : 0,
  };
}

// ── 탭 렌더링 ──
async function renderHistoryTab() {
  const records = await loadHistory();
  window._historyCache = records;

  // 통계 요약
  const stats = getHistoryStats();
  const statsHtml = stats && stats.count > 0 ? `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-head">📈 통계 요약</div>
      <div class="panel-body">
        <div class="stat-grid">
          <div class="stat-item">
            <div class="stat-val">${stats.count}건</div>
            <div class="stat-label">누적 데이터</div>
          </div>
          <div class="stat-item">
            <div class="stat-val">${(stats.avgBidRate * 100).toFixed(2)}%</div>
            <div class="stat-label">평균 낙찰률</div>
          </div>
          <div class="stat-item">
            <div class="stat-val">${(stats.minBidRate * 100).toFixed(2)}%</div>
            <div class="stat-label">최저 낙찰률</div>
          </div>
          <div class="stat-item">
            <div class="stat-val">${(stats.maxBidRate * 100).toFixed(2)}%</div>
            <div class="stat-label">최고 낙찰률</div>
          </div>
          <div class="stat-item">
            <div class="stat-val">${stats.avgErrorRate >= 0 ? '+' : ''}${(stats.avgErrorRate * 100).toFixed(3)}%</div>
            <div class="stat-label">평균 오차율</div>
          </div>
        </div>
      </div>
    </div>` : '';
  document.getElementById('history-stats').innerHTML = statsHtml;

  // 과거 데이터 보정 상태 업데이트
  const sub = document.getElementById('correctionSub');
  if (sub) {
    sub.textContent = stats && stats.count > 0
      ? `저장된 과거 데이터 ${stats.count}건`
      : '저장된 과거 데이터 없음';
  }

  // 목록 렌더링
  if (records.length === 0) {
    document.getElementById('history-list').innerHTML =
      '<div style="padding:24px;text-align:center;color:var(--ink3);font-size:13px;">저장된 데이터가 없습니다.</div>';
    return;
  }

  const rows = records.slice().reverse().map(r => `
    <div class="history-row">
      <div class="history-row-main">
        <div class="history-title">${r.title}</div>
        <div class="history-meta">
          <span class="bid-tag bid-tag-blue">${r.org || '-'}</span>
          <span class="bid-tag bid-tag-gray">${r.method || '-'}</span>
          <span class="bid-tag bid-tag-gray">${r.date || '-'}</span>
          ${r.priceMethod === 'asymmetric'
            ? '<span class="bid-tag bid-tag-gray">방식 B</span>'
            : '<span class="bid-tag bid-tag-gray">방식 A</span>'}
        </div>
      </div>
      <div class="history-row-nums">
        <div class="history-num-item">
          <span class="history-num-label">기초금액</span>
          <span class="history-num-val">${r.basePrice ? Math.round(r.basePrice).toLocaleString()+'원' : '-'}</span>
        </div>
        <div class="history-num-item">
          <span class="history-num-label">낙찰금액</span>
          <span class="history-num-val">${r.bidPrice ? Math.round(r.bidPrice).toLocaleString()+'원' : '-'}</span>
        </div>
        <div class="history-num-item">
          <span class="history-num-label">낙찰률</span>
          <span class="history-num-val" style="color:var(--blue)">${r.bidRate > 0 ? (r.bidRate*100).toFixed(2)+'%' : '-'}</span>
        </div>
        <div class="history-num-item">
          <span class="history-num-label">오차율</span>
          <span class="history-num-val" style="color:${r.errorRate > 0 ? 'var(--green)' : 'var(--red)'}">
            ${r.errorRate !== undefined ? (r.errorRate >= 0 ? '+' : '') + (r.errorRate*100).toFixed(3)+'%' : '-'}
          </span>
        </div>
        <div class="history-num-item">
          <span class="history-num-label">경쟁사</span>
          <span class="history-num-val">${r.competitorCount > 0 ? r.competitorCount+'개사' : '-'}</span>
        </div>
      </div>
      ${r.memo ? `<div class="history-memo">📝 ${r.memo}</div>` : ''}
      <div class="history-actions">
        <button class="btn btn-sm" style="background:var(--bg2);border:1px solid var(--border2);font-size:11px;"
          onclick="prefillSimFromHistory(${r.id})">🎯 시뮬레이션에 적용</button>
        <button class="btn btn-sm" style="background:#fde8e8;border:1px solid #f0a0a0;color:var(--red);font-size:11px;"
          onclick="deleteHistory(${r.id})">🗑 삭제</button>
      </div>
    </div>`).join('');

  document.getElementById('history-list').innerHTML = rows;
}

// ── 과거 데이터 → 시뮬레이션 자동 적용 ──
function prefillSimFromHistory(id) {
  const record = window._historyCache?.find(r => r.id === id);
  if (!record) return;
  document.getElementById('s-title').value = record.title || '';
  if (record.basePrice) document.getElementById('s-base').value = Math.round(record.basePrice).toLocaleString();
  if (record.lowerLimitRate) document.getElementById('s-limit').value = (record.lowerLimitRate * 100).toFixed(3);
  if (record.competitorCount) document.getElementById('s-competitor').value = record.competitorCount;
  if (record.priceMethod === 'asymmetric') {
    document.querySelector('input[name="s-method"][value="asymmetric"]').checked = true;
  } else {
    document.querySelector('input[name="s-method"][value="symmetric"]').checked = true;
  }
  switchTab('simulate');
}

// ── 폼 초기화 ──
function clearHistoryForm() {
  ['h-title','h-org','h-base','h-estimated','h-bid','h-limit','h-competitor','h-memo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('h-date').value = '';
}
