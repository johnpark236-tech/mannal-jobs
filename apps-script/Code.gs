/** 만날평생일터 — 구인·구직 정보 게시판 서버 (Google Sheets + Apps Script)
 *  플랫폼은 정보만 제공합니다. 면접·선발·추천·채용 알선을 하지 않으며 이력서를 대신 보내지 않습니다.
 *  이 파일에는 비밀키가 없습니다. 운영자 = 웹 앱을 배포한 구글 계정 + 스크립트 속성 OWNER_EMAILS. */
const CODE_VERSION = '2026.11.15-1';
const WEB_ORIGINS = ['https://jobs.mannalkorean.com', 'https://johnpark236-tech.github.io'];
const GOOGLE_CLIENT_ID = ''; // 공개 값. 스크립트 속성 GOOGLE_CLIENT_ID 로 넣어도 됩니다.

const SCHEMA = {
  '글': ['ID','구분','상태','작성일','수정일','작성자','이름','사업자번호','직종','지역','근무지','근무형태','근무요일','근무시간','임금유형','임금','시급환산','경력','내용','연락처','마감일','처리메모','연락처공개동의일'],
  '요청': ['ID','글ID','유형','사유','요청자','일시','상태','처리메모','처리일'],
  '연락처열람': ['글ID','열람자','일시']
};
const P = Object.fromEntries(SCHEMA['글'].map((h, i) => [h, i]));
const OPT = {
  type: ['구인', '구직'],
  region: ['천안', '아산'],
  job: ['제조·설비 조립', '생산·포장', '물류', '기타'],
  work: ['일용', '단기', '상용'],
  day: ['월', '화', '수', '목', '금', '토', '일'],
  career: ['입문', '숙련', '전문'],
  wage: ['시급', '일급', '월급']
};
/** 최저시급: 매년 8월 고시 후 다음 해 금액을 추가합니다. */
const MIN_WAGE = { 2026: 10320, 2027: 10700 };
/** 보유기간(일) — privacy.html 3항과 같게 유지 */
const KEEP = { seeker: 183, jobAfterDeadline: 183, rejected: 30, blinded: 365, log: 365 };

/* ---------- 시트 도우미 ---------- */
function book_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tab_(name) {
  const b = book_(); let s = b.getSheetByName(name);
  if (!s) { s = b.insertSheet(name); s.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]]); s.setFrozenRows(1); }
  return s;
}
function rows_(name) { const s = tab_(name), n = s.getLastRow(); return n < 2 ? [] : s.getRange(2, 1, n - 1, SCHEMA[name].length).getValues().map((v, i) => ({ v, row: i + 2 })); }
/** 수식 주입 방지 + 0으로 시작하는 번호를 글자로 저장 */
function cell_(x) { return typeof x === 'string' && (/^[=+@-]/.test(x) || /^0[0-9]+$/.test(x)) ? "'" + x : x; }
function add_(name, v) { const s = tab_(name); s.getRange(s.getLastRow() + 1, 1, 1, v.length).setValues([v.map(cell_)]); }
function put_(name, row, v) { tab_(name).getRange(row, 1, 1, v.length).setValues([v.map(cell_)]); }
function phone_(v) { const t = String(v ?? ''); return typeof v === 'number' && /^[1-9][0-9]{7,9}$/.test(t) ? '0' + t : t; }
function fail_(m) { throw Error(m); }
function now_() { return new Date().toISOString(); }
function day_(d) { return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd'); }
function dayOf_(v) { return v instanceof Date ? day_(v) : String(v || '').slice(0, 10); }
function ageDays_(v) { const t = v instanceof Date ? v.getTime() : Date.parse(String(v || '')); return isFinite(t) ? (Date.now() - t) / 864e5 : 0; }
function hash_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8).map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join(''); }

