// 서버 테스트: node tests/server.test.mjs  (외부 라이브러리 없음)
import fs from 'node:fs'; import vm from 'node:vm'; import crypto from 'node:crypto'; import assert from 'node:assert/strict';
const sheets = new Map();
function sheet(name) {
  const rows = [];
  const s = {
    rows, getLastRow: () => rows.length, getLastColumn: () => rows[0]?.length || 0, setFrozenRows() {},
    getRange: (r, c, h = 1, w = 1) => ({
      getValues: () => rows.slice(r - 1, r - 1 + h).map(row => Array.from({ length: w }, (_, j) => row[c - 1 + j] ?? '')),
      setValues: v => v.forEach((row, i) => { rows[r - 1 + i] ||= []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x); })
    }),
    deleteRow: r => rows.splice(r - 1, 1)
  };
  sheets.set(name, s); return s;
}
const props = new Map([['GOOGLE_CLIENT_ID', 'cid.apps.googleusercontent.com']]), cache = new Map();
const later = Math.floor(Date.now() / 1000) + 3000;
const tok = e => 'h.' + Buffer.from(e).toString('hex') + '.s';
const OWNER = tok('owner@example.com'), A = tok('a@example.com'), B = tok('b@example.com');
const ctx = {
  console, Date, Math, JSON, Number, String, Error, Set, Object, Array, encodeURIComponent, decodeURIComponent, isFinite,
  Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets.get(n) || null, insertSheet: n => sheet(n), setSpreadsheetTimeZone() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) },
  CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
  UrlFetchApp: { fetch: url => { const t = decodeURIComponent(url.split('id_token=')[1]); const email = Buffer.from(t.split('.')[1], 'hex').toString();
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ aud: 'cid.apps.googleusercontent.com', iss: 'accounts.google.com', email, email_verified: 'true', exp: String(later) }) }; } },
  Utilities: { getUuid: () => crypto.randomUUID(), formatDate: (d, tz, f) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10),
    computeDigest: (a, s) => [...crypto.createHash('sha256').update(s).digest()].map(b => b > 127 ? b - 256 : b), DigestAlgorithm: {}, Charset: {} }
};
vm.createContext(ctx); vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
const call = (path, body = {}, idToken = '') => ctx.dispatch_({ path, body, idToken });
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), next = new Date(Date.now() + 9 * 3600e3 + 10 * 864e5).toISOString().slice(0, 10);
const job = { type: '구인', name: '시험 테크', bizNo: '220-81-62517', place: '천안시 서북구 공단', region: '천안', job: '제조·설비 조립', work: '일용', days: ['월', '화', '수'], hours: '08:30-17:30', career: '입문', wageType: '일급', wage: 120000, phone: '010-1234-5678', deadline: next, content: '설비 조립 보조', agree: true };

