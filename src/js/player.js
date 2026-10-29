/* ======================= PLAYER: chibi rider in a T-shirt & shorts, motorbike, swimming ======================= */
var PS_ = 0.05;   // model units → world units (character ≈ 0.15 tall)
function atlasCanvas(){
  var c = document.createElement('canvas'); c.width = c.height = 256; var x = c.getContext('2d');
  var SK = '#f0c49b';
  x.fillStyle = SK; x.fillRect(0, 0, 128, 128);                                  // head skin
  var fx = 32, fy = 70;                                                         // face centre: u=0.25 (front of sphere)
  x.fillStyle = '#2a1e16'; x.beginPath(); x.ellipse(fx - 9, fy, 3.2, 4.4, 0, 0, 7); x.ellipse(fx + 9, fy, 3.2, 4.4, 0, 0, 7); x.fill();
  x.fillStyle = '#ffffff'; x.beginPath(); x.arc(fx - 8, fy - 1.6, 1.2, 0, 7); x.arc(fx + 10, fy - 1.6, 1.2, 0, 7); x.fill();
  x.strokeStyle = '#3b2418'; x.lineWidth = 2; x.beginPath(); x.moveTo(fx - 13, fy - 9); x.lineTo(fx - 5, fy - 10); x.moveTo(fx + 5, fy - 10); x.lineTo(fx + 13, fy - 9); x.stroke();
  x.strokeStyle = '#a5523f'; x.lineWidth = 2; x.beginPath(); x.arc(fx, fy + 9, 5, 0.25, Math.PI - 0.25); x.stroke();
  x.fillStyle = 'rgba(240,120,110,0.35)'; x.beginPath(); x.ellipse(fx - 15, fy + 7, 4, 2.5, 0, 0, 7); x.ellipse(fx + 15, fy + 7, 4, 2.5, 0, 0, 7); x.fill();
  x.fillStyle = '#3aa8d8'; x.fillRect(128, 0, 128, 128);                        // T-shirt
  x.fillStyle = '#fff4d6'; x.beginPath(); x.arc(192, 46, 18, Math.PI, 0); x.fill();
  x.strokeStyle = '#ffffff'; x.lineWidth = 4; x.beginPath(); for (var i = 0; i <= 64; i++){ var px = 160 + i, py = 70 + Math.sin(i / 64 * Math.PI * 3) * 5; if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke();
  x.fillStyle = '#ffffff'; x.font = '700 15px "Be Vietnam Pro", system-ui, sans-serif'; x.textAlign = 'center'; x.fillText('NHA TRANG', 192, 102);
  x.fillStyle = '#2f8fbf'; x.fillRect(128, 120, 128, 8);
  x.fillStyle = '#d98a3a'; x.fillRect(0, 128, 128, 128);                         // shorts
  x.fillStyle = '#ffffff'; x.fillRect(4, 128, 10, 128); x.fillRect(114, 128, 10, 128);
  x.fillStyle = 'rgba(0,0,0,0.15)'; x.fillRect(0, 128, 128, 12);
  x.fillStyle = SK; x.fillRect(128, 128, 64, 64);                                // skin swatch
  x.fillStyle = '#1c1611'; x.fillRect(192, 128, 64, 64);                         // hair swatch
  x.fillStyle = '#2b6fd6'; x.fillRect(128, 192, 64, 64);                         // flip-flops
  x.fillStyle = '#3aa8d8'; x.fillRect(192, 192, 64, 64);                         // plain shirt
  return c; }
function rectUV(px0, py0, px1, py1){ return [px0 / 256, 1 - py1 / 256, px1 / 256, 1 - py0 / 256]; }
var AT = { head:rectUV(0, 0, 128, 128), shirt:rectUV(128, 0, 256, 128), shorts:rectUV(0, 128, 128, 256), skin:rectUV(136, 136, 184, 184), hair:rectUV(200, 136, 248, 184), sandal:rectUV(136, 200, 184, 248), plain:rectUV(200, 200, 248, 248) };
function uvInto(geo, r, faces){ var uv = geo.attributes.uv;
  for (var i = 0; i < uv.count; i++){ var rr = r; if (faces){ var f = Math.floor(i / 4); rr = faces[f] || r; } uv.setXY(i, rr[0] + uv.getX(i) * (rr[2] - rr[0]), rr[1] + uv.getY(i) * (rr[3] - rr[1])); }
  uv.needsUpdate = true; return geo; }

var PL = null, PLAY = { on:false }, keys = {}, joy = { x:0, y:0, on:false }, boostBtn = false;
var COL = { map:new Map(), obbs:[], circ:[], stamp:0 }, DECK = new Map();
function ckey(ix, iz){ return (ix + 2000) * 5000 + (iz + 2000); }
function colAddOBB(x, z, w, d, r){ var i = COL.obbs.length; COL.obbs.push({ x:x, z:z, hw:w / 2, hd:d / 2, c:Math.cos(r), s:Math.sin(r), m:0 });
  var rad = Math.hypot(w, d) / 2; for (var ix = Math.floor(x - rad); ix <= Math.floor(x + rad); ix++) for (var iz = Math.floor(z - rad); iz <= Math.floor(z + rad); iz++){ var k = ckey(ix, iz), a = COL.map.get(k); if (!a){ a = []; COL.map.set(k, a); } a.push(i); } }
function buildCollision(B){
  [B.tubes, B.towers, B.mids, B.villas].forEach(function(list){ list.forEach(function(b){ colAddOBB(b.x, b.z, b.w, b.d, b.r); }); });
  [['ponagar', 1.3], ['cho-dam', 1.05], ['nha-tho', 0.4], ['tram-huong', 0.3], ['vien-hdh', 1.0], ['yersin', 0.55], ['bao-dai', 0.7], ['hon-do', 0.5], ['hon-chong', 0.8]].forEach(function(c){ var p = LMP[c[0]]; colAddOBB(p[0], p[1], c[1] * 1.6, c[1] * 1.6, 0.4); });
  [LMP.pagoda, LMP.buddha].forEach(function(p){ colAddOBB(p[0], p[1], 0.75, 0.6, 0.1); });
  [LMP.cableA, LMP.cableB].forEach(function(p){ colAddOBB(p[0], p[1], 0.45, 0.45, 0); });
  // mặt cầu (br) và đường đắp qua chỗ thấp (cw) đều là mặt đường xe chạy được
  ROADS_S.concat([RAIL_S]).forEach(function(R){ R.pts.forEach(function(p){ if (!p.br && !p.cw) return; var k = ckey(Math.floor(p.x), Math.floor(p.z)), a = DECK.get(k); if (!a){ a = []; DECK.set(k, a); } a.push({ x:p.x, z:p.z, y:p.y, r:Math.max(0.3, (R.rail ? 0.5 : R.w + 0.16) / 2 + 0.04) }); }); });
}
function deckAt(x, z){ var best = null, ix = Math.floor(x), iz = Math.floor(z);
  for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++){ var L = DECK.get(ckey(ix + a, iz + b)); if (!L) continue;
    for (var i = 0; i < L.length; i++){ var q = L[i]; if (Math.hypot(q.x - x, q.z - z) < q.r && (best === null || q.y > best)) best = q.y; } }
  for (var j = 0; j < JETTIES.length; j++){ var J = JETTIES[j], dx = x - J[0], dz = z - J[1], c = Math.cos(J[4]), s = Math.sin(J[4]), lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < J[2] + 0.02 && Math.abs(lz) < J[3] + 0.02) best = Math.max(best === null ? -9 : best, 0.6); }
  return best; }
