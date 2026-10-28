/* ======================= CONTROLS, UI, LOOP ======================= */
var ready = false, shadowDirty = true, frameN = 0;
var controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.09; controls.screenSpacePanning = false;
controls.mouseButtons = { LEFT:THREE.MOUSE.PAN, MIDDLE:THREE.MOUSE.DOLLY, RIGHT:THREE.MOUSE.ROTATE };
controls.touches = { ONE:THREE.TOUCH.PAN, TWO:THREE.TOUCH.DOLLY_ROTATE };
controls.minDistance = 3; controls.maxPolarAngle = 1.36; controls.minPolarAngle = 0.06;
controls.rotateSpeed = 0.6; controls.panSpeed = 1.0; controls.zoomSpeed = 1.0; controls.autoRotateSpeed = 0.3;
SC.near = 150; SC.far = 700;

var homeTarget = new THREE.Vector3(-14, 0, -4), homeDist = 400, HOME_PHI = 0.86, HOME_TH = 0.16;
function computeHome(){ var asp = innerWidth / innerHeight, t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  homeDist = Math.max(BW * 0.98 / (2 * t * asp), BD * 0.8 / (2 * t)); controls.maxDistance = homeDist * 1.35; scene.fog.near = homeDist * 0.95; scene.fog.far = homeDist * 3.2; }
function setCam(target, r, phi, th){ controls.target.copy(target); camera.position.set(target.x + r * Math.sin(phi) * Math.sin(th), target.y + r * Math.cos(phi), target.z + r * Math.sin(phi) * Math.cos(th)); camera.lookAt(target); }
addEventListener('resize', function(){ renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); computeHome(); labels.forEach(function(l){ l.w = 0; }); });

var ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function setNdc(e){ var r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
function surfY(x, z){ return inBoard(x, z, 0) ? Math.max(G.hAt(x, z), 0) : -60; }
function groundHit(r){ var o = r.origin, d = r.direction, t = 0, st = 0.2;
  for (var i = 0; i < 700; i++){ var x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y <= surfY(x, z)){ var a = Math.max(0, t - st), b = t; for (var k = 0; k < 12; k++){ var m = (a + b) / 2; if (o.y + d.y * m <= surfY(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
      return new THREE.Vector3(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b); }
    if (y < -40) break; st = Math.max(0.15, t * 0.012 + 0.1); t += st; }
  return null; }
stage.addEventListener('wheel', function(e){ if (!ready) return; e.preventDefault(); e.stopPropagation();
  var dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1), k = Math.exp(clamp(dy, -150, 150) * 0.0016);
  if (PLAY.on){ var off = camera.position.clone().sub(controls.target), nl = clamp(off.length() * k, controls.minDistance, controls.maxDistance); camera.position.copy(controls.target).add(off.setLength(nl)); return; }
  var dist = camera.position.distanceTo(controls.target), nd = clamp(dist * k, controls.minDistance, controls.maxDistance); k = nd / dist;
  setNdc(e); var hit = groundHit(ray.ray) || controls.target.clone();
  controls.target.sub(hit).multiplyScalar(k).add(hit); camera.position.sub(hit).multiplyScalar(k).add(hit);
  if (controls.autoRotate) setSpin(false); hideHint(); }, { capture:true, passive:false });

/* ---------- camera fly ---------- */
var tween = null;
function sphOf(){ var o = camera.position.clone().sub(controls.target), r = o.length(); return { r:r, phi:Math.acos(clamp(o.y / r, -1, 1)), th:Math.atan2(o.x, o.z) }; }
function flyTo(target, r, phi, th, dur){ var s = sphOf(); if (th == null) th = s.th; var dth = Math.atan2(Math.sin(th - s.th), Math.cos(th - s.th));
  tween = { t0:performance.now(), dur:reduceMotion ? 1 : (dur || 1500), ft:controls.target.clone(), tt:target.clone(), fr:s.r, tr:r, fp:s.phi, tp:phi, fth:s.th, dth:dth };
  controls.enableDamping = false; controls.enabled = false; controls.update(); }
function stepTween(now){ var u = Math.min(1, (now - tween.t0) / tween.dur), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  var tg = new THREE.Vector3().lerpVectors(tween.ft, tween.tt, e), r = Math.exp(lerp(Math.log(tween.fr), Math.log(tween.tr), e)), lift = Math.sin(Math.PI * e) * Math.min(tween.fr, tween.tr) * 0.25;
  setCam(tg, r + lift, lerp(tween.fp, tween.tp, e), tween.fth + tween.dth * e);
  if (u >= 1){ tween = null; controls.enableDamping = true; controls.enabled = true; } }
function constrain(){ var tg = controls.target, c = boardClamp(clamp(tg.x, BX0 + 8, BX1 - 8), clamp(tg.z, BZ0 + 8, BZ1 - 8)), dx = c[0] - tg.x, dz = c[1] - tg.z;
  if (dx || dz){ tg.x += dx; tg.z += dz; camera.position.x += dx; camera.position.z += dz; }
  if (!tween && !PLAY.on){ var dy = (Math.max(G.hAt(tg.x, tg.z), 0) * 0.85) - tg.y; if (Math.abs(dy) > 0.002){ tg.y += dy * 0.12; camera.position.y += dy * 0.12; } }
  var gc = surfY(camera.position.x, camera.position.z) + 0.35; if (camera.position.y < gc) camera.position.y = gc; }

/* ---------- shadows follow the view ---------- */
var shadowKey = [1e9, 1e9, 0];
function updateShadow(dist){
  var half = clamp(dist * 0.75, 9, 240), hq = Math.pow(1.15, Math.round(Math.log(half) / Math.log(1.15))), tex = 2 * hq / sun.shadow.mapSize.x, tg = controls.target;
  var cx = Math.round(tg.x / (tex * 4)) * tex * 4, cz = Math.round(tg.z / (tex * 4)) * tex * 4;
  if (shadowDirty || hq !== shadowKey[2] || cx !== shadowKey[0] || cz !== shadowKey[1]){
    SC.left = -hq; SC.right = hq; SC.top = hq; SC.bottom = -hq; SC.updateProjectionMatrix();
    sun.target.position.set(cx, 0, cz); sun.position.set(cx + sunDir.x * 400, sunDir.y * 400, cz + sunDir.z * 400); sun.target.updateMatrixWorld();
    shadowKey = [cx, cz, hq]; shadowDirty = false; renderer.shadowMap.needsUpdate = true;
  } else if (dist < 90 && frameN % 3 === 0) renderer.shadowMap.needsUpdate = true;
}

/* ---------- landmarks registry ---------- */
var TOPKEY = { ponagar:'ponagarTop', 'hon-chong':'honchongTop', 'cho-dam':'chodamTop', 'long-son':'buddhaTop', 'nha-tho':'nhathoTop', 'tram-huong':'tramTop', 'vien-hdh':'vienTop', yersin:'yersinTop', ga:'gaTop', 'bao-dai':'baodaiTop', 'hon-do':'hondoTop' };
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
    labels.push({ el:el, pos:new THREE.Vector3(p[0], Math.max(G.hAt(p[0], p[1]), 0) + g.y, p[1]), kind:'geo', max:g.max, vis:true }); });
  ROAD_LABELS.forEach(function(g){ var z = P(g.ll[0], 0)[1], x = g.ll[1] == null ? coastX(z) - g.off : P(g.ll[0], g.ll[1])[0], el = document.createElement('div'); el.className = 'road'; el.textContent = g.t; labelLayer.appendChild(el);
    labels.push({ el:el, pos:new THREE.Vector3(x, G.hAt(x, z) + 0.3, z), kind:'road', vis:true }); });
  labels.forEach(function(l){ l.el.style.visibility = 'hidden'; l.vis = false; }); }
