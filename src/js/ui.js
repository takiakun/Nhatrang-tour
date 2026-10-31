import { THREE } from './three.js';
import { ST } from '../state.js';
import { BD, BW, BX0, BX1, BZ0, BZ1, GEO_LABELS, LM_DEF, OSM, P, RAIL, ROADS, ROAD_LABELS, boardClamp, buildGrid, clamp, coastX, genBuildings, genTrees, inBoard, islandAt, lerp, paintGround, segD2, toLL, worldCtx } from './geo.js';
import { DP, LITE, LM, LMI, LMP, RESORT_HOTELS, SC, _d, anim, applyTod, buildBoats, buildBridges, buildCable, buildCity, buildLamps, buildLandmarks, buildResort, buildSkirt, buildSky, buildTerrain, buildTraffic, buildVegetation, camera, carPts, drawOverlays, fail, gy, initDetail, lampK, loader, osmMajorRoads, pickGroups, reduceMotion, renderer, roadPoint, sampleRoad, scene, stage, step, sun, sunDir, updateDetail } from './scene.js';
import { buildCrowd } from './crowd.js';
import { KS, KV, camBlock, PL, PLAY, buildPlayer, followCamera, joy, syncPlayBtns, teleportTo, toggleMount, updatePlayer } from './player.js';
import { AU, armAudio, honk, setSound, syncSoundBtn, updateAudio } from './audio.js';
import { initWeather, realTod, setRain, sunPos, syncWxBtn, updateRain, updateWeather } from './weather.js';
import { buildOcean, setWind, updateOcean } from './ocean.js';
import { OC, depthFade, waveHeightAt, waveNormalAt, windState } from './ocean-waves.js';
import { POST, initPost, renderFrame, resizePost } from './post.js';
import { MM, drawMinimap, initMinimap, showMinimap, updateMinimap } from './minimap.js';
/* ======================= CONTROLS, UI, LOOP ======================= */
var ready = false; ST.shadowDirty = true; var frameN = 0;
ST.controls = new THREE.OrbitControls(camera, renderer.domElement);
ST.controls.enableDamping = true; ST.controls.dampingFactor = 0.09; ST.controls.screenSpacePanning = false;
ST.controls.mouseButtons = { LEFT:THREE.MOUSE.PAN, MIDDLE:THREE.MOUSE.DOLLY, RIGHT:THREE.MOUSE.ROTATE };
ST.controls.touches = { ONE:THREE.TOUCH.PAN, TWO:THREE.TOUCH.DOLLY_ROTATE };
ST.controls.minDistance = 0.4; ST.controls.maxPolarAngle = 1.36; ST.controls.minPolarAngle = 0.06;
ST.controls.rotateSpeed = 0.6; ST.controls.panSpeed = 1.0; ST.controls.zoomSpeed = 1.0; ST.controls.autoRotateSpeed = 0.3;
SC.near = 150; SC.far = 700;

var homeTarget = new THREE.Vector3(-14, 0, -4), homeDist = 400, HOME_PHI = 0.86, HOME_TH = 0.16;
function computeHome(){ var asp = innerWidth / innerHeight, t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  homeDist = Math.max(BW * 0.98 / (2 * t * asp), BD * 0.8 / (2 * t)); ST.controls.maxDistance = homeDist * 1.35; scene.fog.near = ST.fogBase.near = homeDist * 0.95; scene.fog.far = ST.fogBase.far = homeDist * 3.2; }   // fogBase: sương gốc, weather.js thu hẹp khi mưa
function setCam(target, r, phi, th){ ST.controls.target.copy(target); camera.position.set(target.x + r * Math.sin(phi) * Math.sin(th), target.y + r * Math.cos(phi), target.z + r * Math.sin(phi) * Math.cos(th)); camera.lookAt(target); }
addEventListener('resize', function(){ renderer.setSize(innerWidth, innerHeight); resizePost(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); computeHome(); labels.forEach(function(l){ l.w = 0; }); if (PLAY.on) playLook(true); });

var ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function setNdc(e){ var r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
function surfY(x, z){ return inBoard(x, z, 0) ? Math.max(ST.G.hAt(x, z), 0) : -60; }
function groundHit(r){ var o = r.origin, d = r.direction, t = 0, st = 0.2;
  for (var i = 0; i < 700; i++){ var x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y <= surfY(x, z)){ var a = Math.max(0, t - st), b = t; for (var k = 0; k < 12; k++){ var m = (a + b) / 2; if (o.y + d.y * m <= surfY(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
      return new THREE.Vector3(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b); }
    if (y < -40) break; st = Math.max(0.15, t * 0.012 + 0.1); t += st; }
  return null; }
stage.addEventListener('wheel', function(e){ if (!ready) return; e.preventDefault(); e.stopPropagation();
  var dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1), d0 = camera.position.distanceTo(ST.controls.target), k = Math.exp(clamp(dy, -150, 150) * 0.0016 * (d0 < 3 ? 0.6 : 1));   // gần đất thì zoom chậm lại
  if (PLAY.on){ var off = camera.position.clone().sub(ST.controls.target), nl = clamp(off.length() * k, ST.controls.minDistance, ST.controls.maxDistance); camera.position.copy(ST.controls.target).add(off.setLength(nl)); return; }
  var dist = camera.position.distanceTo(ST.controls.target), nd = clamp(dist * k, ST.controls.minDistance, ST.controls.maxDistance); k = nd / dist;
  setNdc(e); var hit = groundHit(ray.ray) || ST.controls.target.clone();
  ST.controls.target.sub(hit).multiplyScalar(k).add(hit); camera.position.sub(hit).multiplyScalar(k).add(hit);
  if (ST.controls.autoRotate) setSpin(false); hideHint(); }, { capture:true, passive:false });

var camDes = new THREE.Vector3(), camShifted = false, camK = 1;   // camK: mức rút camera do nhà chắn (1 = không rút), đổi mượt
/* ---------- camera fly ---------- */
var tween = null;
function sphOf(){ var o = camera.position.clone().sub(ST.controls.target), r = o.length(); return { r:r, phi:Math.acos(clamp(o.y / r, -1, 1)), th:Math.atan2(o.x, o.z) }; }
function flyTo(target, r, phi, th, dur){ var s = sphOf(); if (th == null) th = s.th; var dth = Math.atan2(Math.sin(th - s.th), Math.cos(th - s.th));
  tween = { t0:performance.now(), dur:reduceMotion ? 1 : (dur || 1500), ft:ST.controls.target.clone(), tt:target.clone(), fr:s.r, tr:r, fp:s.phi, tp:phi, fth:s.th, dth:dth };
  ST.controls.enableDamping = false; ST.controls.enabled = false; ST.controls.update(); }
function stepTween(now){ var u = Math.min(1, (now - tween.t0) / tween.dur), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  var tg = new THREE.Vector3().lerpVectors(tween.ft, tween.tt, e), r = Math.exp(lerp(Math.log(tween.fr), Math.log(tween.tr), e)), lift = Math.sin(Math.PI * e) * Math.min(tween.fr, tween.tr) * 0.25;
  setCam(tg, r + lift, lerp(tween.fp, tween.tp, e), tween.fth + tween.dth * e);
  if (u >= 1){ tween = null; ST.controls.enableDamping = !PLAY.on; ST.controls.enabled = true; } }
function constrain(){ var tg = ST.controls.target, c = boardClamp(clamp(tg.x, BX0 + 8, BX1 - 8), clamp(tg.z, BZ0 + 8, BZ1 - 8)), dx = c[0] - tg.x, dz = c[1] - tg.z;
  if (dx || dz){ tg.x += dx; tg.z += dz; camera.position.x += dx; camera.position.z += dz; }
  if (!tween && !PLAY.on){ var dy = (Math.max(ST.G.hAt(tg.x, tg.z), 0) * 0.85) - tg.y; if (Math.abs(dy) > 0.002){ tg.y += dy * 0.12; camera.position.y += dy * 0.12; } }
  var gc = surfY(camera.position.x, camera.position.z) + (PLAY.on ? 0.03 * KS : 0.05); if (camera.position.y < gc) camera.position.y = gc; }   // sàn camera: 1,5–2,5 m trên mặt đất (không phải 17 m như trước)

/* ---------- shadows follow the view ---------- */
var shadowKey = [1e9, 1e9, 0];
function updateShadow(dist){
  var half = clamp(dist * 0.75, 1.5, 240), hq = Math.pow(1.15, Math.round(Math.log(half) / Math.log(1.15))), tex = 2 * hq / sun.shadow.mapSize.x, tg = ST.controls.target;
  sun.shadow.normalBias = clamp(tex * 2, 0.004, 0.035);   // theo cỡ texel của khung bóng: gần đất khung nhỏ thì bias nhỏ, bóng không bị hở
  var cx = Math.round(tg.x / (tex * 4)) * tex * 4, cz = Math.round(tg.z / (tex * 4)) * tex * 4;
  if (ST.shadowDirty || hq !== shadowKey[2] || cx !== shadowKey[0] || cz !== shadowKey[1]){
    SC.left = -hq; SC.right = hq; SC.top = hq; SC.bottom = -hq; SC.updateProjectionMatrix();
    sun.target.position.set(cx, 0, cz); sun.position.set(cx + sunDir.x * 400, sunDir.y * 400, cz + sunDir.z * 400); sun.target.updateMatrixWorld();
    shadowKey = [cx, cz, hq]; ST.shadowDirty = false; renderer.shadowMap.needsUpdate = true;
  } else if (dist < 90 && frameN % 3 === 0) renderer.shadowMap.needsUpdate = true;
}

/* ---------- landmarks registry ---------- */
var TOPKEY = { 'hai-dang':'haidangTop', ponagar:'ponagarTop', 'hon-chong':'honchongTop', 'cho-dam':'chodamTop', 'long-son':'buddhaTop', 'nha-tho':'nhathoTop', 'tram-huong':'tramTop', 'vien-hdh':'vienTop', yersin:'yersinTop', ga:'gaTop', 'bao-dai':'baodaiTop', 'hon-do':'hondoTop' };
function setupLM(){ LM_DEF.forEach(function(d, i){ var L = {}; for (var k in d) L[k] = d[k]; L.i = i;
  var p = d.id === 'long-son' ? LMP.buddha : LMP[d.id], ax = p[0], az = p[1], ay;
  if (d.id === 'cap-treo'){ L.anchor = LMP.cableMid.clone(); L.focus = LMP.cableFocus.clone(); ax = L.anchor.x; az = L.anchor.z; }
  else { if (TOPKEY[d.id]) ay = LMP[TOPKEY[d.id]] + 0.15; else if (d.id === 'cang') ay = 2.4; else if (d.id === 'xom-bong') ay = 1.3; else ay = gy(ax, az) + (d.top || 0.8);
    L.anchor = new THREE.Vector3(ax, ay, az); var fp = d.focus ? P(d.focus[0], d.focus[1]) : [ax, az]; L.focus = new THREE.Vector3(fp[0], gy(fp[0], fp[1]) * 0.6 + 0.3, fp[1]); }
  L.base = gy(ax, az); LM.push(L); LMI[d.id] = L; }); }

/* ---------- labels ---------- */
var labelLayer = document.getElementById('labels'), labels = [], placed = [], pv = new THREE.Vector3(), current = -1;
var labelsOn = true; try { labelsOn = localStorage.getItem('nt3d-labels') !== '0'; } catch (e){}
function makeLabels(){
  LM.forEach(function(L){ var el = document.createElement('button'); el.type = 'button'; el.className = 'lbl'; el.innerHTML = '<span class="pill"><i></i></span><span class="stem"></span>'; el.firstChild.appendChild(document.createTextNode(L.name));
    el.setAttribute('aria-label', L.name); el.addEventListener('click', function(){ select(L.i); }); labelLayer.appendChild(el); labels.push({ el:el, pos:L.anchor, lm:L, kind:'lm', vis:true }); });
  GEO_LABELS.forEach(function(g){ var p = P(g.ll[0], g.ll[1]), el = document.createElement('div'); el.className = 'geo'; el.textContent = g.t; labelLayer.appendChild(el);
    labels.push({ el:el, pos:new THREE.Vector3(p[0], Math.max(ST.G.hAt(p[0], p[1]), 0) + g.y, p[1]), kind:'geo', max:g.max, vis:true }); });
  roadLabels().forEach(function(g){ var x = g.x, z = g.z; if (x == null){ z = P(g.ll[0], 0)[1]; x = g.ll[1] == null ? coastX(z) - g.off : P(g.ll[0], g.ll[1])[0]; }
    var el = document.createElement('div'); el.className = g.minor ? 'road minor' : 'road'; el.textContent = g.t; labelLayer.appendChild(el); var y = Math.max(ST.G.hAt(x, z), 0) + 0.3;
    labels.push({ el:el, pos:new THREE.Vector3(x, y, z), dir:g.dx != null ? new THREE.Vector3(x + g.dx, y, z + g.dz) : null, kind:'road', minor:!!g.minor, vis:true }); });
  labels.forEach(function(l){ l.el.style.visibility = 'hidden'; l.vis = false; }); }
// Nhãn tên đường: có OSM thì lấy tên thật của đường lớn (đặt ở giữa đoạn dài nhất mang tên đó), không thì dùng ROAD_LABELS ước lượng
// Mọi đường có tên trong OSM: đặt nhãn ở giữa mỗi quãng dài (đường lớn ~1,2 km một nhãn, đường nhỏ ~500 m), các nhãn cùng tên cách nhau đủ xa.
// Nhãn xoay theo hướng đường (dx, dz); đường nhỏ, hẻm chỉ hiện khi nhìn gần.
function roadLabels(){ if (!OSM) return ROAD_LABELS; var out = [], byName = {};
  OSM.roads.forEach(function(R){ if (!R.name) return; (byName[R.name] = byName[R.name] || []).push(R); });
  Object.keys(byName).forEach(function(n){ var list = byName[n], c = Math.min.apply(null, list.map(function(R){ return R.c; })), minor = c > 4, step = minor ? 10 : 24, gap = minor ? 8 : 18, got = [];
    var t = /^(Đường|Đại lộ|Quốc lộ|Tỉnh lộ|Hẻm|Kiệt|Ngõ|Ngách|Cầu|Phố)\b/i.test(n) ? n : 'Đường ' + n;
    list.forEach(function(R){ var Q = R.pts, acc = step * 0.5, L = 0;
      for (var i = 0; i < Q.length - 1; i++){ var dx = Q[i + 1][0] - Q[i][0], dz = Q[i + 1][1] - Q[i][1], l = Math.hypot(dx, dz); L += l;
        while (acc < L && l > 0.3){ var f = 1 - (L - acc) / l, x = Q[i][0] + dx * f, z = Q[i][1] + dz * f; acc += step;
          if (!inBoard(x, z, 1) || ST.G.hAt(x, z) < 0.05 || got.some(function(q){ return Math.hypot(q[0] - x, q[1] - z) < gap; })) continue;
          got.push([x, z]); out.push({ t:t, x:x, z:z, dx:dx / l, dz:dz / l, minor:minor }); } }
      if (!got.length && L > (minor ? 3 : 4)){ var m = Q[Q.length >> 1], m2 = Q[Math.min(Q.length - 1, (Q.length >> 1) + 1)], ml = Math.hypot(m2[0] - m[0], m2[1] - m[1]) || 1;   // đường ngắn: một nhãn giữa đường
        if (ST.G.hAt(m[0], m[1]) > 0.05){ got.push(m); out.push({ t:t, x:m[0], z:m[1], dx:(m2[0] - m[0]) / ml, dz:(m2[1] - m[1]) / ml, minor:minor }); } } }); });
  return out; }
function hits(x0, y0, x1, y1){ for (var i = 0; i < placed.length; i++){ var p = placed[i]; if (x0 < p[2] && x1 > p[0] && y0 < p[3] && y1 > p[1]) return true; } return false; }
function prio(L){ return (L.lm && L.lm.i === current) ? -1e9 : (L.kind === 'geo' ? 40 : (L.kind === 'road' ? (L.minor ? 90 : 60) : 0)); }
function updateLabels(dist){
  var w = innerWidth, h = innerHeight, cand = []; placed.length = 0;
  for (var i = 0; i < labels.length; i++){ var L = labels[i]; L.show = false;
    var isSel = L.lm && L.lm.i === current;
    if (!labelsOn && !isSel) continue;
    if (L.kind === 'geo' && dist > homeDist * L.max) continue;
    if (L.kind === 'road' && (dist > (L.minor ? 24 : 60) || Math.abs(L.pos.x - ST.controls.target.x) + Math.abs(L.pos.z - ST.controls.target.z) > Math.max(dist * 2.2, 3))) continue;
    pv.copy(L.pos).project(camera);
    if (!(pv.z < 1 && pv.x > -1.1 && pv.x < 1.1 && pv.y > -1.15 && pv.y < 1.2)) continue;
    L.sx = (pv.x * 0.5 + 0.5) * w; L.sy = (-pv.y * 0.5 + 0.5) * h; L.d = camera.position.distanceTo(L.pos); cand.push(L); }
  cand.sort(function(a, b){ return (prio(a) + a.d) - (prio(b) + b.d); });
  for (var j = 0; j < cand.length; j++){ var C2 = cand[j];
    if (C2.kind === 'lm'){ var far = C2.d > homeDist * 0.55; if (far !== C2.far){ C2.el.classList.toggle('far', far); C2.far = far; C2.w = 0; } }
    if (!C2.w){ C2.w = C2.el.offsetWidth; C2.h = C2.el.offsetHeight; }
    var bw = C2.w, bh = C2.h; C2.rot = 0;
    if (C2.dir){ pv.copy(C2.dir).project(camera); var ax = (pv.x * 0.5 + 0.5) * w - C2.sx, ay = (-pv.y * 0.5 + 0.5) * h - C2.sy, an = Math.atan2(ay, ax) * 180 / Math.PI;   // xoay theo hướng đường trên màn hình, chữ không lộn ngược
      if (an > 90) an -= 180; if (an < -90) an += 180; C2.rot = an; var ca = Math.abs(Math.cos(an * Math.PI / 180)), sa = Math.abs(Math.sin(an * Math.PI / 180)); bw = C2.w * ca + C2.h * sa; bh = C2.w * sa + C2.h * ca; }
    var mid = C2.kind !== 'lm', x0 = C2.sx - bw / 2 - 3, x1 = C2.sx + bw / 2 + 3, y0 = mid ? C2.sy - bh / 2 - 2 : C2.sy - bh - 2, y1 = mid ? C2.sy + bh / 2 + 2 : C2.sy + 1;
    if (prio(C2) > -1 && hits(x0, y0, x1, y1)) continue;
    placed.push([x0, y0, x1, y1]); C2.show = true;
    C2.el.style.transform = 'translate3d(' + C2.sx.toFixed(1) + 'px,' + C2.sy.toFixed(1) + 'px,0)' + (C2.rot ? ' rotate(' + C2.rot.toFixed(1) + 'deg)' : '') + ' translate(-50%,' + (mid ? '-50%' : '-100%') + ')';   // xoay quanh tâm nhãn
    if (C2.kind === 'lm') C2.el.style.zIndex = String(1000 - Math.round(C2.d)); }
  for (i = 0; i < labels.length; i++){ var M = labels[i]; if (M.show !== M.vis){ M.el.style.visibility = M.show ? 'visible' : 'hidden'; M.vis = M.show; } } }

/* ---------- HUD ---------- */
var needle = document.getElementById('needle'), scaleBar = document.getElementById('scaleBar'), scaleText = document.getElementById('scaleText'), coordEl = document.getElementById('coord');
function dms(v, hemi){ var d = Math.floor(v), m = (v - d) * 60, mi = Math.floor(m), s = Math.round((m - mi) * 60); if (s === 60){ s = 0; mi++; } return d + '°' + (mi < 10 ? '0' : '') + mi + '′' + (s < 10 ? '0' : '') + s + '″' + hemi; }
function updateHud(dist){ needle.setAttribute('transform', 'rotate(' + (ST.controls.getAzimuthalAngle() * 180 / Math.PI).toFixed(1) + ' 24 24)');
  if (frameN % 6) return;
  var wpp = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / innerHeight, maxM = 120 * wpp * 50, m = 1;
  [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].forEach(function(s){ if (s <= maxM) m = s; });
  scaleBar.style.width = Math.round(m / 50 / wpp) + 'px'; scaleText.textContent = m >= 1000 ? (m / 1000) + ' km' : m + ' m';
  var ll = toLL(ST.controls.target.x, ST.controls.target.z); coordEl.textContent = dms(ll[0], 'B') + ' · ' + dms(ll[1], 'Đ'); }

/* ---------- UI wiring ---------- */
var hint = document.getElementById('hint'), hintGone = false;
function hideHint(){ if (!hintGone){ hintGone = true; hint.classList.add('gone'); } }
var btnSpin = document.getElementById('btnSpin');
function setSpin(on){ ST.controls.autoRotate = on; btnSpin.setAttribute('aria-pressed', String(on)); }
var btnLabels = document.getElementById('btnLabels');
function syncLabelsBtn(){ btnLabels.setAttribute('aria-pressed', String(labelsOn)); btnLabels.setAttribute('aria-label', labelsOn ? 'Ẩn bảng tên' : 'Hiện bảng tên'); }
function toggleLabels(){ labelsOn = !labelsOn; try { localStorage.setItem('nt3d-labels', labelsOn ? '1' : '0'); } catch (e){} syncLabelsBtn(); }
var btnTime = document.getElementById('btnTime'), btnTimeText = document.getElementById('btnTimeText'), TOD_NAMES = ['Ban ngày', 'Hoàng hôn', 'Ban đêm'];
function syncTimeBtn(){ var i = Math.round(ST.todTarget), name = ST.WX.real ? 'Giờ thật' : TOD_NAMES[i]; btnTimeText.textContent = name; btnTime.setAttribute('aria-label', 'Đổi thời điểm, hiện là ' + name.toLowerCase()); btnTime.dataset.tod = String(i); }
function themeIsDark(){ var t = document.documentElement.getAttribute('data-theme'); if (t === 'dark') return true; if (t === 'light') return false; return matchMedia('(prefers-color-scheme: dark)').matches; }
function onSchemeChange(){ if (ST.todUser || ST.WX.real || !ready) return; ST.todTarget = themeIsDark() ? 2 : 0; syncTimeBtn(); }
var rail = document.getElementById('rail'), chips = [], card = document.getElementById('card');
function select(i){ var L = LM[i]; current = i; ST.navTarget = i; hideHint();
  document.getElementById('cardTag').textContent = L.cat; document.getElementById('cardTitle').textContent = L.name; document.getElementById('cardDesc').textContent = L.desc;
  var f = document.getElementById('cardFacts'); f.innerHTML = ''; L.facts.forEach(function(t){ var s = document.createElement('span'); s.textContent = t; f.appendChild(s); });
  document.getElementById('cardIdx').textContent = (i + 1) + ' / ' + LM.length;
  card.hidden = false; document.body.classList.add('has-card');
  labels.forEach(function(l){ if (l.lm) l.el.classList.toggle('on', l.lm === L); });
  chips.forEach(function(c, ci){ c.setAttribute('aria-pressed', String(ci === i)); });
  try { chips[i].scrollIntoView({ inline:'center', block:'nearest', behavior:reduceMotion ? 'auto' : 'smooth' }); } catch (e){}
  if (L.ring){ ST.ring.visible = true; ST.ring.position.set(L.anchor.x, L.base + 0.08, L.anchor.z); ST.ring.userData.r = L.ring; } else ST.ring.visible = false;
  document.getElementById('cardGo').hidden = !PLAY.on;
  if (PLAY.on) return;
  setSpin(false); flyTo(L.focus, L.zoom * (innerWidth < 620 ? 1.4 : 1), 0.95, sphOf().th); }
function closeCard(){ current = -1; card.hidden = true; document.body.classList.remove('has-card'); ST.ring.visible = false;
  labels.forEach(function(l){ if (l.lm) l.el.classList.remove('on'); }); chips.forEach(function(c){ c.setAttribute('aria-pressed', 'false'); }); }
function pickAt(e){ setNdc(e);
  var hitsG = ray.intersectObjects(pickGroups, true); for (var i = 0; i < hitsG.length; i++){ var o = hitsG[i].object; while (o && !o.userData.lmId) o = o.parent; if (o) return LMI[o.userData.lmId]; }
  var p = groundHit(ray.ray); if (!p) return null;
  var I = islandAt(p.x, p.z, 0.4); if (I && LMI[I.id]) return LMI[I.id];
  var best = null, bd = 1e9; LM.forEach(function(L){ var d = Math.hypot(L.anchor.x - p.x, L.anchor.z - p.z); if (d < bd){ bd = d; best = L; } });
  if (best && bd < Math.max(2.2, (best.ring || 0) * 1.3)) return best;
  var cd = coastX(p.z) - p.x; if (cd > -1.2 && cd < 1.6 && p.z > P(12.2620, 0)[1] && p.z < P(12.2104, 0)[1]) return LMI['tran-phu'];
  return null; }
function setupUI(){
  makeLabels(); syncLabelsBtn();
  btnLabels.addEventListener('click', toggleLabels);
  document.getElementById('btnSound').addEventListener('click', function(){ setSound(!AU.want); }); syncSoundBtn(); armAudio();
  addEventListener('keydown', function(e){ if ((e.key === 'l' || e.key === 'L') && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target.closest && e.target.closest('input,textarea'))) toggleLabels(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ labels.forEach(function(l){ l.w = 0; }); });
  // Giờ thật → Ban ngày → Hoàng hôn → Ban đêm → Giờ thật
  btnTime.addEventListener('click', function(){ ST.todUser = true;
    if (ST.WX.real){ ST.WX.real = false; ST.todTarget = 0; } else if (Math.round(ST.todTarget) === 2){ ST.WX.real = true; ST.todTarget = realTod(); } else ST.todTarget = Math.round(ST.todTarget) + 1;
    if (reduceMotion){ ST.tod = ST.todTarget; } applyTod(ST.tod); syncTimeBtn(); });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onSchemeChange); } catch (e){}
  new MutationObserver(onSchemeChange).observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });
  btnSpin.addEventListener('click', function(){ setSpin(!ST.controls.autoRotate); });
  ST.controls.addEventListener('start', function(){ if (ST.controls.autoRotate) setSpin(false); hideHint(); });
  document.getElementById('btnHome').addEventListener('click', function(){ closeCard(); flyTo(homeTarget, homeDist, HOME_PHI, HOME_TH, 1700); });
  var menuBtn = document.getElementById('btnMenu'), menu = document.getElementById('toolMenu');   // menu thả xuống: các nút ít dùng
  function setMenu(open){ menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); }
  menuBtn.addEventListener('click', function(e){ e.stopPropagation(); setMenu(menu.hidden); });
  addEventListener('pointerdown', function(e){ if (!menu.hidden && !menu.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) setMenu(false); }, true);
  addEventListener('keydown', function(e){ if (e.key === 'Escape' && !menu.hidden){ setMenu(false); menuBtn.focus(); } });
  document.getElementById('btnHome').addEventListener('click', function(){ setMenu(false); });
  document.getElementById('btnLocate').addEventListener('click', toggleLocate); document.getElementById('locClose').addEventListener('click', function(){ locInfo.hidden = true; });
  document.getElementById('compass').addEventListener('click', function(){ var s = sphOf(); flyTo(ST.controls.target.clone(), s.r, s.phi, 0, 900); });
  // nút xoay 45° và chuyển 2D (nhìn thẳng xuống) / 3D (nhìn nghiêng) cho ai khó dùng cử chỉ
  function turn(d){ if (tween) return; var s = sphOf(); setSpin(false); flyTo(ST.controls.target.clone(), s.r, s.phi, s.th + d, 450); }
  document.getElementById('rotL').addEventListener('click', function(){ turn(-Math.PI / 4); });
  document.getElementById('rotR').addEventListener('click', function(){ turn(Math.PI / 4); });
  var tiltBtn = document.getElementById('tilt');
  function syncTilt(){ var flat = sphOf().phi < 0.3; tiltBtn.textContent = flat ? '3D' : '2D'; tiltBtn.setAttribute('aria-label', flat ? 'Nhìn nghiêng (3D)' : 'Nhìn thẳng từ trên xuống (2D)'); }
  tiltBtn.addEventListener('click', function(){ if (tween) return; var s = sphOf(), flat = s.phi < 0.3; setSpin(false); flyTo(ST.controls.target.clone(), s.r, flat ? (PLAY.on ? 1.1 : HOME_PHI) : ST.controls.minPolarAngle, s.th, 600); setTimeout(syncTilt, 650); });
  ST.controls.addEventListener('end', syncTilt); syncTilt();
  addEventListener('keydown', function(e){ if (PLAY.on || e.metaKey || e.ctrlKey || e.altKey || (e.target.closest && e.target.closest('input,textarea'))) return;   // Q/E xoay, T đổi 2D/3D
    if (e.key === 'q' || e.key === 'Q') turn(-Math.PI / 4); else if (e.key === 'e' || e.key === 'E') turn(Math.PI / 4); else if (e.key === 't' || e.key === 'T') tiltBtn.click(); });
  setTimeout(hideHint, 10000);
  LM.forEach(function(L){ var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.setAttribute('aria-pressed', 'false'); b.innerHTML = '<i></i>'; b.appendChild(document.createTextNode(L.name));
    b.addEventListener('click', function(){ if (current === L.i) closeCard(); else select(L.i); }); rail.appendChild(b); chips.push(b); });
  document.getElementById('cardClose').addEventListener('click', closeCard);
  document.getElementById('prevBtn').addEventListener('click', function(){ select((current - 1 + LM.length) % LM.length); });
  document.getElementById('nextBtn').addEventListener('click', function(){ select((current + 1) % LM.length); });
  addEventListener('keydown', function(e){ var inRail = e.target.closest && e.target.closest('.rail'); if (PLAY.on && /^Arrow/.test(e.key)) return;
    if (e.key === 'Escape' && current >= 0) closeCard(); else if (current >= 0 && e.key === 'ArrowRight' && !inRail) select((current + 1) % LM.length); else if (current >= 0 && e.key === 'ArrowLeft' && !inRail) select((current - 1 + LM.length) % LM.length); });
  var downAt = null, hoverQ = false, lastMove = null;
  renderer.domElement.addEventListener('pointerdown', function(e){ downAt = { x:e.clientX, y:e.clientY, t:performance.now() }; hideHint(); });
  renderer.domElement.addEventListener('pointerup', function(e){ if (!downAt) return; var mv = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y), dt = performance.now() - downAt.t; downAt = null; if (mv > 6 || dt > 600) return; var L = pickAt(e); if (L) select(L.i); });
  renderer.domElement.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  renderer.domElement.addEventListener('pointermove', function(e){ if (e.pointerType !== 'mouse') return; lastMove = e; if (hoverQ) return; hoverQ = true;
    requestAnimationFrame(function(){ hoverQ = false; if (!lastMove || !ready) return; setNdc(lastMove); var h = ray.intersectObjects(pickGroups, true); renderer.domElement.style.cursor = h.length ? 'pointer' : ''; }); });
}