/* ---------- 로그인 ---------- */
function clientId_() { return PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || GOOGLE_CLIENT_ID; }
function owners_() {
  const list = String(PropertiesService.getScriptProperties().getProperty('OWNER_EMAILS') || '').split(',');
  list.push(Session.getEffectiveUser().getEmail() || '');
  return [...new Set(list.map(x => x.trim().toLowerCase()).filter(Boolean))];
}
/** 구글 ID 토큰을 구글 서버에서 확인하고 이메일을 돌려줍니다(만료 전까지 캐시). */
function googleEmail_(token) {
  if (typeof token !== 'string' || token.length > 4096 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) fail_('로그인 정보가 올바르지 않습니다. 다시 로그인하세요.');
  const cid = clientId_(); if (!cid) fail_('구글 로그인 설정이 아직 없습니다.');
  const cache = CacheService.getScriptCache(), key = 'idt:' + hash_(token).slice(0, 40), hit = cache.get(key); if (hit) return hit;
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) fail_('구글 로그인이 만료되었습니다. 다시 로그인하세요.');
  const t = JSON.parse(res.getContentText()), exp = Number(t.exp) * 1000;
  if (t.aud !== cid || !['accounts.google.com', 'https://accounts.google.com'].includes(t.iss) || String(t.email_verified) !== 'true' || !(exp > Date.now())) fail_('구글 로그인이 확인되지 않습니다. 다시 로그인하세요.');
  const email = String(t.email).toLowerCase();
  cache.put(key, email, Math.max(1, Math.min(3600, Math.floor((exp - Date.now()) / 1000) - 30)));
  return email;
}
function who_(p) { const email = p.idToken ? googleEmail_(p.idToken) : ''; return { email, owner: !!email && owners_().includes(email) }; }
function needLogin_(u) { if (!u.email) fail_('구글 로그인 후 이용할 수 있습니다.'); }
function needOwner_(u) { if (!u.owner) fail_('운영자만 할 수 있습니다.'); }
function limit_(key, max) {
  const c = CacheService.getScriptCache(), k = 'lim:' + key + ':' + day_(new Date()), n = Number(c.get(k) || 0);
  if (n >= max) fail_('오늘 이용 횟수를 넘었습니다. 내일 다시 시도하세요.');
  c.put(k, String(n + 1), 21600);
}