function hits(x0, y0, x1, y1){ for (var i = 0; i < placed.length; i++){ var p = placed[i]; if (x0 < p[2] && x1 > p[0] && y0 < p[3] && y1 > p[1]) return true; } return false; }
function prio(L){ return (L.lm && L.lm.i === current) ? -1e9 : (L.kind === 'geo' ? 40 : (L.kind === 'road' ? 60 : 0)); }
function updateLabels(dist){
  var w = innerWidth, h = innerHeight, cand = []; placed.length = 0;
  for (var i = 0; i < labels.length; i++){ var L = labels[i]; L.show = false;
    var isSel = L.lm && L.lm.i === current;
    if (!labelsOn && !isSel) continue;
    if (L.kind === 'geo' && dist > homeDist * L.max) continue;
    if (L.kind === 'road' && dist > 60) continue;
    pv.copy(L.pos).project(camera);
    if (!(pv.z < 1 && pv.x > -1.1 && pv.x < 1.1 && pv.y > -1.15 && pv.y < 1.2)) continue;
    L.sx = (pv.x * 0.5 + 0.5) * w; L.sy = (-pv.y * 0.5 + 0.5) * h; L.d = camera.position.distanceTo(L.pos); cand.push(L); }
  cand.sort(function(a, b){ return (prio(a) + a.d) - (prio(b) + b.d); });
  for (var j = 0; j < cand.length; j++){ var C2 = cand[j];
    if (C2.kind === 'lm'){ var far = C2.d > homeDist * 0.55; if (far !== C2.far){ C2.el.classList.toggle('far', far); C2.far = far; C2.w = 0; } }
    if (!C2.w){ C2.w = C2.el.offsetWidth; C2.h = C2.el.offsetHeight; }
    var mid = C2.kind !== 'lm', x0 = C2.sx - C2.w / 2 - 3, x1 = C2.sx + C2.w / 2 + 3, y0 = mid ? C2.sy - C2.h / 2 - 2 : C2.sy - C2.h - 2, y1 = mid ? C2.sy + C2.h / 2 + 2 : C2.sy + 1;
    if (prio(C2) > -1 && hits(x0, y0, x1, y1)) continue;
    placed.push([x0, y0, x1, y1]); C2.show = true;
    C2.el.style.transform = 'translate3d(' + C2.sx.toFixed(1) + 'px,' + C2.sy.toFixed(1) + 'px,0) translate(-50%,' + (mid ? '-50%' : '-100%') + ')';
    if (C2.kind === 'lm') C2.el.style.zIndex = String(1000 - Math.round(C2.d)); }
  for (i = 0; i < labels.length; i++){ var M = labels[i]; if (M.show !== M.vis){ M.el.style.visibility = M.show ? 'visible' : 'hidden'; M.vis = M.show; } } }

/* ---------- HUD ---------- */
var needle = document.getElementById('needle'), scaleBar = document.getElementById('scaleBar'), scaleText = document.getElementById('scaleText'), coordEl = document.getElementById('coord');
function dms(v, hemi){ var d = Math.floor(v), m = (v - d) * 60, mi = Math.floor(m), s = Math.round((m - mi) * 60); if (s === 60){ s = 0; mi++; } return d + '°' + (mi < 10 ? '0' : '') + mi + '′' + (s < 10 ? '0' : '') + s + '″' + hemi; }
function updateHud(dist){ needle.setAttribute('transform', 'rotate(' + (controls.getAzimuthalAngle() * 180 / Math.PI).toFixed(1) + ' 24 24)');
  if (frameN % 6) return;
  var wpp = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / innerHeight, maxM = 120 * wpp * 50, m = 20;
  [20, 50, 100, 200, 500, 1000, 2000, 5000].forEach(function(s){ if (s <= maxM) m = s; });
  scaleBar.style.width = Math.round(m / 50 / wpp) + 'px'; scaleText.textContent = m >= 1000 ? (m / 1000) + ' km' : m + ' m';
  var ll = toLL(controls.target.x, controls.target.z); coordEl.textContent = dms(ll[0], 'B') + ' · ' + dms(ll[1], 'Đ'); }

