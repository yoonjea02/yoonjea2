/* app.js — 단일 파일 플러그인 아키텍처
   - 전역 오염 없이 IIFE로 감쌈
   - Feature Registry로 기능을 등록/탑재
   - 페이지별(data-page)·DOM 존재여부에 따라 자동 마운트
   - 공통 Store/EventBus/Helpers 제공
*/
(function (window, document) {
  "use strict";

  /* ========== Mini Helpers ========== */
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const won = (v) => new Intl.NumberFormat("ko-KR").format(Math.round(+v||0)) + " 원";

  /* ========== Event Bus ========== */
  const Bus = (() => {
    const m = new Map(); // evt -> Set<fn>
    return {
      on(evt, fn)  { if(!m.has(evt)) m.set(evt, new Set()); m.get(evt).add(fn); return () => this.off(evt, fn); },
      off(evt, fn) { m.get(evt)?.delete(fn); },
      emit(evt, payload){ m.get(evt)?.forEach(fn => fn(payload)); }
    };
  })();

  /* ========== Store (간단 상태) ========== */
  const Store = (() => {
    const state = {
      page: document.body.dataset.page || "home",
      totals: { now: 0, last: 0 },
      breakdown: { electricity: 0, water: 0 },
      goalWon: Number(localStorage.getItem("saving-goal-won") || 0),
      recentKeywords: []
    };
    return {
      get: () => state,
      patch: (next) => { Object.assign(state, next); Bus.emit("state:changed", state); },
      setGoal(v){ state.goalWon = Math.max(0, Math.round(+v||0)); localStorage.setItem("saving-goal-won", String(state.goalWon)); Bus.emit("state:changed", state); },
      clearGoal(){ state.goalWon = 0; localStorage.removeItem("saving-goal-won"); Bus.emit("state:changed", state); },
      addRecentKeyword(q){
        if(!q) return;
        const arr = state.recentKeywords;
        if(!arr.includes(q)){ arr.unshift(q); if(arr.length>6) arr.pop(); Bus.emit("state:changed", state); }
      }
    };
  })();

  /* ========== Feature Registry ========== */
  const FeatureManager = (() => {
    const features = [];
    return {
      register(def){ features.push(def); return this; },
      init(){
        const ctx = { $, $$, won, bus: Bus, store: Store, page: Store.get().page };
        // mount 조건을 만족하는 기능만 장착
        features.forEach(f => {
          try{
            const okPage = !f.pages || f.pages.includes(ctx.page);
            const okWhen = typeof f.when === "function" ? !!f.when(ctx) : true;
            if(okPage && okWhen){
              f._mounted = true;
              f.mount?.(ctx);
            }
          }catch(e){ console.error(`[Feature:${f.id}] mount error`, e); }
        });
        // 언마운트(페이지 종료 전)
        window.addEventListener("beforeunload", () => {
          features.forEach(f => { if(f._mounted) try{ f.unmount?.(); }catch{} });
        });
      }
    };
  })();

  /* ========== Core Features ========== */

  // 1) 헤더 시계 + 네비 하이라이트
  FeatureManager.register({
    id: "core-ui",
    mount({ $ }){
      const timeEl = $(".time");
      function tick(){
        if(!timeEl) return;
        const now = new Date();
        timeEl.textContent = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
      }
      tick(); this._timer = setInterval(tick, 30*1000);

      // nav dot active (data-page 기준)
      const page = document.body.dataset.page || "home";
      const map = { home:0, cost:1, analytics:2, alerts:3, settings:4, log:2, search:2 };
      const idx = map[page] ?? 0;
      $$(".nav .dot").forEach((d,i)=>d.classList.toggle("active", i===idx));
    },
    unmount(){ clearInterval(this._timer); }
  });

  // 2) 데이터 로더 (Mock) — 실제 API로 교체 가능
  FeatureManager.register({
    id: "data-loader",
    async mount({ store }){
      try{
        // 실제로는 fetch('/api/estimates?month=YYYY-MM') 사용
        await new Promise(r => setTimeout(r, 250));
        const mock = {
          totals: { now: 32600, last: 37000 },
          breakdown: { electricity: 13830, water: 7820 }
        };
        store.patch({ totals: mock.totals, breakdown: mock.breakdown });
        Bus.emit("data:ready", Store.get());
      }catch(e){
        console.error("데이터 로드 실패", e);
        Bus.emit("data:error", e);
      }
    }
  });

  // 3) 메인/대시보드 렌더러 (요약/도넛/막대)
  FeatureManager.register({
    id: "dashboard-render",
    pages: ["home"], // index.html
    when(){ return $("#totalPrice") || $("#donutElec") || $("#donutWater"); },
    mount({ $, won, store }){
      const state = store.get();
      const render = () => {
        const s = store.get();
        // Summary
        const totalEl = $("#totalPrice");
        const deltaEl = $("#deltaText");
        if(totalEl){
          totalEl.textContent = won(s.totals.now);
          const diffPct = s.totals.last ? Math.round(((s.totals.now - s.totals.last)/s.totals.last)*100) : 0;
          const arrow = diffPct>0?"▲":diffPct<0?"▼":"•";
          deltaEl && (deltaEl.textContent =
            diffPct>0 ? `지난달 보다 ${Math.abs(diffPct)}% 높은 금액이에요 ${arrow}` :
            diffPct<0 ? `지난달 보다 ${Math.abs(diffPct)}% 낮은 금액이에요! ${arrow}` :
                        "지난달과 동일한 금액이에요.");
          // Bars (상대)
          const maxVal = Math.max(s.totals.now, s.totals.last) || 1;
          $("#barJuly") && ($("#barJuly").style.width = Math.round((s.totals.last/maxVal)*100) + "%");
          $("#barAug")  && ($("#barAug").style.width  = Math.round((s.totals.now /maxVal)*100) + "%");
        }
        // Cards
        const elec = s.breakdown.electricity||0, water=s.breakdown.water||0, total=s.totals.now||1;
        $("#elecPrice") && ($("#elecPrice").textContent = won(elec));
        $("#waterPrice") && ($("#waterPrice").textContent = won(water));
        const elecPct = Math.round((elec/total)*100), waterPct = Math.round((water/total)*100);
        const de = $("#donutElec"), dw = $("#donutWater");
        if(de){ de.style.setProperty("--percent", elecPct); de.title = `전기 비중 ${elecPct}%`; de.setAttribute("aria-label", de.title); }
        if(dw){ dw.style.setProperty("--percent", waterPct); dw.title = `수도 비중 ${waterPct}%`; dw.setAttribute("aria-label", dw.title); }
      };
      render();
      this._off = Bus.on("state:changed", render);
    },
    unmount(){ this._off?.(); }
  });

  // 4) 목표(절약) 위젯 — DOM 있으면 자동 작동 (어느 페이지든)
  FeatureManager.register({
    id: "savings-goal",
    when(){ return $("#goalForm"); }, // 해당 블록이 있는 페이지에서만
    mount({ $, won, store }){
      const savedNowEl = $("#savedNow"), goalPctEl = $("#goalPct"), fillEl = $("#goalFill");
      const hintEl = $("#goalHint"), successEl = $("#goalSuccess");
      const form = $("#goalForm"), input = $("#goalInput"); const clearBtn = $("#goalClear"); const toast = $("#goalToast");
      const calcSaved = (s) => Math.max((s.totals.last||0) - (s.totals.now||0), 0);
      const render = () => {
        const s = store.get();
        const saved = calcSaved(s), goal = s.goalWon;
        savedNowEl && (savedNowEl.textContent = `이번 달 절감액: ${won(saved)}`);
        let pct = 0;
        if(goal>0){ pct = Math.min(100, Math.round((saved/goal)*100)); goalPctEl && (goalPctEl.textContent = `${pct}%`);
          hintEl && (hintEl.textContent = `목표: ${won(goal)} · 남은 금액 ${won(Math.max(goal-saved,0))}`);
        }else{ goalPctEl && (goalPctEl.textContent = "0%"); hintEl && (hintEl.textContent="목표를 설정해 진행률을 확인해 보세요"); }
        fillEl && (fillEl.style.width = pct + "%");
        successEl && (successEl.style.display = (goal>0 && saved>=goal) ? "block" : "none");
        if(input && goal>0) input.value = goal;
      };
      this._off = Bus.on("state:changed", render);
      render();

      form?.addEventListener("submit", (e)=>{ e.preventDefault(); store.setGoal(input?.value); toast&&(toast.textContent="목표 저장됨"); toast&&(toast.style.display="block"); setTimeout(()=>toast&&(toast.style.display="none"), 1200); });
      clearBtn?.addEventListener("click", ()=>{ store.clearGoal(); toast&&(toast.textContent="목표 초기화"); toast&&(toast.style.display="block"); setTimeout(()=>toast&&(toast.style.display="none"), 1200); });
    },
    unmount(){ this._off?.(); }
  });

  // 5) 로컬 네트워크 접속 토스트 (있을 때만)
  FeatureManager.register({
    id: "connection-toast",
    when(){ return $("#toast"); },
    mount({ $ }){
      const port = window.location.port || "5500";
      const myIP = localStorage.getItem("my-lan-ip") || "192.168.219.100";
      const url = `http://${myIP}:${port}`;
      $("#addr") && ($("#addr").textContent = url);
      $("#copyBtn")?.addEventListener("click", async () => {
        try{ await navigator.clipboard.writeText(url); $("#copyBtn").textContent="복사됨!"; setTimeout(()=>$("#copyBtn").textContent="주소 복사",1200); }
        catch{ alert("클립보드 복사 실패"); }
      });
      $("#closeToast")?.addEventListener("click", ()=> $("#toast").style.display="none");
      $("#toast").style.display="block";
    }
  });

  // 6) 검색 페이지 로직 (search.html 전용)
  FeatureManager.register({
    id: "search-logic",
    pages: ["search"],
    when(){ return $("#q"); },
    mount({ $, store }){
      const input = $("#q"), grid = $("#results"), empty = $("#empty"), recentBox = $("#recentKeywords");
      const renderRecent = () => {
        recentBox && (recentBox.innerHTML = store.get().recentKeywords.map(r=>`<a class="pill" href="#" data-k="${r}">${r}</a>`).join(""));
        $$("a[data-k]").forEach(a=>a.addEventListener("click",(e)=>{ e.preventDefault(); input.value = a.dataset.k; doSearch(); }));
      };
      const sampleFor = (q) => [
        { title:`‘${q}’ 관련 요약`, desc:`최근 한 달 간 ${q}에 대한 사용 로그 및 알림을 요약했습니다.` },
        { title:`${q} 절약 팁 모음`, desc:`간단히 적용 가능한 체크리스트와 예상 절감 금액을 제공합니다.` },
        { title:`${q} 이상 패턴 탐지`, desc:`이상치 탐지 규칙과 지난 발생 내역을 확인하세요.` },
        { title:`${q} 대시보드 바로가기`, desc:`관련 위젯이 포함된 분석 화면으로 이동합니다.` },
      ];
      function doSearch(){
        const q = (input.value||"").trim();
        if(!q){
          grid.innerHTML = `<div class="result-card"><div class="kicker">추천</div><div class="title">검색 결과가 여기에 표시됩니다</div><div class="desc">키워드를 입력하거나 위 칩을 눌러보세요.</div></div>`;
          empty.style.display = "none"; return;
        }
        store.addRecentKeyword(q); renderRecent();
        const items = sampleFor(q);
        grid.innerHTML = items.map(it=>`
          <div class="result-card">
            <div class="kicker">결과</div>
            <div class="title">${it.title}</div>
            <div class="desc">${it.desc}</div>
          </div>`).join("");
        empty.style.display = items.length ? "none" : "block";
      }
      // 칩/필터 클릭으로 채우기
      $$(".chip, .pill").forEach(el=>{
        el.addEventListener("click", (e)=>{
          const t = e.currentTarget.textContent.trim();
          if(["전체","전기","수도","가스","절약 팁"].includes(t)) return; // 필터 탭은 패스
          input.value = t; doSearch();
        });
      });
      // Enter 검색
      input?.form?.addEventListener("submit", (e)=>{ e.preventDefault(); doSearch(); });

      this._doSearch = doSearch;
      renderRecent();
    }
  });

  /* ========== Boot ========== */
  document.addEventListener("DOMContentLoaded", () => FeatureManager.init());

  /* ========== Public API (선택) ========== */
  window.App = {
    bus: Bus,
    store: Store,
    register: (f) => { FeatureManager.register(f); return window.App; },
    won
  };

})(window, document);

