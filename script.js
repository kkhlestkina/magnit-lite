(() => {
  'use strict';
  const config = window.PROTOTYPE;
  const stage = document.querySelector('#stage');
  const status = document.querySelector('#status');
  const picker = document.querySelector('#screens');
  const measure = document.querySelector('#measure');
  const output = document.querySelector('#coordinates');
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  let current, serial = 0, trail = [], dragging = null, surface, overlayBase, scroller;
  const positions = new Map();
  let favoriteTaskCompleted = false;
  function validate() {
    if (!config?.screens?.[config.start]) throw Error('Не задан стартовый экран.');
    for (const [id, screen] of Object.entries(config.screens)) {
      if (!(screen.width > 0 && screen.height > 0 && screen.image)) throw Error(`Проверь размеры и изображение: ${id}`);
      for (const h of screen.hotspots || []) {
        if (!h.label || ![h.x, h.y, h.width, h.height].every(Number.isFinite) || h.x < 0 || h.y < 0 || h.width <= 0 || h.height <= 0 || h.x + h.width > screen.width || h.y + h.height > screen.height) throw Error(`Проверь область: ${id} / ${h.label || '?'}`);
        if (h.to ? !config.screens[h.to] : !['back', 'home', 'beauty', 'restart'].includes(h.action)) throw Error(`Неизвестный переход: ${id} / ${h.label}`);
      }
    }
  }
  function place(el, rect, screen) {
    for (const key of ['x', 'y', 'width', 'height']) el.style[{x:'left',y:'top',width:'width',height:'height'}[key]] = `${rect[key] / (key === 'x' || key === 'width' ? screen.width : screen.height) * 100}%`;
  }
  function navigate(id, mode = 'push') {
    const categoryScroll = scroller?.scrollTop || 0;
    if (current && !config.screens[current].overlay) overlayBase = current;
    dragging = null;
    if (current && !config.screens[current].overlay && scroller) positions.set(current, scroller.scrollTop);
    if (mode === 'push' && current) trail.push(current);
    if (mode === 'restart') { trail = []; positions.clear(); favoriteTaskCompleted = false; }
    if (mode === 'home') { trail = []; positions.clear(); }
    const screen = config.screens[id];
    current = id;
    const token = ++serial;
    picker.value = id;
    document.title = `${screen.title} — Magnit`;
    document.querySelector('#app').style.maxWidth = `${screen.width}px`;
    stage.replaceChildren();
    const base = config.screens[overlayBase || config.start];
    stage.style.aspectRatio = `${screen.width} / ${config.viewportHeight || 740}`;
    scroller = null;
    if (screen.overlay) {
      const backgroundViewport = document.createElement('div');
      backgroundViewport.className = 'screen-scroll overlay-background';
      const background = new Image();
      background.src = base.image; background.alt = ''; background.className = 'screen-image';
      background.width = base.width; background.height = base.height;
      if (base.viewportCrop) {
        background.style.height = '100%'; background.style.position = 'absolute';
        background.style.objectFit = 'cover'; background.style.objectPosition = 'top';
      }
      const backgroundSurface = document.createElement('div');
      backgroundSurface.className = 'screen-surface';
      backgroundSurface.style.aspectRatio = `${base.width} / ${base.height}`;
      backgroundSurface.append(background);
      backgroundViewport.append(backgroundSurface);
      stage.append(backgroundViewport);
      backgroundViewport.scrollTop = positions.get(overlayBase) || 0;
      const shade = document.createElement('div'); shade.className = 'overlay-shade'; stage.append(shade);
    }
    surface = document.createElement('div');
    surface.className = screen.overlay ? 'screen-surface bottom-sheet' : 'screen-surface';
    surface.style.aspectRatio = `${screen.width} / ${screen.height}`;
    if (screen.overlay) stage.append(surface);
    else {
      scroller = document.createElement('div');
      scroller.className = 'screen-scroll';
      scroller.append(surface);
      stage.append(scroller);
    }
    status.textContent = 'Загрузка…';
    const img = new Image();
    img.className = screen.viewportCrop ? 'screen-image viewport-crop' : 'screen-image';
    img.alt = screen.title;
    img.width = screen.width; img.height = screen.height;
    img.onload = () => {
      if (token !== serial) return;
      const ratioMatches = Math.abs(img.naturalWidth / img.naturalHeight - screen.width / screen.height) <= 0.01;
      const validCrop = screen.viewportCrop && img.naturalHeight / img.naturalWidth >= screen.height / screen.width;
      if (!ratioMatches && !validCrop) {
        status.textContent = 'Размеры картинки не совпадают с конфигом. Проверь width и height.';
        return;
      }
      status.textContent = '';
      surface.append(img);
      for (const h of screen.hotspots || []) {
        const button = document.createElement('button');
        button.className = 'hotspot'; button.type = 'button';
        button.setAttribute('aria-label', h.label);
        place(button, h, screen);
        button.onclick = () => {
          if (h.completesFavoriteTask) favoriteTaskCompleted = true;
          if (h.to) navigate(h.to, h.mode || 'push');
          else if (h.action === 'beauty') navigate(favoriteTaskCompleted ? config.homeAfterFavorite : config.start, 'category');
          else if (h.action === 'home') navigate(favoriteTaskCompleted ? config.homeAfterFavorite : config.start, 'home');
          else if (h.action === 'restart') navigate(config.start, 'restart');
          else navigate(trail.pop() || config.start, 'back');
        };
        surface.append(button);
      }
      stage.focus({ preventScroll: true });
      if (scroller) scroller.scrollTop = mode === 'category' ? categoryScroll : mode === 'back' ? positions.get(id) || 0 : 0;
    };
    img.onerror = () => { if (token === serial) status.textContent = `Не удалось загрузить ${screen.image}. Проверь файл в assets и путь в config.js.`; };
    img.src = screen.image;
  }
  try {
    validate();
    document.body.classList.toggle('debug', debug);
    document.querySelector('#inspector').hidden = !debug;
    for (const [id, s] of Object.entries(config.screens)) picker.add(new Option(s.title, id));
    picker.onchange = () => navigate(picker.value);
    document.querySelector('#restart').onclick = () => navigate(config.start, 'restart');
    measure.onchange = () => stage.classList.toggle('measuring', measure.checked);
    const point = e => {
      const r = surface.getBoundingClientRect(), s = config.screens[current];
      return { x: Math.round(Math.max(0, Math.min(1, (e.clientX-r.left)/r.width))*s.width), y: Math.round(Math.max(0, Math.min(1, (e.clientY-r.top)/r.height))*s.height) };
    };
    const rectangle = p => ({ x: Math.min(p.x, dragging.x), y: Math.min(p.y, dragging.y), width: Math.abs(p.x-dragging.x), height: Math.abs(p.y-dragging.y) });
    stage.onpointerdown = e => {
      if (!debug || !measure.checked) return;
      e.preventDefault(); dragging = point(e); stage.setPointerCapture(e.pointerId);
      document.querySelector('#selection')?.remove();
      const box = document.createElement('div'); box.id = 'selection'; surface.append(box);
    };
    stage.onpointermove = e => { if (dragging) place(document.querySelector('#selection'), rectangle(point(e)), config.screens[current]); };
    stage.onpointerup = e => {
      if (!dragging) return;
      const rect = rectangle(point(e));
      place(document.querySelector('#selection'), rect, config.screens[current]);
      output.value = JSON.stringify({label:'Название кнопки', ...rect, to:'ID_ЭКРАНА'}, null, 2);
      dragging = null;
    };
    stage.onpointercancel = () => { dragging = null; document.querySelector('#selection')?.remove(); };
    navigate(config.start, 'restart');
  } catch (error) { status.textContent = `Ошибка конфигурации: ${error.message}`; }
})();
