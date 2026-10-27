/* ======================= SCENE (three.js r147) ======================= */
var errEl = document.getElementById('err'), loader = document.getElementById('loader'), loaderText = document.getElementById('loaderText');
function fail(msg){ loader.hidden = true; errEl.textContent = msg; errEl.hidden = false; }
if (!window.THREE || !THREE.OrbitControls){ fail('Không tải được thư viện 3D. Hãy kiểm tra kết nối mạng rồi tải lại trang.'); return; }
if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

var stage = document.getElementById('stage');
var renderer;
try { renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' }); }
catch (e){ fail('Trình duyệt này chưa bật WebGL nên không hiển thị được bản đồ 3D. Hãy thử Chrome, Safari hoặc Firefox bản mới.'); return; }
var LITE = Math.min(innerWidth, innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 2;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LITE ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
stage.appendChild(renderer.domElement);
var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

var scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd4eff2, 400, 1300);
var camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 4000);
var hemi = new THREE.HemisphereLight(0xe3f6ff, 0x93a46a, 0.72); scene.add(hemi);
var sun = new THREE.DirectionalLight(0xfff1d6, 1.35);
sun.castShadow = true;
sun.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
var SC = sun.shadow.camera; SC.near = 1; SC.far = 900;
scene.add(sun); scene.add(sun.target);

/* ---------- material & geometry helpers ---------- */
var matCache = {}, glowMats = [];
function mat(color, extra){ var key = color + (extra ? JSON.stringify(extra) : ''); if (matCache[key]) return matCache[key];
  var o = { color:color, roughness:0.82, metalness:0 }; if (extra) for (var k in extra) o[k] = extra[k];
  return (matCache[key] = new THREE.MeshStandardMaterial(o)); }
function lowMat(c, s){ return (typeof c === 'string' && s <= 8) ? mat(c, { flatShading:true }) : c; }
function mesh(geo, c, extra){ var m = new THREE.Mesh(geo, typeof c === 'string' ? mat(c, extra) : c); m.castShadow = true; m.receiveShadow = true; return m; }
function box(w, h, d, c){ return mesh(new THREE.BoxGeometry(w, h, d), c); }
function cyl(rt, rb, h, s, c){ return mesh(new THREE.CylinderGeometry(rt, rb, h, s), lowMat(c, s)); }
function cone(r, h, s, c){ return mesh(new THREE.ConeGeometry(r, h, s), lowMat(c, s)); }
function sph(r, c, ws, hs){ return mesh(new THREE.SphereGeometry(r, ws || 12, hs || 8), c); }
function at(o, x, y, z){ o.position.set(x, y, z); return o; }
function glowMat(color, emissive, base, peak){ var m = new THREE.MeshStandardMaterial({ color:color, roughness:0.7, emissive:emissive, emissiveIntensity:base }); glowMats.push({ m:m, base:base, peak:peak }); return m; }
function prism(w, h, len, c){ var s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath(); var geo = new THREE.ExtrudeGeometry(s, { depth:len, bevelEnabled:false }); geo.translate(0, 0, -len / 2); return mesh(geo, mat(c, { flatShading:true })); }
function beam(a, b, r, c){ var dir = new THREE.Vector3().subVectors(b, a), len = dir.length(), m = cyl(r, r, len, 5, c); m.position.copy(a).addScaledVector(dir, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); return m; }
function MX(x, y, z, rx, ry, rz, sx, sy, sz){ if (sx == null) sx = 1; if (sy == null) sy = sx; if (sz == null) sz = sx;
  return new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx, sy, sz)); }
function merge(parts){ var P_ = [], N_ = [], C_ = [];
  parts.forEach(function(p){ var g = p[0].index ? p[0].toNonIndexed() : p[0].clone(); g.applyMatrix4(p[1]); var a = g.attributes.position, n = g.attributes.normal, c = new THREE.Color(p[2]);
    for (var i = 0; i < a.count; i++){ P_.push(a.getX(i), a.getY(i), a.getZ(i)); N_.push(n.getX(i), n.getY(i), n.getZ(i)); C_.push(c.r, c.g, c.b); } });
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P_, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N_, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C_, 3)); g.computeBoundingSphere(); return g; }
function blobGeo(){ var g = new THREE.IcosahedronGeometry(1, 0), p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(); for (var i = 0; i < p.count; i++){ v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); } return g; }
var VCM = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.8 });
var VCM2 = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.85, side:THREE.DoubleSide });

var CHX = 4, CHZ = 4, _d = new THREE.Object3D(), _c = new THREE.Color();
function chunkOf(x, z){ return clamp(Math.floor((z - BZ0) / BD * CHZ), 0, CHZ - 1) * CHX + clamp(Math.floor((x - BX0) / BW * CHX), 0, CHX - 1); }
function instChunks(geo, material, items, setter, opt){ opt = opt || {};
  var buckets = []; for (var i = 0; i < CHX * CHZ; i++) buckets.push([]);
  items.forEach(function(it){ buckets[chunkOf(it.x, it.z)].push(it); });
  var out = [];
  buckets.forEach(function(list){ if (!list.length) return;
    var g = geo.clone(), im = new THREE.InstancedMesh(g, material, list.length), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    list.forEach(function(it, k){ _d.position.set(0, 0, 0); _d.rotation.set(0, 0, 0); _d.scale.set(1, 1, 1); _c.setRGB(1, 1, 1); setter(_d, it, _c); _d.updateMatrix();
      im.setMatrixAt(k, _d.matrix); im.setColorAt(k, _c); var p = _d.position; mn[0] = Math.min(mn[0], p.x); mn[1] = Math.min(mn[1], p.y); mn[2] = Math.min(mn[2], p.z); mx[0] = Math.max(mx[0], p.x); mx[1] = Math.max(mx[1], p.y); mx[2] = Math.max(mx[2], p.z); });
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2), Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2 + (opt.pad || 4));
    im.castShadow = opt.cast !== false; im.receiveShadow = opt.receive !== false;
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    scene.add(im); out.push(im); });
  return out; }
function dynInst(geo, material, n, cast){ var im = new THREE.InstancedMesh(geo, material, Math.max(n, 1)); im.count = n; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = cast !== false; im.receiveShadow = true; scene.add(im); return im; }
function radialTex(inner, outer){ var c = document.createElement('canvas'); c.width = c.height = 64; var x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner); g.addColorStop(0.35, inner); g.addColorStop(1, outer); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); }
function glowPoints(positions, colors, size, color){ var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  var m = new THREE.PointsMaterial({ size:size, sizeAttenuation:true, map:radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), color:color || '#ffffff', vertexColors:!!colors, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, fog:false });
  m.onBeforeCompile = function(sh){ sh.vertexShader = sh.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n\tgl_PointSize = max(gl_PointSize, 1.8);'); };
  var p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 5; scene.add(p); return p; }

/* ---------- landmark builders (model units, scaled when placed) ---------- */
function buildPonagar(){
  var g = new THREE.Group();
  g.add(at(box(8, 3, 12.5, '#c49a73'), 0, -1.15, 0));
  function tower(s){ var t = new THREE.Group(), y = 0.35;
    for (var i = 0; i < 4; i++){ var w = s * (1 - 0.17 * i), hh = s * (i === 0 ? 1.3 : 0.55);
      t.add(at(box(w, hh, w, i % 2 ? '#b0533a' : '#a24a33'), 0, y + hh / 2, 0)); t.add(at(box(w * 1.12, 0.16, w * 1.12, '#8e3f2b'), 0, y + hh, 0)); y += hh + 0.16; }
    var cap = cone(s * 0.44, s * 0.95, 4, '#8e3f2b'); cap.rotation.y = Math.PI / 4; t.add(at(cap, 0, y + s * 0.47, 0));
    t.add(at(box(0.1, s * 0.62, s * 0.36, '#3d1d14'), s / 2 + 0.04, 0.35 + s * 0.31, 0)); return t; }
  g.add(at(tower(2.7), -0.6, 0, -3.4)); g.add(at(tower(1.9), -0.3, 0, 0.4)); g.add(at(tower(1.55), -0.2, 0, 3.4));
  for (var r = 0; r < 2; r++) for (var c = 0; c < 5; c++) g.add(at(cyl(0.22, 0.26, 1.9, 6, '#b46a4a'), 2.4 + r * 1.3, 1.3, -3 + c * 1.5));
  return g; }
function buildHonChong(){ var g = new THREE.Group(), geo = new THREE.DodecahedronGeometry(1, 0);
  [[0,0.4,0,2.3,1.4,1.9,'#c2b6a2'],[0.9,2.1,0.2,1.5,1.05,1.3,'#b3a691'],[0.5,3.5,0,1.15,0.95,1,'#c8bca8'],[-2.2,0.2,1.6,1.7,1.1,1.5,'#ab9f8b'],[2.6,-0.1,-1.6,1.9,1.1,1.6,'#b8ac97'],[3.6,-0.4,1.4,1.3,0.9,1.2,'#a89a86'],[-1.2,0,-2.4,1.2,0.8,1.1,'#bdb19c'],[4.6,-0.6,-0.2,1.4,0.8,1.3,'#b0a38f']].forEach(function(r){
    var m = mesh(geo, mat(r[6], { flatShading:true })); m.scale.set(r[3], r[4], r[5]); m.position.set(r[0], r[1], r[2]); m.rotation.set(r[0], r[2], r[1]); g.add(m); });
  return g; }
