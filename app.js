(function(){
'use strict';
const C = window.APP_CONFIG || {};
const APP_VERSION = '1.1.0';
const DEMO = !C.LIFF_ID || new URLSearchParams(location.search).has('demo');
const LS_STATE = 'dr_state_v1', LS_QUEUE = 'dr_queue_v1';
const ACTION_LABEL = {GATE:'抵達哨口', DOCK:'抵達碼頭', DONE:'完成交貨'};
const STEP_ORDER = ['GATE','DOCK','DONE'];
const $ = s => document.querySelector(s);
const app = $('#app');

// ---------- storage ----------
function load(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } }
let S = load(LS_STATE, {profile:null, trip:null, draft:[]});
let Q = load(LS_QUEUE, []);
function persist(){ save(LS_STATE, S); }
function uuid(){ return (crypto.randomUUID ? crypto.randomUUID() : 'x'+Date.now().toString(36)+Math.random().toString(36).slice(2)); }
function nowIso(){ return new Date().toISOString(); }
function hhmm(iso){ const d=new Date(iso); return d.toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false}); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function vibrate(p){ try{ navigator.vibrate && navigator.vibrate(p); }catch(e){} }
function toast(msg, ms){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), ms||2200); }

// ---------- GPS ----------
let lastFix = null, gpsState = 'wait';
function setGps(st, txt){ gpsState=st; const d=$('#gpsDot'); d.className='dot '+({ok:'ok',mid:'mid',bad:'bad'}[st]||''); $('#gpsTxt').textContent=txt; }
function onPos(p){
  lastFix = {lat:p.coords.latitude, lng:p.coords.longitude, acc:Math.round(p.coords.accuracy||9999), t:Date.now()};
  if(lastFix.acc<=100) setGps('ok','定位正常'); else setGps('mid','定位精準度 '+lastFix.acc+'m');
  if(view==='trip-select'){ const k=nearKey(); if(k!==lastNearKey){ lastNearKey=k; render(); } }
}
let lastNearKey='';
function nearKey(){ const s=sitesByDistance()[0]; if(!s||s.d==null) return 'none';
  return s.d <= Math.max(C.AUTO_DETECT_RADIUS_M||800, s.radius||0) ? 'near:'+s.id : 'far:'+sitesByDistance().slice(0,3).map(x=>x.id).join(','); }
function onPosErr(err){
  if(err && err.code===1){ setGps('bad','定位未開啟'); showGpsHelpOnce(); if(view==='trip-select') render(); }
  else if(!lastFix) setGps('mid','搜尋定位中');
}
function startGps(){
  if(!navigator.geolocation){ setGps('bad','不支援定位'); return; }
  navigator.geolocation.watchPosition(onPos, onPosErr, {enableHighAccuracy:true, maximumAge:10000, timeout:30000});
}
function getPos(opt){ return new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,opt)); }
async function getFix(){
  const now = Date.now();
  if(lastFix && now-lastFix.t < 30000 && lastFix.acc <= 150) return {lat:lastFix.lat,lng:lastFix.lng,acc:lastFix.acc,source:'live',age:Math.round((now-lastFix.t)/1000)};
  if(navigator.geolocation){
    try{ const p = await getPos({enableHighAccuracy:true, timeout:8000, maximumAge:15000}); onPos(p);
      return {lat:p.coords.latitude,lng:p.coords.longitude,acc:Math.round(p.coords.accuracy),source:'gps',age:0}; }catch(e){}
    try{ const p = await getPos({enableHighAccuracy:false, timeout:6000, maximumAge:60000});
      return {lat:p.coords.latitude,lng:p.coords.longitude,acc:Math.round(p.coords.accuracy),source:'network',age:0}; }catch(e){}
  }
  if(lastFix && now-lastFix.t < 30*60000) return {lat:lastFix.lat,lng:lastFix.lng,acc:lastFix.acc,source:'last_known',age:Math.round((now-lastFix.t)/1000)};
  return {source:'none'};
}
let gpsHelpShown=false;
function showGpsHelpOnce(){
  if(gpsHelpShown) return; gpsHelpShown=true;
  openSheet(`<h2>請開啟定位</h2>
   <p class="muted">定位只在您按下按鈕時記錄，用來確認抵達廠區，不會持續追蹤。</p>
   <div class="consent"><b>iPhone：</b>設定 → 隱私權與安全性 → 定位服務 → LINE → 選「使用App期間」<br><br>
   <b>Android：</b>設定 → 應用程式 → LINE → 權限 → 位置 → 允許<br><br>開啟後回到這裡重新整理。</div>
   <button class="btn primary" style="margin-top:14px" data-close>知道了</button>`);
}
function dist(a, b){ // meters, [lat,lng]
  const R=6371000, toR=x=>x*Math.PI/180;
  const dLat=toR(b[0]-a[0]), dLng=toR(b[1]-a[1]);
  const h=Math.sin(dLat/2)**2+Math.cos(toR(a[0]))*Math.cos(toR(b[0]))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function sitesByDistance(){
  const sites = (C.SITES||[]).map(s=>{
    let d=null;
    if(lastFix){ const p=[lastFix.lat,lastFix.lng]; d=Math.min(dist(p,s.gate), s.dock?dist(p,s.dock):Infinity); }
    return Object.assign({}, s, {d});
  });
  if(lastFix) sites.sort((a,b)=>a.d-b.d); else sites.sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'));
  return sites;
}
function fmtDist(d){ if(d==null) return ''; return d<1000 ? Math.round(d)+' m' : (d/1000).toFixed(1)+' km'; }
function siteById(id){ return (C.SITES||[]).find(s=>s.id===id); }

// ---------- API ----------
async function idToken(){ return DEMO ? 'demo' : liff.getIDToken(); }
async function api(action, payload){
  if(DEMO) return demoApi(action, payload);
  if(!C.API_URL) throw new Error('尚未設定 API_URL');
  const res = await fetch(C.API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify(Object.assign({action, idToken: await idToken(), appVersion:APP_VERSION}, payload||{}))});
  const j = await res.json();
  if(!j.ok){ if(j.error==='AUTH_EXPIRED' && !DEMO){ liff.login({redirectUri: location.href}); } throw new Error(j.error||'伺服器錯誤'); }
  return j;
}
function demoApi(action, p){
  const db = load('dr_demo_server', {profile:null, state:null, events:[]});
  if(action==='bind'){ db.profile=p.profile; save('dr_demo_server', db); return {ok:true}; }
  if(action==='events'){ p.events.forEach(e=>{ if(e.photo) e.photo='(photo '+e.photo.length+' chars)'; }); db.events.push(...p.events); db.state=p.state; save('dr_demo_server', db); return {ok:true, accepted:p.events.map(e=>e.eventId)}; }
  if(action==='getState') return {ok:true, profile:db.profile, state:db.state};
  return {ok:false};
}