/* ---------- play mode ---------- */
var saved = null;
function enterPlay(){ if (PLAY.on || !PL) return; PLAY.on = true; PLAY.lastDrag = 0; document.body.classList.add('playing'); closeCard(); setSpin(false); hideHint();
  saved = { min:ST.controls.minDistance, max:ST.controls.maxDistance, pol:ST.controls.maxPolarAngle, two:ST.controls.touches.TWO, rot:ST.controls.rotateSpeed };
  PLAY.az0 = ST.controls.getAzimuthalAngle(); playLook(true);
  ST.controls.enablePan = false; ST.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE; ST.controls.touches.ONE = THREE.TOUCH.ROTATE; ST.controls.minDistance = 0.35 * KS; ST.controls.maxDistance = 9; ST.controls.maxPolarAngle = 1.45;
  document.getElementById('btnPlay').setAttribute('aria-pressed', 'true'); document.getElementById('playHud').hidden = false; document.querySelector('#btnPlay span').textContent = '✕ Thoát'; showMinimap(); syncPlayBtns(); DP.valid = false;
  flyTo(new THREE.Vector3(PL.x, PL.y + 0.09 * KS, PL.z), CAMLV[camLevel][0], CAMLV[camLevel][1], PL.yaw + Math.PI, 1600); }
