const state = { step: 1, maxStep: 5, lat: '', lng: '', photoBase64: '' };
const form = document.getElementById('measurementForm');
const steps = [...document.querySelectorAll('.step')];
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const submitBtn = document.getElementById('submitBtn');
const resultBox = document.getElementById('resultBox');
const saveStatus = document.getElementById('saveStatus');
document.getElementById('versionText').textContent = `MVP v${window.APP_CONFIG.VERSION}`;

init();

function init() {
  updateStep();
  getLocation();
  form.addEventListener('change', handleFormChange);
  prevBtn.addEventListener('click', () => { if (state.step > 1) { state.step--; updateStep(); } });
  nextBtn.addEventListener('click', () => { if (validateCurrentStep()) { state.step++; updateStep(); } });
  form.addEventListener('submit', handleSubmit);
  const noEvent = form.querySelector('input[name="recent_event"][value="ไม่มีเหตุการณ์พิเศษ"]');
  form.querySelectorAll('input[name="recent_event"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb !== noEvent && cb.checked) noEvent.checked = false;
      if ([...form.querySelectorAll('input[name="recent_event"]')].every(x => !x.checked)) noEvent.checked = true;
    });
  });
}

function updateStep() {
  steps.forEach(s => s.classList.toggle('active', Number(s.dataset.step) === state.step));
  document.getElementById('stepLabel').textContent = `ขั้นที่ ${state.step} จาก ${state.maxStep}`;
  document.getElementById('progressBar').style.width = `${(state.step / state.maxStep) * 100}%`;
  prevBtn.classList.toggle('hidden', state.step === 1);
  nextBtn.classList.toggle('hidden', state.step === state.maxStep);
  submitBtn.classList.toggle('hidden', state.step !== state.maxStep);
  if (state.step === 5) renderResult();
}

function validateCurrentStep() {
  const active = document.querySelector(`.step[data-step="${state.step}"]`);
  const required = [...active.querySelectorAll('[required]')];
  for (const input of required) {
    if (!input.value) {
      input.focus();
      alert('กรุณากรอกข้อมูลที่จำเป็นก่อนดำเนินการต่อ');
      return false;
    }
  }
  return true;
}

function handleFormChange(e) {
  if (e.target.name === 'photo' && e.target.files?.[0]) {
    compressImage(e.target.files[0]).then(base64 => { state.photoBase64 = base64; });
  }
}

function getFormData() {
  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());
  data.recent_event = [...form.querySelectorAll('input[name="recent_event"]:checked')].map(x => x.value).join(', ');
  data.ph_water = parseFloat(data.ph_water);
  data.ec_water = parseFloat(data.ec_water);
  data.ph_soil_fw = parseFloat(data.ph_soil_fw);
  data.ec_soil_fw = parseFloat(data.ec_soil_fw);
  data.delta_ph = round(data.ph_soil_fw - data.ph_water, 2);
  data.delta_ec = round(data.ec_soil_fw - data.ec_water, 3);
  data.measured_at = new Date().toISOString();
  data.gps_lat = state.lat;
  data.gps_lng = state.lng;
  data.photo_base64 = state.photoBase64;
  data.app_version = window.APP_CONFIG.VERSION;
  data.ratio = window.APP_CONFIG.DEFAULT_RATIO;
  data.soil_mass_g = window.APP_CONFIG.SOIL_MASS_G;
  data.water_volume_ml = window.APP_CONFIG.WATER_VOLUME_ML;
  const rec = evaluateRecommendation(data);
  data.status = rec.status;
  data.issue_type = rec.issue_type;
  data.recommendation_text = rec.recommendation_text;
  data.next_action = rec.next_action;
  data.confidence_level = rec.confidence_level;
  return data;
}