/* ---------- 검사 ---------- */
function text_(v, max, label, need) {
  const t = typeof v === 'string' ? v.trim().replace(/\s+\n/g, '\n') : '';
  if (need && !t) fail_(label + '을(를) 입력하세요.');
  if (t.length > max) fail_(label + '은(는) ' + max + '자 이내로 입력하세요.');
  return t;
}
function one_(v, list, label) { if (!list.includes(String(v ?? ''))) fail_(label + '을(를) 고르세요.'); return String(v); }
function many_(v, list, label) { const a = Array.isArray(v) ? [...new Set(v.map(String))].filter(x => list.includes(x)) : []; if (!a.length) fail_(label + '을(를) 하나 이상 고르세요.'); return list.filter(x => a.includes(x)).join(','); }
function tel_(v) { const t = String(v ?? '').replace(/[\s-]/g, ''); if (!/^0[0-9]{8,10}$/.test(t)) fail_('올바른 연락처(전화번호)를 입력하세요.'); return t; }
/** 사업자등록번호 형식·검증번호 확인 (실제 영업 여부는 운영자가 검수) */
function bizNo_(v) {
  const d = String(v ?? '').replace(/[^0-9]/g, ''); if (!/^[0-9]{10}$/.test(d)) fail_('사업자등록번호 10자리를 입력하세요.');
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]; let s = 0; for (let i = 0; i < 9; i++) s += Number(d[i]) * w[i];
  s += Math.floor(Number(d[8]) * 5 / 10); if ((10 - (s % 10)) % 10 !== Number(d[9])) fail_('사업자등록번호를 다시 확인하세요.');
  return d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5);
}
/** 근무시간 "08:30-17:30" → 휴게시간(4시간 이상 30분, 8시간 이상 1시간)을 뺀 하루 근로시간 */
function hours_(v) {
  const m = String(v ?? '').match(/^([01]?\d|2[0-3]):([0-5]\d)\s*[-~]\s*([01]?\d|2[0-3]):([0-5]\d)$/); if (!m) fail_('근무시간을 예) 08:30-17:30 처럼 입력하세요.');
  let span = (Number(m[3]) * 60 + Number(m[4])) - (Number(m[1]) * 60 + Number(m[2])); if (span <= 0) span += 1440;
  const rest = span >= 480 ? 60 : span >= 240 ? 30 : 0; return { text: m[1].padStart(2, '0') + ':' + m[2] + '-' + m[3].padStart(2, '0') + ':' + m[4], hours: (span - rest) / 60 };
}
function minWage_(year) { const ys = Object.keys(MIN_WAGE).map(Number).sort((a, b) => a - b); let w = MIN_WAGE[ys[0]]; for (const y of ys) if (y <= year) w = MIN_WAGE[y]; return w; }
/** 시급 환산: 시급 그대로 / 일급 ÷ 하루 근로시간 / 월급 ÷ 209시간(주 40시간 + 주휴) */
function hourly_(type, amount, hours) { return Math.floor(type === '시급' ? amount : type === '일급' ? amount / hours : amount / 209); }
/** 게재 금지·수정 요청 표현 (모집 차별, 채용 사기, 위장 고용, 유해 업종) */
const BLOCK = [
  [/(남|여)(자|성)\s*만|(남|여)(자|성)\s*우대/, '성별을 제한하거나 우대하는 표현은 쓸 수 없습니다(남녀고용평등법).'],
  [/\d+\s*세\s*(이하|미만|까지)|나이\s*제한|연령\s*제한/, '나이를 제한하는 표현은 쓸 수 없습니다(고령자고용법).'],
  [/용모|외모|키\s*\d|신장|몸무게|체중|미혼/, '직무와 관계없는 신체조건·혼인 여부는 요구할 수 없습니다.'],
  [/선\s*입금|교육비\s*(선납|입금|납부)|보증금|통장|체크\s*카드|주민\s*(등록)?\s*번호|신분증\s*사본/, '돈·통장·주민등록번호를 요구하는 공고는 올릴 수 없습니다.'],
  [/3\.3\s*%?|프리랜서|사업\s*소득/, '근로자를 프리랜서(3.3%)로 처리하는 모집은 올릴 수 없습니다.'],
  [/(수익|월급|급여|소득|일자리|근무)\s*보장|고수익/, "'보장', '고수익' 같은 과장 표현은 쓸 수 없습니다(거짓 구인광고 금지)."],
  [/유흥|룸\s*(살롱|싸롱)|도우미|안마|마사지|성인\s*업소/, '게재할 수 없는 업종입니다.']
];
/** 운영자가 꼭 확인할 표현 (게재는 검수 후) */
const FLAG = [[/파견|인력\s*공급|용역\s*투입/, '파견·인력공급 표현 확인'], [/숙소|기숙사/, '숙소 조건 확인']];
function screen_(t) { for (const [re, m] of BLOCK) if (re.test(t)) fail_(m); return FLAG.filter(([re]) => re.test(t)).map(([, m]) => m); }