// ba mức góc nhìn khi lái/đi bộ: gần, vừa (như cũ), xa; phím C hoặc nút "Góc nhìn"
var CAMLV = [[0.5 * KS, 1.25, 'gần'], [1.5 * KS, 1.08, 'vừa'], [4 * KS, 0.9, 'xa']], camLevel = 1; try { var _cl = parseInt(localStorage.getItem('nt-cam'), 10); if (_cl >= 0 && _cl < 3) camLevel = _cl; } catch (e){}
function cycleCam(){ if (!PLAY.on || tween || !PL) return; camLevel = (camLevel + 1) % 3; try { localStorage.setItem('nt-cam', String(camLevel)); } catch (e){}
  flyTo(new THREE.Vector3(PL.x, PL.y + 0.09 * KS, PL.z), CAMLV[camLevel][0], CAMLV[camLevel][1], null, 450); syncCamBtn(); }
function syncCamBtn(){ var b = document.getElementById('btnCam'); if (b) b.textContent = 'Góc nhìn: ' + CAMLV[camLevel][2]; }
function setBoost(on){ ST.boostBtn = on; var bb = document.getElementById('btnBoost'); if (bb){ bb.setAttribute('aria-pressed', String(on)); bb.textContent = on ? 'Đang tăng ga' : 'Tăng ga'; } }
function exitPlay(){ if (!PLAY.on) return; PLAY.on = false; setBoost(false); document.body.classList.remove('playing'); ST.keys = {}; joy.on = false; joy.x = joy.y = 0;
  ST.controls.enablePan = true; ST.controls.mouseButtons.LEFT = THREE.MOUSE.PAN; ST.controls.touches.ONE = THREE.TOUCH.PAN; ST.controls.touches.TWO = saved.two; ST.controls.rotateSpeed = saved.rot; ST.controls.enableDamping = true; ST.controls.minDistance = saved.min; ST.controls.maxDistance = saved.max; ST.controls.maxPolarAngle = saved.pol;
  document.getElementById('btnPlay').setAttribute('aria-pressed', 'false'); document.getElementById('playHud').hidden = true; document.querySelector('#btnPlay span').textContent = 'Lái xe';
  var s2 = sphOf(); flyTo(new THREE.Vector3(PL.x, 0, PL.z), 26, 0.9, s2.th, 1300); }