function groundAt(x, z){ var h = G.hAt(x, z), d = deckAt(x, z); return d !== null && d > h ? { y:d + 0.02, deck:true, h:h } : { y:h, deck:false, h:h }; }
function collide(p, rad){ var hit = false, ix = Math.floor(p.x), iz = Math.floor(p.z); COL.stamp++;
  for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++){ var L = COL.map.get(ckey(ix + a, iz + b)); if (!L) continue;
    for (var i = 0; i < L.length; i++){ var o = COL.obbs[L[i]]; if (o.m === COL.stamp) continue; o.m = COL.stamp;
      var dx = p.x - o.x, dz = p.z - o.z, lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c, qx = clamp(lx, -o.hw, o.hw), qz = clamp(lz, -o.hd, o.hd), ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
      if (d2 >= rad * rad) continue; hit = true;
      if (d2 > 1e-10){ var d = Math.sqrt(d2), k = (rad - d) / d; lx += ex * k; lz += ez * k; }
      else { var px = o.hw - Math.abs(lx), pz = o.hd - Math.abs(lz); if (px < pz) lx = (lx < 0 ? -1 : 1) * (o.hw + rad); else lz = (lz < 0 ? -1 : 1) * (o.hd + rad); }
      p.x = o.x + lx * o.c + lz * o.s; p.z = o.z - lx * o.s + lz * o.c; } }
  return hit; }

