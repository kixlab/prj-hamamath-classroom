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