// khi lái: một ngón xoay với độ nhạy như nhau ở màn dọc và ngang (OrbitControls chia theo chiều cao màn hình), hai ngón chỉ zoom, không quán tính
function playLook(on){ var c = ST.controls; if (on){ c.touches.TWO = THREE.TOUCH.DOLLY; c.enableDamping = false; } c.rotateSpeed = on ? Math.max(0.3, (renderer.domElement.clientHeight || innerHeight) / 1200) : c.rotateSpeed; }
function setupPlay(){
  var bp = document.getElementById('btnPlay'); bp.addEventListener('click', function(){ if (PLAY.on) exitPlay(); else enterPlay(); });
  var MOVE = { KeyW:1, KeyA:1, KeyS:1, KeyD:1, ArrowUp:1, ArrowDown:1, ArrowLeft:1, ArrowRight:1, ShiftLeft:1, ShiftRight:1, Space:1 };
  addEventListener('keydown', function(e){ if (!PLAY.on) return; if (e.target.closest && e.target.closest('input,textarea')) return;
    if (MOVE[e.code]){ ST.keys[e.code] = true; e.preventDefault(); }
    if (e.code === 'KeyE' && !e.repeat){ toggleMount(); e.preventDefault(); }
    if (e.code === 'KeyH' && !e.repeat){ honk(); e.preventDefault(); }
    if (e.code === 'KeyC' && !e.repeat){ cycleCam(); e.preventDefault(); }
    if (e.code === 'Escape' && current < 0) exitPlay(); }, true);
  addEventListener('keyup', function(e){ if (MOVE[e.code]) ST.keys[e.code] = false; });
  addEventListener('blur', function(){ ST.keys = {}; });
  document.getElementById('btnMount').addEventListener('click', function(){ toggleMount(); });
  document.getElementById('btnHorn').addEventListener('click', honk);
  document.getElementById('btnCam').addEventListener('click', cycleCam); syncCamBtn();
  ['playHud', 'joy'].forEach(function(id){ document.getElementById(id).addEventListener('contextmenu', function(e){ e.preventDefault(); }); });
  var bb = document.getElementById('btnBoost');
  // Tăng ga dạng công tắc: chạm một lần để giữ ga, chạm lần nữa để nhả (không phải giữ ngón tay)
  bb.addEventListener('pointerdown', function(e){ e.preventDefault(); setBoost(!ST.boostBtn); });
  var jz = document.getElementById('joy'), knob = document.getElementById('joyKnob'), jid = null;
  function jset(e){ var r = jz.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = e.clientX - cx, dy = e.clientY - cy, R2 = r.width / 2, l = Math.hypot(dx, dy); if (l > R2){ dx *= R2 / l; dy *= R2 / l; }
    joy.x = dx / R2; joy.y = -dy / R2; knob.style.transform = 'translate(' + dx.toFixed(0) + 'px,' + dy.toFixed(0) + 'px)'; }
  jz.addEventListener('pointerdown', function(e){ if (jid !== null) return; jid = e.pointerId; jz.setPointerCapture(jid); joy.on = true; jset(e); e.preventDefault(); });
  jz.addEventListener('pointermove', function(e){ if (e.pointerId === jid) jset(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function(ev){ jz.addEventListener(ev, function(e){ if (e.pointerId !== jid) return; jid = null; joy.on = false; joy.x = joy.y = 0; knob.style.transform = ''; }); });
  // OrbitControls nghe pointermove/pointerup ở document sau lần chạm canvas và coi sự kiện của joystick, các nút là cú kéo xoay thứ hai (camera dao động, lệch góc): không cho chúng nổi bọt lên
  ['joy', 'btnCam', 'btnHorn', 'btnBoost', 'btnMount', 'minimap', 'btnInfo', 'btnPlay', 'btnMenu'].forEach(function(id){ var el = document.getElementById(id); if (el) ['pointermove', 'pointerup', 'pointercancel'].forEach(function(ev){ el.addEventListener(ev, function(e){ e.stopPropagation(); }); }); });
  ST.controls.addEventListener('start', function(){ PLAY.dragging = true; PLAY.lastDrag = performance.now() / 1000; });
  ST.controls.addEventListener('end', function(){ PLAY.dragging = false; PLAY.lastDrag = performance.now() / 1000; });
  document.getElementById('cardGo').addEventListener('click', function(){ if (current >= 0){ teleportTo(LM[current]); closeCard(); } });
}

/* ---------- animation ---------- */
var vp = { x:0, y:0, z:0, fx:0, fz:0 }, _v3 = new THREE.Vector3(), _tan = new THREE.Vector3();
// đặt vật nổi lên mặt sóng: cao theo sóng, nghiêng theo pháp tuyến sóng (follow = mức nghiêng theo, vật lớn thì nhỏ), quay theo hướng yaw
var _qN = new THREE.Quaternion(), _qY = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _nv = new THREE.Vector3();
function seaPose(o, x, z, yaw, drop, follow){ var n = waveNormalAt(x, z), fk = follow * (1 + 0.7 * OC.windK); _nv.set(n[0] * fk, 1, n[2] * fk).normalize();   // gió mạnh thì thuyền nghiêng theo mặt sóng nhiều hơn
  _qY.setFromAxisAngle(_up, yaw); o.quaternion.setFromUnitVectors(_up, _nv).multiply(_qY); o.position.set(x, drop + waveHeightAt(x, z), z); }
function updateAnim(dt, ts){
  var i, b;
  if (anim.hullIM && frameN % 2 === 0){ for (i = 0; i < anim.boats.length; i++){ b = anim.boats[i]; seaPose(_d, b.x, b.z, b.r, -0.035, 0.8); _d.scale.copy(anim.hullK); _d.updateMatrix(); anim.hullIM.setMatrixAt(i, _d.matrix); }
    anim.hullIM.instanceMatrix.needsUpdate = true; }
  anim.movers.forEach(function(m){ m.t += dt * m.sp / m.len; var u, sgn = 1;
    if (m.loop) u = ((m.t % 1) + 1) % 1; else { var q = ((m.t % 2) + 2) % 2; u = q < 1 ? q : 2 - q; sgn = q < 1 ? 1 : -1; }
    m.curve.getPointAt(u, _v3); m.curve.getTangentAt(u, _tan); _tan.multiplyScalar(sgn);
    seaPose(m.g, _v3.x, _v3.z, Math.atan2(-_tan.x, -_tan.z), -0.03, 0.45); });
  anim.gondolas.forEach(function(g){ var u = (ts * 0.012 + g.userData.off) % 1; if (g.userData.dir < 0) u = 1 - u; g.userData.curve.getPointAt(u, _v3); g.position.copy(_v3); g.userData.curve.getTangentAt(u, _tan); g.rotation.y = Math.atan2(_tan.x, _tan.z); });
  if (anim.wheel){ anim.wheel.w.rotation.z = ts * 0.1; anim.wheel.cabins.forEach(function(c){ c.rotation.z = -anim.wheel.w.rotation.z; }); }
  var V = anim.vehicles;
  if (V){ var pos = V.pos, ims = {};
    for (i = 0; i < V.list.length; i++){ var v = V.list[i], R = v.R; v.s += v.dir * v.sp * dt; if (v.s < 0){ v.s = 0; v.dir = 1; } else if (v.s > R.L){ v.s = R.L; v.dir = -1; }
      roadPoint(R, v.s, vp); var fx = vp.fx * v.dir, fz = vp.fz * v.dir, off = R.w * (0.12 + 0.17 * v.l), x = vp.x - fz * off, z = vp.z + fx * off;
      _d.position.set(x, vp.y, z); _d.rotation.set(0, Math.atan2(fx, fz), 0); if (v.sc) _d.scale.copy(v.sc); else _d.scale.setScalar(v.ks || 1); _d.updateMatrix(); v.im.setMatrixAt(v.k, _d.matrix); ims[v.im.uuid] = v.im;
      var hl = v.len / 2 + 0.005; pos[i * 6] = x + fx * hl; pos[i * 6 + 1] = vp.y + 0.06 * (v.ks || 1); pos[i * 6 + 2] = z + fz * hl; pos[i * 6 + 3] = x - fx * hl; pos[i * 6 + 4] = vp.y + 0.06 * (v.ks || 1); pos[i * 6 + 5] = z - fz * hl; }
    for (var key in ims) ims[key].instanceMatrix.needsUpdate = true;
    if (lampK > 0.01) carPts.geometry.attributes.position.needsUpdate = true; }
  var T = anim.train;
  if (T && ST.RAIL_S){ if (T.wait > 0) T.wait -= dt; else { T.s += T.dir * 1.2 * dt; if (T.s > ST.RAIL_S.L - 1 || T.s < 6){ T.s = clamp(T.s, 6, ST.RAIL_S.L - 1); T.dir *= -1; T.wait = 14; } }
    for (i = 0; i < 10; i++){ roadPoint(ST.RAIL_S, clamp(T.s - T.dir * i * 0.6, 0, ST.RAIL_S.L), vp); _d.position.set(vp.x, vp.y + 0.02, vp.z); _d.rotation.set(0, Math.atan2(vp.fx * T.dir, vp.fz * T.dir), 0); _d.scale.copy(i ? T.kc : T.kl); _d.updateMatrix(); (i ? T.im : T.loco).setMatrixAt(i ? i - 1 : 0, _d.matrix); }
    T.im.instanceMatrix.needsUpdate = true; T.loco.instanceMatrix.needsUpdate = true; }
  if (anim.birds){ var B = anim.birds; B.list.forEach(function(q, k){ q.a += q.sp * dt; var x = q.cx + Math.cos(q.a) * q.r, z = q.cz + Math.sin(q.a) * q.r; _d.position.set(x, q.h + 0.3 * Math.sin(ts * 0.7 + q.f), z);
      _d.rotation.set(0, Math.atan2(-Math.sin(q.a) * q.sp, Math.cos(q.a) * q.sp) + Math.PI / 2, 0); _d.scale.set(1.3, 0.3 + 1.2 * Math.abs(Math.sin(ts * 7 + q.f)), 1.3); _d.updateMatrix(); B.im.setMatrixAt(k, _d.matrix); });
    B.im.instanceMatrix.needsUpdate = true; }
  // mây trôi theo hướng gió thổi tới, nhanh dần theo windK (0,35× lặng gió, ~1× ở 28 km/h như trước, ~2,3× ở 75 km/h)
  var cto = (OC.from + 180) * Math.PI / 180, cdx = Math.sin(cto), cdz = -Math.cos(cto), cws = 0.35 + 2.0 * OC.windK;
  anim.clouds.forEach(function(c){ var sp = c.userData.sp * cws * dt; c.position.x += cdx * sp; c.position.z += cdz * sp;
    if (c.position.x > BX1 + 40) c.position.x = BX0 - 40; else if (c.position.x < BX0 - 40) c.position.x = BX1 + 40; if (c.position.z > BZ1 + 40) c.position.z = BZ0 - 40; else if (c.position.z < BZ0 - 40) c.position.z = BZ1 + 40; });
  var PS = anim.parasail;
  if (PS){ var a = ts * 0.07, bx = PS.c[0] + Math.cos(a) * 3, bz = PS.c[1] + Math.sin(a) * 10, tx = -Math.sin(a) * 3, tz = Math.cos(a) * 10, tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
    PS.boat.position.set(bx, -0.03, bz); PS.boat.rotation.y = Math.atan2(-tx, -tz);
    PS.chute.position.set(bx - tx * 2.4, 2.6 + 0.15 * Math.sin(ts), bz - tz * 2.4); PS.chute.rotation.y = Math.atan2(tx, tz);
    var lp = PS.line.geometry.attributes.position; lp.setXYZ(0, bx, 0.12, bz); lp.setXYZ(1, bx - tx * 2.4, 2.05 + 0.15 * Math.sin(ts), bz - tz * 2.4); lp.needsUpdate = true; }
  if (ST.ring && ST.ring.visible){ var k = ST.ring.userData.r * (1 + 0.06 * Math.sin(ts * 3)); ST.ring.scale.set(k, 1, k); }
}

// THREE.Clock đã deprecated từ r183: đồng hồ tối giản (giây thực, getDelta, elapsedTime)
var clock = { t0:performance.now(), last:performance.now(), elapsedTime:0, getDelta:function(){ var n = performance.now(), d = (n - this.last) / 1000; this.last = n; this.elapsedTime = (n - this.t0) / 1000; return d; } };
/* ---------- định vị: "tôi đang ở đâu" (Geolocation, cần HTTPS; trong Claude artifact thường bị chặn) ---------- */
var locBtn = document.getElementById('btnLocate'), locInfo = document.getElementById('locInfo'), locText = document.getElementById('locText');
var LOC = { watch:null, marker:null, acc:null, x:0, z:0, first:true };
function locMsg(html){ locText.innerHTML = html; locInfo.hidden = false; hideHint(); }
function esc(t){ return String(t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
// tên đường gần nhất (OSM, trong ~100 m) và địa danh gần nhất
function whereIs(x, z){ var road = null, rd = 1e9; if (OSM) OSM.roads.forEach(function(R){ if (!R.name) return; var Q = R.pts;
    for (var i = 0; i < Q.length - 1; i++){ var d = segD2(x, z, Q[i][0], Q[i][1], Q[i + 1][0], Q[i + 1][1]); if (d < rd){ rd = d; road = R.name; } } });
  var lm = null, ld = 1e9; LM.forEach(function(L){ var p = LMP[L.id]; if (!p) return; var d = Math.hypot(p[0] - x, p[1] - z); if (d < ld){ ld = d; lm = L; } });
  return { road:Math.sqrt(rd) < 2 ? road : null, lm:lm, lmM:Math.round(ld * 50) }; }
function locMarker(){ var g = new THREE.Group(), dot = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color:0x2f7cf6, depthTest:false, transparent:true })),
    rim = new THREE.Mesh(new THREE.RingGeometry(1, 1.35, 32), new THREE.MeshBasicMaterial({ color:0xffffff, depthTest:false, transparent:true })),
    pulse = new THREE.Mesh(new THREE.RingGeometry(1, 1.25, 40), new THREE.MeshBasicMaterial({ color:0x2f7cf6, depthTest:false, transparent:true, opacity:0.5 }));
  [dot, rim, pulse].forEach(function(m, i){ m.rotation.x = -Math.PI / 2; m.renderOrder = 990 + i; g.add(m); }); g.userData.pulse = pulse;
  LOC.acc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color:0x2f7cf6, transparent:true, opacity:0.14, depthWrite:false })); LOC.acc.rotation.x = -Math.PI / 2;
  scene.add(LOC.acc); scene.add(g); return g; }