function buildCharacter(){
  var tex = new THREE.CanvasTexture(atlasCanvas()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  var M = new THREE.MeshStandardMaterial({ map:tex, roughness:0.75 });
  function part(geo, r, faces){ var m = new THREE.Mesh(uvInto(geo, r, faces), M); m.castShadow = true; m.receiveShadow = true; return m; }
  var root = new THREE.Group(), body = new THREE.Group(); body.position.y = 1.2; root.add(body);
  var hips = new THREE.Group(); hips.position.y = -0.2; body.add(hips);
  var torso = part(new THREE.BoxGeometry(0.86, 0.78, 0.5), AT.plain, [AT.plain, AT.plain, AT.plain, AT.plain, AT.shirt, AT.plain]); torso.position.y = 0.22; body.add(torso);
  var shortsTop = part(new THREE.BoxGeometry(0.84, 0.18, 0.5), AT.shorts); shortsTop.position.y = -0.24; body.add(shortsTop);
  var legs = [-1, 1].map(function(sd){ var g = new THREE.Group(); g.position.set(sd * 0.22, 0, 0); hips.add(g);
    var sh = part(new THREE.BoxGeometry(0.36, 0.38, 0.42), AT.shorts); sh.position.y = -0.17; g.add(sh);
    var lg = part(new THREE.CylinderGeometry(0.12, 0.11, 0.5, 8), AT.skin); lg.position.y = -0.58; g.add(lg);
    var ft = part(new THREE.BoxGeometry(0.24, 0.07, 0.38), AT.sandal); ft.position.set(0, -0.86, 0.06); g.add(ft); return g; });
  var arms = [-1, 1].map(function(sd){ var g = new THREE.Group(); g.position.set(sd * 0.52, 0.52, 0); body.add(g);
    var sl = part(new THREE.CylinderGeometry(0.16, 0.15, 0.28, 8), AT.plain); sl.position.y = -0.1; g.add(sl);
    var ar = part(new THREE.CylinderGeometry(0.1, 0.09, 0.42, 8), AT.skin); ar.position.y = -0.42; g.add(ar);
    var hd = part(new THREE.SphereGeometry(0.11, 8, 6), AT.skin); hd.position.y = -0.66; g.add(hd); return g; });
  var head = new THREE.Group(); head.position.y = 0.95; body.add(head);
  var face = part(new THREE.SphereGeometry(0.6, 24, 16), AT.head); face.scale.set(1, 0.95, 0.95); head.add(face);
  var hair = part(new THREE.SphereGeometry(0.64, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), AT.hair); hair.position.set(0, 0.05, -0.04); hair.rotation.x = -0.25; head.add(hair);
  var fringe = part(new THREE.BoxGeometry(0.9, 0.16, 0.2), AT.hair); fringe.position.set(0, 0.38, 0.4); fringe.rotation.x = 0.5; head.add(fringe);
  var ears = [-1, 1].map(function(sd){ var e = part(new THREE.SphereGeometry(0.12, 8, 6), AT.skin); e.position.set(sd * 0.58, -0.02, 0); head.add(e); return e; });
  root.scale.setScalar(PS_);
  return { root:root, body:body, hips:hips, legs:legs, arms:arms, head:head, torso:torso }; }

function buildBike(){
  var g = new THREE.Group(), red = '#d7262f', dark = '#202326', chrome = '#c9ced4';
  var wheelGeo = new THREE.TorusGeometry(0.4, 0.13, 8, 20), wheels = [];
  [1.12, -1.1].forEach(function(z){ var w = new THREE.Group(); w.position.set(0, 0.45, z); var t = new THREE.Mesh(wheelGeo, mat(dark)); t.rotation.y = Math.PI / 2; w.add(t);
    var hub = cyl(0.16, 0.16, 0.22, 10, chrome); hub.rotation.z = Math.PI / 2; w.add(hub);
    for (var i = 0; i < 3; i++){ var sp = box(0.04, 0.62, 0.06, chrome); sp.rotation.x = i * Math.PI / 3; w.add(sp); }
    g.add(w); wheels.push(w); });
  var steer = new THREE.Group(); steer.position.set(0, 0, 0.92); g.add(steer); steer.add(wheels[0]); wheels[0].position.set(0, 0.45, 0.2);
  [-0.14, 0.14].forEach(function(x){ var f = cyl(0.045, 0.045, 1.3, 6, chrome); f.position.set(x, 1.0, 0.08); f.rotation.x = -0.32; steer.add(f); });
  var bar = cyl(0.05, 0.05, 1.1, 8, dark); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.62, -0.12); steer.add(bar);
  var hc = box(0.5, 0.26, 0.36, red); hc.position.set(0, 1.58, -0.02); steer.add(hc);
  var lampM = glowMat('#fff6d8', '#ffe9a8', 0.25, 2.5), lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), lampM); lamp.position.set(0, 1.55, 0.18); steer.add(lamp);
  [-0.5, 0.5].forEach(function(x){ var mr = box(0.14, 0.1, 0.04, dark); mr.position.set(x, 1.95, -0.1); steer.add(mr); var st = cyl(0.02, 0.02, 0.32, 4, dark); st.position.set(x * 0.92, 1.78, -0.1); steer.add(st); });
  var fender = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.06, 6, 12, Math.PI * 0.7), mat(red)); fender.rotation.y = Math.PI / 2; fender.rotation.x = Math.PI * 0.2; fender.position.set(0, 0.47, 0.2); steer.add(fender);
  var shield = box(0.62, 0.8, 0.12, red); shield.position.set(0, 1.0, 0.62); shield.rotation.x = -0.25; g.add(shield);
  var board = box(0.56, 0.08, 0.95, '#3a3e44'); board.position.set(0, 0.55, 0.05); g.add(board);
  var frame = box(0.22, 0.2, 1.2, dark); frame.position.set(0, 0.62, 0.0); frame.rotation.x = 0.1; g.add(frame);
  var rear = box(0.62, 0.55, 1.05, red); rear.position.set(0, 0.98, -0.72); g.add(rear);
  var seat = box(0.5, 0.16, 1.05, '#1b1c1e'); seat.position.set(0, 1.32, -0.62); g.add(seat);
  var engine = box(0.4, 0.35, 0.5, '#5b6066'); engine.position.set(0.04, 0.55, -0.6); g.add(engine);
  var pipe = cyl(0.07, 0.07, 0.95, 8, chrome); pipe.rotation.x = Math.PI / 2; pipe.position.set(0.3, 0.48, -0.85); g.add(pipe);
  var rf = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.06, 6, 12, Math.PI * 0.6), mat(red)); rf.rotation.y = Math.PI / 2; rf.rotation.x = Math.PI * 0.35; rf.position.set(0, 0.47, -1.1); g.add(rf);
  var tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.06), glowMat('#ff4d4d', '#ff2020', 0.4, 2.2)); tail.position.set(0, 1.12, -1.26); g.add(tail);
  var plate = box(0.3, 0.18, 0.03, '#f5f5f0'); plate.position.set(0, 0.86, -1.3); g.add(plate);
  g.traverse(function(o){ if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  var holder = new THREE.Group(); holder.add(g); holder.scale.setScalar(PS_);
  var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map:radialTex('rgba(255,244,214,1)', 'rgba(255,244,214,0)'), color:'#fff2cc', transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:0 }));
  glow.scale.set(0.12, 0.12, 0.12); glow.position.set(0, 1.55 * PS_, 1.12 * PS_); holder.add(glow);
  return { root:holder, inner:g, steer:steer, wheels:wheels, glow:glow }; }

