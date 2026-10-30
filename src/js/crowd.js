import { THREE } from './three.js';
import { ST } from '../state.js';
import { DIST, OSM, P, coastX, mulberry32, toLocal, toWorld } from './geo.js';
import { LITE, LMP, anim, scene } from './scene.js';
import { CROWD_SHEET, KENNEY_ROWS } from './crowd-sheet.js';
/* ======================= CROWD: 8-direction sprites on GPU billboards ======================= */
var SPR = { cw:40, ch:60, cols:32, rows:12 };
var PEOPLE = [
  { skin:'#f1c7a1', hair:'#1d1a18', top:'#ffffff', bot:'#2f5fa8', legs:'shorts' },
  { skin:'#f3cfae', hair:'#141210', top:'#fbfbf6', bot:'#fbfbf6', legs:'pants', aodai:true, hat:'nonla', long:true },
  { skin:'#eec29c', hair:'#2a1f18', top:'#ffd23f', bot:'#5b7fb5', legs:'shorts', long:true },
  { skin:'#d9a57c', hair:'#1b1714', top:'#e0473a', bot:'#c8b48a', legs:'shorts', hat:'cap', hatc:'#2457a6' },
  { skin:'#e8b892', hair:'#151210', top:'#f29fb8', bot:'#26262a', legs:'pants', hat:'nonla', long:true },
  { skin:'#f2c9a5', hair:'#231c16', top:'#3fae6b', bot:'#d6453a', legs:'shorts', kid:true, stripe:'#ffffff' },
  { skin:'#f6d8c4', hair:'#c79a4f', top:'#f08a3c', bot:'#e3d6b8', legs:'shorts', hat:'bucket', hatc:'#f2ead6', flower:true },
  { skin:'#f3cfae', hair:'#141210', top:'#c8323b', bot:'#fbfbf6', legs:'pants', aodai:true, long:true },
  { skin:'#d6a07a', hair:'#191512', top:'#30343c', bot:'#3c5a86', legs:'pants' },
  { skin:'#f7dcc8', hair:'#7a4b2a', top:'#1fa5a5', bot:'#1fa5a5', legs:'bare', hat:'bucket', hatc:'#fff3d6', long:true },
  { skin:'#d2a07c', hair:'#141210', top:'#8a6a4a', bot:'#2b2b2b', legs:'pants', hat:'nonla', pole:true },
  { swim:true }
];
function drawPerson(x, cx0, cy0, V, d, f){
  var th = d * Math.PI / 4, ct = Math.cos(th), st = Math.sin(th), ph = f / 4 * Math.PI * 2, k = (V.kid ? 0.74 : 1) * 0.86;
  function pr(px, py, pz){ return { x:cx0 + (px * ct + pz * st) * k, y:cy0 - py * k, z:-px * st + pz * ct }; }
  function line(a, b, w, c){ x.strokeStyle = c; x.lineWidth = w * k; x.lineCap = 'round'; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); }
  if (V.swim){
    var wl = cy0 - 7; x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.ellipse(cx0, wl, 11, 2.6, 0, 0, Math.PI * 2); x.fill();
    var sh = f % 2 ? 1 : -1, ha = pr(0, 9, 0);
    line(pr(-6, 4, 0), pr(-9, 4 + (sh > 0 ? 8 : 1), 3), 3.4, '#e8b892'); line(pr(6, 4, 0), pr(9, 4 + (sh > 0 ? 1 : 8), 3), 3.4, '#e8b892');
    x.fillStyle = '#e8b892'; x.beginPath(); x.ellipse(cx0, wl - 1, 7, 3, 0, Math.PI, 0); x.fill();
    x.fillStyle = '#e8b892'; x.beginPath(); x.arc(ha.x, ha.y - 3, 6.5, 0, Math.PI * 2); x.fill();
    x.fillStyle = d % 2 ? '#1a1612' : '#5a3a20'; x.beginPath(); x.arc(ha.x - st * 1.2, ha.y - 5, 6.6, Math.PI * 1.05, Math.PI * 1.95); x.fill();
    if (ct > 0.1){ x.fillStyle = '#222'; x.fillRect(ha.x + st * 3 - 2.3 * ct - 0.8, ha.y - 4, 1.6, 1.6); x.fillRect(ha.x + st * 3 + 2.3 * ct - 0.8, ha.y - 4, 1.6, 1.6); }
    return; }
  var lift = function(p){ return Math.max(0, p) * 2.4; };
  var sw = Math.sin(ph), lF = pr(-3.4, lift(Math.cos(ph)), sw * 6), rF = pr(3.4, lift(-Math.cos(ph)), -sw * 6), lH = pr(-3.6, 23, 0), rH = pr(3.6, 23, 0);
  var lS = pr(-6.6, 39, 0), rS = pr(6.6, 39, 0), lHa = pr(-8, 25, -sw * 5), rHa = pr(8, 25, sw * 5), head = pr(0, 48, 0);
  var parts = [];
  function leg(h, ft, side){ parts.push({ z:(h.z + ft.z) / 2 - 0.5, fn:function(){
    var skinLeg = V.legs === 'pants' ? V.bot : V.skin; line(h, ft, 4.6, skinLeg);
    if (V.legs === 'shorts'){ var m = { x:h.x + (ft.x - h.x) * 0.42, y:h.y + (ft.y - h.y) * 0.42 }; line(h, m, 5.4, V.bot); }
    x.fillStyle = V.legs === 'bare' ? V.skin : '#3b3b3b'; x.beginPath(); x.ellipse(ft.x + st * 1.5, ft.y, 2.6 * k, 1.5 * k, 0, 0, Math.PI * 2); x.fill(); } }); }
  function arm(s, hd){ parts.push({ z:(s.z + hd.z) / 2 + (s.z < 0 ? -1 : 0.6), fn:function(){ line(s, hd, 3.6, V.skin); var m = { x:s.x + (hd.x - s.x) * 0.35, y:s.y + (hd.y - s.y) * 0.35 }; if (V.legs !== 'bare') line(s, m, 4.6, V.top); } }); }
  leg(lH, lF); leg(rH, rF); arm(lS, lHa); arm(rS, rHa);
  parts.push({ z:0, fn:function(){ var w = (13 * Math.abs(ct) + 8 * Math.abs(st)) * k, top = cy0 - 41 * k, bottom = cy0 - (V.aodai ? 9 : 21) * k;
    if (V.aodai){ x.fillStyle = V.top; x.beginPath(); x.moveTo(cx0 - w / 2, top + 3); x.lineTo(cx0 + w / 2, top + 3); x.lineTo(cx0 + w / 2 + 2, bottom); x.lineTo(cx0 - w / 2 - 2, bottom); x.closePath(); x.fill(); }
    x.fillStyle = V.legs === 'bare' ? V.top : V.top; roundRect(cx0 - w / 2, top, w, (V.aodai ? 16 : 20) * k, 4 * k); x.fill();
    if (V.legs !== 'bare' && !V.aodai){ x.fillStyle = V.bot; x.fillRect(cx0 - w / 2, cy0 - 24 * k, w, 4 * k); }
    if (V.stripe){ x.fillStyle = V.stripe; for (var i = 0; i < 3; i++) x.fillRect(cx0 - w / 2, top + (5 + i * 5) * k, w, 1.6 * k); }
    if (V.flower){ x.fillStyle = '#ffe066'; for (var j = 0; j < 4; j++) x.fillRect(cx0 - w / 2 + 2 + (j * 5) % Math.max(1, w - 3), top + 4 + j * 4, 2.2, 2.2); }
    x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 1; roundRect(cx0 - w / 2, top, w, (V.aodai ? 16 : 20) * k, 4 * k); x.stroke(); } });
  if (V.pole){ var pa = pr(-15, 41, 0), pb = pr(15, 41, 0); parts.push({ z:0.3, fn:function(){ line(pa, pb, 1.6, '#8a6a3a');
    [pa, pb].forEach(function(p){ line(p, { x:p.x, y:p.y + 12 }, 0.8, '#6b5a3a'); x.fillStyle = '#c9a25c'; x.beginPath(); x.ellipse(p.x, p.y + 15, 5, 3.4, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#e8d07a'; x.beginPath(); x.ellipse(p.x, p.y + 12.5, 4.2, 1.6, 0, 0, Math.PI * 2); x.fill(); }); } }); }
  parts.push({ z:0.2, fn:function(){ var r = 7.6 * k;
    if (V.long){ x.fillStyle = V.hair; if (ct < 0.2) roundRect(head.x - r * 0.95, head.y - 2, r * 1.9, 14 * k, 3); else roundRect(head.x - r * 0.9 - st * 1.5, head.y, r * 1.8, 12 * k, 3); x.fill(); }
    x.fillStyle = V.skin; x.beginPath(); x.arc(head.x, head.y, r, 0, Math.PI * 2); x.fill();
    x.fillStyle = V.hair; x.beginPath(); if (ct < -0.3){ x.arc(head.x, head.y, r + 0.3, 0, Math.PI * 2); } else { x.arc(head.x - st * 1.6, head.y - 1.8 * k, r * 1.02, Math.PI * (1.02 - 0.2 * Math.max(0, -ct)), Math.PI * (1.98 + 0.2 * Math.max(0, -ct))); } x.fill();
    if (ct > -0.12){ var ex = head.x + st * 3.2 * k; x.fillStyle = '#211c18';
      if (Math.abs(st) < 0.8 && ct > 0.05){ x.fillRect(ex - 2.6 * ct * k - 0.9, head.y + 0.2, 1.8, 2); x.fillRect(ex + 2.6 * ct * k - 0.9, head.y + 0.2, 1.8, 2); } else x.fillRect(ex + st * 1.2 - 0.9, head.y + 0.2, 1.8, 2);
      if (ct > 0.05){ x.fillStyle = 'rgba(220,90,80,0.55)'; x.fillRect(ex - 0.9, head.y + 3.6 * k, 1.8, 0.9); } }
    if (V.hat === 'nonla'){ x.fillStyle = '#e9d9a6'; x.beginPath(); x.moveTo(head.x - 12 * k, head.y - 3 * k); x.lineTo(head.x + 12 * k, head.y - 3 * k); x.lineTo(head.x, head.y - 15 * k); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(120,95,50,0.45)'; x.lineWidth = 0.7; x.beginPath(); x.moveTo(head.x - 8 * k, head.y - 6 * k); x.lineTo(head.x + 8 * k, head.y - 6 * k); x.moveTo(head.x - 4.5 * k, head.y - 9.5 * k); x.lineTo(head.x + 4.5 * k, head.y - 9.5 * k); x.stroke(); }
    else if (V.hat === 'cap'){ x.fillStyle = V.hatc; x.beginPath(); x.arc(head.x, head.y - 2 * k, r * 1.02, Math.PI, 0); x.fill(); if (ct > -0.4){ x.beginPath(); x.ellipse(head.x + st * 5 * k, head.y - 2 * k, (3 + 5 * Math.abs(ct)) * k, 1.6 * k, 0, 0, Math.PI * 2); x.fill(); } }
    else if (V.hat === 'bucket'){ x.fillStyle = V.hatc; x.beginPath(); x.ellipse(head.x, head.y - 3 * k, 11 * k, 2.6 * k, 0, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(head.x, head.y - 3 * k, r * 0.92, Math.PI, 0); x.fill(); } } });
  parts.sort(function(a, b){ return a.z - b.z; }).forEach(function(p){ p.fn(); });
  function roundRect(rx, ry, rw, rh, rr){ x.beginPath(); x.moveTo(rx + rr, ry); x.lineTo(rx + rw - rr, ry); x.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rr); x.lineTo(rx + rw, ry + rh - rr); x.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rr, ry + rh); x.lineTo(rx + rr, ry + rh); x.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rr); x.lineTo(rx, ry + rr); x.quadraticCurveTo(rx, ry, rx + rr, ry); x.closePath(); }
}
function buildSpriteSheet(){
  var c = document.createElement('canvas'); c.width = SPR.cw * SPR.cols; c.height = SPR.ch * SPR.rows; var x = c.getContext('2d');
  PEOPLE.forEach(function(V, r){ for (var d = 0; d < 8; d++) for (var f = 0; f < 4; f++){ x.save(); x.beginPath(); x.rect((d * 4 + f) * SPR.cw, r * SPR.ch, SPR.cw, SPR.ch); x.clip();
    drawPerson(x, (d * 4 + f) * SPR.cw + SPR.cw / 2, r * SPR.ch + SPR.ch - 3, V, d, f); x.restore(); } });
  return c; }

function genCrowd(n){
  var out = [], rc = mulberry32(321); function R(a, b){ return a + (b - a) * rc(); } function pk(a){ return a[(rc() * a.length) | 0]; }
  var zN = P(12.2600, 0)[1], zS = P(12.2125, 0)[1], BEACH = [0, 2, 3, 5, 6, 9, 9, 2], CITY = [0, 1, 3, 4, 8, 10, 7, 0, 3], TOUR = [6, 6, 9, 2, 0, 3, 1, 7];
  function push(ax, az, bx, bz, row, sp, yo){ var ya = ST.G.hAt(ax, az), yb = ST.G.hAt(bx, bz); if (yo == null && (ya < 0.05 || yb < 0.05)) return false;
    out.push(ax, yo == null ? ya : yo, az, bx, yo == null ? yb : yo, bz, row, rc(), sp, row === 5 ? 0.082 : 0.087); return true; }
  var quota = { beach:0.3, idle:0.08, prom:0.15, swim:0.08, city:0.27, tour:0.12 }, made = 0, guard = 0;
  function beachPt(dmin, dmax){ var z = R(zN, zS), d = R(dmin, dmax); return [coastX(z) - d, z, d]; }
  var cityD = DIST.filter(function(D){ return D.style === 'city'; });
  var citySegs = null; if (OSM){ citySegs = []; OSM.roads.forEach(function(Rd){ if (Rd.c < 3 || Rd.bridge) return; for (var i = 0; i < Rd.pts.length - 1; i++){ var a = Rd.pts[i], b = Rd.pts[i + 1], zn = ST.G.zoneAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    if (zn >= 10 && DIST[zn - 10].style === 'city' && Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.3) citySegs.push([a[0], a[1], b[0], b[1], Rd.w]); } }); if (!citySegs.length) citySegs = null; }
  while (made < n && guard++ < n * 8){ var r = rc(), ok = false, p, len, z2;
    if (r < quota.beach){ p = beachPt(0.12, 0.95); len = R(0.4, 2.5) * (rc() < 0.5 ? 1 : -1); z2 = p[1] + len; ok = push(p[0], p[1], coastX(z2) - p[2], z2, pk(BEACH), R(0.05, 0.09)); }
    else if (r < quota.beach + quota.idle){ p = beachPt(0.2, 1.0); ok = push(p[0], p[1], p[0], p[1], pk(BEACH), 0); }
    else if (r < quota.beach + quota.idle + quota.prom){ p = beachPt(1.5, 1.8); len = R(1, 5) * (rc() < 0.5 ? 1 : -1); z2 = p[1] + len; ok = push(p[0], p[1], coastX(z2) - p[2], z2, pk(TOUR.concat(CITY)), R(0.06, 0.1)); }
    else if (r < quota.beach + quota.idle + quota.prom + quota.swim){ p = beachPt(-0.75, -0.12); len = R(0.1, 0.6) * (rc() < 0.5 ? 1 : -1); z2 = p[1] + len; ok = push(p[0], p[1], coastX(z2) - p[2], z2, 11, R(0.02, 0.04), -0.02); }
    else if (r < quota.beach + quota.idle + quota.prom + quota.swim + quota.city && citySegs){   // OSM: đi trên vỉa hè đường thật trong phố
      var sg = pk(citySegs), t0 = rc(), sd = (rc() < 0.5 ? 1 : -1) * (sg[4] / 2 + 0.035), dx = sg[2] - sg[0], dz = sg[3] - sg[1], sl = Math.hypot(dx, dz), ln = Math.min(sl * (1 - t0), R(0.3, 1.6));
      var ax2 = sg[0] + dx * t0 - dz / sl * sd, az2 = sg[1] + dz * t0 + dx / sl * sd; ok = push(ax2, az2, ax2 + dx / sl * ln, az2 + dz / sl * ln, pk(CITY), R(0.05, 0.08)); }
    else if (r < quota.beach + quota.idle + quota.prom + quota.swim + quota.city){
      var D = pk(cityD), lo = toLocal(D, D.box[0], D.box[1]), hi = toLocal(D, D.box[2], D.box[3]), us = [lo[0], hi[0], toLocal(D, D.box[0], D.box[3])[0], toLocal(D, D.box[2], D.box[1])[0]], vs = [lo[1], hi[1], toLocal(D, D.box[0], D.box[3])[1], toLocal(D, D.box[2], D.box[1])[1]];
      var u0 = Math.min.apply(null, us), u1 = Math.max.apply(null, us), v0 = Math.min.apply(null, vs), v1 = Math.max.apply(null, vs), side = (rc() < 0.5 ? 1 : -1) * (D.sw / 2 - 0.025), L2 = R(0.4, 2);
      var a, b; if (rc() < 0.5){ var ul = Math.round(R(u0, u1) / D.su) * D.su + side, vv = R(v0, v1); a = toWorld(D, ul, vv); b = toWorld(D, ul, vv + L2); } else { var vl = Math.round(R(v0, v1) / D.sv) * D.sv + side, uu = R(u0, u1); a = toWorld(D, uu, vl); b = toWorld(D, uu + L2, vl); }
      if (ST.G.zoneAt(a[0], a[1]) === 10 + D.i && ST.G.zoneAt(b[0], b[1]) === 10 + D.i) ok = push(a[0], a[1], b[0], b[1], pk(CITY), R(0.05, 0.08)); }
    else { var spots = ['ponagar', 'cho-dam', 'cho-dam', 'nha-tho', 'tram-huong', 'tram-huong', 'hon-chong', 'vien-hdh', 'long-son', 'bao-dai'], id = pk(spots), c = id === 'long-son' ? LMP.pagoda : LMP[id];
      if (rc() < 0.25) c = rc() < 0.5 ? P(12.2195, 109.2420) : P(12.1790, 109.2325);
      var ang = R(0, 6.28), rad = R(id === 'cho-dam' ? 1.45 : 0.8, 2.6), ax = c[0] + Math.cos(ang) * rad, az = c[1] + Math.sin(ang) * rad, b2 = R(0, 6.28), l3 = rc() < 0.3 ? 0 : R(0.3, 1.2);
      ok = push(ax, az, ax + Math.cos(b2) * l3, az + Math.sin(b2) * l3, pk(TOUR), l3 ? R(0.04, 0.07) : 0); }
    if (ok) made++; }
  return new Float32Array(out);
}
ST.crowdU = { uTime:{ value:0 }, uCam:{ value:new THREE.Vector3() }, uMap:{ value:null }, uLight:{ value:new THREE.Color(1.2, 1.2, 1.2) }, uFogColor:{ value:new THREE.Color() }, uFogNear:{ value:100 }, uFogFar:{ value:1000 } };
function buildCrowd(){
  var sheet = buildSpriteSheet(), tex = new THREE.CanvasTexture(sheet); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; ST.crowdU.uMap.value = tex;
  // Các hàng người mặc thường phục được thay bằng nhân vật Kenney vẽ sẵn (crowd-sheet.js); áo dài, nón lá, gánh hàng, người bơi giữ bản vẽ tay.
  // Ảnh giải mã bất đồng bộ nên lúc đầu vẫn hiện bản vẽ tay, xong thì chép đè.
  if (typeof CROWD_SHEET === 'string'){ var KROW = [0, 2, 3, 5, 6, 8, 9], im = new Image();
    im.onload = function(){ var x = sheet.getContext('2d'); KROW.forEach(function(row, k){ if (k >= KENNEY_ROWS.length) return; x.clearRect(0, row * SPR.ch, SPR.cw * SPR.cols, SPR.ch);
      x.drawImage(im, 0, k * SPR.ch, SPR.cw * SPR.cols, SPR.ch, 0, row * SPR.ch, SPR.cw * SPR.cols, SPR.ch); }); tex.needsUpdate = true; };
    im.src = CROWD_SHEET; }
  var data = genCrowd(LITE ? 1600 : 4200), N = data.length / 10;
  var base = new THREE.PlaneGeometry(1, 1.5); base.translate(0, 0.75, 0);
  var g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  var A = new Float32Array(N * 3), Bv = new Float32Array(N * 3), Dv = new Float32Array(N * 4);
  for (var i = 0; i < N; i++){ var o = i * 10; A.set([data[o], data[o + 1], data[o + 2]], i * 3); Bv.set([data[o + 3], data[o + 4], data[o + 5]], i * 3); Dv.set([data[o + 6], data[o + 7], data[o + 8], data[o + 9]], i * 4); }
  g.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 3)); g.setAttribute('aB', new THREE.InstancedBufferAttribute(Bv, 3)); g.setAttribute('aD', new THREE.InstancedBufferAttribute(Dv, 4));
  g.instanceCount = N;
  var m = new THREE.ShaderMaterial({ uniforms:ST.crowdU, side:THREE.DoubleSide,
    vertexShader:[
      'uniform float uTime; uniform vec3 uCam; uniform float uFogNear; uniform float uFogFar;',
      'attribute vec3 aA; attribute vec3 aB; attribute vec4 aD;',
      'varying vec2 vUv; varying float vFog;',
      'void main(){',
      '  vec2 seg = aB.xz - aA.xz; float L = length(seg); float mv = step(0.001, L);',
      '  float t = uTime * aD.z / max(L, 0.001) + aD.y * 7.0; float q = mod(t, 2.0); float u = q < 1.0 ? q : 2.0 - q; float sg = q < 1.0 ? 1.0 : -1.0;',
      '  vec3 p = mix(aA, aB, mv * u);',
      '  vec2 fw = mv > 0.5 ? normalize(seg) * sg : vec2(sin(aD.y * 6.2832), cos(aD.y * 6.2832));',
      '  vec2 tc = normalize(uCam.xz - p.xz + vec2(0.0001, 0.0));',
      '  float ang = atan(fw.x * tc.y - fw.y * tc.x, dot(fw, tc));',
      '  float di = mod(floor(ang / 0.7853982 + 0.5) + 8.0, 8.0);',
      '  float fr = mv > 0.5 ? mod(floor(uTime * 8.0 + aD.y * 13.0), 4.0) : (aD.x > 10.5 ? mod(floor(uTime * 3.0 + aD.y * 9.0), 4.0) : 0.0);',
      '  vec3 rt = vec3(tc.y, 0.0, -tc.x);',
      '  vec3 wp = p + rt * position.x * aD.w + vec3(0.0, position.y * aD.w, 0.0);',
      '  vUv = vec2((di * 4.0 + fr + uv.x) / ' + SPR.cols.toFixed(1) + ', 1.0 - (aD.x + 1.0 - uv.y) / ' + SPR.rows.toFixed(1) + ');',
      '  vec4 mvp = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mvp;',
      '  vFog = smoothstep(uFogNear, uFogFar, -mvp.z);',
      '}'].join('\n'),
    fragmentShader:[
      'uniform sampler2D uMap; uniform vec3 uLight; uniform vec3 uFogColor;',
      'varying vec2 vUv; varying float vFog;',
      'void main(){',
      '  vec4 c = texture2D(uMap, vUv); if (c.a < 0.5) discard;',
      '  gl_FragColor = vec4(mix(c.rgb * uLight, uFogColor, vFog), 1.0);',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}'].join('\n') });
  var mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; scene.add(mesh); anim.crowd = { mesh:mesh, n:N, sheet:sheet };
}

export { buildCrowd };