// ---------- event queue ----------
function snapshot(){ return {trip:S.trip, profile:S.profile, savedAt:nowIso()}; }
function enqueue(ev){
  ev.eventId = ev.eventId || uuid();
  ev.clientTime = ev.clientTime || nowIso();
  ev.eventTime = ev.eventTime || ev.clientTime;
  ev.gpsPending = !ev.noGps;
  Q.push(ev);
  if(!save(LS_QUEUE, Q) && ev.photo){ // 空間不足：照片先不暫存，直接送
    ev.photo=null; ev.note=(ev.note||'')+'[照片因手機空間不足未上傳]'; save(LS_QUEUE, Q);
  }
  updateSync();
  if(!ev.noGps){
    getFix().then(fix=>{
      const q = Q.find(x=>x.eventId===ev.eventId) || ev;
      Object.assign(q, {lat:fix.lat, lng:fix.lng, accuracyM:fix.acc, gpsSource:fix.source, gpsAgeSec:fix.age, gpsPending:false});
      save(LS_QUEUE, Q); flush();
    });
  } else { ev.gpsSource='backfill'; flush(); }
  return ev;
}
let flushing=false;
async function flush(){
  if(flushing || !Q.length) { updateSync(); return; }
  flushing=true;
  try{
    const now=Date.now();
    const ready = Q.filter(e=>!e.gpsPending || now-Date.parse(e.clientTime) > 20000);
    if(!ready.length) return;
    const batch = ready.slice(0, 10).map(e=>{ const c=Object.assign({},e); delete c.gpsPending; if(c.gpsSource==null) c.gpsSource='none'; return c; });
    const r = await api('events', {events: batch, state: snapshot()});
    const acc = new Set(r.accepted||[]);
    Q = Q.filter(e=>!acc.has(e.eventId)); save(LS_QUEUE, Q);
  }catch(e){ console.warn('flush failed', e); }
  finally{ flushing=false; updateSync(); }
  if(Q.some(e=>!e.gpsPending)) setTimeout(flush, 1500);
}
function updateSync(){
  const n=Q.length, d=$('#syncDot'), t=$('#syncTxt'); if(!d) return;
  if(!n){ d.className='dot ok'; t.textContent='已同步'; }
  else { d.className='dot '+(navigator.onLine?'mid':'bad'); t.textContent= navigator.onLine ? n+' 筆上傳中' : n+' 筆待上傳（無網路）'; }
}
window.addEventListener('online', flush);
setInterval(flush, 15000);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden){ flush(); checkAutoClose(); render(); } });

