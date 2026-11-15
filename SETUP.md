# 만날평생일터 설치 안내 (jobs.mannalkorean.com)

처음 한 번만 하면 됩니다. 비밀키(OAuth 클라이언트 Secret 등)는 어디에도 적지 않습니다.

## 1. 구글 시트와 서버(Apps Script)
1. 구글 드라이브에서 새 스프레드시트를 만들고 이름을 `만날평생일터 데이터`로 바꿉니다.
2. 메뉴 **확장 프로그램 → Apps Script**를 엽니다.
3. `Code.gs` 내용을 모두 지우고 저장소의 `apps-script/Code.gs`를 붙여 넣습니다.
4. 왼쪽 **프로젝트 설정(톱니)** → "편집기에서 appsscript.json 매니페스트 파일 표시"를 켜고, `appsscript.json`에 저장소의 `apps-script/appsscript.json`을 붙여 넣습니다.
5. 위쪽 함수 목록에서 `install`을 고르고 **실행** → 권한을 허용합니다. (시트 3개와 매일 새벽 3시 자동 파기가 만들어집니다)
6. **배포 → 새 배포 → 웹 앱**: 실행 사용자 `나`, 액세스 `모든 사용자` → 배포 → 나온 `/exec` 주소를 복사합니다.

## 2. 구글 로그인(OAuth 클라이언트 ID)
1. https://console.cloud.google.com 에서 새 프로젝트 `mannal-jobs`를 만듭니다.
2. **OAuth 동의 화면**: 앱 이름 `만날평생일터`, 외부 사용자, 범위는 기본(이메일·프로필)만 → 게시(프로덕션).
3. **사용자 인증 정보 → OAuth 클라이언트 ID 만들기 → 웹 애플리케이션**
   - 승인된 자바스크립트 원본: `https://jobs.mannalkorean.com`, `https://johnpark236-tech.github.io`
4. 만들어진 **클라이언트 ID**(…apps.googleusercontent.com)를 복사합니다. (클라이언트 보안 비밀은 필요 없습니다)
5. Apps Script **프로젝트 설정 → 스크립트 속성**에 `GOOGLE_CLIENT_ID` = 위 ID를 추가합니다.
   - 운영자를 더 두려면 `OWNER_EMAILS` = `a@gmail.com,b@gmail.com` (배포한 계정은 자동 운영자)

## 3. 홈페이지 설정
`config.js`에 `appsScriptUrl`(/exec 주소)과 `googleClientId`를 넣고, `operator`에 대표자·소재지·연락처를 채웁니다. 신고번호를 받으면 `reportNo`에 넣습니다.
(채팅에서 Claude에게 주소와 ID를 알려 주면 대신 넣습니다)

## 4. 주소 연결 (mannalkorean.com DNS)
mannalkorean.com 도메인을 관리하는 곳(가비아 등)의 DNS 설정에 아래 한 줄을 추가합니다.

| 종류 | 이름(호스트) | 값 |
|---|---|---|
| CNAME | `jobs` | `johnpark236-tech.github.io` |

추가 후 GitHub 저장소 **Settings → Pages**에서 Custom domain이 `jobs.mannalkorean.com`인지 확인하고 **Enforce HTTPS**를 켭니다. (DNS 반영에 몇 분~몇 시간)

## 5. 운영
- 운영자로 로그인하면 **운영자** 탭에서 검수 대기 글을 게재·반려하고, 블라인드·신고·재게시 요청을 처리합니다.
- 구인 공고는 게재 전 국세청 홈택스 '사업자 상태조회'로 휴·폐업 여부를 확인합니다.
- 최저시급은 매년 8월 고시 후 `Code.gs`의 `MIN_WAGE`와 `index.html`의 `MIN_WAGE`에 다음 해 금액을 추가합니다.
- 서버 코드를 고치면 `CODE_VERSION`을 올리고, Apps Script에 다시 붙여 넣은 뒤 **배포 관리 → 수정 → 새 버전**으로 배포합니다.
