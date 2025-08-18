/* ===== api.js =====
 * 프론트와 백엔드 사이에서만 통신하는 "작은 클라이언트"
 * - periodYm 형식(YYYY-MM) 검증
 * - 공통 fetch 래퍼
 * - 도넛/막대/목표 저장/조회, 알림(SSE) 함수 제공
 * 중학생 설명:
 *   - 아래 함수들은 서버 주소(BASE_URL)로 HTTP 요청을 보냅니다.
 *   - 성공(200)이면 JSON을 돌려주고, 오류면 메시지를 던집니다.
 */

const BASE_URL = ''; // 예: 'http://localhost:8080'  (배포시 환경에 맞게 세팅)

/* YYYY-MM 형식인지 체크 */
function assertPeriod(periodYm) {
  if (!/^\d{4}-\d{2}$/.test(periodYm)) {
    const err = new Error('400: periodYm 형식은 YYYY-MM 이어야 합니다.');
    err.status = 400;
    throw err;
  }
}

/* 쿼리스트링 만들기 */
function qs(params = {}) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && u.append(k, v));
  return u.toString() ? '?' + u.toString() : '';
}

/* 공통 GET */
async function getJSON(path, params) {
  const res = await fetch(`${BASE_URL}${path}${qs(params)}`, {
    headers: { 'Accept': 'application/json' },
    credentials: 'include', // 필요 없으면 제거
  });
  if (!res.ok) {
    // 400 같은 오류 메시지 보기 좋게
    const text = await res.text().catch(()=>'');
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

/* 공통 POST(JSON) */
async function postJSON(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(()=>'');
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

/* ---------- 도넛(전기/가스) ---------- */
/* GET /api/donut?periodYm=YYYY-MM
 * 응답 예시:
 * { periodYm:"2025-08", elec:13830, gas:7820, total:21650, elecRatio:0.64, gasRatio:0.36 }
 */
async function fetchDonut(periodYm) {
  assertPeriod(periodYm);
  return getJSON('/api/donut', { periodYm });
}

/* ---------- 누적 막대(월별) ---------- */
/* GET /api/monthly-bars?periodYm=YYYY-MM
 * 응답 예시:
 * { periodYm:"2025-08", bars:[{day:1,elecCum:4800,gasCum:3100,totalCum:7900}, ...] }
 */
async function fetchMonthlyBars(periodYm) {
  assertPeriod(periodYm);
  return getJSON('/api/monthly-bars', { periodYm });
}

/* ---------- 절약 목표 저장 ---------- */
/* POST /api/goals
 * 요청: { userId, periodYm, savingGoalWon }
 * 응답(200):
 * { periodYm, savingGoalWon, baselineTotalWon, currentTotalWon, savingPercent }
 * 400: periodYm 형식 오류, savingGoalWon<0
 */
async function saveGoal({ userId, periodYm, savingGoalWon }) {
  assertPeriod(periodYm);
  if (savingGoalWon < 0) {
    const err = new Error('400: savingGoalWon 은 0 이상이어야 합니다.');
    err.status = 400;
    throw err;
  }
  return postJSON('/api/goals', { userId, periodYm, savingGoalWon });
}

/* ---------- 절약 목표 조회 ---------- */
/* GET /api/goals?periodYm=YYYY-MM
 * 응답(200):
 * { periodYm, savingGoalWon, baselineTotalWon, currentTotalWon, savingPercent }
 */
async function fetchGoal(periodYm) {
  assertPeriod(periodYm);
  return getJSON('/api/goals', { periodYm });
}

/* ---------- 알림(SSE 구독) ---------- */
/* GET /api/alerts/stream?userId=1  (서버는 text/event-stream 응답)
 * onEvent: 서버에서 오는 메시지 처리 (type, data)
 * onError: 에러 처리
 */
function subscribeAlerts(userId, { onEvent, onError } = {}) {
  const url = `${BASE_URL}/api/alerts/stream?userId=${encodeURIComponent(userId)}`;
  const es = new EventSource(url, { withCredentials: true });
  es.onmessage = (e) => {
    // 단일 채널이라면 type 없이 data만 옴
    onEvent?.({ type: 'message', data: e.data });
  };
  es.addEventListener('connected', (e)=> onEvent?.({ type:'connected', data:e.data }));
  es.addEventListener('alert', (e)=> onEvent?.({ type:'alert', data:e.data }));
  es.onerror = (e) => onError?.(e);
  return () => es.close(); // 구독 해제 함수 반환
}

/* ---------- (선택) 청구 알림 생성 ---------- */
/* POST /api/alerts/bill  Body: { userId, title, at:null|ISO8601 } */
async function createBillAlert({ userId, title, at = null }) {
  return postJSON('/api/alerts/bill', { userId, title, at });
}

/* 전역에서 쓰기 쉽게 export */
window.api = {
  fetchDonut,
  fetchMonthlyBars,
  saveGoal,
  fetchGoal,
  subscribeAlerts,
  createBillAlert,
};