/* ========== 새 기능 추가 가이드 ==========

1) 아래 템플릿을 복사해 app.js 맨 아래에 붙이고,
   필요한 페이지/DOM 조건/렌더 내용을 채워 넣으세요.

App.register({
  id: "my-feature",
  pages: ["home","log","alerts","search"],   // 생략하면 모든 페이지
  when(ctx){ return document.querySelector("#myFeatureRoot"); }, // DOM이 있을 때만
  mount(ctx){
    // 초기화/렌더
    const { $, store, bus, won } = ctx;
    // 예: bus.on("state:changed", ()=>{ ... });
  },
  unmount(){
    // 이벤트 해제/타이머 정리
  }
});

2) HTML에 필요한 루트 요소만 추가하면 자동으로 마운트됩니다.
   (DOM이 없으면 스킵되므로 안전합니다.)

3) 전역 상태가 필요하면 store.patch({ ... }) 로 반영하고,
   렌더 함수는 bus.on("state:changed")로 구독하세요.

================================================ */
// Drawer helper (optional)
(function(){
  const d=document, dr=d.getElementById('drawer'), sc=d.getElementById('scrim');
  if(!dr||!sc) return;
  const open=()=>{ dr.classList.add('open'); sc.classList.add('show'); };
  const close=()=>{ dr.classList.remove('open'); sc.classList.remove('show'); };
  d.querySelectorAll('#openDrawer, #openDrawer2').forEach(b=>b?.addEventListener('click', open));
  sc.addEventListener('click', close);
  d.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); });
})();