function evaluateRecommendation(d) {
  if ([d.ph_water, d.ec_water, d.ph_soil_fw, d.ec_soil_fw].some(v => Number.isNaN(v))) {
    return rec('วัดซ้ำ', 'ข้อมูลไม่ครบ', 'ข้อมูล pH/EC ยังไม่ครบ กรุณาตรวจและบันทึกใหม่', 'วัดซ้ำ', 'low');
  }
  if (d.recent_event.includes('เพิ่งใส่ปุ๋ย')) {
    return rec('วัดซ้ำ', 'ค่าหลังใส่ปุ๋ยอาจแกว่ง', 'เพิ่งใส่ปุ๋ย ค่า pH/EC อาจเปลี่ยนชั่วคราว ควรวัดซ้ำอีก 3–7 วัน', 'วัดซ้ำ', 'medium');
  }
  if (d.ph_soil_fw < 5.0) {
    return rec('ส่งตรวจเพิ่ม', 'pH ต่ำ', 'ค่า pH ต่ำมาก ควรส่งตรวจดินมาตรฐานก่อนตัดสินใจใส่ปูน', 'ส่ง lab', 'medium');
  }
  if (d.ph_soil_fw < 5.5) {
    return rec('เฝ้าระวัง', 'pH ต่ำ', 'ค่า pH ต่ำกว่าช่วงเป้าหมาย ควรวัดซ้ำอีก 7 วัน และตรวจเหตุการณ์ฝน/ปุ๋ยก่อนวัด', 'วัดซ้ำ', 'medium');
  }
  if (d.ph_soil_fw > 7.2) {
    return rec('เฝ้าระวัง', 'pH สูง', 'ค่า pH สูง ควรตรวจแหล่งน้ำ และเฝ้าระวังการขาด Fe, Zn, Mn', 'ตรวจน้ำ', 'medium');
  }
  if (d.ec_water > 0.75) {
    return rec('เฝ้าระวัง', 'EC น้ำสูง', 'ค่า EC ของน้ำสูง น้ำอาจเป็นแหล่งความเค็ม ควรวัดซ้ำและตรวจแหล่งน้ำ', 'ตรวจน้ำ', 'medium');
  }
  if (d.delta_ec > 0.5) {
    return rec('เฝ้าระวัง', 'EC ดินสูง', 'เมื่อดินสัมผัสน้ำแล้ว EC เพิ่มมาก อาจมีเกลือหรือปุ๋ยตกค้าง ควรวัดซ้ำหลังให้น้ำหรือหลังฝน', 'วัดซ้ำ', 'medium');
  }
  return rec('ปกติ', 'ปกติ', 'ค่า pH/EC อยู่ในช่วงใช้งานได้ ให้ติดตามต่อเนื่องตามรอบวัดของแปลงนี้', 'ไม่ต้องทำ', 'medium');
}
function rec(status, issue_type, recommendation_text, next_action, confidence_level) { return { status, issue_type, recommendation_text, next_action, confidence_level }; }

function renderResult() {
  const d = getFormData();
  const cls = d.status === 'ปกติ' ? 'status-normal' : d.status === 'เฝ้าระวัง' ? 'status-watch' : d.status === 'วัดซ้ำ' ? 'status-repeat' : 'status-lab';
  resultBox.innerHTML = `
    <div class="result-status ${cls}">${escapeHtml(d.status)}</div>
    <p><strong>ประเด็น:</strong> ${escapeHtml(d.issue_type)}</p>
    <p><strong>คำแนะนำ:</strong> ${escapeHtml(d.recommendation_text)}</p>
    <hr />
    <p>ΔpH = ${d.delta_ph} | ΔEC = ${d.delta_ec} dS/m</p>
  `;
}

async function handleSubmit(e) {
  e.preventDefault();
  if (!validateCurrentStep()) return;
  const payload = getFormData();
  backupLocal(payload);
  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังบันทึก...';
  try {
    if (!window.APP_CONFIG.API_URL || window.APP_CONFIG.API_URL.includes('YOUR_APPS_SCRIPT')) {
      throw new Error('ยังไม่ได้ตั้งค่า API_URL ใน config.js');
    }
    await fetch(window.APP_CONFIG.API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveMeasurement', token: window.APP_CONFIG.API_TOKEN, data: payload })
    });
    showStatus('ส่งข้อมูลแล้ว', 'ระบบส่งข้อมูลไปยัง Google Apps Script แล้ว กรุณาตรวจสอบใน Google Sheets อีกครั้ง');
    form.reset();
    state.step = 1;
    state.photoBase64 = '';
    updateStep();
  } catch (err) {
    showStatus('บันทึกสำรองในเครื่องแล้ว', `ยังส่งเข้า Google Sheets ไม่สำเร็จ: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'บันทึกข้อมูล';
  }
}

function showStatus(title, msg) {
  saveStatus.classList.remove('hidden');
  saveStatus.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(msg)}</p>`;
}

function backupLocal(payload) {
  const key = window.APP_CONFIG.LOCAL_BACKUP_KEY;
  const old = JSON.parse(localStorage.getItem(key) || '[]');
  old.push(payload);
  localStorage.setItem(key, JSON.stringify(old.slice(-100)));
}

function getLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => { state.lat = pos.coords.latitude; state.lng = pos.coords.longitude; },
    () => {},
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 1000;
        let { width, height } = img;
        if (width > height && width > max) { height = Math.round(height * max / width); width = max; }
        else if (height > max) { width = Math.round(width * max / height); height = max; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function round(n, p) { return Math.round(n * 10 ** p) / 10 ** p; }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c])); }
