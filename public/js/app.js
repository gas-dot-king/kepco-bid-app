// public/js/app.js

const state = { bids: [], page: 1, perPage: 10, selected: null };

// ── INIT ──
window.addEventListener('DOMContentLoaded', async () => {
  const badge = document.getElementById('serverBadge');

  // ── 서버 상태 확인 (가벼운 ping, 외부 API 호출 없음) ──
  try {
    const res  = await fetch('/api/ping');
    const data = await res.json();
    if (!data.ok) throw new Error('서버 오류');
    const kepco  = data.kepco  ? '✅ 한전API' : '❌ 한전API없음';
    badge.textContent = `● 서버 연결됨 · ${kepco}`;
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
const TAB_NAMES = ['search','simulate'];
function switchTab(name) {
  TAB_NAMES.forEach((n, i) => {
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

  const fmtAmt = n => n > 0 ? fmtWonFull(n) : '-';
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
                <div class="modal-field-value amount">${b.budget > 0 ? fmtWonFull(b.budget) : '-'}</div>
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
                <div class="modal-field-value">${empty(b.bidType)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">계약방법 (도급구분)</div>
                <div class="modal-field-value">${empty(b.contractType)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">입찰방법</div>
                <div class="modal-field-value">${empty(b.vendorAwardType)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">개찰방법</div>
                <div class="modal-field-value">${empty(b.openMethod)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">계약방법</div>
                <div class="modal-field-value">${empty(b.competitionType)}</div>
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

          <!-- 공고 정보 -->
          <div class="modal-section">
            <div class="modal-section-title">🏢 공고 정보</div>
            <div class="modal-grid">
              <div class="modal-field">
                <div class="modal-field-label">공고등록일시</div>
                <div class="modal-field-value date">${empty(b.noticeDate)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">투찰시작일시</div>
                <div class="modal-field-value date">${empty(b.bidBeginDatetime)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">입찰 종료 일시</div>
                <div class="modal-field-value date">${empty(b.bidEndDatetime)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">발주기관 정식 명칭</div>
                <div class="modal-field-value">${empty(b.placeName)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">계약의뢰부서</div>
                <div class="modal-field-value">${empty(b.contractReqDeptName)}</div>
              </div>
              <div class="modal-field">
                <div class="modal-field-label">계약담당자</div>
                <div class="modal-field-value">${empty(b.creatorName)}</div>
              </div>
              <div class="modal-field full">
                <div class="modal-field-label">낙찰자결정방법 상세</div>
                <div class="modal-field-value">${empty(b.bidTypeDetail)}</div>
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

// ── UTILS ──

// 참가자격 텍스트 줄바꿈 포맷 (가. 나. 다. 라. 마. 바. 사. 앞에서 줄바꿈)
function formatRestrict(text) {
  if (!text || text === '-') return '<span class="empty">-</span>';
  // 한글 항목 기호(가. 나. 다. ...) 앞에서 줄바꿈
  const formatted = text.replace(/([^\n])\s*([가나다라마바사아자차카타파하]\.)/g, '$1\n$2');
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

// 1원 단위까지 전체 표기 (도급·사정금액 전용)
function fmtWonFull(n) {
  if (!n) return '-';
  return n.toLocaleString('ko-KR') + '원';
}
function fmtNum(el) {
  const v = el.value.replace(/[^0-9]/g,'');
  el.value = v ? parseInt(v).toLocaleString() : '';
}