/* ---------- 글 ---------- */
function post_(u, b) {
  needLogin_(u); limit_('post:' + u.email, 10);
  const type = one_(b.type, OPT.type, '구분'), region = one_(b.region, OPT.region, '지역'), job = one_(b.job, OPT.job, '직종');
  const work = one_(b.work, OPT.work, '근무 형태'), days = many_(b.days, OPT.day, '근무 요일'), career = one_(b.career, OPT.career, '경력 단계');
  const content = text_(b.content, 500, '내용', false);
  let row;
  if (type === '구인') {
    const company = text_(b.name, 40, '업체명', true), biz = bizNo_(b.bizNo), place = text_(b.place, 60, '근무지', true);
    const h = hours_(b.hours), wageType = one_(b.wageType, OPT.wage, '임금 유형'), wage = Math.round(Number(b.wage));
    if (!(wage > 0 && wage < 100000000)) fail_('임금을 원 단위 숫자로 입력하세요.');
    const deadline = String(b.deadline || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || deadline < day_(new Date())) fail_('마감일을 오늘 이후로 고르세요.');
    const per = hourly_(wageType, wage, h.hours), year = Math.max(Number(day_(new Date()).slice(0, 4)), Number(deadline.slice(0, 4))), min = minWage_(year);
    if (per < min) fail_('시급으로 환산하면 ' + per.toLocaleString() + '원으로 ' + year + '년 최저시급(' + min.toLocaleString() + '원)보다 적습니다.');
    if (b.agree !== true) fail_('게재 규칙 확인에 동의해 주세요.');
    const flags = screen_([company, place, content].join(' '));
    row = ['', type, '검수대기', '', '', u.email, company, biz, job, region, place, work, days, h.text, wageType, wage, per, career, content, tel_(b.phone), deadline, flags.join(', '), ''];
  } else {
    const name = text_(b.name, 20, '표시 이름', true);
    if (b.contactConsent !== true) fail_('연락처 공개에 동의해야 구직 글을 올릴 수 있습니다.');
    const flags = screen_([name, content].join(' '));
    row = ['', type, '검수대기', '', '', u.email, name, '', job, region, '', work, days, '', '', '', '', career, content, tel_(b.phone), '', flags.join(', '), now_()];
  }
  const at = now_();
  if (b.id) {
    const r = rows_('글').find(x => x.v[P.ID] === b.id); if (!r || r.v[P['작성자']] !== u.email) fail_('내가 쓴 글만 고칠 수 있습니다.');
    if (['블라인드', '삭제'].includes(r.v[P['상태']])) fail_('이 글은 고칠 수 없습니다.');
    row[P.ID] = b.id; row[P['작성일']] = r.v[P['작성일']]; row[P['수정일']] = at; put_('글', r.row, row);
  } else { row[P.ID] = Utilities.getUuid(); row[P['작성일']] = at; add_('글', row); }
  return { id: row[P.ID], status: '검수대기' };
}
function expired_(v) { return v[P['구분']] === '구인' && dayOf_(v[P['마감일']]) < day_(new Date()); }
function view_(v, full) {
  const job = v[P['구분']] === '구인', o = {
    id: v[P.ID], type: v[P['구분']], name: v[P['이름']], job: v[P['직종']], region: v[P['지역']], work: v[P['근무형태']], days: String(v[P['근무요일']] || ''),
    career: v[P['경력']], content: v[P['내용']], created: dayOf_(v[P['작성일']])
  };
  if (job) Object.assign(o, { place: v[P['근무지']], hours: v[P['근무시간']], wageType: v[P['임금유형']], wage: Number(v[P['임금']]), hourly: Number(v[P['시급환산']]), deadline: dayOf_(v[P['마감일']]), phone: phone_(v[P['연락처']]), bizNo: v[P['사업자번호']] });
  if (full) Object.assign(o, { status: expired_(v) && v[P['상태']] === '게재' ? '마감' : v[P['상태']], memo: v[P['처리메모']], phone: phone_(v[P['연락처']]), email: v[P['작성자']] });
  return o;
}
function list_(q) {
  const f = k => (q[k] && q[k] !== '전체') ? String(q[k]) : '';
  const type = f('type'), region = f('region'), job = f('job');
  return rows_('글').map(r => r.v).filter(v => v[P['상태']] === '게재' && !expired_(v) && (!type || v[P['구분']] === type) && (!region || v[P['지역']] === region) && (!job || v[P['직종']] === job))
    .sort((a, b) => String(b[P['작성일']]).localeCompare(String(a[P['작성일']]))).slice(0, 300).map(v => view_(v, false));
}
/** 구직자 연락처: 로그인한 이용자에게만, 열람 기록을 남기고 보여 줌 */
function contact_(u, b) {
  needLogin_(u);
  const r = rows_('글').find(x => x.v[P.ID] === b.id && x.v[P['상태']] === '게재'); if (!r) fail_('게재 중인 글이 아닙니다.');
  if (r.v[P['작성자']] !== u.email) { limit_('contact:' + u.email, 30); add_('연락처열람', [r.v[P.ID], u.email, now_()]); }
  return { phone: phone_(r.v[P['연락처']]) };
}
function mine_(u) { needLogin_(u); return rows_('글').filter(r => r.v[P['작성자']] === u.email && r.v[P['상태']] !== '삭제').map(r => view_(r.v, true)); }
function close_(u, b, del) {
  needLogin_(u); const r = rows_('글').find(x => x.v[P.ID] === b.id && x.v[P['작성자']] === u.email); if (!r) fail_('내가 쓴 글만 바꿀 수 있습니다.');
  const v = r.v.slice(); v[P['상태']] = del ? '삭제' : '마감'; v[P['수정일']] = now_();
  if (del) for (const k of ['연락처', '내용', '사업자번호', '근무지']) v[P[k]] = '';
  put_('글', r.row, v); return { ok: true };
}
/** 블라인드 요청은 바로 가리고, 플랫폼은 분쟁의 옳고 그름을 판정하지 않습니다. 신고는 운영자가 확인합니다. */
function request_(u, b) {
  needLogin_(u); limit_('req:' + u.email, 20);
  const kind = one_(b.kind, ['블라인드', '신고', '재게시'], '요청 종류'), reason = text_(b.reason, 300, '사유', true);
  const r = rows_('글').find(x => x.v[P.ID] === b.id); if (!r) fail_('글을 찾을 수 없습니다.');
  const v = r.v.slice(), mine = v[P['작성자']] === u.email;
  if (kind === '재게시' && (!mine || v[P['상태']] !== '블라인드')) fail_('블라인드된 내 글만 다시 게시를 요청할 수 있습니다.');
  if (kind !== '재게시' && v[P['상태']] !== '게재') fail_('게재 중인 글만 요청할 수 있습니다.');
  if (kind === '블라인드') { v[P['상태']] = '블라인드'; v[P['수정일']] = now_(); put_('글', r.row, v); }
  const dup = rows_('요청').some(x => x.v[1] === b.id && x.v[2] === kind && x.v[4] === u.email && x.v[6] === '접수');
  if (!dup) add_('요청', [Utilities.getUuid(), b.id, kind, reason, u.email, now_(), '접수', '', '']);
  return { ok: true, status: v[P['상태']] };
}

