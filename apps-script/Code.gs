/**
 * Thai Farm Soil pH Field Index System — Apps Script API v0.1
 *
 * Setup:
 * 1) Replace SPREADSHEET_ID, DRIVE_FOLDER_ID, API_TOKEN.
 * 2) Run initializeDatabase() once.
 * 3) Deploy as Web App:
 *    Execute as: Me
 *    Who has access: Anyone
 */

const SPREADSHEET_ID = 'PASTE_SPREADSHEET_ID_HERE';
const DRIVE_FOLDER_ID = 'PASTE_DRIVE_FOLDER_ID_HERE';
const API_TOKEN = 'CHANGE_ME_TOKEN';

const SHEETS = {
  FARMERS: 'Farmers',
  PLOTS: 'Plots',
  MEASUREMENTS: 'Measurements',
  RECOMMENDATIONS: 'Recommendations',
  SETTINGS: 'Settings'
};

const HEADERS = {
  Farmers: ['farmer_id','farmer_name','phone','province','district','tambon','user_type','created_at','status'],
  Plots: ['plot_id','farmer_id','plot_name','crop','plot_area_rai','soil_texture_simple','water_source_main','irrigation_type','main_problem','gps_lat','gps_lng','created_at','status'],
  Measurements: ['measurement_id','farmer_id','plot_id','measured_at','crop','crop_stage','soil_depth','water_source','recent_event','ph_water','ec_water','ph_soil_fw','ec_soil_fw','delta_ph','delta_ec','gps_lat','gps_lng','photo_url','operator_name','data_quality_flag','note','app_version','ratio','soil_mass_g','water_volume_ml'],
  Recommendations: ['recommendation_id','measurement_id','status','issue_type','recommendation_text','next_action','next_action_days','confidence_level','created_at'],
  Settings: ['key','value','note']
};

function initializeDatabase() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(HEADERS).forEach(name => {
    const sheet = getOrCreateSheet_(ss, name);
    ensureHeader_(sheet, HEADERS[name]);
  });
  seedSettings_(ss.getSheetByName(SHEETS.SETTINGS));
}

function doGet(e) {
  return json_({ ok: true, app: 'Thai Farm Soil pH Field Index API', version: '0.1.0', time: new Date().toISOString() });
}

function doPost(e) {
  try {
    const body = parseBody_(e);
    if (!body || body.token !== API_TOKEN) {
      return json_({ ok: false, error: 'Unauthorized or invalid token' });
    }
    if (body.action === 'saveMeasurement') {
      const result = saveMeasurement_(body.data || {});
      return json_({ ok: true, result: result });
    }
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: err.message, stack: err.stack });
  }
}

function saveMeasurement_(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  initializeIfNeeded_(ss);

  const farmerId = upsertFarmer_(ss, data);
  const plotId = upsertPlot_(ss, data, farmerId);
  const measurementId = makeId_('M');
  const recommendationId = makeId_('RCM');
  const now = new Date();

  const deltaPh = number_(data.delta_ph, number_(data.ph_soil_fw) - number_(data.ph_water));
  const deltaEc = number_(data.delta_ec, number_(data.ec_soil_fw) - number_(data.ec_water));
  const dataQuality = getDataQuality_(data);
  const photoUrl = savePhoto_(data.photo_base64, measurementId);
  const recommendation = evaluateRecommendation_(data, deltaEc);

  appendObject_(ss.getSheetByName(SHEETS.MEASUREMENTS), HEADERS.Measurements, {
    measurement_id: measurementId,
    farmer_id: farmerId,
    plot_id: plotId,
    measured_at: data.measured_at || now.toISOString(),
    crop: data.crop || '',
    crop_stage: data.crop_stage || '',
    soil_depth: data.soil_depth || '',
    water_source: data.water_source || '',
    recent_event: data.recent_event || '',
    ph_water: numberOrBlank_(data.ph_water),
    ec_water: numberOrBlank_(data.ec_water),
    ph_soil_fw: numberOrBlank_(data.ph_soil_fw),
    ec_soil_fw: numberOrBlank_(data.ec_soil_fw),
    delta_ph: round_(deltaPh, 2),
    delta_ec: round_(deltaEc, 3),
    gps_lat: data.gps_lat || '',
    gps_lng: data.gps_lng || '',
    photo_url: photoUrl,
    operator_name: data.operator_name || data.farmer_name || '',
    data_quality_flag: dataQuality,
    note: data.note || '',
    app_version: data.app_version || '',
    ratio: data.ratio || '1:2.5',
    soil_mass_g: data.soil_mass_g || 20,
    water_volume_ml: data.water_volume_ml || 50
  });

  appendObject_(ss.getSheetByName(SHEETS.RECOMMENDATIONS), HEADERS.Recommendations, {
    recommendation_id: recommendationId,
    measurement_id: measurementId,
    status: recommendation.status,
    issue_type: recommendation.issue_type,
    recommendation_text: recommendation.recommendation_text,
    next_action: recommendation.next_action,
    next_action_days: recommendation.next_action_days,
    confidence_level: recommendation.confidence_level,
    created_at: now.toISOString()
  });

  return { farmer_id: farmerId, plot_id: plotId, measurement_id: measurementId, recommendation_id: recommendationId, photo_url: photoUrl };
}