function buildChoDam(){ var g = new THREE.Group(), wall = '#f4ead6', roof = '#3fa47e';
  g.add(at(cyl(4.2, 4.3, 1.8, 20, wall), 0, 0.9, 0)); g.add(at(cyl(4.6, 4.6, 0.25, 20, roof), 0, 1.9, 0)); g.add(at(cyl(3.0, 4.5, 0.9, 20, roof), 0, 2.45, 0));
  g.add(at(cyl(2.6, 2.6, 1.0, 20, wall), 0, 3.4, 0)); g.add(at(cyl(1.6, 3.0, 0.8, 20, roof), 0, 4.3, 0));
  g.add(at(mesh(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#2f8c6a'), 0, 4.65, 0));
  for (var i = 0; i < 8; i++){ var a = i / 8 * Math.PI * 2, dr = at(box(0.9, 1.1, 0.12, '#7a5a3a'), Math.cos(a) * 4.25, 0.55, Math.sin(a) * 4.25); dr.rotation.y = -a + Math.PI / 2; g.add(dr); }
  return g; }
function buildBuddha(){ var g = new THREE.Group(), white = '#f7f5ef';
  g.add(at(box(5.4, 3, 5.4, '#e2dccd'), 0, -1.2, 0)); g.add(at(cyl(2.4, 2.8, 1.0, 16, '#ebe5d7'), 0, 0.8, 0));
  var petal = new THREE.SphereGeometry(1, 8, 6);
  for (var i = 0; i < 10; i++){ var a = i / 10 * Math.PI * 2, p = mesh(petal, '#f1e6dc'); p.scale.set(0.5, 0.85, 0.3); p.position.set(Math.cos(a) * 2.05, 1.65, Math.sin(a) * 2.05); p.rotation.y = -a + Math.PI / 2; p.rotation.x = -0.35; g.add(p); }
  var legs = cyl(1.9, 2.1, 0.9, 16, white); legs.scale.z = 0.8; g.add(at(legs, 0, 2.1, 0));
  var body = sph(1.25, white); body.scale.set(1, 1.35, 0.85); g.add(at(body, 0, 3.45, 0));
  g.add(at(sph(0.62, white), 0, 5.2, 0)); g.add(at(sph(0.3, white), 0, 5.75, 0)); return g; }
function buildPagoda(){ var g = new THREE.Group();
  g.add(at(box(5.2, 1.6, 3.6, '#f2d27a'), 0, 0.8, 0));
  for (var i = 0; i < 4; i++) g.add(at(cyl(0.14, 0.14, 1.6, 6, '#b8402c'), 2.65, 0.8, -1.35 + i * 0.9));
  var r1 = cone(1, 1.5, 4, '#d6492f'); r1.rotation.y = Math.PI / 4; r1.scale.set(4.4, 1, 3.2); g.add(at(r1, 0, 2.35, 0));
  g.add(at(box(2.8, 0.7, 2, '#f2d27a'), 0, 3.3, 0));
  var r2 = cone(1, 1, 4, '#d6492f'); r2.rotation.y = Math.PI / 4; r2.scale.set(2.4, 1, 1.8); g.add(at(r2, 0, 4.1, 0)); return g; }
function buildCathedral(){ var g = new THREE.Group(), stone = '#b3aea4', roof = '#5d6470';
  g.add(at(box(10, 2.6, 4.6, '#9c978d'), -0.3, -1, 0)); g.add(at(box(8, 3, 3.4, stone), -1, 1.5, 0));
  var pr = prism(3.8, 1.9, 8.2, roof); pr.rotation.y = Math.PI / 2; g.add(at(pr, -1, 3, 0));
  g.add(at(box(2.3, 6.6, 2.3, stone), 3.9, 3.3, 0)); g.add(at(box(2.5, 0.25, 2.5, '#9c978d'), 3.9, 6.6, 0));
  var sp = cone(1.3, 4.2, 4, roof); sp.rotation.y = Math.PI / 4; g.add(at(sp, 3.9, 8.8, 0));
  g.add(at(box(0.14, 1.1, 0.14, '#3d4148'), 3.9, 11.4, 0)); g.add(at(box(0.14, 0.14, 0.6, '#3d4148'), 3.9, 11.6, 0));
  [[-4.6, 1.4], [-4.6, -1.4]].forEach(function(p){ var s = cone(0.35, 1.6, 4, roof); s.rotation.y = Math.PI / 4; g.add(at(s, p[0], 3.9, p[1])); });
  g.add(at(sph(0.42, '#7fa8c9', 8, 6), 5.08, 4.4, 0)); return g; }
var towerGlow = glowMat('#f7f0e4', '#ffb37a', 0.05, 1.2);
function buildTramHuong(){ var g = new THREE.Group();
  g.add(at(cyl(3, 3.2, 0.6, 16, '#e9e4d8'), 0, 0.3, 0));
  var petal = new THREE.SphereGeometry(1, 10, 6);
  for (var i = 0; i < 8; i++){ var a = i / 8 * Math.PI * 2, p = mesh(petal, '#f4e1d6'); p.scale.set(0.75, 1.9, 0.32); p.position.set(Math.cos(a) * 1.75, 1.7, Math.sin(a) * 1.75); p.rotation.y = -a + Math.PI / 2; p.rotation.x = -0.42; g.add(p); }
  g.add(at(mesh(new THREE.CylinderGeometry(0.9, 1.35, 6.5, 12), towerGlow), 0, 3.85, 0));
  var pts = [[0,0],[1.2,0.4],[1.75,1.6],[1.6,3],[1.05,4.2],[0.3,5],[0,5.35]].map(function(q){ return new THREE.Vector2(q[0], q[1]); });
  g.add(at(mesh(new THREE.LatheGeometry(pts, 12), towerGlow), 0, 7.05, 0)); g.add(at(cone(0.12, 1.2, 6, '#e3c89a'), 0, 12.9, 0)); return g; }
function buildInstitute(){ var g = new THREE.Group();
  g.add(at(box(7, 2.6, 3.8, '#efbd4a'), 0, 1.3, 0));
  var r = cone(1, 1.6, 4, '#c9452f'); r.rotation.y = Math.PI / 4; r.scale.set(5.4, 1, 3.1); g.add(at(r, 0, 3.4, 0));
  g.add(at(box(2.2, 3.1, 4.4, '#f3c95c'), 0, 1.55, 0));
  var r2 = cone(1, 1.3, 4, '#c9452f'); r2.rotation.y = Math.PI / 4; r2.scale.set(1.9, 1, 3.4); g.add(at(r2, 0, 3.75, 0));
  for (var i = 0; i < 4; i++) g.add(at(cyl(0.14, 0.14, 2.4, 6, '#ffffff'), 3.75, 1.2, -1.35 + i * 0.9));
  g.add(at(box(0.6, 0.1, 4.4, '#ffffff'), 3.75, 2.45, 0)); return g; }
function buildColonial(w, d, floors, wall, roof){ var g = new THREE.Group(), h = floors * 1.3;
  g.add(at(box(w, h, d, wall), 0, h / 2, 0)); g.add(at(box(w + 0.2, 0.15, d + 0.2, '#ffffff'), 0, h, 0));
  var r = cone(1, 1.1, 4, roof); r.rotation.y = Math.PI / 4; r.scale.set(w * 0.78, 1, d * 0.78); g.add(at(r, 0, h + 0.62, 0));
  for (var i = 0; i < Math.floor(w / 0.9); i++) g.add(at(box(0.45, 0.8, 0.06, '#6f8ea3'), -w / 2 + 0.6 + i * 0.9, h * 0.55, d / 2 + 0.02));
  return g; }
function buildStation(){ var g = new THREE.Group();
  g.add(at(box(2.4, 1.1, 9, '#f1e3b5'), 0, 0.55, 0)); g.add(at(box(3, 1.9, 2.6, '#f4e7bf'), 0, 0.95, 0));
  var r = prism(3.2, 1.0, 2.8, '#c4553c'); g.add(at(r, 0, 1.9, 0));
  var r2 = prism(2.6, 0.6, 9.2, '#b8503a'); g.add(at(r2, 0, 1.1, 0));
  g.add(at(box(1.2, 0.08, 11, '#d7d2c4'), -1.9, 0.9, 0));
  for (var i = 0; i < 6; i++) g.add(at(box(0.08, 0.9, 0.08, '#6e6a62'), -2.3, 0.45, -5 + i * 2));
  g.add(at(box(0.7, 0.1, 11, '#cfc8b8'), -2.1, 0.12, 0)); return g; }
function buildTemple(){ var g = new THREE.Group();
  g.add(at(box(2.2, 1.1, 1.8, '#f2d27a'), 0, 0.55, 0));
  var r1 = cone(1, 0.9, 4, '#c8452f'); r1.rotation.y = Math.PI / 4; r1.scale.set(2, 1, 1.7); g.add(at(r1, 0, 1.55, 0));
  g.add(at(box(1.1, 0.5, 0.9, '#f2d27a'), 0, 2.1, 0));
  var r2 = cone(1, 0.6, 4, '#c8452f'); r2.rotation.y = Math.PI / 4; r2.scale.set(1.1, 1, 0.95); g.add(at(r2, 0, 2.65, 0));
  g.add(at(cyl(0.35, 0.45, 0.4, 10, '#e9e4d8'), 1.8, 0.2, 0.6)); g.add(at(sph(0.32, '#f7f5ef'), 1.8, 0.75, 0.6)); g.add(at(sph(0.17, '#f7f5ef'), 1.8, 1.15, 0.6));
  return g; }
function buildCablePylon(h){ var g = new THREE.Group(), tw = cyl(0.12, 0.42, h + 1.5, 4, '#f2f2f2'); tw.rotation.y = Math.PI / 4; g.add(at(tw, 0, (h + 1.5) / 2 - 1.5, 0));
  g.add(at(box(1.6, 0.14, 0.2, '#e0473a'), 0, h, 0)); g.add(at(box(0.5, 0.3, 0.5, '#e0473a'), 0, h - 0.5, 0)); return g; }
function buildCableStation(){ var g = new THREE.Group(); g.add(at(box(1.3, 1.1, 1.3, '#ffffff'), 0, 0.55, 0)); g.add(at(box(1.6, 0.16, 1.6, '#f2592c'), 0, 1.18, 0)); g.add(at(box(0.06, 0.5, 0.8, '#3f7fae'), 0.66, 0.6, 0)); return g; }
function buildCruiseShip(){ var g = new THREE.Group();
  var hs = new THREE.Shape(); hs.moveTo(-0.42, 3); hs.lineTo(0.42, 3); hs.lineTo(0.46, -2.4); hs.lineTo(0, -3.2); hs.lineTo(-0.46, -2.4); hs.closePath();
  var hull = new THREE.ExtrudeGeometry(hs, { depth:0.55, bevelEnabled:false }); hull.rotateX(Math.PI / 2); hull.translate(0, 0.35, 0);
  g.add(mesh(hull, '#1f3550')); g.add(at(box(0.86, 0.06, 5.6, '#c43d32'), 0, 0.02, -0.1));
  [[0.84,0.32,4.8,0.5],[0.78,0.3,4.2,0.82],[0.7,0.3,3.4,1.12],[0.58,0.28,2.4,1.41]].forEach(function(t){ g.add(at(box(t[0], t[1], t[2], '#fbfbf8'), 0, t[3], 0.2)); g.add(at(box(t[0] + 0.01, 0.06, t[2] - 0.1, '#2f4a63'), 0, t[3] + 0.05, 0.2)); });
  g.add(at(box(0.3, 0.42, 0.42, '#c43d32'), 0, 1.75, 1.0)); g.add(at(box(0.32, 0.08, 0.44, '#1f3550'), 0, 1.98, 1.0));
  g.add(at(box(0.4, 0.02, 0.6, '#57b7d6'), 0, 1.56, -0.4)); return g; }
function buildCargoShip(){ var g = new THREE.Group(); g.add(at(box(0.9, 0.5, 5, '#2a5f86'), 0, 0.1, 0)); g.add(at(box(0.9, 0.1, 5, '#a8382c'), 0, -0.1, 0));
  var cc = ['#c0392b','#2e86c1','#f1c40f','#27ae60','#e67e22','#8e44ad'];
  for (var i = 0; i < 7; i++) for (var j = 0; j < 2; j++) g.add(at(box(0.38, 0.22, 0.5, cc[(i * 3 + j) % cc.length]), -0.2 + j * 0.4, 0.46, -1.8 + i * 0.55));
  g.add(at(box(0.8, 0.8, 0.6, '#f2f2f2'), 0, 0.75, 2.1)); g.add(at(box(0.2, 0.4, 0.2, '#333'), 0, 1.3, 2.2)); return g; }

/* ---------- boats ---------- */
var hullShape = new THREE.Shape(); hullShape.moveTo(-0.65, 1.6); hullShape.lineTo(0.65, 1.6); hullShape.lineTo(0.7, -0.6); hullShape.lineTo(0, -1.9); hullShape.lineTo(-0.7, -0.6); hullShape.closePath();
function hullGeo(depth, y){ var g = new THREE.ExtrudeGeometry(hullShape, { depth:depth, bevelEnabled:false }); g.rotateX(Math.PI / 2); g.translate(0, y, 0); return g; }
var BOAT_S = 0.13;
var boatHullGeo = merge([[hullGeo(0.55, 0.55), MX(0, 0, 0, 0, 0, 0, BOAT_S), '#ffffff']]);
var boatTopGeo = merge([[hullGeo(0.12, 0.67), MX(0, 0, 0, 0, 0, 0, BOAT_S), '#d9483b'], [new THREE.BoxGeometry(0.95, 0.75, 1.0), MX(0, 1.05 * BOAT_S, 0.6 * BOAT_S, 0, 0, 0, BOAT_S), '#f1ece0'], [new THREE.BoxGeometry(1.15, 0.1, 1.2), MX(0, 1.47 * BOAT_S, 0.6 * BOAT_S, 0, 0, 0, BOAT_S), '#2f6fb0']]);
function fishingBoat(hull, trim, s){ var g = new THREE.Group(), k = s || 1;
  g.add(mesh(hullGeo(0.55, 0.55), hull)); g.add(mesh(hullGeo(0.12, 0.67), trim)); g.add(at(box(0.95, 0.75, 1.0, '#ffffff'), 0, 1.05, 0.6)); g.add(at(box(1.15, 0.1, 1.2, trim), 0, 1.47, 0.6));
  g.scale.setScalar(BOAT_S * k); return g; }
function ferryBoat(){ var g = new THREE.Group(); g.add(mesh(hullGeo(0.6, 0.6), '#f6f6f2')); g.add(mesh(hullGeo(0.1, 0.72), '#1e6fa8'));
  g.add(at(box(1.1, 0.7, 2.4, '#ffffff'), 0, 1.05, 0.2)); g.add(at(box(1.12, 0.22, 2.3, '#3a6d8c'), 0, 1.15, 0.2)); g.add(at(box(1.2, 0.08, 2.6, '#1e6fa8'), 0, 1.44, 0.2)); g.scale.setScalar(0.24); return g; }
function speedBoat(){ var g = new THREE.Group(); g.add(mesh(hullGeo(0.4, 0.4), '#ffffff')); g.add(mesh(hullGeo(0.08, 0.48), '#e0473a')); g.add(at(box(0.9, 0.35, 0.7, '#9fd0e6'), 0, 0.68, 0.1)); g.scale.setScalar(0.1); return g; }
function sailBoat(){ var g = new THREE.Group(); g.add(mesh(hullGeo(0.4, 0.4), '#ffffff')); g.add(at(cyl(0.05, 0.05, 4.2, 5, '#dddddd'), 0, 2.4, 0.1));
  var s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0, 3.6); s.lineTo(0, 0.2); s.lineTo(1.4, 0.2); s.closePath();
  var sg = new THREE.ShapeGeometry(s); var sail = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color:'#fffaf0', side:THREE.DoubleSide, roughness:0.9 })); sail.rotation.y = Math.PI / 2; sail.position.set(0, 0.6, 0.15); sail.castShadow = true; g.add(sail);
  g.scale.setScalar(0.12); return g; }
