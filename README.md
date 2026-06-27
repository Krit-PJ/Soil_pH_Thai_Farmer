# Thai Farm Soil pH Field Index System — MVP v0.1

ระบบ MVP สำหรับบันทึกค่า pH/EC น้ำและดินสกัดด้วยน้ำในแปลง เก็บข้อมูลลง Google Sheets/Drive ผ่าน Google Apps Script และใช้งาน Frontend ผ่าน GitHub Pages

## Architecture

```text
Mobile Browser / PWA
  -> GitHub Pages static frontend
  -> Google Apps Script Web App API
  -> Google Sheets: Farmers, Plots, Measurements, Recommendations
  -> Google Drive: Field photos
```

## Contents

```text
frontend/      Static web app for GitHub Pages
apps-script/   Google Apps Script backend API
sample-data/   Mock data for testing
rules/         Rule table seed
```

## Quick Start

### 1) Google Sheets
1. Upload/import `Thai_Farm_Soil_pH_Database_MVP_v0.1.xlsx` to Google Drive.
2. Open it as Google Sheets.
3. Copy the spreadsheet ID from URL:
   `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`

### 2) Google Drive Folder
1. Create a folder for photos, e.g. `02_Field_Photos`.
2. Copy folder ID from URL:
   `https://drive.google.com/drive/folders/<DRIVE_FOLDER_ID>`

### 3) Google Apps Script
1. Go to https://script.google.com
2. Create new project.
3. Paste `apps-script/Code.gs` into Apps Script.
4. Replace `SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, and `API_TOKEN`.
5. Run `initializeDatabase()` once.
6. Deploy > New deployment > Web app.
   - Execute as: Me
   - Who has access: Anyone
7. Copy Web App URL ending in `/exec`.

### 4) Frontend
1. Open `frontend/config.js`.
2. Replace `YOUR_APPS_SCRIPT_WEB_APP_URL` with Apps Script Web App URL.
3. Replace `CHANGE_ME_TOKEN` with the same token used in Apps Script.
4. Push frontend files to GitHub.
5. Enable GitHub Pages from repository Settings.

## MVP Limitations

- This version uses rule-based recommendations, not AI-generated advice.
- Photo upload is compressed client-side and sent as base64; keep photo size small.
- Cross-origin Apps Script POST uses `no-cors`; the browser cannot confirm server response. The app stores a local backup for safety.
- Not for final lime/fertilizer rate recommendation. Abnormal results should trigger re-measurement or lab confirmation.

## Next Version

- Read existing farmers/plots from backend.
- Add duplicate measurement validation.
- Add baseline per plot/zone.
- Add dashboard and report export.
- Add expert review mode.