/* ---------- UI wiring ---------- */
var hint = document.getElementById('hint'), hintGone = false;
function hideHint(){ if (!hintGone){ hintGone = true; hint.classList.add('gone'); } }
var btnSpin = document.getElementById('btnSpin');
function setSpin(on){ controls.autoRotate = on; btnSpin.setAttribute('aria-pressed', String(on)); }
var btnLabels = document.getElementById('btnLabels');
function syncLabelsBtn(){ btnLabels.setAttribute('aria-pressed', String(labelsOn)); btnLabels.setAttribute('aria-label', labelsOn ? 'Ẩn bảng tên' : 'Hiện bảng tên'); }
function toggleLabels(){ labelsOn = !labelsOn; try { localStorage.setItem('nt3d-labels', labelsOn ? '1' : '0'); } catch (e){} syncLabelsBtn(); }
var btnTime = document.getElementById('btnTime'), btnTimeText = document.getElementById('btnTimeText'), TOD_NAMES = ['Ban ngày', 'Hoàng hôn', 'Ban đêm'];
function syncTimeBtn(){ var i = Math.round(todTarget), name = WX.real ? 'Giờ thật' : TOD_NAMES[i]; btnTimeText.textContent = name; btnTime.setAttribute('aria-label', 'Đổi thời điểm, hiện là ' + name.toLowerCase()); btnTime.dataset.tod = String(i); }
function themeIsDark(){ var t = document.documentElement.getAttribute('data-theme'); if (t === 'dark') return true; if (t === 'light') return false; return matchMedia('(prefers-color-scheme: dark)').matches; }
function onSchemeChange(){ if (todUser || WX.real || !ready) return; todTarget = themeIsDark() ? 2 : 0; syncTimeBtn(); }
var rail = document.getElementById('rail'), chips = [], card = document.getElementById('card');
function select(i){ var L = LM[i]; current = i; hideHint();
  document.getElementById('cardTag').textContent = L.cat; document.getElementById('cardTitle').textContent = L.name; document.getElementById('cardDesc').textContent = L.desc;
  var f = document.getElementById('cardFacts'); f.innerHTML = ''; L.facts.forEach(function(t){ var s = document.createElement('span'); s.textContent = t; f.appendChild(s); });
  document.getElementById('cardIdx').textContent = (i + 1) + ' / ' + LM.length;
  card.hidden = false; document.body.classList.add('has-card');
  labels.forEach(function(l){ if (l.lm) l.el.classList.toggle('on', l.lm === L); });
  chips.forEach(function(c, ci){ c.setAttribute('aria-pressed', String(ci === i)); });
  try { chips[i].scrollIntoView({ inline:'center', block:'nearest', behavior:reduceMotion ? 'auto' : 'smooth' }); } catch (e){}
  if (L.ring){ ring.visible = true; ring.position.set(L.anchor.x, L.base + 0.08, L.anchor.z); ring.userData.r = L.ring; } else ring.visible = false;
  document.getElementById('cardGo').hidden = !PLAY.on;
  if (PLAY.on) return;
  setSpin(false); flyTo(L.focus, L.zoom * (innerWidth < 620 ? 1.4 : 1), 0.95, sphOf().th); }
function closeCard(){ current = -1; card.hidden = true; document.body.classList.remove('has-card'); ring.visible = false;
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
  btnTime.addEventListener('click', function(){ todUser = true;
    if (WX.real){ WX.real = false; todTarget = 0; } else if (Math.round(todTarget) === 2){ WX.real = true; todTarget = realTod(); } else todTarget = Math.round(todTarget) + 1;
    if (reduceMotion){ tod = todTarget; } applyTod(tod); syncTimeBtn(); });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onSchemeChange); } catch (e){}
  new MutationObserver(onSchemeChange).observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });
  btnSpin.addEventListener('click', function(){ setSpin(!controls.autoRotate); });
  controls.addEventListener('start', function(){ if (controls.autoRotate) setSpin(false); hideHint(); });
  document.getElementById('btnHome').addEventListener('click', function(){ closeCard(); flyTo(homeTarget, homeDist, HOME_PHI, HOME_TH, 1700); });
  document.getElementById('compass').addEventListener('click', function(){ var s = sphOf(); flyTo(controls.target.clone(), s.r, s.phi, 0, 900); });
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
  saved = { min:controls.minDistance, max:controls.maxDistance, pol:controls.maxPolarAngle };
  controls.enablePan = false; controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE; controls.touches.ONE = THREE.TOUCH.ROTATE; controls.minDistance = 0.35; controls.maxDistance = 9; controls.maxPolarAngle = 1.45;
  document.getElementById('btnPlay').setAttribute('aria-pressed', 'true'); document.getElementById('playHud').hidden = false; syncPlayBtns(); DP.valid = false;
  flyTo(new THREE.Vector3(PL.x, PL.y + 0.09, PL.z), 1.5, 1.08, PL.yaw + Math.PI, 1600); }
