# Classroom Web Application

이 디렉토리는 subQ generator 웹 애플리케이션의 프론트엔드 파일들을 포함합니다.

## 파일 구조

```
classroom_web/
├── index.html              # 메인 HTML 파일
├── css/
│   ├── base.css            # 기본 스타일 (리셋, body 등)
│   ├── layout.css          # 레이아웃 스타일
│   ├── components.css      # 컴포넌트 스타일 (카드, 스텝 등)
│   ├── buttons.css        # 버튼 스타일
│   ├── forms.css          # 폼 스타일
│   ├── sidebar.css        # 사이드바 스타일
│   ├── modal.css          # 모달 스타일
│   └── responsive.css     # 반응형 미디어 쿼리
├── js/
│   ├── config.js          # 전역 변수 및 설정
│   ├── dom.js             # DOM 요소 참조
│   ├── storage.js         # localStorage 관련 함수
│   ├── utils.js           # 유틸리티 함수 (포맷팅 등)
│   ├── api.js             # API 호출 함수
│   ├── ui.js              # UI 표시 함수 (displayResult 등)
│   ├── components/
│   │   ├── sidebar.js     # 사이드바 관련
│   │   ├── toggle.js      # 토글 버튼 관련
│   │   ├── form.js        # 폼 처리 및 이미지 업로드
│   │   ├── guideline.js   # Guideline 관련 로직
│   │   ├── events.js      # 이벤트 핸들러
│   │   └── export.js      # 워드 다운로드
│   └── main.js            # 메인 진입점 및 초기화
└── README.md              # 이 파일
```

## 사용 방법

1. 웹 서버를 통해 `index.html`을 열어야 합니다.
2. 브라우저에서 직접 열 경우 CORS 정책으로 인해 일부 기능이 작동하지 않을 수 있습니다.
3. 로컬 개발 서버를 사용하는 것을 권장합니다:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # 또는 Node.js (http-server)
   npx http-server
   ```

## 주요 기능

- 수학 문제 입력 및 풀이
- CoT (Chain of Thought) 풀이 과정 생성
- 하위 문항 생성 및 검증
- 결과 저장 및 불러오기
- 학습지 다운로드 (Word 파일)

## 의존성

- MathJax 3.x (LaTeX 수식 렌더링)
- Polyfill.io (ES6 지원)

## 모듈 구조

### JavaScript 모듈

- **config.js**: 전역 변수 및 상수 정의
- **dom.js**: DOM 요소 참조
- **storage.js**: localStorage를 통한 결과 저장/불러오기
- **utils.js**: 문자열 포맷팅, HTML 이스케이프 등 유틸리티 함수
- **api.js**: API 호출 함수 (문제 목록 로드 등)
- **ui.js**: 화면 표시 함수 (displayResult, displayComparison 등)
- **components/**: 각 컴포넌트별 기능 모듈

### CSS 모듈

- **base.css**: 기본 리셋 및 body 스타일
- **layout.css**: 컨테이너, 헤더 등 레이아웃 관련
- **components.css**: 카드, 스텝, 하위 문항 등 컴포넌트 스타일
- **buttons.css**: 모든 버튼 스타일
- **forms.css**: 폼 입력 필드 스타일
- **sidebar.css**: 사이드바 및 햄버거 메뉴 스타일
- **modal.css**: 모달 스타일
- **responsive.css**: 반응형 미디어 쿼리

## 개발 가이드

### 새로운 기능 추가 시

1. 기능에 맞는 모듈 선택 (또는 새 모듈 생성)
2. 해당 모듈에 함수/스타일 추가
3. `index.html`에 필요한 경우 새 파일 링크 추가

### 스타일 수정 시

- 컴포넌트별로 분리된 CSS 파일에서 수정
- 전역 스타일은 `base.css` 또는 `layout.css`에서 수정
