(function(){
  function mk(){ var store = {}; var f = function(){};
    return new Proxy(f, {
      get: function(t, k){ if (k === Symbol.toPrimitive) return function(){ return 0; }; if (typeof k === 'symbol') return undefined; if (k === 'then') return undefined;
        if (k in store) return store[k]; var v = mk(); store[k] = v; return v; },
      set: function(t, k, v){ store[k] = v; return true; },
      apply: function(){ return mk(); }, construct: function(){ return mk(); } });
  }
  var T = mk();
  T.WebGLRenderer = function(){ var o = mk(); o.domElement = document.createElement('canvas'); o.capabilities = { maxTextureSize:4096, getMaxAnisotropy:function(){ return 8; } }; o.shadowMap = mk(); return o; };
  T.MathUtils = { degToRad:function(d){ return d * Math.PI / 180; } };
  T.OrbitControls = function(){ var o = mk(); o.addEventListener = function(){}; o.getAzimuthalAngle = function(){ return 0; }; o.target = mk(); return o; };
  T.Clock = function(){ var last = performance.now(), start = last; return { elapsedTime:0, getDelta:function(){ var n = performance.now(), d = (n - last) / 1000; last = n; this.elapsedTime = (n - start) / 1000; return d; } }; };
  window.THREE = T;
})();