function upsertFarmer_(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.FARMERS);
  const phone = String(data.phone || '').trim();
  const name = String(data.farmer_name || '').trim() || 'ไม่ระบุชื่อ';
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const phoneIdx = headers.indexOf('phone');
  const idIdx = headers.indexOf('farmer_id');
  if (phone && phoneIdx >= 0) {
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][phoneIdx]).trim() === phone) return values[i][idIdx];
    }
  }
  const farmerId = makeId_('F');
  appendObject_(sheet, HEADERS.Farmers, {
    farmer_id: farmerId,
    farmer_name: name,
    phone: phone,
    province: data.province || '',
    district: data.district || '',
    tambon: data.tambon || '',
    user_type: data.user_type || 'เกษตรกร',
    created_at: new Date().toISOString(),
    status: 'active'
  });
  return farmerId;
}

function upsertPlot_(ss, data, farmerId) {
  const sheet = ss.getSheetByName(SHEETS.PLOTS);
  const plotName = String(data.plot_name || '').trim() || 'แปลงไม่ระบุชื่อ';
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const farmerIdx = headers.indexOf('farmer_id');
  const plotNameIdx = headers.indexOf('plot_name');
  const idIdx = headers.indexOf('plot_id');
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][farmerIdx]) === farmerId && String(values[i][plotNameIdx]).trim() === plotName) return values[i][idIdx];
  }
  const plotId = makeId_('P');
  appendObject_(sheet, HEADERS.Plots, {
    plot_id: plotId,
    farmer_id: farmerId,
    plot_name: plotName,
    crop: data.crop || '',
    plot_area_rai: data.plot_area_rai || '',
    soil_texture_simple: data.soil_texture_simple || 'ไม่รู้',
    water_source_main: data.water_source || data.water_source_main || '',
    irrigation_type: data.irrigation_type || '',
    main_problem: data.main_problem || '',
    gps_lat: data.gps_lat || '',
    gps_lng: data.gps_lng || '',
    created_at: new Date().toISOString(),
    status: 'active'
  });
  return plotId;
}

function evaluateRecommendation_(data, deltaEc) {
  const ph = number_(data.ph_soil_fw);
  const ecWater = number_(data.ec_water);
  const recent = String(data.recent_event || '');
  if (isNaN(ph) || isNaN(ecWater) || isNaN(number_(data.ph_water)) || isNaN(number_(data.ec_soil_fw))) {
    return rec_('วัดซ้ำ', 'ข้อมูลไม่ครบ', 'ข้อมูล pH/EC ยังไม่ครบ กรุณาตรวจและบันทึกใหม่', 'วัดซ้ำ', 0, 'low');
  }
  if (recent.indexOf('เพิ่งใส่ปุ๋ย') >= 0) {
    return rec_('วัดซ้ำ', 'ค่าหลังใส่ปุ๋ยอาจแกว่ง', 'เพิ่งใส่ปุ๋ย ค่า pH/EC อาจเปลี่ยนชั่วคราว ควรวัดซ้ำอีก 3–7 วัน', 'วัดซ้ำ', 7, 'medium');
  }
  if (ph < 5.0) return rec_('ส่งตรวจเพิ่ม', 'pH ต่ำ', 'ค่า pH ต่ำมาก ควรส่งตรวจดินมาตรฐานก่อนตัดสินใจใส่ปูน', 'ส่ง lab', 0, 'medium');
  if (ph < 5.5) return rec_('เฝ้าระวัง', 'pH ต่ำ', 'ค่า pH ต่ำกว่าช่วงเป้าหมาย ควรวัดซ้ำอีก 7 วัน และตรวจเหตุการณ์ฝน/ปุ๋ยก่อนวัด', 'วัดซ้ำ', 7, 'medium');
  if (ph > 7.2) return rec_('เฝ้าระวัง', 'pH สูง', 'ค่า pH สูง ควรตรวจแหล่งน้ำ และเฝ้าระวังการขาด Fe, Zn, Mn', 'ตรวจน้ำ', 0, 'medium');
  if (ecWater > 0.75) return rec_('เฝ้าระวัง', 'EC น้ำสูง', 'ค่า EC ของน้ำสูง น้ำอาจเป็นแหล่งความเค็ม ควรวัดซ้ำและตรวจแหล่งน้ำ', 'ตรวจน้ำ', 0, 'medium');
  if (deltaEc > 0.5) return rec_('เฝ้าระวัง', 'EC ดินสูง', 'เมื่อดินสัมผัสน้ำแล้ว EC เพิ่มมาก อาจมีเกลือหรือปุ๋ยตกค้าง ควรวัดซ้ำหลังให้น้ำหรือหลังฝน', 'วัดซ้ำ', 7, 'medium');
  return rec_('ปกติ', 'ปกติ', 'ค่า pH/EC อยู่ในช่วงใช้งานได้ ให้ติดตามต่อเนื่องตามรอบวัดของแปลงนี้', 'ไม่ต้องทำ', 0, 'medium');
}

