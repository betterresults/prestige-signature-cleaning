(function () {
  var el = document.getElementById('london-map');
  if (!el) return;
  var wrap = el.parentNode;
  function load(src, cb) { var s = document.createElement('script'); s.src = src; s.onload = cb; document.head.appendChild(s); }
  function init() {
    var map = L.map(el, { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.1 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    var i = 0, active = null, tip = null;
    var layer = L.geoJSON(window.LONDON_BOROUGHS, {
      style: function () { return { className: 'borough', weight: 1.2, color: '#B08D57', fillColor: '#0D392D', fillOpacity: 0 }; },
      onEachFeature: function (f, lyr) {
        var idx = i++;
        lyr.bindTooltip(f.properties.n, { sticky: true, direction: 'top', className: 'borough-tip', offset: [0, -8] });
        lyr.on('add', function () { if (lyr._path) lyr._path.style.setProperty('--i', idx); });
        lyr.on('mouseover', function () { lyr.bringToFront(); });
        lyr.on('click', function (e) { if (active && active !== lyr && active._path) active._path.classList.remove('active'); active = lyr; lyr.bringToFront(); if (lyr._path) lyr._path.classList.add('active'); if (tip) map.removeLayer(tip); tip = L.tooltip({ permanent: true, direction: 'top', className: 'borough-tip', offset: [0, -8] }).setLatLng(e.latlng).setContent(f.properties.n).addTo(map); });
      }
    }).addTo(map);
    map.fitBounds(layer.getBounds(), { padding: [10, 10] });
    var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { map.invalidateSize(); map.fitBounds(layer.getBounds(), { padding: [10, 10] }); }, 200); });
    requestAnimationFrame(function () { wrap.classList.add('go'); });
  }
  function start() {
    var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
    load('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', function () { load('london-boroughs.js', init); });
  }
  if (!('IntersectionObserver' in window)) { start(); return; }
  var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '300px 0px' });
  io.observe(el);
})();