function onPos(pos){ var lat = pos.coords.latitude, lon = pos.coords.longitude, p = P(lat, lon), x = p[0], z = p[1], accM = Math.round(pos.coords.accuracy || 0);
  if (!inBoard(x, z, 0)){ var km = Math.hypot(x - homeTarget.x, z - homeTarget.z) * 0.05;
    locMsg('<b>Bạn đang ở ngoài bản đồ</b>' + dms(lat, 'B') + ' · ' + dms(lon, 'Đ') + '<br><small>Cách trung tâm Nha Trang khoảng ' + (km < 100 ? km.toFixed(1) : Math.round(km)) + ' km</small>');
    if (LOC.marker) LOC.marker.visible = LOC.acc.visible = false; return; }
  if (!LOC.marker) LOC.marker = locMarker(); LOC.x = x; LOC.z = z; var y = Math.max(ST.G.hAt(x, z), 0) + 0.06;
  LOC.marker.position.set(x, y, z); LOC.acc.position.set(x, y - 0.02, z); LOC.acc.scale.setScalar(Math.max(accM / 50, 0.05)); LOC.marker.visible = LOC.acc.visible = true;
  var w = whereIs(x, z), html = '<b>' + (w.road ? esc(/^(Đường|Hẻm|Kiệt|Ngõ|Cầu|Quốc lộ|Tỉnh lộ|Đại lộ)/i.test(w.road) ? w.road : 'Đường ' + w.road) : 'Bạn đang ở đây') + '</b>';
  if (w.lm) html += 'Cách ' + esc(w.lm.name) + ' ' + (w.lmM >= 1000 ? (w.lmM / 1000).toFixed(1) + ' km' : w.lmM + ' m') + '<br>';
  html += '<small>' + dms(lat, 'B') + ' · ' + dms(lon, 'Đ') + (accM ? ' · sai số ~' + accM + ' m' : '') + '</small>'; locMsg(html);
  if (LOC.first){ LOC.first = false; closeCard(); setSpin(false); flyTo(new THREE.Vector3(x, y, z), 14, 0.75, null, 1500); } }