var coracleGeo = (function(){ var g = new THREE.SphereGeometry(0.8, 12, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); g.scale(1, 0.5, 1); g.translate(0, 0.25, 0); return merge([[g, MX(0, 0, 0, 0, 0, 0, 0.11), '#3c5d93'], [new THREE.TorusGeometry(0.8, 0.06, 4, 16), MX(0, 0.25 * 0.11, 0, Math.PI / 2, 0, 0, 0.11), '#24375a']]); })();

/* ---------- vegetation & small object geometries ---------- */
var canopyGeo = merge([[blobGeo(), MX(0, 0.56, 0, 0, 0, 0, 0.5, 0.42, 0.5), '#ffffff'], [new THREE.CylinderGeometry(0.045, 0.065, 0.42, 5), MX(0, 0.21, 0), '#8a6a4a']]);
var forestGeo = merge([[blobGeo(), MX(0, 0.3, 0, 0, 0, 0, 0.58, 0.52, 0.58), '#ffffff']]);
var coneTreeGeo = merge([[new THREE.ConeGeometry(0.34, 1.0, 7), MX(0, 0.62, 0), '#ffffff'], [new THREE.CylinderGeometry(0.04, 0.05, 0.2, 5), MX(0, 0.1, 0), '#7a5a40']]);
var palmGeo = (function(){ var parts = [[new THREE.CylinderGeometry(0.022, 0.034, 0.36, 5), MX(0, 0.18, 0, 0, 0, 0.06), '#8b6b4a'], [new THREE.CylinderGeometry(0.018, 0.022, 0.3, 5), MX(0.016, 0.5, 0, 0, 0, -0.1), '#8b6b4a']];
  for (var k = 0; k < 7; k++){ var fr = new THREE.BoxGeometry(0.075, 0.01, 0.34); fr.translate(0, 0, 0.17);
    var m = new THREE.Matrix4().makeTranslation(0.03, 0.64, 0).multiply(new THREE.Matrix4().makeRotationY(k / 7 * Math.PI * 2 + 0.3)).multiply(new THREE.Matrix4().makeRotationX(0.45 + (k % 2) * 0.25));
    parts.push([fr, m, '#3f9a45']); }
  parts.push([new THREE.SphereGeometry(0.03, 6, 4), MX(0.03, 0.6, 0.02), '#6b5a2a']);
  return merge(parts); })();
var umbGeo = merge([[new THREE.CylinderGeometry(0.006, 0.006, 0.13, 4), MX(0, 0.065, 0), '#dddddd'], [new THREE.ConeGeometry(0.085, 0.035, 8), MX(0, 0.14, 0), '#ffffff']]);
var tankGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.075, 10); tankGeo.translate(0, 0.04, 0);

/* ---------- textures for windows ---------- */
function winTex(cols, rows, o){ var W = cols * 32, Hh = rows * 32, c1 = document.createElement('canvas'), c2 = document.createElement('canvas'); c1.width = c2.width = W; c1.height = c2.height = Hh;
  var a = c1.getContext('2d'), b = c2.getContext('2d'); a.fillStyle = '#ffffff'; a.fillRect(0, 0, W, Hh); b.fillStyle = '#000000'; b.fillRect(0, 0, W, Hh);
  for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++){ var x = i * 32, y = j * 32;
    a.fillStyle = o.glass; a.fillRect(x + o.mx, y + o.my, 32 - 2 * o.mx, o.wh);
    if (o.balcony){ a.fillStyle = 'rgba(0,0,0,0.14)'; a.fillRect(x, y + o.my + o.wh + 2, 32, 3); }
    b.fillStyle = ih(i * 13 + cols, j * 7 + rows + o.seed) > 0.42 ? '#ffd38a' : '#060606'; b.fillRect(x + o.mx, y + o.my, 32 - 2 * o.mx, o.wh); }
  var t1 = new THREE.CanvasTexture(c1), t2 = new THREE.CanvasTexture(c2);
  [t1, t2].forEach(function(t){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; });
  return { map:t1, emis:t2 }; }
function boxUV(uRep, vRep, blankSides){ var g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); var uv = g.attributes.uv;
  for (var f = 0; f < 6; f++) for (var k = 0; k < 4; k++){ var i = f * 4 + k;
    if (f === 2 || f === 3 || (blankSides && (f === 0 || f === 1))) uv.setXY(i, 0.01, 0.995); else uv.setXY(i, uv.getX(i) * uRep, uv.getY(i) * vRep); }
  uv.needsUpdate = true; return g; }
function bmat(t, peak){ var m = new THREE.MeshStandardMaterial({ color:'#ffffff', map:t.map, emissiveMap:t.emis, emissive:'#ffffff', emissiveIntensity:0, roughness:0.75 }); glowMats.push({ m:m, base:0, peak:peak }); return m; }

/* ======================= BUILD ======================= */
var G, groundTex, terrain, water, waterU, ROADS_S = [], RAIL_S = null, MK, KEEP = [], LM = [], LMI = {}, pickGroups = [], anim = { boats:[], movers:[], gondolas:[], birds:null, clouds:[], wheel:null, train:null, parasail:null, vehicles:null };
var lampPts, carPts, ring;
function step(msg){ loaderText.textContent = msg; return new Promise(function(r){ setTimeout(r, 20); }); }
function hAt(x, z){ return G.hAt(x, z); }
function gy(x, z){ return Math.max(G.hAt(x, z), 0); }

function sampleRoad(pts, w, rail){ var s = resample(pts, 0.5), raw = [];
  for (var i = 0; i < s.length; i++){ var x = s[i][0], z = s[i][1]; if (!inBoard(x, z, 1.2)){ raw.push(null); continue; } raw.push({ x:x, z:z, h:H(x, z) }); }
  var best = [], cur = []; raw.forEach(function(p){ if (p) cur.push(p); else { if (cur.length > best.length) best = cur; cur = []; } }); if (cur.length > best.length) best = cur;
  var out = best; out.forEach(function(o, i){ o.br = o.h < 0.16; });
  var br2 = out.map(function(o, i){ return o.br || (out[i - 1] && out[i - 1].br) || (out[i + 1] && out[i + 1].br) || (out[i - 2] && out[i - 2].br) || (out[i + 2] && out[i + 2].br); });
  out.forEach(function(o, i){ o.br = br2[i]; o.y0 = o.br ? 0.66 : G.hAt(o.x, o.z) + 0.015; });
  out.forEach(function(o, i){ var sum = 0, n = 0; for (var k = -2; k <= 2; k++){ var q = out[i + k]; if (q){ sum += q.y0; n++; } } o.y = o.br ? Math.max(0.66, sum / n) : sum / n; });
  for (i = 0; i < out.length; i++){ var a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; out[i].fx = dx / l; out[i].fz = dz / l; }
  return { pts:out, w:w, rail:!!rail, L:(out.length - 1) * 0.5 }; }
function roadPoint(R, s, o){ var f = s / 0.5, i = f | 0, n = R.pts.length; if (i > n - 2) i = n - 2; if (i < 0) i = 0; var t = clamp(f - i, 0, 1), a = R.pts[i], b = R.pts[i + 1];
  o.x = a.x + (b.x - a.x) * t; o.y = a.y + (b.y - a.y) * t; o.z = a.z + (b.z - a.z) * t; o.fx = a.fx + (b.fx - a.fx) * t; o.fz = a.fz + (b.fz - a.fz) * t; var l = Math.hypot(o.fx, o.fz) || 1; o.fx /= l; o.fz /= l; return o; }

var JETTIES = [], LMP = {}, RESORT_HOTELS = [[12.2200,109.2428,1.2,0.6,8,0.5],[12.2172,109.2445,1.0,0.55,6,-0.4],[12.2228,109.2452,0.9,0.5,10,0.2]];
(function(){ LM_DEF.forEach(function(d){ var p = d.ll ? P(d.ll[0], d.ll[1]) : [0, 0]; LMP[d.id] = p; });
  var zT = P(12.2393, 0)[1]; LMP['tram-huong'] = [coastX(zT) - 1.3, zT];
  var zA = P(12.2163, 0)[1]; LMP.cableA = [coastX(zA) - 1.25, zA]; LMP.cableB = P(12.2182, 109.2386); LMP.wheel = P(12.2212, 109.2410);
  LMP.pagoda = P(12.2490, 109.1793); LMP.buddha = P(12.2505, 109.1772);
  KEEP = [['ponagar', 2.8], ['cho-dam', 2.0], ['nha-tho', 2.0], ['ga', 2.6], ['yersin', 1.2], ['tram-huong', 2.2], ['vien-hdh', 1.8], ['bao-dai', 2.4], ['cang', 1.6], ['hon-chong', 1.6]].map(function(k){ var p = LMP[k[0]]; return [p[0], p[1], k[1]]; });
  RESORT_HOTELS.forEach(function(h){ var p = P(h[0], h[1]); KEEP.push([p[0], p[1], 1.0]); });
  KEEP.push([LMP.cableA[0], LMP.cableA[1], 1.3], [LMP.cableB[0], LMP.cableB[1], 1.3], [LMP.wheel[0], LMP.wheel[1], 2.4], [LMP.pagoda[0], LMP.pagoda[1], 1.6], [LMP.buddha[0], LMP.buddha[1], 1.8]);
})();