// ---------- sheets ----------
function openSheet(html, onMount){
  const root=$('#sheetRoot');
  root.innerHTML = `<div class="sheet-bg"><div class="sheet">${html}</div></div>`;
  root.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeSheet);
  root.querySelector('.sheet-bg').onclick = e=>{ if(e.target.classList.contains('sheet-bg')) closeSheet(); };
  onMount && onMount(root);
}
function closeSheet(){ $('#sheetRoot').innerHTML=''; }

// ---------- trip logic ----------
function curStop(){ const t=S.trip; return t && t.current!=null ? t.stops[t.current] : null; }
function nextStep(stop){ return STEP_ORDER.find(k=>!stop.steps[k]); }
function lastActionTime(){
  const t=S.trip; if(!t) return null; let m=Date.parse(t.startedAt);
  t.stops.forEach(s=>Object.values(s.steps).forEach(v=>{ if(v) m=Math.max(m, Date.parse(v.at)); }));
  return m;
}
function checkAutoClose(){
  const t=S.trip; if(!t) return;
  const last=lastActionTime();
  if(Date.now()-last > (C.TRIP_AUTO_CLOSE_HOURS||12)*3600e3){
    enqueue({action:'TRIP_END', tripId:t.tripId, orders:t.orders, note:'閒置自動結案', noGps:true});
    S.trip=null; S.lastUndo=null; persist();
  }
}
function baseEv(stop){ const t=S.trip; return {tripId:t.tripId, orders:t.orders, siteId:stop?stop.siteId:'', siteName:stop?stop.siteName:'', siteType:stop?stop.type:''}; }

function startTrip(){
  stopScanner();
  const orders=[...S.draft];
  S.trip={tripId:uuid(), startedAt:nowIso(), orders, stops:[], current:null, askNext:false};
  S.draft=[]; persist(); stopScanner();
  enqueue(Object.assign(baseEv(null), {action:'TRIP_START'}));
  vibrate(60); toast('已出車，車單 '+orders.length+' 張'); go('trip');
}
function arriveSite(site){
  const t=S.trip;
  t.stops.push({siteId:site.id, siteName:site.name, type:site.type||'normal', steps:{}});
  t.current=t.stops.length-1; t.askNext=false;
  doStep('GATE');
}
function doStep(action){
  const stop=curStop(); if(!stop) return;
  const ev=enqueue(Object.assign(baseEv(stop), {action}));
  stop.steps[action]={at:ev.eventTime, id:ev.eventId};
  S.lastUndo={eventIds:[ev.eventId], at:Date.now()};
  if(action==='DONE') S.trip.askNext=true;
  persist(); vibrate(80); toast(ACTION_LABEL[action]+' '+hhmm(ev.eventTime)+' 已記錄'); render();
}
function fabFinish(minAgo){
  const stop=curStop(); if(!stop) return;
  const now=Date.now();
  const evs=[];
  if(!stop.steps.DOCK){
    const dockT = minAgo==null ? null : new Date(now-minAgo*60000).toISOString();
    const d=enqueue(Object.assign(baseEv(stop), {action:'DOCK', backfill:true, noGps:true, eventTime: dockT || nowIso(),
      note: minAgo==null ? '碼頭時間不記得' : '約'+minAgo+'分鐘前'}));
    stop.steps.DOCK={at:d.eventTime, id:d.eventId, backfill:true}; evs.push(d.eventId);
  }
  const ev=enqueue(Object.assign(baseEv(stop), {action:'DONE', backfill:true, note:'出廠後補登（交貨離廠）'}));
  stop.steps.DONE={at:ev.eventTime, id:ev.eventId, backfill:true}; evs.push(ev.eventId);
  S.lastUndo={eventIds:evs, at:now}; S.trip.askNext=true;
  persist(); closeSheet(); vibrate(80); toast('交貨離廠已記錄'); render();
}
function undo(){
  const u=S.lastUndo, stop=curStop(); if(!u) return;
  const t=S.trip;
  // 找出要復原的步驟
  let removedStop=false;
  t.stops.forEach((s,i)=>{ Object.keys(s.steps).forEach(k=>{ if(u.eventIds.includes(s.steps[k].id)) delete s.steps[k]; }); });
  const cs=curStop();
  if(cs && !Object.keys(cs.steps).length){ t.stops.splice(t.current,1); t.current=null; removedStop=true; }
  else if(cs) t.askNext=false;
  u.eventIds.forEach(id=>enqueue(Object.assign(baseEv(cs), {action:'UNDO', refEventId:id, noGps:true})));
  S.lastUndo=null; persist(); toast('已復原'); render();
}
function canUndo(){ return S.lastUndo && Date.now()-S.lastUndo.at < (C.UNDO_WINDOW_MIN||3)*60000; }
function nextSite(){ S.trip.current=null; S.trip.askNext=false; S.lastUndo=null; persist(); render(); }
function endTrip(){
  const t=S.trip;
  enqueue({action:'TRIP_END', tripId:t.tripId, orders:t.orders});
  S.trip=null; S.lastUndo=null; persist(); closeSheet(); go('finished');
}