function rec_(status, issue, text, action, days, confidence) {
  return { status: status, issue_type: issue, recommendation_text: text, next_action: action, next_action_days: days, confidence_level: confidence };
}

function getDataQuality_(data) {
  const required = ['ph_water','ec_water','ph_soil_fw','ec_soil_fw'];
  for (const k of required) if (data[k] === '' || data[k] === undefined || data[k] === null || isNaN(number_(data[k]))) return 'incomplete';
  const recent = String(data.recent_event || '');
  if (recent.indexOf('เพิ่งใส่ปุ๋ย') >= 0 || String(data.water_source || '').indexOf('น้ำผสมปุ๋ย') >= 0) return 'warning';
  return 'complete';
}

function savePhoto_(base64, measurementId) {
  if (!base64 || String(base64).length < 100) return '';
  try {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const parts = String(base64).split(',');
    const meta = parts[0] || '';
    const data = parts[1] || parts[0];
    const mimeMatch = meta.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bytes = Utilities.base64Decode(data);
    const blob = Utilities.newBlob(bytes, mime, measurementId + '.jpg');
    const file = folder.createFile(blob);
    return file.getUrl();
  } catch (err) {
    return 'PHOTO_UPLOAD_ERROR: ' + err.message;
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  const text = e.postData.contents;
  try { return JSON.parse(text); } catch (err) { return e.parameter || {}; }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function appendObject_(sheet, headers, obj) {
  const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
  sheet.appendRow(row);
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function ensureHeader_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn() || 1)).getValues()[0];
  const hasHeader = current.some(v => String(v || '').trim() !== '');
  if (!hasHeader) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function initializeIfNeeded_(ss) {
  Object.keys(HEADERS).forEach(name => {
    const sheet = getOrCreateSheet_(ss, name);
    if (sheet.getLastRow() === 0) ensureHeader_(sheet, HEADERS[name]);
  });
}

function seedSettings_(sheet) {
  if (sheet.getLastRow() > 1) return;
  const rows = [
    ['default_ratio','1:2.5','MVP ratio'],
    ['soil_mass_g','20','grams'],
    ['water_volume_ml','50','milliliters'],
    ['ph_low_watch','5.5','initial screening threshold'],
    ['ph_low_critical','5.0','send to lab threshold'],
    ['ph_high_watch','7.2','initial screening threshold'],
    ['ec_water_watch','0.75','dS/m'],
    ['delta_ec_watch','0.50','dS/m']
  ];
  sheet.getRange(2, 1, rows.length, 3).setValues(rows);
}

function makeId_(prefix) {
  return prefix + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss') + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
}
function number_(v, fallback) { const n = parseFloat(v); return isNaN(n) ? fallback : n; }
function numberOrBlank_(v) { const n = parseFloat(v); return isNaN(n) ? '' : n; }
function round_(n, p) { if (isNaN(n)) return ''; return Math.round(n * Math.pow(10, p)) / Math.pow(10, p); }
