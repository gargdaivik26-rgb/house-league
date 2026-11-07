/**
 * HouseLeague — Multi-School Application Logic
 * Entry Screen: School Code Entry & Add School
 * Dynamic Houses: Zero Hardcoded Templates — Admin defines all houses
 * User-Decided Admin Code & Rich Previous-Style Admin Panel (No Add School in Admin)
 * 100% Identical UI & Sorting to the Original App
 */

// Sorting: Firstly Grade-wise (numeric, 9 < 10), then Division-wise (A < B < C), then Name
function sortStudentsGradeThenDiv(list) {
  return list.sort((a, b) => {
    const gA = parseInt(a.grade, 10) || 0;
    const gB = parseInt(b.grade, 10) || 0;
    if (gA !== gB) return gA - gB;

    const dA = (a.division || '').trim().toUpperCase();
    const dB = (b.division || '').trim().toUpperCase();
    if (dA !== dB) return dA.localeCompare(dB);

    return (a.name || '').localeCompare(b.name || '');
  });
}

// Advances academic year consecutively: 2026-27 -> 2027-28 -> 2028-29 -> 2029-30, etc.
function advanceAcademicYear(yearStr) {
  const match = (yearStr || '').match(/(\d{4})-(\d{2,4})/);
  if (match) {
    const startYear = parseInt(match[1], 10);
    const nextStart = startYear + 1;
    const nextEnd = String(nextStart + 1).slice(-2);
    return `${nextStart}-${nextEnd}`;
  }
  const curYear = new Date().getFullYear();
  return `${curYear + 1}-${String(curYear + 2).slice(-2)}`;
}

const DEFAULT_PALETTE = ['#E5354F', '#2F72E0', '#EAAB1E', '#28B577', '#9D65FF', '#06B6D4', '#F97316', '#EC4899'];

class HouseCupApp {
  constructor() {
    this.schools = this.loadStorage();
    this.activeSchoolId = null;
    this.role = 'teacher';
    this.session = null;

    // Action state
    this.selectedStudent = null;
    this.direction = 'add';
    this.selectedCriteria = null;
    this.customReason = '';
    this.selectedPoints = 10;
    this.newHouseSelectedColor = '#E5354F';
    this.toastTimer = null;
    this.pendingRegistration = null;

    // Cloud Realtime Sync State (Multi-School & Multi-Device Sync)
    this.cloudEnabled = false;
    this.cloudDb = null;
    this.cloudListener = null;
    this.currentListeningSchoolId = null;
    this.isRemoteUpdate = false;

    // Ensure admin displayName is always strictly "School Admin" and never "Headmaster"
    let storageNeedsSave = false;
    Object.values(this.schools).forEach(sch => {
      if (sch && sch.teachers) {
        sch.teachers.forEach(t => {
          if (t.username.toLowerCase() === 'admin' || t.displayName === 'Headmaster' || !t.displayName) {
            if (t.displayName !== 'School Admin' && t.username.toLowerCase() === 'admin') {
              t.displayName = 'School Admin';
              storageNeedsSave = true;
            } else if (t.displayName === 'Headmaster') {
              t.displayName = 'School Admin';
              storageNeedsSave = true;
            }
          }
        });
      }
    });
    if (storageNeedsSave) {
      this.saveStorage();
    }

    this.init();
  }

  // --- Persistence with Clean Reset to No School ---
  loadStorage() {
    const RESET_KEY = 'housecup_saas_reset_v8_zero_schools';
    // User requested to reset data to zero schools for clean testing restart
    if (localStorage.getItem(RESET_KEY) !== 'done') {
      localStorage.removeItem('housecup_saas_schools');
      localStorage.removeItem('housecup_active_school');
      localStorage.removeItem('housecup_saved_session');
      localStorage.setItem(RESET_KEY, 'done');
      return {};
    }

    try {
      const raw = localStorage.getItem('housecup_saas_schools');
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('Storage read error', e);
    }
    return {};
  }