// ---------- scanner（zxing-wasm：比舊引擎更能讀一維條碼） ----------
const ZX_FORMATS=['Code128','Code39','Code93','ITF','EAN13','Codabar','QRCode'];
const ZX_OPTS={formats:ZX_FORMATS,tryHarder:true,tryRotate:true,tryInvert:false,maxNumberOfSymbols:1};
let scanner=null, lastCode='', lastCodeAt=0;
function normalizeCode(raw){
  let c=String(raw||'').trim().toUpperCase().replace(/\s+/g,'');
  // 車單條碼內含一個前導 0（例：條碼 08861001770620，印出來是 8861001770620），統一成印出來的號碼
  if(/^\d+$/.test(c)) c=c.replace(/^0+(?=\d)/,'');
  return c;
}
function validOrder(code){
  if(!C.ORDER_PATTERN) return true;
  try{ return new RegExp(C.ORDER_PATTERN).test(code); }catch(e){ return true; }
}
function addOrder(raw, fromScan){
  const code=normalizeCode(raw); if(!code) return false;
  const now=Date.now();
  if(fromScan && code===lastCode && now-lastCodeAt<2500) return false;
  lastCode=code; lastCodeAt=now;
  if(!validOrder(code)){ vibrate([60,60,60]); toast('不是車單條碼：'+code); return false; }
  if(S.draft.includes(code)){ if(!fromScan) toast('已經掃過了'); return false; }
  S.draft.push(code); persist(); vibrate(70); renderDraft(true); toast('已加入 '+code,1200);
  return true;
}
function zxReady(){ return !!(window.ZXingWASM && ZXingWASM.readBarcodesFromImageData); }
function preloadZx(){ try{ if(zxReady()) ZXingWASM.prepareZXingModule({fireImmediately:true}); }catch(e){} }
async function startScanner(){
  const box=$('#reader'); if(!box) return;
  if(!zxReady()){ cameraFailed('engine'); return; }
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ cameraFailed('no media'); return; }
  const st={stream:null, video:null, timer:null, busy:false, stopped:false};
  scanner=st;
  try{
    st.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
  }catch(e){ if(scanner===st) scanner=null; cameraFailed(e); return; }
  if(st.stopped||scanner!==st){ st.stream.getTracks().forEach(t=>t.stop()); return; }
  try{ const tr=st.stream.getVideoTracks()[0], cap=tr.getCapabilities?tr.getCapabilities():{};
    if(cap.focusMode&&cap.focusMode.includes('continuous')) await tr.applyConstraints({advanced:[{focusMode:'continuous'}]}); }catch(e){}
  const v=document.createElement('video'); v.setAttribute('playsinline',''); v.muted=true; v.autoplay=true; v.srcObject=st.stream; st.video=v;
  box.innerHTML=''; box.appendChild(v);
  box.insertAdjacentHTML('beforeend','<div class="scan-frame"></div><div class="scan-hint">把條碼放進框內，掃到會震動</div>');
  try{ await v.play(); }catch(e){}
  const cv=document.createElement('canvas'), ctx=cv.getContext('2d',{willReadFrequently:true});
  const tick=async()=>{
    if(st.stopped) return;
    if(!st.busy && v.readyState>=2 && v.videoWidth){
      st.busy=true;
      try{
        const W=v.videoWidth,H=v.videoHeight, cw=Math.round(W*0.9), ch=Math.round(Math.min(H, W*0.45));
        const sx=Math.round((W-cw)/2), sy=Math.round((H-ch)/2);
        const k=Math.min(1, 1600/cw); cv.width=Math.round(cw*k); cv.height=Math.round(ch*k);
        ctx.drawImage(v,sx,sy,cw,ch,0,0,cv.width,cv.height);
        const res=await ZXingWASM.readBarcodesFromImageData(ctx.getImageData(0,0,cv.width,cv.height),ZX_OPTS);
        if(res&&res.length&&res[0].text){ addOrder(res[0].text,true); }
      }catch(e){ console.warn('scan',e); }
      st.busy=false;
    }
    st.timer=setTimeout(tick,120);
  };
  tick();
}
function cameraFailed(err){
  console.warn(err);
  const r=$('#reader'); if(!r) return;
  r.innerHTML='<div class="scan-hint" style="position:static;padding:40px 12px">即時相機無法開啟<br>請改按下方「拍照掃描」或「手動輸入」</div>';
  r.style.minHeight='0';
}
function stopScanner(){
  if(!scanner) return;
  const st=scanner; scanner=null; st.stopped=true;
  clearTimeout(st.timer);
  try{ st.stream&&st.stream.getTracks().forEach(t=>t.stop()); }catch(e){}
  try{ if(st.video) st.video.srcObject=null; }catch(e){}
}
async function scanPhoto(file){
  if(!file) return;
  if(!zxReady()){ toast('掃描元件載入失敗，請手動輸入'); return; }
  toast('辨識中…',1500);
  try{
    let res=await ZXingWASM.readBarcodes(file,ZX_OPTS);
    if(!res||!res.length){ // 大照片縮小再試一次
      const bmp=await createImageBitmap(file); const k=Math.min(1,1800/Math.max(bmp.width,bmp.height));
      const c=document.createElement('canvas'); c.width=Math.round(bmp.width*k); c.height=Math.round(bmp.height*k);
      const g=c.getContext('2d'); g.drawImage(bmp,0,0,c.width,c.height);
      res=await ZXingWASM.readBarcodesFromImageData(g.getImageData(0,0,c.width,c.height),ZX_OPTS);
    }
    if(res&&res.length&&res[0].text){ addOrder(res[0].text,false); return; }
    throw new Error('none');
  }catch(e){ vibrate([60,60,60]); toast('照片裡找不到條碼，請拍近一點、拍清楚，或手動輸入',3000); }
}