/* ---------- 운영자 ---------- */
function admin_(u) {
  needOwner_(u);
  const posts = rows_('글').map(r => r.v);
  return {
    pending: posts.filter(v => v[P['상태']] === '검수대기').map(v => view_(v, true)),
    blinded: posts.filter(v => v[P['상태']] === '블라인드').map(v => view_(v, true)),
    requests: rows_('요청').filter(r => r.v[6] === '접수').map(r => ({ id: r.v[0], postId: r.v[1], kind: r.v[2], reason: r.v[3], by: r.v[4], at: dayOf_(r.v[5]) })),
    counts: { live: posts.filter(v => v[P['상태']] === '게재' && !expired_(v)).length, total: posts.length }
  };
}
function review_(u, b) {
  needOwner_(u); const decision = one_(b.decision, ['게재', '반려', '블라인드'], '처리');
  const r = rows_('글').find(x => x.v[P.ID] === b.id); if (!r) fail_('글을 찾을 수 없습니다.');
  const v = r.v.slice(); v[P['상태']] = decision; v[P['처리메모']] = text_(b.memo, 200, '메모', decision === '반려'); v[P['수정일']] = now_(); put_('글', r.row, v);
  return { ok: true };
}
function settle_(u, b) {
  needOwner_(u); const r = rows_('요청').find(x => x.v[0] === b.id); if (!r) fail_('요청을 찾을 수 없습니다.');
  const v = r.v.slice(); v[6] = '처리'; v[7] = text_(b.memo, 200, '메모', false); v[8] = now_(); put_('요청', r.row, v); return { ok: true };
}