function drawOverlays(ctx, isMask){
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  var zA = P(12.2622, 0)[1], zB = P(12.2102, 0)[1], prom = [], z;
  for (z = zA; z <= zB; z += 0.8) prom.push([coastX(z) - 1.65, z]);
  var zT = LMP['tram-huong'][1], plaza = [[coastX(zT - 1.7) - 2.25, zT - 1.7], [coastX(zT - 1.7) - 0.8, zT - 1.7], [coastX(zT + 1.7) - 0.8, zT + 1.7], [coastX(zT + 1.7) - 2.25, zT + 1.7]];
  if (isMask){ ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
    ROADS_S.concat([RAIL_S]).forEach(function(R){ ctx.lineWidth = R.rail ? 0.8 : R.w + 0.34; landRuns(R.pts).forEach(function(run){ strokeLine(ctx, run); }); });
    fillPoly(ctx, plaza); KEEP.forEach(function(k){ ctx.beginPath(); ctx.arc(k[0], k[1], k[2], 0, Math.PI * 2); ctx.fill(); }); return; }
  ctx.strokeStyle = '#9fc46d'; ctx.lineWidth = 1.2; strokeLine(ctx, prom);
  ctx.strokeStyle = '#e9e1cc'; ctx.lineWidth = 0.3; strokeLine(ctx, prom);
  ctx.fillStyle = '#e2dac8'; fillPoly(ctx, plaza);
  ctx.strokeStyle = '#d5ccb7'; ctx.lineWidth = 0.05; for (var q = -1.5; q <= 1.5; q += 0.5){ strokeLine(ctx, [[coastX(zT + q) - 2.2, zT + q], [coastX(zT + q) - 0.85, zT + q]]); }
  ROADS_S.forEach(function(R){ landRuns(R.pts).forEach(function(run){ ctx.strokeStyle = '#8a847a'; ctx.lineWidth = R.w + 0.12; strokeLine(ctx, run); ctx.strokeStyle = '#9a9c9f'; ctx.lineWidth = R.w; strokeLine(ctx, run);
    ctx.setLineDash([0.26, 0.3]); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.035; strokeLine(ctx, run); ctx.setLineDash([]); }); });
  landRuns(RAIL_S.pts).forEach(function(run){ ctx.strokeStyle = '#a89c88'; ctx.lineWidth = 0.46; strokeLine(ctx, run); ctx.setLineDash([0.05, 0.07]); ctx.strokeStyle = '#6c5a48'; ctx.lineWidth = 0.3; strokeLine(ctx, run); ctx.setLineDash([]); ctx.strokeStyle = '#4f4b47'; ctx.lineWidth = 0.06; strokeLine(ctx, run); });
  ctx.fillStyle = '#4fc3dd'; [[12.2196,109.2399,0.9,0.45],[12.2176,109.2424,0.6,0.38],[12.2206,109.2448,0.7,0.34],[12.1792,109.2318,0.5,0.3]].forEach(function(p){ var c = P(p[0], p[1]); ctx.fillRect(c[0] - p[2] / 2, c[1] - p[3] / 2, p[2], p[3]); });
}

function buildTerrain(){
  var GX = G.GX, GZ = G.GZ, N = GX * GZ, pos = new Float32Array(N * 3), uv = new Float32Array(N * 2);
  for (var j = 0; j < GZ; j++) for (var i = 0; i < GX; i++){ var k = j * GX + i, x = BX0 + i * G.cx, z = BZ0 + j * G.cz, h = G.h[k], c = boardClamp(x, z);
    if (c[0] !== x || c[1] !== z){ x = c[0]; z = c[1]; h = G.hAt(x, z); }
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; uv[k * 2] = (x - BX0) / BW; uv[k * 2 + 1] = (z - BZ0) / BD; }
  var idx = new Uint32Array((GX - 1) * (GZ - 1) * 6), q = 0;
  for (j = 0; j < GZ - 1; j++) for (i = 0; i < GX - 1; i++){ var a = j * GX + i, b = a + 1, c2 = a + GX, d = c2 + 1; idx[q++] = a; idx[q++] = c2; idx[q++] = b; idx[q++] = b; idx[q++] = c2; idx[q++] = d; }
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
  var tm = new THREE.MeshStandardMaterial({ map:groundTex, roughness:0.95, metalness:0 });
  tm.onBeforeCompile = function(sh){ sh.uniforms.uDetail = DU.tex; sh.uniforms.uDBox = DU.box; sh.uniforms.uDOn = DU.on;
    sh.vertexShader = 'varying vec2 vWXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform sampler2D uDetail;\nuniform vec4 uDBox;\nuniform float uDOn;\nvarying vec2 vWXZ;\n' + sh.fragmentShader.replace('#include <map_fragment>', [
      '#ifdef USE_MAP',
      '  vec4 sampledDiffuseColor = texture2D( map, vUv );',
      '  vec2 dq = (vWXZ - uDBox.xy) / uDBox.zw;',
      '  if (uDOn > 0.5 && dq.x > 0.0 && dq.x < 1.0 && dq.y > 0.0 && dq.y < 1.0){',
      '    float de = min(min(dq.x, 1.0 - dq.x), min(dq.y, 1.0 - dq.y));',
      '    sampledDiffuseColor = mix(sampledDiffuseColor, texture2D(uDetail, dq), smoothstep(0.0, 0.07, de));',
      '  }',
      '  diffuseColor *= sampledDiffuseColor;',
      '#endif'].join('\n')); };
  var m = new THREE.Mesh(g, tm); m.receiveShadow = true; m.castShadow = true; scene.add(m); return m; }

/* ---------- high-resolution ground patch that follows the camera / player ---------- */
var DU = { tex:{ value:null }, box:{ value:new THREE.Vector4(0, 0, 1, 1) }, on:{ value:0 } };
var DP = { size:LITE ? 26 : 34, res:LITE ? 768 : 1024, job:null, valid:false, cx:1e9, cz:1e9, textures:[], cur:0 };
function initDetail(){
  for (var i = 0; i < 2; i++){ var c = document.createElement('canvas'); c.width = c.height = DP.res; var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.flipY = false; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); DP.textures.push({ c:c, t:t }); }
  DU.tex.value = DP.textures[0].t; }
function updateDetail(fx, fz, want){
  if (!want){ DU.on.value = 0; return; }
  if (DP.valid) DU.on.value = 1;
  if (!DP.job){ var far = Math.max(Math.abs(fx - DP.cx), Math.abs(fz - DP.cz)) > DP.size * 0.2;
    if (!DP.valid || far){ var cx = Math.round(fx), cz = Math.round(fz), slot = DP.textures[1 - DP.cur];
      DP.job = { cx:cx, cz:cz, x0:cx - DP.size / 2, z0:cz - DP.size / 2, row:0, slot:slot, ctx:slot.c.getContext('2d') };
      DP.job.img = DP.job.ctx.createImageData(DP.res, DP.res); } }
  var J = DP.job; if (!J) return;
  var rows = DP.valid ? (LITE ? 48 : 96) : DP.res, r1 = Math.min(DP.res, J.row + rows);
  paintGround(J.img.data, DP.res, DP.res, G, J.x0, J.z0, DP.size, DP.size, J.row, r1); J.row = r1;
  if (J.row >= DP.res){ var ctx = J.ctx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.putImageData(J.img, 0, 0); worldCtx(ctx, DP.res, DP.res, J.x0, J.z0, DP.size, DP.size); drawOverlays(ctx, false);
    J.slot.t.needsUpdate = true; DU.tex.value = J.slot.t; DU.box.value.set(J.x0, J.z0, DP.size, DP.size); DP.cur = DP.textures.indexOf(J.slot); DP.cx = J.cx; DP.cz = J.cz; DP.valid = true; DU.on.value = 1; DP.job = null; } }

function perimeter(stepL){ var pts = [], C = [[BX1 - BR, BZ0 + BR, -Math.PI / 2], [BX1 - BR, BZ1 - BR, 0], [BX0 + BR, BZ1 - BR, Math.PI / 2], [BX0 + BR, BZ0 + BR, Math.PI]];
  var L = [[BX0 + BR, BZ0, BX1 - BR, BZ0], [BX1, BZ0 + BR, BX1, BZ1 - BR], [BX1 - BR, BZ1, BX0 + BR, BZ1], [BX0, BZ1 - BR, BX0, BZ0 + BR]];
  for (var s = 0; s < 4; s++){ var l = L[s], n = Math.ceil(Math.hypot(l[2] - l[0], l[3] - l[1]) / stepL); for (var k = 0; k < n; k++) pts.push([l[0] + (l[2] - l[0]) * k / n, l[1] + (l[3] - l[1]) * k / n]);
    var c = C[s]; for (k = 0; k < 10; k++){ var a = c[2] + k / 10 * Math.PI / 2; pts.push([c[0] + Math.cos(a) * BR, c[1] + Math.sin(a) * BR]); } }
  return pts; }