function setBoost(on){ boostBtn = on; var bb = document.getElementById('btnBoost'); if (bb){ bb.setAttribute('aria-pressed', String(on)); bb.textContent = on ? 'Đang tăng ga' : 'Tăng ga'; } }
function exitPlay(){ if (!PLAY.on) return; PLAY.on = false; setBoost(false); document.body.classList.remove('playing'); keys = {}; joy.on = false; joy.x = joy.y = 0;
  controls.enablePan = true; controls.mouseButtons.LEFT = THREE.MOUSE.PAN; controls.touches.ONE = THREE.TOUCH.PAN; controls.minDistance = saved.min; controls.maxDistance = saved.max; controls.maxPolarAngle = saved.pol;
  document.getElementById('btnPlay').setAttribute('aria-pressed', 'false'); document.getElementById('playHud').hidden = true;
  var s2 = sphOf(); flyTo(new THREE.Vector3(PL.x, 0, PL.z), 26, 0.9, s2.th, 1300); }
function setupPlay(){
  var bp = document.getElementById('btnPlay'); bp.addEventListener('click', function(){ if (PLAY.on) exitPlay(); else enterPlay(); });
  var MOVE = { KeyW:1, KeyA:1, KeyS:1, KeyD:1, ArrowUp:1, ArrowDown:1, ArrowLeft:1, ArrowRight:1, ShiftLeft:1, ShiftRight:1, Space:1 };
  addEventListener('keydown', function(e){ if (!PLAY.on) return; if (e.target.closest && e.target.closest('input,textarea')) return;
    if (MOVE[e.code]){ keys[e.code] = true; e.preventDefault(); }
    if (e.code === 'KeyE' && !e.repeat){ toggleMount(); e.preventDefault(); }
    if (e.code === 'KeyH' && !e.repeat){ honk(); e.preventDefault(); }
    if (e.code === 'Escape' && current < 0) exitPlay(); }, true);
  addEventListener('keyup', function(e){ if (MOVE[e.code]) keys[e.code] = false; });
  addEventListener('blur', function(){ keys = {}; });
  document.getElementById('btnMount').addEventListener('click', function(){ toggleMount(); });
  document.getElementById('btnHorn').addEventListener('click', honk);
  ['playHud', 'joy'].forEach(function(id){ document.getElementById(id).addEventListener('contextmenu', function(e){ e.preventDefault(); }); });
  var bb = document.getElementById('btnBoost');
  // Tăng ga dạng công tắc: chạm một lần để giữ ga, chạm lần nữa để nhả (không phải giữ ngón tay)
  bb.addEventListener('pointerdown', function(e){ e.preventDefault(); setBoost(!boostBtn); });
  var jz = document.getElementById('joy'), knob = document.getElementById('joyKnob'), jid = null;
  function jset(e){ var r = jz.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = e.clientX - cx, dy = e.clientY - cy, R2 = r.width / 2, l = Math.hypot(dx, dy); if (l > R2){ dx *= R2 / l; dy *= R2 / l; }
    joy.x = dx / R2; joy.y = -dy / R2; knob.style.transform = 'translate(' + dx.toFixed(0) + 'px,' + dy.toFixed(0) + 'px)'; }
  jz.addEventListener('pointerdown', function(e){ jid = e.pointerId; jz.setPointerCapture(jid); joy.on = true; jset(e); e.preventDefault(); });
  jz.addEventListener('pointermove', function(e){ if (e.pointerId === jid) jset(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function(ev){ jz.addEventListener(ev, function(){ jid = null; joy.on = false; joy.x = joy.y = 0; knob.style.transform = ''; }); });
  controls.addEventListener('start', function(){ PLAY.dragging = true; PLAY.lastDrag = performance.now() / 1000; });
  controls.addEventListener('end', function(){ PLAY.dragging = false; PLAY.lastDrag = performance.now() / 1000; });
  document.getElementById('cardGo').addEventListener('click', function(){ if (current >= 0){ teleportTo(LM[current]); closeCard(); } });
}

/* ---------- animation ---------- */
var vp = { x:0, y:0, z:0, fx:0, fz:0 }, _v3 = new THREE.Vector3(), _tan = new THREE.Vector3();
function updateAnim(dt, ts){
  var i, b;
  if (anim.hullIM && frameN % 2 === 0){ for (i = 0; i < anim.boats.length; i++){ b = anim.boats[i]; _d.position.set(b.x, -0.035 + 0.025 * Math.sin(ts * 1.8 + b.ph), b.z); _d.rotation.set(0.04 * Math.sin(ts * 1.3 + b.ph), b.r, 0.05 * Math.sin(ts * 1.6 + b.ph)); _d.scale.copy(anim.hullK); _d.updateMatrix(); anim.hullIM.setMatrixAt(i, _d.matrix); }
    anim.hullIM.instanceMatrix.needsUpdate = true; }
  anim.movers.forEach(function(m){ m.t += dt * m.sp / m.len; var u, sgn = 1;
    if (m.loop) u = ((m.t % 1) + 1) % 1; else { var q = ((m.t % 2) + 2) % 2; u = q < 1 ? q : 2 - q; sgn = q < 1 ? 1 : -1; }
    m.curve.getPointAt(u, _v3); m.curve.getTangentAt(u, _tan); _tan.multiplyScalar(sgn);
    m.g.position.set(_v3.x, -0.03 + 0.03 * Math.sin(ts * 2 + m.len), _v3.z); m.g.rotation.set(0, Math.atan2(-_tan.x, -_tan.z), 0.03 * Math.sin(ts * 1.7)); });
  anim.gondolas.forEach(function(g){ var u = (ts * 0.012 + g.userData.off) % 1; if (g.userData.dir < 0) u = 1 - u; g.userData.curve.getPointAt(u, _v3); g.position.copy(_v3); g.userData.curve.getTangentAt(u, _tan); g.rotation.y = Math.atan2(_tan.x, _tan.z); });
  if (anim.wheel){ anim.wheel.w.rotation.z = ts * 0.1; anim.wheel.cabins.forEach(function(c){ c.rotation.z = -anim.wheel.w.rotation.z; }); }
  var V = anim.vehicles;
  if (V){ var pos = V.pos, ims = {};
    for (i = 0; i < V.list.length; i++){ var v = V.list[i], R = v.R; v.s += v.dir * v.sp * dt; if (v.s < 0){ v.s = 0; v.dir = 1; } else if (v.s > R.L){ v.s = R.L; v.dir = -1; }
      roadPoint(R, v.s, vp); var fx = vp.fx * v.dir, fz = vp.fz * v.dir, off = R.w * (0.12 + 0.17 * v.l), x = vp.x - fz * off, z = vp.z + fx * off;
      _d.position.set(x, vp.y, z); _d.rotation.set(0, Math.atan2(fx, fz), 0); if (v.sc) _d.scale.copy(v.sc); else _d.scale.set(1, 1, 1); _d.updateMatrix(); v.im.setMatrixAt(v.k, _d.matrix); ims[v.im.uuid] = v.im;
      var hl = v.len / 2 + 0.01; pos[i * 6] = x + fx * hl; pos[i * 6 + 1] = vp.y + 0.06; pos[i * 6 + 2] = z + fz * hl; pos[i * 6 + 3] = x - fx * hl; pos[i * 6 + 4] = vp.y + 0.06; pos[i * 6 + 5] = z - fz * hl; }
    for (var key in ims) ims[key].instanceMatrix.needsUpdate = true;
    if (lampK > 0.01) carPts.geometry.attributes.position.needsUpdate = true; }
  var T = anim.train;
  if (T && RAIL_S){ if (T.wait > 0) T.wait -= dt; else { T.s += T.dir * 1.2 * dt; if (T.s > RAIL_S.L - 1 || T.s < 6){ T.s = clamp(T.s, 6, RAIL_S.L - 1); T.dir *= -1; T.wait = 14; } }
    for (i = 0; i < 10; i++){ roadPoint(RAIL_S, clamp(T.s - T.dir * i * 0.6, 0, RAIL_S.L), vp); _d.position.set(vp.x, vp.y + 0.02, vp.z); _d.rotation.set(0, Math.atan2(vp.fx * T.dir, vp.fz * T.dir), 0); _d.scale.copy(i ? T.kc : T.kl); _d.updateMatrix(); (i ? T.im : T.loco).setMatrixAt(i ? i - 1 : 0, _d.matrix); }
    T.im.instanceMatrix.needsUpdate = true; T.loco.instanceMatrix.needsUpdate = true; }
  if (anim.birds){ var B = anim.birds; B.list.forEach(function(q, k){ q.a += q.sp * dt; var x = q.cx + Math.cos(q.a) * q.r, z = q.cz + Math.sin(q.a) * q.r; _d.position.set(x, q.h + 0.3 * Math.sin(ts * 0.7 + q.f), z);
      _d.rotation.set(0, Math.atan2(-Math.sin(q.a) * q.sp, Math.cos(q.a) * q.sp) + Math.PI / 2, 0); _d.scale.set(1.3, 0.3 + 1.2 * Math.abs(Math.sin(ts * 7 + q.f)), 1.3); _d.updateMatrix(); B.im.setMatrixAt(k, _d.matrix); });
    B.im.instanceMatrix.needsUpdate = true; }
  anim.clouds.forEach(function(c){ c.position.x += c.userData.sp * dt; if (c.position.x > BX1 + 40) c.position.x = BX0 - 40; });
  var PS = anim.parasail;
  if (PS){ var a = ts * 0.07, bx = PS.c[0] + Math.cos(a) * 3, bz = PS.c[1] + Math.sin(a) * 10, tx = -Math.sin(a) * 3, tz = Math.cos(a) * 10, tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
    PS.boat.position.set(bx, -0.03, bz); PS.boat.rotation.y = Math.atan2(-tx, -tz);
    PS.chute.position.set(bx - tx * 2.4, 2.6 + 0.15 * Math.sin(ts), bz - tz * 2.4); PS.chute.rotation.y = Math.atan2(tx, tz);
    var lp = PS.line.geometry.attributes.position; lp.setXYZ(0, bx, 0.12, bz); lp.setXYZ(1, bx - tx * 2.4, 2.05 + 0.15 * Math.sin(ts), bz - tz * 2.4); lp.needsUpdate = true; }
  if (ring && ring.visible){ var k = ring.userData.r * (1 + 0.06 * Math.sin(ts * 3)); ring.scale.set(k, 1, k); }
}

var clock = new THREE.Clock();
function frame(now){
  requestAnimationFrame(frame);
  var rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.05), ts = clock.elapsedTime * (reduceMotion ? 0.3 : 1); frameN++;
  if (waterU) waterU.uTime.value = ts;
  if (Math.abs(tod - todTarget) > 0.003){ tod += (todTarget - tod) * Math.min(1, dt * 2.2); applyTod(tod); } else if (tod !== todTarget){ tod = todTarget; applyTod(tod); }
  updateAnim(dt * (reduceMotion ? 0.3 : 1), ts);
  crowdU.uTime.value = ts; crowdU.uCam.value.copy(camera.position); crowdU.uFogColor.value.copy(scene.fog.color); crowdU.uFogNear.value = scene.fog.near; crowdU.uFogFar.value = scene.fog.far;
  if (PLAY.on && !tween){ updatePlayer(dt); followCamera(dt, PLAY.dragging); }
  if (tween) stepTween(now || performance.now());
  controls.update(); constrain();
  var dist = camera.position.distanceTo(controls.target), nn = clamp(dist * 0.008, 0.02, 6);
  if (Math.abs(nn - camera.near) > nn * 0.15){ camera.near = nn; camera.updateProjectionMatrix(); }
  updateShadow(dist);
  updateDetail(PLAY.on && PL ? PL.x : controls.target.x, PLAY.on && PL ? PL.z : controls.target.z, PLAY.on || dist < 55);
  renderer.render(scene, camera);
  updateWeather(dt, ts, dist); updateLabels(dist); updateHud(dist); updateAudio(dt, dist); governor(rawDt);
}

/* ---------- bộ điều tốc: FPS thấp kéo dài thì hạ chất lượng từng bậc ---------- */
// Bậc 1: giảm độ phân giải. Bậc 2: tắt bóng đổ. Bậc 3: bớt một nửa người đi bộ và ghi nhớ để lần sau dựng bản LITE.
var GOV = { t:0, n:0, acc:0, level:0, wait:4 };
function governor(d){ if (document.hidden || d <= 0 || d > 0.5) return; GOV.t += d; if (GOV.t < GOV.wait) return; GOV.acc += d; GOV.n++;
  if (GOV.acc < 2.5) return; var fps = GOV.n / GOV.acc; GOV.acc = 0; GOV.n = 0;
  if (fps >= 38 || GOV.level >= 3) return; GOV.level++; GOV.t = 0; GOV.wait = 3;
  if (GOV.level === 1){ renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.7)); renderer.setSize(innerWidth, innerHeight); }
  else if (GOV.level === 2){ renderer.shadowMap.enabled = false; scene.traverse(function(o){ if (o.material && o.material.needsUpdate !== undefined) o.material.needsUpdate = true; }); }
  else { var C = anim.crowd; if (C) C.mesh.geometry.instanceCount = Math.floor(C.n / 2); try { if (!LITE) localStorage.setItem('nt-q', 'lite'); } catch (e){} }
  console.info('[chất lượng] FPS ' + fps.toFixed(0) + ' → hạ xuống bậc ' + GOV.level); }