function spawnPoint(){ var zT = LMP['tram-huong'][1] + 3.0; return { x:coastX(zT) - 2.2, z:zT }; }
function buildPlayer(B){
  buildCollision(B);
  var ch = buildCharacter(), bk = buildBike(), sp = spawnPoint();
  scene.add(ch.root); scene.add(bk.root);
  PL = { ch:ch, bk:bk, mode:'walk', x:sp.x, z:sp.z, y:G.hAt(sp.x, sp.z), yaw:Math.PI, speed:0, vy:0, phase:0, steer:0, bike:{ x:sp.x - 0.95, z:sp.z, yaw:Math.PI, speed:0 }, msgT:0, lean:0, lastInput:0 };
  var bz = sp.z, bx = coastX(bz) - 2.6 + 0.12; PL.bike.x = bx; PL.bike.z = bz;
  placeBikeIdle(); placeChar(0, 0); loadKenneyChar();
}
/* ---------- nhân vật Kenney có xương (Mini Characters, CC0) ---------- */
// Nạp bất đồng bộ từ GLB nhúng trong character.js. Trong lúc chờ, hoặc nếu không tải được GLTFLoader, vẫn dùng nhân vật khối cũ.
// Mô hình được gắn vào cùng C.root nên mọi chỗ đặt vị trí, lên xuống xe giữ nguyên; tay chân cũ vẫn được xoay nhưng đã ẩn.
function loadKenneyChar(){ if (!THREE.GLTFLoader || typeof CHAR_GLB === 'undefined') return;
  try { new THREE.GLTFLoader().parse(b64arr(CHAR_GLB.player, Uint8Array).buffer, '', function(gl){
    var m = gl.scene, bb = new THREE.Box3().setFromObject(m), s = 3.1 / Math.max(0.001, bb.max.y - bb.min.y); m.scale.setScalar(s); m.position.y = -bb.min.y * s;
    m.traverse(function(o){ if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (o.material){ o.material.metalness = 0; o.material.roughness = 0.75; } } });
    var C = PL.ch; C.root.children.forEach(function(c){ c.visible = false; }); C.root.add(m);
    var K = C.k = { model:m, mixer:new THREE.AnimationMixer(m), act:{}, cur:'' };
    gl.animations.forEach(function(a){ var ac = K.mixer.clipAction(a); if (a.name === 'jump'){ ac.setLoop(THREE.LoopOnce); ac.clampWhenFinished = true; } K.act[a.name] = ac; });
  }, function(e){ console.warn('Không nạp được nhân vật Kenney', e); }); } catch (e){ console.warn(e); } }