function buildWater(){
  var GX = G.GX, GZ = G.GZ, data = new Uint8Array(GX * GZ * 4);
  for (var k = 0; k < GX * GZ; k++){ data[k * 4] = clamp(((-G.h[k]) + 1) / 7, 0, 1) * 255; data[k * 4 + 1] = G.sea[k] * 255; data[k * 4 + 2] = 0; data[k * 4 + 3] = 255; }
  var dt = new THREE.DataTexture(data, GX, GZ, THREE.RGBAFormat); dt.magFilter = THREE.LinearFilter; dt.minFilter = THREE.LinearFilter; dt.generateMipmaps = false; dt.needsUpdate = true;
  waterU = { uTime:{ value:0 }, uDepth:{ value:dt }, uBox:{ value:new THREE.Vector4(BX0, BZ0, BW, BD) }, uGrid:{ value:new THREE.Vector2(GX, GZ) },
    uShallow:{ value:new THREE.Color('#3fc8cf') }, uDeep:{ value:new THREE.Color('#0f5f8c') }, uFoam:{ value:new THREE.Color('#ffffff') }, uSky:{ value:new THREE.Color('#bfe6f5') } };
  var wm = new THREE.MeshStandardMaterial({ color:'#ffffff', transparent:true, roughness:0.14, metalness:0.0 });
  wm.onBeforeCompile = function(sh){
    for (var key in waterU) sh.uniforms[key] = waterU[key];
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uTime;\nuniform sampler2D uDepth;\nuniform vec4 uBox;\nuniform vec2 uGrid;\nuniform vec3 uShallow;\nuniform vec3 uDeep;\nuniform vec3 uFoam;\nuniform vec3 uSky;\nvarying vec3 vWPos;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'vec2 gq = vec2((vWPos.x - uBox.x) / uBox.z, (vWPos.z - uBox.y) / uBox.w) * (uGrid - 1.0);',
        'vec4 dt = texture2D(uDepth, (gq + 0.5) / uGrid);',
        'float dep = dt.r * 7.0 - 1.0;',
        'float sea = dt.g;',
        'diffuseColor.rgb = mix(uShallow, uDeep, smoothstep(0.1, 3.4, dep));',
        'diffuseColor.a = mix(0.32, 0.94, smoothstep(0.0, 2.4, dep));',
        'float fw = 0.32 + 0.12 * sin(uTime * 1.2 + vWPos.x * 0.5 + vWPos.z * 0.37);',
        'float foam = (1.0 - smoothstep(fw * 0.35, fw, dep)) * step(-0.02, dep);',
        'float lines = smoothstep(0.82, 0.97, sin(dep * 16.0 - uTime * 2.1)) * (1.0 - smoothstep(0.15, 0.75, dep)) * step(0.0, dep);',
        'foam = clamp(foam + lines * 0.7, 0.0, 1.0) * mix(0.25, 1.0, sea);',
        'vec3 vd = normalize(cameraPosition - vWPos);',
        'float fres = pow(1.0 - clamp(vd.y, 0.0, 1.0), 3.0);',
        'diffuseColor.rgb = mix(diffuseColor.rgb, uSky, fres * 0.55);',
        'diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, foam * 0.85);',
        'diffuseColor.a = max(diffuseColor.a, foam * 0.9);'
      ].join('\n'))
      .replace('#include <normal_fragment_begin>', [
        '#include <normal_fragment_begin>',
        '{ float wk = 1.0 - smoothstep(20.0, 140.0, length(vWPos - cameraPosition));',
        '  vec2 p = vWPos.xz; float t = uTime; vec2 g = vec2(0.0);',
        '  g += 0.035 * 1.7 * cos(dot(p, vec2(0.83, 0.55)) * 1.7 + t * 1.3) * vec2(0.83, 0.55);',
        '  g += 0.028 * 2.6 * cos(dot(p, vec2(-0.42, 0.91)) * 2.6 + t * 1.7) * vec2(-0.42, 0.91);',
        '  g += 0.018 * 4.1 * cos(dot(p, vec2(0.97, -0.25)) * 4.1 + t * 2.3) * vec2(0.97, -0.25);',
        '  g += 0.012 * 6.3 * cos(dot(p, vec2(-0.7, -0.71)) * 6.3 + t * 2.9) * vec2(-0.7, -0.71);',
        '  vec3 wn = normalize(vec3(-g.x * wk, 1.0, -g.y * wk));',
        '  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz); }'
      ].join('\n'));
  };
  var per = perimeter(3), shape = new THREE.Shape(per.map(function(p){ return new THREE.Vector2(p[0], -p[1]); }));
  var g = new THREE.ShapeGeometry(shape, 1); g.rotateX(-Math.PI / 2);
  var m = new THREE.Mesh(g, wm); m.receiveShadow = true; m.renderOrder = 2; scene.add(m); return m; }

function buildSkirt(){
  var per = perimeter(1.2); per.push(per[0]);
  var pos = [], col = [], soil = [new THREE.Color('#9c6b43'), new THREE.Color('#7d5434'), new THREE.Color('#4b3a30')], seaC = [new THREE.Color('#47bfd0'), new THREE.Color('#2a8fb0'), new THREE.Color('#bfa77e'), new THREE.Color('#4b3a30')];
  var cols = [], ys = [];
  per.forEach(function(p){ var h = G.hAt(p[0], p[1]);
    if (h > 0.02){ ys.push([h, h - 0.5, -3, -10]); var top = new THREE.Color().setRGB(0.55, 0.62, 0.38); cols.push([top, soil[0], soil[1], soil[2]]); }
    else { ys.push([0, Math.max(h, -6), Math.max(h, -6) - 0.4, -10]); cols.push(seaC); } });
  function v(i, r){ pos.push(per[i][0], ys[i][r], per[i][1]); var c = cols[i][r]; col.push(c.r, c.g, c.b); }
  for (var i = 0; i < per.length - 1; i++) for (var r = 0; r < 3; r++){ v(i, r); v(i + 1, r); v(i, r + 1); v(i + 1, r); v(i + 1, r + 1); v(i, r + 1); }
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.95, side:THREE.DoubleSide })));
  var cv = document.createElement('canvas'); cv.width = cv.height = 128; var cx = cv.getContext('2d'), gr = cx.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, 'rgba(10,40,70,.32)'); gr.addColorStop(0.7, 'rgba(10,40,70,.1)'); gr.addColorStop(1, 'rgba(10,40,70,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
  var sh = new THREE.Mesh(new THREE.PlaneGeometry(BW * 1.8, BD * 1.8), new THREE.MeshBasicMaterial({ map:new THREE.CanvasTexture(cv), transparent:true, depthWrite:false, fog:false }));
  sh.rotation.x = -Math.PI / 2; sh.position.set((BX0 + BX1) / 2, -40, (BZ0 + BZ1) / 2); scene.add(sh); }

function place(g, id, x, z, y, rot, s){ g.position.set(x, y == null ? gy(x, z) : y, z); if (rot) g.rotation.y = rot; if (s) g.scale.setScalar(s);
  if (id) g.userData.lmId = id; g.traverse(function(o){ if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } }); scene.add(g); if (id) pickGroups.push(g); return g; }
function topOf(g){ g.updateMatrixWorld(true); return new THREE.Box3().setFromObject(g).max.y; }

function buildLandmarks(){
  var p, g;
  p = LMP.ponagar; g = place(buildPonagar(), 'ponagar', p[0], p[1], null, 0, 0.22); LMP.ponagarTop = topOf(g);
  p = LMP['hon-chong']; g = place(buildHonChong(), 'hon-chong', p[0], p[1], Math.max(G.hAt(p[0], p[1]) - 0.2, -0.2), 0.4, 0.32); LMP.honchongTop = topOf(g);
  p = LMP['cho-dam']; g = place(buildChoDam(), 'cho-dam', p[0], p[1], null, 0, 0.3); LMP.chodamTop = topOf(g);
  p = LMP.buddha; g = place(buildBuddha(), 'long-son', p[0], p[1], null, 0, 0.3); LMP.buddhaTop = topOf(g);
  p = LMP.pagoda; place(buildPagoda(), 'long-son', p[0], p[1], null, 0.1, 0.24);
  p = LMP['nha-tho']; g = place(buildCathedral(), 'nha-tho', p[0], p[1], null, 0, 0.26); LMP.nhathoTop = topOf(g);
  p = LMP['tram-huong']; g = place(buildTramHuong(), 'tram-huong', p[0], p[1], null, 0, 0.22); LMP.tramTop = topOf(g);
  p = LMP['vien-hdh']; g = place(buildInstitute(), 'vien-hdh', p[0], p[1], null, 0.6, 0.28); LMP.vienTop = topOf(g);
  p = LMP.yersin; g = place(buildColonial(3.2, 1.8, 2, '#f1c75a', '#c6503a'), 'yersin', p[0], p[1], null, 0, 0.3); LMP.yersinTop = topOf(g);
  p = LMP.ga; var ra = Math.atan2(RAIL[5][0] - RAIL[4][0], RAIL[5][1] - RAIL[4][1]); g = place(buildStation(), 'ga', p[0], p[1], null, ra, 0.3); LMP.gaTop = topOf(g);
  p = LMP['bao-dai']; var bd = new THREE.Group();
  [[0, 0, 3.2, 2.2, 2], [2.8, 1.6, 2.4, 1.8, 1], [-2.6, 1.8, 2.4, 1.8, 1], [0.6, -2.6, 2.2, 1.6, 1]].forEach(function(v, i){ var c = buildColonial(v[2], v[3], v[4], i ? '#f3d27e' : '#f0c868', '#b84a34'); c.position.set(v[0], gy(p[0] + v[0] * 0.3, p[1] + v[1] * 0.3) / 0.3 - gy(p[0], p[1]) / 0.3, v[1]); c.rotation.y = i * 0.4; bd.add(c); });
  g = place(bd, 'bao-dai', p[0], p[1], null, 0, 0.3); LMP.baodaiTop = topOf(g);
  var hd = ISLANDS.filter(function(I){ return I.id === 'hon-do'; })[0], hp = LMP['hon-do'];
  g = place(buildTemple(), 'hon-do', hp[0], hp[1], G.hAt(hp[0], hp[1]) - 0.05, 0.5, 0.32); LMP.hondoTop = topOf(g);
  /* port: jetties + cruise ship */
  [[12.2062,109.2176,12.2082,109.2205,0.7],[12.2048,109.2168,12.2036,109.2196,0.5],[12.2188,109.2392,12.2168,109.2372,0.45],[12.1940,109.2207,12.1946,109.2190,0.35],[12.1798,109.2318,12.1810,109.2306,0.3]].forEach(function(j){
    var a = P(j[0], j[1]), b = P(j[2], j[3]), dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), m = box(j[4], 0.6, L, '#cfc8b8');
    m.position.set((a[0] + b[0]) / 2, 0.32, (a[1] + b[1]) / 2); m.rotation.y = Math.atan2(dx, dz); scene.add(m); JETTIES.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, j[4] / 2, L / 2, Math.atan2(dx, dz)]); });
  var ja = P(12.2062, 109.2176), jb = P(12.2082, 109.2205), jdx = jb[0] - ja[0], jdz = jb[1] - ja[1], jl = Math.hypot(jdx, jdz);
  var cs = buildCruiseShip(); place(cs, 'cang', (ja[0] + jb[0]) / 2 + (-jdz / jl) * -0.95, (ja[1] + jb[1]) / 2 + (jdx / jl) * -0.95, -0.05, Math.atan2(jdx, jdz), 1); LMP.cangTop = 2.2;
  var cg = buildCargoShip(); var cgp = P(12.2420, 109.2470); place(cg, null, cgp[0], cgp[1], 0, 0.9, 1);
}