// 로그인 필요, 비로그인 목록은 가능
assert.throws(() => call('post', job), /로그인/); assert.equal(call('list').items.length, 0);
// 사업자번호 검증, 최저임금 미달, 금지 표현
assert.throws(() => call('post', { ...job, bizNo: '123-45-67890' }, A), /사업자등록번호/);
assert.throws(() => call('post', { ...job, wage: 80000 }, A), /최저시급/);
assert.throws(() => call('post', { ...job, content: '남자만 모집' }, A), /성별/);
assert.throws(() => call('post', { ...job, content: '30세 이하' }, A), /나이/);
assert.throws(() => call('post', { ...job, content: '교육비 선납 필요' }, A), /돈·통장/);
assert.throws(() => call('post', { ...job, content: '프리랜서 3.3% 공제' }, A), /프리랜서/);
assert.throws(() => call('post', { ...job, content: '월 400 수익 보장' }, A), /보장/);
assert.throws(() => call('post', { ...job, agree: false }, A), /동의/);
// 구인 등록 → 검수대기 → 목록에 안 보임 → 운영자 게재
const j = call('post', job, A); assert.equal(j.status, '검수대기'); assert.equal(call('list').items.length, 0);
const row = sheets.get('글').rows[1]; assert.equal(row[7], '220-81-62517'); assert.equal(row[16], 15000); assert.equal(row[19], '01012345678');
assert.throws(() => call('admin', {}, A), /운영자/);
assert.equal(call('admin', {}, OWNER).pending.length, 1);
call('admin/review', { id: j.id, decision: '게재' }, OWNER);
let items = call('list').items; assert.equal(items.length, 1); assert.equal(items[0].phone, '01012345678'); assert.equal(items[0].hourly, 15000);
assert.equal(call('list', { type: '구직' }).items.length, 0); assert.equal(call('list', { region: '아산' }).items.length, 0); assert.equal(call('list?type=%EA%B5%AC%EC%9D%B8').items.length, 1);
// 파견 표현은 운영자 확인 메모
const j2 = call('post', { ...job, content: '인력공급 현장' }, A); assert.match(call('admin', {}, OWNER).pending[0].memo, /파견/);
// 구직: 연락처 공개 동의 필수, 연락처는 목록에 없고 로그인 열람 + 기록
const seeker = { type: '구직', name: '박○○', region: '아산', job: '물류', work: '단기', days: ['토', '일'], career: '숙련', phone: '010-9876-5432', content: '주말 가능', contactConsent: true };
assert.throws(() => call('post', { ...seeker, contactConsent: false }, B), /연락처 공개/);
const s = call('post', seeker, B); call('admin/review', { id: s.id, decision: '게재' }, OWNER);
const sv = call('list', { type: '구직' }).items[0]; assert.equal(sv.phone, undefined);
assert.throws(() => call('contact', { id: s.id }), /로그인/);
assert.equal(call('contact', { id: s.id }, A).phone, '01098765432'); assert.equal(sheets.get('연락처열람').rows.length, 2);
// 블라인드 요청 → 즉시 가림 → 작성자 재게시 요청 → 운영자 게재
call('request', { id: j.id, kind: '블라인드', reason: '사실과 다른 내용' }, B);
assert.equal(call('list', { type: '구인' }).items.length, 0);
assert.throws(() => call('request', { id: j.id, kind: '재게시', reason: '확인 부탁' }, B), /내 글/);
call('request', { id: j.id, kind: '재게시', reason: '사실과 같음' }, A);
const ad = call('admin', {}, OWNER); assert.equal(ad.blinded.length, 1); assert.equal(ad.requests.length, 2);
call('admin/review', { id: j.id, decision: '게재' }, OWNER); call('admin/settle', { id: ad.requests[0].id, memo: '복구' }, OWNER);
assert.equal(call('admin', {}, OWNER).requests.length, 1); assert.equal(call('list', { type: '구인' }).items.length, 1);
// 내 글: 마감·삭제(개인정보 지움), 남의 글은 못 고침
assert.throws(() => call('mine/close', { id: j.id }, B), /내가/); assert.throws(() => call('post', { ...job, id: j.id }, B), /내가/);
call('mine/close', { id: j.id }, A); assert.equal(call('list', { type: '구인' }).items.length, 0); assert.equal(call('mine', {}, A).find(x => x.id === j.id).status, '마감');
call('mine/delete', { id: j2.id }, A); const d2 = sheets.get('글').rows.find(r => r[0] === j2.id); assert.equal(d2[19], ''); assert.equal(d2[2], '삭제');
// 자동 파기: 오래된 구직 글·로그·삭제 글
const old = new Date(Date.now() - 400 * 864e5).toISOString();
sheets.get('글').rows.forEach((r, i) => { if (i && r[1] === '구직') r[3] = old; if (i && r[2] === '삭제') r[4] = old; });
sheets.get('연락처열람').rows[1][2] = old;
const pr = call('admin/purge', {}, OWNER); assert.equal(pr.posts, 2); assert.equal(pr.logs, 1);
assert.equal(sheets.get('글').rows.length, 2);
console.log('PASS: login, biz number, minimum wage, blocked phrases, review, filters, contact consent and view log, blind/repost, mine close/delete, purge');