  saveStorage() {
    try {
      localStorage.setItem('housecup_saas_schools', JSON.stringify(this.schools));
      if (this.activeSchoolId) {
        localStorage.setItem('housecup_active_school', this.activeSchoolId);
        this.syncSchoolToCloud(this.activeSchoolId);
      }
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }

  normalizeSchool(sch) {
    if (!sch) return null;
    if (!sch.resetCycle) sch.resetCycle = 'yearly';
    if (!sch.motto) sch.motto = 'Honour, Excellence, Integrity';
    sch.email = sch.email || '';
    sch.academicYear = sch.academicYear || (sch.term?.match(/(\d{4}-\d{2,4})/)?.[1] || '2026-27');
    sch.currentTermIndex = typeof sch.currentTermIndex === 'number' ? sch.currentTermIndex : ((sch.term || '').includes('Term 2') ? 2 : 1);
    if (!sch.term) {
      sch.term = sch.resetCycle === 'yearly' ? `Academic Year ${sch.academicYear}` : `Term ${sch.currentTermIndex} (${sch.academicYear})`;
    }
    if (!Array.isArray(sch.events)) sch.events = [];
    if (!Array.isArray(sch.students)) sch.students = [];
    if (!Array.isArray(sch.houses)) sch.houses = [];
    if (!Array.isArray(sch.teachers)) {
      sch.teachers = [{ username: 'admin', password: 'password1', displayName: 'School Admin' }];
    }
    if (!Array.isArray(sch.archivedTerms)) sch.archivedTerms = [];
    if (!sch.criteria) {
      sch.criteria = {
        add: ['Homework Excellence', 'Class Participation', 'Good Behavior', 'Helping a Peer', 'Sports Achievement', 'Perfect Attendance', 'Other'],
        deduct: ['Late to Class', 'Incomplete Homework', 'Disruptive Behavior', 'Uniform Violation', 'Rule Violation', 'Other']
      };
    }
    if (!Array.isArray(sch.criteria.add)) {
      sch.criteria.add = ['Homework Excellence', 'Class Participation', 'Good Behavior', 'Helping a Peer', 'Sports Achievement', 'Perfect Attendance', 'Other'];
    }
    if (!Array.isArray(sch.criteria.deduct)) {
      sch.criteria.deduct = ['Late to Class', 'Incomplete Homework', 'Disruptive Behavior', 'Uniform Violation', 'Rule Violation', 'Other'];
    }
    return sch;
  }

  getActiveSchool() {
    if (!this.activeSchoolId || !this.schools[this.activeSchoolId]) {
      return null;
    }
    return this.normalizeSchool(this.schools[this.activeSchoolId]);
  }

  getHouse(id) {
    const sch = this.getActiveSchool();
    if (!sch) return { name: id, color: '#999', points: 0 };
    return sch.houses.find(h => h.id.toLowerCase() === id.toLowerCase()) || { name: id, color: '#999', points: 0 };
  }

  async init() {
    this.renderEntryScreen();
    this.initCloudSync();

    // Check if the user has an active logged-in session on this device
    const savedSessionRaw = localStorage.getItem('housecup_saved_session');
    if (savedSessionRaw) {
      try {
        const saved = JSON.parse(savedSessionRaw);
        if (saved && saved.session && saved.schoolId) {
          const schId = saved.schoolId;
          let sch = this.schools[schId];
          if (!sch && this.cloudEnabled && this.cloudDb) {
            const snap = await this.cloudDb.ref('schools/' + schId).once('value');
            sch = snap.val();
            if (sch) {
              this.normalizeSchool(sch);
              this.schools[schId] = sch;
            }
          }

          if (sch) {
            this.activeSchoolId = schId;
            this.session = saved.session;
            this.updateSchoolUI();
            this.listenToSchoolCloud(schId);
            this.onLoginSuccess(true); // silent restore straight into scoreboard!
            return;
          }
        }
      } catch (e) {
        console.warn('Session restore error:', e);
      }
    }

    // New visitor or logged out user: ALWAYS start on Enter School Code Screen!
    this.session = null;
    this.activeSchoolId = null;
    this.showScreen('screen-entry');
  }

  // =========================================================================
  // FIRST SCREEN: SCHOOL CODE ENTRY & ADD SCHOOL
  // =========================================================================

  renderEntryScreen() {
    const err = document.getElementById('entry-code-error');
    if (err) err.style.display = 'none';
    const input = document.getElementById('entry-school-code');
    if (input) input.value = '';
  }

  async submitSchoolCode() {
    const input = document.getElementById('entry-school-code');
    const val = (input.value || '').trim().toUpperCase();
    const err = document.getElementById('entry-code-error');

    if (!val) {
      err.textContent = 'Please enter a School Code.';
      err.style.display = 'block';
      return;
    }

    // 1. Match code locally first
    let matched = Object.values(this.schools).find(s => s && (s.code.toUpperCase() === val || s.id.toUpperCase() === val));

    // 2. If not found locally, query Cloud Database in real time!
    if (!matched && this.cloudEnabled && this.cloudDb) {
      err.textContent = 'Searching cloud database...';
      err.style.display = 'block';
      try {
        const cleanId = val.toLowerCase().replace(/[^a-z0-9]/g, '');
        const snap = await this.cloudDb.ref('schools/' + cleanId).once('value');
        const data = snap.val();
        if (data) {
          this.normalizeSchool(data);
          this.schools[cleanId] = data;
          this.saveStorage();
          matched = data;
        } else {
          // Query all schools in cloud
          const allSnap = await this.cloudDb.ref('schools').once('value');
          const all = allSnap.val();
          if (all) {
            const foundKey = Object.keys(all).find(k => all[k] && ((all[k].code || '').toUpperCase() === val || k.toUpperCase() === val));
            if (foundKey) {
              const fullData = all[foundKey];
              this.normalizeSchool(fullData);
              this.schools[foundKey] = fullData;
              this.saveStorage();
              matched = fullData;
            }
          }
        }
      } catch (e) {
        console.warn('Cloud school lookup error:', e);
      }
    }

    if (!matched) {
      err.textContent = `No school found with code "${val}". Check spelling or register a new school below.`;
      err.style.display = 'block';
      return;
    }

    err.style.display = 'none';
    input.value = '';

    // Check if the school is pending email verification!
    if (matched.status === 'pending_verification') {
      this.pendingRegistration = matched;
      this.openVerifyModal(matched);
      this.showToast(`School "${matched.name}" is pending verification. Please enter the 6-digit code.`);
      return;
    }

    this.switchSchool(matched.id);
  }

  clearLoginInputs() {
    const tu = document.getElementById('teacher-username');
    const tp = document.getElementById('teacher-password');
    const sn = document.getElementById('student-name-input');
    const errT = document.getElementById('login-error-teacher');
    const errS = document.getElementById('login-error-student');
    if (tu) tu.value = '';
    if (tp) tp.value = '';
    if (sn) sn.value = '';
    if (errT) errT.style.display = 'none';
    if (errS) errS.style.display = 'none';
  }

  goToSchoolEntry() {
    this.clearLoginInputs();
    this.renderEntryScreen();
    this.showScreen('screen-entry');
  }

  async switchSchool(schId) {
    this.clearLoginInputs();
    if (!this.schools[schId]) {
      // Fetch school definition from cloud if not yet loaded locally
      if (this.cloudEnabled && this.cloudDb) {
        try {
          const snap = await this.cloudDb.ref('schools/' + schId).once('value');
          const data = snap.val();
          if (data) {
            this.normalizeSchool(data);
            this.schools[schId] = data;
          } else {
            alert('School data could not be found.');
            return;
          }
        } catch (e) {
          console.warn('Error fetching school from cloud:', e);
          return;
        }
      } else {
        return;
      }
    }

    this.normalizeSchool(this.schools[schId]);

    // Check if school is pending verification
    if (this.schools[schId] && (this.schools[schId].status === 'pending_verification' || this.schools[schId].isVerified === false)) {
      this.pendingRegistration = this.schools[schId];
      this.openVerifyModal(this.schools[schId]);
      this.showToast(`School "${this.schools[schId].name}" is pending verification. Please enter the 6-digit code.`);
      return;
    }

    this.activeSchoolId = schId;
    this.saveStorage();
    this.updateSchoolUI();
    this.renderScoreboard();
    this.renderActivity();
    this.populateHouseFilters();
    this.listenToSchoolCloud(schId);
    this.showScreen('screen-login');
    this.clearLoginInputs();
    setTimeout(() => this.clearLoginInputs(), 60);
    this.showToast(`Switched to ${this.schools[schId].name}`);
  }

  // =========================================================================
  // DYNAMIC HOUSE BUILDER IN REGISTRATION (ZERO HARDCODING)
  // =========================================================================

  setRegisterCycle(cycle) {
    this.registerCycle = cycle;
    const btnYearly = document.getElementById('btn-reg-cycle-yearly');
    const btnTerm = document.getElementById('btn-reg-cycle-term');
    const hint = document.getElementById('reg-cycle-hint');
    if (btnYearly) btnYearly.classList.toggle('active', cycle === 'yearly');
    if (btnTerm) btnTerm.classList.toggle('active', cycle === 'term');
    if (hint) {
      if (cycle === 'yearly') {
        hint.textContent = 'Points accumulate across the full academic year and reset once annually at year-end.';
      } else {
        hint.textContent = 'Points conclude and reset across 2 terms per academic year (Term 1 and Term 2).';
      }
    }
  }

  openRegisterSchoolModal() {
    this.registerCycle = 'yearly';
    this.setRegisterCycle('yearly');
    document.getElementById('reg-school-name').value = '';
    const emailInput = document.getElementById('reg-school-email');
    if (emailInput) emailInput.value = '';
    document.getElementById('reg-school-motto').value = 'Honour, Excellence, Integrity';
    document.getElementById('reg-school-code').value = '';
    document.getElementById('reg-school-pin').value = '';

    // Initialize with 4 dynamic house rows with colors and emblems
    const list = document.getElementById('reg-dynamic-houses-list');
    list.innerHTML = '';
    this.addHouseRowToRegisterForm('Ruby', '#E5354F', '🦁');
    this.addHouseRowToRegisterForm('Sapphire', '#2F72E0', '🦅');
    this.addHouseRowToRegisterForm('Topaz', '#EAAB1E', '🦡');
    this.addHouseRowToRegisterForm('Emerald', '#28B577', '🐍');

    document.getElementById('modal-register-school').classList.add('open');
  }

  closeRegisterSchoolModal() {
    document.getElementById('modal-register-school').classList.remove('open');
  }

  addHouseRowToRegisterForm(initialName = '', initialColor = null, initialEmblem = '🛡️') {
    const list = document.getElementById('reg-dynamic-houses-list');
    if (!list) return;

    const rowIdx = list.children.length;
    const color = initialColor || DEFAULT_PALETTE[rowIdx % DEFAULT_PALETTE.length];

    const row = document.createElement('div');
    row.className = 'house-setup-row';
    row.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    row.innerHTML = `
      <input type="color" class="house-color-input" value="${color}" title="Choose House Color">
      <input type="text" class="input-field house-emblem-input" placeholder="Emblem" value="${initialEmblem}" maxlength="3" title="Emblem Emoji/Symbol" style="padding: 10px 8px; font-size: 15px; width: 44px; text-align: center;">
      <input type="text" class="input-field house-name-input" placeholder="House Name" value="${initialName}" style="padding: 10px 12px; font-size: 13px; flex: 1;">
      <div style="cursor: pointer; color: #F0405B; font-size: 16px; padding: 4px 6px;" title="Remove this house" onclick="this.parentElement.remove()">✕</div>
    `;
    list.appendChild(row);
  }

  submitSchoolRegistration() {
    const name = (document.getElementById('reg-school-name').value || '').trim();
    const email = (document.getElementById('reg-school-email')?.value || '').trim();
    const motto = (document.getElementById('reg-school-motto').value || '').trim() || 'Honour, Excellence, Integrity';
    const code = (document.getElementById('reg-school-code').value || '').trim().toUpperCase();
    const pin = (document.getElementById('reg-school-pin').value || '').trim();
    const cycle = this.registerCycle || 'yearly';
    const initialYear = '2026-27';

    if (!name || !code) {
      alert('Please enter both School Name and School Code.');
      return;
    }

    // Mandatory School Email validation (accepts any email domain)
    if (!email) {
      alert('School Email ID is mandatory. Please enter your school email.');
      const el = document.getElementById('reg-school-email');
      if (el) el.focus();
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('Please enter a valid School Email ID (e.g. school@gmail.com, principal@school.edu, admin@vjtf.org). Any email domain is supported.');
      const el = document.getElementById('reg-school-email');
      if (el) el.focus();
      return;
    }

    if (!pin) {
      alert('Please set your Admin Security Code. You decide this code to protect your Admin Portal!');
      return;
    }

    const id = code.toLowerCase().replace(/[^a-z0-9]/g, '');
    const existing = this.schools[id];
    if (existing) {
      if (existing.status === 'pending_verification' || existing.isVerified === false) {
        this.pendingRegistration = existing;
        this.closeRegisterSchoolModal();
        this.openVerifyModal(existing);
        this.showToast(`School "${existing.name}" is already pending verification. Please enter the 6-digit code.`);
        return;
      } else {
        alert(`A school with code "${code}" is already active and registered. Please choose a unique code or log in.`);
        return;
      }
    }

    // Collect dynamic houses from the user's rows
    const list = document.getElementById('reg-dynamic-houses-list');
    const rows = list.querySelectorAll('.house-setup-row');
    const houses = [];

    rows.forEach(r => {
      const c = r.querySelector('.house-color-input').value;
      const emb = (r.querySelector('.house-emblem-input')?.value || '🛡️').trim() || '🛡️';
      const n = (r.querySelector('.house-name-input').value || '').trim();
      if (n) {
        const hId = n.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!houses.some(h => h.id === hId)) {
          houses.push({
            id: hId,
            name: n,
            color: c,
            emblem: emb,
            points: 0
          });
        }
      }
    });

    if (houses.length < 2) {
      alert('A school must have at least 2 houses. Please define at least 2 house names.');
      return;
    }

    // Generate 6-digit numeric verification code
    const verificationCode = String(Math.floor(100000 + Math.random() * 900000));

    // Store pending registration as an unverified database entry
    const pendingSchool = {
      id: id,
      name: name,
      email: email,
      code: code,
      motto: motto,
      resetCycle: cycle,
      adminPin: pin,
      academicYear: initialYear,
      currentTermIndex: 1,
      term: cycle === 'yearly' ? `Academic Year ${initialYear}` : `Term 1 (${initialYear})`,
      houses: houses,
      criteria: {
        add: ['Homework Excellence', 'Class Participation', 'Good Behavior', 'Helping a Peer', 'Sports Achievement', 'Perfect Attendance', 'Other'],
        deduct: ['Late to Class', 'Incomplete Homework', 'Disruptive Behavior', 'Uniform Violation', 'Rule Violation', 'Other']
      },
      teachers: [{ username: 'admin', password: 'password1', displayName: 'School Admin' }],
      students: [],
      events: [],
      archivedTerms: [],
      status: 'pending_verification',
      isVerified: false,
      verificationCode: verificationCode,
      createdAt: new Date().toISOString()
    };

    // Save to local storage & cloud as pending_verification
    this.schools[id] = pendingSchool;
    this.pendingRegistration = pendingSchool;
    this.saveStorage();
    this.syncSchoolToCloud(id);

    // Dispatch verification notification
    this.dispatchVerificationEmail(this.pendingRegistration);

    // Close registration modal & open verification modal
    this.closeRegisterSchoolModal();
    this.openVerifyModal(this.pendingRegistration);
  }