function animKenney(dt){ var K = PL.ch.k; if (!K) return; var want = 'idle', ts = 1;
  var air = PL.mode === 'walk' && PL.y > groundAt(PL.x, PL.z).y + 0.01;
  if (PL.mode === 'bike') want = K.act.drive ? 'drive' : 'sit';
  else if (PL.mode === 'swim'){ want = 'sprint'; ts = 0.45 + PL.speed * 0.25; }
  else if (air) want = PL.vy > 0 ? 'jump' : 'fall';
  else if (PL.speed > 0.7){ want = 'sprint'; ts = clamp(PL.speed / 1.1, 0.6, 1.4); }
  else if (PL.speed > 0.03){ want = 'walk'; ts = clamp(PL.speed / 0.5, 0.5, 1.5); }
  if (K.cur !== want && K.act[want]){ K.act[want].reset().fadeIn(0.15).play(); if (K.act[K.cur]) K.act[K.cur].fadeOut(0.15); K.cur = want; }
  if (K.act[want]) K.act[want].timeScale = ts;
  K.model.rotation.x = PL.mode === 'swim' ? 1.35 : 0; K.model.position.z = PL.mode === 'swim' ? -1.2 : 0;
  K.mixer.update(dt); }
function placeBikeIdle(){ var b = PL.bike, g = groundAt(b.x, b.z); PL.bk.root.position.set(b.x, g.y, b.z); PL.bk.root.rotation.set(0, b.yaw, 0.12, 'YXZ'); }
function placeChar(dt, sp){ var C = PL.ch; C.root.position.set(PL.x, PL.y, PL.z); C.root.rotation.set(0, PL.yaw, 0); }

var _f = { x:0, z:0 };
function setMsg(t){ var el = document.getElementById('playMsg'); if (!el) return; el.textContent = t; el.hidden = !t; PL.msgT = t ? 2.6 : 0; }
function inputVec(){ var f = 0, s = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1; if (keys.KeyD || keys.ArrowRight) s += 1; if (keys.KeyA || keys.ArrowLeft) s -= 1;
  if (joy.on){ f += joy.y; s += joy.x; } return { f:clamp(f, -1, 1), s:clamp(s, -1, 1), run:!!(keys.ShiftLeft || keys.ShiftRight || boostBtn) }; }
