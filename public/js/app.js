// public/js/app.js

const state = { bids: [], page: 1, perPage: 10, selected: null };

// ── INIT ──
window.addEventListener('DOMContentLoaded', async () => {
  const badge = document.getElementById('serverBadge');
  try {
    const res = await fetch('/api/debug');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    badge.textContent = `● 서버 연결됨 (최근 공고 ${data.count}건)`;
    badge.classList.add('ok');
  } catch (e) {
    badge.textContent = '● 서버 오류: ' + e.message;
    badge.classList.add('err');
  }

  // 회사 목록 로드
  try {
    const res  = await fetch('/api/companies');
    const data = await res.json();
    const sel  = document.getElementById('q-company');
    Object.entries(data).forEach(([id, name]) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  } catch {}
});

// ── TABS ──
function switchTab(name) {
  ['search','analyze'].forEach((n, i) => {
    document.querySelectorAll('.tab-btn')[i].classList.toggle('active', n === name);
    document.getElementById('tab-' + n).classList.toggle('active', n === name);
  });
}

// ── STATUS ──
function showStatus(id, type, msg, loading = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<div class="status-bar ${type}">
    ${loading ? '<div class="dot-spin"></div>' : ''}<span>${msg}</span>
  </div>`;
}

// ── SEARCH ──
async function searchBids() {
  const keyword   = document.getElementById('q-keyword').value.trim() || '보온';
  const companyId = document.getElementById('q-company').value;
  const days      = document.getElementById('q-days').value;

  state.bids = []; state.page = 1; state.selected = null;
  document.getElementById('analyze-trigger').style.display = 'none';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-pager').innerHTML   = '';
  showStatus('search-status', 'info', `"${keyword}" 조회 중...`, true);

  const params = new URLSearchParams({ keyword, days });
  if (companyId) params.set('companyId', companyId);

  try {
    const res  = await fetch(`/api/bids?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '서버 오류');

    state.bids = data.items || [];

    if (state.bids.length === 0) {
      showStatus('search-status', 'info', `"${keyword}" 검색 결과가 없습니다.`);
      return;
    }
    showStatus('search-status', 'success', `총 ${data.total}건 조회됨`);
    renderBidPage();
  } catch (err) {
    showStatus('search-status', 'error', `오류: ${err.message}`);
  }
}

// ── RENDER ──
const SOURCE_COLOR = {
  '한국남부발전': 'bid-tag-blue', '한국전력공사': 'bid-tag-red',
  '한국서부발전': 'bid-tag-gray', '한국중부발전': 'bid-tag-gray',
  '한국남동발전': 'bid-tag-gray', '한국동서발전': 'bid-tag-gray',
};

function renderBidPage() {
  const { bids, page, perPage } = state;
  const start = (page - 1) * perPage;
  const slice = bids.slice(start, start + perPage);
  const totalPages = Math.ceil(bids.length / perPage);

  document.getElementById('search-results').innerHTML = `
    <div class="bid-list">
      ${slice.map((b, i) => `
        <div class="bid-card" id="bid-${start+i}" onclick="selectBid(${start+i})">
          <div class="bid-card-left">
            <div class="bid-no">${b.no}</div>
            <div class="bid-title">${b.title}</div>
            <div class="bid-meta">
              <span class="bid-tag ${SOURCE_COLOR[b.org] || 'bid-tag-gray'}">${b.org}</span>
              ${b.type   ? `<span class="bid-tag bid-tag-gray">${b.type}</span>` : ''}
              ${b.method ? `<span class="bid-tag bid-tag-gray">${b.method}</span>` : ''}
              ${b.status ? `<span class="bid-tag ${b.status==='PreAttendProgress'?'bid-tag-blue':'bid-tag-gray'}">${statusLabel(b.status)}</span>` : ''}
            </div>
          </div>
          <div class="bid-card-right">
            <div class="bid-price">${b.budget ? fmtWon(b.budget) : '금액미공개'}</div>
            <div class="bid-date">마감 ${b.deadline}</div>
          </div>
        </div>`).join('')}
    </div>`;

  document.getElementById('search-pager').innerHTML = totalPages > 1
    ? `<div class="pager">${Array.from({length:totalPages},(_,i)=>i+1).map(p=>
        `<button class="pager-btn ${p===page?'active':''}" onclick="goPage(${p})">${p}</button>`
      ).join('')}</div>` : '';
}

function statusLabel(s) {
  const map = { PreAttendProgress:'공고진행', Close:'마감', Fail:'유찰', OpenTimed:'개찰대기', Cancel:'취소' };
  return map[s] || s;
}

function goPage(p) { state.page = p; renderBidPage(); }

