// app.js  (type="module"로 불러주세요)

// ---------- Utilities ----------
const $ = (sel, root = document) => root.querySelector(sel);
const formatWon = v => new Intl.NumberFormat("ko-KR").format(Math.round(v)) + " 원";

// 숫자 카운트 업 애니메이션
function animateNumber(el, to, { duration = 600 } = {}) {
  const from = Number((el.textContent || "0").replace(/[^\d.-]/g, "")) || 0;
  const start = performance.now();
  function frame(t) {
    const p = Math.min(1, (t - start) / duration);
    const val = from + (to - from) * (1 - Math.pow(1 - p, 3)); // easeOutCubic
    el.textContent = formatWon(val);
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------- Mock API Layer ----------
async function fetchMonthlyEstimate() {
  // 실제로는 fetch('/api/estimates?month=2025-08') 형식으로 호출하세요.
  await new Promise(r => setTimeout(r, 350)); // loading 지연 시뮬
  return {
    monthLabel: "8월",
    lastMonthLabel: "7월",
    total: 32600,
    lastMonthTotal: 37000,
    breakdown: {
      electricity: 13830,
      water: 7820,
      // 여기에 gas, internet, etc. 확장 가능
    }
  };
}

// ---------- State ----------
const state = {
  monthLabel: "—월",
  lastMonthLabel: "—월",
  total: 0,
  lastMonthTotal: 0,
  breakdown: { electricity: 0, water: 0 }
};

// 퍼센트 계산 헬퍼
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

// ---------- Renderers ----------
function renderClock() {
  const el = $(".time");
  if (!el) return;
  const now = new Date();
  el.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;
}

function renderSummary() {
  const totalEl = $("#totalPrice");
  const deltaEl = $("#deltaText");

  if (!totalEl || !deltaEl) return;

  animateNumber(totalEl, state.total);

  const diffPct = state.lastMonthTotal
    ? Math.round(((state.total - state.lastMonthTotal) / state.lastMonthTotal) * 100)
    : 0;

  const arrow = diffPct > 0 ? "▲" : diffPct < 0 ? "▼" : "•";
  const text =
    diffPct > 0
      ? `${state.lastMonthLabel} 보다 ${Math.abs(diffPct)}% 높은 금액이에요 ${arrow}`
      : diffPct < 0
      ? `${state.lastMonthLabel} 보다 ${Math.abs(diffPct)}% 낮은 금액이에요! ${arrow}`
      : `${state.lastMonthLabel}와 동일한 금액이에요.`;
  deltaEl.textContent = text;

  // 막대 길이 (상대 스케일)
  const maxVal = Math.max(state.total, state.lastMonthTotal) || 1;
  const julyWidth = Math.round((state.lastMonthTotal / maxVal) * 100);
  const augWidth = Math.round((state.total / maxVal) * 100);
  $("#barJuly")?.style.setProperty("width", `${julyWidth}%`);
  $("#barAug")?.style.setProperty("width", `${augWidth}%`);
}

function renderCards() {
  const elec = state.breakdown.electricity || 0;
  const water = state.breakdown.water || 0;

  const elecPct = pct(elec, state.total);
  const waterPct = pct(water, state.total);

  const elecEl = $("#elecPrice");
  const waterEl = $("#waterPrice");
  if (elecEl) animateNumber(elecEl, elec);
  if (waterEl) animateNumber(waterEl, water);

  const donutElec = $("#donutElec");
  const donutWater = $("#donutWater");

  if (donutElec) {
    donutElec.style.setProperty("--percent", elecPct);
    donutElec.setAttribute("aria-label", `전기 비중 ${elecPct}%`);
    donutElec.title = `전기 비중 ${elecPct}%`;
  }
  if (donutWater) {
    donutWater.style.setProperty("--percent", waterPct);
    donutWater.setAttribute("aria-label", `수도 비중 ${waterPct}%`);
    donutWater.title = `수도 비중 ${waterPct}%`;
  }
}

function renderConnectionToast() {
  const toast = $("#toast");
  if (!toast) return;

  const port = window.location.port || "5500";
  // 실제 환경에 맞게 서버가 알려주는 LAN IP로 교체하는 것이 좋습니다.
  const myIP =
    localStorage.getItem("my-lan-ip") ||
    "192.168.219.100"; // 기본값. 설정 UI에서 바꿀 수 있게 확장 가능
  const url = `http://${myIP}:${port}`;
  $("#addr").textContent = url;

  const copyBtn = $("#copyBtn");
  const closeBtn = $("#closeToast");

  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      copyBtn.textContent = "복사됨!";
      setTimeout(() => (copyBtn.textContent = "주소 복사"), 1200);
    } catch {
      alert("클립보드 복사에 실패했어요.");
    }
  });

  closeBtn?.addEventListener("click", () => (toast.style.display = "none"));
  toast.style.display = "block";
}

// ---------- Actions / Events ----------
function bindActions() {
  $("#logBtn")?.addEventListener("click", () => {
    // 라우터 연동 전 데모
    alert("로그 화면으로 이동(데모)");
  });
  $("#bellBtn")?.addEventListener("click", () => {
    alert("알림 센터(데모)");
  });
  $("#searchBtn")?.addEventListener("click", () => {
    alert("검색(데모)");
  });

  // 예시: IP 저장(옵션)
  // $("#saveIpBtn").addEventListener("click", ()=>{
  //   const ip = $("#ipInput").value.trim();
  //   if (ip) localStorage.setItem("my-lan-ip", ip);
  // });
}

// ---------- App Init ----------
async function init() {
  // 시계
  renderClock();
  setInterval(renderClock, 30 * 1000);

  // 로딩 표시(간단)
  $("#totalPrice").textContent = "불러오는 중...";

  // 데이터 로드
  try {
    const data = await fetchMonthlyEstimate();
    // 상태 갱신
    state.monthLabel = data.monthLabel;
    state.lastMonthLabel = data.lastMonthLabel;
    state.total = data.total;
    state.lastMonthTotal = data.lastMonthTotal;
    state.breakdown = data.breakdown;

    // 렌더
    renderSummary();
    renderCards();
    renderConnectionToast();
  } catch (e) {
    console.error(e);
    $("#deltaText").textContent = "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  bindActions();
}

// DOM 준비 후 시작
document.addEventListener("DOMContentLoaded", init);