function toggleMount(){ if (!PL) return;
  if (PL.mode === 'bike'){ var b = PL.bike, rx = -Math.cos(b.yaw) * 0.16, rz = Math.sin(b.yaw) * 0.16, cand = [[b.x + rx, b.z + rz], [b.x - rx, b.z - rz], [b.x, b.z]];
    for (var i = 0; i < cand.length; i++){ var p = { x:cand[i][0], z:cand[i][1] }, g = groundAt(p.x, p.z); if (g.y > 0.02 || g.deck){ collide(p, 0.045); PL.x = p.x; PL.z = p.z; break; } }
    PL.mode = 'walk'; b.speed = 0; PL.speed = 0; PL.yaw = b.yaw; scene.add(PL.ch.root); PL.ch.root.scale.setScalar(PS_); PL.y = groundAt(PL.x, PL.z).y; placeBikeIdle(); syncPlayBtns(); return; }
  if (PL.mode === 'swim'){ setMsg('Lên bờ rồi mới lên xe được'); return; }
  var d = Math.hypot(PL.bike.x - PL.x, PL.bike.z - PL.z);
  if (d > 0.4){ var g2 = groundAt(PL.x + Math.sin(PL.yaw) * 0.2, PL.z + Math.cos(PL.yaw) * 0.2), np = { x:PL.x + Math.sin(PL.yaw) * 0.2, z:PL.z + Math.cos(PL.yaw) * 0.2 };
    if (g2.y < 0.03 && !g2.deck){ setMsg('Chỗ này không đậu xe được'); return; }
    collide(np, 0.07); PL.bike.x = np.x; PL.bike.z = np.z; PL.bike.yaw = PL.yaw; setMsg('Xe đã tới'); }
  PL.mode = 'bike'; PL.speed = 0; PL.yaw = PL.bike.yaw; PL.x = PL.bike.x; PL.z = PL.bike.z; PL.bk.inner.add(PL.ch.root);
  PL.ch.root.position.set(0, 0.36, -0.42); PL.ch.root.rotation.set(0, 0, 0); PL.ch.root.scale.setScalar(1); syncPlayBtns(); }

