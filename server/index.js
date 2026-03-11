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
    budget          : parseFloat(item.presumedPrice         ?? 0),  // 도급(사정)금액
    estimatedPrice  : parseFloat(item.presumedAmount        ?? 0),  // 추정금액
    preBidPrice     : parseFloat(item.estimatedPriceBasicAmount ?? 0), // 예비가격기초금액
    assessmentAmount: parseFloat(item.approximateAmount     ?? 0),  // 사정금액

    // ── 방법 정보 ──
    contractType  : item.itemType        ?? '-',   // 도급구분
    purchaseType  : item.purchaseType    ?? '-',   // 구매유형
    openMethod    : item.openMethod      ?? '-',   // 개찰방법
    vendorAwardType: item.vendorAwardType ?? '-',  // 입찰방법
    competitionType: item.competitionType ?? '-',  // 계약방법
    bidType       : item.bidType         ?? '-',   // 낙찰방법

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

    // ── 공고 상세 정보 ──
    noticeDate            : item.noticeDate
                              ? item.noticeDate.slice(0, 16).replace('T',' ')
                              : (item.createDatetime
                                  ? item.createDatetime.slice(0, 16).replace('T',' ')
                                  : '-'),
    bidBeginDatetime      : item.beginDatetime
                              ? item.beginDatetime.slice(0, 16).replace('T',' ')
                              : '-',
    bidEndDatetime        : item.endDatetime
                              ? item.endDatetime.slice(0, 16).replace('T',' ')
                              : '-',
    placeName             : item.placeName               ?? '-',
    contractReqDeptName   : item.contractReqDepartmentName ?? '-',
    creatorName           : item.creatorName             ?? '-',
    bidTypeDetail         : item.bidTypeDetail           ?? '-',

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

// ── 서버 상태 확인 ──

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
    keyword    = '',
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


// ═══════════════════════════════════════════════
// ── 나라장터(G2B) API ──────────────────────────
// ═══════════════════════════════════════════════

// 날짜 유틸 (YYYYMMDDHHmm 형식, 나라장터 API용)
function g2bDateStr(offsetDays = 0, endOfDay = false) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  return ymd + (endOfDay ? '2359' : '0000');
}

// 나라장터 업무 구분 → 서비스 경로 매핑
const G2B_SERVICE = {
  '용역': { bid: 'getBidPblancListInfoServc',     result: 'getBidResultListInfoServc'     },
  '공사': { bid: 'getBidPblancListInfoCnstwk',    result: 'getBidResultListInfoCnstwk'    },
  '물품': { bid: 'getBidPblancListInfoThng',      result: 'getBidResultListInfoThng'      },
  '외자': { bid: 'getBidPblancListInfoFrgcpt',    result: 'getBidResultListInfoFrgcpt'    },
};

const G2B_BASE = 'https://apis.data.go.kr/1230000/BidPublicInfoService';
const G2B_RESULT_BASE = 'https://apis.data.go.kr/1230000/BidResultInfoService';

// 입찰공고 정규화
function normalizeG2bBid(item) {
  return {
    bidNtceNo     : item.bidNtceNo       ?? '-',
    bidNtceOrd    : item.bidNtceOrd      ?? '-',
    title         : item.bidNtceNm       ?? '-',
    org           : item.ntceInsttNm     ?? '-',
    demandOrg     : item.dminsttNm       ?? '-',
    budget        : parseFloat(item.presmptPrce   ?? 0),   // 추정가격
    basePrice     : parseFloat(item.bsamt         ?? 0),   // 기초금액
    bidMethod     : item.bidMthdNm       ?? '-',
    contractMethod: item.cntrctCnclsMthdNm ?? '-',
    openDate      : item.opengDt         ?? '-',
    bidBegin      : item.bidNtceBgn      ?? '-',
    bidEnd        : item.bidNtceEnd      ?? '-',
    deadline      : item.bidClsedt       ?? item.bidNtceEnd ?? '-',
    industryType  : item.indstrytyCd     ?? '-',
    ntceKindNm    : item.ntceKindNm      ?? '-',   // 공고종류
    url           : item.ntceSpecDocUrl  ?? null,
  };
}

// 낙찰정보 정규화
function normalizeG2bResult(item) {
  return {
    bidNtceNo      : item.bidNtceNo        ?? '-',
    title          : item.bidNtceNm        ?? '-',
    org            : item.ntceInsttNm      ?? '-',
    successBidder  : item.sucsfbidCorpNm   ?? '-',   // 낙찰자
    successBid     : parseFloat(item.sucsfbidAmt  ?? 0),  // 낙찰금액
    presmptPrce    : parseFloat(item.presmptPrce  ?? 0),  // 추정가격
    basePrice      : parseFloat(item.bsamt        ?? 0),  // 기초금액
    predtPrce      : parseFloat(item.predtPrce    ?? 0),  // 예정가격
    sucsfbidRate   : item.sucsfbidRate     ?? '-',         // 낙찰률
    openDate       : item.opengDt          ?? '-',
    bidCloseDate   : item.bidClsedt        ?? '-',
    drwtPrceBas    : parseFloat(item.drwtPrceBas  ?? 0),  // 복수예비가 기초금액
  };
}

