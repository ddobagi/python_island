const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const fs = require('fs');
const { google } = require('googleapis');
const moment = require('moment');

const app = express();
const PORT = process.env.PORT; // 네트워크 환경 내 PORT 사용

app.use(cors());
app.use(bodyParser.json());

/* ------------------- 기존 Python 실행 엔드포인트 유지 ------------------- */
app.get('/run-python/:slug', (req, res) => {

  const slug = req.params.slug
  // script.py 실행
  exec(`python script.py ${slug}`, (error, stdout, stderr) => {
// 이유는 모르겠으나, python3이 아닌 python으로 해야 정상적으로 실행됨 
// exec 호출 시 python script.py slug 형식으로 실행하도록 설정.
// 형식을 이와 같이 설정함으로써, script.py에서 sys.argv[1]로 slug 값을 알 수 있음
    
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

/* ------------------- Google Sheets API + 캐시 기능 추가 ------------------- */

// Google Sheets API 인증 설정
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, // 구글 API 인증 파일 경로
  //livefornow2425@gmail.com 계정의 google cloud console에 세팅팅해둠
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

// Google Sheets 정보
const spreadsheetId = '1cwsuVehsWlSwF-s-fv5MLqZv9hIl5IbLyzk3RROMDj4'; // 구글 시트 ID
const range = 'Sheet1!A1:C100'; // 읽어올 범위

// 캐시 파일 경로
const cacheFile = './sheets_cache.json';
const cacheExpiryMinutes = 60 * 6; // 캐시 만료 시간 (6시간)

// Google Sheets 데이터 가져오기
async function fetchGoogleSheetData() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return response.data.values;
}

// 캐시 저장 (데이터 + 타임스탬프)
function saveCache(data) {
  const cacheData = {
    timestamp: moment().toISOString(),
    data,
  };
  fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
}

// 캐시 로드
function loadCache() {
  if (fs.existsSync(cacheFile)) {
    const cachedData = JSON.parse(fs.readFileSync(cacheFile));
    return cachedData;
  }
  return null;
}

// 캐시 유효성 검사
function isCacheValid(timestamp) {
  const cacheTime = moment(timestamp);
  const now = moment();
  const diffMinutes = now.diff(cacheTime, 'minutes');
  return diffMinutes < cacheExpiryMinutes;
}

// API 엔드포인트: Google Sheets 데이터 요청
app.get('/data', async (req, res) => {
  const refresh = req.query.refresh === 'true'; // /data?refresh=true 로 새로고침 요청

  try {
    let data;
    let source;

    const cachedData = loadCache();

    if (refresh || !cachedData || !isCacheValid(cachedData.timestamp)) {
      // 새로고침 요청이거나 캐시가 없거나 만료된 경우
      console.log('Google Sheets에서 데이터 불러오는 중...');
      data = await fetchGoogleSheetData();

      // 캐시 저장
      saveCache(data);
      source = 'Google Sheets';
    } else {
      // 유효한 캐시 사용
      console.log('캐시된 데이터를 사용 중...');
      data = cachedData.data;
      source = 'Cache';
    }

    // 📌📌📌📌📌 간단한 분석 로직 (값 * 2 예시)
    const analyzedData = data.map(row => ({
      date: row[0],
      content: row[1],
      value: Number(row[2]),
    }));

    res.json({
      source,
      lastUpdated: cachedData ? cachedData.timestamp : moment().toISOString(),
      analyzedData,
    });
  } catch (error) {
    console.error('데이터 처리 중 오류:', error);
    res.status(500).send('서버 오류 발생');
  }
});

/* ------------------- 서버 실행 ------------------- */
app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});