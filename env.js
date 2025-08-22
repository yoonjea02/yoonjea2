// 쿼리스트링 & localStorage 오버라이드 지원
// 예:  http://localhost:5173/goals.html?api=http://localhost:8080&uid=1&area=안서동
window.__ENV = (() => {
  const sp = new URLSearchParams(location.search);
  const API_ORIGIN = sp.get('api') || localStorage.getItem('API_ORIGIN') || '';
  const USER_ID    = Number(sp.get('uid') || localStorage.getItem('USER_ID') || 1);
  const AREA       = sp.get('area') || localStorage.getItem('AREA') || '안서동';
  return { API_ORIGIN, USER_ID, AREA };
})();
