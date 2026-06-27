# System Architecture MVP v0.1

## Frontend
Static PWA hosted on GitHub Pages.

## Backend
Google Apps Script Web App. Functions:
- doGet: health check
- doPost: save measurement
- initializeDatabase: create sheets and headers

## Database
Google Sheets with tables:
- Farmers
- Plots
- Measurements
- Recommendations
- Settings

## Files
Google Drive folder for field photos.

## Known Limitation
The frontend uses fetch with no-cors for Apps Script cross-origin POST. Browser cannot read the server response. The app therefore stores local backup before sending.
