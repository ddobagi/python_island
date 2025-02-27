const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const fs = require('fs');
const moment = require('moment');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// Google Sheets API 인증
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

/* 📌📌📌--- Google Sheets 데이터 가져오기 (동적 처리) --- 📌📌📌 */
async function fetchGoogleSheetData(spreadsheetId, range) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    console.log("Google Sheets API Response:", response.data);
    return response.data.values;
  } catch (error) {
    console.error("Error fetching data from Google Sheets:", error);
    throw new Error(`Google Sheets API error: ${error.response?.status || error.message}`);
  }
}

/* 📌📌📌--- Google Sheets 데이터 API 엔드포인트 (동적 요청 지원) --- 📌📌📌 */
app.get('/google-sheets/:spreadsheetId', async (req, res) => {
  const { spreadsheetId } = req.params;
  const { range } = req.query; // URL 쿼리에서 range 값을 동적으로 받음

  if (!spreadsheetId || !range) {
    return res.status(400).json({ error: "Spreadsheet ID and range are required." });
  }

  try {
    const data = await fetchGoogleSheetData(spreadsheetId, range);
    res.json({
      range,
      majorDimension: "ROWS",
      values: data,
    });
  } catch (error) {
    console.error("Error fetching Google Sheets data:", error);
    res.status(500).json({ error: "Failed to fetch data from Google Sheets." });
  }
});

/* 📌📌📌--- 서버 실행 --- 📌📌📌 */
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
