// server/index.js
require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── 과거 데이터 파일 경로 ──
const HISTORY_FILE = path.join(__dirname, '../data/history.json');
function ensureDataDir() {
  const dir = path.join(__dirname, '../data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, JSON.stringify({ records: [] }));
}
ensureDataDir();

// ── 과거 데이터 조회 ──
app.get('/api/history', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    res.json(data);
  } catch { res.json({ records: [] }); }
});

// ── 과거 데이터 저장 ──
app.post('/api/history', (req, res) => {
  try {
    const data   = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    data.records.push(req.body);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── 과거 데이터 삭제 ──
app.delete('/api/history/:id', (req, res) => {
  try {
    const data   = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    data.records = data.records.filter(r => String(r.id) !== String(req.params.id));
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── 날짜 유틸 (YYYYMMDD) ──
function dateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// ── 응답 정규화 (실제 필드명 기반) ──
function normalize(item) {
  const COMPANY = {
    COM01: '한국전력공사', COM02: '한국서부발전', COM03: '한전국제원자력대학원',
    COM04: '한국남부발전', COM05: '한국중부발전', COM06: '한국남동발전',
    COM08: '한국동서발전', COM09: '한국전력기술', COM10: '한전KPS',
    COM11: '한국전력거래소', COM12: '한국원자력연료', COM14: '한국발전교육원',
    COM16: '한국해상풍력', COM19: 'KAPES',
  };
  // 첨부파일 목록 (최대 5개)
  const files = [];
  for (let i = 1; i <= 5; i++) {
    if (item[`filename${i}`] && item[`filename${i}`] !== '-') {
      files.push({ name: item[`filename${i}`], url: item[`filenlink${i}`] ?? null });
    }
  }

  return {
    // ── 기본 정보 ──
    no        : item.no        ?? '-',
    title     : item.name      ?? '-',
    org       : COMPANY[item.companyId] ?? item.companyId ?? '-',
    companyId : item.companyId ?? '',
    status    : item.progressState ?? '-',
    source    : COMPANY[item.companyId] ?? item.companyId ?? '한전계열',

    // ── 금액 정보 ──
    budget          : parseFloat(item.presumedPrice    ?? item.estimatedPrice ?? 0),  // 도급(사정)금액
    estimatedPrice  : parseFloat(item.estimatedPrice   ?? 0),   // 추정금액
    preBidPrice     : parseFloat(item.preBidPrice      ?? 0),   // 예비가격초기금액
    assessmentAmount: parseFloat(item.assessmentAmount ?? 0),   // 사정금액

    // ── 방법 정보 ──
    contractType  : item.contractType   ?? '-',   // 도급구분
    purchaseType  : item.purchaseType   ?? '-',   // 계약방법
    openMethod    : item.openMethod     ?? '-',   // 입찰방법
    competitionType: item.competitionType ?? '-', // 낙찰방법

    // ── 일정 정보 ──
    bidBegin  : item.bidAttendReqBeginDatetime
                  ? item.bidAttendReqBeginDatetime.slice(0, 16).replace('T',' ')
                  : '-',
    deadline  : item.bidAttendReqCloseDatetime
                  ? item.bidAttendReqCloseDatetime.slice(0, 16).replace('T',' ')
                  : (item.endDatetime?.slice(0, 10) ?? '-'),
    deliveryDueDate: item.deliveryDueDate ?? '-',  // 납기일

    // ── 참가 자격 ──
    bidAttendRestrict: item.bidAttendRestrict ?? '-',

    // ── 첨부파일 ──
    files,
  };
}

// ── 회사 목록 ──
const COMPANIES = {
  '': '전체',
  COM01: '한국전력공사', COM02: '한국서부발전',
  COM04: '한국남부발전', COM05: '한국중부발전',
  COM06: '한국남동발전', COM08: '한국동서발전',
  COM09: '한국전력기술',  COM10: '한전KPS',
};

app.get('/api/companies', (req, res) => res.json(COMPANIES));

// ── 서버 상태 확인 (가벼운 헬스체크) ──
app.get('/api/ping', (req, res) => {
  res.json({
    ok     : true,
    kepco  : !!process.env.KEPCO_API_KEY,
    gemini : !!process.env.GEMINI_API_KEY,
    ts     : Date.now(),
  });
});

// ── 디버그 ──
app.get('/api/debug', async (req, res) => {
  const apiKey = process.env.KEPCO_API_KEY;
  try {
    const r = await axios.get('https://bigdata.kepco.co.kr/openapi/v1/electContract.do', {
      params: {
        apiKey,
        companyId      : 'COM04',
        noticeBeginDate: dateStr(-30),
        noticeEndDate  : dateStr(30),
        returnType     : 'json',
      },
      timeout: 10000,
    });
    res.json({ count: r.data?.data?.length ?? 0, sample: r.data?.data?.slice(0, 2) });
  } catch (err) {
    res.json({ error: err.message, status: err.response?.status });
  }
});

// ── 메인 입찰 조회 API ──
app.get('/api/bids', async (req, res) => {
  const {
    keyword    = '보온',
    companyId  = '',      // 빈 문자열 = 전체
    days       = 25,
    futureDays = 4,
  } = req.query;

  const apiKey = process.env.KEPCO_API_KEY;
  if (!apiKey || apiKey.startsWith('여기에')) {
    return res.status(500).json({ error: 'KEPCO_API_KEY 미설정 (.env 파일 확인)', items: [] });
  }

  try {
    // 한전 bigdata API: apiKey는 쿼리스트링으로, name은 클라이언트 필터로 처리
    const params = {
      apiKey,
      noticeBeginDate: dateStr(-parseInt(days)),
      noticeEndDate  : dateStr(parseInt(futureDays)),
      returnType     : 'json',
    };
    if (companyId) params.companyId = companyId;
    // name 파라미터는 401 유발 가능 → 전체 조회 후 클라이언트 필터링으로 대체

    const r = await axios.get('https://bigdata.kepco.co.kr/openapi/v1/electContract.do', {
      params,
      timeout: 12000,
    });

    const raw = Array.isArray(r.data?.data) ? r.data.data : [];

    // 클라이언트 사이드 키워드 필터
    const filtered = keyword
      ? raw.filter(i => (i.name ?? '').includes(keyword))
      : raw;

    return res.json({
      total: filtered.length,
      items: filtered.map(normalize),
    });

  } catch (err) {
    console.error('[KEPCO]', err.response?.status, err.message);
    return res.status(502).json({
      error: `API 오류(${err.response?.status ?? err.code}): ${err.message}`,
      items: [],
    });
  }
});


// ── AI 낙찰 분석 (Gemini) ──
app.post('/api/analyze', async (req, res) => {
  const { title, budget, org, method, type, strength } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY 미설정' });

  const prompt = `당신은 한국 발전공기업 보온 분야 입찰 전문 분석가입니다.
아래 공고를 분석하여 JSON만 반환하세요 (마크다운 없이, 순수 JSON).

공고명: ${title}
예정가격: ${Number(budget).toLocaleString()}원
발주기관: ${org}
낙찰방법: ${method}
공고종류: ${type}
우리회사경쟁력: ${strength}

보온 분야 한전계열 실제 낙찰 통계:
- 보온공사 최저가: 평균 낙찰률 87~92%, 경쟁 5~15개사
- 보온자재 물품구매: 평균 낙찰률 82~91%, 경쟁 3~8개사
- 적격심사: 평균 낙찰률 88~95%, 경쟁 2~6개사

JSON만 반환:
{
  "expectedRate": 예상낙찰률숫자,
  "expectedPrice": 예상낙찰가숫자,
  "recommendedRate": 권장투찰률숫자,
  "recommendedPrice": 권장투찰가숫자,
  "probability": 낙찰가능성숫자,
  "probabilityLabel": "한마디평가",
  "competitorCount": 경쟁업체수숫자,
  "competitionLevel": "치열또는보통또는한산",
  "keyRisk": "리스크한문장",
  "keyStrength": "기회한문장",
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
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 20000 }
    );
    const raw  = r.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const json = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return res.json(json);
  } catch (err) {
    console.error('[GEMINI]', err.response?.status, err.message);
    return res.status(502).json({ error: `Gemini 오류: ${err.message}` });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

app.listen(PORT, () => {
  console.log(`\n🔌 서버 실행 중: http://localhost:${PORT}`);
  console.log(`⚡ 한전 bigdata API: ${process.env.KEPCO_API_KEY ? '✅ 키 있음' : '❌ 키 없음'}`);
  console.log(`🤖 Gemini API    : ${process.env.GEMINI_API_KEY ? '✅ 키 있음' : '❌ 키 없음'}`);
  console.log(`🔍 디버그: http://localhost:${PORT}/api/debug\n`);
});

// ── AI 낙찰 분석 (Gemini) ──
// 위치: SPA fallback 앞에 추가