/* ======================= BUILD SEQUENCE ======================= */
async function build(){
  await step('Đang dựng địa hình…');
  G = buildGrid(LITE ? 1.5 : 1.0);
  ROADS_S = ROADS.map(function(R){ return sampleRoad(R.pts, R.w); }); RAIL_S = sampleRoad(RAIL, 0.4, true);
  await step('Đang vẽ mặt đất…');
  var MW = Math.round(BW * 4), MH = Math.round(BD * 4), mcv = document.createElement('canvas'); mcv.width = MW; mcv.height = MH;
  var mctx = mcv.getContext('2d'); worldCtx(mctx, MW, MH); drawOverlays(mctx, true);
  var md = mctx.getImageData(0, 0, MW, MH).data, mask = new Uint8Array(MW * MH); for (var i = 0; i < MW * MH; i++) mask[i] = md[i * 4 + 3] > 40 ? 1 : 0;
  MK = function(x, z){ var px = ((x - BX0) * 4) | 0, pz = ((z - BZ0) * 4) | 0; if (px < 0 || pz < 0 || px >= MW || pz >= MH) return true; return mask[pz * MW + px] === 1; };
  var maxT = renderer.capabilities.maxTextureSize || 4096, TW = Math.min(LITE ? 2048 : 3072, maxT), TH = Math.round(TW * BD / BW);
  var gcv = document.createElement('canvas'); gcv.width = TW; gcv.height = TH; var gctx = gcv.getContext('2d'), img = gctx.createImageData(TW, TH);
  paintGround(img.data, TW, TH, G); gctx.putImageData(img, 0, 0); worldCtx(gctx, TW, TH); drawOverlays(gctx, false);
  groundTex = new THREE.CanvasTexture(gcv); groundTex.encoding = THREE.sRGBEncoding; groundTex.flipY = false; groundTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  initDetail(); terrain = buildTerrain(); water = buildWater(); buildSkirt();
  await step('Đang dựng phố xá…');
  var B = genBuildings(G, MK, LITE ? 0.55 : 1, RESORT_HOTELS); buildCity(B);
  buildLandmarks(); buildCable(); buildResort(); var bl = buildBridges();
  await step('Đang trồng cây…');
  var T = genTrees(G, MK, LITE ? 2.0 : 1.4, 1); buildVegetation(T, B);
  await step('Đang thả thuyền, cho xe chạy…');
  buildBoats(); buildTraffic(); buildLamps(bl); buildSky();
  await step('Đang thêm người đi dạo…');
  buildCrowd(); buildPlayer(B);
  ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color:'#f2592c', transparent:true, opacity:0.9, depthWrite:false, side:THREE.DoubleSide })); ring.visible = false; ring.renderOrder = 3; scene.add(ring);
  setupLM(); setupUI(); setupPlay();
  initWeather(); todTarget = tod = realTod(); applyTod(tod); syncTimeBtn();
  computeHome(); setCam(homeTarget, homeDist, HOME_PHI, HOME_TH); controls.update(); setSpin(!reduceMotion);
  window.__nt = { PL:PL, enterPlay:enterPlay, toggleMount:toggleMount, keys:function(){ return keys; }, G:G, B:B, T:T, ROADS_S:ROADS_S, RAIL_S:RAIL_S, LM:LM, anim:anim, ground:gcv, renderer:renderer, camera:camera, controls:controls, setCam:setCam, audio:AU, gov:GOV, lite:LITE, wx:WX, sunPos:sunPos };
  ready = true; loader.hidden = true; requestAnimationFrame(frame);
}
build().catch(function(e){ console.error(e); fail('Không dựng được bản đồ: ' + (e && e.message ? e.message : e)); });