/* ---------- 보유기간 자동 파기 (하루 한 번) ---------- */
function purge_(force) {
  const props = PropertiesService.getScriptProperties(), today = day_(new Date());
  if (!force && props.getProperty('LAST_PURGE') === today) return null; props.setProperty('LAST_PURGE', today);
  const del = (name, test) => { const s = tab_(name), rs = rows_(name).filter(r => test(r.v)); for (const r of rs.reverse()) s.deleteRow(r.row); return rs.length; };
  const posts = del('글', v => {
    const st = v[P['상태']], made = ageDays_(v[P['작성일']]), touched = ageDays_(v[P['수정일']] || v[P['작성일']]);
    if (st === '삭제' || st === '반려') return touched > KEEP.rejected;
    if (st === '블라인드') return touched > KEEP.blinded;
    if (v[P['구분']] === '구직') return made > KEEP.seeker;
    return ageDays_(dayOf_(v[P['마감일']]) + 'T00:00:00+09:00') > KEEP.jobAfterDeadline;
  });
  const logs = del('연락처열람', v => ageDays_(v[2]) > KEEP.log) + del('요청', v => ageDays_(v[5]) > KEEP.log);
  return { posts, logs, at: now_() };
}
function purgeDaily() { return purge_(true); }
/** 시트 메뉴에서 한 번 실행: 시트 만들기 + 매일 새벽 3시 자동 파기 등록 */
function install() {
  Object.keys(SCHEMA).forEach(tab_);
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'purgeDaily')) ScriptApp.newTrigger('purgeDaily').timeBased().everyDays(1).atHour(3).create();
  book_().setSpreadsheetTimeZone('Asia/Seoul');
  return '설치 완료. 운영자: ' + owners_().join(', ') + (clientId_() ? '' : ' / GOOGLE_CLIENT_ID 설정 필요');
}

/* ---------- 라우팅 ---------- */
function dispatch_(p) {
  const [path, qs] = String(p.path || '').split('?'), q = Object.fromEntries((qs || '').split('&').filter(Boolean).map(x => x.split('=').map(decodeURIComponent)));
  const b = p.body || {};
  if (path === 'list') return { items: list_(Object.assign({}, q, b)), options: OPT };
  const u = who_(p);
  switch (path) {
    case 'me': return { email: u.email, owner: u.owner, version: CODE_VERSION };
    case 'post': return post_(u, b);
    case 'contact': return contact_(u, b);
    case 'mine': return mine_(u);
    case 'mine/close': return close_(u, b, false);
    case 'mine/delete': return close_(u, b, true);
    case 'request': return request_(u, b);
    case 'admin': return admin_(u);
    case 'admin/review': return review_(u, b);
    case 'admin/settle': return settle_(u, b);
    case 'admin/purge': needOwner_(u); return purge_(true);
  }
  fail_('알 수 없는 요청입니다.');
}
function doGet() { return ContentService.createTextOutput(JSON.stringify({ ok: true, service: '만날평생일터', version: CODE_VERSION })).setMimeType(ContentService.MimeType.JSON); }
function doPost(e) {
  let p, out; const lock = LockService.getScriptLock();
  try {
    const raw = e.parameter?.payload || e.postData?.contents || ''; if (raw.length > 200000) fail_('요청이 너무 깁니다.');
    p = JSON.parse(raw); if (!WEB_ORIGINS.includes(p.origin)) fail_('요청 출처 오류');
    if (!lock.tryLock(10000)) fail_('다른 요청을 처리 중입니다. 다시 시도하세요.');
    try { purge_(false); } catch (_) { }
    out = { ok: true, data: dispatch_(p) };
  } catch (error) { out = { ok: false, error: String(error.message || error) }; }
  finally { if (lock.hasLock()) lock.releaseLock(); }
  if (p?.bridgeNonce && /^[a-f0-9]{32}$/.test(p.bridgeNonce) && WEB_ORIGINS.includes(p.origin)) {
    const safe = JSON.stringify({ bridgeNonce: p.bridgeNonce, result: out }).replace(/</g, '\\u003c');
    return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>window.top.postMessage(' + safe + ',' + JSON.stringify(p.origin) + ');</script>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function onOpen() { SpreadsheetApp.getUi().createMenu('만날평생일터').addItem('처음 설치(시트·자동 파기)', 'install').addToUi(); }