function buildCable(){
  var A = LMP.cableA, B = LMP.cableB, ya = gy(A[0], A[1]), yb = gy(B[0], B[1]);
  place(buildCableStation(), 'cap-treo', A[0], A[1], ya, Math.atan2(B[0] - A[0], B[1] - A[1]) + Math.PI / 2, 1);
  place(buildCableStation(), 'cap-treo', B[0], B[1], yb, Math.atan2(B[0] - A[0], B[1] - A[1]) + Math.PI / 2, 1);
  var dx = B[0] - A[0], dz = B[1] - A[1], rot = Math.atan2(dx, dz), px = -dz, pz = dx, pl = Math.hypot(px, pz); px /= pl; pz /= pl;
  var sup = [new THREE.Vector3(A[0], ya + 1.0, A[1])], NT = 9;
  for (var i = 1; i <= NT; i++){ var f = i / (NT + 1), x = A[0] + dx * f, z = A[1] + dz * f, h = 2.4 + 2.6 * Math.sin(Math.PI * f), base = Math.max(G.hAt(x, z), -0.5);
    var tw = buildCablePylon(h); place(tw, 'cap-treo', x, z, base, rot, 1); sup.push(new THREE.Vector3(x, base + h + 0.05, z)); }
  sup.push(new THREE.Vector3(B[0], yb + 1.0, B[1]));
  LMP.cableMid = sup[5].clone().setY(sup[5].y + 0.8); LMP.cableFocus = new THREE.Vector3(A[0] + dx * 0.5, 2, A[1] + dz * 0.5);
  var cm = mat('#3a3f47'), GC = ['#f2592c','#ffd23f','#3fb6c9','#ffffff','#ff8fab','#7bd389','#4d7cf0'];
  [-1, 1].forEach(function(k, ci){ var pts = [];
    for (var s = 0; s < sup.length - 1; s++){ var p0 = sup[s].clone(), p1 = sup[s + 1].clone(); p0.x += px * 0.62 * k; p0.z += pz * 0.62 * k; p1.x += px * 0.62 * k; p1.z += pz * 0.62 * k;
      var sag = p0.distanceTo(p1) * 0.035; for (var j = (s === 0 ? 0 : 1); j <= 12; j++){ var t = j / 12, q = new THREE.Vector3().lerpVectors(p0, p1, t); q.y -= sag * 4 * t * (1 - t); pts.push(q); } }
    var curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 300, 0.025, 4, false), cm));
    for (var n = 0; n < 12; n++){ var g = new THREE.Group(); g.add(at(box(0.025, 0.3, 0.025, '#3a3f47'), 0, -0.15, 0)); g.add(at(box(0.28, 0.26, 0.34, GC[(n + ci * 3) % GC.length]), 0, -0.42, 0)); g.add(at(box(0.29, 0.09, 0.35, '#bfe6f2'), 0, -0.36, 0));
      g.traverse(function(o){ if (o.isMesh) o.castShadow = true; }); g.userData = { curve:curve, off:n / 12, dir:ci === 0 ? 1 : -1 }; scene.add(g); anim.gondolas.push(g); } });
}

function buildResort(){
  var w = LMP.wheel, base = gy(w[0], w[1]), Rw = 1.7, hub = Rw + 0.45, g = new THREE.Group(), leg = '#e7e2d8';
  [-0.3, 0.3].forEach(function(z){ g.add(beam(new THREE.Vector3(-0.9, 0, z), new THREE.Vector3(0, hub, z), 0.05, leg)); g.add(beam(new THREE.Vector3(0.9, 0, z), new THREE.Vector3(0, hub, z), 0.05, leg)); });
  var wh = new THREE.Group(); wh.position.set(0, hub, 0);
  var rim = glowMat('#ffffff', '#ffd27a', 0, 1.3);
  [-0.15, 0.15].forEach(function(z){ var t = new THREE.Mesh(new THREE.TorusGeometry(Rw, 0.04, 6, 48), rim); t.position.z = z; wh.add(t); });
  for (var i = 0; i < 16; i++){ var sp = box(0.025, Rw, 0.025, '#ffffff'), a = i / 16 * Math.PI * 2; sp.position.set(Math.cos(a) * Rw / 2, Math.sin(a) * Rw / 2, 0); sp.rotation.z = a - Math.PI / 2; wh.add(sp); }
  var cabins = [], CC = ['#f2592c','#ffd23f','#3fb6c9','#ff8fab','#7bd389','#4d7cf0'];
  for (var j = 0; j < 16; j++){ var a2 = j / 16 * Math.PI * 2, c = box(0.22, 0.22, 0.22, CC[j % CC.length]); c.position.set(Math.cos(a2) * Rw, Math.sin(a2) * Rw - 0.12, 0); wh.add(c); cabins.push(c); }
  g.add(wh); place(g, 'hon-tre', w[0], w[1], base, -0.9, 1); anim.wheel = { w:wh, cabins:cabins };
  var fun = new THREE.Group(), FC = ['#ff6b6b','#ffd166','#06d6a0','#4cc9f0','#f72585'];
  for (var k = 0; k < 5; k++){ var d = mesh(new THREE.SphereGeometry(0.35 + k * 0.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), FC[k]); d.position.set(Math.cos(k * 1.3) * 1.6, 0, Math.sin(k * 1.3) * 1.1); fun.add(d); }
  var loop = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 40), mat('#e63946')); loop.position.set(0.4, 0.75, -1.6); fun.add(loop);
  var fp = P(12.2228, 109.2430); place(fun, null, fp[0], fp[1], gy(fp[0], fp[1]), 0.3, 1);
}

function buildBridges(){
  var decks = [], rails = [], piers = [], lights = [];
  ROADS_S.concat([RAIL_S]).forEach(function(R){ R.pts.forEach(function(p, i){ if (!p.br) return; var w = R.rail ? 0.5 : R.w + 0.16;
    decks.push({ x:p.x, z:p.z, y:p.y - 0.06, w:w, r:Math.atan2(p.fx, p.fz), c:R.rail ? '#8b7f73' : '#d3cfc6' });
    [-1, 1].forEach(function(s){ rails.push({ x:p.x - p.fz * s * w / 2, z:p.z + p.fx * s * w / 2, y:p.y, r:Math.atan2(p.fx, p.fz), c:R.rail ? '#7a3b2e' : '#f4f4f4', hh:R.rail ? 0.16 : 0.07 }); });
    if (i % 4 === 0) piers.push({ x:p.x, z:p.z, y:-1.4, r:Math.atan2(p.fx, p.fz), w:w * 0.8 });
    if (!R.rail && i % 3 === 0) lights.push(p.x - p.fz * w / 2, p.y + 0.3, p.z + p.fx * w / 2, p.x + p.fz * w / 2, p.y + 0.3, p.z - p.fx * w / 2); }); });
  var bx = new THREE.BoxGeometry(1, 1, 1);
  instChunks(bx, mat('#ffffff'), decks, function(d, it, c){ d.position.set(it.x, it.y, it.z); d.rotation.y = it.r; d.scale.set(it.w, 0.12, 0.53); c.set(it.c); });
  instChunks(bx, mat('#ffffff'), rails, function(d, it, c){ d.position.set(it.x, it.y + it.hh / 2, it.z); d.rotation.y = it.r; d.scale.set(0.03, it.hh, 0.52); c.set(it.c); });
  instChunks(bx, mat('#bdb6a6'), piers, function(d, it){ d.position.set(it.x, it.y + 0.95, it.z); d.rotation.y = it.r; d.scale.set(it.w, 1.9, 0.18); });
  return lights; }

function buildCity(B){
  var winT = winTex(2, 2, { mx:6, my:7, wh:13, balcony:true, glass:'#8aaabd', seed:1 }), winTw = winTex(4, 4, { mx:5, my:6, wh:17, glass:'#7ea4bd', seed:2 }), winM = winTex(4, 4, { mx:7, my:8, wh:12, glass:'#93aebd', balcony:true, seed:3 });
  var tubeMat = bmat(winT, 0.75), towerMat = bmat(winTw, 1.0), midMat = bmat(winM, 0.8);
  TUBE_F.forEach(function(f){ instChunks(boxUV(1, f / 2, true), tubeMat, B.tubes.filter(function(t){ return t.f === f; }), function(d, it, c){ d.position.set(it.x, it.y, it.z); d.rotation.y = it.r; d.scale.set(it.w, it.h, it.d); c.set(it.c); }); });
  TOWER_F.forEach(function(f){ instChunks(boxUV(1.5, f / 4, false), towerMat, B.towers.filter(function(t){ return t.f === f; }), function(d, it, c){ d.position.set(it.x, it.y, it.z); d.rotation.y = it.r; d.scale.set(it.w, it.h, it.d); c.set(it.c); }, { pad:8 }); });
  MID_F.forEach(function(f){ instChunks(boxUV(1.5, f / 4, false), midMat, B.mids.filter(function(t){ return t.f === f; }), function(d, it, c){ d.position.set(it.x, it.y, it.z); d.rotation.y = it.r; d.scale.set(it.w, it.h, it.d); c.set(it.c); }); });
  var bx = new THREE.BoxGeometry(1, 1, 1); bx.translate(0, 0.5, 0);
  instChunks(bx, mat('#9aa3a8'), B.towers, function(d, it){ d.position.set(it.x, it.y + it.h, it.z); d.rotation.y = it.r; d.scale.set(it.w * 0.55, 0.12, it.d * 0.45); });
  instChunks(bx, mat('#54c6e0', { roughness:0.2 }), B.towers.filter(function(t){ return t.pool; }), function(d, it){ d.position.set(it.x, it.y + it.h, it.z); d.rotation.y = it.r; d.translateZ(it.d * 0.22); d.scale.set(it.w * 0.6, 0.03, it.d * 0.3); }, { cast:false });
  instChunks(tankGeo, mat('#e3e7ec', { metalness:0.6, roughness:0.3 }), B.tanks, function(d, it){ d.position.set(it.x, it.y, it.z); });
  var houseMat = glowMat('#ffffff', '#ffb35c', 0, 0.16);
  instChunks(bx, houseMat, B.villas, function(d, it, c){ d.position.set(it.x, it.y, it.z); d.rotation.y = it.r; d.scale.set(it.w, it.h, it.d); c.set(it.c); });
  var roofGeo = new THREE.ConeGeometry(0.75, 1, 4); roofGeo.rotateY(Math.PI / 4); roofGeo.translate(0, 0.5, 0);
  instChunks(roofGeo, mat('#ffffff', { flatShading:true }), B.villas.filter(function(v){ return v.roof; }), function(d, it, c){ d.position.set(it.x, it.y + it.h, it.z); d.rotation.y = it.r; d.scale.set(it.w, 0.16 + it.w * 0.25, it.d); c.set(it.rc); });
}