function updatePlayer(dt){
  if (!PL) return; var inp = inputVec(), C = PL.ch, t = performance.now() / 1000;
  if (PL.msgT > 0){ PL.msgT -= dt; if (PL.msgT <= 0) setMsg(''); }
  if (Math.abs(inp.f) + Math.abs(inp.s) > 0.05) PL.lastInput = t;
  if (PL.mode === 'bike'){
    var b = PL.bike, maxS = inp.run ? 2.4 : 1.6, target = inp.f > 0.05 ? maxS * inp.f : (inp.f < -0.05 ? (b.speed > 0.05 ? 0 : -0.35) : 0);
    var acc = inp.f < -0.05 && b.speed > 0.05 ? 3.2 : (inp.f > 0.05 ? 1.1 : 0.9);
    b.speed += clamp(target - b.speed, -acc * dt, acc * dt);
    PL.steer += (-inp.s - PL.steer) * Math.min(1, dt * 6);
    var turn = PL.steer * 2.0 * Math.max(Math.abs(inp.f) > 0.05 ? 0.45 : 0, clamp(Math.abs(b.speed) / 0.5, 0, 1)) * (b.speed >= 0 ? 1 : -1) / (1 + Math.abs(b.speed) * 0.25);
    b.yaw += turn * dt;
    var nx = b.x + Math.sin(b.yaw) * b.speed * dt, nz = b.z + Math.cos(b.yaw) * b.speed * dt, g = groundAt(nx, nz);
    if (!inBoard(nx, nz, 3)){ b.speed = 0; setMsg('Hết bản đồ rồi'); }
    else if (g.y < 0.04 && !g.deck){ b.speed = 0; if (PL.msgT <= 0) setMsg('Xe máy không chạy được dưới nước'); }
    else if (G.slopeAt(nx, nz) > 1.6 && g.y > groundAt(b.x, b.z).y){ b.speed *= 0.5; if (PL.msgT <= 0) setMsg('Dốc quá, xe không leo nổi'); }
    else { var p = { x:nx, z:nz }; if (collide(p, 0.065)) b.speed *= 0.92; b.x = p.x; b.z = p.z; }
    var gy2 = groundAt(b.x, b.z).y, ahead = groundAt(b.x + Math.sin(b.yaw) * 0.08, b.z + Math.cos(b.yaw) * 0.08).y, behind = groundAt(b.x - Math.sin(b.yaw) * 0.08, b.z - Math.cos(b.yaw) * 0.08).y;
    var pitch = -Math.atan2(ahead - behind, 0.16);
    PL.lean += ((-PL.steer * clamp(b.speed / 1.2, 0, 1) * 0.42) - PL.lean) * Math.min(1, dt * 5);
    PL.bk.root.position.set(b.x, gy2, b.z); PL.bk.root.rotation.set(pitch, b.yaw, PL.lean, 'YXZ');
    PL.bk.steer.rotation.y = PL.steer * 0.45; PL.bk.wheels.forEach(function(w){ w.rotation.x += b.speed * dt / 0.021; });
    PL.x = b.x; PL.z = b.z; PL.y = gy2; PL.yaw = b.yaw; PL.speed = b.speed;
    C.body.rotation.set(0.32, 0, 0); C.body.position.y = 1.2;
    C.legs.forEach(function(l, i){ l.rotation.set(-1.05, 0, (i ? -1 : 1) * 0.14); }); C.arms.forEach(function(a, i){ a.rotation.set(-1.25, 0, (i ? -1 : 1) * -0.22); });
    C.head.rotation.set(-0.1, PL.steer * 0.3, 0);
  } else {
    var th = controls.getAzimuthalAngle(), fx = -Math.sin(th), fz = -Math.cos(th), rx = Math.cos(th), rz = -Math.sin(th);
    var mx = fx * inp.f + rx * inp.s, mz = fz * inp.f + rz * inp.s, ml = Math.hypot(mx, mz);
    var swim = PL.mode === 'swim', spd = swim ? (inp.run ? 2.8 : 1.2) : (inp.run ? 1.1 : 0.5);   // đi bộ, chạy luôn chậm hơn xe máy (1.6 / 2.4)
    var tgt = ml > 0.05 ? spd * Math.min(1, ml) : 0; PL.speed += (tgt - PL.speed) * Math.min(1, dt * 8);
    if (ml > 0.05){ var want = Math.atan2(mx, mz), dy = Math.atan2(Math.sin(want - PL.yaw), Math.cos(want - PL.yaw)); PL.yaw += dy * Math.min(1, dt * 10); }
    if (PL.speed > 0.001){ var np = { x:PL.x + Math.sin(PL.yaw) * PL.speed * dt, z:PL.z + Math.cos(PL.yaw) * PL.speed * dt };
      if (!inBoard(np.x, np.z, 3)){ np.x = PL.x; np.z = PL.z; }
      collide(np, 0.045); PL.x = np.x; PL.z = np.z; }
    var gg = groundAt(PL.x, PL.z), floorY = gg.y;
    if (!gg.deck && gg.y < -0.07){ if (PL.mode !== 'swim'){ PL.mode = 'swim'; syncPlayBtns(); } }
    else if (PL.mode === 'swim' && (gg.y > -0.05 || gg.deck)){ PL.mode = 'walk'; syncPlayBtns(); }
    if (PL.mode === 'swim'){ PL.vy = 0; PL.y += (-0.045 - PL.y) * Math.min(1, dt * 6); }
    else { if ((keys.Space) && PL.y <= floorY + 0.002 && PL.vy <= 0) PL.vy = 0.55; PL.vy -= 2.6 * dt; PL.y += PL.vy * dt; if (PL.y <= floorY){ PL.y = floorY; PL.vy = 0; } }
    PL.phase += dt * (PL.mode === 'swim' ? 5 + PL.speed * 5 : 6 + PL.speed * 22) * (PL.speed > 0.02 || PL.mode === 'swim' ? 1 : 0.15);
    var s = Math.sin(PL.phase), amp = clamp(PL.speed / 0.5, 0, 1.4);
    if (PL.mode === 'swim'){ C.body.rotation.set(1.3, 0, Math.sin(PL.phase * 0.5) * 0.15); C.body.position.y = 0.55;
      C.arms.forEach(function(a, i){ a.rotation.set(-(PL.phase + i * Math.PI) % (Math.PI * 2), 0, (i ? -1 : 1) * 0.15); });
      C.legs.forEach(function(l, i){ l.rotation.set(Math.sin(PL.phase * 2.2 + i * Math.PI) * 0.35, 0, 0); }); C.head.rotation.set(-0.9, 0, 0); }
    else { C.body.rotation.set(0.05 * amp, 0, 0); C.body.position.y = 1.2 + Math.abs(s) * 0.06 * amp;
      C.legs.forEach(function(l, i){ l.rotation.set((i ? 1 : -1) * s * 0.75 * amp, 0, 0); }); C.arms.forEach(function(a, i){ a.rotation.set((i ? -1 : 1) * s * 0.7 * amp, 0, (i ? -1 : 1) * 0.08); });
      C.head.rotation.set(0, 0, Math.sin(t * 1.3) * 0.03 * (1 - Math.min(1, amp))); }
    C.root.position.set(PL.x, PL.y, PL.z); C.root.rotation.set(0, PL.yaw, 0);
  }
  animKenney(dt);
  var lit = lampK > 0.01; PL.bk.glow.material.opacity = lampK; PL.bk.glow.visible = lit;
  var spEl = document.getElementById('speedo'); if (spEl){ if (PL.mode === 'bike'){ spEl.hidden = false; spEl.firstChild.textContent = String(Math.round(Math.abs(PL.bike.speed) / 2.4 * 70)); } else spEl.hidden = true; }
}
function followCamera(dt, dragging){
  var tg = controls.target, want = new THREE.Vector3(PL.x, PL.y + 0.09, PL.z), d = want.clone().sub(tg), k = 1 - Math.exp(-dt * 12);
  d.multiplyScalar(k); tg.add(d); camera.position.add(d);
  if (PL.mode === 'bike' && Math.abs(PL.bike.speed) > 0.25 && !dragging && performance.now() / 1000 - PLAY.lastDrag > 1.2){
    var off = camera.position.clone().sub(tg), r = Math.hypot(off.x, off.z), th = Math.atan2(off.x, off.z), wantTh = PL.bike.yaw + Math.PI, dth = Math.atan2(Math.sin(wantTh - th), Math.cos(wantTh - th));
    th += dth * Math.min(1, dt * 1.6); camera.position.x = tg.x + Math.sin(th) * r; camera.position.z = tg.z + Math.cos(th) * r; }
}
function teleportTo(L){ if (!PL) return; var c = L.anchor, best = null;
  for (var r = 0.8; r < 14 && !best; r += 0.6) for (var a = 0; a < 16; a++){ var x = c.x + Math.cos(a / 16 * 6.283) * r, z = c.z + Math.sin(a / 16 * 6.283) * r, g = groundAt(x, z);
    if (inBoard(x, z, 4) && g.y > 0.3 && G.slopeAt(x, z) < 0.6){ var p = { x:x, z:z }; if (!collide(p, 0.09)){ best = p; break; } } }
  if (!best){ setMsg('Không tìm được chỗ đứng gần đó'); return; }
  var dx = best.x - PL.x, dz = best.z - PL.z;
  if (PL.mode === 'bike'){ PL.bike.x = best.x; PL.bike.z = best.z; PL.bike.speed = 0; } else { PL.x = best.x; PL.z = best.z; PL.mode = 'walk'; PL.bike.x = best.x + 0.25; PL.bike.z = best.z; placeBikeIdle(); }
  PL.x = best.x; PL.z = best.z; PL.y = groundAt(best.x, best.z).y;
  controls.target.x += dx; controls.target.z += dz; camera.position.x += dx; camera.position.z += dz; DP.valid = false; syncPlayBtns(); }
function syncPlayBtns(){ var b = document.getElementById('btnMount'); if (!b || !PL) return; b.textContent = PL.mode === 'bike' ? 'Xuống xe' : (Math.hypot(PL.bike.x - PL.x, PL.bike.z - PL.z) > 0.4 ? 'Gọi xe' : 'Lên xe'); }