// ---------- views ----------
let view='loading';
function go(v){ if(view==='scan' && v!=='scan') stopScanner(); view=v; render(); window.scrollTo(0,0); }
function updateHeader(){
  const p=S.profile;
  $('#hdr').classList.toggle('hidden', !p);
  if(!p) return;
  $('#hdrName').textContent=p.supplier+'｜'+p.name;
  $('#hdrPlate').textContent=p.plate;
  $('#hdrTrip').textContent = S.trip ? '行程中・車單 '+S.trip.orders.length+' 張' : '';
}
function render(){
  updateHeader();
  if(view!=='scan') stopScanner();
  const v = VIEWS[view] || VIEWS.home;
  v();
}
const VIEWS = {
  loading(){ app.innerHTML='<div class="card center muted">載入中…</div>'; },
  outside(){ app.innerHTML=`<div class="card center"><h1>請從 LINE 開啟</h1><p class="muted">請回到 LINE，點選官方帳號下方選單的「配送回報」。</p></div>`; },
  error(){ app.innerHTML=`<div class="card center"><h1>連線失敗</h1><p class="muted">${esc(window.__err||'')}</p><button class="btn primary" onclick="location.reload()">重新整理</button></div>`; },
  bind(){
    const p=S.profile||{};
    app.innerHTML=`<div class="card"><h1>第一次使用</h1><p class="muted">請設定一次，之後不用再填。</p>
      <label>供應商</label><div class="choice" id="supList">${(C.SUPPLIERS||[]).map(s=>`<button data-s="${esc(s)}" class="${p.supplier===s?'sel':''}">${esc(s)}</button>`).join('')}</div>
      <label>姓名</label><input id="fName" value="${esc(p.name||'')}" placeholder="例：王大明" autocomplete="name">
      <label>常用車號</label><input id="fPlate" value="${esc(p.plate||'')}" placeholder="例：KLA-1234" style="text-transform:uppercase">
      <p class="consent" style="margin-top:16px">為確認配送進度，系統會在您按下回報按鈕時記錄<b>時間與位置</b>，僅用於配送管理與對帳，不會持續追蹤您的位置。按下「同意並開始」即表示同意。</p>
      <button class="btn primary" id="bindBtn" style="margin-top:12px">同意並開始</button></div>`;
    let sup=p.supplier||'';
    app.querySelectorAll('#supList button').forEach(b=>b.onclick=()=>{ sup=b.dataset.s; app.querySelectorAll('#supList button').forEach(x=>x.classList.toggle('sel',x===b)); });
    $('#bindBtn').onclick=async()=>{
      const name=$('#fName').value.trim(), plate=$('#fPlate').value.trim().toUpperCase();
      if(!sup) return toast('請點選供應商'); if(!name) return toast('請填姓名'); if(!plate) return toast('請填車號');
      $('#bindBtn').disabled=true; $('#bindBtn').textContent='設定中…';
      try{ await api('bind',{profile:{supplier:sup,name,plate,consentAt:nowIso()}}); S.profile={supplier:sup,name,plate}; persist(); go(S.trip?'trip':'home'); }
      catch(e){ toast('設定失敗：'+e.message); $('#bindBtn').disabled=false; $('#bindBtn').textContent='同意並開始'; }
    };
  },
  home(){
    if(S.trip) return go('trip');
    app.innerHTML=`<div class="card"><h2>準備出車</h2><p class="muted">先掃描這趟所有車單的條碼。</p>
      <button class="big navy" id="goScan">掃描車單<small>可連續掃多張</small></button></div>
      <div class="links"><button id="editProfile">修改身分／車號</button><button id="showToday">今日紀錄</button></div>`;
    $('#goScan').onclick=()=>go('scan');
    $('#editProfile').onclick=()=>go('bind');
    $('#showToday').onclick=showToday;
  },
  scan(){
    app.innerHTML=`<div class="card"><h2>掃描車單條碼</h2>
      <div id="reader"><div class="scan-hint">相機開啟中…</div></div>
      ${DEMO?'<button class="btn" id="fakeScan" style="margin-top:10px">（示範）模擬掃到一張車單</button>':''}
      <label class="btn" style="margin-top:10px;text-align:center;font-weight:700">📷 拍照掃描<input type="file" accept="image/*" capture="environment" id="photoScan" style="display:none"></label>
      <div class="links"><button id="manual">條碼掃不到？手動輸入</button></div></div>
      <div class="card"><h2>已掃描 <span id="cnt">0</span> 張</h2><div class="chips" id="draft"></div></div>
      <button class="big navy" id="startBtn">出車</button>
      <button class="btn ghost" id="backHome">取消</button>`;
    renderDraft();
    $('#manual').onclick=()=>openSheet(`<h2>手動輸入車單號</h2><input id="mIn" placeholder="輸入車單號" style="text-transform:uppercase"><button class="btn primary" id="mOk" style="margin-top:12px">加入</button><button class="btn ghost" data-close>取消</button>`,
      r=>{ const i=r.querySelector('#mIn'); i.focus(); r.querySelector('#mOk').onclick=()=>{ addOrder(i.value,false); i.value=''; closeSheet(); }; });
    $('#photoScan').onchange=e=>{ const f=e.target.files[0]; e.target.value=''; scanPhoto(f); };
    if(DEMO) $('#fakeScan').onclick=()=>addOrder('DSC'+String(Math.floor(Math.random()*1e8)).padStart(8,'0'),true);
    $('#startBtn').onclick=()=>{ if(!S.draft.length) return toast('請先掃描至少一張車單'); startTrip(); };
    $('#backHome').onclick=()=>go('home');
    startScanner();
  },
  trip(){
    const t=S.trip; if(!t) return go('home');
    const stop=curStop();
    if(!stop) return VIEWS.tripSelect();
    if(t.askNext && stop.steps.DONE) return VIEWS.askNext();
    view='trip';
    const ns=nextStep(stop), isFab=stop.type==='fab';
    const stepsHtml=STEP_ORDER.map(k=>{ const s=stop.steps[k]; const cls=s?'ok':(k===ns?'now':'');
      return `<div class="step ${cls}"><b>${ACTION_LABEL[k]}</b>${s?hhmm(s.at)+(s.backfill?' 補登':''):(k===ns?'下一步':'')}</div>`; }).join('');
    let btn='';
    if(ns==='DOCK' && isFab) btn=`<button class="big done" id="fabBtn">已交貨離廠<small>出廠後再按</small></button>
       <p class="muted center small" style="margin-top:10px">晶圓廠內不能用手機，請出廠後再按</p>`;
    else if(ns) btn=`<button class="big ${ns.toLowerCase()}" id="stepBtn">${ACTION_LABEL[ns]}</button>`;
    app.innerHTML=`<div class="card"><div class="muted small">目前廠區　第 ${t.current+1} 站</div>
      <h1>${esc(stop.siteName)} ${isFab?'<span class="tag fab">晶圓廠</span>':''}</h1>
      <div class="steps">${stepsHtml}</div>${btn}
      <div class="links">${canUndo()?'<button id="undoBtn">按錯了，復原</button>':'<span></span>'}<button class="alert" id="excBtn">回報異常</button></div></div>
      ${ordersCard()}`;
    const sb=$('#stepBtn'); if(sb) sb.onclick=()=>{ sb.disabled=true; doStep(ns); };
    const fb=$('#fabBtn'); if(fb) fb.onclick=fabSheet;
    const ub=$('#undoBtn'); if(ub) ub.onclick=undo;
    $('#excBtn').onclick=exceptionSheet;
    bindOrdersCard();
  },
  tripSelect(){
    view='trip-select';
    const sites=sitesByDistance();
    const near = lastFix && sites[0] && sites[0].d!=null && sites[0].d <= Math.max(C.AUTO_DETECT_RADIUS_M||800, sites[0].radius||0) ? sites[0] : null;
    const doneIds=new Set(S.trip.stops.map(s=>s.siteId));
    const first = S.trip.stops.length===0;
    app.innerHTML = `
      ${near?`<div class="card detect"><div class="muted small">偵測到您在附近（${fmtDist(near.d)}）</div>
        <div class="site">${esc(near.name)} ${near.type==='fab'?'<span class="tag fab">晶圓廠</span>':''}</div>
        <button class="big gate" id="nearBtn">抵達哨口</button></div>
        <div class="links"><button id="otherBtn">不是這裡？選其他廠區</button><button class="alert" id="excBtn">回報異常</button></div>`
      :`<div class="card"><h2>${first?'前往第一站':'前往下一站'}</h2>
        <p class="muted">${lastFix?'附近沒有偵測到廠區，抵達時請點選廠區：':(gpsState==='bad'?'定位未開啟，抵達時請點選廠區：':'定位中…抵達時也可直接點選廠區：')}</p>
        <div class="choice" id="siteList">${sites.map(s=>`<button data-id="${esc(s.id)}">${esc(s.name)}${doneIds.has(s.id)?' ✓':''}<span>${fmtDist(s.d)}</span></button>`).join('')}</div></div>
        <div class="links"><span></span><button class="alert" id="excBtn">回報異常</button></div>`}
      ${ordersCard()}
      <button class="btn ghost" id="endBtn">結束行程</button>`;
    if(near){ $('#nearBtn').onclick=()=>arriveSite(near); $('#otherBtn').onclick=()=>siteSheet(sites); }
    else app.querySelectorAll('#siteList button').forEach(b=>b.onclick=()=>confirmSite(siteById(b.dataset.id)));
    $('#excBtn').onclick=exceptionSheet;
    $('#endBtn').onclick=confirmEnd;
    bindOrdersCard();
  },
  askNext(){
    view='trip';
    const stop=curStop();
    app.innerHTML=`<div class="card center"><div class="okmark">✅</div><h1>${esc(stop.siteName)}</h1><p class="muted">已完成交貨 ${hhmm(stop.steps.DONE.at)}</p></div>
      <div class="card"><h2>還有下一站嗎？</h2>
      <button class="big gate" id="moreBtn">還有下一站</button>
      <button class="btn" id="noMore" style="margin-top:12px;padding:20px">沒有了，結束行程</button>
      <div class="links">${canUndo()?'<button id="undoBtn">按錯了，復原</button>':'<span></span>'}<button class="alert" id="excBtn">回報異常</button></div></div>`;
    $('#moreBtn').onclick=nextSite; $('#noMore').onclick=endTrip;
    const ub=$('#undoBtn'); if(ub) ub.onclick=undo;
    $('#excBtn').onclick=exceptionSheet;
  },
  finished(){
    app.innerHTML=`<div class="card center"><div class="okmark">🚚</div><h1>行程完成</h1><p class="muted">辛苦了！資料${Q.length?'會在有網路時自動上傳':'已上傳'}。</p>
      <button class="btn primary" id="homeBtn" style="margin-top:12px">回首頁</button></div>`;
    $('#homeBtn').onclick=()=>go('home');
  },
};
function ordersCard(){
  const o=S.trip.orders;
  return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">本趟車單 ${o.length} 張</h2><button class="btn ghost" style="width:auto" id="toggleOrders">查看</button></div>
    <div class="chips hidden" id="orderChips" style="margin-top:10px">${o.map(x=>`<span class="chip">${esc(x)}</span>`).join('')}</div></div>`;
}
function bindOrdersCard(){ const b=$('#toggleOrders'); if(b) b.onclick=()=>{ const c=$('#orderChips'); c.classList.toggle('hidden'); b.textContent=c.classList.contains('hidden')?'查看':'收起'; }; }
function renderDraft(flash){
  const box=$('#draft'); if(!box) return;
  $('#cnt').textContent=S.draft.length;
  box.innerHTML=S.draft.map((c,i)=>`<span class="chip ${flash&&i===S.draft.length-1?'flash':''}">${esc(c)}<button data-i="${i}" aria-label="刪除">✕</button></span>`).join('') || '<span class="muted">尚未掃描</span>';
  box.querySelectorAll('button').forEach(b=>b.onclick=()=>{ S.draft.splice(+b.dataset.i,1); persist(); renderDraft(); });
  const sb=$('#startBtn'); if(sb){ sb.disabled=!S.draft.length; sb.innerHTML = S.draft.length ? '出車<small>共 '+S.draft.length+' 張車單</small>' : '出車'; }
}
function siteSheet(sites){
  openSheet(`<h2>選擇廠區</h2><div class="choice">${sites.map(s=>`<button data-id="${esc(s.id)}">${esc(s.name)}<span>${fmtDist(s.d)}</span></button>`).join('')}</div><button class="btn ghost" data-close>取消</button>`,
    r=>r.querySelectorAll('.choice button').forEach(b=>b.onclick=()=>{ closeSheet(); confirmSite(siteById(b.dataset.id)); }));
}
function confirmSite(site){
  openSheet(`<h2>${esc(site.name)}</h2><p class="muted">確認已抵達這個廠區的哨口？</p>
    <button class="big gate" id="cOk">抵達哨口</button><button class="btn ghost" data-close>選錯了</button>`,
    r=>r.querySelector('#cOk').onclick=()=>{ closeSheet(); arriveSite(site); });
}
function fabSheet(){
  openSheet(`<h2>大約何時抵達碼頭？</h2><p class="muted">點一個最接近的就好</p>
    <div class="choice" id="minChoice">${[10,20,30,45,60,90].map(m=>`<button data-m="${m}">約 ${m} 分鐘前</button>`).join('')}<button data-m="">不記得</button></div>
    <button class="btn ghost" data-close>取消</button>`,
    r=>r.querySelectorAll('#minChoice button').forEach(b=>b.onclick=()=>fabFinish(b.dataset.m===''?null:+b.dataset.m)));
}
function confirmEnd(){
  openSheet(`<h2>結束這趟行程？</h2><p class="muted">已完成 ${S.trip.stops.filter(s=>s.steps.DONE).length} 站。</p>
    <button class="btn primary" id="eOk">確定結束</button><button class="btn ghost" data-close>還沒</button>`, r=>r.querySelector('#eOk').onclick=endTrip);
}
const EXC_TYPES=['拒收','部分交貨','改送地點','等候過久','其他'];
function exceptionSheet(){
  let type='', photo=null;
  openSheet(`<h2>回報異常</h2><div class="choice" id="excList">${EXC_TYPES.map(t=>`<button data-t="${t}">${t}</button>`).join('')}</div>
    <label style="margin-top:16px">拍照（可不拍）</label>
    <input type="file" accept="image/*" capture="environment" id="excPhoto" style="font-size:15px">
    <div id="phInfo" class="muted small"></div>
    <button class="btn primary" id="excOk" style="margin-top:14px">送出</button><button class="btn ghost" data-close>取消</button>`, r=>{
    r.querySelectorAll('#excList button').forEach(b=>b.onclick=()=>{ type=b.dataset.t; r.querySelectorAll('#excList button').forEach(x=>x.classList.toggle('sel',x===b)); });
    r.querySelector('#excPhoto').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; r.querySelector('#phInfo').textContent='處理照片中…'; photo=await shrink(f); r.querySelector('#phInfo').textContent='已附照片 ✓'; };
    r.querySelector('#excOk').onclick=()=>{
      if(!type) return toast('請點選異常類型');
      enqueue(Object.assign(baseEv(curStop()), {action:'EXCEPTION', exceptionType:type, photo}));
      closeSheet(); toast('異常已回報'); vibrate(80);
    };
  });
}
function shrink(file){
  return new Promise(res=>{
    const img=new Image(), url=URL.createObjectURL(file);
    img.onload=()=>{ const max=1280, k=Math.min(1, max/Math.max(img.width,img.height));
      const c=document.createElement('canvas'); c.width=img.width*k; c.height=img.height*k;
      c.getContext('2d').drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg',0.6)); };
    img.onerror=()=>res(null); img.src=url;
  });
}
function showToday(){
  openSheet(`<h2>今日紀錄</h2><p class="muted">本機上傳狀態：${Q.length?Q.length+' 筆尚未上傳':'全部已上傳'}</p>
    <p class="muted small">版本 ${APP_VERSION}${DEMO?'（示範模式）':''}</p><button class="btn primary" data-close>關閉</button>`);
}

// ---------- boot ----------
async function boot(){
  if(DEMO) $('#demoBar').classList.remove('hidden');
  startGps(); updateSync(); preloadZx();
  try{
    if(!DEMO){
      await liff.init({liffId:C.LIFF_ID});
      if(!liff.isInClient()){ if(!liff.isLoggedIn()){ return go('outside'); } }
      if(!liff.isLoggedIn()){ liff.login({redirectUri:location.href}); return; }
    }
    // 本機沒有資料（換手機、清除快取）→ 從伺服器還原
    if(!S.profile || !S.trip){
      try{
        const r=await api('getState');
        if(r.profile && !S.profile){ S.profile=r.profile; }
        if(r.state && r.state.trip && !S.trip && S.profile){ S.trip=r.state.trip; }
        persist();
      }catch(e){ if(!S.profile) throw e; }
    }
    checkAutoClose();
    go(!S.profile ? 'bind' : (S.trip ? 'trip' : 'home'));
    flush();
  }catch(e){ window.__err=e.message||String(e); go('error'); }
}
boot();
})();
