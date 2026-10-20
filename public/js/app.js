'use strict';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const state = { user: null, csrfToken: '', allowedEmailDomain: 'utpuebla.edu.mx', rides: [], deferredInstall: null };

const els = {
  navToggle: $('#navToggle'), navLinks: $('#navLinks'), installBtn: $('#installBtn'), loginBtn: $('#loginBtn'), registerBtn: $('#registerBtn'), userMenuBtn: $('#userMenuBtn'), userInitial: $('#userInitial'), userName: $('#userName'),
  publishHeroBtn: $('#publishHeroBtn'), publishDashboardBtn: $('#publishDashboardBtn'), networkBadge: $('#networkBadge'), pwaStatus: $('#pwaStatus'),
  searchForm: $('#searchForm'), originFilter: $('#originFilter'), dateFilter: $('#dateFilter'), seatFilter: $('#seatFilter'), modeFilter: $('#modeFilter'), hubFilter: $('#hubFilter'), clearFilters: $('#clearFilters'), resultText: $('#resultText'), routesGrid: $('#routesGrid'), routesEmpty: $('#routesEmpty'),
  dashboard: $('#dashboard'), publishedList: $('#publishedList'), reservationList: $('#reservationList'), publishedCount: $('#publishedCount'), reservationCount: $('#reservationCount'),
  ecoLevelIcon: $('#ecoLevelIcon'), ecoLevelName: $('#ecoLevelName'), ecoPoints: $('#ecoPoints'), ecoNextLevel: $('#ecoNextLevel'), ecoProgressFill: $('#ecoProgressFill'), ecoTrips: $('#ecoTrips'), ecoSeats: $('#ecoSeats'), ecoCo2: $('#ecoCo2'), ecoContribution: $('#ecoContribution'), ecoBadges: $('#ecoBadges'), ecoUserMethod: $('#ecoUserMethod'),
  adminPanel: $('#adminPanel'), adminNavLink: $('#adminNavLink'), adminStats: $('#adminStats'), adminUsers: $('#adminUsers'), refreshAdminBtn: $('#refreshAdminBtn'),
  authModal: $('#authModal'), authForm: $('#authForm'), authMode: $('#authMode'), authTitle: $('#authTitle'), authSubtitle: $('#authSubtitle'), authName: $('#authName'), authStudentId: $('#authStudentId'), authEmail: $('#authEmail'), authPassword: $('#authPassword'), authSubmit: $('#authSubmit'), authError: $('#authError'), switchAuth: $('#switchAuth'),
  publishModal: $('#publishModal'), publishForm: $('#publishForm'), publishConnectionMode: $('#publishConnectionMode'), connectionHubWrap: $('#connectionHubWrap'),
  reserveModal: $('#reserveModal'), reserveForm: $('#reserveForm'), reserveRideId: $('#reserveRideId'), reserveTitle: $('#reserveTitle'), reserveSummary: $('#reserveSummary'), reserveSeats: $('#reserveSeats'),
  userModal: $('#userModal'), accountName: $('#accountName'), accountEmail: $('#accountEmail'), logoutBtn: $('#logoutBtn'), closeUserModal: $('#closeUserModal'), goDashboard: $('#goDashboard'),
  publicationUrl: $('#publicationUrl'), copyUrlBtn: $('#copyUrlBtn'), publicationNote: $('#publicationNote'),
  toastStack: $('#toastStack')
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function money(v) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(v || 0)); }
function dateTime(v) { return new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(v)); }
function compact(v) { return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(Number(v || 0)); }
function toast(message, type = 'ok') {
  const node = el('div', `toast ${type === 'error' ? 'error' : type === 'warn' ? 'warn' : ''}`, message);
  els.toastStack.append(node);
  setTimeout(() => node.remove(), 4200);
}
function setBusy(button, busy, label = 'Procesando...') {
  if (!button) return;
  if (busy) {
    button.dataset.oldText = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.oldText || button.textContent;
    button.disabled = false;
  }
}
async function api(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { ...(options.headers || {}) };
  if (options.body && typeof options.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  if (!['GET', 'HEAD'].includes(method) && state.csrfToken) headers['X-CSRF-Token'] = state.csrfToken;
  const response = await fetch(path, { ...options, method, headers, credentials: 'same-origin' });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(data.error || `Error ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}
function updateNetwork() {
  const online = navigator.onLine;
  els.networkBadge.textContent = online ? 'En línea' : 'Sin conexión';
  els.networkBadge.classList.toggle('offline', !online);
}
function requireLogin(action = 'continuar') {
  if (state.user) return true;
  toast(`Inicia sesión para ${action}.`, 'warn');
  openAuth('login');
  return false;
}

async function loadSession() {
  const data = await api('/api/session');
  state.user = data.user;
  state.csrfToken = data.csrfToken;
  state.allowedEmailDomain = data.allowedEmailDomain || 'utpuebla.edu.mx';
  renderAuthState();
}
function renderAuthState() {
  const logged = !!state.user;
  els.loginBtn.hidden = logged;
  els.registerBtn.hidden = logged;
  els.userMenuBtn.hidden = !logged;
  els.dashboard.hidden = !logged;
  const isAdmin = !!state.user && state.user.role === 'admin';
  els.adminPanel.hidden = !isAdmin;
  if (els.adminNavLink) els.adminNavLink.hidden = !isAdmin;
  if (logged) {
    els.userName.textContent = state.user.name.split(' ')[0];
    els.userInitial.textContent = state.user.name.trim().charAt(0).toUpperCase();
    els.accountName.textContent = state.user.name;
    els.accountEmail.textContent = state.user.email;
    loadDashboard().catch(() => {});
    if (isAdmin) loadAdmin().catch(e => toast(`No se pudo cargar Administración: ${e.message}`, 'error'));
  } else {
    els.publishedList?.replaceChildren();
    els.reservationList?.replaceChildren();
    els.adminStats?.replaceChildren();
    els.adminUsers?.replaceChildren();
  }
}
function openAuth(mode = 'login') {
  els.authMode.value = mode;
  const register = mode === 'register';
  $$('.register-only', els.authForm).forEach(n => n.hidden = !register);
  els.authName.required = register;
  els.authStudentId.required = register;
  els.authTitle.textContent = register ? 'Crear cuenta' : 'Iniciar sesión';
  els.authSubtitle.textContent = register ? `Regístrate con un correo @${state.allowedEmailDomain}.` : 'Accede a tus rutas, reservaciones y panel personal.';
  els.authSubmit.textContent = register ? 'Crear cuenta' : 'Entrar';
  els.switchAuth.textContent = register ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate';
  els.authError.hidden = true;
  els.authError.textContent = '';
  els.authPassword.autocomplete = register ? 'new-password' : 'current-password';
  if (!els.authModal.open) els.authModal.showModal();
}
function openPublish() {
  if (!requireLogin('publicar una ruta')) return;
  const dt = els.publishForm.elements.departureAt;
  const d = new Date(Date.now() + 3600000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  dt.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  toggleConnectionHub();
  els.publishModal.showModal();
}
function toggleConnectionHub() {
  const isHub = els.publishConnectionMode.value === 'hub';
  els.connectionHubWrap.hidden = !isHub;
  els.publishForm.elements.connectionHub.required = isHub;
}
function openReserve(ride) {
  if (!requireLogin('reservar un lugar')) return;
  els.reserveRideId.value = ride.id;
  els.reserveTitle.textContent = `${ride.origin} - UTP`;
  const details = [dateTime(ride.departureAt), ride.pickupPoint, `${money(ride.contribution)} por persona`, `Conduce ${ride.driver.name}`];
  if (ride.connectionMode === 'hub' && ride.connectionHub) details.push(`Hub ${ride.connectionHub}`);
  els.reserveSummary.textContent = details.join(' · ');
  els.reserveSeats.replaceChildren();
  for (let i = 1; i <= Math.min(ride.seatsAvailable, 4); i++) {
    const o = el('option', '', `${i} lugar${i === 1 ? '' : 'es'}`);
    o.value = i;
    els.reserveSeats.append(o);
  }
  els.reserveModal.showModal();
}

function routeCell(label, value) {
  const box = el('div');
  box.append(el('span', '', label), el('b', '', value));
  return box;
}
function renderRoutes(rides) {
  state.rides = rides;
  els.routesGrid.replaceChildren();
  els.routesEmpty.hidden = rides.length > 0;
  els.resultText.textContent = `${rides.length} ruta${rides.length === 1 ? '' : 's'} disponible${rides.length === 1 ? '' : 's'}`;
  for (const ride of rides) {
    const card = el('article', 'route-card');
    const top = el('div', 'route-top');
    const place = el('div', 'route-place');
    place.append(el('small', '', ride.connectionMode === 'hub' ? 'Ruta con conexión' : 'Ruta directa'), el('b', '', `${ride.origin} - UTP`));
    top.append(place, el('span', 'route-badge', `${ride.seatsAvailable} lugar${ride.seatsAvailable === 1 ? '' : 'es'}`));

    const meta = el('div', 'route-meta');
    meta.append(
      routeCell('Salida', dateTime(ride.departureAt)),
      routeCell('Aportación', `${money(ride.contribution)} / lugar`),
      routeCell('Punto', ride.pickupPoint),
      routeCell('Vehículo', `${ride.vehicle} · ${ride.color}`)
    );
    card.append(top, meta);

    const driver = el('p', 'route-detail', `Conduce ${ride.driver.name}${ride.driver.verified ? ' · cuenta verificada' : ''}`);
    card.append(driver);
    if (ride.connectionMode === 'hub' && ride.connectionHub) card.append(el('p', 'route-detail', `Hub de conexión: ${ride.connectionHub}`));
    if (ride.parkingEligible) card.append(el('p', 'route-detail', 'Participa en Rodando Parking.'));
    if (ride.notes) card.append(el('p', 'route-notes', ride.notes));

    const actions = el('div', 'route-actions');
    const reserveBtn = el('button', 'btn primary', state.user && state.user.id === ride.driver.id ? 'Tu ruta' : 'Reservar');
    reserveBtn.type = 'button';
    reserveBtn.disabled = ride.seatsAvailable < 1 || (state.user && state.user.id === ride.driver.id);
    reserveBtn.addEventListener('click', () => openReserve(ride));
    actions.append(reserveBtn);
    card.append(actions);
    els.routesGrid.append(card);
  }
}
async function loadRides() {
  const params = new URLSearchParams();
  const origin = els.originFilter.value.trim();
  const date = els.dateFilter.value;
  const seats = els.seatFilter.value;
  const mode = els.modeFilter.value;
  const hub = els.hubFilter.value.trim();
  if (origin) params.set('origin', origin);
  if (date) params.set('date', date);
  if (seats) params.set('seats', seats);
  if (mode) params.set('mode', mode);
  if (hub) params.set('hub', hub);
  try {
    const data = await api(`/api/rides?${params}`);
    renderRoutes(data.rides);
    localStorage.setItem('rodando:lastRides', JSON.stringify({ rides: data.rides }));
  } catch (e) {
    const saved = JSON.parse(localStorage.getItem('rodando:lastRides') || 'null');
    if (saved?.rides) {
      renderRoutes(saved.rides);
      els.resultText.textContent += ' · copia local';
      toast('Mostrando la última lista guardada.', 'warn');
    } else {
      els.routesGrid.replaceChildren();
      els.routesEmpty.hidden = false;
      els.resultText.textContent = 'No se pudieron cargar las rutas.';
    }
  }
}

function ecoProgress(eco) {
  const points = Number(eco?.ecoPoints || 0);
  const bands = [0, 100, 250, 500, 1000];
  const next = eco?.level?.nextAt;
  if (!next) return 100;
  let start = 0;
  for (const band of bands) if (band <= points) start = band;
  return Math.max(0, Math.min(100, ((points - start) / (next - start)) * 100));
}
function renderEcoDashboard(eco) {
  if (!eco) return;
  els.ecoLevelIcon.textContent = eco.level?.code || 'SE';
  els.ecoLevelName.textContent = eco.level?.name || 'Semilla';
  els.ecoPoints.textContent = compact(eco.ecoPoints);
  els.ecoTrips.textContent = compact(eco.completedTrips);
  els.ecoSeats.textContent = compact(eco.sharedSeats);
  els.ecoCo2.textContent = `${compact(eco.co2Kg)} kg`;
  els.ecoContribution.textContent = money(eco.contribution);
  els.ecoNextLevel.textContent = eco.level?.nextAt ? `${Math.max(0, eco.level.nextAt - eco.ecoPoints)} puntos para el siguiente nivel.` : 'Nivel máximo alcanzado.';
  els.ecoProgressFill.style.width = `${ecoProgress(eco)}%`;
  els.ecoBadges.replaceChildren();
  for (const badge of eco.badges || []) {
    const node = el('div', `eco-badge${badge.unlocked ? '' : ' locked'}`);
    node.append(el('div', 'eco-badge-code', badge.code), el('b', '', badge.name), el('small', '', badge.unlocked ? 'Desbloqueada' : badge.description));
    els.ecoBadges.append(node);
  }
  els.ecoUserMethod.textContent = eco.methodology || '';
}

function dashStatus(status) {
  const labels = { active: 'Activa', cancelled: 'Cancelada', completed: 'Completada', confirmed: 'Confirmada' };
  return labels[status] || status;
}
function dashboardItemTop(title, status, extraClass = '') {
  const top = el('div', 'dash-item-top');
  top.append(el('b', '', title), el('span', `status-pill ${extraClass}`, status));
  return top;
}
function addAction(item, label, className, handler) {
  const btn = el('button', className, label);
  btn.type = 'button';
  btn.addEventListener('click', handler);
  item.append(btn);
}
function renderDashboard(data) {
  renderEcoDashboard(data.eco);
  els.publishedList.replaceChildren();
  els.reservationList.replaceChildren();
  els.publishedCount.textContent = data.published.length;
  els.reservationCount.textContent = data.reservations.filter(x => x.reservationStatus === 'confirmed').length;

  if (!data.published.length) els.publishedList.append(el('div', 'dash-empty', 'Aún no has publicado rutas.'));
  for (const ride of data.published) {
    const item = el('div', 'dash-item');
    const extraClass = ride.status === 'cancelled' ? 'cancelled' : ride.status === 'completed' ? 'completed' : '';
    item.append(dashboardItemTop(`${ride.origin} - UTP`, dashStatus(ride.status), extraClass));
    item.append(el('p', '', `${dateTime(ride.departureAt)} · ${ride.seatsAvailable}/${ride.seatsTotal} lugares libres · ${money(ride.contribution)}`));
    item.append(el('p', '', `Modo: ${ride.connectionMode === 'hub' ? 'Con conexión' : 'Directo'}${ride.connectionHub ? ` · Hub ${ride.connectionHub}` : ''}`));
    if (ride.parkingEligible) item.append(el('p', '', ride.parkingCode ? `Pase Rodando Parking: ${ride.parkingCode}` : 'Rodando Parking habilitado.'));
    if (ride.passengers?.length) item.append(el('p', '', `Reservas: ${ride.passengers.map(p => `${p.name} (${p.seats})`).join(', ')}`));
    if (ride.status === 'active' && new Date(ride.departureAt) > new Date()) addAction(item, 'Cancelar ruta', 'btn danger', () => cancelRide(ride.id));
    if (ride.status === 'active' && new Date(ride.departureAt) <= new Date() && ride.passengers?.length) addAction(item, 'Finalizar viaje', 'btn eco-complete', () => completeRide(ride.id));
    if (ride.status === 'active' && ride.parkingEligible) addAction(item, 'Generar pase parking', 'btn outline', () => generateParkingPass(ride.id));
    els.publishedList.append(item);
  }

  if (!data.reservations.length) els.reservationList.append(el('div', 'dash-empty', 'Aún no has realizado reservaciones.'));
  for (const entry of data.reservations) {
    const ride = entry.ride;
    const item = el('div', 'dash-item');
    item.append(dashboardItemTop(`${ride.origin} - UTP`, dashStatus(entry.reservationStatus), entry.reservationStatus === 'cancelled' ? 'cancelled' : ''));
    item.append(el('p', '', `${dateTime(ride.departureAt)} · ${entry.reservedSeats} lugar${entry.reservedSeats === 1 ? '' : 'es'} · ${ride.driver.name}`));
    item.append(el('p', '', `Punto de encuentro: ${ride.pickupPoint}`));
    if (entry.reservationStatus === 'confirmed' && ride.status === 'active' && new Date(ride.departureAt) > new Date()) addAction(item, 'Cancelar reserva', 'btn danger', () => cancelReservation(ride.id));
    els.reservationList.append(item);
  }
}
async function loadDashboard() {
  if (!state.user) return;
  const data = await api('/api/dashboard');
  renderDashboard(data);
}
async function completeRide(id) {
  if (!confirm('¿Confirmas que el viaje se realizó?')) return;
  try {
    const data = await api(`/api/rides/${id}/complete`, { method: 'POST' });
    renderEcoDashboard(data.eco);
    toast('Viaje finalizado y estadísticas actualizadas.');
    await Promise.all([loadRides(), loadDashboard(), state.user?.role === 'admin' ? loadAdmin() : Promise.resolve()]);
  } catch (e) { toast(e.message, 'error'); }
}
async function generateParkingPass(id) {
  try {
    const data = await api(`/api/rides/${id}/parking-pass`, { method: 'POST' });
    const pass = data.parkingPass;
    toast(`Pase generado: ${pass.code}`);
    await Promise.all([loadRides(), loadDashboard(), state.user?.role === 'admin' ? loadAdmin() : Promise.resolve()]);
  } catch (e) { toast(e.message, 'error'); }
}
async function cancelRide(id) {
  if (!confirm('¿Cancelar esta ruta?')) return;
  try {
    await api(`/api/rides/${id}`, { method: 'DELETE' });
    toast('Ruta cancelada.');
    await Promise.all([loadRides(), loadDashboard()]);
  } catch (e) { toast(e.message, 'error'); }
}
async function cancelReservation(id) {
  if (!confirm('¿Cancelar tu reservación?')) return;
  try {
    await api(`/api/rides/${id}/reserve`, { method: 'DELETE' });
    toast('Reservación cancelada.');
    await Promise.all([loadRides(), loadDashboard()]);
  } catch (e) { toast(e.message, 'error'); }
}

function renderAdminStats(payload) {
  els.adminStats.replaceChildren();
  const cards = [
    ['Usuarios', payload.totals.users],
    ['Rutas activas', payload.totals.activeRides],
    ['Reservaciones', payload.totals.reservations],
    ['Rodando Parking', payload.totals.parkingEligible],
    ['Rutas con conexión', payload.totals.hubRides],
    ['Viajes finalizados', payload.community.completedTrips],
    ['Lugares compartidos', payload.community.sharedSeats],
    ['CO₂e estimado', `${compact(payload.community.co2Kg)} kg`]
  ];
  for (const [label, value] of cards) {
    const card = el('div', 'admin-stat');
    card.append(el('strong', '', String(value)), el('span', '', label));
    els.adminStats.append(card);
  }
}
function userRow(user) {
  const row = el('div', 'user-row');
  const left = el('div', 'meta');
  const verified = el('span', 'user-pill-verified', user.verified ? 'Verificado' : 'Pendiente');
  const role = el('span', 'user-pill-role', user.role === 'admin' ? 'Admin' : 'Usuario');
  left.append(el('b', '', user.name), verified, role, el('small', '', `${user.studentId} · ${user.email}`), el('small', '', `Rutas: ${user.publishedRides} · Reservaciones: ${user.reservations}`));
  const middle = el('div', '', new Date(user.createdAt).toLocaleDateString('es-MX'));
  const actions = el('div', 'actions');
  const verifyBtn = el('button', 'btn ghost small', user.verified ? 'Quitar verificación' : 'Verificar');
  verifyBtn.type = 'button';
  verifyBtn.addEventListener('click', () => updateAdminUser(user, { verified: !user.verified, role: user.role }));
  const roleBtn = el('button', 'btn outline small', user.role === 'admin' ? 'Convertir a usuario' : 'Hacer admin');
  roleBtn.type = 'button';
  roleBtn.addEventListener('click', () => updateAdminUser(user, { verified: user.verified, role: user.role === 'admin' ? 'user' : 'admin' }));
  actions.append(verifyBtn, roleBtn);
  if (!state.user || user.id !== state.user.id) {
    const delBtn = el('button', 'btn danger small', 'Eliminar');
    delBtn.type = 'button';
    delBtn.addEventListener('click', () => deleteAdminUser(user.id));
    actions.append(delBtn);
  }
  row.append(left, middle, actions);
  return row;
}
function renderAdminUsers(users) {
  els.adminUsers.replaceChildren();
  if (!users.length) return els.adminUsers.append(el('div', 'dash-empty', 'No hay usuarios registrados.'));
  for (const user of users) els.adminUsers.append(userRow(user));
}
async function loadAdmin() {
  if (!state.user || state.user.role !== 'admin') return;
  const [overview, users] = await Promise.all([api('/api/admin/overview'), api('/api/admin/users')]);
  renderAdminStats(overview);
  renderAdminUsers(users.users);
}
async function updateAdminUser(user, payload) {
  try {
    await api(`/api/admin/users/${user.id}`, { method: 'PATCH', body: payload });
    toast('Usuario actualizado.');
    await loadAdmin();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteAdminUser(id) {
  if (!confirm('¿Eliminar este usuario?')) return;
  try {
    await api(`/api/admin/users/${id}`, { method: 'DELETE' });
    toast('Usuario eliminado.');
    await loadAdmin();
  } catch (e) { toast(e.message, 'error'); }
}

$$('.modal-close').forEach(btn => btn.addEventListener('click', e => { e.preventDefault(); btn.closest('dialog')?.close(); }));
$$('button[value="cancel"]').forEach(btn => btn.addEventListener('click', e => { e.preventDefault(); btn.closest('dialog')?.close(); }));
els.publishConnectionMode?.addEventListener('change', toggleConnectionHub);

els.authForm.addEventListener('submit', async e => {
  e.preventDefault();
  const mode = els.authMode.value;
  const body = { email: els.authEmail.value, password: els.authPassword.value };
  if (mode === 'register') { body.name = els.authName.value; body.studentId = els.authStudentId.value; }
  setBusy(els.authSubmit, true, mode === 'register' ? 'Creando cuenta...' : 'Entrando...');
  try {
    const data = await api(mode === 'register' ? '/api/register' : '/api/login', { method: 'POST', body });
    state.user = data.user;
    state.csrfToken = data.csrfToken;
    renderAuthState();
    els.authForm.reset();
    els.authModal.close();
    toast(mode === 'register' ? 'Cuenta creada correctamente.' : 'Sesión iniciada.');
    await Promise.all([loadRides(), loadDashboard(), state.user?.role === 'admin' ? loadAdmin() : Promise.resolve()]);
  } catch (err) {
    els.authError.textContent = err.message;
    els.authError.hidden = false;
    toast(err.message, 'error');
  } finally {
    setBusy(els.authSubmit, false);
  }
});
els.switchAuth.addEventListener('click', () => openAuth(els.authMode.value === 'login' ? 'register' : 'login'));
els.loginBtn.addEventListener('click', () => openAuth('login'));
els.registerBtn.addEventListener('click', () => openAuth('register'));
els.publishHeroBtn.addEventListener('click', openPublish);
els.publishDashboardBtn.addEventListener('click', openPublish);

els.publishForm.addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(els.publishForm);
  const localDate = String(fd.get('departureAt') || '');
  const d = new Date(localDate);
  const body = {
    origin: fd.get('origin'),
    pickupPoint: fd.get('pickupPoint'),
    departureAt: Number.isNaN(d.getTime()) ? localDate : d.toISOString(),
    seatsTotal: Number(fd.get('seatsTotal')),
    contribution: Number(fd.get('contribution')),
    vehicle: fd.get('vehicle'),
    color: fd.get('color'),
    plateLast4: fd.get('plateLast4'),
    notes: fd.get('notes'),
    connectionMode: fd.get('connectionMode'),
    connectionHub: fd.get('connectionHub'),
    parkingEligible: fd.get('parkingEligible') === '1'
  };
  setBusy($('#publishSubmit'), true, 'Publicando...');
  try {
    await api('/api/rides', { method: 'POST', body });
    els.publishModal.close();
    els.publishForm.reset();
    toggleConnectionHub();
    toast('Ruta publicada correctamente.');
    await Promise.all([loadRides(), loadDashboard(), state.user?.role === 'admin' ? loadAdmin() : Promise.resolve()]);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    setBusy($('#publishSubmit'), false);
  }
});
els.reserveForm.addEventListener('submit', async e => {
  e.preventDefault();
  setBusy($('#reserveSubmit'), true, 'Reservando...');
  try {
    await api(`/api/rides/${els.reserveRideId.value}/reserve`, { method: 'POST', body: { seats: Number(els.reserveSeats.value) } });
    els.reserveModal.close();
    toast('Reservación confirmada.');
    await Promise.all([loadRides(), loadDashboard(), state.user?.role === 'admin' ? loadAdmin() : Promise.resolve()]);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    setBusy($('#reserveSubmit'), false);
  }
});

els.searchForm.addEventListener('submit', e => { e.preventDefault(); loadRides(); });
els.clearFilters.addEventListener('click', () => { els.searchForm.reset(); els.seatFilter.value = '1'; loadRides(); });
els.userMenuBtn.addEventListener('click', () => els.userModal.showModal());
els.closeUserModal.addEventListener('click', () => els.userModal.close());
els.goDashboard.addEventListener('click', () => els.userModal.close());
els.logoutBtn.addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  state.user = null;
  els.userModal.close();
  renderAuthState();
  await loadSession();
  toast('Sesión cerrada.');
});

els.refreshAdminBtn?.addEventListener('click', () => loadAdmin().catch(e => toast(e.message, 'error')));
els.navToggle.addEventListener('click', () => {
  const open = els.navLinks.classList.toggle('open');
  els.navToggle.setAttribute('aria-expanded', String(open));
});
$$('.nav-links a').forEach(a => a.addEventListener('click', () => els.navLinks.classList.remove('open')));
window.addEventListener('online', () => { updateNetwork(); loadRides(); });
window.addEventListener('offline', updateNetwork);

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function updatePwaStatus(label) {
  els.pwaStatus.textContent = label || (isStandalone() ? 'PWA instalada' : 'PWA lista');
  els.pwaStatus.classList.toggle('installed', isStandalone());
}
async function requestInstall() {
  if (isStandalone()) return toast('La app ya está instalada.');
  if (!state.deferredInstall) return toast('Si no aparece el instalador, usa el menú del navegador y elige Instalar.', 'warn');
  state.deferredInstall.prompt();
  const choice = await state.deferredInstall.userChoice;
  if (choice.outcome === 'accepted') toast('Instalación aceptada.');
  state.deferredInstall = null;
  els.installBtn.hidden = true;
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  state.deferredInstall = e;
  els.installBtn.hidden = false;
  updatePwaStatus('PWA instalable');
});
els.installBtn?.addEventListener('click', requestInstall);
window.addEventListener('appinstalled', () => {
  state.deferredInstall = null;
  els.installBtn.hidden = true;
  updatePwaStatus('PWA instalada');
  toast('Aplicación instalada.');
});

function renderPublicationUrl() {
  const url = `${location.origin}${location.pathname === '/' ? '' : location.pathname}`;
  els.publicationUrl.textContent = url;
  const published = location.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname);
  els.publicationNote.textContent = published
    ? 'Esta es la URL pública del proyecto. Puedes anexarla directamente a tu entrega.'
    : 'Estás ejecutando la app en local. Para tu entrega final publícala en un servidor Node con HTTPS.';
}
els.copyUrlBtn?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(els.publicationUrl.textContent);
    toast('URL copiada al portapapeles.');
  } catch {
    toast('No se pudo copiar automáticamente.', 'warn');
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/service-worker.js');
      updatePwaStatus();
    } catch {
      updatePwaStatus('Service Worker no disponible');
    }
  });
}

(async function init() {
  renderPublicationUrl();
  updatePwaStatus();
  updateNetwork();
  try { await loadSession(); } catch {}
  await loadRides();
})();
