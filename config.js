// 만날평생일터 공개 설정 — 비밀키를 넣지 않습니다.
window.MANNAL_CONFIG = {
  // Apps Script 웹 앱 배포 후 받은 /exec 주소 (비우면 예시 화면으로 동작)
  appsScriptUrl: "",
  // 구글 클라우드 OAuth 웹 클라이언트 ID (공개 값). 승인된 자바스크립트 원본에 https://jobs.mannalkorean.com 추가
  googleClientId: "",
  // 하단 표시 정보 (빈 값은 표시하지 않음)
  operator: {
    name: "만날평생일터",
    ceo: "",            // 대표자
    address: "",        // 사업장 소재지
    phone: "",          // 대표 연락처
    email: "",          // 문의 이메일
    reportNo: "",       // 직업정보제공사업 신고번호 (신고 전에는 비워 두면 '신고 준비 중' 표시)
    bizNo: "",          // 사업자등록번호 (등록 후)
    privacyOfficer: ""  // 개인정보 보호책임자 (비우면 대표자)
  }
};