function buildVegetation(T, B){
  var forest = [], round = [];
  T.round.forEach(function(t){ if (t.y > 1.1 && G.zoneAt(t.x, t.z) < 10) forest.push(t); else round.push(t); });
  B.yard.forEach(function(p){ var y = G.hAt(p.x, p.z); if (y > 0.3 && !MK(p.x, p.z)) round.push({ x:p.x, z:p.z, y:y, s:0.22 + ih(p.x * 10, p.z * 10) * 0.12, a:0, sq:1 }); });
  ROADS_S.forEach(function(R){ R.pts.forEach(function(p, i){ if (i % 3 || p.br) return; [-1, 1].forEach(function(s){ var x = p.x - p.fz * s * (R.w / 2 + 0.2), z = p.z + p.fx * s * (R.w / 2 + 0.2), y = G.hAt(x, z), zn = G.zoneAt(x, z);
      if (y > 0.36 && (zn >= 10 || zn === 1) && coastX(z) - x > 2.3) round.push({ x:x, z:z, y:y, s:0.2 + ih(i, s + 5) * 0.06, a:0, sq:1 }); }); }); });
  var TC = ['#5f9e48','#4f9140','#6aa84f','#3f8636','#78ad52','#58923f'], FC = ['#4a8a3c','#3f7d36','#56913f','#467f35','#5a8f3e','#6d9442','#7f9a4a'];
  instChunks(forestGeo, VCM, forest, function(d, it, c){ d.position.set(it.x, it.y - 0.05, it.z); d.rotation.y = it.a; d.scale.set(it.s, it.s * it.sq, it.s); c.set(FC[(ih(it.x * 7, it.z * 3) * FC.length) | 0]); });
  instChunks(canopyGeo, VCM, round, function(d, it, c){ d.position.set(it.x, it.y - 0.02, it.z); d.rotation.y = it.a; d.scale.setScalar(it.s * 1.5); c.set(TC[(ih(it.x * 5, it.z * 9) * TC.length) | 0]); });
  instChunks(coneTreeGeo, VCM, T.cones, function(d, it, c){ d.position.set(it.x, it.y - 0.05, it.z); d.rotation.y = it.a; d.scale.setScalar(it.s * 1.4); c.set(['#3e7a38','#356f31','#4a8a3e'][(ih(it.x, it.z) * 3) | 0]); });
  var palms = T.palms.slice();
  function palmLine(lat0, lat1, off, stepL){ for (var z = P(lat0, 0)[1]; z <= P(lat1, 0)[1]; z += stepL){ var x = coastX(z) - off; if (!MK(x, z) || true){ var y = G.hAt(x, z); if (y > 0.25) palms.push({ x:x, z:z, y:y, s:0.95 + ih(z * 10, off * 10) * 0.35, a:ih(z * 3, 7) * 6.28, t:(ih(z * 5, 3) - 0.5) * 0.25 }); } } }
  palmLine(12.2620, 12.2104, 1.22, 0.42); palmLine(12.2620, 12.2104, 2.05, 0.5); palmLine(12.2985, 12.2668, 1.15, 0.55);
  var keepClear = function(p){ for (var i = 0; i < KEEP.length; i++) if (Math.hypot(p.x - KEEP[i][0], p.z - KEEP[i][1]) < KEEP[i][2] * 0.8) return false; return true; };
  palms = palms.filter(keepClear);
  instChunks(palmGeo, VCM, palms, function(d, it, c){ d.position.set(it.x, it.y - 0.02, it.z); d.rotation.set(it.t, it.a, 0); d.scale.setScalar(it.s); c.set(['#ffffff','#eef6df','#f6f1e2'][(ih(it.x * 3, it.z) * 3) | 0]); });
  var umb = [], lounge = [], UC = ['#f2592c','#3fb6c9','#ffd23f','#ffffff','#ff8fab','#2a9d8f'];
  for (var z = P(12.2600, 0)[1]; z <= P(12.2125, 0)[1]; z += 0.2){ var sec = ih(Math.floor(z / 6), 4); if (sec < 0.25) continue; var x = coastX(z) - 0.42 - ih(z * 13, 1) * 0.42, y = G.hAt(x, z); if (y < 0.08) continue;
    var col = UC[(Math.floor(z / 6) * 7 + 3) % UC.length]; umb.push({ x:x, z:z, y:y, c:col }); lounge.push({ x:x + 0.07, z:z + 0.03, y:y }, { x:x + 0.07, z:z - 0.05, y:y }); }
  instChunks(umbGeo, VCM, umb, function(d, it, c){ d.position.set(it.x, it.y, it.z); d.scale.setScalar(1.25); c.set(it.c); }, { cast:true });
  var lg = new THREE.BoxGeometry(0.09, 0.02, 0.035); lg.translate(0, 0.02, 0);
  instChunks(lg, mat('#fbfbf7'), lounge, function(d, it){ d.position.set(it.x, it.y, it.z); }, { cast:false });
}

function buildBoats(){
  var hulls = [], coracles = [], HC = ['#2f6fd6','#1f8fb0','#2a5fae','#3d86c6','#1e7a9e','#2b9bb8'];
  function okW(x, z, r){ return G.hAt(x, z) < -0.32 && G.hAt(x + r, z) < -0.25 && G.hAt(x - r, z) < -0.25 && G.hAt(x, z + r) < -0.25 && G.hAt(x, z - r) < -0.25; }
  function cluster(lat, lon, rad, n, list, align){ var c = P(lat, lon), tries = 0, made = 0; while (made < n && tries < n * 30){ tries++; var a = ih(tries, lat * 1e4) * Math.PI * 2, r = Math.sqrt(ih(lon * 1e4, tries)) * rad, x = c[0] + Math.cos(a) * r, z = c[1] + Math.sin(a) * r;
      if (!inBoard(x, z, 2) || !okW(x, z, 0.28)) continue; var ok = true; for (var k = list.length - 1; k >= Math.max(0, list.length - 60); k--){ if (Math.hypot(list[k].x - x, list[k].z - z) < 0.36){ ok = false; break; } } if (!ok) continue;
      list.push({ x:x, z:z, r:align != null ? align + (ih(tries, 3) - 0.5) * 0.5 : ih(tries, 9) * 6.28, c:HC[(ih(x * 9, z * 9) * HC.length) | 0], ph:ih(x, z) * 6.28 }); made++; } }
  cluster(12.1962, 109.2068, 6, LITE ? 50 : 110, hulls, 0.7); cluster(12.2632, 109.2010, 3.2, LITE ? 20 : 40, hulls, Math.PI / 2); cluster(12.2632, 109.1975, 2.5, 18, hulls, Math.PI / 2);
  cluster(12.2058, 109.2192, 2.2, 10, hulls); cluster(12.1966, 109.2888, 3, 18, hulls, 0); cluster(12.1942, 109.2194, 2.4, 12, hulls); cluster(12.2775, 109.2098, 2.4, 8, hulls);
  cluster(12.1950, 109.2102, 3.5, LITE ? 30 : 60, coracles); cluster(12.2628, 109.2030, 2.5, 25, coracles); cluster(12.2748, 109.2098, 2.5, 15, coracles); cluster(12.1946, 109.2190, 2, 15, coracles);
  anim.boats = hulls;
  anim.hullIM = dynInst(boatHullGeo, VCM, hulls.length); anim.topIM = dynInst(boatTopGeo, VCM, hulls.length);
  hulls.forEach(function(b, i){ _c.set(b.c); anim.hullIM.setColorAt(i, _c); _c.set('#ffffff'); anim.topIM.setColorAt(i, _c); });
  instChunks(coracleGeo, VCM, coracles, function(d, it, c){ d.position.set(it.x, 0.02, it.z); d.rotation.y = it.r; c.set(['#3c5d93','#2f4f7f','#4a6aa0'][(ih(it.x, it.z) * 3) | 0]); }, { cast:false });
  /* floating fish farms */
  var cells = [], huts = [];
  [[12.1915,109.2186,7,4,0.6],[12.1862,109.2262,5,4,0.3],[12.1968,109.2878,6,3,0.1],[12.1972,109.2640,5,3,-0.2],[12.1788,109.2272,4,3,0.5],[12.1950,109.3040,4,3,0.8]].forEach(function(f){
    var c = P(f[0], f[1]), ca = Math.cos(f[4]), sa = Math.sin(f[4]), S = 0.34;
    for (var i = 0; i < f[2]; i++) for (var j = 0; j < f[3]; j++){ var u = (i - f[2] / 2) * S, v = (j - f[3] / 2) * S, x = c[0] + u * ca - v * sa, z = c[1] + u * sa + v * ca; if (G.hAt(x, z) > -0.3) continue;
      cells.push({ x:x, z:z, r:-f[4] }); if ((i * 7 + j * 3) % 9 === 0) huts.push({ x:x, z:z, r:-f[4] }); } });
  var fr = merge([[new THREE.BoxGeometry(0.34, 0.03, 0.03), MX(0, 0.03, 0.155), '#8b6b4a'], [new THREE.BoxGeometry(0.34, 0.03, 0.03), MX(0, 0.03, -0.155), '#8b6b4a'], [new THREE.BoxGeometry(0.03, 0.03, 0.34), MX(0.155, 0.03, 0), '#8b6b4a'], [new THREE.BoxGeometry(0.03, 0.03, 0.34), MX(-0.155, 0.03, 0), '#8b6b4a'], [new THREE.CylinderGeometry(0.03, 0.03, 0.05, 6), MX(0.155, 0.02, 0.155), '#2f6fb0']]);
  instChunks(fr, VCM, cells, function(d, it){ d.position.set(it.x, 0, it.z); d.rotation.y = it.r; }, { cast:false });
  var hut = merge([[new THREE.BoxGeometry(0.2, 0.12, 0.16), MX(0, 0.1, 0), '#a5835f'], [new THREE.ConeGeometry(0.17, 0.08, 4), MX(0, 0.2, 0, 0, Math.PI / 4, 0), '#3d6f9e']]);
  instChunks(hut, VCM, huts, function(d, it){ d.position.set(it.x, 0, it.z); d.rotation.y = it.r; });
  /* moving boats */
  function route(ll, mk, speed, loop){ var pts = LLs(ll).map(function(p){ return new THREE.Vector3(p[0], 0, p[1]); }), curve = new THREE.CatmullRomCurve3(pts, !!loop, 'centripetal');
    var g = mk(); scene.add(g); g.traverse(function(o){ if (o.isMesh) o.castShadow = true; }); anim.movers.push({ g:g, curve:curve, len:curve.getLength(), sp:speed, loop:!!loop, t:ih(pts.length, speed * 100) }); }
  route([[12.2048,109.2195],[12.2090,109.2262],[12.2152,109.2345]], ferryBoat, 0.7);
  route([[12.2040,109.2188],[12.1992,109.2196],[12.1950,109.2198]], ferryBoat, 0.6);
  route([[12.2040,109.2200],[12.2000,109.2350],[12.1880,109.2600],[12.1760,109.2850],[12.1690,109.2955]], speedBoat, 2.6);
  route([[12.2035,109.2198],[12.2000,109.2300],[12.1950,109.2345],[12.1860,109.2342],[12.1812,109.2320]], speedBoat, 2.0);
  route([[12.2300,109.2100],[12.2450,109.2250],[12.2550,109.2250],[12.2500,109.2120]], function(){ return fishingBoat('#ffffff', '#2f8f9a', 2.2); }, 0.45, true);
  route([[12.1955,109.2100],[12.1880,109.2150],[12.1700,109.2200]], function(){ return fishingBoat('#2f6fd6', '#d9483b', 1.6); }, 0.5);
  route([[12.2500,109.2600],[12.2480,109.2900],[12.2400,109.3150]], function(){ return fishingBoat('#1f8fb0', '#ffd23f', 1.6); }, 0.4);
  route([[12.2420,109.2150],[12.2480,109.2300],[12.2580,109.2280],[12.2540,109.2120]], sailBoat, 0.35, true);
  route([[12.2250,109.2200],[12.2300,109.2320],[12.2200,109.2330],[12.2170,109.2230]], sailBoat, 0.3, true);
  route([[12.2700,109.2200],[12.2780,109.2350],[12.2650,109.2400]], sailBoat, 0.3, true);
  /* parasailing off Trần Phú */
  var pb = fishingBoat('#ffffff', '#e0473a', 1.3); scene.add(pb);
  var chute = new THREE.Group(), cm = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color:'#ff5d73', side:THREE.DoubleSide, roughness:0.8 }));
  cm.scale.set(1, 0.45, 0.7); chute.add(cm); chute.add(at(sph(0.05, '#2b2d42', 6, 4), 0, -0.55, 0)); scene.add(chute);
  var lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  var line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color:'#444444' })); line.frustumCulled = false; scene.add(line);
  anim.parasail = { boat:pb, chute:chute, line:line, c:P(12.2345, 109.2050) };
}