// ── 나라장터 입찰공고 조회 ──
app.get('/api/g2b/bids', async (req, res) => {
  const {
    keyword = '',
    type    = '용역',
    days    = 15,
  } = req.query;

  const apiKey = process.env.G2B_BID_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'G2B_BID_API_KEY 미설정 (.env 파일 확인)', items: [] });
  }

  const svcPath = G2B_SERVICE[type]?.bid ?? G2B_SERVICE['용역'].bid;

  try {
    const params = {
      ServiceKey  : apiKey,
      pageNo      : 1,
      numOfRows   : 100,
      type        : 'json',
      inqryDiv    : 1,                          // 1=등록일시
      inqryBgnDt  : g2bDateStr(-parseInt(days), false),
      inqryEndDt  : g2bDateStr(0, true),
    };

    const r = await axios.get(`${G2B_BASE}/${svcPath}`, { params, timeout: 15000 });

    let raw = [];
    // 응답 구조: response.body.items (배열 또는 단일 객체)
    const body = r.data?.response?.body;
    if (body) {
      const items = body.items?.item ?? body.items ?? [];
      raw = Array.isArray(items) ? items : [items];
    }

    const filtered = keyword
      ? raw.filter(i => (i.bidNtceNm ?? '').includes(keyword))
      : raw;

    return res.json({
      total: body?.totalCount ?? filtered.length,
      items: filtered.map(normalizeG2bBid),
    });

  } catch (err) {
    console.error('[G2B BID]', err.response?.status, err.message);
    return res.status(502).json({
      error: `나라장터 API 오류(${err.response?.status ?? err.code}): ${err.message}`,
      items: [],
    });
  }
});

// ── 나라장터 낙찰정보 조회 ──
app.get('/api/g2b/results', async (req, res) => {
  const {
    keyword = '',
    type    = '용역',
    days    = 15,
  } = req.query;

  const apiKey = process.env.G2B_RESULT_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'G2B_RESULT_API_KEY 미설정 (.env 파일 확인)', items: [] });
  }

  const svcPath = G2B_SERVICE[type]?.result ?? G2B_SERVICE['용역'].result;

  try {
    const params = {
      ServiceKey  : apiKey,
      pageNo      : 1,
      numOfRows   : 100,
      type        : 'json',
      inqryDiv    : 1,
      inqryBgnDt  : g2bDateStr(-parseInt(days), false),
      inqryEndDt  : g2bDateStr(0, true),
    };

    const r = await axios.get(`${G2B_RESULT_BASE}/${svcPath}`, { params, timeout: 15000 });

    let raw = [];
    const body = r.data?.response?.body;
    if (body) {
      const items = body.items?.item ?? body.items ?? [];
      raw = Array.isArray(items) ? items : [items];
    }

    const filtered = keyword
      ? raw.filter(i => (i.bidNtceNm ?? '').includes(keyword))
      : raw;

    return res.json({
      total: body?.totalCount ?? filtered.length,
      items: filtered.map(normalizeG2bResult),
    });

  } catch (err) {
    console.error('[G2B RESULT]', err.response?.status, err.message);
    return res.status(502).json({
      error: `나라장터 낙찰정보 API 오류(${err.response?.status ?? err.code}): ${err.message}`,
      items: [],
    });
  }
});

// ── ping 업데이트 (G2B 키 상태 포함) ──
app.get('/api/ping', (req, res) => {
  res.json({
    ok    : true,
    kepco : !!process.env.KEPCO_API_KEY,
    g2b   : !!(process.env.G2B_BID_API_KEY || process.env.G2B_RESULT_API_KEY),
    ts    : Date.now(),
  });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

app.listen(PORT, () => {
  console.log(`\n🔌 서버 실행 중: http://localhost:${PORT}`);
  console.log(`⚡ 한전 bigdata API: ${process.env.KEPCO_API_KEY ? '✅ 키 있음' : '❌ 키 없음'}`);
  console.log(`🏛️  나라장터 입찰공고 API: ${process.env.G2B_BID_API_KEY ? '✅ 키 있음' : '❌ 키 없음'}`);
  console.log(`🏆 나라장터 낙찰정보 API: ${process.env.G2B_RESULT_API_KEY ? '✅ 키 있음' : '❌ 키 없음'}`);
  console.log(`🔍 디버그: http://localhost:${PORT}/api/debug\n`);
});