function onPosErr(e){ var t = e && e.code === 1 ? 'Bạn chưa cho phép trang dùng vị trí. Bật quyền Vị trí cho trình duyệt (Cài đặt › Safari › Vị trí) rồi bấm lại.'
    : (e && e.code === 3 ? 'Lấy vị trí quá lâu, thử lại ở chỗ thoáng hơn.' : 'Không lấy được vị trí trên thiết bị này.');
  locMsg('<b>Không định vị được</b><small>' + t + '</small>'); stopLocate(); }
function stopLocate(){ if (LOC.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(LOC.watch); LOC.watch = null; locBtn.setAttribute('aria-pressed', 'false'); locBtn.classList.remove('on');
  if (LOC.marker) LOC.marker.visible = LOC.acc.visible = false; }
function toggleLocate(){ if (LOC.watch != null){ stopLocate(); locInfo.hidden = true; return; }
  if (!navigator.geolocation || !window.isSecureContext){ locMsg('<b>Không định vị được</b><small>Trình duyệt hoặc trang này không cho dùng vị trí (cần mở trang qua HTTPS).</small>'); return; }
  LOC.first = true; locBtn.setAttribute('aria-pressed', 'true'); locBtn.classList.add('on'); locMsg('<b>Đang tìm vị trí của bạn…</b>');
  LOC.watch = navigator.geolocation.watchPosition(onPos, onPosErr, { enableHighAccuracy:true, timeout:15000, maximumAge:5000 }); }
// dấu "bạn ở đây" khi lái/đi bộ mà camera xa (người chơi nhỏ): vòng cam cỡ ~16 px không đổi trên màn hình
var PMK = null;
function updatePlayerMarker(dist){ if (!PLAY.on || !PL || dist < 0.9){ if (PMK) PMK.visible = false; return; }
  if (!PMK){ PMK = new THREE.Group(); var ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.35, 32), new THREE.MeshBasicMaterial({ color:0xff6a2b, depthTest:false, transparent:true, opacity:0.9 })),
      dot = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ color:0xffffff, depthTest:false, transparent:true, opacity:0.9 }));
    [ring, dot].forEach(function(m, i){ m.rotation.x = -Math.PI / 2; m.renderOrder = 985 + i; PMK.add(m); }); scene.add(PMK); }
  PMK.visible = true; PMK.scale.setScalar(dist * 0.012); PMK.position.set(PL.x, PL.y + 0.01, PL.z); }
function updateLocate(dist, ts){ if (!LOC.marker || !LOC.marker.visible) return; var s = Math.max(0.12, dist * 0.011); LOC.marker.scale.setScalar(s);
  var k = (ts * 0.8) % 1, pm = LOC.marker.userData.pulse; pm.scale.setScalar(1 + k * 1.8); pm.material.opacity = 0.55 * (1 - k); }

/* ---------- chip gió: mũi tên (hướng gió thổi tới so với màn hình), km/h, cấp Beaufort, giật; cập nhật mỗi giây từ OC, kể cả khi lái ---------- */
var windEl = null, windT = 0, windAng = 999;
function updateWindChip(dt){
  if (!windEl){ windEl = document.getElementById('windchip'); if (!windEl) return; windEl.arrow = document.getElementById('windArrow'); windEl.kmh = document.getElementById('windKmh'); windEl.bf = document.getElementById('windBf'); windEl.gust = document.getElementById('windGust'); }
  windT -= dt;
  if (windT <= 0){ windT = 1; var W = windState(), gp = Math.round(OC.kmh * (1 + OC.gustR)); windEl.hidden = false;
    windEl.kmh.textContent = Math.round(W.kmh); windEl.bf.textContent = 'cấp ' + W.bf; windEl.gust.textContent = gp > W.kmh * 1.12 + 2 ? 'giật ' + gp : ''; windEl.classList.toggle('strong', W.bf >= 6);
    windEl.setAttribute('aria-label', 'Gió ' + Math.round(W.kmh) + ' km/h, cấp ' + W.bf + (windEl.gust.textContent ? ', ' + windEl.gust.textContent : '')); }
  // mũi tên: góc theo chiều kim đồng hồ từ "lên trên màn hình" (hướng nhìn của camera trên mặt phẳng) tới hướng gió thổi tới
  var az = ST.controls.getAzimuthalAngle(), fx = -Math.sin(az), fz = -Math.cos(az), W2 = windState(), ang = Math.atan2(W2.dx * -fz + W2.dz * fx, W2.dx * fx + W2.dz * fz) * 180 / Math.PI;
  if (Math.abs(ang - windAng) > 1.5 && windEl.arrow){ windAng = ang; windEl.arrow.style.transform = 'rotate(' + ang.toFixed(0) + 'deg)'; } }

function frame(now){
  requestAnimationFrame(frame);
  var rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.05), ts = clock.elapsedTime * (reduceMotion ? 0.3 : 1); frameN++;
  updateOcean(dt * (reduceMotion ? 0.3 : 1));
  if (Math.abs(ST.tod - ST.todTarget) > 0.003){ ST.tod += (ST.todTarget - ST.tod) * Math.min(1, dt * 2.2); applyTod(ST.tod); } else if (ST.tod !== ST.todTarget){ ST.tod = ST.todTarget; applyTod(ST.tod); }
  updateAnim(dt * (reduceMotion ? 0.3 : 1), ts);
  ST.crowdU.uTime.value = ts; ST.crowdU.uCam.value.copy(camera.position); ST.crowdU.uFogColor.value.copy(scene.fog.color); ST.crowdU.uFogNear.value = scene.fog.near; ST.crowdU.uFogFar.value = scene.fog.far;
  if (PLAY.on && !tween){ updatePlayer(dt); followCamera(dt, PLAY.dragging); }
  if (tween) stepTween(now || performance.now());
  if (!PLAY.on) ST.controls.maxPolarAngle = lerp(1.5, 1.36, clamp((camera.position.distanceTo(ST.controls.target) - 1) / 5, 0, 1));   // gần đất cho nhìn ngang tới 86°, xa vẫn 78°
  ST.controls.update(); constrain();
  camDes.copy(camera.position);   // vị trí camera người dùng muốn; nếu nhà chắn thì chỉ rút khi vẽ rồi trả lại ở cuối khung
  if (tween) camK = 1; else { var cb = camBlock(ST.controls.target, camDes); camK += (cb - camK) * (1 - Math.exp(-dt * (cb < camK ? 20 : 3)));
    if (camK < 0.995){ camera.position.lerpVectors(ST.controls.target, camDes, camK); var gc2 = surfY(camera.position.x, camera.position.z) + (PLAY.on ? 0.03 * KS : 0.05); if (camera.position.y < gc2) camera.position.y = gc2; camShifted = true; } }   // rút ngắn rồi vẫn phải ở trên mặt đất (điểm nhìn nằm dưới mặt đất 15%)
  var dist = camera.position.distanceTo(ST.controls.target), nn = clamp(dist * 0.008, 0.005, 6);
  if (Math.abs(nn - camera.near) > nn * 0.15){ camera.near = nn; camera.updateProjectionMatrix(); }
  updateShadow(dist);
  updateDetail(PLAY.on && PL ? PL.x : ST.controls.target.x, PLAY.on && PL ? PL.z : ST.controls.target.z, PLAY.on || dist < 55, dist);
  updateMinimap(now || performance.now());
  updateRain(dt, ts); renderFrame(dist, dt);
  updateWeather(dt, ts, dist); updateWindChip(dt); updateLabels(dist); updateHud(dist); updateAudio(dt, dist); updateLocate(dist, ts); updatePlayerMarker(dist); governor(rawDt);
  if (camShifted){ camera.position.copy(camDes); camShifted = false; }   // trả camera về vị trí mong muốn để điều khiển và cú kéo giữa hai khung không bị lệch
}