function selectBid(idx) {
  state.selected = state.bids[idx];
  document.querySelectorAll('.bid-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('bid-'+idx)?.classList.add('selected');
  openModal(state.selected);
}

// ── 상세 모달 ──
function openModal(b) {
  // 기존 모달 제거
  document.getElementById('bid-modal')?.remove();

  const fmtAmt = n => n > 0 ? fmtWon(n) : '-';
  const empty  = v => (!v || v === '-') ? '<span class="empty">-</span>' : v;
  const mono   = (v, cls='') => `<span class="modal-field-value ${cls} font-mono">${empty(v)}</span>`;

  // 첨부파일 HTML
  const filesHtml = b.files?.length
    ? b.files.map(f => `
        <a class="file-item" href="${f.url || '#'}" target="_blank" rel="noopener">
          <span class="file-icon">📄</span>
          <span class="file-name">${f.name}</span>
          <span class="file-arrow">${f.url ? '↗' : '링크없음'}</span>
        </a>`).join('')
    : '<span style="font-size:12px;color:var(--ink3);">첨부파일 없음</span>';

  const html = `
    <div class="modal-overlay" id="bid-modal" onclick="closeModalOutside(event)">
      <div class="modal">
        <div class="modal-head">
          <div class="modal-head-text">
            <div class="modal-no">${b.no} · ${b.org} · <span class="bid-tag ${b.status==='PreAttendProgress'?'bid-tag-blue':'bid-tag-gray'}" style="padding:1px 6px;">${statusLabel(b.status)}</span></div>
            <div class="modal-title">${b.title}</div>
          </div>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>

        <div class="modal-body">

          <!-- 금액 -->
          <div class="modal-section">
            <div class="modal-section-title">💰 금액 정보</div>
            <div class="modal-grid">
              <div class="modal-field">
                <div class="modal-field-label">도급(사정)금액</div>
                <div class="modal-field-value amount">${b.budget > 0 ? fmtWon(b.budget) : '-'}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">추정금액</div>
                <div class="modal-field-value amount">${fmtAmt(b.estimatedPrice)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">사정금액</div>
                <div class="modal-field-value amount">${fmtAmt(b.assessmentAmount)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">예비가격 초기금액</div>
                <div class="modal-field-value amount">${fmtAmt(b.preBidPrice)}</div>
              </div>
            </div>
          </div>

          <!-- 입찰 방법 -->
          <div class="modal-section">
            <div class="modal-section-title">📋 입찰 방법</div>
            <div class="modal-grid">
              <div class="modal-field">
                <div class="modal-field-label">낙찰방법</div>
                <div class="modal-field-value">${empty(b.competitionType)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">계약방법 (도급구분)</div>
                <div class="modal-field-value">${empty(b.contractType)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">입찰방법</div>
                <div class="modal-field-value">${empty(b.openMethod)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">구매유형</div>
                <div class="modal-field-value">${empty(b.purchaseType)}</div>
              </div>
            </div>
          </div>

          <!-- 일정 -->
          <div class="modal-section">
            <div class="modal-section-title">📅 일정</div>
            <div class="modal-grid">
              <div class="modal-field">
                <div class="modal-field-label">입찰신청 시작일시</div>
                <div class="modal-field-value date">${empty(b.bidBegin)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">입찰신청 마감일시</div>
                <div class="modal-field-value date">${empty(b.deadline)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">납기일</div>
                <div class="modal-field-value date">${empty(b.deliveryDueDate)}</div>
              </div>
            </div>
          </div>

          <!-- 참가자격 -->
          <div class="modal-section">
            <div class="modal-section-title">✅ 참가자격</div>
            <div class="modal-grid">
              <div class="modal-field full">
                <div class="modal-field-label">참가자격 제한</div>
                <div class="modal-field-value">${formatRestrict(b.bidAttendRestrict)}</div>
              </div>
            </div>
          </div>

          <!-- 첨부파일 -->
          <div class="modal-section">
            <div class="modal-section-title">📎 첨부파일</div>
            <div class="file-list">${filesHtml}</div>
          </div>

        </div>

        <div class="modal-foot">
          <button class="btn btn-secondary btn-sm" onclick="goAnalyzeFromModal()">📊 낙찰 분석</button>
          <button class="btn btn-sm" style="background:var(--bg2);border:1px solid var(--border2);" onclick="closeModal()">닫기</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('bid-modal')?.remove();
  document.body.style.overflow = '';
}

function closeModalOutside(e) {
  if (e.target.id === 'bid-modal') closeModal();
}

function goAnalyzeFromModal() {
  closeModal();
  goAnalyze();
}

function goAnalyze() {
  if (!state.selected) return;
  const b = state.selected;
  document.getElementById('a-title').value  = b.title;
  document.getElementById('a-budget').value = b.budget ? b.budget.toLocaleString() : '';
  document.getElementById('a-org').value    = b.org;
  if (b.type?.includes('Product') || b.type?.includes('물품')) document.getElementById('a-type').value = '물품 (보온재·단열재)';
  else if (b.type?.includes('Service') || b.type?.includes('용역')) document.getElementById('a-type').value = '용역 (유지보수)';
  switchTab('analyze');
}

// ── AI ANALYSIS ──
const STEPS = ['공고 유형 분류 중...','보온 낙찰 통계 대조 중...','예상 낙찰가 계산 중...','낙찰 가능성 산출 중...','전략 수립 중...'];

async function runAnalysis() {
  const title    = document.getElementById('a-title').value.trim();
  const budget   = parseInt(document.getElementById('a-budget').value.replace(/,/g,'')) || 0;
  const org      = document.getElementById('a-org').value.trim();
  const method   = document.getElementById('a-method').value;
  const type     = document.getElementById('a-type').value;
  const strength = document.getElementById('a-strength').value;

  if (!title || !budget) { alert('공고명과 예정가격을 입력하세요.'); return; }

  document.getElementById('analysis-loading').style.display = 'block';
  document.getElementById('analysis-result').innerHTML = '';

  let si = 0;
  const iv = setInterval(() => {
    if (si < STEPS.length) document.getElementById('a-load-msg').textContent = STEPS[si++];
  }, 700);

  const prompt = `당신은 한국 발전공기업 보온 분야 입찰 전문 분석가입니다.
아래 공고를 분석하여 JSON만 반환하세요 (마크다운 없이).

공고명: ${title}
예정가격: ${budget.toLocaleString()}원
발주기관: ${org}
낙찰방법: ${method}
공고종류: ${type}
우리회사경쟁력: ${strength}

보온 분야 한전계열 실제 낙찰 통계:
- 보온공사 최저가: 평균 낙찰률 87~92%, 경쟁 5~15개사
- 보온자재 물품구매: 평균 낙찰률 82~91%, 경쟁 3~8개사
- 적격심사: 평균 낙찰률 88~95%, 경쟁 2~6개사

JSON:
{
  "expectedRate": 숫자,
  "expectedPrice": 숫자,
  "recommendedRate": 숫자,
  "recommendedPrice": 숫자,
  "probability": 숫자,
  "probabilityLabel": "문자열",
  "competitorCount": 숫자,
  "competitionLevel": "치열/보통/한산",
  "keyRisk": "문자열",
  "keyStrength": "문자열",
  "priceRanges": [
    {"label":"역대최저낙찰","rate":숫자,"color":"#e74c3c"},
    {"label":"AI예상낙찰가","rate":숫자,"color":"#1a5a8a"},
    {"label":"권장투찰가","rate":숫자,"color":"#1a7a3a"},
    {"label":"적정상한선","rate":숫자,"color":"#aaaaaa"}
  ],
  "strategies": [
    {"icon":"💡","head":"제목","desc":"설명","tag":"핵심","tagType":"r"},
    {"icon":"📊","head":"제목","desc":"설명","tag":"중요","tagType":"b"},
    {"icon":"⚠️","head":"제목","desc":"설명","tag":"주의","tagType":"r"},
    {"icon":"📄","head":"제목","desc":"설명","tag":"참고","tagType":"g"}
  ]
}`;

  try {
    const res  = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, budget, org, method, type, strength }),
    });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || 'AI 분석 오류');
    clearInterval(iv);
    document.getElementById('analysis-loading').style.display = 'none';
    renderAnalysis(r, budget, title, org, method, type);
  } catch (err) {
    clearInterval(iv);
    document.getElementById('analysis-loading').style.display = 'none';
    alert('분석 오류: ' + err.message);
  }
}

function renderAnalysis(r, budget, title, org, method, type) {
  const gaugeOffset = 226 - (r.probability/100)*226;
  const gaugeColor  = r.probability>=65?'#1a7a3a':r.probability>=40?'#b5700a':'#c0392b';
  const pr=r.priceRanges, minR=Math.min(...pr.map(p=>p.rate)), maxR=Math.max(...pr.map(p=>p.rate)), span=maxR-minR||1;

  const prHtml = pr.map(pp => {
    const pct = ((pp.rate-minR)/span*75+10).toFixed(1);
    return `<div class="prange">
      <div class="prange-header"><span class="prange-lbl">${pp.label}</span><span class="prange-v" style="color:${pp.color}">${pp.rate}%</span></div>
      <div class="prange-bar">
        <div class="prange-fill" style="left:0;width:${pct}%;background:${pp.color}30;"></div>
        <div class="prange-dot" style="left:${pct}%;background:${pp.color};"></div>
      </div>
      <div class="prange-price">${budget?fmtWon(Math.round(budget*pp.rate/100)):'-'}</div>
    </div>`;
  }).join('');

  document.getElementById('analysis-result').innerHTML = `
    <div class="verdict-bar">
      <div class="vd-item">
        <div class="vd-label">AI 예상 낙찰가</div>
        <div class="vd-val">${fmtWon(r.expectedPrice)}</div>
        <div class="vd-sub">예정가 대비 ${r.expectedRate}%</div>
      </div>
      <div class="vd-divider"></div>
      <div class="vd-item vd-prob">
        <div class="gauge-wrap">
          <svg width="90" height="90" viewBox="0 0 90 90" style="transform:rotate(-90deg)">
            <circle cx="45" cy="45" r="36" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="7"/>
            <circle cx="45" cy="45" r="36" fill="none" stroke="${gaugeColor}" stroke-width="7" stroke-linecap="round" stroke-dasharray="226" stroke-dashoffset="${gaugeOffset}"/>
          </svg>
          <div class="gauge-text-over">
            <div class="gauge-pct" style="color:${gaugeColor}">${r.probability}%</div>
            <div class="gauge-unit">낙찰률</div>
          </div>
        </div>
        <div style="font-size:10px;opacity:.6;margin-top:4px;">${r.probabilityLabel}</div>
      </div>
      <div class="vd-divider"></div>
      <div class="vd-item" style="text-align:right;">
        <div class="vd-label">권장 투찰가</div>
        <div class="vd-val">${fmtWon(r.recommendedPrice)}</div>
        <div class="vd-sub">투찰률 ${r.recommendedRate}%</div>
      </div>
    </div>
    <div class="res-grid">
      <div class="res-box">
        <div class="res-box-head">공고 정보</div>
        <div class="res-box-body">
          <table class="info-tbl">
            <tr><td class="k">공고명</td><td class="v" style="font-size:11px;">${title}</td></tr>
            <tr><td class="k">발주기관</td><td class="v">${org}</td></tr>
            <tr><td class="k">예정가격</td><td class="v">${fmtWon(budget)}</td></tr>
            <tr><td class="k">낙찰방법</td><td class="v">${method}</td></tr>
            <tr><td class="k">공고종류</td><td class="v">${type}</td></tr>
            <tr><td class="k">예상경쟁사</td><td class="v">${r.competitorCount}개사 (${r.competitionLevel})</td></tr>
            <tr><td class="k">주요기회</td><td class="v" style="color:var(--green);font-size:11px;">${r.keyStrength}</td></tr>
            <tr><td class="k">주요리스크</td><td class="v" style="color:var(--red);font-size:11px;">${r.keyRisk}</td></tr>
          </table>
        </div>
      </div>
      <div class="res-box">
        <div class="res-box-head">낙찰가 분포 (예정가 대비 %)</div>
        <div class="res-box-body">${prHtml}</div>
      </div>
    </div>
    <div class="res-box" style="margin-bottom:12px;">
      <div class="res-box-head">입찰 전략 추천</div>
      <div class="res-box-body">
        ${r.strategies.map(s=>`
          <div class="strat-item">
            <div class="strat-icon">${s.icon}</div>
            <div><div class="strat-head">${s.head}<span class="tag tag-${s.tagType}">${s.tag}</span></div>
            <div class="strat-desc">${s.desc}</div></div>
          </div>`).join('')}
      </div>
    </div>
    <div class="disc">⚠ AI 추정 참고용입니다. 실제 투찰 전 bigdata.kepco.co.kr 공고 원문을 반드시 확인하세요.</div>`;

  document.getElementById('analysis-result').scrollIntoView({behavior:'smooth',block:'start'});
}

// ── UTILS ──

// 참가자격 텍스트 줄바꿈 포맷 (가. 나. 다. 라. 마. 바. 사. 앞에서 줄바꿈)
function formatRestrict(text) {
  if (!text || text === '-') return '<span class="empty">-</span>';
  const formatted = text
    .replace(/\s*([\uac00-\u002e]?[가나다라마바사아자차카타파하]\.\s)/g, (match, p1, offset) => {
      return offset === 0 ? p1 : '\n' + p1;
    })
    // 한글 자모 범위로 처리 (가~하 + 점)
    .replace(/([^\n])\s+([가나다라마바사아자차카타파하]\.)/g, '$1\n$2');
  return formatted
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => `<p class="restrict-line">${line}</p>`)
    .join('');
}

function fmtWon(n) {
  if (!n) return '-';
  if (n>=100000000) return (n/100000000).toFixed(2)+'억원';
  if (n>=10000) return Math.round(n/10000).toLocaleString()+'만원';
  return n.toLocaleString()+'원';
}
function fmtNum(el) {
  const v = el.value.replace(/[^0-9]/g,'');
  el.value = v ? parseInt(v).toLocaleString() : '';
}
