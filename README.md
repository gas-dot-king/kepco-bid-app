# 보온 입찰 통합 분석기

한국전력 · 남부발전 · 서부발전 보온 입찰 실시간 조회 + AI 낙찰 예측 앱

---

## 📁 폴더 구조

```
kepco-bid-app/
├── server/
│   └── index.js       ← Node.js 프록시 서버 (API 키 보호)
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── .env               ← API 키 설정 (Git에 올리지 마세요!)
├── .gitignore
└── package.json
```

---

## 🚀 실행 방법 (VS Code)

### 1. 터미널 열기
VS Code에서 `Ctrl + \`` (백틱)

### 2. 패키지 설치
```bash
npm install
```

### 3. API 키 설정
`.env` 파일을 열어 한전 API 키 입력:
```
KEPCO_API_KEY=여기에_재발급된_한전_API_키_입력
```
※ 남부·서부발전 공공 키는 이미 입력되어 있습니다.

### 4. 서버 실행

**개발 모드** (파일 수정 시 자동 재시작):
```bash
npm run dev
```

**일반 실행**:
```bash
npm start
```

### 5. 브라우저에서 열기
```
http://localhost:3000
```

---

## 🔌 API 엔드포인트

| 경로 | 설명 |
|------|------|
| `GET /api/bids/kospo?keyword=보온` | 남부발전 입찰공고 조회 |
| `GET /api/bids/sebu?keyword=보온`  | 서부발전 입찰공고 조회 |
| `GET /api/bids/kepco?keyword=보온` | 한국전력 입찰공고 조회 |
| `GET /api/bids/all?keyword=보온`   | 전체 통합 조회 |

공통 파라미터: `keyword`, `pageNo`, `numOfRows`

---

## ⚠️ 주의사항

- `.env` 파일은 절대 GitHub에 올리지 마세요 (`.gitignore`에 포함됨)
- 한전 개인 API 키(`KEPCO_API_KEY`)는 재발급 후 `.env`에 입력
- AI 분석 결과는 참고용이며, 실제 투찰 전 공고 원문 확인 필수
- ✅ GitHub ↔ 샌드박스 동기화 테스트 성공!