/* ---------- bộ điều tốc: FPS thấp kéo dài thì hạ chất lượng từng bậc ---------- */
// Bậc 1: giảm độ phân giải. Bậc 2: tắt bóng đổ. Bậc 3: bớt một nửa người đi bộ và ghi nhớ để lần sau dựng bản LITE.
ST.GOV = { t:0, n:0, acc:0, level:0, wait:4 };
function governor(d){ if (document.hidden || d <= 0 || d > 0.5) return; ST.GOV.t += d; if (ST.GOV.t < ST.GOV.wait) return; ST.GOV.acc += d; ST.GOV.n++;
  if (ST.GOV.acc < 2.5) return; var fps = ST.GOV.n / ST.GOV.acc; ST.GOV.acc = 0; ST.GOV.n = 0;
  if (fps >= 38 || ST.GOV.level >= 3) return; ST.GOV.level++; ST.GOV.t = 0; ST.GOV.wait = 3;
  if (ST.GOV.level === 1){ renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.7)); renderer.setSize(innerWidth, innerHeight); resizePost(); }   // cũng tắt hậu kỳ (renderFrame)
  else if (ST.GOV.level === 2){ renderer.shadowMap.enabled = false; scene.traverse(function(o){ if (o.material && o.material.needsUpdate !== undefined) o.material.needsUpdate = true; }); }
  else { var C = anim.crowd; if (C) C.mesh.geometry.instanceCount = Math.floor(C.n / 2); try { if (!LITE) localStorage.setItem('nt-q', 'lite'); } catch (e){} }
  console.info('[chất lượng] FPS ' + fps.toFixed(0) + ' → hạ xuống bậc ' + ST.GOV.level); }

/* ======================= BUILD SEQUENCE ======================= */
async function build(){
  await step('Đang dựng địa hình…');
  ST.G = buildGrid(LITE ? 1.5 : 1.0);
  ST.ROADS_S = OSM ? osmMajorRoads() : ROADS.map(function(R){ return sampleRoad(R.pts, R.w); }); ST.RAIL_S = sampleRoad(RAIL, 0.4, true);
  await step('Đang vẽ mặt đất…');
  var MW = Math.round(BW * 4), MH = Math.round(BD * 4), mcv = document.createElement('canvas'); mcv.width = MW; mcv.height = MH;
  var mctx = mcv.getContext('2d'); worldCtx(mctx, MW, MH); drawOverlays(mctx, true);
  var md = mctx.getImageData(0, 0, MW, MH).data, mask = new Uint8Array(MW * MH); for (var i = 0; i < MW * MH; i++) mask[i] = md[i * 4 + 3] > 40 ? 1 : 0;
  ST.MK = function(x, z){ var px = ((x - BX0) * 4) | 0, pz = ((z - BZ0) * 4) | 0; if (px < 0 || pz < 0 || px >= MW || pz >= MH) return true; return mask[pz * MW + px] === 1; };
  var maxT = renderer.capabilities.maxTextureSize || 4096, TW = Math.min(LITE ? 2048 : 3072, maxT), TH = Math.round(TW * BD / BW);
  var gcv = document.createElement('canvas'); gcv.width = TW; gcv.height = TH; var gctx = gcv.getContext('2d'), img = gctx.createImageData(TW, TH);
  paintGround(img.data, TW, TH, ST.G); gctx.putImageData(img, 0, 0); worldCtx(gctx, TW, TH); drawOverlays(gctx, false);
  ST.groundCv = gcv; ST.groundTex = new THREE.CanvasTexture(gcv); ST.groundTex.colorSpace = THREE.SRGBColorSpace; ST.groundTex.flipY = false; ST.groundTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  initDetail(); ST.terrain = buildTerrain(); ST.water = buildOcean(); scene.add(ST.water); buildSkirt();
  await step('Đang dựng phố xá…');
  var B = genBuildings(ST.G, ST.MK, LITE ? 0.55 : 1, RESORT_HOTELS); buildCity(B);
  buildLandmarks(); buildCable(); buildResort(); var bl = buildBridges();
  await step('Đang trồng cây…');
  var T = genTrees(ST.G, ST.MK, LITE ? 2.0 : 1.4, 1); buildVegetation(T, B);
  await step('Đang thả thuyền, cho xe chạy…');
  buildBoats(); buildTraffic(); buildLamps(bl); buildSky();
  await step('Đang thêm người đi dạo…');
  buildCrowd(); buildPlayer(B);
  ST.ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color:'#f2592c', transparent:true, opacity:0.9, depthWrite:false, side:THREE.DoubleSide })); ST.ring.visible = false; ST.ring.renderOrder = 3; scene.add(ST.ring);
  setupLM(); setupUI(); setupPlay(); initMinimap();
  initPost(); initWeather(); ST.todTarget = ST.tod = realTod(); applyTod(ST.tod); syncTimeBtn();
  computeHome(); setCam(homeTarget, homeDist, HOME_PHI, HOME_TH); ST.controls.update(); setSpin(!reduceMotion);
  // Hook cho tools/shot.js và test: đặt thẳng camera, giờ, thời tiết (không chờ nội suy theo khung hình, mà trong SwiftShader mỗi khung mất vài giây)
  window.__nt = { THREE:THREE, frames:function(){ return frameN; },
    jump:function(t, r, phi, th){ tween = null; ST.controls.enabled = true; ST.controls.enableDamping = !PLAY.on; setCam(t, r, phi, th); ST.controls.update(); ST.shadowDirty = true; },
    home:function(){ this.jump(homeTarget, homeDist, HOME_PHI, HOME_TH); },
    setTod:function(n){ ST.todUser = true; ST.WX.real = false; ST.todTarget = ST.tod = n; applyTod(n); syncTimeBtn(); },
    setWx:function(m){ ST.WX.mode = m; syncWxBtn(); updateWeather(2, 0, 100); },
    setRain:setRain, setLightning:function(on){ ST.WX.lightning = !!on; }, strike:function(){ ST.strike(); },
    KS:KS, KV:KV, GOV:ST.GOV, setNav:function(id){ ST.navTarget = id && LMI[id] ? LMI[id].i : -1; }, minimap:{ draw:function(x, z, az, yaw, tgt, night){ drawMinimap(x, z, az, yaw, tgt, night || 0); }, state:MM }, streetPalms:function(){ return ST.streetPalms; }, setWind:setWind, windChip:function(){ windT = 0; updateWindChip(0); return document.getElementById('windchip').textContent; }, waves:{ heightAt:waveHeightAt, normalAt:waveNormalAt, windState:windState, depthFade:depthFade }, PL:PL, enterPlay:enterPlay, toggleMount:toggleMount, keys:function(){ return ST.keys; }, G:ST.G, B:B, T:T, ROADS_S:ST.ROADS_S, RAIL_S:ST.RAIL_S, LM:LM, anim:anim, ground:gcv, renderer:renderer, camera:camera, controls:ST.controls, setCam:setCam, audio:AU, gov:ST.GOV, lite:LITE, wx:ST.WX, sunPos:sunPos, lmp:LMP, post:POST, scene:scene, OSM:OSM, inBoard:inBoard };
  ready = true; loader.hidden = true; requestAnimationFrame(frame);
}
build().catch(function(e){ console.error(e); fail('Không dựng được bản đồ: ' + (e && e.message ? e.message : e)); });
