(() => {
  const root = document.getElementById('task-orbit');
  const $ = s => root.querySelector(s);
  const KEY = 'lista-tarefas-v1'; // mesma chave do projeto original: as tarefas antigas continuam aparecendo
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const M = reduce ? .25 : 1;

  /* ---------- dados ---------- */
  const DAY = 864e5;
  const midnight = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const dueDays = t => t.dueDate ? Math.round((new Date(t.dueDate + 'T00:00:00') - midnight()) / DAY) : null;
  const plus = n => { const d = midnight(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv'); };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  const load = () => { try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch { return null; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch {} };
  const mk = (title, priority, category, d, completed = false) =>
    ({ id: uid(), title, completed, priority, category, dueDate: d === null ? '' : plus(d), createdAt: new Date().toISOString() });

  let tasks = load() || [
    mk('Enviar proposta ao cliente', 'alta', 'trabalho', 0),
    mk('Revisar protótipo no Figma', 'media', 'trabalho', 3),
    mk('Estudar processos e threads', 'media', 'estudos', 5),
    mk('Comprar café e filtros', 'baixa', 'compras', null),
    mk('Marcar consulta', 'baixa', 'pessoal', 12),
    mk('Fazer backup do projeto', 'alta', 'outros', -1, true)
  ];
  let st = 'all', cat = 'all';
  const vis = t => (st === 'all' || (st === 'active' ? !t.completed : t.completed)) && (cat === 'all' || t.category === cat);

  const PR = { alta: 0xff5d73, media: 0xffc857, baixa: 0x5ec8ff };
  const PRL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
  const CTL = { trabalho: 'Trabalho', pessoal: 'Pessoal', estudos: 'Estudos', compras: 'Compras', outros: 'Outros' };
  const band = t => { if (t.completed) return 1.75; const d = dueDays(t); return d === null ? 4.7 : d <= 1 ? 2.4 : d <= 7 ? 3.5 : 4.7; };

  /* ---------- cena 3D ---------- */
  const stage = $('.to-stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070b1a, .035);
  const cam = new THREE.PerspectiveCamera(50, 1, .1, 100);
  cam.position.set(0, 2.4, 10);
  const world = new THREE.Group();
  scene.add(world);

  scene.add(new THREE.AmbientLight(0x7688bb, .6));
  const sun = new THREE.PointLight(0xffb454, 2.4, 30);
  scene.add(sun);

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3),
    new THREE.MeshStandardMaterial({ color: 0xffb454, emissive: 0xff8a2b, emissiveIntensity: .9, roughness: .35, metalness: .2 }));
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, wireframe: true, transparent: true, opacity: .3 }));
  world.add(core, shell);
  const hc = document.createElement('canvas'); hc.width = hc.height = 128;
  const hx = hc.getContext('2d'), hg = hx.createRadialGradient(64, 64, 0, 64, 64, 64);
  hg.addColorStop(0, 'rgba(255,255,255,.9)'); hg.addColorStop(.35, 'rgba(255,255,255,.25)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
  hx.fillStyle = hg; hx.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(hc), color: 0xffb454, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: .5, fog: false }));
  world.add(halo);

  [1.75, 2.4, 3.5, 4.7].forEach((r, i) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - .007, r + .007, 160),
      new THREE.MeshBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: i ? .14 : .08, side: THREE.DoubleSide }));
    ring.rotation.x = Math.PI / 2;
    world.add(ring);
  });

  const starPos = new Float32Array(1000 * 3);
  for (let i = 0; i < 1000; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * 6.283, s = Math.sqrt(1 - u * u), r = 22 + Math.random() * 20;
    starPos.set([r * s * Math.cos(a), r * u, r * s * Math.sin(a)], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xb4c4ff, size: .09, transparent: true, opacity: .8, fog: false }));
  scene.add(stars);

  const GEO = {
    trabalho: new THREE.BoxGeometry(.52, .52, .52),
    pessoal: new THREE.SphereGeometry(.33, 28, 28),
    estudos: new THREE.OctahedronGeometry(.42),
    compras: new THREE.TorusGeometry(.27, .1, 16, 36),
    outros: new THREE.IcosahedronGeometry(.37)
  };

  /* objetos relacionados ao texto da tarefa (só formas simples, sem arquivos externos) */
  const nrm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const piece = (g, x = 0, y = 0, z = 0, rx = 0, rz = 0, ry = 0) => { const k = new THREE.Mesh(g); k.position.set(x, y, z); k.rotation.set(rx, ry, rz); return k; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), Cy = (r, h, n = 24) => new THREE.CylinderGeometry(r, r, h, n), Sp = r => new THREE.SphereGeometry(r, 16, 16);
  const ICON = {
    bulb: () => [piece(Sp(.3), 0, .12), piece(Cy(.13, .22), 0, -.26)],
    cart: () => [piece(B(.56, .3, .42), 0, .05), piece(Sp(.08), -.18, -.25), piece(Sp(.08), .18, -.25), piece(B(.06, .34, .06), -.34, .24, 0, 0, .5)],
    book: () => [piece(B(.32, .05, .44), -.16, 0, 0, 0, .28), piece(B(.32, .05, .44), .16, 0, 0, 0, -.28)],
    mail: () => [piece(B(.66, .44, .07)), piece(Cy(.26, .09, 3), 0, .1, .05, Math.PI / 2)],
    cross: () => [piece(B(.66, .22, .22)), piece(B(.22, .66, .22))],
    coin: () => [piece(Cy(.34, .09, 32), 0, 0, 0, Math.PI / 2), piece(new THREE.TorusGeometry(.34, .035, 8, 32))],
    laptop: () => [piece(B(.66, .04, .44), 0, -.16), piece(B(.66, .44, .04), 0, .06, -.22, -.12)],
    house: () => [piece(B(.52, .34, .52), 0, -.14), piece(new THREE.ConeGeometry(.46, .3, 4), 0, .18, 0, 0, 0, Math.PI / 4)]
  };
  const KW = [['bulb', /luz|energia|lampada|eletric|internet/], ['cart', /compra|mercado|feira|loja|cafe/],
    ['mail', /e-?mail|mensagem|cliente|proposta|enviar|responder|reuniao|ligar/], ['cross', /consulta|medic|dentista|saude|remedio|exame|vacina/],
    ['house', /casa|limpar|arrumar|lavar|cozinh|reforma|mudanca|jardim/], ['laptop', /codigo|site|projeto|figma|prototipo|deploy|bug|layout|programar|backup|design/],
    ['book', /estud|livro|prova|aula|faculdade|curso|resumo|ler\b/], ['coin', /pagar|boleto|fatura|conta|imposto|banco|dinheiro|salario|pix/]];
  const iconOf = s => { s = nrm(s); const k = KW.find(([, r]) => r.test(s)); return k && k[0]; };
  const kindOf = t => t.icon === 'forma' ? t.category : t.icon && t.icon !== 'auto' ? t.icon : iconOf(t.title) || t.category || 'outros';
  const build = (key, mat) => {
    if (!ICON[key]) return new THREE.Mesh(GEO[key] || GEO.outros, mat);
    const g = new THREE.Group(); ICON[key]().forEach(k => { k.material = mat; g.add(k); }); g.rotation.x = .25; return g;
  };

  /* progresso do núcleo */
  const prog = { v: 0, grow: reduce ? 1 : 0 };
  const c1 = new THREE.Color(0xffb454), c2 = new THREE.Color(0x6ee7b7), cc = new THREE.Color();
  const applyCore = () => {
    cc.copy(c1).lerp(c2, prog.v);
    core.material.color.copy(cc);
    core.material.emissive.copy(cc).multiplyScalar(.75);
    sun.color.copy(cc);
    halo.material.color.copy(cc);
    shell.material.color.copy(cc).lerp(new THREE.Color(0xffffff), .35);
  };

  /* objetos de tarefa */
  const objs = new Map(), lbls = $('#to-lbls');
  const burst = (p, col) => {
    const n = 40, g = new THREE.BufferGeometry(), arr = new Float32Array(n * 3), dir = [];
    for (let i = 0; i < n; i++) dir.push(new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize().multiplyScalar(.6 + Math.random() * 1.2));
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({ color: col, size: .1, transparent: true });
    const pts = new THREE.Points(g, m);
    world.add(pts);
    const k = { t: 0 };
    gsap.to(k, { t: 1, duration: 1.1, ease: 'power2.out',
      onUpdate() { dir.forEach((d, i) => arr.set([p.x + d.x * k.t, p.y + d.y * k.t, p.z + d.z * k.t], i * 3)); g.attributes.position.needsUpdate = true; m.opacity = 1 - k.t; },
      onComplete() { world.remove(pts); g.dispose(); m.dispose(); } });
  };

  let delay = 0;
  function syncScene(first) {
    const ids = new Set(tasks.map(t => t.id));
    objs.forEach((o, id) => {
      if (ids.has(id)) return;
      objs.delete(id); o.lb.remove();
      gsap.to(o, { s: 0, duration: .45, ease: 'back.in(2)', overwrite: 'auto', onUpdate() { o.mesh.scale.setScalar(Math.max(o.s, 0)); }, onComplete() { world.remove(o.mesh); o.mat.dispose(); } });
    });
    tasks.forEach((t, i) => {
      let o = objs.get(t.id);
      const isNew = !o, key = kindOf(t);
      if (!o || o.key !== key) {
        if (o) { world.remove(o.mesh); o.mat.dispose(); }
        const mat = new THREE.MeshStandardMaterial({ roughness: .3, metalness: .35, transparent: true });
        const mesh = build(key, mat);
        mesh.userData.id = t.id;
        world.add(mesh);
        o = Object.assign(o || { a: Math.random() * 6.283, sp: .3 + Math.random() * .25, ph: Math.random() * 6.283,
          tilt: (Math.random() - .5) * .5, r: band(t) + (first ? 0 : 3), s: 0, h: 0, f: 0, wp: new THREE.Vector3(),
          lb: lbls.appendChild(Object.assign(document.createElement('div'), { className: 'to-lb' })) }, { mesh, mat, key });
        objs.set(t.id, o);
      }
      o.lb.textContent = t.title;
      const col = t.completed ? 0x8ea3c0 : PR[t.priority] || PR.media;
      o.mat.color.setHex(col);
      o.mat.emissive.setHex(col);
      o.mat.emissiveIntensity = t.completed ? .1 : .4;
      const ok = vis(t);
      o.vis = ok;
      gsap.to(o, { r: band(t), duration: 1.2, ease: 'power3.inOut', overwrite: 'auto' });
      gsap.to(o, { s: !ok ? .15 : t.completed ? .55 : 1, duration: isNew ? 1.3 : .5,
        delay: isNew && first ? .5 + i * .09 : 0, ease: isNew ? 'elastic.out(1,.55)' : 'power2.out', overwrite: 'auto' });
      gsap.to(o.mat, { opacity: ok ? 1 : .18, duration: .4 });
    });
    const done = tasks.filter(t => t.completed).length;
    gsap.to(prog, { v: tasks.length ? done / tasks.length : 0, duration: 1.2, ease: 'power2.out', onUpdate: applyCore });
  }

  /* ---------- interação 3D ---------- */
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), tip = $('#to-tip');
  let hover = null, drag = null, moved = 0;
  const mouse = { x: 0, y: 0 };
  const dist = { v: 10 }, sc = { p: 0 };
  let focusId = null;
  function focusTask(id) {
    const o = objs.get(id); if (!o) return;
    focusId = id;
    objs.forEach((x, k) => gsap.to(x, { f: k === id ? 1 : 0, duration: .4 }));
    const tgt = o.a - Math.PI / 2, cur = world.rotation.y;
    gsap.to(world.rotation, { y: tgt + Math.round((cur - tgt) / 6.283) * 6.283, duration: reduce ? .01 : 1.1, ease: 'power3.inOut', overwrite: 'auto' });
    gsap.to(dist, { v: 7.8, duration: 1.1, ease: 'power3.inOut', overwrite: 'auto' });
  }
  function unfocus() {
    if (!focusId) return;
    focusId = null;
    objs.forEach(x => gsap.to(x, { f: 0, duration: .4 }));
    gsap.to(dist, { v: 10, duration: 1, ease: 'power3.inOut', overwrite: 'auto' });
  }

  function setHover(id, ev) {
    if (hover !== id) {
      if (hover && objs.get(hover)) gsap.to(objs.get(hover), { h: 0, duration: .3 });
      root.querySelectorAll('.to-task.hot').forEach(n => n.classList.remove('hot'));
      hover = id;
      if (id && objs.get(id)) {
        gsap.to(objs.get(id), { h: 1, duration: .35, ease: 'back.out(2)' });
        const li = root.querySelector(`.to-task[data-id="${id}"]`);
        if (li) { li.classList.add('hot'); li.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); }
        const t = tasks.find(x => x.id === id);
        tip.firstChild.textContent = t.title;
        tip.lastChild.textContent = `${PRL[t.priority]} · ${CTL[t.category]}${t.completed ? ' · concluída' : ''}`;
      }
      gsap.to(tip, { opacity: id && ev ? 1 : 0, duration: .2 });
      canvas.style.cursor = id ? 'pointer' : 'grab';
    }
    if (id && ev) {
      const b = root.getBoundingClientRect();
      tip.style.left = ev.clientX - b.left + 16 + 'px';
      tip.style.top = ev.clientY - b.top + 16 + 'px';
    }
  }

  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; moved = 0; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    const b = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - b.left) / b.width * 2 - 1;
    mouse.y = -((e.clientY - b.top) / b.height * 2 - 1);
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      moved += Math.abs(dx) + Math.abs(dy);
      world.rotation.y += dx * .006;
      world.rotation.x = Math.max(-.6, Math.min(.6, world.rotation.x + dy * .004));
      drag.x = e.clientX; drag.y = e.clientY;
    }
    ptr.set(mouse.x, mouse.y);
    ray.setFromCamera(ptr, cam);
    const hit = ray.intersectObjects([...objs.values()].map(o => o.mesh), true)[0];
    let n = hit && hit.object; while (n && !n.userData.id) n = n.parent;
    setHover(n ? n.userData.id : null, e);
  });
  canvas.addEventListener('pointerup', () => { if (drag && moved < 5) { if (hover) toggle(hover); else unfocus(); } drag = null; });
  canvas.addEventListener('pointerleave', () => setHover(null));

  /* ---------- ações ---------- */
  function toggle(id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    t.completed = !t.completed;
    const o = objs.get(id);
    if (t.completed && o) burst(o.mesh.position, PR[t.priority]);
    gsap.fromTo(shell.scale, { x: 1.3, y: 1.3, z: 1.3 }, { x: 1, y: 1, z: 1, duration: 1, ease: 'elastic.out(1,.5)' });
    save(); render(); syncScene();
  }
  function remove(ids) {
    tasks = tasks.filter(t => !ids.includes(t.id));
    save(); render(); syncScene();
  }

  /* ---------- painel ---------- */
  const list = $('#to-list'), seen = new Set();
  function render() {
    const total = tasks.length, done = tasks.filter(t => t.completed).length, pct = total ? Math.round(done / total * 100) : 0;
    $('#to-pct').textContent = pct + '%';
    $('#to-cnt').textContent = `${total - done} pendente${total - done === 1 ? '' : 's'} · ${done} concluída${done === 1 ? '' : 's'}`;
    gsap.to($('#to-barfill'), { width: pct + '%', duration: .8, ease: 'power2.out' });

    const rows = tasks.filter(vis).sort((a, b) => {
      const x = dueDays(a) ?? 1e9, y = dueDays(b) ?? 1e9;
      return x - y || b.createdAt.localeCompare(a.createdAt);
    });
    $('#to-empty').hidden = rows.length > 0;
    list.innerHTML = '';
    const fresh = [];
    rows.forEach(t => {
      const d = dueDays(t), li = document.createElement('li');
      li.className = 'to-task' + (t.completed ? ' done' : '') + (t.id === hover ? ' hot' : '');
      li.dataset.id = t.id;
      li.innerHTML = `<input class="to-check" type="checkbox" aria-label="Marcar como concluída" ${t.completed ? 'checked' : ''}>
        <div><span class="to-title"></span><div class="to-meta"><span class="p-${t.priority}">${PRL[t.priority]}</span><span>${CTL[t.category] || 'Outros'}</span>${
          d === null ? '' : `<span class="${d < 0 && !t.completed ? 'late' : ''}">${d < 0 && !t.completed ? 'Vencida' : 'Vence ' + new Date(t.dueDate + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>`}</div></div>
        <button class="to-ed" type="button" aria-label="Editar tarefa">✎</button><button class="to-x" type="button" aria-label="Remover tarefa">×</button>`;
      li.querySelector('.to-title').textContent = t.title;
      list.appendChild(li);
      if (!seen.has(t.id)) { seen.add(t.id); fresh.push(li); }
    });
    if (fresh.length && !reduce) gsap.from(fresh, { x: -24, opacity: 0, duration: .5, stagger: .05, ease: 'power3.out' });
  }

  list.addEventListener('change', e => { const li = e.target.closest('.to-task'); if (li && e.target.matches('.to-check')) toggle(li.dataset.id); });
  list.addEventListener('click', e => {
    const li = e.target.closest('.to-task'); if (!li) return;
    const id = li.dataset.id;
    if (e.target.closest('.to-x')) remove([id]);
    else if (e.target.closest('.to-ed')) edit(id);
    else if (!e.target.closest('input')) focusTask(id);
  });
  function edit(id) {
    const t = tasks.find(x => x.id === id), li = list.querySelector(`.to-task[data-id="${id}"]`);
    if (!t || !li) return;
    li.innerHTML = '<div class="to-edit"><input maxlength="120" aria-label="Título (Enter salva, Esc cancela)"><input type="date" aria-label="Vencimento"></div>';
    const [it, idt] = li.querySelectorAll('input');
    it.value = t.title; idt.value = t.dueDate; it.focus(); it.select();
    li.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      if (e.key === 'Enter' && it.value.trim()) { t.title = it.value.trim(); t.dueDate = idt.value; save(); }
      render(); syncScene();
    });
  }
  list.addEventListener('mouseover', e => { const li = e.target.closest('.to-task'); if (li && li.dataset.id !== hover) setHover(li.dataset.id, null); });
  list.addEventListener('mouseleave', () => setHover(null));

  $('#to-form').addEventListener('submit', e => {
    e.preventDefault();
    const inp = $('#to-in'), title = inp.value.trim();
    if (!title) { inp.focus(); return; }
    tasks.unshift({ id: uid(), title, completed: false, priority: $('#to-pr').value, category: $('#to-ct').value,
      dueDate: $('#to-dt').value || '', icon: $('#to-ic').value, createdAt: new Date().toISOString() });
    inp.value = ''; $('#to-pr').value = 'media'; $('#to-ct').value = 'outros'; $('#to-dt').value = ''; $('#to-ic').value = 'auto';
    save(); render(); syncScene(); inp.focus();
  });
  root.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => {
    st = b.dataset.st;
    root.querySelectorAll('[data-st]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    render(); syncScene();
  }));
  $('#to-cf').addEventListener('change', e => { cat = e.target.value; render(); syncScene(); });
  $('#to-clear').addEventListener('click', () => remove(tasks.filter(t => t.completed).map(t => t.id)));

  /* botão magnético */
  const add = $('.to-add');
  if (!reduce) {
    add.addEventListener('pointermove', e => {
      const b = add.getBoundingClientRect();
      gsap.to(add, { x: (e.clientX - b.left - b.width / 2) * .06, y: (e.clientY - b.top - b.height / 2) * .25, duration: .3 });
    });
    add.addEventListener('pointerleave', () => gsap.to(add, { x: 0, y: 0, duration: .6, ease: 'elastic.out(1,.4)' }));
  }

  /* ---------- loop e layout ---------- */
  const clock = new THREE.Clock();
  let W = 1, H = 1;
  const vv = new THREE.Vector3();
  function tick() {
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    objs.forEach(o => {
      o.a += o.sp * dt * (3 / o.r) * M * (1 - .9 * Math.max(o.h, o.f));
      o.mesh.position.set(Math.cos(o.a) * o.r, Math.sin(o.a + o.ph) * o.r * o.tilt * .5, Math.sin(o.a) * o.r);
      if (!o.mesh.isGroup) o.mesh.rotation.x += dt * .6 * M; o.mesh.rotation.y += dt * .8 * M;
      o.mesh.scale.setScalar(Math.max(o.s, 0) * (1 + .4 * Math.max(o.h, o.f)));
    });
    core.scale.setScalar((.55 + .5 * prog.v) * prog.grow * (1 + .025 * Math.sin(t * 2)));
    core.rotation.y += dt * .2 * M;
    halo.scale.setScalar((4.5 + 2.5 * prog.v) * prog.grow);
    shell.rotation.y -= dt * .15 * M; shell.rotation.x += dt * .08 * M;
    if (!drag && !focusId) world.rotation.y += dt * .05 * M;
    stars.rotation.y += dt * .004 * M;
    cam.position.x += (mouse.x * 1.1 - cam.position.x) * .04;
    cam.position.y += (2.4 + mouse.y * .6 - 1.2 * sc.p - cam.position.y) * .04;
    cam.position.z = dist.v - 3.5 * sc.p;
    cam.lookAt(0, 0, 0);
    // rótulos: só os 4 objetos mais próximos da câmera
    const arr = [...objs.values()];
    arr.forEach(o => { o.mesh.getWorldPosition(o.wp); o.d = o.wp.distanceTo(cam.position); });
    const near = new Set(arr.filter(o => o.vis && o.s > .3).sort((p, q) => p.d - q.d).slice(0, 4));
    arr.forEach(o => {
      const on = near.has(o) && o.h < .5;
      o.lb.style.opacity = on ? .85 : 0;
      if (on) { vv.copy(o.wp).project(cam); o.lb.style.transform = `translate(${(vv.x * .5 + .5) * W}px,${(-vv.y * .5 + .5) * H}px)`; }
    });
    renderer.render(scene, cam);
  }
  let raf = 0;
  const loop = () => { raf = requestAnimationFrame(loop); tick(); };
  new IntersectionObserver(([e]) => { cancelAnimationFrame(raf); if (e.isIntersecting) { clock.getDelta(); loop(); } }).observe(root);

  function resize() {
    const w = root.clientWidth, h = root.clientHeight;
    W = w; H = h;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    // empurra a cena para a área livre ao lado do painel (desktop) ou acima dele (mobile)
    cam.setViewOffset(w, h, w > 760 ? -230 : 0, w > 760 ? 0 : h * .22, w, h);
    cam.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(root);
  resize();

  /* abertura: um único momento orquestrado */
  applyCore(); render(); syncScene(true);
  if (!reduce) {
    gsap.to(prog, { grow: 1, duration: 1.6, ease: 'elastic.out(1,.6)', delay: .2 });
    gsap.from(dist, { v: 20, duration: 2.6, ease: 'expo.out' });
    gsap.from('.to-panel', { x: -40, opacity: 0, duration: .9, ease: 'power3.out', delay: .15 });
  }
  // API para integrar ao scroll do site (ex.: ScrollTrigger)
  window.TaskOrbit = { scroll: p => { sc.p = Math.max(0, Math.min(1, p)); }, focus: focusTask, unfocus };
})();