function buildTraffic(){
  var vehGeo = { moto: merge([[new THREE.BoxGeometry(0.04, 0.04, 0.12), MX(0, 0.04, 0), '#ffffff'], [new THREE.BoxGeometry(0.036, 0.05, 0.035), MX(0, 0.085, -0.01), '#3b3b3b'], [new THREE.SphereGeometry(0.02, 6, 4), MX(0, 0.125, -0.005), '#f2f2f2']]),
    car: merge([[new THREE.BoxGeometry(0.1, 0.05, 0.21), MX(0, 0.04, 0), '#ffffff'], [new THREE.BoxGeometry(0.088, 0.04, 0.11), MX(0, 0.085, -0.01), '#cfe0ea']]),
    bus: merge([[new THREE.BoxGeometry(0.12, 0.11, 0.44), MX(0, 0.075, 0), '#ffffff'], [new THREE.BoxGeometry(0.124, 0.035, 0.42), MX(0, 0.095, 0), '#3d4a57']]) };
  var NV = LITE ? 240 : 560, roads = ROADS_S.filter(function(R){ return R.L > 4; }), tot = roads.reduce(function(s, R){ return s + R.L; }, 0), rv = mulberry32(5);
  var V = { moto:[], car:[], bus:[] }, MC = ['#d62828','#1d3557','#f1faee','#2a2a2a','#457b9d','#e9c46a','#8d99ae','#e76f51'], CC = ['#ffffff','#c0c4c8','#d62828','#1d3557','#2a2a2a','#e9ecef','#3a86ff'], BC = ['#2f8f5f','#e0a020','#2e6fb5','#e85d04'];
  for (var i = 0; i < NV; i++){ var pick = rv() * tot, R = roads[0]; for (var k = 0; k < roads.length; k++){ if (pick < roads[k].L){ R = roads[k]; break; } pick -= roads[k].L; }
    var r = rv(), type = r < 0.74 ? 'moto' : (r < 0.95 ? 'car' : 'bus');
    var pal = type === 'moto' ? MC : (type === 'car' ? CC : BC);
    V[type].push({ R:R, s:rv() * R.L, dir:rv() < 0.5 ? 1 : -1, sp:(type === 'moto' ? 0.42 : type === 'car' ? 0.5 : 0.36) * (0.8 + rv() * 0.4), l:rv(), c:pal[(rv() * pal.length) | 0], len:type === 'bus' ? 0.44 : type === 'car' ? 0.21 : 0.12 }); }
  var all = []; ['moto', 'car', 'bus'].forEach(function(t){ var im = dynInst(vehGeo[t], VCM, V[t].length, t !== 'moto'); V[t].forEach(function(v, i){ v.im = im; v.k = i; _c.set(v.c || '#ffffff'); im.setColorAt(i, _c); all.push(v); }); });
  var pos = new Float32Array(all.length * 6), col = new Float32Array(all.length * 6);
  all.forEach(function(v, i){ col.set([1, 0.93, 0.78, 1, 0.16, 0.12], i * 6); });
  carPts = glowPoints(pos, col, 0.22); anim.vehicles = { list:all, pos:pos };
  /* train */
  var tg = merge([[new THREE.BoxGeometry(0.16, 0.15, 0.56), MX(0, 0.12, 0), '#ffffff'], [new THREE.BoxGeometry(0.162, 0.035, 0.54), MX(0, 0.13, 0), '#2b3a55']]);
  var tim = dynInst(tg, VCM, 10); var TCOL = ['#d23c2a', '#2f6fb5', '#2f6fb5', '#f2f2f2', '#2f6fb5', '#2f6fb5', '#f2f2f2', '#2f6fb5', '#2f6fb5', '#2f6fb5'];
  TCOL.forEach(function(c, i){ _c.set(c); tim.setColorAt(i, _c); });
  anim.train = { im:tim, s:20, dir:1, wait:0 };
}

function buildLamps(bridgeLights){
  var pos = bridgeLights.slice();
  ROADS_S.forEach(function(R){ R.pts.forEach(function(p, i){ if (i % 2 || p.br) return; var s = (i / 2) % 2 ? 1 : -1, off = R.w / 2 + 0.1; pos.push(p.x - p.fz * s * off, p.y + 0.3, p.z + p.fx * s * off); }); });
  for (var z = P(12.2620, 0)[1]; z <= P(12.2104, 0)[1]; z += 0.9){ var x = coastX(z) - 1.65; pos.push(x, G.hAt(x, z) + 0.28, z); }
  DIST.forEach(function(D){ if (D.style === 'village') return; var us = [], vs = []; D.poly.forEach(function(p){ var l = toLocal(D, p[0], p[1]); us.push(l[0]); vs.push(l[1]); });
    var u0 = Math.min.apply(null, us), u1 = Math.max.apply(null, us), v0 = Math.min.apply(null, vs), v1 = Math.max.apply(null, vs), st = D.style === 'city' ? 1.05 : 1.6;
    for (var i = Math.ceil(u0 / D.su); i * D.su <= u1; i++) for (var v = v0; v <= v1; v += st){ var w = toWorld(D, i * D.su, v); if (G.zoneAt(w[0], w[1]) === 10 + D.i) pos.push(w[0], G.hAt(w[0], w[1]) + 0.24, w[1]); }
    for (var j = Math.ceil(v0 / D.sv); j * D.sv <= v1; j++) for (var u = u0; u <= u1; u += st){ var w2 = toWorld(D, u, j * D.sv); if (G.zoneAt(w2[0], w2[1]) === 10 + D.i) pos.push(w2[0], G.hAt(w2[0], w2[1]) + 0.24, w2[1]); } });
  lampPts = glowPoints(pos, null, 0.5, '#ffcf8a'); }

function buildSky(){
  var cm = new THREE.MeshStandardMaterial({ color:'#ffffff', roughness:1, emissive:'#ffffff', emissiveIntensity:0.2, transparent:true, opacity:0.92 }), cg = new THREE.IcosahedronGeometry(1, 2), rc = mulberry32(11);
  for (var i = 0; i < (LITE ? 8 : 13); i++){ var g = new THREE.Group(), n = 4 + Math.floor(rc() * 4);
    for (var j = 0; j < n; j++){ var s = 3 + rc() * 5, m = new THREE.Mesh(cg, cm); m.scale.set(s, s * 0.62, s); m.position.set((j - n / 2) * (3 + rc() * 2.5), rc() * 1.5, (rc() - 0.5) * 4); m.castShadow = true; g.add(m); }
    g.position.set(BX0 + rc() * BW, 42 + rc() * 16, BZ0 + rc() * BD); g.userData.sp = 0.6 + rc() * 0.8; scene.add(g); anim.clouds.push(g); }
  anim.cloudMat = cm;
  var bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.16, 0.04, -0.05, -0.05, 0, 0.02, 0, 0, 0, 0.16, 0.04, -0.05, 0.05, 0, 0.02], 3)); bg.computeVertexNormals();
  var birds = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color:'#f7f7f2', side:THREE.DoubleSide }), 40); birds.frustumCulled = false; scene.add(birds);
  var bl = []; for (var b = 0; b < 40; b++){ var c = b < 22 ? P(12.2745, 109.2112) : P(12.2068, 109.2205); bl.push({ cx:c[0], cz:c[1], r:2 + rc() * 4, h:2.5 + rc() * 3, sp:(0.25 + rc() * 0.3) * (rc() < 0.5 ? 1 : -1), a:rc() * 6.28, f:rc() * 6 }); }
  anim.birds = { im:birds, list:bl };
}

/* ======================= TIME OF DAY ======================= */
function C(h){ return new THREE.Color(h); }
var TOD = [
  { top:'#4fb6e6', mid:'#9fdcf0', bot:'#e6f8f3', fog:'#d4eff2', hs:'#e3f6ff', hg:'#93a46a', hi:0.72, sun:'#fff1d6', si:1.35, sp:[0.55, 0.78, 0.3], sh:'#3fc8cf', dp:'#0f5f8c', foam:'#ffffff', sky:'#bfe6f5', cloud:'#ffffff', exp:1.05, lamp:0, glow:0 },
  { top:'#27306a', mid:'#9b5d8f', bot:'#ffad74', fog:'#d9958a', hs:'#9a8fe0', hg:'#3a3550', hi:0.58, sun:'#ffad6b', si:1.1, sp:[-0.8, 0.32, -0.2], sh:'#4aa6b8', dp:'#1b3b6a', foam:'#ffe2cf', sky:'#f3a383', cloud:'#ffcdbd', exp:1.05, lamp:0.75, glow:0.6 },
  { top:'#070d22', mid:'#132042', bot:'#2a3762', fog:'#141c38', hs:'#5d74b8', hg:'#141826', hi:0.5, sun:'#9fb4ff', si:0.32, sp:[0.3, 0.85, -0.45], sh:'#1d4a66', dp:'#071b33', foam:'#7f93b5', sky:'#22305a', cloud:'#3a4670', exp:1.15, lamp:1, glow:1 }
].map(function(t){ var o = {}; for (var k in t) o[k] = typeof t[k] === 'string' ? C(t[k]) : t[k]; o.sp = new THREE.Vector3(t.sp[0], t.sp[1], t.sp[2]).normalize(); return o; });
var tod = 0, todTarget = 0, todUser = false, sunDir = new THREE.Vector3(), lampK = 0, _t1 = new THREE.Color(), _t2 = new THREE.Color(), _t3 = new THREE.Color();
function applyTod(k){
  var i = k <= 1 ? 0 : 1, f = k - i, a = TOD[i], b = TOD[i + 1];
  _t1.lerpColors(a.top, b.top, f); _t2.lerpColors(a.mid, b.mid, f); _t3.lerpColors(a.bot, b.bot, f);
  stage.style.background = 'linear-gradient(180deg,#' + _t1.getHexString() + ' 0%,#' + _t2.getHexString() + ' 55%,#' + _t3.getHexString() + ' 100%)';
  scene.fog.color.lerpColors(a.fog, b.fog, f);
  hemi.color.lerpColors(a.hs, b.hs, f); hemi.groundColor.lerpColors(a.hg, b.hg, f); hemi.intensity = lerp(a.hi, b.hi, f);
  sun.color.lerpColors(a.sun, b.sun, f); sun.intensity = lerp(a.si, b.si, f); sunDir.lerpVectors(a.sp, b.sp, f).normalize();
  renderer.toneMappingExposure = lerp(a.exp, b.exp, f);
  if (waterU){ waterU.uShallow.value.lerpColors(a.sh, b.sh, f); waterU.uDeep.value.lerpColors(a.dp, b.dp, f); waterU.uFoam.value.lerpColors(a.foam, b.foam, f); waterU.uSky.value.lerpColors(a.sky, b.sky, f); }
  if (anim.cloudMat){ anim.cloudMat.color.lerpColors(a.cloud, b.cloud, f); anim.cloudMat.emissive.copy(anim.cloudMat.color); }
  if (typeof crowdU !== 'undefined'){ var cl = crowdU.uLight.value; cl.copy(hemi.color).multiplyScalar(hemi.intensity * 0.95); _t1.copy(sun.color).multiplyScalar(sun.intensity * 0.45); cl.add(_t1); cl.r = Math.max(cl.r, 0.3); cl.g = Math.max(cl.g, 0.33); cl.b = Math.max(cl.b, 0.45); }
  var gk = lerp(a.glow, b.glow, f); glowMats.forEach(function(g){ g.m.emissiveIntensity = g.base + (g.peak - g.base) * gk; });
  lampK = lerp(a.lamp, b.lamp, f); if (lampPts){ lampPts.material.opacity = lampK; lampPts.visible = lampK > 0.01; } if (carPts){ carPts.material.opacity = lampK * 0.9; carPts.visible = lampK > 0.01; }
  shadowDirty = true;
}
