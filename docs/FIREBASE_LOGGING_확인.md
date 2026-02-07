# Firebase 로깅 저장 확인 방법

## 유저 스터디용 클릭 로그 (Firestore)

**모든 클릭**은 Firestore에 **컬렉션 이름 = 로그인한 아이디**로 저장됩니다. (예: 아이디 `doh`로 입장 → 컬렉션 `doh`에 문서 추가)

### Firestore 준비 (최초 1회)

1. **Firestore 데이터베이스 생성**
   - [Firebase Console](https://console.firebase.google.com) → **hamamath-classroom** → **Firestore Database**
   - "데이터베이스 만들기" → **테스트 모드** 또는 **프로덕션 모드** 선택 후 생성

2. **보안 규칙 설정** (클라이언트에서 쓰기 허용)
   - Firestore → **규칙** 탭에서 아래처럼 설정 (유저 스터디용: 모든 컬렉션에 문서 추가 허용)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{collectionId}/{docId} {
      allow read, write: if true;   // 스터디용: 컬렉션명=아이디, 문서=클릭 이벤트
    }
  }
}
```

3. **저장 구조 및 이벤트 종류**
   - **컬렉션 ID**: 로그인 시 입력한 아이디
   - **문서**: 이벤트 한 건 = Auto-ID 문서 하나 (클릭 + 아래 사용자/LLM 이벤트 모두 동일 컬렉션에 저장)
   - **이벤트 타입 (`eventType`) 요약**:
     - `click`: 모든 클릭 (target, clientX, clientY 등)
     - `problem_input`: 입력한 문제 정보 (problem, answer, solution, grade, hasImage)
     - `cot_output`: LLM CoT 결과 (problem, answer, grade, steps 등)
     - `cot_edit`: CoT 단계별 내용 수정 시 (stepId, step_name, originalContent, newContent)
     - `sub_question_generated`: 단계별 원본 하위문항 LLM 출력 (stepId, guide_sub_question, guide_sub_answer 등)
     - `sub_question_verified`: 검증 및 재생성 결과 (verification_result, re_sub_question, re_sub_answer 등)
     - `feedback_submitted`: 선생님 피드백 입력 (subqId, feedbackText)
     - `regenerated_output`: 피드백 반영 재생성 결과 (re_sub_question, re_sub_answer)
     - `edit_original` / `edit_regenerated`: 선생님이 원본/재생성 문항 수정 저장 (subqId, newQuestion, newAnswer)
     - `version_selected`: 원본 vs 재생성 선택 (subqId, version: "original" | "regenerated")
     - `confirm_next_clicked`: "확정 후 다음 문항 생성" 클릭
     - `rest_auto_generate_clicked`: "확정 후 나머지 문항 자동 생성" 클릭
     - `verification_viewed`: 검증 결과 보기 열었을 때 (subqId, verification_result 등)

### 클릭 로그 확인

- Firebase Console → **Firestore Database** → **데이터** 탭
- 아이디로 입장한 뒤 앱에서 클릭하면 **해당 아이디와 같은 이름의 컬렉션**이 생기고, 그 안에 클릭 문서가 실시간으로 추가됨 (예: `doh`, `user01`)

---

## 1. Firebase Analytics (GA4) 확인

앱 로드 시 `app_loaded` 이벤트가 Analytics로 전송됩니다. (집계용)

### 실시간 확인: DebugView (순서 중요)

1. **먼저 Chrome에서 디버그 모드 켜기**
   - Chrome 웹스토어에서 **"Google Analytics Debugger"** 확장 프로그램 설치
   - **앱을 열기 전에** 확장 프로그램 아이콘 클릭 → **Enable** 로 켜기 (아이콘이 파란색/활성 상태인지 확인)
   - 그 다음에 앱(예: http://localhost:8000) **새 탭**에서 열기

2. **Firebase 콘솔에서 DebugView 열기**
   - [Firebase Console](https://console.firebase.google.com) → 프로젝트 **hamamath-classroom** 선택
   - 왼쪽 **Analytics** → **DebugView** (또는 **디버그보기**) 선택
   - "디버그 디바이스가 선택되지 않음" 이면 아래 3번 후 **페이지 새로고침** 한 번 더 하기

3. **앱에서 이벤트 발생시키기**
   - 디버그 모드 켜진 상태로 **앱 페이지 새로고침** (F5)
   - 그러면 `app_loaded` 이벤트가 전송되고, **수십 초 안에** DebugView 중앙/왼쪽 스트림에 표시됨

4. **여전히 안 보일 때**
   - 광고 차단 확장 프로그램이 켜져 있으면 **해당 사이트에서 끄기** (localhost 허용)
   - Chrome 시크릿 창에서 **확장 프로그램만 GA Debugger 켜고** 다시 시도
   - Firebase Console → 프로젝트 설정 → **일반** 탭에서 **Google Analytics** 연결되어 있는지 확인

### 일반 보고서 (실서비스 데이터)

- **Analytics** → **보고서** → **이벤트**: 여기 데이터는 **최대 24~48시간 지연**될 수 있음
- 실시간 확인은 **DebugView + 디버그 모드** 조합으로 하는 것이 좋음

---

## 3. 코드에서 Analytics 테스트 이벤트 보내기

Analytics에 이벤트가 잘 전송되는지 확인하려면, 한 번만 호출되는 테스트 이벤트를 넣어볼 수 있습니다.

```ts
import { logEvent } from "firebase/analytics";
import { analytics } from "../../firebase";

// 예: 버튼 클릭 시 또는 앱 로드 시 한 번
logEvent(analytics, "test_logging_check", { timestamp: new Date().toISOString() });
```

- DebugView를 연 상태에서 위 코드가 실행되면 `test_logging_check` 이벤트가 목록에 나타남
- 확인 후 해당 코드는 제거해도 됨

---

## 4. 정리

| 확인 목적              | 방법 |
|------------------------|------|
| **클릭 로그 (유저 스터디)** | Firestore → **컬렉션 이름 = 로그인 아이디** (예: `doh`) → 문서에서 `timestamp`·`target` 등 확인 |
| Analytics 실시간       | Chrome GA Debugger 켜기 → 콘솔 DebugView |
| Analytics 일별 등      | 콘솔 Analytics → 보고서 → 이벤트 |