  // --- Email Verification Workflow & Database Code Persistence ---
  dispatchVerificationEmail(pending) {
    // 1. Record 6-digit verification code & school data in Firebase Realtime Database
    try {
      if (this.cloudDb) {
        // Stored under pending_registrations/<schoolId>
        this.cloudDb.ref('pending_registrations/' + pending.id).set({
          schoolId: pending.id,
          schoolCode: pending.code,
          schoolName: pending.name,
          schoolEmail: pending.email,
          adminNotificationEmail: 'gargdaivik26@gmail.com',
          verificationCode: pending.verificationCode,
          adminPin: pending.adminPin,
          resetCycle: pending.resetCycle || 'yearly',
          houses: pending.houses.map(h => `${h.emblem || '🛡️'} ${h.name}`).join(', '),
          status: 'pending_verification',
          timestamp: new Date().toISOString()
        });

        // Also stored indexed by uppercase School Code for instant lookup in Firebase Console
        this.cloudDb.ref('pending_registrations_by_code/' + pending.code.toUpperCase()).set({
          schoolId: pending.id,
          schoolCode: pending.code,
          verificationCode: pending.verificationCode,
          schoolName: pending.name,
          schoolEmail: pending.email,
          adminPin: pending.adminPin,
          status: 'pending_verification',
          timestamp: new Date().toISOString()
        });

        // System notification queue
        this.cloudDb.ref('admin_notifications/' + pending.id).set({
          type: 'new_school_registration',
          schoolName: pending.name,
          schoolCode: pending.code,
          schoolEmail: pending.email,
          verificationCode: pending.verificationCode,
          message: `Verification code for ${pending.name} (${pending.code}) is ${pending.verificationCode}.`,
          timestamp: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn('Firebase pending record error:', e);
    }

    // 2. Dispatch real-time email with full school data to gargdaivik26@gmail.com
    try {
      const housesSummary = pending.houses.map(h => `${h.emblem || '🛡️'} ${h.name}`).join(', ');
      const cycleText = pending.resetCycle === 'yearly' ? 'Yearly / Annual' : 'Term-Wise (2 Terms)';
      const emailBody = 
        `A new school has registered on HouseLeague.\n\n` +
        `--------------------------------------------------\n` +
        `6-DIGIT VERIFICATION CODE: ${pending.verificationCode}\n` +
        `--------------------------------------------------\n\n` +
        `School Name: ${pending.name}\n` +
        `School Code: ${pending.code}\n` +
        `Official Email: ${pending.email}\n` +
        `Admin PIN: ${pending.adminPin}\n` +
        `Reset Cycle: ${cycleText}\n` +
        `Houses: ${housesSummary}\n` +
        `Submitted At: ${new Date().toLocaleString()}\n\n` +
        `Enter this code in HouseLeague to verify and launch the school championship.`;

      // Primary email transport via ShipMyForm (CORS enabled, instant delivery to gargdaivik26@gmail.com)
      const paramsOwner = new URLSearchParams();
      paramsOwner.append('name', 'HouseLeague Championship Platform');
      paramsOwner.append('schoolName', pending.name);
      paramsOwner.append('schoolCode', pending.code);
      paramsOwner.append('verificationCode', pending.verificationCode);
      paramsOwner.append('officialSchoolEmail', pending.email);
      paramsOwner.append('adminPIN', pending.adminPin);
      paramsOwner.append('resetCycle', cycleText);
      paramsOwner.append('houses', housesSummary);
      paramsOwner.append('subject', `[HouseLeague] New School Registration: ${pending.name} (${pending.code}) - Code: ${pending.verificationCode}`);
      paramsOwner.append('message', emailBody);

      fetch('https://shipmyform.com/to/gargdaivik26@gmail.com', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: paramsOwner.toString()
      }).then(r => r.json()).then(res => {
        console.log('ShipMyForm notification to gargdaivik26@gmail.com:', res);
      }).catch(err => {
        console.warn('ShipMyForm notification error:', err);
      });

      // Dispatch copy to official school email if different from owner email
      if (pending.email && pending.email.toLowerCase() !== 'gargdaivik26@gmail.com') {
        const paramsSchool = new URLSearchParams();
        paramsSchool.append('name', pending.name);
        paramsSchool.append('schoolCode', pending.code);
        paramsSchool.append('verificationCode', pending.verificationCode);
        paramsSchool.append('subject', `Your HouseLeague Verification Code: ${pending.verificationCode} - ${pending.name}`);
        paramsSchool.append('message', `Your 6-digit verification code to activate ${pending.name} on HouseLeague is: ${pending.verificationCode}`);

        fetch(`https://shipmyform.com/to/${encodeURIComponent(pending.email)}`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: paramsSchool.toString()
        }).catch(() => {});
      }

      // Secondary fallback transport via FormSubmit
      fetch('https://formsubmit.co/ajax/gargdaivik26@gmail.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          _subject: `[HouseLeague] Code: ${pending.verificationCode} - ${pending.name} (${pending.code})`,
          _captcha: 'false',
          _template: 'table',
          verificationCode: pending.verificationCode,
          schoolName: pending.name,
          schoolCode: pending.code,
          schoolEmail: pending.email,
          adminPIN: pending.adminPin,
          houses: housesSummary,
          message: emailBody
        })
      }).catch(() => {});
    } catch (e) {
      console.warn('Email dispatch error:', e);
    }
  }

  openVerifyModal(pending) {
    if (!pending) return;
    this.pendingRegistration = pending;

    const titleEl = document.getElementById('verify-modal-school-name');
    if (titleEl) titleEl.textContent = `Verify "${pending.name}" (${pending.code})`;

    const emailEl = document.getElementById('verify-display-school-email');
    if (emailEl) emailEl.textContent = pending.email;

    const inputEl = document.getElementById('reg-verify-code-input');
    if (inputEl) inputEl.value = '';

    const errEl = document.getElementById('verify-code-error');
    if (errEl) {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }

    this.openModal('modal-verify-school-email');

    if (inputEl) {
      setTimeout(() => inputEl.focus(), 250);
    }
  }

  closeVerifyModal() {
    this.closeModal('modal-verify-school-email');
    this.showScreen('screen-entry');
  }

  submitVerificationCode() {
    if (!this.pendingRegistration) {
      alert('No pending registration found. Please enter your school code on the home screen.');
      this.closeVerifyModal();
      return;
    }

    const inputEl = document.getElementById('reg-verify-code-input');
    const entered = (inputEl ? inputEl.value : '').trim();
    const errEl = document.getElementById('verify-code-error');

    if (!entered) {
      if (errEl) {
        errEl.textContent = 'Please enter the 6-digit verification code.';
        errEl.style.display = 'block';
      }
      return;
    }

    if (entered !== String(this.pendingRegistration.verificationCode).trim()) {
      if (errEl) {
        errEl.textContent = '❌ Invalid verification code. Please check your email and try again.';
        errEl.style.display = 'block';
      }
      return;
    }

    if (errEl) {
      errEl.style.display = 'none';
    }

    // Verification SUCCESS! Activate the school in database
    const schId = this.pendingRegistration.id;
    const targetSchool = this.schools[schId] || this.pendingRegistration;

    targetSchool.status = 'active';
    targetSchool.isVerified = true;
    delete targetSchool.verificationCode;

    this.schools[schId] = targetSchool;
    this.activeSchoolId = schId;
    this.saveStorage();
    this.syncSchoolToCloud(schId);

    // Clean up pending registration in Firebase
    try {
      if (this.cloudDb) {
        this.cloudDb.ref('pending_registrations/' + schId).remove();
        if (targetSchool.code) {
          this.cloudDb.ref('pending_registrations_by_code/' + targetSchool.code.toUpperCase()).remove();
        }
      }
    } catch (e) {
      console.warn('Pending cleanup error:', e);
    }

    this.pendingRegistration = null;
    this.closeModal('modal-verify-school-email');
    this.updateSchoolUI();
    this.renderScoreboard();
    this.renderActivity();
    this.populateHouseFilters();
    this.listenToSchoolCloud(schId);

    // Transition to the School Login page!
    this.showScreen('screen-login');
    this.showToast(`School "${targetSchool.name}" verified and launched successfully!`);
  }

  resendVerificationCode() {
    if (!this.pendingRegistration) return;
    const newCode = String(Math.floor(100000 + Math.random() * 900000));
    this.pendingRegistration.verificationCode = newCode;

    if (this.schools[this.pendingRegistration.id]) {
      this.schools[this.pendingRegistration.id].verificationCode = newCode;
      this.saveStorage();
      this.syncSchoolToCloud(this.pendingRegistration.id);
    }

    this.dispatchVerificationEmail(this.pendingRegistration);

    const inputEl = document.getElementById('reg-verify-code-input');
    if (inputEl) inputEl.value = '';

    const errEl = document.getElementById('verify-code-error');
    if (errEl) errEl.style.display = 'none';

    this.showToast('A new 6-digit verification code has been dispatched!');
  }

  backToRegistrationForm() {
    this.closeModal('modal-verify-school-email');
    if (this.pendingRegistration) {
      const p = this.pendingRegistration;
      document.getElementById('reg-school-name').value = p.name;
      const em = document.getElementById('reg-school-email');
      if (em) em.value = p.email;
      document.getElementById('reg-school-motto').value = p.motto;
      document.getElementById('reg-school-code').value = p.code;
      document.getElementById('reg-school-pin').value = p.adminPin;
      this.setRegisterCycle(p.resetCycle || 'yearly');
    }
    this.openModal('modal-register-school');
  }

  updateSchoolUI() {
    const sch = this.getActiveSchool();
    if (!sch) return;

    // Header & Pill
    const pillText = document.getElementById('current-school-pill-text');
    if (pillText) pillText.textContent = `${sch.name} (${sch.code})`;

    const sub = document.getElementById('login-school-sub');
    if (sub) sub.textContent = `${sch.name} • Points Championship`;

    // Motto on Login screen
    const loginMotto = document.getElementById('login-school-motto');
    if (loginMotto) {
      if (sch.motto) {
        loginMotto.textContent = `“${sch.motto}”`;
        loginMotto.style.display = 'block';
      } else {
        loginMotto.style.display = 'none';
      }
    }

    // Home / Scoreboard Screen School Banner & Motto
    const homeTitle = document.getElementById('home-school-display-name');
    if (homeTitle) homeTitle.textContent = sch.name;

    const homePeriod = document.getElementById('home-school-period-badge');
    if (homePeriod) {
      homePeriod.textContent = sch.term || (sch.resetCycle === 'yearly' ? 'Academic Year 2026-27' : 'Term 1');
    }

    const homeMotto = document.getElementById('home-school-display-motto');
    if (homeMotto) {
      if (sch.motto) {
        homeMotto.textContent = `“${sch.motto}”`;
        homeMotto.style.display = 'block';
      } else {
        homeMotto.style.display = 'none';
      }
    }

    const syncName = document.getElementById('sync-school-name');
    if (syncName) syncName.textContent = sch.name;

    const adminSchool = document.getElementById('admin-school-title');
    if (adminSchool) adminSchool.textContent = sch.name;

    // Dynamic crest colors
    if (sch.houses && sch.houses.length >= 4) {
      ['crest-slot-1', 'crest-slot-2', 'crest-slot-3', 'crest-slot-4'].forEach((slotId, i) => {
        const el = document.getElementById(slotId);
        if (el && sch.houses[i]) el.style.background = sch.houses[i].color;
      });
    }
  }

  togglePasswordVisibility(inputId, btn) {
    const el = document.getElementById(inputId);
    if (!el) return;
    if (el.type === 'password') {
      el.type = 'text';
      if (btn) btn.textContent = '🙈';
      if (btn) btn.title = 'Hide';
    } else {
      el.type = 'password';
      if (btn) btn.textContent = '👁️';
      if (btn) btn.title = 'Show';
    }
  }

  // --- Screen Navigation ---
  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const t = document.getElementById(id);
    if (t) {
      t.classList.add('active');
      t.scrollTop = 0;
    }

    if (id === 'screen-login') {
      this.clearLoginInputs();
      this.setRole('teacher');
    }

    const frame = document.getElementById('app-frame');
    if (frame) {
      frame.classList.toggle('expanded-admin', id === 'screen-admin');
    }
  }

  goToHome() {
    this.renderScoreboard();
    this.renderActivity();
    this.showScreen('screen-home');
  }

  goToSearch() {
    document.getElementById('search-student-query').value = '';
    document.getElementById('filter-grade').value = '';
    document.getElementById('filter-house').value = '';
    document.getElementById('filter-division').value = '';
    this.populateHouseFilters();
    this.filterStudents();
    this.showScreen('screen-search');
  }

  goBackFromAction() {
    this.showScreen('screen-search');
  }

  goToAdmin() {
    this.setAdminTab('profile');
    this.renderAdminAll();
    this.showScreen('screen-admin');
  }

  // --- Role & Authentication ---
  setRole(r) {
    this.role = r;
    document.getElementById('btn-role-teacher').classList.toggle('active', r === 'teacher');
    document.getElementById('btn-role-student').classList.toggle('active', r === 'student');
    document.getElementById('form-teacher').style.display = r === 'teacher' ? 'flex' : 'none';
    document.getElementById('form-student').style.display = r === 'student' ? 'flex' : 'none';
    const adminLink = document.getElementById('login-admin-link');
    if (adminLink) {
      adminLink.style.display = r === 'teacher' ? 'flex' : 'none';
    }
    this.hideLoginErrors();
  }

  hideLoginErrors() {
    document.getElementById('login-error-teacher').style.display = 'none';
    document.getElementById('login-error-student').style.display = 'none';
  }

  submitTeacherLogin() {
    this.hideLoginErrors();
    const u = (document.getElementById('teacher-username').value || '').trim().toLowerCase();
    const p = (document.getElementById('teacher-password').value || '');
    const sch = this.getActiveSchool();
    if (!sch) return;

    const teacher = sch.teachers.find(t => t.username.toLowerCase() === u && t.password === p);
    if (!teacher) {
      const err = document.getElementById('login-error-teacher');
      err.textContent = 'Incorrect username or password. Check credentials.';
      err.style.display = 'block';
      return;
    }

    let disp = teacher.displayName || teacher.username;
    if (teacher.username.toLowerCase() === 'admin' || disp === 'Headmaster') {
      disp = 'School Admin';
      teacher.displayName = 'School Admin';
      this.saveStorage();
    }
    this.session = { role: 'teacher', name: disp };
    this.onLoginSuccess();
  }

  submitStudentLogin() {
    this.hideLoginErrors();
    const val = (document.getElementById('student-name-input').value || '').trim();
    if (!val) {
      const err = document.getElementById('login-error-student');
      err.textContent = 'Please enter your name.';
      err.style.display = 'block';
      return;
    }

    const sch = this.getActiveSchool();
    if (!sch) return;

    const cleanVal = val.toLowerCase();
    // Match exact full name or unique partial name (NO examples)
    const matched = sch.students.filter(s => {
      const full = s.name.toLowerCase();
      const parts = full.split(' ');
      return full === cleanVal || parts.some(p => p === cleanVal) || full.startsWith(cleanVal);
    });

    if (matched.length === 0) {
      const err = document.getElementById('login-error-student');
      err.textContent = `No student found matching "${val}". Check spelling.`;
      err.style.display = 'block';
      return;
    }

    const student = matched[0];
    this.session = { role: 'student', name: student.name, house: student.house };
    this.onLoginSuccess();
  }

  onLoginSuccess(silent = false) {
    const isTeacher = this.session.role === 'teacher';
    const isAdmin = this.session.role === 'admin';

    // Persist login session on this device so closing app DOES NOT log them out!
    try {
      localStorage.setItem('housecup_saved_session', JSON.stringify({
        session: this.session,
        schoolId: this.activeSchoolId
      }));
      localStorage.setItem('housecup_active_school', this.activeSchoolId);
    } catch (e) {}

    document.getElementById('home-session-name').textContent = this.session.name;
    document.getElementById('teacher-fab').style.display = (isTeacher || isAdmin) ? 'flex' : 'none';
    document.getElementById('btn-admin-gear').style.display = isAdmin ? 'flex' : 'none';

    this.renderScoreboard();
    this.renderActivity();
    this.showScreen('screen-home');
    if (!silent) {
      this.showToast(`Welcome, ${this.session.name}`);
    }
  }

  logout() {
    this.session = null;
    this.activeSchoolId = null;
    localStorage.removeItem('housecup_saved_session');
    localStorage.removeItem('housecup_active_school');
    this.clearLoginInputs();
    this.goToSchoolEntry();
    this.showToast('Signed out');
  }

  // --- Admin Login (User-Decided Code) ---
  openAdminLoginModal() {
    const sch = this.getActiveSchool();
    if (!sch) return;

    document.getElementById('admin-modal-school-title').textContent = sch.name;
    document.getElementById('modal-admin-pin').value = '';
    document.getElementById('modal-admin-error').style.display = 'none';
    document.getElementById('modal-admin-login').classList.add('open');
  }

  closeAdminLoginModal() {
    document.getElementById('modal-admin-login').classList.remove('open');
  }

  submitModalAdminLogin() {
    const pin = (document.getElementById('modal-admin-pin').value || '').trim();
    const sch = this.getActiveSchool();
    if (!sch) return;

    // Checks against the code decided by the user!
    if (pin !== sch.adminPin) {
      const err = document.getElementById('modal-admin-error');
      err.textContent = 'Incorrect Admin Code. Enter the code you set for this school.';
      err.style.display = 'block';
      return;
    }

    this.closeAdminLoginModal();
    this.session = { role: 'admin', name: 'School Admin' };
    this.onLoginSuccess();
    this.goToAdmin();
    this.showToast(`Admin Portal Unlocked: ${sch.name}`);
  }

  // =========================================================================
  // SCOREBOARD & ACTIVITY (100% IDENTICAL TO ORIGINAL)
  // =========================================================================

  renderScoreboard() {
    const list = document.getElementById('scoreboard-list');
    if (!list) return;

    const sch = this.getActiveSchool();
    if (!sch) {
      list.innerHTML = '';
      return;
    }

    // Sort houses descending by points
    const houses = Array.isArray(sch.houses) ? sch.houses : [];
    const events = Array.isArray(sch.events) ? sch.events : [];
    const sorted = [...houses].sort((a, b) => (b.points || 0) - (a.points || 0));

    list.innerHTML = '';
    sorted.forEach((h, idx) => {
      const row = document.createElement('div');
      row.className = 'scoreboard-row';

      const recentEvs = events.filter(e => e && e.house && e.house.toLowerCase() === h.id.toLowerCase());
      const lastDelta = recentEvs.length > 0 ? recentEvs[0].delta : null;

      let deltaHtml = '<span class="live-chip" style="color: rgba(245,244,240,0.3);">—</span>';
      if (lastDelta !== null) {
        if (lastDelta > 0) {
          deltaHtml = `<span class="live-chip pulse" style="color: #28B577; background: rgba(40,181,119,0.15);">+${lastDelta}</span>`;
        } else {
          deltaHtml = `<span class="live-chip pulse" style="color: #F0405B; background: rgba(240,64,91,0.15);">${lastDelta}</span>`;
        }
      }

      row.innerHTML = `
        <div class="rank-text" style="color: ${idx === 0 ? '#28B577' : idx === 1 ? '#E5354F' : idx === 2 ? '#2F72E0' : '#EAAB1E'};">${idx + 1}</div>
        <div class="house-name-cell">
          <div class="house-dot" style="background: ${h.color};"></div>
          <div class="house-label">${h.name}</div>
        </div>
        <div class="points-text">${h.points}</div>
        <div style="text-align: right;">${deltaHtml}</div>
      `;
      list.appendChild(row);
    });
  }

  renderActivity() {
    const list = document.getElementById('activity-list');
    if (!list) return;

    const sch = this.getActiveSchool();
    list.innerHTML = '';

    if (!sch || !sch.events || sch.events.length === 0) {
      list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-sub); font-size: 13px;">No points recorded yet.</div>';
      return;
    }

    sch.events.slice(0, 30).forEach(ev => {
      const hObj = this.getHouse(ev.house);
      const isAdd = ev.delta > 0;
      const sign = isAdd ? '+' : '';

      const card = document.createElement('div');
      card.className = 'activity-card';
      card.innerHTML = `
        <div class="house-dot" style="background: ${hObj.color};"></div>
        <div style="flex: 1; min-width: 0;">
          <div class="activity-student">${ev.student}</div>
          <div class="activity-sub">${ev.criteria} · Just now</div>
        </div>
        <div class="delta-badge" style="color: ${isAdd ? '#28B577' : '#F0405B'};">${sign}${ev.delta}</div>
      `;
      list.appendChild(card);
    });
  }

  // =========================================================================
  // FIND STUDENT (STRICT GRADE-WISE, THEN DIV-WISE SORTING)
  // =========================================================================

  populateHouseFilters() {
    const sel = document.getElementById('filter-house');
    if (!sel) return;
    const sch = this.getActiveSchool();
    sel.innerHTML = '<option value="">All Houses</option>';
    if (!sch) return;

    sch.houses.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h.id;
      opt.textContent = h.name;
      sel.appendChild(opt);
    });
  }

  filterStudents() {
    const q = (document.getElementById('search-student-query').value || '').trim().toLowerCase();
    const g = (document.getElementById('filter-grade').value || '').trim();
    const h = (document.getElementById('filter-house').value || '').trim().toLowerCase();
    const d = (document.getElementById('filter-division').value || '').trim().toUpperCase();

    const sch = this.getActiveSchool();
    if (!sch) return;

    // 1. Sort students Grade-wise (numeric), then Division-wise (alphabetical), then Name
    const sorted = sortStudentsGradeThenDiv([...sch.students]);

    // 2. Filter
    const filtered = sorted.filter(s => {
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (g && String(s.grade) !== g) return false;
      if (h && s.house.toLowerCase() !== h) return false;
      if (d && (s.division || '').toUpperCase() !== d) return false;
      return true;
    });

    const res = document.getElementById('student-search-results');
    res.innerHTML = '';

    if (filtered.length === 0) {
      res.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-sub); font-size: 13px;">No students match your filter.</div>';
      return;
    }

    filtered.forEach(s => {
      const houseObj = this.getHouse(s.house);
      const row = document.createElement('div');
      row.className = 'activity-card';
      row.style.cursor = 'pointer';
      row.innerHTML = `
        <div class="house-dot" style="background: ${houseObj.color};"></div>
        <div style="flex: 1;">
          <div class="activity-student">${s.name}</div>
          <div class="activity-sub">Grade ${s.grade}${s.division} · ${houseObj.name}</div>
        </div>
        <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
          <path d="M1 1L6.5 6.5L1 12" stroke="rgba(245,244,240,0.3)" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
      row.onclick = () => this.selectStudent(s);
      res.appendChild(row);
    });
  }

  selectStudent(student) {
    this.selectedStudent = student;
    const hObj = this.getHouse(student.house);

    document.getElementById('action-student-name').textContent = student.name;
    document.getElementById('action-house-dot').style.background = hObj.color;
    document.getElementById('action-student-sub').textContent = `Grade ${student.grade}${student.division} · ${hObj.name}`;

    this.selectedCriteria = null;
    this.customReason = '';
    document.getElementById('other-reason-container').style.display = 'none';
    document.getElementById('action-custom-reason').value = '';

    this.renderCriteriaList();
    this.updateApplyButton();
    this.showScreen('screen-action');
  }

  // =========================================================================
  // ACTION SCREEN: ADD / DEDUCT POINTS WITH "OTHER" CRITERIA
  // =========================================================================

  setDirection(dir) {
    this.direction = dir;
    const isAdd = dir === 'add';

    const btnAdd = document.getElementById('btn-dir-add');
    const btnDeduct = document.getElementById('btn-dir-deduct');
    btnAdd.className = `segment-btn ${isAdd ? 'active' : ''}`;
    btnAdd.style.background = isAdd ? '#28B577' : 'transparent';
    btnAdd.style.color = isAdd ? '#12141A' : 'var(--text-dim)';

    btnDeduct.className = `segment-btn ${!isAdd ? 'active' : ''}`;
    btnDeduct.style.background = !isAdd ? '#F0405B' : 'transparent';
    btnDeduct.style.color = !isAdd ? '#12141A' : 'var(--text-dim)';

    this.setPoints(this.selectedPoints);
    this.selectedCriteria = null;
    this.renderCriteriaList();
    this.updateApplyButton();
  }

  renderCriteriaList() {
    const box = document.getElementById('criteria-list-container');
    if (!box) return;

    const sch = this.getActiveSchool();
    if (!sch) return;

    const list = this.direction === 'add' ? sch.criteria.add : sch.criteria.deduct;

    box.innerHTML = '';
    list.forEach(c => {
      const isSel = this.selectedCriteria === c;
      const row = document.createElement('div');
      row.className = `criteria-row ${isSel ? 'selected' : ''}`;
      row.innerHTML = `
        <div class="radio-circle"></div>
        <div style="font-size: 14.5px; color: #F5F4F0;">${c}</div>
      `;
      row.onclick = () => {
        this.selectedCriteria = c;
        const isOther = c === 'Other';
        document.getElementById('other-reason-container').style.display = isOther ? 'flex' : 'none';
        this.renderCriteriaList();
        this.updateApplyButton();
      };
      box.appendChild(row);
    });
  }

  onCustomReasonInput(val) {
    this.customReason = val;
    this.updateApplyButton();
  }

  setPoints(pts) {
    this.selectedPoints = pts;
    const activeClass = this.direction === 'add' ? 'active-add' : 'active-deduct';
    [10, 20, 50].forEach(p => {
      const el = document.getElementById(`chip-${p}`);
      el.className = 'pts-chip';
      if (p === pts) el.classList.add(activeClass);
    });
    this.updateApplyButton();
  }

  updateApplyButton() {
    const btn = document.getElementById('btn-apply-points');
    const isAdd = this.direction === 'add';
    const pts = this.selectedPoints;
    const hasStudent = !!this.selectedStudent;
    const hasCriteria = !!this.selectedCriteria;
    const isOtherValid = this.selectedCriteria !== 'Other' || (this.customReason && this.customReason.trim().length > 0);
    const canApply = hasStudent && hasCriteria && isOtherValid;

    btn.textContent = isAdd ? `Add ${pts} Points` : `Deduct ${pts} Points`;
    btn.className = `primary-btn ${canApply ? '' : 'disabled'}`;
    btn.style.background = canApply ? (isAdd ? '#28B577' : '#F0405B') : 'rgba(255,255,255,0.08)';
    btn.style.color = canApply ? '#12141A' : 'rgba(245,244,240,0.3)';
  }

  applyPoints() {
    if (!this.selectedStudent || !this.selectedCriteria) return;
    if (this.selectedCriteria === 'Other' && (!this.customReason || !this.customReason.trim())) return;

    const sch = this.getActiveSchool();
    const finalCriteria = this.selectedCriteria === 'Other' ? this.customReason.trim() : this.selectedCriteria;
    const delta = this.direction === 'add' ? this.selectedPoints : -this.selectedPoints;

    // 1. Update House Points
    sch.houses = sch.houses.map(h => {
      if (h.id.toLowerCase() === this.selectedStudent.house.toLowerCase()) {
        return { ...h, points: h.points + delta };
      }
      return h;
    });

    // 2. Add Activity
    const ev = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      teacher: this.session ? this.session.name : 'Teacher',
      student: this.selectedStudent.name,
      house: this.selectedStudent.house,
      delta: delta,
      criteria: finalCriteria
    };
    sch.events = [ev, ...(sch.events || [])];

    this.saveStorage();

    const hObj = this.getHouse(this.selectedStudent.house);
    const sign = delta > 0 ? '+' : '';
    this.showToast(`${sign}${delta} to ${hObj.name} — ${finalCriteria}`);

    this.renderScoreboard();
    this.renderActivity();
    this.showScreen('screen-home');
  }

  // =========================================================================
  // PREVIOUS-STYLE SCHOOL ADMIN PORTAL LOGIC (ADD SCHOOL REMOVED)
  // =========================================================================

  setAdminTab(t) {
    ['profile', 'houses', 'criteria', 'roster', 'term'].forEach((name, i) => {
      document.querySelectorAll('.admin-nav-tab')[i].classList.toggle('active', name === t);
      const panel = document.getElementById(`admin-panel-${name}`);
      if (panel) panel.classList.toggle('active', name === t);
    });
  }

  renderAdminAll() {
    this.renderAdminProfile();
    this.renderAdminHouses();
    this.renderAdminCriteria();
    this.renderAdminRoster();
    this.renderAdminTerm();
  }

  // --- Admin Profile: User Decides / Edits Admin Code ---
  renderAdminProfile() {
    const sch = this.getActiveSchool();
    if (!sch) return;
    document.getElementById('admin-input-school-name').value = sch.name;
    const emailEl = document.getElementById('admin-input-school-email');
    if (emailEl) emailEl.value = sch.email || '';
    document.getElementById('admin-input-school-motto').value = sch.motto;
    document.getElementById('admin-input-school-cycle').value = sch.resetCycle || 'yearly';
    document.getElementById('admin-input-school-code').value = sch.code;
    document.getElementById('admin-input-school-pin').value = sch.adminPin; // User can view and change their Admin Code!
  }

  saveSchoolProfile() {
    const sch = this.getActiveSchool();
    if (!sch) return;

    sch.name = (document.getElementById('admin-input-school-name').value || '').trim() || sch.name;
    const emailEl = document.getElementById('admin-input-school-email');
    if (emailEl) {
      sch.email = (emailEl.value || '').trim();
    }
    sch.motto = (document.getElementById('admin-input-school-motto').value || '').trim() || sch.motto;
    sch.code = (document.getElementById('admin-input-school-code').value || '').trim().toUpperCase() || sch.code;
    
    const newCycle = document.getElementById('admin-input-school-cycle').value || 'yearly';
    if (sch.resetCycle !== newCycle) {
      sch.resetCycle = newCycle;
      const year = sch.academicYear || '2026-27';
      if (newCycle === 'yearly') {
        sch.term = `Academic Year ${year}`;
      } else {
        sch.currentTermIndex = sch.currentTermIndex || 1;
        sch.term = `Term ${sch.currentTermIndex} (${year})`;
      }
    }

    // User saves their chosen Admin Code
    const pin = (document.getElementById('admin-input-school-pin').value || '').trim();
    if (!pin) {
      alert('Admin Code cannot be empty.');
      return;
    }
    sch.adminPin = pin;

    this.saveStorage();
    this.updateSchoolUI();
    this.renderAdminTerm();
    this.showToast('School Profile & Settings updated!');
  }

  // --- Admin Houses (Dynamic) ---
  renderAdminHouses() {
    const sch = this.getActiveSchool();
    const tbody = document.getElementById('admin-houses-tbody');
    if (!tbody || !sch) return;

    tbody.innerHTML = '';
    sch.houses.forEach(h => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><div style="width:14px; height:14px; border-radius:50%; background:${h.color};"></div></td>
        <td style="font-size:16px;">${h.emblem || '🛡️'}</td>
        <td style="font-weight:600;">${h.name}</td>
        <td style="font-family:'Oswald',sans-serif; font-size:16px; font-weight:700;">${h.points}</td>
        <td style="text-align: right; white-space: nowrap;">
          <span class="action-btn-edit" onclick="app.openEditHouseModal('${h.id}')" title="Edit house details">✏️</span>
          <span class="action-link" onclick="app.deleteHouse('${h.id}')" title="Delete house">✕</span>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  openAddHouseModal() {
    document.getElementById('new-house-name').value = '';
    document.getElementById('new-house-emblem').value = '🛡️';
    this.selectHouseColor('#E5354F');
    this.openModal('modal-add-house');
  }

  selectHouseColor(hex) {
    this.newHouseSelectedColor = hex;
    document.querySelectorAll('#color-presets .color-dot-preset').forEach(dot => {
      dot.classList.toggle('selected', dot.style.background.toLowerCase() === hex.toLowerCase());
    });
    document.getElementById('custom-house-color').value = hex;
  }

  saveNewHouse() {
    const name = (document.getElementById('new-house-name').value || '').trim();
    const emblem = (document.getElementById('new-house-emblem').value || '').trim() || '🛡️';
    if (!name) {
      alert('Please enter a house name.');
      return;
    }

    const sch = this.getActiveSchool();
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (sch.houses.some(h => h.id === id)) {
      alert('A house with this name already exists.');
      return;
    }

    sch.houses.push({
      id: id,
      name: name,
      color: this.newHouseSelectedColor,
      emblem: emblem,
      points: 0
    });

    this.saveStorage();
    this.renderAdminHouses();
    this.renderScoreboard();
    this.populateHouseFilters();
    this.closeModal('modal-add-house');
    this.showToast(`House ${name} created!`);
  }

  openEditHouseModal(id) {
    const sch = this.getActiveSchool();
    if (!sch) return;
    const house = sch.houses.find(h => h.id === id);
    if (!house) return;

    document.getElementById('edit-house-orig-id').value = house.id;
    document.getElementById('edit-house-name').value = house.name;
    document.getElementById('edit-house-emblem').value = house.emblem || '🛡️';
    this.selectEditHouseColor(house.color || '#E5354F');

    this.openModal('modal-edit-house');
  }

  selectEditHouseColor(hex) {
    this.editHouseSelectedColor = hex;
    document.querySelectorAll('#edit-house-color-presets .color-dot-preset').forEach(dot => {
      dot.classList.toggle('selected', dot.style.background.toLowerCase() === hex.toLowerCase());
    });
    const custom = document.getElementById('edit-custom-house-color');
    if (custom) custom.value = hex;
  }

  saveEditedHouse() {
    const sch = this.getActiveSchool();
    if (!sch) return;

    const origId = document.getElementById('edit-house-orig-id').value;
    const newName = (document.getElementById('edit-house-name').value || '').trim();
    const newEmblem = (document.getElementById('edit-house-emblem').value || '').trim() || '🛡️';
    const newColor = this.editHouseSelectedColor || '#E5354F';

    if (!newName) {
      alert('House name cannot be empty.');
      return;
    }

    const hIdx = sch.houses.findIndex(h => h.id === origId);
    if (hIdx === -1) {
      alert('House record not found.');
      return;
    }

    const oldName = sch.houses[hIdx].name;

    // Check duplicate name
    if (newName.toLowerCase() !== oldName.toLowerCase()) {
      if (sch.houses.some((h, i) => i !== hIdx && h.name.toLowerCase() === newName.toLowerCase())) {
        alert(`A house named "${newName}" already exists.`);
        return;
      }
    }

    // Update house properties
    sch.houses[hIdx].name = newName;
    sch.houses[hIdx].emblem = newEmblem;
    sch.houses[hIdx].color = newColor;

    // If house name changed, update students and events
    if (newName !== oldName) {
      if (Array.isArray(sch.students)) {
        sch.students.forEach(s => {
          if (s.house && s.house.toLowerCase() === oldName.toLowerCase()) {
            s.house = newName;
          }
        });
      }
      if (Array.isArray(sch.events)) {
        sch.events.forEach(ev => {
          if (ev.house && ev.house.toLowerCase() === oldName.toLowerCase()) {
            ev.house = newName;
          }
        });
      }
    }

    this.saveStorage();
    this.renderAdminHouses();
    this.renderScoreboard();
    this.populateHouseFilters();
    this.updateSchoolUI();
    this.closeModal('modal-edit-house');
    this.showToast(`Updated house "${newName}"`);
  }

  deleteHouse(id) {
    const sch = this.getActiveSchool();
    if (sch.houses.length <= 2) {
      alert('A school must maintain at least 2 houses.');
      return;
    }
    if (!confirm('Are you sure you want to delete this house?')) return;

    sch.houses = sch.houses.filter(h => h.id !== id);
    this.saveStorage();
    this.renderAdminHouses();
    this.renderScoreboard();
    this.populateHouseFilters();
    this.showToast('House deleted');
  }

  // --- Admin Criteria ---
  renderAdminCriteria() {
    const sch = this.getActiveSchool();
    const posBox = document.getElementById('admin-pos-criteria-list');
    const negBox = document.getElementById('admin-neg-criteria-list');
    if (!sch) return;

    if (posBox) {
      posBox.innerHTML = '';
      sch.criteria.add.forEach((c, idx) => {
        const pill = document.createElement('div');
        pill.className = 'badge-pill';
        pill.style.background = 'rgba(40,181,119,0.15)';
        pill.style.color = '#28B577';
        pill.innerHTML = `${c} <span style="cursor:pointer; margin-left:4px;" onclick="app.removeCriteria('add', ${idx})">✕</span>`;
        posBox.appendChild(pill);
      });
    }

    if (negBox) {
      negBox.innerHTML = '';
      sch.criteria.deduct.forEach((c, idx) => {
        const pill = document.createElement('div');
        pill.className = 'badge-pill';
        pill.style.background = 'rgba(240,64,91,0.15)';
        pill.style.color = '#F0405B';
        pill.innerHTML = `${c} <span style="cursor:pointer; margin-left:4px;" onclick="app.removeCriteria('deduct', ${idx})">✕</span>`;
        negBox.appendChild(pill);
      });
    }
  }

  addCriteria(type) {
    const input = document.getElementById(type === 'add' ? 'new-pos-criteria' : 'new-neg-criteria');
    const val = (input.value || '').trim();
    if (!val) return;

    const sch = this.getActiveSchool();
    sch.criteria[type].push(val);
    input.value = '';
    this.saveStorage();
    this.renderAdminCriteria();
    this.showToast('Criteria added');
  }

  removeCriteria(type, idx) {
    const sch = this.getActiveSchool();
    sch.criteria[type].splice(idx, 1);
    this.saveStorage();
    this.renderAdminCriteria();
  }

  // --- Admin Roster & Excel Import (STRICTLY ADMIN ONLY) ---
  renderAdminRoster() {
    const sch = this.getActiveSchool();
    if (!sch) return;

    // Student Search & Filter
    const sq = (document.getElementById('admin-student-search-input')?.value || '').trim().toLowerCase();
    const filteredStudents = sch.students.filter(s => {
      if (!sq) return true;
      return s.name.toLowerCase().includes(sq) ||
             `${s.grade}${s.division}`.toLowerCase().includes(sq) ||
             s.house.toLowerCase().includes(sq);
    });

    document.getElementById('admin-student-count').textContent = sq 
      ? `${filteredStudents.length} of ${sch.students.length}` 
      : sch.students.length;

    const stbody = document.getElementById('admin-students-tbody');
    if (stbody) {
      stbody.innerHTML = '';
      if (filteredStudents.length === 0) {
        stbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-sub); padding:14px;">No students found matching search.</td></tr>';
      } else {
        filteredStudents.forEach(s => {
          const tr = document.createElement('tr');
          const safeName = s.name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
          tr.innerHTML = `
            <td>${s.name}</td>
            <td>Gr ${s.grade}${s.division}</td>
            <td><span class="badge-pill" style="background:rgba(255,255,255,0.08);">${s.house}</span></td>
            <td style="text-align: right; white-space: nowrap;">
              <span class="action-btn-edit" onclick="app.openEditStudentModal('${safeName}')" title="Edit student">✏️</span>
              <span class="action-link" onclick="app.deleteStudent('${safeName}')" title="Delete this student">✕</span>
            </td>
          `;
          stbody.appendChild(tr);
        });
      }
    }

    // Teacher Search & Filter
    const tq = (document.getElementById('admin-teacher-search-input')?.value || '').trim().toLowerCase();
    const filteredTeachers = sch.teachers.filter(t => {
      if (!tq) return true;
      return t.username.toLowerCase().includes(tq) ||
             (t.displayName || '').toLowerCase().includes(tq);
    });

    document.getElementById('admin-teacher-count').textContent = tq 
      ? `${filteredTeachers.length} of ${sch.teachers.length}` 
      : sch.teachers.length;

    const ttbody = document.getElementById('admin-teachers-tbody');
    if (ttbody) {
      ttbody.innerHTML = '';
      if (filteredTeachers.length === 0) {
        ttbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-sub); padding:14px;">No teachers found matching search.</td></tr>';
      } else {
        filteredTeachers.forEach(t => {
          const tr = document.createElement('tr');
          const safeUser = t.username.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
          
          // Strictly ensure admin is always displayed as "School Admin" and never "Headmaster"
          let disp = t.displayName;
          if (t.username.toLowerCase() === 'admin' || disp === 'Headmaster') {
            disp = 'School Admin';
            if (t.displayName !== 'School Admin') {
              t.displayName = 'School Admin';
              this.saveStorage();
            }
          } else if (!disp) {
            disp = t.username;
          }

          tr.innerHTML = `
            <td><code>${t.username}</code></td>
            <td style="font-weight: 500; color: #F5F4F0;">${disp}</td>
            <td><code>•••••</code></td>
            <td style="text-align: right; white-space: nowrap;">
              <span class="action-btn-edit" onclick="app.openEditTeacherModal('${safeUser}')" title="Edit teacher">✏️</span>
              <span class="action-link" onclick="app.deleteTeacher('${safeUser}')" title="Delete this teacher">✕</span>
            </td>
          `;
          ttbody.appendChild(tr);
        });
      }
    }
  }

  deleteStudent(name) {
    const sch = this.getActiveSchool();
    if (!sch) return;
    if (!confirm(`Are you sure you want to delete student "${name}"?`)) return;

    sch.students = sch.students.filter(s => s.name !== name);
    this.saveStorage();
    this.renderAdminRoster();
    this.populateHouseFilters();
    this.showToast(`Deleted student "${name}"`);
  }

  deleteTeacher(u) {
    const sch = this.getActiveSchool();
    if (!sch) return;

    if (u.toLowerCase() === 'admin' && sch.teachers.filter(t => t.username.toLowerCase() === 'admin').length <= 1) {
      if (!confirm(`Warning: "${u}" is your primary admin account. Are you sure you want to delete it?`)) return;
    } else {
      if (!confirm(`Are you sure you want to delete teacher "${u}"?`)) return;
    }

    sch.teachers = sch.teachers.filter(t => t.username !== u);
    this.saveStorage();
    this.renderAdminRoster();
    this.showToast(`Deleted teacher "${u}"`);
  }

  clearAllStudents() {
    const sch = this.getActiveSchool();
    if (!sch) return;
    const count = (sch.students || []).length;
    if (count === 0) {
      alert('There are no students to clear.');
      return;
    }
    if (!confirm(`Are you sure you want to permanently delete ALL ${count} students from this school? This action cannot be undone.`)) {
      return;
    }
    sch.students = [];
    this.saveStorage();
    this.renderAdminRoster();
    this.populateHouseFilters();
    this.showToast(`Successfully cleared all ${count} students from roster!`);
  }

  clearAllTeachers() {
    const sch = this.getActiveSchool();
    if (!sch) return;
    const teachers = sch.teachers || [];
    const nonAdminTeachers = teachers.filter(t => t.username.toLowerCase() !== 'admin');
    if (nonAdminTeachers.length === 0 && teachers.length <= 1) {
      alert('There are no additional staff teachers to clear (the primary admin account is preserved).');
      return;
    }
    if (!confirm(`Are you sure you want to delete all staff teachers? The primary School Admin account (admin) will be preserved for management.`)) {
      return;
    }
    const adminTeacher = teachers.find(t => t.username.toLowerCase() === 'admin') || {
      username: 'admin',
      password: 'password1',
      displayName: 'School Admin'
    };
    sch.teachers = [adminTeacher];
    this.saveStorage();
    this.renderAdminRoster();
    this.showToast(`Cleared all staff teachers! Primary admin account preserved.`);
  }

  clearAllRosterData() {
    const sch = this.getActiveSchool();
    if (!sch) return;
    const sCount = (sch.students || []).length;
    const tCount = (sch.teachers || []).filter(t => t.username.toLowerCase() !== 'admin').length;
    if (sCount === 0 && tCount === 0) {
      alert('Both student roster and teacher staff are already empty.');
      return;
    }
    if (!confirm(`Are you sure you want to clear ALL roster data (${sCount} students and ${tCount} staff teachers)? Primary admin account will be retained.`)) {
      return;
    }
    sch.students = [];
    const adminTeacher = (sch.teachers || []).find(t => t.username.toLowerCase() === 'admin') || {
      username: 'admin',
      password: 'password1',
      displayName: 'School Admin'
    };
    sch.teachers = [adminTeacher];
    this.saveStorage();
    this.renderAdminRoster();
    this.populateHouseFilters();
    this.showToast(`Cleared all student and teacher data!`);
  }

  openEditStudentModal(name) {
    const sch = this.getActiveSchool();
    if (!sch) return;
    const student = sch.students.find(s => s.name === name);
    if (!student) return;

    document.getElementById('edit-student-orig-name').value = student.name;
    document.getElementById('edit-student-name').value = student.name;
    document.getElementById('edit-student-grade').value = student.grade || '';
    document.getElementById('edit-student-div').value = student.division || '';

    // Populate House dropdown
    const houseSelect = document.getElementById('edit-student-house');
    if (houseSelect) {
      houseSelect.innerHTML = sch.houses.map(h => 
        `<option value="${h.name}" ${h.name.toLowerCase() === (student.house || '').toLowerCase() ? 'selected' : ''}>${h.emblem || '🛡️'} ${h.name}</option>`
      ).join('');
    }

    this.openModal('modal-edit-student');
  }

  saveEditedStudent() {
    const sch = this.getActiveSchool();
    if (!sch) return;

    const origName = (document.getElementById('edit-student-orig-name').value || '').trim();
    const newName = (document.getElementById('edit-student-name').value || '').trim();
    const newGrade = (document.getElementById('edit-student-grade').value || '').trim();
    const newDiv = (document.getElementById('edit-student-div').value || '').trim().toUpperCase();
    const newHouse = (document.getElementById('edit-student-house').value || '').trim();

    if (!newName) {
      alert('Student name cannot be empty.');
      return;
    }
    if (!newHouse) {
      alert('Please select a house for the student.');
      return;
    }

    const sIdx = sch.students.findIndex(s => s.name === origName);
    if (sIdx === -1) {
      alert('Student record not found.');
      return;
    }

    // Check duplicate name if name was changed
    if (newName.toLowerCase() !== origName.toLowerCase()) {
      if (sch.students.some(s => s.name.toLowerCase() === newName.toLowerCase())) {
        alert(`A student named "${newName}" already exists in this school.`);
        return;
      }
    }

    // Update student data
    sch.students[sIdx].name = newName;
    sch.students[sIdx].grade = newGrade;
    sch.students[sIdx].division = newDiv;
    sch.students[sIdx].house = newHouse;

    // Keep events consistent if name changed
    if (newName !== origName && Array.isArray(sch.events)) {
      sch.events.forEach(ev => {
        if (ev.studentName === origName) {
          ev.studentName = newName;
          ev.house = newHouse;
        }
      });
    }

    // Re-sort students according to standard sorting
    sch.students.sort((a, b) => {
      const gA = parseInt(a.grade) || 0;
      const gB = parseInt(b.grade) || 0;
      if (gA !== gB) return gA - gB;
      const divComp = (a.division || '').localeCompare(b.division || '');
      if (divComp !== 0) return divComp;
      return (a.name || '').localeCompare(b.name || '');
    });

    this.saveStorage();
    this.renderAdminRoster();
    this.populateHouseFilters();
    this.closeModal('modal-edit-student');
    this.showToast(`Updated student "${newName}"`);
  }

  openEditTeacherModal(username) {
    const sch = this.getActiveSchool();
    if (!sch) return;
    const teacher = sch.teachers.find(t => t.username === username);
    if (!teacher) return;

    let disp = teacher.displayName;
    if (teacher.username.toLowerCase() === 'admin' || disp === 'Headmaster') {
      disp = 'School Admin';
    } else if (!disp) {
      disp = teacher.username;
    }

    document.getElementById('edit-teacher-orig-user').value = teacher.username;
    document.getElementById('edit-teacher-username').value = teacher.username;
    document.getElementById('edit-teacher-display').value = disp;
    document.getElementById('edit-teacher-password').value = teacher.password;

    this.openModal('modal-edit-teacher');
  }

  saveEditedTeacher() {
    const sch = this.getActiveSchool();
    if (!sch) return;

    const origUser = (document.getElementById('edit-teacher-orig-user').value || '').trim();
    const newUser = (document.getElementById('edit-teacher-username').value || '').trim();
    let newDisplay = (document.getElementById('edit-teacher-display').value || '').trim();
    const newPass = (document.getElementById('edit-teacher-password').value || '').trim();

    if (!newUser || !newPass) {
      alert('Username and password cannot be empty.');
      return;
    }

    const tIdx = sch.teachers.findIndex(t => t.username === origUser);
    if (tIdx === -1) {
      alert('Teacher record not found.');
      return;
    }

    // Check duplicate username if username changed
    if (newUser.toLowerCase() !== origUser.toLowerCase()) {
      if (sch.teachers.some(t => t.username.toLowerCase() === newUser.toLowerCase())) {
        alert(`A teacher with username "${newUser}" already exists.`);
        return;
      }
    }

    if (newUser.toLowerCase() === 'admin' && (newDisplay.toLowerCase() === 'headmaster' || !newDisplay)) {
      newDisplay = 'School Admin';
    }

    sch.teachers[tIdx].username = newUser;
    sch.teachers[tIdx].displayName = newDisplay || newUser;
    sch.teachers[tIdx].password = newPass;

    // Update active session if the edited teacher is currently logged in
    if (this.session && this.session.role === 'teacher') {
      if (this.session.name === origUser || this.session.name === sch.teachers[tIdx].displayName) {
        this.session.name = sch.teachers[tIdx].displayName;
        const sNameEl = document.getElementById('home-session-name');
        if (sNameEl) sNameEl.textContent = this.session.name;
      }
    }

    this.saveStorage();
    this.renderAdminRoster();
    this.closeModal('modal-edit-teacher');
    this.showToast(`Updated teacher "${newUser}"`);
  }

  // --- Student & Teacher Templates Download ---
  downloadStudentTemplate() {
    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(
      "Name,Grade,Division,House\n" +
      "Aarav Sharma,9,A,Ruby\n" +
      "Diya Patel,10,B,Sapphire\n" +
      "Vivaan Gupta,9,A,Topaz\n" +
      "Ananya Iyer,10,B,Emerald\n"
    );
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", "student_roster_template.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  downloadTeacherTemplate() {
    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(
      "Username,Password,Display Name\n" +
      "sharma,teacher123,Mrs. Sharma\n" +
      "verma,teacher456,Mr. Verma\n"
    );
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", "teacher_roster_template.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // --- Excel File Upload & Sheet Parser (SheetJS .xlsx, .xls and .csv) ---
  handleExcelFileUpload(event, type) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const reader = new FileReader();

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      reader.onload = (e) => {
        try {
          if (typeof XLSX === 'undefined') {
            alert('Excel parser library (SheetJS) is loading. Please wait a moment and try again.');
            return;
          }
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
          this.processExcelRows(rows, type);
        } catch (err) {
          console.error(err);
          alert('Error parsing Excel spreadsheet: ' + err.message);
        } finally {
          event.target.value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV or plain text
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
          const rows = lines.map(line => {
            return line.includes('\t')
              ? line.split('\t').map(c => c.trim().replace(/^"|"$/g, ''))
              : line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          });
          this.processExcelRows(rows, type);
        } catch (err) {
          console.error(err);
          alert('Error reading CSV file: ' + err.message);
        } finally {
          event.target.value = '';
        }
      };
      reader.readAsText(file);
    }
  }

  // --- Universal Row Processor for Students and Teachers ---
  processExcelRows(rows, type) {
    const sch = this.getActiveSchool();
    if (!sch) return;

    if (!Array.isArray(rows) || rows.length === 0) {
      alert('The spreadsheet contains no data rows.');
      return;
    }

    if (type === 'students') {
      let count = 0;
      rows.forEach(parts => {
        if (!parts || parts.length < 4) return;
        const col0 = String(parts[0] || '').trim();
        const col1 = String(parts[1] || '').trim();
        const col2 = String(parts[2] || '').trim();
        const col3 = String(parts[3] || '').trim();

        if (col0.toLowerCase() === 'name') return; // Skip header
        if (!col0) return;

        const matchedHouse = sch.houses.find(h =>
          h.name.toLowerCase() === col3.toLowerCase() ||
          h.id.toLowerCase() === col3.toLowerCase()
        );
        const houseId = matchedHouse ? matchedHouse.id : (sch.houses[0]?.id || col3.toLowerCase());

        sch.students.push({
          name: col0,
          grade: col1,
          division: col2,
          house: houseId
        });
        count++;
      });

      if (count > 0) {
        sch.students = sortStudentsGradeThenDiv(sch.students);
        this.saveStorage();
        this.renderAdminRoster();
        this.populateHouseFilters();
        this.showToast(`Imported ${count} students from spreadsheet!`);
      } else {
        alert('Could not parse student rows. Please ensure columns are: Name | Grade | Division | House');
      }
    } else if (type === 'teachers') {
      let count = 0;
      rows.forEach(parts => {
        if (!parts || parts.length < 3) return;
        const col0 = String(parts[0] || '').trim();
        const col1 = String(parts[1] || '').trim();
        const col2 = String(parts[2] || '').trim();

        if (col0.toLowerCase() === 'username') return; // Skip header
        if (!col0) return;

        let u = col0.toLowerCase();
        let disp = col2;
        if (u === 'admin' || disp.toLowerCase() === 'headmaster') {
          disp = 'School Admin';
        }

        const existingIdx = sch.teachers.findIndex(t => t.username.toLowerCase() === u);
        if (existingIdx >= 0) {
          sch.teachers[existingIdx] = { username: u, password: col1, displayName: disp };
        } else {
          sch.teachers.push({ username: u, password: col1, displayName: disp });
        }
        count++;
      });

      if (count > 0) {
        this.saveStorage();
        this.renderAdminRoster();
        this.showToast(`Imported ${count} teachers from spreadsheet!`);
      } else {
        alert('Could not parse teacher rows. Please ensure columns are: Username | Password | Display Name');
      }
    }
  }

  // --- Clipboard Paste Handlers ---
  importStudentsFromExcel() {
    const raw = (document.getElementById('excel-students-input').value || '').trim();
    if (!raw) {
      alert('Please paste spreadsheet data into the box or use the Upload Sheet button.');
      return;
    }
    const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
    const rows = lines.map(line => {
      return line.includes('\t')
        ? line.split('\t').map(c => c.trim().replace(/^"|"$/g, ''))
        : line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    });
    this.processExcelRows(rows, 'students');
    document.getElementById('excel-students-input').value = '';
  }

  importTeachersFromExcel() {
    const raw = (document.getElementById('excel-teachers-input').value || '').trim();
    if (!raw) {
      alert('Please paste teacher data into the box or use the Upload Sheet button.');
      return;
    }
    const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
    const rows = lines.map(line => {
      return line.includes('\t')
        ? line.split('\t').map(c => c.trim().replace(/^"|"$/g, ''))
        : line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    });
    this.processExcelRows(rows, 'teachers');
    document.getElementById('excel-teachers-input').value = '';
  }

  // --- Add Single Student / Teacher Modals ---
  openAddSingleStudentModal() {
    const sch = this.getActiveSchool();
    if (!sch) return;

    document.getElementById('new-student-name').value = '';
    document.getElementById('new-student-grade').value = '';
    document.getElementById('new-student-div').value = '';

    const sel = document.getElementById('new-student-house');
    if (sel) {
      sel.innerHTML = sch.houses.map(h => `<option value="${h.id}">${h.emblem || '🛡️'} ${h.name}</option>`).join('');
    }
    this.openModal('modal-add-student');
  }

  saveSingleStudent() {
    const sch = this.getActiveSchool();
    if (!sch) return;

    const name = (document.getElementById('new-student-name').value || '').trim();
    const grade = (document.getElementById('new-student-grade').value || '').trim();
    const div = (document.getElementById('new-student-div').value || '').trim().toUpperCase();
    const house = document.getElementById('new-student-house').value;

    if (!name) {
      alert('Please enter student name.');
      return;
    }

    sch.students.push({
      name: name,
      grade: grade,
      division: div,
      house: house
    });

    sch.students = sortStudentsGradeThenDiv(sch.students);
    this.saveStorage();
    this.renderAdminRoster();
    this.populateHouseFilters();
    this.closeModal('modal-add-student');
    this.showToast(`Added student "${name}" to roster!`);
  }

  openAddSingleTeacherModal() {
    document.getElementById('new-teacher-user').value = '';
    document.getElementById('new-teacher-disp').value = '';
    document.getElementById('new-teacher-pass').value = '';
    this.openModal('modal-add-teacher');
  }

  saveSingleTeacher() {
    const sch = this.getActiveSchool();
    if (!sch) return;

    const user = (document.getElementById('new-teacher-user').value || '').trim().toLowerCase();
    let disp = (document.getElementById('new-teacher-disp').value || '').trim();
    const pass = (document.getElementById('new-teacher-pass').value || '').trim();

    if (!user || !pass) {
      alert('Please enter both Username and Password.');
      return;
    }

    if (user === 'admin' || disp.toLowerCase() === 'headmaster') {
      disp = 'School Admin';
    }

    const existingIdx = sch.teachers.findIndex(t => t.username.toLowerCase() === user);
    if (existingIdx >= 0) {
      alert(`Teacher username "${user}" already exists. Please choose a different username.`);
      return;
    }

    sch.teachers.push({
      username: user,
      displayName: disp || user,
      password: pass
    });

    this.saveStorage();
    this.renderAdminRoster();
    this.closeModal('modal-add-teacher');
    this.showToast(`Added teacher "${user}" to staff!`);
  }

  // --- Admin Term & Reset / Annual Reset (Strict 2-Term Progression & Consecutive Years) ---
  renderAdminTerm() {
    const sch = this.getActiveSchool();
    if (!sch) return;

    const isYearly = (sch.resetCycle || 'yearly') === 'yearly';

    const tabNav = document.getElementById('admin-tab-nav-reset');
    if (tabNav) tabNav.textContent = isYearly ? '🏆 Annual Reset' : '🏆 Term & Reset';

    const header = document.getElementById('admin-reset-cycle-header');
    if (header) header.textContent = isYearly ? 'Current Academic Year:' : 'Current Period:';

    const desc = document.getElementById('admin-reset-cycle-desc');
    if (desc) {
      if (isYearly) {
        desc.textContent = `Points accumulate across the full academic year (${sch.academicYear || '2026-27'}). Concluding archives the champion, resets all house points to 0, and advances to the next consecutive academic year.`;
      } else {
        const curTerm = sch.currentTermIndex || 1;
        if (curTerm === 1) {
          desc.textContent = `Strict 2-Term cycle. Concluding Term 1 archives results, resets points to 0, and moves to Term 2 of the current academic year (${sch.academicYear || '2026-27'}).`;
        } else {
          desc.textContent = `Strict 2-Term cycle. Concluding Term 2 concludes the full academic year (${sch.academicYear || '2026-27'}), resets points to 0, advances to the next consecutive academic year, and begins Term 1.`;
        }
      }
    }

    const btn = document.getElementById('admin-reset-cycle-btn');
    if (btn) {
      if (isYearly) {
        btn.textContent = '🏆 Conclude Academic Year & Advance Year';
      } else {
        btn.textContent = (sch.currentTermIndex || 1) === 1
          ? '🏆 Conclude Term 1 & Proceed to Term 2'
          : '🏆 Conclude Term 2 & Advance to Next Academic Year';
      }
    }

    const histTitle = document.getElementById('admin-history-title');
    if (histTitle) {
      histTitle.textContent = isYearly ? 'Annual Championship History & Past Champions' : 'Term History & Past Champions';
    }

    const termDisplay = document.getElementById('admin-term-name-display');
    if (termDisplay) termDisplay.textContent = sch.term;

    const histList = document.getElementById('admin-term-history-list');
    if (!sch.archivedTerms || sch.archivedTerms.length === 0) {
      histList.innerHTML = `<div style="color:var(--text-sub);">No past ${isYearly ? 'years' : 'terms'} archived yet.</div>`;
      return;
    }

    histList.innerHTML = '';
    sch.archivedTerms.forEach(t => {
      const d = document.createElement('div');
      d.style.padding = '8px 0';
      d.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
      d.innerHTML = `
        <div style="font-weight:600; color:var(--text-main);">${t.term}</div>
        <div style="font-size:12px; color:var(--accent-gold);">🏆 Winner: ${t.winner} (${t.winningPoints} pts)</div>
        <div style="font-size:11px; color:var(--text-sub);">Concluded on ${new Date(t.date).toLocaleDateString()}</div>
      `;
      histList.appendChild(d);
    });
  }

  concludeTermAndReset() {
    const sch = this.getActiveSchool();
    if (!sch) return;
    const isYearly = (sch.resetCycle || 'yearly') === 'yearly';

    if (!confirm(`Are you sure you want to conclude ${sch.term}? This will archive the results and reset all house points to 0.`)) return;

    const sorted = [...sch.houses].sort((a, b) => b.points - a.points);
    const winner = sorted[0] || { name: 'None', points: 0 };

    if (!sch.archivedTerms) sch.archivedTerms = [];
    sch.archivedTerms.unshift({
      term: sch.term,
      winner: winner.name,
      winningPoints: winner.points,
      finalStandings: sorted.map(h => ({ name: h.name, points: h.points })),
      date: new Date().toISOString()
    });

    sch.houses = sch.houses.map(h => ({ ...h, points: 0 }));
    sch.events = [];

    let toastMsg = '';
    if (isYearly) {
      const prevYear = sch.academicYear || '2026-27';
      sch.academicYear = advanceAcademicYear(prevYear);
      sch.term = `Academic Year ${sch.academicYear}`;
      toastMsg = `Academic Year ${prevYear} concluded! Advanced to ${sch.academicYear} and points reset to 0.`;
    } else {
      const curIndex = sch.currentTermIndex || 1;
      if (curIndex === 1) {
        sch.currentTermIndex = 2;
        sch.term = `Term 2 (${sch.academicYear || '2026-27'})`;
        toastMsg = `Term 1 concluded! Now entering Term 2 (${sch.academicYear}) and points reset to 0.`;
      } else {
        const prevYear = sch.academicYear || '2026-27';
        sch.academicYear = advanceAcademicYear(prevYear);
        sch.currentTermIndex = 1;
        sch.term = `Term 1 (${sch.academicYear})`;
        toastMsg = `Term 2 concluded! Full academic year completed. Advanced to ${sch.academicYear} (Term 1) and points reset to 0.`;
      }
    }

    this.saveStorage();
    this.renderScoreboard();
    this.renderActivity();
    this.renderAdminTerm();
    this.updateSchoolUI();
    this.showToast(toastMsg);
  }

  exportActivityCSV() {
    const sch = this.getActiveSchool();
    let csv = "Timestamp,Teacher,Student,House,Points,Criteria\n";
    (sch.events || []).forEach(e => {
      csv += `"${e.timestamp}","${e.teacher}","${e.student}","${e.house}",${e.delta},"${e.criteria}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sch.id}-activity-export.csv`;
    a.click();
  }

  exportSchoolJSON() {
    const sch = this.getActiveSchool();
    const blob = new Blob([JSON.stringify(sch, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sch.id}-backup.json`;
    a.click();
  }

  // =========================================================================
  // MULTI-TENANT CLOUD REALTIME SYNC (Firebase Realtime Database)
  // Enables live instant updates between devices & locations
  // Each school is isolated under /schools/<schoolId>
  // =========================================================================

  initCloudSync() {
    const DEFAULT_FIREBASE_URL = 'https://housecup-6fb50-default-rtdb.firebaseio.com';
    const savedConfig = localStorage.getItem('housecup_saas_firebase_config');

    if (savedConfig === 'disabled') {
      this.updateCloudStatusUI(false);
      return;
    }

    const rawConfig = savedConfig || DEFAULT_FIREBASE_URL;

    try {
      if (typeof firebase === 'undefined') {
        console.warn('Firebase SDK not loaded.');
        this.updateCloudStatusUI(false, 'Firebase SDK offline');
        return;
      }

      let configObj;
      const clean = rawConfig.trim();
      if (clean.startsWith('{')) {
        configObj = JSON.parse(clean);
      } else {
        // Direct Database URL
        configObj = { 
          databaseURL: clean.replace(/\/$/, ''),
          projectId: 'housecup-6fb50'
        };
      }

      if (!firebase.apps.length) {
        firebase.initializeApp(configObj);
      }
      this.cloudDb = firebase.database();
      this.cloudEnabled = true;
      this.updateCloudStatusUI(true);

      // Auto-sync any existing local schools to the cloud database
      Object.keys(this.schools).forEach(k => {
        this.syncSchoolToCloud(k);
      });

      if (this.activeSchoolId) {
        this.listenToSchoolCloud(this.activeSchoolId);
      }
    } catch (e) {
      console.warn('Firebase init error:', e);
      this.updateCloudStatusUI(false, e.message);
    }
  }

  updateCloudStatusUI(connected, errorMsg = '') {
    const loginDot = document.getElementById('sync-dot-login');
    const loginText = document.getElementById('sync-text-login');
    const homeDot = document.getElementById('sync-dot-home');
    const modalDot = document.getElementById('sync-modal-dot');
    const modalTitle = document.getElementById('sync-modal-status-title');
    const modalSub = document.getElementById('sync-modal-status-sub');

    if (connected) {
      if (loginDot) loginDot.style.background = '#28B577';
      if (loginText) loginText.textContent = 'Cloud Sync Active';
      if (homeDot) homeDot.style.background = '#28B577';
      if (modalDot) modalDot.style.background = '#28B577';
      if (modalTitle) {
        modalTitle.textContent = 'Cloud Sync Active 🟢';
        modalTitle.style.color = '#28B577';
      }
      if (modalSub) {
        modalSub.textContent = 'Real-time multi-device cloud sync active';
        modalSub.style.color = '#28B577';
      }
    } else {
      if (loginDot) loginDot.style.background = 'rgba(255,255,255,0.4)';
      if (loginText) loginText.textContent = 'Local Mode';
      if (homeDot) homeDot.style.background = 'rgba(255,255,255,0.4)';
      if (modalDot) modalDot.style.background = 'rgba(255,255,255,0.4)';
      if (modalTitle) {
        modalTitle.textContent = errorMsg ? 'Connection Error' : 'Local Storage Mode';
        modalTitle.style.color = errorMsg ? '#F0405B' : '#F5F4F0';
      }
      if (modalSub) {
        modalSub.textContent = errorMsg || 'Changes stay on this device only. Connect Firebase below for live sync.';
        modalSub.style.color = 'var(--text-dim)';
      }
    }
  }

  listenToSchoolCloud(schId) {
    if (!this.cloudEnabled || !this.cloudDb || !schId) return;

    // Detach previous listener if switching schools
    if (this.currentListeningSchoolId && this.cloudListener) {
      try {
        this.cloudDb.ref('schools/' + this.currentListeningSchoolId).off('value', this.cloudListener);
      } catch (e) {}
    }

    this.currentListeningSchoolId = schId;
    const ref = this.cloudDb.ref('schools/' + schId);

    this.cloudListener = ref.on('value', (snapshot) => {
      const val = snapshot.val();
      if (!val) return;
      this.normalizeSchool(val);

      const currentLocal = JSON.stringify(this.schools[schId] || {});
      const incoming = JSON.stringify(val);
      if (currentLocal === incoming) return;

      this.isRemoteUpdate = true;
      this.schools[schId] = val;
      localStorage.setItem('housecup_saas_schools', JSON.stringify(this.schools));

      // Refresh UI with real-time incoming changes
      this.updateSchoolUI();
      this.renderScoreboard();
      this.renderActivity();
      this.populateHouseFilters();
      if (document.getElementById('screen-admin').classList.contains('active')) {
        this.renderAdminAll();
      }
      this.showToast('Scoreboard updated live from Cloud!');
      this.isRemoteUpdate = false;
    });
  }

  syncSchoolToCloud(schId) {
    if (!this.cloudEnabled || !this.cloudDb || !schId || this.isRemoteUpdate) return;
    const sch = this.schools[schId];
    if (!sch) return;

    try {
      this.normalizeSchool(sch);
      this.cloudDb.ref('schools/' + schId).set(sch);
    } catch (e) {
      console.warn('Cloud write failed:', e);
    }
  }

  openSyncModal() {
    // Non-clickable status badge
  }

  closeSyncModal() {
    // Non-clickable status badge
  }

  saveCloudSyncConfig() {
    const input = document.getElementById('sync-firebase-config-input');
    const val = (input.value || '').trim();
    if (!val) {
      alert('Please enter your Firebase Database URL or configuration JSON.');
      return;
    }

    localStorage.setItem('housecup_saas_firebase_config', val);
    this.initCloudSync();
    if (this.cloudEnabled) {
      if (this.activeSchoolId) {
        this.syncSchoolToCloud(this.activeSchoolId);
        this.listenToSchoolCloud(this.activeSchoolId);
      }
      this.showToast('Connected to Cloud Database! Real-time sync active.');
      this.closeSyncModal();
    } else {
      alert('Could not connect with the provided configuration. Please check your Firebase Database URL or JSON.');
    }
  }

  disconnectCloudSync() {
    localStorage.setItem('housecup_saas_firebase_config', 'disabled');
    if (this.cloudDb && this.currentListeningSchoolId && this.cloudListener) {
      try {
        this.cloudDb.ref('schools/' + this.currentListeningSchoolId).off('value', this.cloudListener);
      } catch (e) {}
    }
    this.cloudEnabled = false;
    this.cloudDb = null;
    this.cloudListener = null;
    this.currentListeningSchoolId = null;
    this.updateCloudStatusUI(false);
    this.showToast('Disconnected from Cloud Sync. Using local storage.');
  }

  // --- Modals & Toast ---
  openModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('open');
  }

  closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('open');
  }

  showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }
}

// Global initialization
const app = new HouseCupApp();
window.app = app;
