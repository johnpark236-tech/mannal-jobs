# 만날평생일터 — AI 공동 작업 안내 (Claude · ChatGPT · Gemini 공용)

모든 답변과 화면 문구는 한국어로 씁니다.

## 개요
- 서비스: 천안·아산 구인·구직 **정보 게시판** (https://jobs.mannalkorean.com). 1단계는 **무료 운영**(광고 수익 없음).
- 구조: GitHub Pages(index.html 한 파일) + Google Apps Script 웹 앱(apps-script/Code.gs) + 구글 시트(글·요청·연락처열람).
- 설치·배포 방법: SETUP.md

## 반드시 지킬 규칙 (법적 이유)
- 플랫폼은 **정보만 제공**합니다. 면접·선발·추천·채용 알선, 이력서 대신 보내기, 채용 성사 수수료 기능을 만들지 않습니다. 화면에 '취업추천', '취업지원', '(무료)취업상담' 표현을 쓰지 않습니다.
- 구인 공고에는 구인자 연락처를 공개하고, 사업자등록번호를 받으며 운영자 검수 후 게재합니다.
- 구직자 연락처는 공개 동의한 글만, 로그인한 이용자에게만, 열람 기록을 남기고 보여 줍니다.
- 최저임금 미달, 성별·나이 제한, 돈·통장·주민번호 요구, 프리랜서(3.3%) 처리, '보장·고수익' 표현은 게재 거부(`BLOCK`).
- 분쟁은 판정하지 않고 요청 시 블라인드만 합니다. 구직자 '블랙리스트'를 만들지 않습니다(근로기준법 제40조).
- 주민등록번호·계좌번호·사진·민감정보를 받지 않습니다. 새 개인정보 항목을 받으면 privacy.html도 함께 고칩니다. 보유기간은 `KEEP`와 privacy.html 3항을 같게 유지합니다.
- 광고 수익을 시작하면: 사업자등록, 직업정보제공사업 변경신고(대가 유무), 통신판매업 신고, GitHub Pages → Cloudflare Pages 이전(상업 이용 제한)이 먼저입니다.

## 테스트
- 서버: `node tests/server.test.mjs` → `PASS:`
- 화면 문법: `node -e "const s=require('fs').readFileSync('index.html','utf8');for(const x of s.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(x[1]);console.log('ok')"`
- 휴대폰 폭(390px)에서 가로 스크롤이 없는지 확인합니다.
- 서버를 바꾸면 `CODE_VERSION`을 올립니다. 시트 열은 `SCHEMA` 끝에만 추가하고 schema.json도 같이 고칩니다.
