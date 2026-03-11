// public/js/g2b.js  — 나라장터 공고·낙찰 조회 탭 UI

// ── 서브탭 전환 ──
function switchG2bTab(tab) {
  document.querySelectorAll('.g2b-subtab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.g2b-tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`.g2b-subtab[onclick="switchG2bTab('${tab}')"]`).classList.add('active');
  document.getElementById(`g2b-tab-${tab}`).classList.add('active');
}

// ── 숫자 포맷 (1원 단위) ──
function g2bFmt(n) {
  if (!n || n === 0) return '-';
  return Number(n).toLocaleString('ko-KR') + '원';
}

// ── 상태 메시지 ──
function g2bStatus(elId, type, msg, spin = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  const icon = spin
    ? '<span class="g2b-spin"></span>'
    : type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  el.innerHTML = `<div class="g2b-status g2b-status-${type}">${icon} ${msg}</div>`;
}

// ══════════════════════════════════════════════
// ── 입찰공고 조회 ──
// ══════════════════════════════════════════════
const g2bBidState = { items: [], page: 1, perPage: 15 };

async function searchG2bBids() {
  const keyword = document.getElementById('g2b-keyword').value.trim();
  const type    = document.getElementById('g2b-type').value;
  const days    = document.getElementById('g2b-days').value;

  g2bBidState.items = [];
  g2bBidState.page  = 1;
  document.getElementById('g2b-bid-results').innerHTML = '';
  document.getElementById('g2b-bid-pager').innerHTML   = '';

  const label = keyword || '전체';
  g2bStatus('g2b-bid-status', 'info', `"${label}" (${type}) 입찰공고 조회 중...`, true);

  try {
    const params = new URLSearchParams({ type, days });
    if (keyword) params.set('keyword', keyword);

    const res  = await fetch(`/api/g2b/bids?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '서버 오류');

    g2bBidState.items = data.items || [];

    if (g2bBidState.items.length === 0) {
      g2bStatus('g2b-bid-status', 'info', `"${label}" 입찰공고 검색 결과가 없습니다.`);
      return;
    }
    g2bStatus('g2b-bid-status', 'success', `총 ${data.total}건 조회됨 (표시: ${g2bBidState.items.length}건)`);
    renderG2bBidPage();
  } catch (err) {
    g2bStatus('g2b-bid-status', 'error', `오류: ${err.message}`);
  }
}

function renderG2bBidPage() {
  const { items, page, perPage } = g2bBidState;
  const total  = items.length;
  const start  = (page - 1) * perPage;
  const slice  = items.slice(start, start + perPage);

  const html = slice.map(b => `
    <div class="g2b-card">
      <div class="g2b-card-head">
        <span class="g2b-badge">${b.ntceKindNm || '공고'}</span>
        <span class="g2b-org">${b.org}</span>
        ${b.demandOrg && b.demandOrg !== b.org ? `<span class="g2b-demand-org">수요: ${b.demandOrg}</span>` : ''}
      </div>
      <div class="g2b-card-title">${b.title}</div>
      <div class="g2b-card-meta">
        <span>📋 공고번호: ${b.bidNtceNo}-${b.bidNtceOrd}</span>
        <span>💰 추정가: ${g2bFmt(b.budget)}</span>
        ${b.basePrice > 0 ? `<span>📊 기초금액: ${g2bFmt(b.basePrice)}</span>` : ''}
        <span>📅 마감: ${b.deadline || b.bidEnd || '-'}</span>
      </div>
      <div class="g2b-card-info">
        <span>낙찰방법: ${b.bidMethod}</span>
        <span>계약방법: ${b.contractMethod}</span>
        ${b.openDate ? `<span>개찰일: ${b.openDate}</span>` : ''}
      </div>
      ${b.url ? `<div class="g2b-card-link"><a href="${b.url}" target="_blank">📄 공고문 보기 ↗</a></div>` : ''}
    </div>
  `).join('');

  document.getElementById('g2b-bid-results').innerHTML = html;
  renderG2bPager('g2b-bid-pager', total, page, perPage, (p) => {
    g2bBidState.page = p;
    renderG2bBidPage();
    document.getElementById('g2b-tab-bid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ══════════════════════════════════════════════
// ── 낙찰정보 조회 ──
// ══════════════════════════════════════════════
const g2bResState = { items: [], page: 1, perPage: 15 };

async function searchG2bResults() {
  const keyword = document.getElementById('g2b-res-keyword').value.trim();
  const type    = document.getElementById('g2b-res-type').value;
  const days    = document.getElementById('g2b-res-days').value;

  g2bResState.items = [];
  g2bResState.page  = 1;
  document.getElementById('g2b-res-results').innerHTML = '';
  document.getElementById('g2b-res-pager').innerHTML   = '';

  const label = keyword || '전체';
  g2bStatus('g2b-res-status', 'info', `"${label}" (${type}) 낙찰정보 조회 중...`, true);

  try {
    const params = new URLSearchParams({ type, days });
    if (keyword) params.set('keyword', keyword);

    const res  = await fetch(`/api/g2b/results?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '서버 오류');

    g2bResState.items = data.items || [];

    if (g2bResState.items.length === 0) {
      g2bStatus('g2b-res-status', 'info', `"${label}" 낙찰정보 검색 결과가 없습니다.`);
      return;
    }
    g2bStatus('g2b-res-status', 'success', `총 ${data.total}건 조회됨 (표시: ${g2bResState.items.length}건)`);
    renderG2bResPage();
  } catch (err) {
    g2bStatus('g2b-res-status', 'error', `오류: ${err.message}`);
  }
}

function renderG2bResPage() {
  const { items, page, perPage } = g2bResState;
  const total = items.length;
  const start = (page - 1) * perPage;
  const slice = items.slice(start, start + perPage);

  const html = slice.map(b => {
    // 낙찰률 계산 (서버가 안 준 경우 직접 계산)
    let rate = b.sucsfbidRate !== '-' ? b.sucsfbidRate : null;
    if (!rate && b.presmptPrce > 0 && b.successBid > 0) {
      rate = ((b.successBid / b.presmptPrce) * 100).toFixed(3) + '%';
    }

    // 예정가격 대비 낙찰금액 비율
    let predtRate = null;
    if (b.predtPrce > 0 && b.successBid > 0) {
      predtRate = ((b.successBid / b.predtPrce) * 100).toFixed(3) + '%';
    }

    return `
      <div class="g2b-card g2b-card-result">
        <div class="g2b-card-head">
          <span class="g2b-badge g2b-badge-result">낙찰</span>
          <span class="g2b-org">${b.org}</span>
        </div>
        <div class="g2b-card-title">${b.title}</div>
        <div class="g2b-card-meta">
          <span>📋 공고번호: ${b.bidNtceNo}</span>
          <span>🏆 낙찰자: <strong>${b.successBidder}</strong></span>
          <span>💰 낙찰금액: <strong class="g2b-amount">${g2bFmt(b.successBid)}</strong></span>
          ${b.presmptPrce > 0 ? `<span>📊 추정가: ${g2bFmt(b.presmptPrce)}</span>` : ''}
          ${b.predtPrce   > 0 ? `<span>🎯 예정가: ${g2bFmt(b.predtPrce)}</span>` : ''}
          ${rate ? `<span>📈 낙찰률: <strong>${rate}</strong></span>` : ''}
          ${predtRate ? `<span>📉 예정가 대비: ${predtRate}</span>` : ''}
        </div>
        <div class="g2b-card-info">
          ${b.openDate     ? `<span>개찰일: ${b.openDate}</span>` : ''}
          ${b.bidCloseDate ? `<span>마감일: ${b.bidCloseDate}</span>` : ''}
          ${b.drwtPrceBas > 0 ? `<span>복수예비가 기초금액: ${g2bFmt(b.drwtPrceBas)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('g2b-res-results').innerHTML = html;
  renderG2bPager('g2b-res-pager', total, page, perPage, (p) => {
    g2bResState.page = p;
    renderG2bResPage();
    document.getElementById('g2b-tab-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ── 공통 페이저 ──
function renderG2bPager(containerId, total, current, perPage, onPage) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) { document.getElementById(containerId).innerHTML = ''; return; }

  const pages = [];
  const delta = 2;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= current - delta && i <= current + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  const btns = pages.map(p =>
    p === '...'
      ? `<span class="pager-ellipsis">…</span>`
      : `<button class="pager-btn ${p === current ? 'active' : ''}" onclick="(${onPage.toString()})(${p})">${p}</button>`
  ).join('');

  document.getElementById(containerId).innerHTML = `<div class="pager">${btns}</div>`;
}
