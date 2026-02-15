# Classroom Web React

React로 리팩토링된 하위문항 생성 웹 애플리케이션입니다.

## 프로젝트 구조

```
src/
├── components/          # React 컴포넌트 (각 컴포넌트별 CSS 모듈 포함)
│   ├── Header/
│   ├── WorkflowTabs/
│   ├── ProblemInput/
│   └── CoTSteps/
├── contexts/            # React Context (상태 관리)
│   └── AppContext.jsx
├── hooks/              # 커스텀 훅
│   ├── useMathJax.js
│   └── useStorage.js
├── services/           # API 서비스
│   └── api.js
├── utils/              # 유틸리티 함수
│   └── formatting.js
├── App.jsx             # 메인 App 컴포넌트
├── App.module.css      # App 컴포넌트 스타일
├── main.jsx            # 진입점
└── index.css           # 전역 스타일
```

## CSS 모듈 구조

각 컴포넌트는 자체 CSS 모듈 파일을 가지고 있습니다:

- `ComponentName.module.css` 형식
- 컴포넌트별로 스타일이 분리되어 관리됨
- CSS 클래스명이 자동으로 해시되어 충돌 방지

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 빌드
npm run build
```

## 환경 변수

`.env` 파일에 다음 변수를 설정할 수 있습니다:

```
VITE_API_BASE_URL=http://localhost:8000
```

## 포트 설정

- **프론트엔드**: `http://localhost:3000` (Vite)
- **백엔드 API**: `http://localhost:8000` — `/api` 요청은 Vite 프록시로 8000으로 전달됨

백엔드 서버 실행:

```bash
cd /Users/Doh/Desktop/prj-hamamath-server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**"저장 목록을 불러올 수 없습니다" 오류 시**

- 백엔드가 8000 포트에서 실행 중인지 확인
- 배포 환경에서는 빌드 시 `VITE_API_BASE_URL`을 백엔드 URL로 설정했는지 확인 (위 환경 변수 섹션 참고)

**백엔드 (API) 참고 — 사용자 ID 헤더**

- HTTP 헤더는 ISO-8859-1만 허용되므로, 한글 등이 포함된 사용자 ID는 프론트에서 Base64로 인코딩해 보냅니다.
- `X-User-Id-Encoding: base64`가 있으면 `X-User-Id` 값을 Base64 디코딩한 UTF-8 문자열로 사용하면 됩니다. `X-Admin-View-User-Encoding: base64`도 동일하게 처리하면 됩니다.

## 주요 기능

- ✅ 문제 입력 및 CoT 생성
- ✅ 8단계 풀이과정 표시
- ✅ MathJax 수식 렌더링
- ✅ 컴포넌트별 CSS 모듈 분리
- ✅ Context API를 통한 상태 관리
- ✅ 커스텀 훅을 통한 재사용 가능한 로직

## 개발 중인 기능

- 하위문항 생성 (GuidelineSubQuestions 컴포넌트)
- 검증 및 재생성 기능
- 결과 저장/불러오기
- Word 파일 다운로드
- 사이드바 및 모달 컴포넌트

## 기술 스택

- React 18
- Vite
- CSS Modules
- MathJax 3.x
