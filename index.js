const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const fs = require('fs');
const { google } = require('googleapis');
const moment = require('moment');

const app = express();
const PORT = process.env.PORT || 5000; // 환경 변수 또는 기본값 사용

app.use(cors());
app.use(bodyParser.json());

/* ------------------- Python 스크립트 실행 엔드포인트 ------------------- */
app.get('/run-python/:slug', (req, res) => {
  const slug = req.params.slug;

  // Python 스크립트 실행
  exec(`python script.py ${slug}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return res.status(500).json({ error: 'Python script execution error' });
    }
    if (stderr) {
      console.error(`Stderr: ${stderr}`);
      return res.status(500).json({ error: stderr });
    }

    console.log(`Python Output: ${stdout.trim()}`);
    res.json({ result: stdout.trim() });
  });
});

/* ------------------- Google Sheets API + 캐시 ------------------- */

// Google Sheets API 인증
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, // 구글 API 인증 파일 경로
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

// Google Sheets 정보
const spreadsheetId = '1SqlqUq05SyMU3BC2BYYIT67fdW5M5vgq4y41bByR3iE'; // 스프레드시트 ID
const range = 'data!A1:E100'; // 데이터 범위

// 캐시 파일 경로
const cacheFile = './sheets_cache.json';

/* --- Google Sheets 데이터 가져오기 --- */
// Google Sheets API를 호출하는 함수 //
async function fetchGoogleSheetData() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return response.data.values;
}

/* --- 캐시 저장 및 로드 --- */
function saveCache(data) {
  const cacheData = {
    timestamp: moment().toISOString(),
    data,
  };
  fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
}

function loadCache() {
  if (fs.existsSync(cacheFile)) {
    const cachedData = JSON.parse(fs.readFileSync(cacheFile));
    return cachedData;
  }
  return null;
}

/* ------------------- API 엔드포인트 ------------------- */

/* ✅ 캐시된 Google Sheets 데이터 제공 (API key 보호) */
app.get('/google-sheets/:slug', async (req, res) => {
  const slug = req.params.slug;

  try {
    const data = await fetchGoogleSheetData(); // Google Sheets API 호출
    const headers = data[0];
    const slugIndex = headers.indexOf("slug");

    const matchedRow = data.find((row, index) => index !== 0 && row[slugIndex] === slug);

    if (matchedRow) {
      res.json({
        range: "Sheet1!A1:E100",
        majorDimension: "ROWS",
        values: [headers, matchedRow]
      });
    } else {
      res.status(404).json({ error: "No data found for the given slug." });
    }
  } catch (error) {
    console.error("Error serving cached data:", error);
    res.status(500).json({ error: "Failed to serve cached data." });
  }
});

/* ✅ Webhook 엔드포인트 (Google Sheets 변경 감지) */
app.post('/update', async (req, res) => {
  const { slug, action, secret } = req.body;

  // Webhook 보안 검증 (비밀 키 확인)
  const expectedSecret = process.env.WEBHOOK_SECRET;
  if (secret !== expectedSecret) {
    console.warn("Unauthorized Webhook attempt detected.");
    return res.status(403).send("Unauthorized");
  }

  console.log(`Received webhook for slug: ${slug}, action: ${action}`);

  try {
    if (action === 'update') {
      const data = await fetchGoogleSheetData();
      saveCache(data);
      console.log("Cache updated after Google Sheets edit.");
      res.status(200).send("Cache updated successfully.");
    } else {
      res.status(400).send("Unsupported action.");
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).send("Failed to update cache.");
  }
});

/* ------------------- 서버 실행 ------------------- */
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
