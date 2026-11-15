/* ============================================
   CareQ Prototype — Application Logic
   Auth, shifts, tasks, vital rounds, profile & alerts
   ============================================ */

(function () {
  'use strict';

  // ---------- Storage Keys ----------
  const KEYS = {
    USERS: 'careq_users',
    SESSION: 'careq_session',
    GUEST: 'careq_guest',
    GUEST_PROFILE: 'careq_guest_profile',
    SHIFTS: 'careq_shifts',
    ACTIVE_SHIFT: 'careq_active_shift',
    TASKS: 'careq_tasks',
    VITAL_ROUNDS: 'careq_vital_rounds',
    VITAL_RULES: 'careq_vital_rules',
    ALERT_HISTORY: 'careq_alert_history',
    WORK_ROSTER: 'careq_work_roster'
  };

  // ---------- Cadre Options ----------
  const CADRE_OPTIONS = {
    registered_nurse: ['Nursing Officer II', 'Nursing Officer I', 'Senior Nursing Officer', 'Assistant Chief Nursing Officer', 'Chief Nursing Officer', 'Staff Nurse', 'Senior Staff Nurse'],
    registered_midwife: ['Midwifery Officer II', 'Midwifery Officer I', 'Senior Midwifery Officer', 'Assistant Chief Midwifery Officer', 'Chief Midwifery Officer', 'Staff Midwife', 'Senior Staff Midwife'],
    nursing_student: ['Year 1 Nursing Student', 'Year 2 Nursing Student', 'Year 3 Nursing Student', 'Year 4 Nursing Student', 'Final Year Nursing Student', 'Post-Basic Nursing Student'],
    intern: ['Intern Nurse', 'Post-Basic Intern', 'Intern Midwife'],
    other_nursing: ['Nurse Educator', 'Nurse Administrator', 'Nurse Researcher', 'Public Health Nurse', 'Community Health Nurse', 'Other Nursing Professional']
  };

  const CATEGORY_LABELS = {
    registered_nurse: 'Registered Nurse',
    registered_midwife: 'Registered Midwife',
    nursing_student: 'Nursing Student',
    intern: 'Intern',
    other_nursing: 'Other Nursing Professional'
  };

  // ---------- TASK CATEGORIES & ACTIVITIES ----------
  const TASK_CATEGORIES = [
    { id: 'vital_signs', name: 'Vital Signs', icon: 'fa-heart-pulse', desc: 'BP, temperature, pulse, respiration' },
    { id: 'medications', name: 'Medications', icon: 'fa-pills', desc: 'Administration & observations' },
    { id: 'fluid_therapy', name: 'Fluid Therapy', icon: 'fa-droplet', desc: 'IV fluids, infusion monitoring' },
    { id: 'monitoring', name: 'Monitoring & Observations', icon: 'fa-eye', desc: 'Urine output, drain output, obs' },
    { id: 'procedures', name: 'Nursing Procedures', icon: 'fa-hand-holding-medical', desc: 'Wound, catheter, airway, specimen' },
    { id: 'personal_care', name: 'Personal Care', icon: 'fa-hand-holding-heart', desc: 'Hygiene, mobility, comfort' }
  ];

  const TASK_ACTIVITIES = {
    vital_signs: ['Full Vital Signs', 'Blood Pressure Check', 'Temperature Check', 'Pulse Check', 'Respiratory Rate Check', 'Oxygen Saturation (SpO2)'],
    medications: ['Self Medication', 'Assisted Medication', 'IV Medication', 'Oral Medication', 'Topical Medication', 'PRN Medication', 'Medication Observation'],
    fluid_therapy: ['IV Fluid Setup', 'IV Fluid Change', 'Infusion Rate Check', 'IV Site Inspection', 'Fluid Balance Recording'],
    monitoring: ['Urine Output Monitoring', 'Drain Output Monitoring', 'Neurological Observations', 'Pain Assessment', 'Glucose Monitoring', 'Wound Observation', 'General Patient Observation'],
    procedures: ['Wound Care', 'Catheter Care', 'Airway Care', 'Specimen Collection', 'Gastrointestinal Care', 'Respiratory Interventions', 'Pressure Area Care'],
    personal_care: ['Bed Bath', 'Oral Hygiene', 'Repositioning', 'Mobility Assistance', 'Toileting Assistance', 'Feeding Assistance']
  };

  const REMINDER_PRE_MS = 10 * 60 * 1000;

  // ---------- DOM ----------
  const screens = {
    splash: document.getElementById('splashScreen'),
    welcome: document.getElementById('welcomeScreen'),
    signup: document.getElementById('signUpScreen'),
    login: document.getElementById('loginScreen'),
    home: document.getElementById('homeScreen')
  };

  const offDash = document.getElementById('offShiftDashboard');
  const activeDash = document.getElementById('activeShiftDashboard');

  let elapsedInterval = null;
  let splashTimer = null;
  let tasksTickInterval = null;
  let currentTaskFilter = 'all';
  let activeTaskAlertId = null;
  let currentTaskDraft = null;
  let notificationPermissionRequested = false;
  let scheduleView = 'upcoming';
  let alertView = 'upcoming';
  let pendingCancelRoundId = null;
  let taskAlertQueue = [];
  let editingRosterId = null;
  let pendingPatientAction = null;

  // ============================================
  // NAVIGATION
  // ============================================
  function navigateTo(screenId) {
    Object.values(screens).forEach(function (s) { if (s) s.classList.remove('active'); });
    if (screens[screenId]) {
      screens[screenId].classList.add('active');
      screens[screenId].scrollTop = 0;
    }
    document.body.setAttribute('data-on-home', screenId === 'home' ? 'true' : 'false');
  }

  function showToast(message, type) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      toast.setAttribute('aria-atomic', 'true');
      document.body.appendChild(toast);
    }
    const notificationType = type === 'error' || type === 'info' ? type : 'success';
    const icons = { success: 'fa-circle-check', info: 'fa-circle-info', error: 'fa-circle-exclamation' };
    toast.className = 'toast ' + notificationType;
    toast.setAttribute('role', notificationType === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', notificationType === 'error' ? 'assertive' : 'polite');
    toast.innerHTML = '';
    const icon = document.createElement('i');
    icon.className = 'fas ' + icons[notificationType] + ' toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'toast-message';
    text.textContent = message;
    toast.appendChild(icon);
    toast.appendChild(text);
    void toast.offsetWidth;
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, 2600);
  }

  // ============================================
  // STORAGE
  // ============================================
  function getUsers() { try { return JSON.parse(localStorage.getItem(KEYS.USERS)) || []; } catch (e) { return []; } }
  function saveUsers(users) { localStorage.setItem(KEYS.USERS, JSON.stringify(users)); }
  function getSession() { try { return JSON.parse(localStorage.getItem(KEYS.SESSION)) || null; } catch (e) { return null; } }
  function saveSession(s) { localStorage.setItem(KEYS.SESSION, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(KEYS.SESSION); }
  function isGuest() { return localStorage.getItem(KEYS.GUEST) === 'true'; }
  function setGuest(f) { if (f) localStorage.setItem(KEYS.GUEST, 'true'); else localStorage.removeItem(KEYS.GUEST); }
  function getGuestProfile() { try { return JSON.parse(localStorage.getItem(KEYS.GUEST_PROFILE)) || {}; } catch (e) { return {}; } }
  function saveGuestProfile(p) { localStorage.setItem(KEYS.GUEST_PROFILE, JSON.stringify(p)); }
  function getShifts() { try { return JSON.parse(localStorage.getItem(KEYS.SHIFTS)) || []; } catch (e) { return []; } }
  function saveShifts(s) { localStorage.setItem(KEYS.SHIFTS, JSON.stringify(s)); }
  function getActiveShift() { try { return JSON.parse(localStorage.getItem(KEYS.ACTIVE_SHIFT)) || null; } catch (e) { return null; } }
  function saveActiveShift(s) { localStorage.setItem(KEYS.ACTIVE_SHIFT, JSON.stringify(s)); }
  function clearActiveShift() { localStorage.removeItem(KEYS.ACTIVE_SHIFT); }
  function getAllTasks() { try { return JSON.parse(localStorage.getItem(KEYS.TASKS)) || []; } catch (e) { return []; } }
  function saveAllTasks(tasks) { localStorage.setItem(KEYS.TASKS, JSON.stringify(tasks)); }
  function getVitalRounds() { try { return JSON.parse(localStorage.getItem(KEYS.VITAL_ROUNDS)) || []; } catch (e) { return []; } }
  function saveVitalRounds(rounds) { localStorage.setItem(KEYS.VITAL_ROUNDS, JSON.stringify(rounds)); }
  function getAlertHistory() { try { return JSON.parse(localStorage.getItem(KEYS.ALERT_HISTORY)) || []; } catch (e) { return []; } }
  function saveAlertHistory(history) { localStorage.setItem(KEYS.ALERT_HISTORY, JSON.stringify(history)); }
  function getWorkRoster() { try { return JSON.parse(localStorage.getItem(KEYS.WORK_ROSTER)) || []; } catch (e) { return []; } }
  function saveWorkRoster(roster) { localStorage.setItem(KEYS.WORK_ROSTER, JSON.stringify(roster)); }
  function getClinicalRules() {
    try { return JSON.parse(localStorage.getItem(KEYS.VITAL_RULES)) || { approved: false, temperatureUnit: '°C', metrics: {} }; }
    catch (e) { return { approved: false, temperatureUnit: '°C', metrics: {} }; }
  }
  function saveClinicalRules(rules) { localStorage.setItem(KEYS.VITAL_RULES, JSON.stringify(rules)); }

  // ============================================
  // VALIDATION HELPERS
  // ============================================
  function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
  function showError(id, msg) { const el = document.getElementById(id + 'Error'); if (el) { el.textContent = msg; el.classList.add('visible'); } }
  function clearAllErrors(form) { if (!form) return; form.querySelectorAll('.error-message').forEach(function (el) { el.textContent = ''; el.classList.remove('visible'); }); }

  function bindPasswordToggles() {
    document.querySelectorAll('.toggle-password').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const input = document.getElementById(btn.getAttribute('data-target'));
        if (!input) return;
        const isPwd = input.type === 'password';
        input.type = isPwd ? 'text' : 'password';
        const icon = btn.querySelector('i');
        if (icon) icon.className = isPwd ? 'fas fa-eye-slash' : 'fas fa-eye';
      });
    });
  }

  // ============================================
  // SPLASH ROUTING
  // ============================================
  function routeAfterSplash() {
    const session = getSession();
    const guest = isGuest();
    if (session && session.email) { enterHome(); return; }
    if (guest) { enterHome(); return; }
    navigateTo('welcome');
  }

  // ============================================
  // AUTH FLOWS
  // ============================================
  document.getElementById('goToSignUpBtn').addEventListener('click', function () { resetSignUpForm(); navigateTo('signup'); });
  document.getElementById('goToLoginBtn').addEventListener('click', function () { clearAllErrors(document.getElementById('loginForm')); document.getElementById('loginForm').reset(); navigateTo('login'); });
  document.getElementById('continueAsGuestBtn').addEventListener('click', function () { setGuest(true); clearSession(); enterHome(); showToast('Continuing as guest'); });

  document.getElementById('backFromSignup').addEventListener('click', function (e) { e.preventDefault(); resetSignUpForm(); navigateTo('welcome'); });
  document.getElementById('backFromLogin').addEventListener('click', function (e) { e.preventDefault(); clearAllErrors(document.getElementById('loginForm')); document.getElementById('loginForm').reset(); navigateTo('welcome'); });

  const step1Form = document.getElementById('signUpFormStep1');
  const step2Form = document.getElementById('signUpFormStep2');
  const stepDots = document.querySelectorAll('.step-dot');
  const stepPanels = document.querySelectorAll('.step-panel');
  const categorySelect = document.getElementById('signupCategory');
  const cadreSelect = document.getElementById('signupCadre');

  function goToStep(step) {
    stepPanels.forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-step') === String(step)); });
    stepDots.forEach(function (d) { d.classList.toggle('active', d.getAttribute('data-step') === String(step)); });
  }

  function resetSignUpForm() {
    step1Form.reset(); step2Form.reset();
    cadreSelect.innerHTML = '<option value="">Select category first…</option>';
    cadreSelect.disabled = true;
    document.getElementById('termsCheckbox').checked = false;
    clearAllErrors(step1Form); clearAllErrors(step2Form);
    goToStep(1);
  }

  document.getElementById('backToStep1Btn').addEventListener('click', function () { goToStep(1); });

  document.getElementById('toStep2Btn').addEventListener('click', function () {
    clearAllErrors(step1Form);
    const first = document.getElementById('signupFirstName').value.trim();
    const last = document.getElementById('signupLastName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirm = document.getElementById('signupConfirm').value;
    let valid = true;
    if (!first) { showError('signupFirstName', 'First name is required.'); valid = false; }
    if (!last) { showError('signupLastName', 'Last name is required.'); valid = false; }
    if (!email) { showError('signupEmail', 'Email is required.'); valid = false; }
    else if (!isValidEmail(email)) { showError('signupEmail', 'Enter a valid email address.'); valid = false; }
    else { const exists = getUsers().some(function (u) { return u.email.toLowerCase() === email.toLowerCase(); }); if (exists) { showError('signupEmail', 'An account with this email already exists.'); valid = false; } }
    if (!password) { showError('signupPassword', 'Password is required.'); valid = false; }
    else if (password.length < 6) { showError('signupPassword', 'Password must be at least 6 characters.'); valid = false; }
    if (!confirm) { showError('signupConfirm', 'Please confirm your password.'); valid = false; }
    else if (password !== confirm) { showError('signupConfirm', 'Passwords do not match.'); valid = false; }
    if (valid) goToStep(2);
  });

  categorySelect.addEventListener('change', function () {
    const cat = categorySelect.value;
    cadreSelect.innerHTML = '';
    if (!cat || !CADRE_OPTIONS[cat]) { cadreSelect.disabled = true; cadreSelect.innerHTML = '<option value="">Select category first…</option>'; return; }
    cadreSelect.disabled = false;
    const ph = document.createElement('option'); ph.value = ''; ph.textContent = 'Select cadre / rank…'; cadreSelect.appendChild(ph);
    CADRE_OPTIONS[cat].forEach(function (opt) { const o = document.createElement('option'); o.value = opt; o.textContent = opt; cadreSelect.appendChild(o); });
  });

  step2Form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearAllErrors(step2Form);
    const category = categorySelect.value;
    const cadre = cadreSelect.value;
    const facility = document.getElementById('signupFacility').value.trim();
    const terms = document.getElementById('termsCheckbox').checked;
    let valid = true;
    if (!category) { showError('signupCategory', 'Select your professional category.'); valid = false; }
    if (!cadre) { showError('signupCadre', 'Select your nursing cadre / rank.'); valid = false; }
    if (!facility) { showError('signupFacility', 'Healthcare facility is required.'); valid = false; }
    if (!terms) { showError('terms', 'You must accept the Terms and Privacy Policy.'); valid = false; }
    if (!valid) return;

    const first = document.getElementById('signupFirstName').value.trim();
    const last = document.getElementById('signupLastName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;

    const users = getUsers();
    const user = { firstName: first, lastName: last, email: email, password: password, category: category, categoryLabel: CATEGORY_LABELS[category], cadre: cadre, facility: facility, avatar: '', createdAt: new Date().toISOString() };
    users.push(user); saveUsers(users);

    const session = { firstName: first, lastName: last, email: email, category: category, categoryLabel: CATEGORY_LABELS[category], cadre: cadre, facility: facility, avatar: '', loginAt: new Date().toISOString() };
    saveSession(session); setGuest(false);
    showToast('Account created (simulated)');
    setTimeout(enterHome, 500);
  });

  document.getElementById('goToLoginFromSignup').addEventListener('click', function (e) { e.preventDefault(); clearAllErrors(document.getElementById('loginForm')); document.getElementById('loginForm').reset(); navigateTo('login'); });

  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const form = e.target; clearAllErrors(form);
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    let valid = true;
    if (!email) { showError('loginEmail', 'Email is required.'); valid = false; }
    else if (!isValidEmail(email)) { showError('loginEmail', 'Enter a valid email address.'); valid = false; }
    if (!password) { showError('loginPassword', 'Password is required.'); valid = false; }
    if (!valid) return;
    const user = getUsers().find(function (u) { return u.email.toLowerCase() === email.toLowerCase() && u.password === password; });
    if (!user) { showError('loginPassword', 'Invalid email or password.'); return; }
    const session = { firstName: user.firstName, lastName: user.lastName, email: user.email, category: user.category, categoryLabel: user.categoryLabel, cadre: user.cadre, facility: user.facility, avatar: user.avatar || '', loginAt: new Date().toISOString() };
    saveSession(session); setGuest(false);
    showToast('Logged in (simulated)');
    setTimeout(enterHome, 400);
  });

  document.getElementById('goToSignUpFromLogin').addEventListener('click', function (e) { e.preventDefault(); resetSignUpForm(); navigateTo('signup'); });
  document.getElementById('forgotPasswordLink').addEventListener('click', function (e) { e.preventDefault(); showToast('Password reset is not available in this prototype', 'error'); });

  // ============================================
  // HOME ENTRY
  // ============================================
  function enterHome() {
    navigateTo('home');
    selectTab('home');
    refreshHome();
    startTaskEngine();
  }

  function refreshHome() {
    const active = getActiveShift();
    if (active) showActiveDashboard(active); else showOffDashboard();
    renderProfileTab();
    updateDashboardAvatars();
    renderTasks();
    renderAlerts();
    updateAlertBadge();
  }

  function selectTab(tabName) {
    document.querySelectorAll('.tab-section').forEach(function (sec) { sec.classList.toggle('active', sec.getAttribute('data-tab') === tabName); });
    document.querySelectorAll('.nav-item').forEach(function (btn) {
      const isActive = btn.getAttribute('data-nav') === tabName;
      btn.classList.toggle('active', isActive);
      if (isActive) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    });
    document.body.setAttribute('data-active-tab', tabName);
    if (screens.home) screens.home.scrollTop = 0;
    if (tabName === 'home') refreshHome();
    if (tabName === 'profile') renderProfileTab();
    if (tabName === 'tasks') renderTasks();
    if (tabName === 'schedule') renderSchedule();
    if (tabName === 'alerts') renderAlerts();
  }

  document.querySelectorAll('.nav-item').forEach(function (btn) { btn.addEventListener('click', function () { selectTab(btn.getAttribute('data-nav')); }); });

  // ============================================
  // USER HELPERS
  // ============================================
  function getCurrentUserDisplay() {
    const session = getSession();
    if (session && session.firstName) return { firstName: session.firstName, full: session.firstName + ' ' + session.lastName, isGuest: false, session: session };
    return { firstName: 'Guest', full: 'Guest User', isGuest: true, session: null };
  }
  function getInitials(name) {
    if (!name || name === 'Guest') return 'G';
    return name.split(' ').filter(Boolean).map(function (p) { return p[0]; }).slice(0, 2).join('').toUpperCase();
  }
  function formatDate(date) { return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function formatTime(date) { return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
  function formatDateTimeShort(date) { return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' + formatTime(date); }
  function formatDateInputValue(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function formatTimeInputValue(date) {
    return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }
  function parseLocalDateTime(dateValue, timeValue) {
    const parts = dateValue.split('-').map(Number);
    const timeParts = timeValue.split(':').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2], timeParts[0], timeParts[1]);
    if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2] ||
        date.getHours() !== timeParts[0] || date.getMinutes() !== timeParts[1]) return null;
    return date;
  }
  function escapeHtml(str) { if (!str) return ''; return String(str).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ============================================
  // OFF / ACTIVE DASHBOARD
  // ============================================
  function showOffDashboard() {
    offDash.classList.add('active'); activeDash.classList.remove('active');
    stopElapsedTimer();
    const user = getCurrentUserDisplay();
    document.getElementById('offGreeting').textContent = 'Hello, ' + user.firstName + '!';
    document.getElementById('offDate').textContent = formatDate(new Date());
    document.getElementById('offAvatarInitials').textContent = getInitials(user.full);
    renderActivityStats(); renderRecentShifts();
    document.getElementById('tasksShiftBanner').style.display = 'none';
  }

  function renderActivityStats() {
    const shifts = getShifts().filter(function (s) { return s.status === 'completed'; });
    const statsEl = document.getElementById('activityStats');
    const emptyEl = document.getElementById('activityEmpty');
    if (shifts.length === 0) { statsEl.innerHTML = ''; statsEl.style.display = 'none'; emptyEl.style.display = 'block'; return; }
    statsEl.style.display = 'grid'; emptyEl.style.display = 'none';
    const totalShifts = shifts.length;
    const allTasks = getAllTasks().filter(function (t) { return t.shiftId && shifts.some(function (s) { return s.id === t.shiftId; }); });
    const totalTasks = allTasks.filter(function (task) { return task.status !== 'cancelled'; }).length;
    const completedTasks = allTasks.filter(function (t) { return t.status === 'completed'; }).length;
    const completion = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null;
    const cards = [{ value: totalShifts, label: 'Shifts Completed' }];
    if (totalTasks > 0) { cards.push({ value: completedTasks, label: 'Tasks Completed' }); cards.push({ value: completion + '%', label: 'Task Completion' }); }
    else { cards.push({ value: '—', label: 'Tasks Completed' }); cards.push({ value: '—', label: 'Task Completion' }); }
    statsEl.innerHTML = cards.map(function (c) { return '<div class="stat-card"><div class="stat-value">' + c.value + '</div><div class="stat-label">' + c.label + '</div></div>'; }).join('');
  }

  function renderRecentShifts() {
    const shifts = getShifts().filter(function (s) { return s.status === 'completed'; }).sort(function (a, b) { return new Date(b.endTime) - new Date(a.endTime); }).slice(0, 5);
    const listEl = document.getElementById('recentShiftsList');
    const emptyEl = document.getElementById('recentShiftsEmpty');
    if (shifts.length === 0) { listEl.innerHTML = ''; emptyEl.style.display = 'block'; return; }
    emptyEl.style.display = 'none';
    listEl.innerHTML = shifts.map(function (s) {
      const start = new Date(s.startTime); const end = new Date(s.endTime);
      const patientCount = (s.patients || []).length + (s.dischargedPatients || []).length;
      return '<div class="shift-item"><div class="shift-item-left"><span class="shift-type">' + escapeHtml(s.type || 'Shift') + '</span><span class="shift-meta">' + formatDate(start) + ' · ' + patientCount + ' patient' + (patientCount === 1 ? '' : 's') + '</span><span class="shift-time">' + formatTime(start) + ' – ' + formatTime(end) + '</span></div><span class="shift-status completed">Completed</span></div>';
    }).join('');
  }

  // ============================================
  // SHIFT TAKEOVER
  // ============================================
  const takeoverModal = document.getElementById('takeoverModal');
  const admitPatientModal = document.getElementById('admitPatientModal');
  const endShiftModal = document.getElementById('endShiftModal');
  const infoModal = document.getElementById('infoModal');
  const patientsContainer = document.getElementById('patientsContainer');
  const admitPatientContainer = document.getElementById('admitPatientContainer');
  const takeoverError = document.getElementById('takeoverError');
  const admitPatientError = document.getElementById('admitPatientError');
  let patientCounter = 0;
  const patientActionModal = document.getElementById('patientActionModal');

  function openModal(modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
  function closeModal(modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }

  function createPatientEntry(container, removable) {
    patientCounter++;
    const index = patientCounter;
    const targetContainer = container || patientsContainer;
    const removeButton = removable === false ? '' : '<button type="button" class="remove-patient-btn" aria-label="Remove patient"><i class="fas fa-xmark"></i></button>';
    const div = document.createElement('div');
    div.className = 'patient-entry';
    div.dataset.patientIndex = String(index);
    div.innerHTML = '<div class="patient-entry-header"><span class="patient-entry-title">Patient ' + String(index).padStart(2, '0') + '</span>' + removeButton + '</div><div class="input-group"><label>Patient Name / Identifier</label><input type="text" class="p-name" placeholder="e.g. Bed 12 · J. Doe" maxlength="80"></div><div class="input-group"><label>Diagnosis</label><input type="text" class="p-diagnosis" placeholder="e.g. Post-op recovery" maxlength="120"></div><div class="input-group"><label>Special Notes</label><textarea class="p-notes" placeholder="Allergies, mobility, observations…" maxlength="300"></textarea></div>';
    const removeBtn = div.querySelector('.remove-patient-btn');
    if (removeBtn) removeBtn.addEventListener('click', function () { removePatientEntry(div, targetContainer); });
    targetContainer.appendChild(div);
    if (removable !== false) updateRemoveButtons(targetContainer);
    return div;
  }
  function removePatientEntry(entry, container) { if (container.children.length <= 1) { showToast('At least one patient entry is required', 'error'); return; } entry.remove(); renumberPatients(container); updateRemoveButtons(container); }
  function renumberPatients(container) { container.querySelectorAll('.patient-entry').forEach(function (entry, i) { const t = entry.querySelector('.patient-entry-title'); if (t) t.textContent = 'Patient ' + String(i + 1).padStart(2, '0'); }); }
  function updateRemoveButtons(container) { const entries = container.querySelectorAll('.patient-entry'); entries.forEach(function (entry) { const btn = entry.querySelector('.remove-patient-btn'); if (btn) btn.disabled = entries.length <= 1; }); }
  function resetTakeoverModal() { patientsContainer.innerHTML = ''; patientCounter = 0; createPatientEntry(patientsContainer); takeoverError.textContent = ''; takeoverError.classList.remove('visible'); }

  document.getElementById('takeOverShiftBtn').addEventListener('click', function () { resetTakeoverModal(); openModal(takeoverModal); });
  document.getElementById('addPatientBtn').addEventListener('click', function () { const e = createPatientEntry(patientsContainer); e.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  document.getElementById('closeTakeoverBtn').addEventListener('click', function () { closeModal(takeoverModal); });
  document.getElementById('cancelTakeoverBtn').addEventListener('click', function () { closeModal(takeoverModal); });
  takeoverModal.addEventListener('click', function (e) { if (e.target === takeoverModal) closeModal(takeoverModal); });

  function openAdmitPatientModal() {
    if (!getActiveShift()) { showToast('No active shift', 'error'); return; }
    admitPatientContainer.innerHTML = '';
    patientCounter = 0;
    createPatientEntry(admitPatientContainer, false);
    admitPatientError.textContent = '';
    admitPatientError.classList.remove('visible');
    openModal(admitPatientModal);
  }

  document.getElementById('addShiftPatientBtn').addEventListener('click', openAdmitPatientModal);
  document.getElementById('closeAdmitPatientBtn').addEventListener('click', function () { closeModal(admitPatientModal); });
  document.getElementById('cancelAdmitPatientBtn').addEventListener('click', function () { closeModal(admitPatientModal); });
  admitPatientModal.addEventListener('click', function (e) { if (e.target === admitPatientModal) closeModal(admitPatientModal); });
  document.getElementById('saveAdmitPatientBtn').addEventListener('click', function () {
    const entry = admitPatientContainer.querySelector('.patient-entry');
    const nameInput = entry.querySelector('.p-name');
    const diagnosisInput = entry.querySelector('.p-diagnosis');
    const name = nameInput.value.trim();
    const diagnosis = diagnosisInput.value.trim();
    const notes = entry.querySelector('.p-notes').value.trim();
    const active = getActiveShift();
    admitPatientError.textContent = '';
    admitPatientError.classList.remove('visible');
    nameInput.style.borderColor = name ? '' : '#d64550';
    diagnosisInput.style.borderColor = diagnosis ? '' : '#d64550';
    if (!name || !diagnosis) {
      admitPatientError.textContent = 'Patient name and diagnosis are required.';
      admitPatientError.classList.add('visible');
      return;
    }
    if (!active) {
      closeModal(admitPatientModal);
      showToast('No active shift', 'error');
      return;
    }
    const patients = active.patients || [];
    if (patients.some(function (patient) { return patient.name.trim().toLowerCase() === name.toLowerCase(); })) {
      admitPatientError.textContent = 'This patient is already recorded in the current shift.';
      admitPatientError.classList.add('visible');
      nameInput.style.borderColor = '#d64550';
      return;
    }
    const patient = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      name: name,
      diagnosis: diagnosis,
      notes: notes
    };
    patients.push(patient);
    active.patients = patients;
    saveActiveShift(active);
    createInitialVitalsTask(active, patient);
    renderActivePatients(patients);
    closeModal(admitPatientModal);
    showToast('Patient added to the active shift');
  });

  document.getElementById('beginShiftBtn').addEventListener('click', function () {
    takeoverError.textContent = ''; takeoverError.classList.remove('visible');
    const entries = patientsContainer.querySelectorAll('.patient-entry');
    if (entries.length === 0) { takeoverError.textContent = 'Add at least one patient to begin the shift.'; takeoverError.classList.add('visible'); return; }
    const patients = []; let invalid = false;
    entries.forEach(function (entry, i) {
      const name = entry.querySelector('.p-name').value.trim();
      const diagnosis = entry.querySelector('.p-diagnosis').value.trim();
      const notes = entry.querySelector('.p-notes').value.trim();
      if (!name) { invalid = true; entry.querySelector('.p-name').style.borderColor = '#d64550'; } else { entry.querySelector('.p-name').style.borderColor = ''; }
      if (!diagnosis) { invalid = true; entry.querySelector('.p-diagnosis').style.borderColor = '#d64550'; } else { entry.querySelector('.p-diagnosis').style.borderColor = ''; }
      if (name || diagnosis || notes) patients.push({ id: 'p_' + Date.now() + '_' + i, name: name, diagnosis: diagnosis, notes: notes });
    });
    const names = patients.map(function (p) { return p.name.toLowerCase(); });
    const hasDuplicates = names.some(function (n, i) { return n && names.indexOf(n) !== i; });
    if (invalid) { takeoverError.textContent = 'Please fill in the patient name and diagnosis for every patient entry.'; takeoverError.classList.add('visible'); return; }
    if (hasDuplicates) { takeoverError.textContent = 'Duplicate patient identifiers detected.'; takeoverError.classList.add('visible'); return; }
    const now = new Date();
    const activeShift = { id: 'shift_' + Date.now(), startTime: now.toISOString(), endTime: null, status: 'active', type: getShiftType(now), patients: patients, tasksCompleted: 0, tasksTotal: 0 };
    saveActiveShift(activeShift);
    closeModal(takeoverModal);
    showToast('Shift started — patients recorded');
    setTimeout(refreshHome, 300);
  });

  function getShiftType(date) { const h = date.getHours(); if (h >= 6 && h < 14) return 'Morning Shift'; if (h >= 14 && h < 22) return 'Afternoon Shift'; return 'Night Shift'; }

  // ============================================
  // VITAL SIGNS — observation rounds and history
  // ============================================
  const VITAL_METRICS = [
    { key: 'temperature', label: 'Temperature', unit: '°C' },
    { key: 'systolic', label: 'Blood Pressure · Systolic', unit: 'mmHg' },
    { key: 'diastolic', label: 'Blood Pressure · Diastolic', unit: 'mmHg' },
    { key: 'pulse', label: 'Pulse', unit: 'bpm' },
    { key: 'respiration', label: 'Respiration', unit: '/min' },
    { key: 'spo2', label: 'SpO₂', unit: '%' },
    { key: 'pain', label: 'Pain Score', unit: '' }
  ];
  const VITAL_INPUTS = [
    { id: 'vitalTemperature', key: 'temperature' },
    { id: 'vitalBPSystolic', key: 'systolic' },
    { id: 'vitalBPDiastolic', key: 'diastolic' },
    { id: 'vitalPulse', key: 'pulse' },
    { id: 'vitalRespiration', key: 'respiration' },
    { id: 'vitalSpo2', key: 'spo2' },
    { id: 'vitalPain', key: 'pain' },
    { id: 'vitalOther', key: 'other' }
  ];
  const vitalsScreen = document.getElementById('vitalsScreen');
  const vitalsRoundsView = document.getElementById('vitalsRoundsView');
  const vitalsRecordView = document.getElementById('vitalsRecordView');
  const vitalsStopwatchModal = document.getElementById('vitalsStopwatchModal');
  const cancelVitalsRoundModal = document.getElementById('cancelVitalsRoundModal');
  let currentVitalsRoundId = null;
  let currentVitalsPatientId = null;
  let currentVitalsRecord = null;
  let vitalsReturnTab = 'home';
  let returnToRoundsAfterRecord = true;
  let stopwatchMetric = null;
  let stopwatchDuration = 15;
  let stopwatchRemaining = 15;
  let stopwatchInterval = null;
  let stopwatchCountdownInterval = null;
  let stopwatchDeadline = null;
  let stopwatchCompletedAt = null;

  function makeEmptyVitalRecord(patient, round) {
    const observations = {};
    VITAL_INPUTS.forEach(function (field) {
      observations[field.key] = { value: '', timestamp: null };
    });
    observations.temperature.unit = getClinicalRules().temperatureUnit || '°C';
    observations.systolic.unit = 'mmHg';
    observations.diastolic.unit = 'mmHg';
    observations.pulse.unit = 'bpm';
    observations.respiration.unit = '/min';
    observations.spo2.unit = '%';
    return {
      id: 'vr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      roundId: round.id,
      shiftId: round.shiftId,
      patientId: patient.id,
      patientName: patient.name,
      patientDetails: { diagnosis: patient.diagnosis || '', notes: patient.notes || '' },
      status: 'not-started',
      observations: observations,
      clinicalAlerts: [],
      createdAt: new Date().toISOString(),
      completedAt: null
    };
  }

  function createInitialVitalsTask(active, patient) {
    const tasks = getAllTasks();
    if (tasks.some(function (task) { return task.shiftId === active.id && task.patientId === patient.id && task.taskType === 'initial-vitals'; })) return;
    const admittedAt = new Date();
    patient.admittedAt = admittedAt.toISOString();
    const rounds = getVitalRounds();
    const round = {
      id: 'vround_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      shiftId: active.id,
      title: 'Initial Vital Signs',
      kind: 'initial',
      patientIds: [patient.id],
      records: [],
      createdAt: admittedAt.toISOString(),
      status: 'in-progress'
    };
    const record = makeEmptyVitalRecord(patient, round);
    round.records.push(record);
    rounds.push(round);

    const task = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      shiftId: active.id,
      category: 'vital_signs',
      activityName: 'Initial Vital Signs',
      isCustom: false,
      patientId: patient.id,
      patientName: patient.name,
      scheduledAt: new Date(admittedAt.getTime() + 5 * 60 * 1000).toISOString(),
      priority: 'normal',
      description: 'Initial observations following patient admission.',
      status: 'pending',
      completedAt: null,
      remindedAt10: false,
      alertedAt: false,
      notifiedAt: false,
      suppressPreReminder: true,
      taskType: 'initial-vitals',
      vitalsRoundId: round.id,
      createdAt: admittedAt.toISOString()
    };
    record.taskId = task.id;
    tasks.push(task);
    saveVitalRounds(rounds);
    saveAllTasks(tasks);
    active.tasksTotal = tasks.filter(function (item) { return item.shiftId === active.id; }).length;
    active.tasksCompleted = tasks.filter(function (item) { return item.shiftId === active.id && item.status === 'completed'; }).length;
    saveActiveShift(active);
    renderShiftProgress(active);
    scheduleTaskEngine();
    renderTasks();
    renderAlerts();
    renderSchedule();
    updateAlertBadge();
  }

  function createScheduledVitalsRecord(task, patient) {
    const round = {
      id: 'vround_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      shiftId: task.shiftId,
      title: task.activityName,
      kind: 'scheduled-monitoring',
      patientIds: [patient.id],
      records: [],
      createdAt: task.createdAt,
      scheduledAt: task.scheduledAt,
      status: 'scheduled',
      taskId: task.id
    };
    const record = makeEmptyVitalRecord(patient, round);
    record.taskId = task.id;
    record.monitorMetric = task.vitalMetric || null;
    round.records.push(record);
    task.vitalsRoundId = round.id;
    const rounds = getVitalRounds();
    rounds.push(round);
    saveVitalRounds(rounds);
  }

  function openVitalsRounds() {
    const active = getActiveShift();
    if (!active) { showToast('Take over a shift before recording Vital Signs', 'error'); return; }
    vitalsReturnTab = document.body.getAttribute('data-active-tab') || 'home';
    returnToRoundsAfterRecord = true;
    vitalsRoundsView.hidden = false;
    vitalsRecordView.hidden = true;
    document.getElementById('vitalsScreenTitle').textContent = 'Vital Signs';
    renderClinicalRules();
    renderVitalsRounds();
    vitalsScreen.classList.add('active');
    vitalsScreen.setAttribute('aria-hidden', 'false');
    document.body.setAttribute('data-vitals-open', 'true');
  }

  function closeVitalsWorkspace() {
    vitalsScreen.classList.remove('active');
    vitalsScreen.setAttribute('aria-hidden', 'true');
    document.body.removeAttribute('data-vitals-open');
    if (vitalsReturnTab) selectTab(vitalsReturnTab);
  }

  function renderVitalsRounds() {
    const active = getActiveShift();
    const rounds = active ? getVitalRounds().filter(function (round) { return round.shiftId === active.id && (round.kind === 'round' || round.kind === 'initial'); }) : [];
    const activeRound = rounds.slice().reverse().find(function (round) { return round.kind === 'round' && round.status !== 'completed' && round.status !== 'cancelled' && hasOpenRoundRecords(round); });
    const list = document.getElementById('vitalsRoundsList');
    document.getElementById('vitalsRoundCount').textContent = String(rounds.length);
    document.getElementById('vitalsRoundsEmpty').style.display = rounds.length ? 'none' : 'block';
    const startButton = document.getElementById('startVitalsRoundBtn');
    startButton.innerHTML = activeRound ? '<i class="fas fa-arrow-rotate-right"></i> Continue Vital Signs Round' : '<i class="fas fa-plus"></i> Start Vital Signs Round';
    renderRoundPatientSelection(active, activeRound);
    list.innerHTML = rounds.slice().reverse().map(function (round) {
      const activeRecords = round.records.filter(function (record) { return !isPatientDischarged(round.shiftId, record.patientId); });
      const completed = round.records.filter(function (record) { return record.status === 'completed'; }).length;
      const activeCompleted = activeRecords.filter(function (record) { return record.status === 'completed'; }).length;
      const discharged = round.records.length - activeRecords.length;
      const status = round.status === 'cancelled' ? 'Cancelled' : round.status === 'completed' || (activeRecords.length > 0 && activeCompleted === activeRecords.length) ? 'Completed' : (activeCompleted || activeRecords.some(function (record) { return record.status === 'in-progress'; })) ? 'In Progress' : 'Not Started';
      const roundProgress = completed + ' of ' + round.records.length + ' completed' + (discharged ? ' · ' + discharged + ' discharged' : '');
      return '<article class="vitals-round-card"><div class="vitals-round-heading"><div><p class="vitals-eyebrow">' + (round.kind === 'initial' ? 'Admission' : 'Observation round') + '</p><h3>' + escapeHtml(round.title) + '</h3></div><span class="vitals-status-pill ' + status.toLowerCase().replace(' ', '-') + '">' + status + '</span></div><p class="vitals-round-meta">' + new Date(round.createdAt).toLocaleString() + ' · ' + roundProgress + '</p><div class="vitals-round-patients">' + round.records.map(function (record) {
        const patientDischarged = isPatientDischarged(round.shiftId, record.patientId);
        const label = patientDischarged && record.status !== 'completed' ? 'Discharged' : record.status === 'completed' ? 'Completed' : record.status === 'in-progress' ? 'In Progress' : 'Not Started';
        const disabled = round.status === 'cancelled' || (patientDischarged && record.status !== 'completed') ? ' disabled' : '';
        return '<button type="button" class="vitals-patient-row" data-vitals-round="' + round.id + '" data-vitals-patient="' + record.patientId + '"' + disabled + '><span><strong>' + escapeHtml(record.patientName) + '</strong><small>' + label + '</small></span><i class="fas fa-chevron-right"></i></button>';
      }).join('') + '</div>' + (round.kind === 'round' && round.status !== 'completed' && round.status !== 'cancelled' ? '<div class="vitals-round-actions"><button type="button" class="vitals-cancel-round-btn" data-cancel-vitals-round="' + round.id + '">Cancel Round</button></div>' : '') + '</article>';
    }).join('');
  }

  function hasOpenRoundRecords(round) {
    return round.records.some(function (record) {
      return record.status !== 'completed' && !isPatientDischarged(round.shiftId, record.patientId);
    });
  }

  function renderRoundPatientSelection(active, activeRound) {
    const container = document.getElementById('vitalsRoundPatientSelection');
    const selection = document.querySelector('.vitals-round-selection');
    selection.classList.toggle('has-active-round', Boolean(activeRound));
    if (!active || !active.patients || !active.patients.length) {
      container.innerHTML = '<p class="vitals-selection-empty">Add patients to the active shift before starting a round.</p>';
      return;
    }
    const selected = activeRound ? activeRound.patientIds : active.patients.map(function (patient) { return patient.id; });
    container.innerHTML = active.patients.map(function (patient) {
      const checked = selected.indexOf(patient.id) !== -1 ? ' checked' : '';
      const disabled = activeRound ? ' disabled' : '';
      return '<label class="vitals-round-patient-choice"><input type="checkbox" name="vitalsRoundPatient" value="' + escapeHtml(patient.id) + '"' + checked + disabled + '><span>' + escapeHtml(patient.name) + '</span></label>';
    }).join('');
  }

  function findVitalRecord(roundId, patientId) {
    const round = getVitalRounds().find(function (item) { return item.id === roundId; });
    return round ? { round: round, record: round.records.find(function (item) { return item.patientId === patientId; }) } : null;
  }

  function startObservationRound() {
    const active = getActiveShift();
    if (!active || !active.patients || !active.patients.length) {
      showToast('Add patients to this shift before starting a round', 'error');
      return;
    }
    const existing = getVitalRounds().slice().reverse().find(function (round) {
      return round.shiftId === active.id && round.kind === 'round' && round.status !== 'completed' && round.status !== 'cancelled' && hasOpenRoundRecords(round);
    });
    if (existing) {
      const next = existing.records.find(function (record) { return record.status !== 'completed' && !isPatientDischarged(existing.shiftId, record.patientId); });
      if (next) openVitalRecord(existing.id, next.patientId, false);
      else renderVitalsRounds();
      return;
    }
    const patientIds = Array.prototype.slice.call(document.querySelectorAll('input[name="vitalsRoundPatient"]:checked')).map(function (input) { return input.value; });
    const patients = active.patients.filter(function (patient) { return patientIds.indexOf(patient.id) !== -1; });
    if (!patients.length) { showToast('Select at least one patient for this round', 'error'); return; }
    const round = {
      id: 'vround_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      shiftId: active.id,
      title: 'Observation Round',
      kind: 'round',
      patientIds: patients.map(function (patient) { return patient.id; }),
      records: [],
      createdAt: new Date().toISOString(),
      status: 'in-progress'
    };
    round.records = patients.map(function (patient) { return makeEmptyVitalRecord(patient, round); });
    const rounds = getVitalRounds();
    rounds.push(round);
    saveVitalRounds(rounds);
    renderVitalsRounds();
    showToast('Observation round started');
  }

  function openVitalRecord(roundId, patientId, direct) {
    const found = findVitalRecord(roundId, patientId);
    if (!found || !found.record) { showToast('Vital Signs record not found', 'error'); return; }
    if (found.record.status !== 'completed' && isPatientDischarged(found.round.shiftId, patientId)) {
      showToast('This patient has been discharged; the saved record is preserved', 'error');
      return;
    }
    currentVitalsRoundId = roundId;
    currentVitalsPatientId = patientId;
    currentVitalsRecord = found.record;
    returnToRoundsAfterRecord = !direct;
    vitalsRoundsView.hidden = true;
    vitalsRecordView.hidden = false;
    document.getElementById('backToVitalsRoundsBtn').hidden = !returnToRoundsAfterRecord;
    document.getElementById('vitalsScreenTitle').textContent = 'Patient Record';
    renderVitalRecord(found.record);
    vitalsScreen.classList.add('active');
    vitalsScreen.setAttribute('aria-hidden', 'false');
    document.body.setAttribute('data-vitals-open', 'true');
  }

  function getNextOpenRoundRecord(round, patientId) {
    const records = round.records.filter(function (record) {
      return record.patientId === patientId || !isPatientDischarged(round.shiftId, record.patientId);
    });
    const currentIndex = records.findIndex(function (record) { return record.patientId === patientId; });
    if (currentIndex < 0) return null;
    const candidates = records.slice(currentIndex + 1).concat(records.slice(0, currentIndex));
    return candidates.find(function (record) { return record.status !== 'completed'; }) || null;
  }

  function renderVitalsRoundProgress(record) {
    const progress = document.getElementById('vitalsRoundProgress');
    const nextButton = document.getElementById('vitalsRoundNextBtn');
    const round = getVitalRounds().find(function (item) { return item.id === currentVitalsRoundId; });
    if (!round || round.kind !== 'round') {
      progress.hidden = true;
      nextButton.hidden = true;
      return;
    }
    const records = round.records.filter(function (item) {
      return item.patientId === record.patientId || !isPatientDischarged(round.shiftId, item.patientId);
    });
    const position = records.findIndex(function (item) { return item.patientId === record.patientId; });
    document.getElementById('vitalsRoundProgressLabel').textContent =
      'Patient ' + (position + 1) + ' of ' + records.length;
    progress.hidden = false;
    nextButton.hidden = record.status !== 'completed';
    if (nextButton.hidden) return;
    const nextRecord = getNextOpenRoundRecord(round, record.patientId);
    nextButton.innerHTML = nextRecord
      ? '<i class="fas fa-arrow-right"></i> Next Patient'
      : '<i class="fas fa-list-check"></i> Round Overview';
  }

  function openVitalsForTask(taskId) {
    const task = getAllTasks().find(function (item) { return item.id === taskId && (item.taskType === 'initial-vitals' || item.taskType === 'scheduled-vitals'); });
    if (!task) { showToast('Vital Signs task not found', 'error'); return; }
    vitalsReturnTab = document.body.getAttribute('data-active-tab') || 'tasks';
    openVitalRecord(task.vitalsRoundId, task.patientId, true);
  }

  function renderVitalRecord(record) {
    const monitorMetric = record.monitorMetric || null;
    document.getElementById('vitalsPatientName').textContent = record.patientName;
    const details = record.patientDetails || {};
    const patientDetails = [];
    if (details.diagnosis) patientDetails.push('Diagnosis: ' + details.diagnosis);
    if (details.notes) patientDetails.push('Notes: ' + details.notes);
    document.getElementById('vitalsPatientDetails').textContent =
      patientDetails.join(' · ') || 'Patient identifier: ' + record.patientName;
    document.getElementById('vitalsRecordStatus').textContent = record.status === 'completed' ? 'Completed' : record.status === 'in-progress' ? 'In Progress' : 'Not Started';
    document.getElementById('vitalsRecordStatus').className = 'vitals-status-pill ' + record.status;
    vitalsRecordView.dataset.vitalsScope = monitorMetric ? 'single' : 'full';
    const fieldKey = monitorMetric === 'systolic' || monitorMetric === 'diastolic' ? 'blood_pressure' : monitorMetric;
    document.querySelectorAll('[data-vital-field]').forEach(function (field) {
      const requiredLabel = field.querySelector('.vital-field > span:first-child, span:first-child');
      const badge = requiredLabel ? requiredLabel.querySelector('b') : null;
      const selected = !monitorMetric || field.getAttribute('data-vital-field') === fieldKey;
      field.hidden = !selected;
      if (requiredLabel && monitorMetric && selected && !badge) {
        const requiredBadge = document.createElement('b');
        requiredBadge.textContent = 'Required';
        requiredBadge.className = 'vital-task-required';
        requiredLabel.appendChild(requiredBadge);
      }
      if (!monitorMetric && badge && badge.classList.contains('vital-task-required')) badge.remove();
    });
    document.querySelectorAll('.vitals-fields-section').forEach(function (section) {
      const visibleField = Array.prototype.some.call(section.querySelectorAll('[data-vital-field]'), function (field) { return !field.hidden; });
      section.hidden = !visibleField;
    });
    const metric = VITAL_METRICS.find(function (item) { return item.key === monitorMetric || (monitorMetric === 'blood_pressure' && item.key === 'systolic'); });
    document.getElementById('vitalsScreenTitle').textContent = monitorMetric ? (monitorMetric === 'blood_pressure' ? 'Blood Pressure' : metric ? metric.label : 'Scheduled Observation') : 'Patient Record';
    document.getElementById('vitalsRequiredHeading').textContent = monitorMetric ? 'Scheduled observation' : 'Required observations';
    document.getElementById('vitalsRequiredDescription').textContent = monitorMetric ? 'Enter this measurement to complete the task' : 'All fields required to complete';
    VITAL_INPUTS.forEach(function (field) {
      const input = document.getElementById(field.id);
      const observation = record.observations[field.key] || { value: '' };
      input.value = observation.value == null ? '' : observation.value;
    });
    document.getElementById('vitalTemperatureUnit').value = record.observations.temperature.unit || getClinicalRules().temperatureUnit || '°C';
    ['pulse', 'respiration'].forEach(function (key) {
      const method = record.observations[key].method;
      document.getElementById(key + 'Method').textContent = method ?
        'Count ' + method.rawCount + ' × ' + (60 / method.durationSeconds) + ' over ' + method.durationSeconds + ' sec = ' + method.calculatedRate + ' ' + (key === 'pulse' ? 'bpm' : '/min') :
        (record.observations[key].timestamp ? 'Manually recorded' : '');
    });
    document.getElementById('vitalsSavedAt').textContent = record.updatedAt ? 'Last saved ' + new Date(record.updatedAt).toLocaleTimeString() : 'Changes save as you go.';
    document.getElementById('vitalsValidationMessage').textContent = '';
    document.getElementById('completeVitalsRecordBtn').innerHTML = record.status === 'completed' ? '<i class="fas fa-check"></i> Save Corrections' : '<i class="fas fa-check"></i> Complete Record';
    renderVitalsRoundProgress(record);
    renderClinicalAlerts(record);
    renderPatientHistory(record.patientId, record.id);
  }

  function getNumericObservation(record, key) {
    const observation = record.observations[key];
    if (!observation || observation.value === '' || observation.value == null) return null;
    const value = Number(observation.value);
    return Number.isFinite(value) ? value : null;
  }

  function getLatestPreviousObservation(patientId, key, beforeTimestamp, currentRecordId) {
    const previous = [];
    getVitalRounds().forEach(function (round) {
      round.records.forEach(function (record) {
        if (record.patientId !== patientId || record.id === currentRecordId || record.status !== 'completed') return;
        const observation = record.observations[key];
        const value = getNumericObservation(record, key);
        if (value === null || !observation.timestamp || new Date(observation.timestamp).getTime() >= beforeTimestamp) return;
        previous.push({ value: value, timestamp: observation.timestamp });
      });
    });
    previous.sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
    return previous[0] || null;
  }

  function evaluateClinicalAlerts(round, record) {
    const rules = getClinicalRules();
    const alerts = [];
    if (!rules.approved) return alerts;
    VITAL_METRICS.forEach(function (metric) {
      const value = getNumericObservation(record, metric.key);
      const observation = record.observations[metric.key];
      const config = rules.metrics[metric.key] || {};
      if (value === null || !observation.timestamp) return;
      const configuredUnit = metric.key === 'temperature' ? rules.temperatureUnit : metric.unit;
      if (observation.unit && configuredUnit && observation.unit !== configuredUnit) return;
      const timestamp = new Date(observation.timestamp).getTime();
      const min = config.min === '' || config.min == null ? null : Number(config.min);
      const max = config.max === '' || config.max == null ? null : Number(config.max);
      if ((min !== null && value < min) || (max !== null && value > max)) {
        alerts.push({ type: 'reference-range', metric: metric.key, message: metric.label + ' is outside the configured reference range (' + (min == null ? '—' : min) + ' to ' + (max == null ? '—' : max) + ' ' + configuredUnit + ').', timestamp: observation.timestamp });
      }
      const changeLimit = config.trendChange === '' || config.trendChange == null ? null : Number(config.trendChange);
      if (changeLimit !== null && changeLimit > 0) {
        const prior = getLatestPreviousObservation(record.patientId, metric.key, timestamp, record.id);
        if (prior && Math.abs(value - prior.value) >= changeLimit) {
          alerts.push({ type: 'trend-escalation', metric: metric.key, message: metric.label + ' changed by ' + Math.abs(value - prior.value) + ' ' + configuredUnit + ' since the previous completed reading.', timestamp: observation.timestamp, previousValue: prior.value, currentValue: value });
        }
      }
    });
    return alerts;
  }

  function renderClinicalAlerts(record) {
    const container = document.getElementById('vitalsClinicalAlerts');
    if (!record.clinicalAlerts || !record.clinicalAlerts.length) { container.innerHTML = ''; return; }
    container.innerHTML = record.clinicalAlerts.map(function (alert) {
      return '<div class="vitals-clinical-alert ' + alert.type + '"><i class="fas ' + (alert.type === 'trend-escalation' ? 'fa-arrow-trend-up' : 'fa-triangle-exclamation') + '"></i><span><strong>' + (alert.type === 'trend-escalation' ? 'Trend / escalation alert' : 'Reference-range alert') + '</strong><small>' + escapeHtml(alert.message) + '</small></span></div>';
    }).join('');
  }

  function renderPatientHistory(patientId, currentRecordId) {
    const records = [];
    getVitalRounds().forEach(function (round) {
      round.records.forEach(function (record) {
        if (record.patientId === patientId && record.id !== currentRecordId && record.status === 'completed') records.push({ round: round, record: record });
      });
    });
    records.sort(function (a, b) { return new Date(b.record.completedAt || b.record.updatedAt) - new Date(a.record.completedAt || a.record.updatedAt); });
    const list = document.getElementById('vitalsPatientHistory');
    if (!records.length) {
      list.innerHTML = '<div class="vitals-history-empty">No previous completed readings for this patient.</div>';
      return;
    }
    list.innerHTML = records.slice(0, 10).map(function (item) {
      const o = item.record.observations;
      const recorded = function (value) { return value == null || value === '' ? '—' : String(value); };
      const tempValue = recorded(o.temperature.value);
      const systolic = recorded(o.systolic.value);
      const diastolic = recorded(o.diastolic.value);
      const temp = tempValue === '—' ? '—' : tempValue + ' ' + (o.temperature.unit || '°C');
      const bp = systolic === '—' || diastolic === '—' ? '—' : systolic + '/' + diastolic;
      return '<article class="vitals-history-card"><div><strong>' + escapeHtml(item.round.title) + '</strong><time>' + new Date(item.record.completedAt || item.record.updatedAt).toLocaleString() + '</time></div><p>Temp ' + escapeHtml(temp) + ' · BP ' + escapeHtml(bp) + ' · Pulse ' + escapeHtml(recorded(o.pulse.value)) + ' · Resp ' + escapeHtml(recorded(o.respiration.value)) + ' · SpO₂ ' + escapeHtml(recorded(o.spo2.value)) + '</p></article>';
    }).join('');
  }

  function updateVitalObservation(record, key, value, unit) {
    const previous = record.observations[key] || { value: '', timestamp: null };
    const changed = String(previous.value == null ? '' : previous.value) !== String(value == null ? '' : value) ||
      (unit && previous.unit !== unit);
    if (!changed) return;
    record.observations[key] = {
      value: value == null ? '' : String(value),
      unit: unit || previous.unit || '',
      timestamp: value === '' || value == null ? null : new Date().toISOString(),
      method: previous.method || null
    };
  }

  function persistCurrentVitalRecord() {
    if (!currentVitalsRecord) return;
    VITAL_INPUTS.forEach(function (field) {
      const input = document.getElementById(field.id);
      const unit = field.key === 'temperature' ? document.getElementById('vitalTemperatureUnit').value : undefined;
      updateVitalObservation(currentVitalsRecord, field.key, input.value.trim(), unit);
    });
    const hasValues = Object.keys(currentVitalsRecord.observations).some(function (key) {
      return currentVitalsRecord.observations[key].value !== '';
    });
    if (currentVitalsRecord.status !== 'completed') currentVitalsRecord.status = hasValues ? 'in-progress' : 'not-started';
    currentVitalsRecord.updatedAt = new Date().toISOString();
    const oldAlerts = currentVitalsRecord.clinicalAlerts || [];
    const found = findVitalRecord(currentVitalsRoundId, currentVitalsPatientId);
    if (!found) return;
    currentVitalsRecord.clinicalAlerts = evaluateClinicalAlerts(found.round, currentVitalsRecord);
    const previousAlertIds = oldAlerts.map(function (alert) { return alert.type + ':' + alert.metric + ':' + alert.message; });
    currentVitalsRecord.clinicalAlerts.forEach(function (alert) {
      const key = alert.type + ':' + alert.metric + ':' + alert.message;
      if (previousAlertIds.indexOf(key) === -1) {
        fireBrowserNotification('CareQ Clinical Alert · ' + recordPatientName(currentVitalsRecord), alert.message);
      }
    });
    const rounds = getVitalRounds();
    const roundIndex = rounds.findIndex(function (round) { return round.id === currentVitalsRoundId; });
    if (roundIndex < 0) return;
    const recordIndex = rounds[roundIndex].records.findIndex(function (record) { return record.id === currentVitalsRecord.id; });
    if (recordIndex < 0) return;
    rounds[roundIndex].records[recordIndex] = currentVitalsRecord;
    const activeRecords = rounds[roundIndex].records.filter(function (record) { return !isPatientDischarged(rounds[roundIndex].shiftId, record.patientId); });
    const allCompleted = activeRecords.length > 0 && activeRecords.every(function (record) { return record.status === 'completed'; });
    if (rounds[roundIndex].status !== 'cancelled') {
      rounds[roundIndex].status = allCompleted ? 'completed' :
        rounds[roundIndex].kind === 'scheduled-monitoring' && !hasValues ? 'scheduled' : 'in-progress';
    }
    saveVitalRounds(rounds);
    document.getElementById('vitalsRecordStatus').textContent = currentVitalsRecord.status === 'completed' ? 'Completed' : currentVitalsRecord.status === 'in-progress' ? 'In Progress' : 'Not Started';
    document.getElementById('vitalsRecordStatus').className = 'vitals-status-pill ' + currentVitalsRecord.status;
    document.getElementById('vitalsSavedAt').textContent = 'Last saved ' + new Date(currentVitalsRecord.updatedAt).toLocaleTimeString();
    renderClinicalAlerts(currentVitalsRecord);
    renderPatientHistory(currentVitalsPatientId, currentVitalsRecord.id);
  }

  function recordPatientName(record) { return record.patientName || 'patient'; }

  VITAL_INPUTS.forEach(function (field) {
    const input = document.getElementById(field.id);
    input.addEventListener('input', function () {
      if ((field.key === 'pulse' || field.key === 'respiration') && currentVitalsRecord) {
        currentVitalsRecord.observations[field.key].method = null;
      }
      persistCurrentVitalRecord();
    });
  });
  document.getElementById('vitalTemperatureUnit').addEventListener('change', persistCurrentVitalRecord);

  document.getElementById('openVitalsRoundsBtn').addEventListener('click', openVitalsRounds);
  document.getElementById('vitalsBackBtn').addEventListener('click', function () {
    if (!vitalsRecordView.hidden && returnToRoundsAfterRecord) {
      vitalsRecordView.hidden = true;
      vitalsRoundsView.hidden = false;
      document.getElementById('vitalsScreenTitle').textContent = 'Vital Signs';
      renderVitalsRounds();
      return;
    }
    closeVitalsWorkspace();
  });
  document.getElementById('backToVitalsRoundsBtn').addEventListener('click', function () {
    vitalsRecordView.hidden = true;
    vitalsRoundsView.hidden = false;
    document.getElementById('vitalsScreenTitle').textContent = 'Vital Signs';
    renderVitalsRounds();
  });
  document.getElementById('startVitalsRoundBtn').addEventListener('click', startObservationRound);
  document.getElementById('vitalsRoundsList').addEventListener('click', function (event) {
    const cancelButton = event.target.closest('[data-cancel-vitals-round]');
    if (cancelButton) {
      pendingCancelRoundId = cancelButton.getAttribute('data-cancel-vitals-round');
      openModal(cancelVitalsRoundModal);
      return;
    }
    const button = event.target.closest('[data-vitals-round]');
    if (button) openVitalRecord(button.getAttribute('data-vitals-round'), button.getAttribute('data-vitals-patient'), false);
  });
  function closeCancelVitalsRound() {
    pendingCancelRoundId = null;
    closeModal(cancelVitalsRoundModal);
  }
  document.getElementById('closeCancelVitalsRoundBtn').addEventListener('click', closeCancelVitalsRound);
  document.getElementById('keepVitalsRoundBtn').addEventListener('click', closeCancelVitalsRound);
  document.getElementById('confirmCancelVitalsRoundBtn').addEventListener('click', function () {
    if (!pendingCancelRoundId) return;
    const rounds = getVitalRounds();
    const round = rounds.find(function (item) { return item.id === pendingCancelRoundId && item.kind === 'round' && item.status !== 'completed' && item.status !== 'cancelled'; });
    if (!round) { closeCancelVitalsRound(); renderVitalsRounds(); return; }
    round.status = 'cancelled';
    round.cancelledAt = new Date().toISOString();
    saveVitalRounds(rounds);
    closeCancelVitalsRound();
    renderVitalsRounds();
    showToast('Round cancelled; saved observations were preserved');
  });
  cancelVitalsRoundModal.addEventListener('click', function (event) { if (event.target === cancelVitalsRoundModal) closeCancelVitalsRound(); });
  document.getElementById('saveVitalsProgressBtn').addEventListener('click', function () {
    persistCurrentVitalRecord();
    showToast('Vital Signs progress saved');
  });
  document.getElementById('completeVitalsRecordBtn').addEventListener('click', function () {
    persistCurrentVitalRecord();
    const metric = currentVitalsRecord.monitorMetric;
    const required = metric ? metric === 'blood_pressure' ? ['systolic', 'diastolic'] : [metric] : ['temperature', 'systolic', 'diastolic', 'pulse', 'respiration'];
    const missing = required.filter(function (key) {
      const observation = currentVitalsRecord.observations[key];
      return observation.value === '' || !Number.isFinite(Number(observation.value));
    });
    if (missing.length) {
      document.getElementById('vitalsValidationMessage').textContent = metric ?
        'Enter the scheduled observation before completing this task.' :
        'Enter a valid temperature, both blood pressure values, pulse and respiration before completing this record.';
      return;
    }
    document.getElementById('vitalsValidationMessage').textContent = '';
    currentVitalsRecord.status = 'completed';
    currentVitalsRecord.completedAt = new Date().toISOString();
    persistCurrentVitalRecord();
    if (currentVitalsRecord.taskId) {
      const tasks = getAllTasks();
      const task = tasks.find(function (item) { return item.id === currentVitalsRecord.taskId; });
      if (task && task.status !== 'completed' && task.status !== 'cancelled') {
        task.status = 'completed';
        task.completedAt = currentVitalsRecord.completedAt;
        saveAllTasks(tasks);
        const active = getActiveShift();
        if (active && active.id === task.shiftId) {
          active.tasksCompleted = tasks.filter(function (item) { return item.shiftId === active.id && item.status === 'completed'; }).length;
          active.tasksTotal = tasks.filter(function (item) { return item.shiftId === active.id; }).length;
          saveActiveShift(active);
          renderShiftProgress(active);
        }
        renderTasks();
        renderAlerts();
        renderSchedule();
        updateAlertBadge();
      }
    }
    renderVitalsRounds();
    renderVitalRecord(currentVitalsRecord);
    showToast('Vital Signs record completed');
  });
  document.getElementById('vitalsRoundNextBtn').addEventListener('click', function () {
    const found = findVitalRecord(currentVitalsRoundId, currentVitalsPatientId);
    if (!found || !found.record || !found.round || found.round.kind !== 'round') {
      showToast('Observation round not found', 'error');
      return;
    }
    if (found.record.status !== 'completed') {
      showToast('Complete this patient’s record before continuing', 'error');
      return;
    }
    const nextRecord = getNextOpenRoundRecord(found.round, currentVitalsPatientId);
    if (nextRecord) {
      openVitalRecord(found.round.id, nextRecord.patientId, false);
      return;
    }
    vitalsRecordView.hidden = true;
    vitalsRoundsView.hidden = false;
    document.getElementById('vitalsScreenTitle').textContent = 'Vital Signs';
    renderVitalsRounds();
  });

  function renderClinicalRules() {
    const rules = getClinicalRules();
    document.getElementById('clinicalRulesApproved').checked = Boolean(rules.approved);
    document.getElementById('clinicalTemperatureUnit').value = rules.temperatureUnit || '°C';
    document.getElementById('clinicalRulesGrid').innerHTML = VITAL_METRICS.map(function (metric) {
      const config = rules.metrics[metric.key] || {};
      const unit = metric.key === 'temperature' ? rules.temperatureUnit || '°C' : metric.unit;
      return '<div class="clinical-rule-row" data-rule="' + metric.key + '"><strong>' + metric.label + ' <small>' + unit + '</small></strong><label>Min<input type="number" step="any" data-rule-min value="' + (config.min == null ? '' : escapeHtml(config.min)) + '" placeholder="—"></label><label>Max<input type="number" step="any" data-rule-max value="' + (config.max == null ? '' : escapeHtml(config.max)) + '" placeholder="—"></label><label>Trend Δ<input type="number" min="0" step="any" data-rule-trend value="' + (config.trendChange == null ? '' : escapeHtml(config.trendChange)) + '" placeholder="—"></label></div>';
    }).join('');
  }
  document.getElementById('clinicalTemperatureUnit').addEventListener('change', function () {
    const temperatureLabel = document.querySelector('.clinical-rule-row[data-rule="temperature"] strong');
    if (temperatureLabel) temperatureLabel.innerHTML = 'Temperature <small>' + document.getElementById('clinicalTemperatureUnit').value + '</small>';
  });
  document.getElementById('saveClinicalRulesBtn').addEventListener('click', function () {
    const metrics = {};
    let hasRules = false;
    let invalid = false;
    document.querySelectorAll('.clinical-rule-row').forEach(function (row) {
      const minInput = row.querySelector('[data-rule-min]');
      const maxInput = row.querySelector('[data-rule-max]');
      const trendInput = row.querySelector('[data-rule-trend]');
      const min = minInput.value.trim();
      const max = maxInput.value.trim();
      const trendChange = trendInput.value.trim();
      if ((min && !max) || (!min && max) || (min && max && Number(min) >= Number(max)) ||
          (trendChange && (!Number.isFinite(Number(trendChange)) || Number(trendChange) <= 0))) invalid = true;
      if (min || max || trendChange) hasRules = true;
      metrics[row.getAttribute('data-rule')] = { min: min, max: max, trendChange: trendChange };
    });
    const status = document.getElementById('clinicalRulesStatus');
    if (invalid) {
      status.textContent = 'Enter a valid minimum and maximum pair, and a positive trend change.';
      status.className = 'error';
      return;
    }
    const approved = document.getElementById('clinicalRulesApproved').checked;
    if (hasRules && !approved) {
      status.textContent = 'Confirm these values come from an approved clinical protocol.';
      status.className = 'error';
      return;
    }
    const rules = { approved: hasRules && approved, temperatureUnit: document.getElementById('clinicalTemperatureUnit').value, metrics: metrics };
    saveClinicalRules(rules);
    status.textContent = hasRules ? 'Facility-configured alert rules saved.' : 'Clinical alerts are not configured.';
    status.className = 'success';
    renderClinicalRules();
    if (currentVitalsRecord) persistCurrentVitalRecord();
  });

  function openStopwatch(metric) {
    stopwatchMetric = metric;
    document.getElementById('stopwatchTitle').textContent = metric === 'pulse' ? 'Pulse stopwatch' : 'Respiration stopwatch';
    document.querySelectorAll('input[name="stopwatchDuration"]').forEach(function (radio) { radio.checked = radio.value === '15'; });
    stopwatchDuration = 15;
    resetStopwatch(false);
    openModal(vitalsStopwatchModal);
  }
  function formatStopwatchTime(seconds) {
    return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  }
  function resetStopwatch(completed) {
    if (stopwatchInterval) { clearInterval(stopwatchInterval); stopwatchInterval = null; }
    if (stopwatchCountdownInterval) { clearInterval(stopwatchCountdownInterval); stopwatchCountdownInterval = null; }
    document.getElementById('stopwatchCountdown').hidden = true;
    document.getElementById('stopwatchCountdown').textContent = '';
    document.getElementById('stopwatchStartBtn').disabled = false;
    stopwatchRemaining = completed ? 0 : stopwatchDuration;
    document.getElementById('stopwatchClock').textContent = formatStopwatchTime(stopwatchRemaining);
    document.getElementById('stopwatchResultPanel').hidden = !completed;
    document.getElementById('stopwatchStartBtn').hidden = completed;
    document.getElementById('stopwatchApplyBtn').hidden = !completed;
    document.getElementById('stopwatchCountInput').value = '';
    document.getElementById('stopwatchCalculatedResult').textContent = '';
  }
  document.querySelectorAll('[data-stopwatch]').forEach(function (button) {
    button.addEventListener('click', function () { openStopwatch(button.getAttribute('data-stopwatch')); });
  });
  document.querySelectorAll('input[name="stopwatchDuration"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      if (!radio.checked || stopwatchInterval) return;
      stopwatchDuration = Number(radio.value);
      resetStopwatch(false);
    });
  });
  document.getElementById('stopwatchStartBtn').addEventListener('click', function () {
    stopwatchDuration = Number(document.querySelector('input[name="stopwatchDuration"]:checked').value);
    resetStopwatch(false);
    const startButton = document.getElementById('stopwatchStartBtn');
    const countdown = document.getElementById('stopwatchCountdown');
    let countdownValue = 3;
    startButton.disabled = true;
    countdown.textContent = String(countdownValue);
    countdown.hidden = false;
    stopwatchCountdownInterval = setInterval(function () {
      countdownValue--;
      if (countdownValue > 0) {
        countdown.textContent = String(countdownValue);
        return;
      }
      clearInterval(stopwatchCountdownInterval);
      stopwatchCountdownInterval = null;
      countdown.hidden = true;
      stopwatchDeadline = Date.now() + stopwatchDuration * 1000;
      stopwatchInterval = setInterval(function () {
        stopwatchRemaining = Math.max(0, Math.ceil((stopwatchDeadline - Date.now()) / 1000));
        document.getElementById('stopwatchClock').textContent = formatStopwatchTime(stopwatchRemaining);
      if (stopwatchRemaining <= 0) {
        clearInterval(stopwatchInterval);
        stopwatchInterval = null;
        stopwatchCompletedAt = new Date().toISOString();
        document.getElementById('stopwatchStartBtn').disabled = false;
        resetStopwatch(true);
        document.getElementById('stopwatchCountInput').focus();
      }
      }, 200);
    }, 1000);
  });
  document.getElementById('stopwatchCountInput').addEventListener('input', function () {
    const count = Number(document.getElementById('stopwatchCountInput').value);
    const rate = Number.isFinite(count) ? count * (60 / stopwatchDuration) : NaN;
    document.getElementById('stopwatchCalculatedResult').textContent =
      Number.isFinite(rate) ? 'Calculated rate: ' + rate + (stopwatchMetric === 'pulse' ? ' bpm' : ' /min') : '';
  });
  document.getElementById('stopwatchApplyBtn').addEventListener('click', function () {
    const countInput = document.getElementById('stopwatchCountInput');
    const count = Number(countInput.value);
    if (countInput.value === '' || !Number.isInteger(count) || count < 0) {
      countInput.setCustomValidity('Enter a whole-number count.');
      countInput.reportValidity();
      return;
    }
    countInput.setCustomValidity('');
    const rate = count * (60 / stopwatchDuration);
    const field = VITAL_INPUTS.find(function (item) { return item.key === stopwatchMetric; });
    const value = document.getElementById(field.id);
    const observation = currentVitalsRecord.observations[stopwatchMetric];
    observation.value = String(rate);
    observation.timestamp = stopwatchCompletedAt || new Date().toISOString();
    observation.unit = stopwatchMetric === 'pulse' ? 'bpm' : '/min';
    observation.method = { rawCount: count, durationSeconds: stopwatchDuration, calculatedRate: rate, timestamp: observation.timestamp };
    value.value = String(rate);
    document.getElementById(stopwatchMetric + 'Method').textContent =
      'Count ' + count + ' × ' + (60 / stopwatchDuration) + ' over ' + stopwatchDuration + ' sec = ' + rate + (stopwatchMetric === 'pulse' ? ' bpm' : ' /min');
    closeModal(vitalsStopwatchModal);
    persistCurrentVitalRecord();
  });
  function closeStopwatch() {
    if (stopwatchInterval) { clearInterval(stopwatchInterval); stopwatchInterval = null; }
    if (stopwatchCountdownInterval) { clearInterval(stopwatchCountdownInterval); stopwatchCountdownInterval = null; }
    document.getElementById('stopwatchCountdown').hidden = true;
    document.getElementById('stopwatchStartBtn').disabled = false;
    closeModal(vitalsStopwatchModal);
  }
  document.getElementById('closeVitalsStopwatchBtn').addEventListener('click', closeStopwatch);
  vitalsStopwatchModal.addEventListener('click', function (event) { if (event.target === vitalsStopwatchModal) closeStopwatch(); });

  // ============================================
  // ACTIVE DASHBOARD
  // ============================================
  function showActiveDashboard(activeShift) {
    offDash.classList.remove('active'); activeDash.classList.add('active');
    const user = getCurrentUserDisplay();
    const start = new Date(activeShift.startTime);
    document.getElementById('activeGreeting').textContent = 'On Shift · ' + (user.isGuest ? 'Guest' : user.firstName);
    document.getElementById('activeStartTime').textContent = 'Started ' + formatTime(start) + ' · ' + formatDate(start);
    document.getElementById('activeAvatarInitials').textContent = getInitials(user.full);
    renderActivePatients(activeShift.patients || []);
    renderDischargedPatients(activeShift);
    renderShiftProgress(activeShift);
    startElapsedTimer(start);
    // Tasks tab active banner
    document.getElementById('tasksShiftBanner').style.display = 'flex';
    updateTasksShiftTimer(start);
  }
  function renderActivePatients(patients) {
    const listEl = document.getElementById('activePatientsList');
    document.getElementById('patientCount').textContent = patients.length;
    if (patients.length === 0) { listEl.innerHTML = '<div class="empty-state"><i class="fas fa-user-slash"></i><p>No patients recorded for this shift.</p></div>'; return; }
    listEl.innerHTML = patients.map(function (p, i) {
      const name = escapeHtml(p.name || 'Unnamed');
      const patientId = escapeHtml(p.id);
      return '<div class="patient-card"><div class="patient-card-header"><span class="patient-name">' + name + '</span><span class="patient-number">P' + String(i + 1).padStart(2, '0') + '</span><details class="patient-actions"><summary aria-label="Patient actions for ' + name + '"><i class="fas fa-ellipsis-v" aria-hidden="true"></i></summary><div class="patient-action-menu" role="group" aria-label="Actions for ' + name + '"><button type="button" data-patient-action="discharge" data-patient-id="' + patientId + '"><i class="fas fa-user-minus" aria-hidden="true"></i> Discharge Patient</button><button type="button" class="patient-action-delete" data-patient-action="delete" data-patient-id="' + patientId + '"><i class="fas fa-trash" aria-hidden="true"></i> Delete Patient</button></div></details></div><div class="patient-diagnosis"><strong>Diagnosis:</strong> ' + escapeHtml(p.diagnosis || '—') + '</div>' + (p.notes ? '<div class="patient-notes"><strong>Notes:</strong> ' + escapeHtml(p.notes) + '</div>' : '') + '</div>';
    }).join('');
  }
  function renderDischargedPatients(activeShift) {
    const section = document.getElementById('dischargedPatientsSection');
    const list = document.getElementById('dischargedPatientsList');
    const patients = activeShift.dischargedPatients || [];
    section.hidden = patients.length === 0;
    list.innerHTML = patients.slice().reverse().map(function (patient) {
      const dischargeTime = patient.dischargedAt ? new Date(patient.dischargedAt).toLocaleString() : 'Discharge time unavailable';
      return '<article class="discharged-patient-card"><div class="discharged-patient-heading"><strong>' + escapeHtml(patient.name || 'Unnamed') + '</strong><span>Discharged</span></div><p>' + escapeHtml(patient.diagnosis || '—') + '</p><time datetime="' + escapeHtml(patient.dischargedAt || '') + '">' + escapeHtml(dischargeTime) + '</time></article>';
    }).join('');
  }
  function isPatientDischarged(shiftId, patientId) {
    const active = getActiveShift();
    const shift = active && active.id === shiftId ? active : getShifts().find(function (item) { return item.id === shiftId; });
    return Boolean(shift && (shift.dischargedPatients || []).some(function (patient) { return patient.id === patientId; }));
  }
  function closePatientActionMenus() {
    document.querySelectorAll('.patient-actions[open]').forEach(function (menu) { menu.open = false; });
  }
  function openPatientAction(patientId, action) {
    const active = getActiveShift();
    const patient = active && (active.patients || []).find(function (item) { return item.id === patientId; });
    if (!patient) { showToast('Patient is no longer active on this shift', 'error'); return; }
    pendingPatientAction = { patientId: patientId, action: action };
    closePatientActionMenus();
    const isDelete = action === 'delete';
    document.getElementById('patientActionTitle').textContent = isDelete ? 'Delete patient?' : 'Discharge patient?';
    document.getElementById('patientActionSubtitle').textContent = patient.name;
    document.getElementById('patientActionMessage').textContent = isDelete ?
      'This permanently removes the patient and their associated tasks, alerts and Vital Signs records from this browser. This cannot be undone.' :
      'This removes the patient from the active list and cancels unfinished tasks and reminders. Completed tasks and all Vital Signs readings will remain in shift history.';
    document.getElementById('cancelPatientActionBtn').textContent = 'Keep Patient';
    document.getElementById('confirmPatientActionBtn').textContent = isDelete ? 'Delete Patient' : 'Discharge Patient';
    openModal(patientActionModal);
  }
  document.getElementById('activePatientsList').addEventListener('click', function (event) {
    const actionButton = event.target.closest('[data-patient-action]');
    if (!actionButton) return;
    openPatientAction(actionButton.getAttribute('data-patient-id'), actionButton.getAttribute('data-patient-action'));
  });
  document.addEventListener('click', function (event) {
    if (!event.target.closest('.patient-actions')) closePatientActionMenus();
  });
  function closePatientActionModal() {
    pendingPatientAction = null;
    closeModal(patientActionModal);
  }
  document.getElementById('closePatientActionBtn').addEventListener('click', closePatientActionModal);
  document.getElementById('cancelPatientActionBtn').addEventListener('click', closePatientActionModal);
  patientActionModal.addEventListener('click', function (event) {
    if (event.target === patientActionModal) closePatientActionModal();
  });
  document.getElementById('confirmPatientActionBtn').addEventListener('click', function () {
    if (!pendingPatientAction) return;
    const action = pendingPatientAction;
    closePatientActionModal();
    if (action.action === 'delete') deletePatient(action.patientId);
    else dischargePatient(action.patientId);
  });
  function getPatientTaskIds(patientId) {
    return getAllTasks().filter(function (task) { return task.patientId === patientId; }).map(function (task) { return task.id; });
  }
  function stopPatientTaskAlerts(taskIds) {
    taskAlertQueue = taskAlertQueue.filter(function (taskId) { return taskIds.indexOf(taskId) === -1; });
    if (activeTaskAlertId && taskIds.indexOf(activeTaskAlertId) !== -1) {
      activeTaskAlertId = null;
      closeModal(document.getElementById('taskAlertModal'));
      setTimeout(showNextTaskAlert, 0);
    }
  }
  function updatePatientManagementViews(active) {
    const tasks = getAllTasks().filter(function (task) { return task.shiftId === active.id; });
    active.tasksTotal = tasks.length;
    active.tasksCompleted = tasks.filter(function (task) { return task.status === 'completed'; }).length;
    saveActiveShift(active);
    renderActivePatients(active.patients || []);
    renderDischargedPatients(active);
    renderShiftProgress(active);
    renderTasks();
    renderAlerts();
    renderSchedule();
    renderVitalsRounds();
    updateAlertBadge();
  }
  function dischargePatient(patientId) {
    const active = getActiveShift();
    if (!active) { showToast('No active shift', 'error'); return; }
    const patientIndex = (active.patients || []).findIndex(function (patient) { return patient.id === patientId; });
    if (patientIndex < 0) { showToast('Patient is no longer active on this shift', 'error'); return; }
    const dischargedAt = new Date().toISOString();
    const patient = Object.assign({}, active.patients[patientIndex], { status: 'discharged', dischargedAt: dischargedAt });
    active.patients.splice(patientIndex, 1);
    active.dischargedPatients = active.dischargedPatients || [];
    active.dischargedPatients.push(patient);

    const taskIds = getPatientTaskIds(patientId);
    const taskIdSet = taskIds;
    const tasks = getAllTasks();
    tasks.forEach(function (task) {
      if (taskIds.indexOf(task.id) === -1 || task.status === 'completed' || task.status === 'cancelled' || task.status === 'missed') return;
      task.status = 'cancelled';
      task.cancelledAt = dischargedAt;
      task.cancellationReason = 'patient-discharged';
    });
    if (active.tasks) active.tasks.forEach(function (task) {
      if (task.patientId !== patientId || task.status === 'completed' || task.status === 'cancelled' || task.status === 'missed') return;
      task.status = 'cancelled';
      task.cancelledAt = dischargedAt;
      task.cancellationReason = 'patient-discharged';
    });
    saveAllTasks(tasks);
    stopPatientTaskAlerts(taskIdSet);
    saveActiveShift(active);

    const rounds = getVitalRounds();
    rounds.forEach(function (round) {
      if (round.shiftId !== active.id || !round.records.some(function (record) { return record.patientId === patientId; })) return;
      const activeRecords = round.records.filter(function (record) { return !isPatientDischarged(round.shiftId, record.patientId); });
      if (round.status === 'completed' || round.status === 'cancelled') return;
      if (!activeRecords.length) {
        round.status = 'cancelled';
        round.cancelledAt = dischargedAt;
        round.cancelReason = 'all-patients-discharged';
      } else if (activeRecords.every(function (record) { return record.status === 'completed'; })) {
        round.status = 'completed';
        round.completedAt = dischargedAt;
      }
    });
    saveVitalRounds(rounds);
    updatePatientManagementViews(active);
    showToast('Patient discharged; completed history was preserved');
  }
  function deletePatient(patientId) {
    const active = getActiveShift();
    if (!active) { showToast('No active shift', 'error'); return; }
    const patient = (active.patients || []).find(function (item) { return item.id === patientId; });
    if (!patient) { showToast('Patient is no longer active on this shift', 'error'); return; }

    const taskIds = getPatientTaskIds(patientId);
    saveAllTasks(getAllTasks().filter(function (task) { return task.patientId !== patientId; }));
    stopPatientTaskAlerts(taskIds);
    const taskHistory = getAlertHistory().filter(function (event) {
      return event.patientId !== patientId && taskIds.indexOf(event.taskId) === -1;
    });
    saveAlertHistory(taskHistory);

    const rounds = getVitalRounds().filter(function (round) {
      const linked = (round.patientIds || []).indexOf(patientId) !== -1 ||
        round.records.some(function (record) { return record.patientId === patientId; });
      round.patientIds = (round.patientIds || []).filter(function (id) { return id !== patientId; });
      round.records = round.records.filter(function (record) { return record.patientId !== patientId; });
      return !linked || round.patientIds.length > 0 || round.records.length > 0;
    });
    const removedAt = new Date().toISOString();
    rounds.forEach(function (round) {
      if (round.shiftId !== active.id || round.status === 'completed' || round.status === 'cancelled') return;
      const activeRecords = round.records.filter(function (record) { return !isPatientDischarged(round.shiftId, record.patientId); });
      if (!activeRecords.length) {
        round.status = 'cancelled';
        round.cancelledAt = removedAt;
        round.cancelReason = 'no-active-patients';
      } else if (activeRecords.every(function (record) { return record.status === 'completed'; })) {
        round.status = 'completed';
        round.completedAt = removedAt;
      }
    });
    saveVitalRounds(rounds);

    active.patients = (active.patients || []).filter(function (item) { return item.id !== patientId; });
    active.dischargedPatients = (active.dischargedPatients || []).filter(function (item) { return item.id !== patientId; });
    if (active.tasks) active.tasks = active.tasks.filter(function (task) { return task.patientId !== patientId; });
    const shifts = getShifts();
    shifts.forEach(function (shift) {
      shift.patients = (shift.patients || []).filter(function (item) { return item.id !== patientId; });
      shift.dischargedPatients = (shift.dischargedPatients || []).filter(function (item) { return item.id !== patientId; });
      if (shift.tasks) shift.tasks = shift.tasks.filter(function (task) { return task.patientId !== patientId; });
    });
    saveShifts(shifts);
    if (currentVitalsPatientId === patientId) {
      currentVitalsRoundId = null;
      currentVitalsPatientId = null;
      currentVitalsRecord = null;
      closeVitalsWorkspace();
    }
    updatePatientManagementViews(active);
    showToast('Patient and associated history deleted');
  }
  function renderShiftProgress(activeShift) {
    const progressEl = document.getElementById('shiftProgress');
    const emptyEl = document.getElementById('shiftProgressEmpty');
    const allTasks = getAllTasks().filter(function (task) { return task.shiftId === activeShift.id; });
    const tasks = allTasks.filter(function (task) { return task.status !== 'cancelled'; });
    if (!allTasks.length) { progressEl.innerHTML = ''; progressEl.style.display = 'none'; emptyEl.style.display = 'block'; return; }
    progressEl.style.display = 'grid'; emptyEl.style.display = 'none';
    const completed = tasks.filter(function (t) { return t.status === 'completed'; }).length;
    const total = tasks.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const remaining = tasks.filter(function (task) { return task.status !== 'completed' && task.status !== 'missed'; }).length;
    progressEl.innerHTML = '<div class="stat-card"><div class="stat-value">' + completed + '</div><div class="stat-label">Tasks Done</div></div><div class="stat-card"><div class="stat-value">' + remaining + '</div><div class="stat-label">Remaining</div></div><div class="stat-card"><div class="stat-value">' + pct + '%</div><div class="stat-label">Completion</div></div>';
  }
  function startElapsedTimer(startDate) {
    stopElapsedTimer();
    const timerEl = document.getElementById('elapsedTimer');
    function tick() { const diffMs = Date.now() - startDate.getTime(); const secs = Math.max(0, Math.floor(diffMs / 1000)); const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60); const s = secs % 60; timerEl.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); }
    tick(); elapsedInterval = setInterval(tick, 1000);
  }
  function stopElapsedTimer() { if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null; } }

  function updateTasksShiftTimer(startDate) {
    function tick() {
      const el = document.getElementById('tasksShiftTimer');
      if (!el) return;
      const diffMs = Date.now() - startDate.getTime();
      const secs = Math.max(0, Math.floor(diffMs / 1000));
      const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60); const s = secs % 60;
      el.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    tick();
    // We piggyback on elapsedInterval tick — no separate interval needed, but call once
  }

  // ============================================
  // END SHIFT
  // ============================================
  document.getElementById('endShiftBtn').addEventListener('click', function () { openModal(endShiftModal); });
  document.getElementById('cancelEndShiftBtn').addEventListener('click', function () { closeModal(endShiftModal); });
  endShiftModal.addEventListener('click', function (e) { if (e.target === endShiftModal) closeModal(endShiftModal); });

  document.getElementById('confirmEndShiftBtn').addEventListener('click', function () {
    const active = getActiveShift();
    if (!active) { closeModal(endShiftModal); return; }
    active.endTime = new Date().toISOString();
    active.status = 'completed';
    // Attach task snapshot to the shift record for history
    const allTasks = getAllTasks();
    active.tasks = allTasks.filter(function (t) { return t.shiftId === active.id; });
    const shifts = getShifts();
    shifts.push(active);
    saveShifts(shifts);
    clearActiveShift();
    closeModal(endShiftModal);
    showToast('Shift ended — saved to history');
    setTimeout(refreshHome, 300);
  });

  // ============================================
  // PROFILE TAB
  // ============================================
  const personalForm = document.getElementById('personalForm');
  const professionalForm = document.getElementById('professionalForm');
  const profileCategorySelect = document.getElementById('profileCategory');
  const profileCadreSelect = document.getElementById('profileCadre');
  const profileFirstNameInput = document.getElementById('profileFirstName');
  const profileLastNameInput = document.getElementById('profileLastName');
  const profileEmailInput = document.getElementById('profileEmail');
  const profileFacilityInput = document.getElementById('profileFacility');
  const profileEditLink = document.getElementById('profileEditLink');
  let profileEditing = false;

  function setProfileEditing(editing) {
    profileEditing = editing;
    profileFirstNameInput.readOnly = !editing;
    profileLastNameInput.readOnly = !editing;
    profileEmailInput.readOnly = !editing;
    profileFacilityInput.readOnly = !editing;
    profileCategorySelect.disabled = !editing;
    profileCadreSelect.disabled = !editing || !profileCategorySelect.value || !CADRE_OPTIONS[profileCategorySelect.value];
    document.querySelectorAll('.profile-save-button').forEach(function (button) { button.hidden = !editing; });
    profileEditLink.setAttribute('aria-expanded', String(editing));
    profileEditLink.innerHTML = editing
      ? '<i class="fas fa-xmark"></i> Cancel Editing'
      : '<i class="fas fa-pen"></i> Edit Profile';
  }

  function renderProfileTab() {
    setProfileEditing(false);
    const session = getSession();
    const gp = getGuestProfile();
    const isGuestUser = !session;
    let displayName, categoryLabel, facility, avatar;
    if (isGuestUser) {
      const gFirst = gp.firstName || ''; const gLast = gp.lastName || '';
      const full = [gFirst, gLast].filter(Boolean).join(' ');
      displayName = full || 'Guest Account'; categoryLabel = ''; facility = gp.facility || ''; avatar = gp.avatar || '';
    } else {
      displayName = ((session.firstName || '') + ' ' + (session.lastName || '')).trim() || 'CareQ User';
      categoryLabel = (session.categoryLabel || '').toUpperCase();
      facility = session.facility || ''; avatar = session.avatar || '';
    }
    document.getElementById('profileHeaderName').textContent = displayName;
    const catBadge = document.getElementById('profileHeaderCategory');
    if (categoryLabel) { catBadge.textContent = categoryLabel; catBadge.hidden = false; } else { catBadge.hidden = true; }
    document.getElementById('profileHeaderFacility').textContent = facility;
    const avatarImg = document.getElementById('profileAvatarImg');
    const avatarInitials = document.getElementById('profileAvatarInitials');
    if (avatar) { avatarImg.src = avatar; avatarImg.hidden = false; avatarInitials.style.display = 'none'; }
    else { avatarImg.hidden = true; avatarImg.removeAttribute('src'); avatarInitials.style.display = 'flex'; avatarInitials.textContent = getInitials(displayName === 'Guest Account' ? 'Guest' : displayName); }

    document.getElementById('profileFirstName').value = isGuestUser ? (gp.firstName || '') : (session.firstName || '');
    document.getElementById('profileLastName').value = isGuestUser ? (gp.lastName || '') : (session.lastName || '');
    document.getElementById('profileEmail').value = isGuestUser ? '' : (session.email || '');
    const emailGroup = document.getElementById('profileEmail').closest('.input-group');
    emailGroup.style.display = isGuestUser ? 'none' : '';

    profileCategorySelect.value = isGuestUser ? (gp.category || '') : (session.category || '');
    rebuildProfileCadreOptions(profileCategorySelect.value, isGuestUser ? (gp.cadre || '') : (session.cadre || ''));
    profileFacilityInput.value = isGuestUser ? (gp.facility || '') : (session.facility || '');
    renderWorkRoster();
  }

  const workRosterForm = document.getElementById('workRosterForm');
  const rosterShiftType = document.getElementById('rosterShiftType');
  const rosterDateInput = document.getElementById('rosterDate');
  const rosterStartInput = document.getElementById('rosterStartTime');
  const rosterEndInput = document.getElementById('rosterEndTime');

  function resetWorkRosterForm() {
    editingRosterId = null;
    workRosterForm.reset();
    workRosterForm.hidden = true;
    document.getElementById('rosterFormTitle').textContent = 'Add Work Shift';
    document.getElementById('rosterFormError').textContent = '';
    document.getElementById('rosterCustomNameGroup').hidden = true;
    document.querySelector('input[name="rosterReminder"][value="60"]').checked = true;
  }

  function openWorkRosterForm(entry) {
    workRosterForm.reset();
    document.getElementById('rosterFormError').textContent = '';
    const now = new Date();
    editingRosterId = entry ? entry.id : null;
    document.getElementById('rosterFormTitle').textContent = entry ? 'Edit Work Shift' : 'Add Work Shift';
    rosterShiftType.value = entry ? entry.shiftType : 'Morning';
    document.getElementById('rosterCustomNameGroup').hidden = rosterShiftType.value !== 'Custom';
    document.getElementById('rosterCustomName').value = entry && entry.shiftType === 'Custom' ? entry.customName || '' : '';
    rosterDateInput.value = entry ? formatDateInputValue(new Date(entry.startAt)) : formatDateInputValue(now);
    rosterStartInput.value = entry ? formatTimeInputValue(new Date(entry.startAt)) : '';
    rosterEndInput.value = entry ? formatTimeInputValue(new Date(entry.endAt)) : '';
    const reminders = entry ? entry.reminderMinutes || [] : [60];
    document.querySelectorAll('input[name="rosterReminder"]').forEach(function (input) { input.checked = reminders.indexOf(Number(input.value)) !== -1; });
    document.getElementById('rosterNotes').value = entry ? entry.notes || '' : '';
    workRosterForm.hidden = false;
    workRosterForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function rosterEntryStatus(entry) {
    if (entry.status === 'cancelled') return 'Cancelled';
    return new Date(entry.endAt).getTime() < Date.now() ? 'Past' : 'Upcoming';
  }

  function renderWorkRoster() {
    const roster = getWorkRoster().slice().sort(function (a, b) { return new Date(a.startAt) - new Date(b.startAt); });
    const list = document.getElementById('workRosterList');
    document.getElementById('workRosterEmpty').hidden = roster.length > 0;
    list.innerHTML = roster.map(function (entry) {
      const status = rosterEntryStatus(entry);
      const title = entry.shiftType === 'Custom' ? entry.customName : entry.shiftType + ' Shift';
      const reminderLabel = (entry.reminderMinutes || []).length ? (entry.reminderMinutes || []).slice().sort(function (a, b) { return b - a; }).map(function (minutes) { return minutes === 60 ? '1h' : minutes + 'm'; }).join(', ') : 'No reminders';
      return '<article class="roster-shift-card ' + status.toLowerCase() + '"><span class="roster-shift-icon"><i class="fas fa-calendar-check"></i></span><div class="roster-shift-main"><div class="roster-shift-name">' + escapeHtml(title) + '</div><div class="roster-shift-meta">' + formatDateTimeShort(new Date(entry.startAt)) + ' – ' + formatTime(new Date(entry.endAt)) + ' · ' + status + '</div><div class="roster-shift-meta">Reminders: ' + escapeHtml(reminderLabel) + '</div>' +
        (entry.notes ? '<div class="schedule-card-notes">' + escapeHtml(entry.notes) + '</div>' : '') + '</div><div class="roster-shift-actions">' +
        (entry.status !== 'cancelled' ? '<button type="button" class="task-action-btn" data-roster-edit="' + entry.id + '"><i class="fas fa-pen"></i> Edit</button><button type="button" class="task-action-btn cancel-task-btn" data-roster-cancel="' + entry.id + '"><i class="fas fa-ban"></i> Delete</button>' : '') +
        '<button type="button" class="task-action-btn" data-roster-calendar="' + entry.id + '"><i class="fas fa-calendar-plus"></i> ' + (entry.status === 'cancelled' ? 'Remove from calendar' : entry.calendarExportedAt ? 'Update calendar event' : 'Add to calendar') + '</button>' +
        '</div></article>';
    }).join('');
  }

  rosterShiftType.addEventListener('change', function () {
    const isCustom = rosterShiftType.value === 'Custom';
    document.getElementById('rosterCustomNameGroup').hidden = !isCustom;
    if (!isCustom) document.getElementById('rosterCustomName').value = '';
  });
  document.getElementById('addRosterShiftBtn').addEventListener('click', function () { openWorkRosterForm(null); });
  document.getElementById('cancelRosterFormBtn').addEventListener('click', resetWorkRosterForm);

  workRosterForm.addEventListener('submit', function (event) {
    event.preventDefault();
    const error = document.getElementById('rosterFormError');
    error.textContent = '';
    const type = rosterShiftType.value;
    const customName = document.getElementById('rosterCustomName').value.trim();
    const dateValue = rosterDateInput.value;
    const startTime = rosterStartInput.value;
    const endTime = rosterEndInput.value;
    if (type === 'Custom' && !customName) { error.textContent = 'Enter a name for the custom shift.'; return; }
    if (!dateValue || !startTime || !endTime) { error.textContent = 'Enter the date, start time and end time.'; return; }
    const start = parseLocalDateTime(dateValue, startTime);
    if (!start) { error.textContent = 'The start time is invalid in the device timezone.'; return; }
    let endDateValue = dateValue;
    if (endTime <= startTime) {
      const dateParts = dateValue.split('-').map(Number);
      endDateValue = formatDateInputValue(new Date(dateParts[0], dateParts[1] - 1, dateParts[2] + 1));
    }
    const end = parseLocalDateTime(endDateValue, endTime);
    if (!end || end.getTime() <= start.getTime()) { error.textContent = 'The end time must be after the start time.'; return; }
    const reminderMinutes = Array.prototype.slice.call(document.querySelectorAll('input[name="rosterReminder"]:checked')).map(function (input) { return Number(input.value); });
    const roster = getWorkRoster();
    const existing = editingRosterId ? roster.find(function (entry) { return entry.id === editingRosterId && entry.status !== 'cancelled'; }) : null;
    if (editingRosterId && !existing) { error.textContent = 'This roster entry can no longer be edited.'; return; }
    const entry = existing || {
      id: 'roster_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      status: 'scheduled',
      remindedBeforeMinutes: [],
      createdAt: new Date().toISOString(),
      calendarSequence: 0
    };
    const changedSchedule = !existing || existing.startAt !== start.toISOString() || existing.endAt !== end.toISOString();
    entry.shiftType = type;
    entry.customName = type === 'Custom' ? customName : '';
    entry.title = type === 'Custom' ? customName : type + ' Shift';
    entry.startAt = start.toISOString();
    entry.endAt = end.toISOString();
    entry.reminderMinutes = reminderMinutes;
    entry.notes = document.getElementById('rosterNotes').value.trim();
    entry.updatedAt = new Date().toISOString();
    if (changedSchedule) entry.remindedBeforeMinutes = [];
    if (existing) entry.calendarSequence = (entry.calendarSequence || 0) + 1;
    else roster.push(entry);
    saveWorkRoster(roster);
    resetWorkRosterForm();
    renderWorkRoster();
    renderSchedule();
    requestNotificationPermissionOnce();
    scheduleTaskEngine();
    showToast(existing ? 'Work shift updated' : 'Work shift added');
  });

  document.getElementById('workRosterList').addEventListener('click', function (event) {
    const edit = event.target.closest('[data-roster-edit]');
    if (edit) {
      const entry = getWorkRoster().find(function (item) { return item.id === edit.getAttribute('data-roster-edit'); });
      if (entry) openWorkRosterForm(entry);
      return;
    }
    const cancel = event.target.closest('[data-roster-cancel]');
    if (cancel) {
      const roster = getWorkRoster();
      const entry = roster.find(function (item) { return item.id === cancel.getAttribute('data-roster-cancel') && item.status !== 'cancelled'; });
      if (!entry || !window.confirm('Delete this roster shift? Its history will remain available.')) return;
      entry.status = 'cancelled';
      entry.cancelledAt = new Date().toISOString();
      entry.calendarSequence = (entry.calendarSequence || 0) + 1;
      entry.remindedBeforeMinutes = entry.remindedBeforeMinutes || [];
      saveWorkRoster(roster);
      renderWorkRoster();
      renderSchedule();
      showToast('Roster shift deleted');
      return;
    }
    const calendar = event.target.closest('[data-roster-calendar]');
    if (calendar) {
      const entry = getWorkRoster().find(function (item) { return item.id === calendar.getAttribute('data-roster-calendar'); });
      if (entry) exportRosterCalendarEvent(entry);
    }
  });

  function escapeIcsText(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  }

  function formatIcsUtc(value) {
    return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }

  function exportRosterCalendarEvent(entry) {
    const title = entry.shiftType === 'Custom' ? entry.customName : entry.shiftType + ' Shift';
    const reminders = entry.status === 'cancelled' ? [] : entry.reminderMinutes || [];
    const alarms = reminders.map(function (minutes) {
      return 'BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:' + escapeIcsText(title + ' begins in ' + minutes + ' minutes') + '\r\nTRIGGER:-PT' + minutes + 'M\r\nEND:VALARM';
    }).join('\r\n');
    const method = entry.status === 'cancelled' ? 'CANCEL' : 'PUBLISH';
    const status = entry.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED';
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CareQ//Work Roster//EN', 'CALSCALE:GREGORIAN', 'METHOD:' + method,
      'BEGIN:VEVENT', 'UID:' + entry.id + '@careq.local', 'DTSTAMP:' + formatIcsUtc(new Date()),
      'SEQUENCE:' + (entry.calendarSequence || 0), 'DTSTART:' + formatIcsUtc(entry.startAt), 'DTEND:' + formatIcsUtc(entry.endAt),
      'SUMMARY:' + escapeIcsText(title), 'DESCRIPTION:' + escapeIcsText(entry.notes || ''), 'STATUS:' + status
    ];
    if (alarms) lines.push(alarms);
    lines.push('END:VEVENT', 'END:VCALENDAR');
    const contents = lines.join('\r\n') + '\r\n';
    const fileName = 'careq-' + entry.id + '.ics';
    const calendarBlob = new Blob([contents], { type: 'text/calendar;charset=utf-8' });
    const file = typeof File === 'undefined' ? null : new File([calendarBlob], fileName, { type: 'text/calendar' });
    const done = function () {
      const roster = getWorkRoster();
      const stored = roster.find(function (item) { return item.id === entry.id; });
      if (stored) {
        stored.calendarExportedAt = new Date().toISOString();
        saveWorkRoster(roster);
        renderWorkRoster();
      }
      showToast(entry.status === 'cancelled' ? 'Calendar cancellation exported' : 'Calendar event exported');
    };
    const downloadCalendarFile = function () {
      const url = URL.createObjectURL(file || calendarBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      done();
    };
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: title }).then(done).catch(function (shareError) {
        if (shareError && shareError.name !== 'AbortError') downloadCalendarFile();
      });
      return;
    }
    downloadCalendarFile();
  }

  function rebuildProfileCadreOptions(category, selectedCadre) {
    profileCadreSelect.innerHTML = '';
    if (!category || !CADRE_OPTIONS[category]) { profileCadreSelect.disabled = true; profileCadreSelect.innerHTML = '<option value="">Select category first…</option>'; return; }
    profileCadreSelect.disabled = !profileEditing;
    const ph = document.createElement('option'); ph.value = ''; ph.textContent = 'Select cadre / rank…'; profileCadreSelect.appendChild(ph);
    CADRE_OPTIONS[category].forEach(function (opt) { const o = document.createElement('option'); o.value = opt; o.textContent = opt; if (opt === selectedCadre) o.selected = true; profileCadreSelect.appendChild(o); });
  }

  profileCategorySelect.addEventListener('change', function () { rebuildProfileCadreOptions(profileCategorySelect.value, ''); });

  personalForm.addEventListener('submit', function (e) {
    e.preventDefault(); clearAllErrors(personalForm);
    const first = document.getElementById('profileFirstName').value.trim();
    const last = document.getElementById('profileLastName').value.trim();
    const isGuestUser = !getSession();
    const email = isGuestUser ? '' : document.getElementById('profileEmail').value.trim();
    let valid = true;
    if (!first) { showError('profileFirstName', 'First name is required.'); valid = false; }
    if (!last) { showError('profileLastName', 'Last name is required.'); valid = false; }
    if (!isGuestUser) {
      if (!email) { showError('profileEmail', 'Email is required.'); valid = false; }
      else if (!isValidEmail(email)) { showError('profileEmail', 'Enter a valid email address.'); valid = false; }
      else { const session = getSession(); const conflict = getUsers().some(function (u) { return u.email.toLowerCase() === email.toLowerCase() && u.email.toLowerCase() !== (session.email || '').toLowerCase(); }); if (conflict) { showError('profileEmail', 'This email is already used by another account.'); valid = false; } }
    }
    if (!valid) return;
    if (isGuestUser) { const gp = getGuestProfile(); gp.firstName = first; gp.lastName = last; saveGuestProfile(gp); showToast('Personal details saved'); }
    else { const session = getSession(); const users = getUsers(); const idx = users.findIndex(function (u) { return u.email.toLowerCase() === session.email.toLowerCase(); }); if (idx !== -1) { users[idx].firstName = first; users[idx].lastName = last; users[idx].email = email; saveUsers(users); } session.firstName = first; session.lastName = last; session.email = email; saveSession(session); showToast('Personal details saved'); }
    renderProfileTab(); updateDashboardAvatars();
  });

  professionalForm.addEventListener('submit', function (e) {
    e.preventDefault(); clearAllErrors(professionalForm);
    const category = profileCategorySelect.value;
    const cadre = profileCadreSelect.value;
    const facility = document.getElementById('profileFacility').value.trim();
    let valid = true;
    if (category && !cadre) { showError('profileCadre', 'Select a cadre / rank for your category.'); valid = false; }
    if (cadre && !category) { showError('profileCategory', 'Select your professional category.'); valid = false; }
    if (!valid) return;
    const isGuestUser = !getSession();
    if (isGuestUser) { const gp = getGuestProfile(); gp.category = category; gp.categoryLabel = category ? CATEGORY_LABELS[category] : ''; gp.cadre = cadre; gp.facility = facility; saveGuestProfile(gp); }
    else { const session = getSession(); const users = getUsers(); const idx = users.findIndex(function (u) { return u.email.toLowerCase() === session.email.toLowerCase(); }); const catLabel = category ? CATEGORY_LABELS[category] : ''; if (idx !== -1) { users[idx].category = category; users[idx].categoryLabel = catLabel; users[idx].cadre = cadre; users[idx].facility = facility; saveUsers(users); } session.category = category; session.categoryLabel = catLabel; session.cadre = cadre; session.facility = facility; saveSession(session); }
    showToast('Professional details saved'); renderProfileTab();
  });

  const profileImageInput = document.getElementById('profileImageInput');
  const profileAvatarBtn = document.getElementById('profileAvatarBtn');
  profileAvatarBtn.addEventListener('click', function () { profileImageInput.click(); });
  profileEditLink.addEventListener('click', function () {
    if (profileEditing) {
      renderProfileTab();
      return;
    }
    setProfileEditing(true);
    profileFirstNameInput.focus();
  });
  profileImageInput.addEventListener('change', function () {
    const file = profileImageInput.files && profileImageInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please choose an image file', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { showToast('Image must be under 2MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = function () {
      const dataUrl = reader.result;
      const isGuestUser = !getSession();
      if (isGuestUser) { const gp = getGuestProfile(); gp.avatar = dataUrl; saveGuestProfile(gp); }
      else { const session = getSession(); const users = getUsers(); const idx = users.findIndex(function (u) { return u.email.toLowerCase() === session.email.toLowerCase(); }); if (idx !== -1) { users[idx].avatar = dataUrl; saveUsers(users); } session.avatar = dataUrl; saveSession(session); }
      showToast('Profile picture updated'); renderProfileTab(); updateDashboardAvatars();
    };
    reader.readAsDataURL(file);
  });

  function updateDashboardAvatars() {
    const session = getSession(); const gp = getGuestProfile();
    const avatar = session ? (session.avatar || '') : (gp.avatar || '');
    ['offAvatarBtn', 'activeAvatarBtn'].forEach(function (id) {
      const btn = document.getElementById(id); if (!btn) return;
      const existingImg = btn.querySelector('img');
      if (avatar) {
        if (existingImg) existingImg.src = avatar;
        else { const img = document.createElement('img'); img.src = avatar; img.alt = 'Profile'; const initials = btn.querySelector('span'); if (initials) initials.style.display = 'none'; btn.insertBefore(img, btn.firstChild); }
      } else {
        if (existingImg) existingImg.remove();
        const initials = btn.querySelector('span');
        if (initials) { initials.style.display = ''; const s2 = getSession(); if (s2 && s2.firstName) initials.textContent = getInitials(s2.firstName + ' ' + s2.lastName); else { const g2 = getGuestProfile(); const full = [g2.firstName || '', g2.lastName || ''].filter(Boolean).join(' '); initials.textContent = full ? getInitials(full) : 'G'; } }
      }
    });
  }

  // ============================================
  // INFO MODAL
  // ============================================
  const INFO_CONTENT = {
    notifications: { title: 'Notifications', body: 'Standard task reminders appear 10 minutes before and at the scheduled time. Initial admission Vital Signs tasks alert at their scheduled time. Work roster reminders can be set for one hour, 30 minutes or 15 minutes before a shift. Browser notifications appear if you grant permission.' },
    appearance: { title: 'Appearance', body: 'Appearance and theme settings are coming in a future update.' },
    privacy: { title: 'Privacy & Security', body: 'This prototype stores data locally in your browser only. No data is sent to a server.' },
    help: { title: 'Help & Support', body: 'This is a local prototype — no data is sent to a server. For support, contact the CareQ team.' },
    about: { title: 'About CareQ', body: 'CareQ is a nursing productivity prototype designed around individual shifts. Care, organised.' }
  };
  document.querySelectorAll('[data-info]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const info = INFO_CONTENT[btn.getAttribute('data-info')]; if (!info) return;
      document.getElementById('infoModalTitle').textContent = info.title;
      const body = document.getElementById('infoModalBody');
      const privacyPanel = document.getElementById('privacyInfoPanel');
      const isPrivacy = btn.getAttribute('data-info') === 'privacy';
      body.hidden = isPrivacy;
      privacyPanel.hidden = !isPrivacy;
      if (!isPrivacy) body.textContent = info.body;
      openModal(infoModal);
    });
  });
  document.getElementById('closeInfoBtn').addEventListener('click', function () { closeModal(infoModal); });
  document.getElementById('okInfoBtn').addEventListener('click', function () { closeModal(infoModal); });
  infoModal.addEventListener('click', function (e) { if (e.target === infoModal) closeModal(infoModal); });

  // ============================================
  // LOGOUT
  // ============================================
  function performLogout() {
    clearSession(); setGuest(false); stopElapsedTimer(); closeModal(infoModal);
    showToast('Logged out');
    setTimeout(function () { navigateTo('welcome'); }, 300);
  }
  document.getElementById('logoutBtnProfile').addEventListener('click', performLogout);

  // ============================================
  // TASK ENGINE — creation, listing, reminders
  // ============================================
  function getActiveShiftTasks() {
    const active = getActiveShift();
    if (!active) return [];
    return getAllTasks().filter(function (t) { return t.shiftId === active.id; });
  }

  function taskStatus(task) {
    if (task.status === 'completed' || task.status === 'cancelled' || task.status === 'missed') return task.status;
    const now = Date.now();
    const sched = new Date(task.scheduledAt).getTime();
    if (sched < now - 60 * 1000) return 'overdue';
    if (sched <= now + 60 * 1000) return 'due-now';
    return 'upcoming';
  }

  function taskGroup(task) {
    const status = taskStatus(task);
    if (status === 'completed' || status === 'missed' || status === 'cancelled') return status;
    const now = new Date();
    const sched = new Date(task.scheduledAt);
    const sameDay = sched.toDateString() === now.toDateString();
    if (status === 'overdue') return 'overdue';
    if (status === 'due-now') return 'due-now';
    if (sameDay) return 'upcoming';
    return 'later';
  }

  const GROUP_ORDER = ['overdue', 'due-now', 'upcoming', 'later', 'completed', 'missed', 'cancelled'];
  const GROUP_LABELS = { 'overdue': 'Overdue', 'due-now': 'Due Now', 'upcoming': 'Upcoming Today', 'later': 'Later', 'completed': 'Completed', 'missed': 'Missed', 'cancelled': 'Cancelled' };

  function renderTasks() {
    const listEl = document.getElementById('tasksList');
    const emptyEl = document.getElementById('tasksEmpty');
    const active = getActiveShift();
    const tasks = getActiveShiftTasks();

    // Task shift banner
    if (active) {
      document.getElementById('tasksShiftBanner').style.display = 'flex';
      const start = new Date(active.startTime);
      updateTasksShiftTimer(start);
    } else {
      document.getElementById('tasksShiftBanner').style.display = 'none';
    }

    // Summary
    const total = tasks.length;
    const completed = tasks.filter(function (t) { return t.status === 'completed'; }).length;
    const remaining = tasks.filter(function (task) { return task.status !== 'completed' && task.status !== 'cancelled' && task.status !== 'missed'; }).length;
    document.getElementById('summaryTotal').textContent = total;
    document.getElementById('summaryCompleted').textContent = completed;
    document.getElementById('summaryRemaining').textContent = remaining;

    // Empty states
    if (total === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      document.getElementById('tasksEmptyText').textContent = active ? 'No tasks yet. Tap Create Task to add one.' : 'Take over a shift to start creating tasks.';
      return;
    }

    // Filter
    let filtered = tasks;
    if (currentTaskFilter === 'pending') filtered = tasks.filter(function (t) { return t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'missed'; });
    else if (currentTaskFilter === 'completed') filtered = tasks.filter(function (t) { return t.status === 'completed'; });
    else if (currentTaskFilter === 'overdue') filtered = tasks.filter(function (t) { return taskStatus(t) === 'overdue'; });

    if (filtered.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      document.getElementById('tasksEmptyText').textContent = 'No tasks match this filter.';
      return;
    }
    emptyEl.style.display = 'none';

    // Sort chronologically
    filtered.sort(function (a, b) { return new Date(a.scheduledAt) - new Date(b.scheduledAt); });

    // Group
    const groups = { 'overdue': [], 'due-now': [], 'upcoming': [], 'later': [], 'completed': [], 'missed': [], 'cancelled': [] };
    filtered.forEach(function (t) { groups[taskGroup(t)].push(t); });

    let html = '';
    GROUP_ORDER.forEach(function (g) {
      const arr = groups[g];
      if (!arr || arr.length === 0) return;
      html += '<div class="task-group"><div class="task-group-header ' + g + '"><span class="task-group-title">' + GROUP_LABELS[g] + '</span><span class="task-group-count">' + arr.length + '</span></div>';
      arr.forEach(function (t) { html += renderTaskCard(t); });
      html += '</div>';
    });
    listEl.innerHTML = html;
  }

  function renderTaskCard(task) {
    const status = taskStatus(task);
    const priority = task.priority || 'normal';
    const sched = new Date(task.scheduledAt);
    const statusClass = status === 'completed' ? 'completed' : status === 'due-now' ? 'due-now' : status === 'overdue' || status === 'missed' || status === 'cancelled' ? status : 'upcoming';
    const catName = (TASK_CATEGORIES.find(function (c) { return c.id === task.category; }) || {}).name || task.category;
    return '<div class="task-card ' + statusClass + '" data-task-card-id="' + escapeHtml(task.id) + '">' +
      '<div class="task-card-main">' +
        '<div class="task-card-top">' +
          '<span class="task-title">' + escapeHtml(task.activityName) + '</span>' +
          '<span class="task-category-chip">' + escapeHtml(catName) + '</span>' +
          '<span class="task-priority ' + priority + '">' + priority + '</span>' +
        '</div>' +
        '<div class="task-meta-row">' +
          '<span class="task-patient"><i class="fas fa-user"></i> ' + escapeHtml(task.patientName) + '</span>' +
          '<span class="task-time"><i class="fas fa-clock"></i> ' + formatDateTimeShort(sched) + '</span>' +
          (status !== 'completed' ? '<span class="task-reminder"><i class="fas fa-bell"></i> ' + (task.suppressPreReminder ? 'Scheduled alert' : '10m + on-time') + '</span>' : '') +
          '<span class="task-status-pill ' + statusClass + '">' + (status === 'due-now' ? 'Due Now' : status === 'overdue' ? 'Overdue' : status === 'missed' ? 'Missed' : status === 'cancelled' ? 'Cancelled' : status === 'completed' ? 'Completed' : 'Upcoming') + '</span>' +
        '</div>' +
        (task.description ? '<div class="task-desc">' + escapeHtml(task.description) + '</div>' : '') +
      '</div>' +
      '<div class="task-actions">' +
        ((task.taskType === 'initial-vitals' || task.taskType === 'scheduled-vitals') && status !== 'cancelled' && status !== 'missed' ? '<button type="button" class="task-action-btn" data-task-vitals="' + task.id + '"><i class="fas fa-heart-pulse"></i> ' + (task.status === 'completed' ? 'View Vitals' : 'Record Vitals') + '</button>' : '') +
        (status !== 'completed' && status !== 'cancelled' && status !== 'missed' ? '<button type="button" class="task-action-btn" data-task-edit="' + task.id + '"><i class="fas fa-pen"></i> Edit</button>' : '') +
        (status !== 'completed' && status !== 'cancelled' && status !== 'missed' && task.taskType !== 'initial-vitals' && task.taskType !== 'scheduled-vitals' ? '<button type="button" class="task-action-btn complete-btn" data-task-complete="' + task.id + '"><i class="fas fa-check"></i> Complete</button>' : '') +
        (status === 'overdue' ? '<button type="button" class="task-action-btn cancel-task-btn" data-task-missed="' + task.id + '"><i class="fas fa-circle-exclamation"></i> Mark Missed</button>' : '') +
        (status !== 'completed' && status !== 'cancelled' && status !== 'missed' ? '<button type="button" class="task-action-btn cancel-task-btn" data-task-cancel="' + task.id + '"><i class="fas fa-ban"></i> Cancel</button>' : '') +
      '</div>' +
    '</div>';
  }

  // Task filter buttons
  document.querySelectorAll('#taskFilters .filter-pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      currentTaskFilter = btn.getAttribute('data-filter');
      document.querySelectorAll('#taskFilters .filter-pill').forEach(function (b) { b.classList.toggle('active', b === btn); });
      renderTasks();
    });
  });

  // Delegate "Complete" button clicks in tasks list
  document.getElementById('tasksList').addEventListener('click', function (e) {
    const vitalsBtn = e.target.closest('[data-task-vitals]');
    if (vitalsBtn) {
      openVitalsForTask(vitalsBtn.getAttribute('data-task-vitals'));
      return;
    }
    const cancelBtn = e.target.closest('[data-task-cancel]');
    if (cancelBtn) {
      cancelTask(cancelBtn.getAttribute('data-task-cancel'));
      return;
    }
    const missedBtn = e.target.closest('[data-task-missed]');
    if (missedBtn) {
      markTaskMissed(missedBtn.getAttribute('data-task-missed'));
      return;
    }
    const editBtn = e.target.closest('[data-task-edit]');
    if (editBtn) {
      openEditTask(editBtn.getAttribute('data-task-edit'));
      return;
    }
    const btn = e.target.closest('[data-task-complete]');
    if (!btn) return;
    const taskId = btn.getAttribute('data-task-complete');
    completeTask(taskId);
  });

  function completeTask(taskId) {
    const tasks = getAllTasks();
    const task = tasks.find(function (t) { return t.id === taskId; });
    if (!task) return;
    if (task.status === 'completed') return;
    if (task.taskType === 'initial-vitals' || task.taskType === 'scheduled-vitals') { showToast('Complete the Vital Signs record to finish this task', 'error'); return; }
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    saveAllTasks(tasks);
    showToast('Task completed');
    // Update shift counters if active
    const active = getActiveShift();
    if (active && active.id === task.shiftId) {
      active.tasksCompleted = tasks.filter(function (t) { return t.shiftId === active.id && t.status === 'completed'; }).length;
      active.tasksTotal = tasks.filter(function (t) { return t.shiftId === active.id; }).length;
      saveActiveShift(active);
    }
    renderTasks(); renderAlerts(); renderSchedule(); updateAlertBadge();
    if (active) renderShiftProgress(active);
  }

  function cancelTask(taskId) {
    const tasks = getAllTasks();
    const task = tasks.find(function (item) { return item.id === taskId; });
    if (!task || task.status === 'completed' || task.status === 'cancelled' || task.status === 'missed') return;
    if (!window.confirm('Cancel "' + task.activityName + '" for ' + task.patientName + '? The task and its alert history will be kept.')) return;
    task.status = 'cancelled';
    task.cancelledAt = new Date().toISOString();
    saveAllTasks(tasks);
    renderTasks();
    renderAlerts();
    renderSchedule();
    updateAlertBadge();
    showToast('Task cancelled; schedule history was preserved');
  }

  function markTaskMissed(taskId) {
    const tasks = getAllTasks();
    const task = tasks.find(function (item) { return item.id === taskId; });
    if (!task || task.status !== 'pending' || taskStatus(task) !== 'overdue') return;
    task.status = 'missed';
    task.missedAt = new Date().toISOString();
    saveAllTasks(tasks);
    renderTasks();
    renderAlerts();
    renderSchedule();
    updateAlertBadge();
    showToast('Task marked as missed; its schedule history was preserved');
  }

  // ============================================
  // CREATE TASK MODAL FLOW
  // ============================================
  const createTaskModal = document.getElementById('createTaskModal');
  let createStep = 1;
  let draftCategory = null;
  let draftActivity = null;
  let draftIsCustom = false;
  let editingTaskId = null;
  let originalScheduledAt = null;
  let draftVitalMetric = null;

  function getVitalMetricForActivity(activity) {
    if (/blood pressure/i.test(activity)) return 'blood_pressure';
    if (/temperature/i.test(activity)) return 'temperature';
    if (/pulse/i.test(activity)) return 'pulse';
    if (/respiratory rate|respiration/i.test(activity)) return 'respiration';
    if (/oxygen saturation|spo2/i.test(activity)) return 'spo2';
    return null;
  }

  function updateTaskVitalsMetricInfo() {
    const info = document.getElementById('taskVitalsMetricInfo');
    if (draftCategory !== 'vital_signs') {
      info.hidden = true;
      info.textContent = '';
      return;
    }
    info.hidden = false;
    info.textContent = draftVitalMetric ?
      'This task opens a dedicated ' + (draftVitalMetric === 'blood_pressure' ? 'Blood Pressure' : draftVitalMetric === 'spo2' ? 'SpO₂' : draftVitalMetric.charAt(0).toUpperCase() + draftVitalMetric.slice(1)) + ' recording screen for the selected patient.' :
      'This task opens the full Vital Signs recording screen for the selected patient.';
  }

  function setCreateStep(step) {
    createStep = step;
    document.querySelectorAll('.cstep-panel').forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-cstep') === String(step)); });
    document.querySelectorAll('.create-step-indicator .step-dot').forEach(function (d) { d.classList.toggle('active', d.getAttribute('data-cstep') === String(step)); });
    const label = document.getElementById('createTaskStepLabel');
    label.textContent = 'Step ' + step + ' of 3 · ' + (step === 1 ? 'Select category' : step === 2 ? 'Select activity' : 'Schedule & details');
    document.getElementById('saveTaskBtn').disabled = step !== 3;
  }

  function openCreateTask() {
    const active = getActiveShift();
    if (!active) { showToast('Take over a shift before creating tasks', 'error'); return; }
    if (!active.patients || active.patients.length === 0) { showToast('Add patients to this shift first', 'error'); return; }

    // Reset draft
    draftCategory = null; draftActivity = null; draftIsCustom = false; draftVitalMetric = null;
    editingTaskId = null; originalScheduledAt = null;
    document.getElementById('createTaskTitle').textContent = 'Create Task';
    document.getElementById('saveTaskBtn').textContent = 'Save Task';
    document.getElementById('taskActivityName').value = '';
    const now = new Date();
    document.getElementById('taskDate').value = formatDateInputValue(now);
    document.getElementById('taskTime').value = formatTimeInputValue(now);
    document.getElementById('taskPriority').value = 'normal';
    document.getElementById('taskDescription').value = '';
    document.getElementById('taskVitalsMetricInfo').hidden = true;
    clearAllErrors(document.getElementById('createTaskModal'));

    // Patient dropdown
    const patientSelect = document.getElementById('taskPatient');
    patientSelect.innerHTML = '<option value="">Select patient…</option>' + active.patients.map(function (p) { return '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>'; }).join('');

    // Category grid
    const grid = document.getElementById('categoryGrid');
    grid.innerHTML = TASK_CATEGORIES.map(function (c) {
      return '<button type="button" class="category-tile" data-cat="' + c.id + '"><span class="category-icon"><i class="fas ' + c.icon + '"></i></span><span class="category-name">' + c.name + '</span><span class="category-desc">' + c.desc + '</span></button>';
    }).join('');
    grid.querySelectorAll('.category-tile').forEach(function (tile) {
      tile.addEventListener('click', function () {
        draftCategory = tile.getAttribute('data-cat');
        draftIsCustom = false;
        // Build activity list
        const cat = TASK_CATEGORIES.find(function (c) { return c.id === draftCategory; });
        document.getElementById('chosenCategoryChip').textContent = cat.name;
        const actList = document.getElementById('activityList');
        const acts = TASK_ACTIVITIES[draftCategory] || [];
        actList.innerHTML = acts.map(function (a) { return '<button type="button" class="activity-btn" data-act="' + escapeHtml(a) + '"><span>' + escapeHtml(a) + '</span><i class="fas fa-chevron-right"></i></button>'; }).join('');
        actList.querySelectorAll('.activity-btn').forEach(function (b) {
          b.addEventListener('click', function () {
            draftActivity = b.getAttribute('data-act');
            draftIsCustom = false;
            draftVitalMetric = draftCategory === 'vital_signs' ? getVitalMetricForActivity(draftActivity) : null;
            document.getElementById('taskActivityName').value = draftActivity;
            updateTaskVitalsMetricInfo();
            setCreateStep(3);
          });
        });
        setCreateStep(2);
      });
    });

    setCreateStep(1);
    openModal(createTaskModal);
  }

  function openEditTask(taskId) {
    const active = getActiveShift();
    const task = getAllTasks().find(function (t) { return t.id === taskId && t.status !== 'completed'; });
    if (!active || !task || task.shiftId !== active.id) return;

    draftCategory = task.category;
    draftActivity = task.activityName;
    draftVitalMetric = task.vitalMetric || null;
    draftIsCustom = Boolean(task.isCustom);
    editingTaskId = task.id;
    originalScheduledAt = task.scheduledAt;
    document.getElementById('createTaskTitle').textContent = 'Edit Task';
    document.getElementById('saveTaskBtn').textContent = 'Save Changes';
    document.getElementById('taskActivityName').value = task.activityName || '';
    updateTaskVitalsMetricInfo();
    document.getElementById('taskPriority').value = task.priority || 'normal';
    document.getElementById('taskDescription').value = task.description || '';
    clearAllErrors(createTaskModal);

    const patientSelect = document.getElementById('taskPatient');
    patientSelect.innerHTML = '<option value="">Select patient…</option>' + (active.patients || []).map(function (p) {
      return '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>';
    }).join('');
    patientSelect.value = task.patientId;

    const scheduledAt = new Date(task.scheduledAt);
    document.getElementById('taskDate').value = formatDateInputValue(scheduledAt);
    document.getElementById('taskTime').value = formatTimeInputValue(scheduledAt);
    document.getElementById('chosenCategoryChip').textContent =
      (TASK_CATEGORIES.find(function (category) { return category.id === task.category; }) || {}).name || task.category;
    setCreateStep(3);
    openModal(createTaskModal);
  }

  document.getElementById('createTaskBtn').addEventListener('click', openCreateTask);
  document.getElementById('addTaskFab').addEventListener('click', openCreateTask);
  document.getElementById('closeCreateTaskBtn').addEventListener('click', function () { closeModal(createTaskModal); });
  document.getElementById('cancelCreateTaskBtn').addEventListener('click', function () { closeModal(createTaskModal); });
  createTaskModal.addEventListener('click', function (e) { if (e.target === createTaskModal) closeModal(createTaskModal); });

  document.getElementById('backToCatBtn').addEventListener('click', function () { setCreateStep(1); });
  document.getElementById('backToActBtn').addEventListener('click', function () { setCreateStep(2); });

  document.getElementById('customTaskBtn').addEventListener('click', function () {
    draftActivity = '';
    draftIsCustom = true;
    draftVitalMetric = null;
    document.getElementById('taskActivityName').value = '';
    updateTaskVitalsMetricInfo();
    setCreateStep(3);
  });

  document.getElementById('saveTaskBtn').addEventListener('click', function () {
    clearAllErrors(document.getElementById('createTaskModal'));
    const active = getActiveShift();
    if (!active) { showToast('No active shift', 'error'); return; }
    const activityName = document.getElementById('taskActivityName').value.trim();
    const patientId = document.getElementById('taskPatient').value;
    const dateVal = document.getElementById('taskDate').value;
    const timeVal = document.getElementById('taskTime').value;
    const priority = document.getElementById('taskPriority').value;
    const description = document.getElementById('taskDescription').value.trim();
    let valid = true;

    if (!draftCategory) { showToast('Please select a category first', 'error'); valid = false; }
    if (!activityName) { showError('taskActivityName', 'Activity name is required.'); valid = false; }
    if (!patientId) { showError('taskPatient', 'Select a patient.'); valid = false; }
    if (!dateVal) { showError('taskDate', 'Scheduled date is required.'); valid = false; }
    if (!timeVal) { showError('taskTime', 'Scheduled time is required.'); valid = false; }

    if (!valid) return;

    const parsedScheduledAt = parseLocalDateTime(dateVal, timeVal);
    if (!parsedScheduledAt) { showError('taskTime', 'Invalid date/time for your local timezone.'); return; }

    const patient = (active.patients || []).find(function (p) { return p.id === patientId; });
    if (!patient) { showError('taskPatient', 'Patient not found.'); return; }

    const scheduledAt = editingTaskId && dateVal === formatDateInputValue(new Date(originalScheduledAt)) &&
      timeVal === formatTimeInputValue(new Date(originalScheduledAt))
      ? originalScheduledAt
      : parsedScheduledAt.toISOString();
    const tasks = getAllTasks();
    const existingTask = editingTaskId ? tasks.find(function (t) { return t.id === editingTaskId; }) : null;
    if (editingTaskId && (!existingTask || existingTask.shiftId !== active.id || existingTask.status === 'completed')) {
      showToast('This task can no longer be edited', 'error');
      return;
    }
    const task = existingTask || {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      shiftId: active.id,
      status: 'pending',
      completedAt: null,
      remindedAt10: false,
      alertedAt: false,
      notifiedAt: false,
      createdAt: new Date().toISOString()
    };
    const scheduleChanged = task.scheduledAt !== scheduledAt;
    task.category = draftCategory;
    task.activityName = activityName;
    task.isCustom = draftIsCustom;
    task.patientId = patient.id;
    task.patientName = patient.name;
    task.scheduledAt = scheduledAt;
    task.priority = priority;
    task.description = description;
    if (draftCategory === 'vital_signs') {
      task.taskType = 'scheduled-vitals';
      task.vitalMetric = draftVitalMetric;
    } else if (task.taskType === 'scheduled-vitals') {
      task.taskType = null;
      task.vitalMetric = null;
      task.vitalsRoundId = null;
    }
    if (scheduleChanged) {
      task.remindedAt10 = false;
      task.alertedAt = false;
      task.notifiedAt = false;
    }
    if (!existingTask) tasks.push(task);
    if (task.taskType === 'scheduled-vitals') {
      if (!existingTask) createScheduledVitalsRecord(task, patient);
      else {
        const rounds = getVitalRounds();
        const round = rounds.find(function (item) { return item.id === task.vitalsRoundId; });
        if (round) { round.scheduledAt = task.scheduledAt; round.title = task.activityName; saveVitalRounds(rounds); }
      }
    }
    saveAllTasks(tasks);

    // Update active shift counters
    active.tasksTotal = tasks.filter(function (t) { return t.shiftId === active.id; }).length;
    active.tasksCompleted = tasks.filter(function (t) { return t.shiftId === active.id && t.status === 'completed'; }).length;
    saveActiveShift(active);

    closeModal(createTaskModal);
    showToast(existingTask ? 'Task updated' : 'Task created');
    editingTaskId = null; originalScheduledAt = null;
    requestNotificationPermissionOnce();
    renderTasks(); renderAlerts(); renderSchedule(); updateAlertBadge();
    if (getActiveShift()) renderShiftProgress(getActiveShift());
    // Re-schedule alert engine
    scheduleTaskEngine();
  });

  // ============================================
  // ALERTS TAB
  // ============================================
  function renderAlerts() {
    const upcoming = getAllTasks().filter(function (task) {
      return task.status !== 'completed' && task.status !== 'cancelled' && task.status !== 'missed';
    }).sort(function (a, b) { return new Date(a.scheduledAt) - new Date(b.scheduledAt); });
    const history = getAlertHistory().slice().sort(function (a, b) { return new Date(b.triggeredAt) - new Date(a.triggeredAt); });
    const upcomingList = document.getElementById('alertsUpcomingList');
    const historyList = document.getElementById('alertsHistoryList');
    upcomingList.innerHTML = upcoming.map(renderAlertCard).join('');
    historyList.innerHTML = history.map(renderAlertHistoryCard).join('');
    document.getElementById('alertsUpcomingEmpty').hidden = upcoming.length > 0;
    document.getElementById('alertsHistoryEmpty').hidden = history.length > 0;
    document.getElementById('alertsUpcomingSection').hidden = alertView !== 'upcoming';
    document.getElementById('alertsHistorySection').hidden = alertView !== 'history';
  }

  function renderAlertCard(task) {
    const status = taskStatus(task);
    const stateClass = status === 'overdue' ? 'overdue' : status === 'due-now' ? 'due-now' : 'upcoming';
    const stateLabel = status === 'overdue' ? 'Overdue' : status === 'due-now' ? 'Due Now' : 'Upcoming';
    const iconClass = status === 'overdue' ? 'fa-triangle-exclamation' : status === 'due-now' ? 'fa-bell' : 'fa-clock';
    const sched = new Date(task.scheduledAt);
    const catName = (TASK_CATEGORIES.find(function (c) { return c.id === task.category; }) || {}).name || task.category;
    return '<div class="alert-card ' + stateClass + '">' +
      '<div class="alert-icon ' + stateClass + '"><i class="fas ' + iconClass + '"></i></div>' +
      '<div class="alert-body">' +
        '<div class="alert-title-row"><span class="alert-title">' + escapeHtml(task.activityName) + '</span><span class="alert-state-pill ' + stateClass + '">' + stateLabel + '</span></div>' +
        '<div class="alert-meta"><i class="fas fa-user"></i> ' + escapeHtml(task.patientName) + ' · <i class="fas fa-tag"></i> ' + escapeHtml(catName) + '</div>' +
        '<div class="alert-meta"><i class="fas fa-clock"></i> ' + formatDateTimeShort(sched) + '</div>' +
      '</div>' +
      '<div class="alert-actions">' +
        ((task.taskType === 'initial-vitals' || task.taskType === 'scheduled-vitals') ? '<button type="button" class="alert-action-btn" data-alert-vitals="' + task.id + '"><i class="fas fa-heart-pulse"></i> Record</button>' : '<button type="button" class="alert-action-btn" data-alert-view="' + task.id + '"><i class="fas fa-eye"></i> View Task</button>') +
        (task.taskType !== 'initial-vitals' && task.taskType !== 'scheduled-vitals' ? '<button type="button" class="alert-action-btn" data-alert-complete="' + task.id + '"><i class="fas fa-check"></i> Complete</button>' : '') +
      '</div>' +
    '</div>';
  }

  function getCurrentTaskStatusLabel(task) {
    if (!task) return 'Task record unavailable';
    const status = taskStatus(task);
    return status === 'due-now' ? 'Due now' : status.charAt(0).toUpperCase() + status.slice(1);
  }

  function renderAlertHistoryCard(event) {
    const task = event.taskId ? getAllTasks().find(function (item) { return item.id === event.taskId; }) : null;
    const isRoster = event.kind === 'work-roster';
    const rosterEntry = isRoster ? getWorkRoster().find(function (item) { return item.id === event.rosterId; }) : null;
    const title = isRoster ? event.title : event.taskName;
    const patient = event.patientName || (isRoster ? 'Work roster' : 'Patient unavailable');
    const triggerLabel = event.alertType === 'pre-reminder' ? '10-minute reminder' :
      event.alertType === 'work-shift-reminder' ? (event.reminderMinutes + '-minute work shift reminder') : 'Scheduled-time alert';
    const status = task ? getCurrentTaskStatusLabel(task) : isRoster && rosterEntry ? rosterEntryStatus(rosterEntry) : event.taskStatus || (isRoster ? 'Roster reminder' : 'Task record unavailable');
    const statusClass = status.toLowerCase().replace(/\s+/g, '-');
    return '<article class="alert-card alert-history-card">' +
      '<div class="alert-icon ' + (status === 'Overdue' ? 'overdue' : 'upcoming') + '"><i class="fas fa-clock-rotate-left"></i></div>' +
      '<div class="alert-body"><div class="alert-title-row"><span class="alert-title">' + escapeHtml(title || 'Scheduled alert') + '</span><span class="alert-state-pill upcoming">' + escapeHtml(triggerLabel) + '</span></div>' +
      '<div class="alert-meta"><i class="fas fa-user"></i> ' + escapeHtml(patient) + (event.category ? ' · ' + escapeHtml(event.category) : '') + '</div>' +
      '<div class="alert-meta">Scheduled ' + formatDateTimeShort(new Date(event.scheduledAt)) + '</div>' +
      '<div class="alert-history-trigger">Triggered ' + formatDateTimeShort(new Date(event.triggeredAt)) + '</div>' +
      '<span class="alert-history-status ' + statusClass + '">' + (isRoster ? 'Shift' : 'Task') + ' status: ' + escapeHtml(status) + '</span>' +
      (event.taskStatus ? '<div class="alert-history-trigger">Status at trigger: ' + escapeHtml(event.taskStatus) + '</div>' : '') + '</div>' +
      (task ? '<div class="alert-actions"><button type="button" class="alert-action-btn" data-alert-history-task="' + task.id + '"><i class="fas fa-eye"></i> View</button></div>' : '') +
      '</article>';
  }

  document.querySelectorAll('[data-alert-view]').forEach(function (button) {
    button.addEventListener('click', function () {
      alertView = button.getAttribute('data-alert-view');
      document.querySelectorAll('[data-alert-view]').forEach(function (tab) {
        const selected = tab.getAttribute('data-alert-view') === alertView;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
      });
      renderAlerts();
    });
  });

  document.getElementById('alertsUpcomingList').addEventListener('click', function (e) {
    const vitalsBtn = e.target.closest('[data-alert-vitals]');
    if (vitalsBtn) {
      openVitalsForTask(vitalsBtn.getAttribute('data-alert-vitals'));
      return;
    }
    const viewBtn = e.target.closest('[data-alert-view]');
    if (viewBtn) {
      selectTab('tasks');
      const id = viewBtn.getAttribute('data-alert-view');
      setTimeout(function () { focusTask(id); }, 50);
      return;
    }
    const compBtn = e.target.closest('[data-alert-complete]');
    if (compBtn) {
      completeTask(compBtn.getAttribute('data-alert-complete'));
      return;
    }
  });

  document.getElementById('alertsHistoryList').addEventListener('click', function (event) {
    const button = event.target.closest('[data-alert-history-task]');
    if (!button) return;
    const task = getAllTasks().find(function (item) { return item.id === button.getAttribute('data-alert-history-task'); });
    if (task && (task.taskType === 'initial-vitals' || task.taskType === 'scheduled-vitals')) openVitalsForTask(task.id);
    else {
      selectTab('schedule');
      scheduleView = 'history';
      document.querySelectorAll('[data-schedule-view]').forEach(function (tab) {
        const selected = tab.getAttribute('data-schedule-view') === scheduleView;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
      });
      renderSchedule();
      const taskId = button.getAttribute('data-alert-history-task');
      setTimeout(function () {
        const card = document.querySelector('[data-schedule-task-id="' + taskId + '"]');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  });

  document.querySelectorAll('[data-schedule-view]').forEach(function (button) {
    button.addEventListener('click', function () {
      scheduleView = button.getAttribute('data-schedule-view');
      document.querySelectorAll('[data-schedule-view]').forEach(function (tab) {
        const selected = tab.getAttribute('data-schedule-view') === scheduleView;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
      });
      renderSchedule();
    });
  });

  function renderSchedule() {
    const tasks = getAllTasks();
    const roster = getWorkRoster();
    const upcoming = [];
    const history = [];
    tasks.forEach(function (task) {
      const status = taskStatus(task);
      const item = { type: 'task', item: task, startAt: task.scheduledAt, history: status === 'completed' || status === 'missed' || status === 'cancelled' || status === 'overdue' };
      (item.history ? history : upcoming).push(item);
    });
    roster.forEach(function (entry) {
      const isHistory = entry.status === 'cancelled' || new Date(entry.endAt).getTime() < Date.now();
      const item = { type: 'roster', item: entry, startAt: entry.startAt, history: isHistory };
      (isHistory ? history : upcoming).push(item);
    });
    upcoming.sort(function (a, b) { return new Date(a.startAt) - new Date(b.startAt); });
    history.sort(function (a, b) { return new Date(b.startAt) - new Date(a.startAt); });
    const upcomingList = document.getElementById('scheduleUpcomingList');
    const historyList = document.getElementById('scheduleHistoryList');
    upcomingList.innerHTML = upcoming.map(renderScheduleCard).join('');
    historyList.innerHTML = history.map(renderScheduleCard).join('');
    document.getElementById('scheduleUpcomingEmpty').hidden = upcoming.length > 0;
    document.getElementById('scheduleHistoryEmpty').hidden = history.length > 0;
    document.getElementById('scheduleUpcomingSection').hidden = scheduleView !== 'upcoming';
    document.getElementById('scheduleHistorySection').hidden = scheduleView !== 'history';
  }

  function renderScheduleCard(entry) {
    const item = entry.item;
    if (entry.type === 'roster') {
      const status = item.status === 'cancelled' ? 'Cancelled' : new Date(item.endAt).getTime() < Date.now() ? 'Past' : 'Upcoming';
      return '<article class="schedule-card ' + status.toLowerCase() + '"><span class="schedule-card-icon roster"><i class="fas fa-calendar-check"></i></span><div class="schedule-card-body"><div class="schedule-card-title-row"><span class="schedule-card-title">' + escapeHtml(item.title) + '</span><span class="schedule-card-status ' + status.toLowerCase() + '">' + status + '</span></div><div class="schedule-card-meta">' + formatDateTimeShort(new Date(item.startAt)) + ' – ' + formatTime(new Date(item.endAt)) + '</div>' +
        (item.notes ? '<div class="schedule-card-notes">' + escapeHtml(item.notes) + '</div>' : '') + '</div></article>';
    }
    const status = taskStatus(item);
    const label = status === 'due-now' ? 'Due now' : status.charAt(0).toUpperCase() + status.slice(1);
    const canRecord = item.taskType === 'initial-vitals' || item.taskType === 'scheduled-vitals';
    const actions = canRecord && status !== 'cancelled' && status !== 'missed' ?
      '<button type="button" class="task-action-btn" data-schedule-record="' + item.id + '"><i class="fas fa-heart-pulse"></i> Record</button>' :
      status !== 'completed' && status !== 'cancelled' && status !== 'missed' ?
        '<button type="button" class="task-action-btn" data-schedule-complete="' + item.id + '"><i class="fas fa-check"></i> Complete</button>' : '';
    return '<article class="schedule-card ' + status + '" data-schedule-task-id="' + escapeHtml(item.id) + '"><span class="schedule-card-icon ' + status + '"><i class="fas fa-list-check"></i></span><div class="schedule-card-body"><div class="schedule-card-title-row"><span class="schedule-card-title">' + escapeHtml(item.activityName) + '</span><span class="schedule-card-status ' + status + '">' + label + '</span></div><div class="schedule-card-meta">' + escapeHtml(item.patientName) + ' · ' + formatDateTimeShort(new Date(item.scheduledAt)) + '</div>' +
      (item.description ? '<div class="schedule-card-notes">' + escapeHtml(item.description) + '</div>' : '') +
      (actions ? '<div class="schedule-card-actions">' + actions + '</div>' : '') + '</div></article>';
  }

  document.getElementById('scheduleUpcomingList').addEventListener('click', function (event) {
    const record = event.target.closest('[data-schedule-record]');
    if (record) { openVitalsForTask(record.getAttribute('data-schedule-record')); return; }
    const complete = event.target.closest('[data-schedule-complete]');
    if (complete) completeTask(complete.getAttribute('data-schedule-complete'));
  });

  function focusTask(taskId) {
    const card = document.querySelector('[data-task-card-id="' + taskId + '"]');
    if (card) {
      const el = card.closest('.task-card');
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.transition = 'box-shadow 0.3s'; el.style.boxShadow = '0 0 0 3px rgba(30,111,159,0.35)'; setTimeout(function () { el.style.boxShadow = ''; }, 1400); }
    }
  }

  function updateAlertBadge() {
    const navAlerts = document.querySelector('.nav-item[data-nav="alerts"]');
    if (!navAlerts) return;
    let badge = navAlerts.querySelector('.nav-badge');
    const active = getActiveShift();
    let count = 0;
    if (active) {
      const tasks = getActiveShiftTasks();
      count = tasks.filter(function (t) { return t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'missed' && (taskStatus(t) === 'due-now' || taskStatus(t) === 'overdue'); }).length;
    }
    if (count > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; navAlerts.appendChild(badge); }
      badge.textContent = String(count);
    } else if (badge) { badge.remove(); }
  }

  // ============================================
  // TASK ALERT ENGINE (10-min pre-reminder + exact-time alert)
  // ============================================
  function requestNotificationPermissionOnce() {
    if (notificationPermissionRequested) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (e) { /* ignore */ }
    }
    notificationPermissionRequested = true;
  }

  function fireBrowserNotification(title, body, tag) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try { new Notification(title, { body: body, tag: tag || 'careq-' + Date.now(), requireInteraction: true }); }
    catch (e) { /* ignore */ }
  }

  function playBeep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; o.type = 'sine'; g.gain.value = 0.15;
      o.start(); o.stop(ctx.currentTime + 0.35);
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 600);
    } catch (e) { /* ignore */ }
  }

  function vibrate() {
    if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200, 100, 200]); } catch (e) {} }
  }

  function recordAlertHistory(task, alertType, triggeredAt) {
    const history = getAlertHistory();
    const scheduledAt = task.scheduledAt;
    const id = task.id + ':' + alertType + ':' + new Date(scheduledAt).getTime();
    if (history.some(function (event) { return event.id === id; })) return;
    history.push({
      id: id,
      kind: 'task',
      alertType: alertType,
      taskId: task.id,
      taskName: task.activityName,
      shiftId: task.shiftId,
      patientId: task.patientId,
      patientName: task.patientName,
      category: (TASK_CATEGORIES.find(function (category) { return category.id === task.category; }) || {}).name || task.category,
      scheduledAt: scheduledAt,
      triggeredAt: triggeredAt || new Date().toISOString(),
      taskStatus: taskStatus(task)
    });
    saveAlertHistory(history);
  }

  function checkWorkRosterReminders() {
    const roster = getWorkRoster();
    const now = Date.now();
    let changed = false;
    roster.forEach(function (entry) {
      if (entry.status === 'cancelled') return;
      const start = new Date(entry.startAt).getTime();
      const minutesUntil = (start - now) / 60000;
      const reminded = entry.remindedBeforeMinutes || [];
      (entry.reminderMinutes || []).forEach(function (minutes) {
        const remaining = minutesUntil - minutes;
        if (reminded.indexOf(minutes) !== -1 || remaining > 0 || remaining <= -0.3) return;
        reminded.push(minutes);
        const title = entry.shiftType === 'Custom' ? entry.customName : entry.shiftType + ' Shift';
        const eventId = entry.id + ':work-shift-reminder:' + minutes + ':' + start;
        const history = getAlertHistory();
        if (!history.some(function (event) { return event.id === eventId; })) {
          history.push({
            id: eventId,
            kind: 'work-roster',
            alertType: 'work-shift-reminder',
            title: title,
            rosterId: entry.id,
            scheduledAt: entry.startAt,
            triggeredAt: new Date(now).toISOString(),
            reminderMinutes: minutes,
            taskStatus: entry.status
          });
          saveAlertHistory(history);
        }
        fireBrowserNotification('CareQ Work Shift Reminder', title + ' starts in ' + minutes + ' minutes.', 'careq-roster-' + eventId);
        showToast(title + ' starts in ' + minutes + ' minutes');
        changed = true;
      });
      entry.remindedBeforeMinutes = reminded;
    });
    if (changed) {
      saveWorkRoster(roster);
      if (document.body.getAttribute('data-active-tab') === 'alerts') renderAlerts();
    }
  }

  function checkAlerts() {
    const active = getActiveShift();
    if (!active) return;
    const tasks = getAllTasks();
    let changed = false;
    const now = Date.now();

    tasks.forEach(function (t) {
      if (t.shiftId !== active.id) return;
      if (t.status === 'completed' || t.status === 'cancelled' || t.status === 'missed') return;
      const sched = new Date(t.scheduledAt).getTime();

      // Stage 1: 10-minute pre-reminder
      const preReminderDelta = sched - REMINDER_PRE_MS - now;
      if (!t.suppressPreReminder && !t.remindedAt10 && preReminderDelta <= 0 && preReminderDelta > -20000) {
        t.remindedAt10 = true; changed = true;
        recordAlertHistory(t, 'pre-reminder', new Date(now).toISOString());
        fireBrowserNotification('CareQ Reminder', 'Upcoming Task: ' + t.activityName + ' · Patient: ' + t.patientName + ' · Scheduled for: ' + formatTime(new Date(t.scheduledAt)), 'careq-task-' + t.id + '-pre-' + sched);
        showToast('Reminder: ' + t.activityName + ' in 10 min', 'info');
      }

      // Stage 2: exact-time alert
      if (!t.alertedAt && now >= sched) {
        t.alertedAt = true; changed = true;
        recordAlertHistory(t, 'scheduled-time', new Date(now).toISOString());
        triggerExactTimeAlert(t);
      }
    });

    if (changed) saveAllTasks(tasks);
    updateAlertBadge();
  }

  function triggerExactTimeAlert(task) {
    if (activeTaskAlertId) {
      if (taskAlertQueue.indexOf(task.id) === -1) taskAlertQueue.push(task.id);
      return;
    }
    showTaskAlert(task);
  }

  function showTaskAlert(task) {
    if (task.status === 'completed' || task.status === 'cancelled' || task.status === 'missed') {
      showNextTaskAlert();
      return;
    }
    activeTaskAlertId = task.id;
    document.getElementById('alertActivityName').textContent = task.activityName;
    document.getElementById('alertPatientName').textContent = task.patientName;
    document.getElementById('alertScheduledTime').textContent = formatDateTimeShort(new Date(task.scheduledAt));
    const catName = (TASK_CATEGORIES.find(function (c) { return c.id === task.category; }) || {}).name || task.category;
    document.getElementById('alertCategory').textContent = catName;

    fireBrowserNotification('CARE Q TASK ALERT', "It's time! " + task.activityName + ' · Patient: ' + task.patientName + ' · Scheduled: ' + formatTime(new Date(task.scheduledAt)), 'careq-task-' + task.id + '-scheduled-' + new Date(task.scheduledAt).getTime());
    playBeep();
    vibrate();
    openModal(document.getElementById('taskAlertModal'));
    showToast("It's time: " + task.activityName, 'error');
  }

  function showNextTaskAlert() {
    if (activeTaskAlertId) return;
    while (taskAlertQueue.length) {
      const taskId = taskAlertQueue.shift();
      const task = getAllTasks().find(function (item) { return item.id === taskId; });
      if (task && task.status !== 'completed' && task.status !== 'cancelled' && task.status !== 'missed') {
        showTaskAlert(task);
        return;
      }
    }
  }

  function dismissTaskAlert() {
    activeTaskAlertId = null;
    closeModal(document.getElementById('taskAlertModal'));
    setTimeout(function () { showNextTaskAlert(); checkAlerts(); }, 300);
  }

  document.getElementById('alertDismissBtn').addEventListener('click', dismissTaskAlert);
  document.getElementById('alertViewBtn').addEventListener('click', function () {
    const taskId = activeTaskAlertId;
    dismissTaskAlert();
    const task = getAllTasks().find(function (item) { return item.id === taskId; });
    if (task && (task.taskType === 'initial-vitals' || task.taskType === 'scheduled-vitals')) {
      selectTab('tasks');
      openVitalsForTask(taskId);
      return;
    }
    selectTab('tasks');
    if (taskId) setTimeout(function () { focusTask(taskId); }, 100);
  });
  document.getElementById('taskAlertModal').addEventListener('click', function (e) { if (e.target === document.getElementById('taskAlertModal')) dismissTaskAlert(); });

  function startTaskEngine() {
    if (tasksTickInterval) return;
    checkAlerts();
    checkWorkRosterReminders();
    tasksTickInterval = setInterval(function () {
      checkAlerts();
      checkWorkRosterReminders();
      // Refresh task list times/statuses if on relevant tabs
      const activeTab = document.body.getAttribute('data-active-tab');
      if (activeTab === 'tasks') renderTasks();
      if (activeTab === 'alerts') renderAlerts();
      if (activeTab === 'schedule') renderSchedule();
      updateAlertBadge();
    }, 15000); // every 15s
  }

  function scheduleTaskEngine() {
    // Ensure engine is running after task creation
    if (!tasksTickInterval) startTaskEngine();
    else { checkAlerts(); checkWorkRosterReminders(); }
  }

  // ============================================
  // INIT
  // ============================================
  bindPasswordToggles();
  document.querySelectorAll('.back-btn').forEach(function (btn) { btn.setAttribute('type', 'button'); });

  // Request notification permission after first user gesture (welcome screen action)
  ['goToSignUpBtn', 'goToLoginBtn', 'continueAsGuestBtn'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', requestNotificationPermissionOnce, { once: true });
  });

  window.addEventListener('DOMContentLoaded', function () {
    splashTimer = setTimeout(routeAfterSplash, 1800);
  });
  window.addEventListener('beforeunload', function () { stopElapsedTimer(); if (tasksTickInterval) clearInterval(tasksTickInterval); });
})();