const express = require('express');
// express: node.js 웹 프레임워크임 
const cors = require('cors');
// cors: Cross-Origin Resource Sharing을 활성화하여 다른 도메인에서의 요청 허용.
const bodyParser = require('body-parser');
// body-parser: 요청 본문(body)을 JSON 형태로 파싱.
const { exec } = require('child_process');
// child_process.exec: 외부 명령어를 실행함. 여기서는 python 스크립트를 실행할 때 사용 
const fs = require('fs');
// fs: 캐시 파일을 읽고 쓰는 모듈 
const { google } = require('googleapis');
// googleapis: Google API와의 통신을 위한 공식 라이브러리 
const moment = require('moment');
// moment: 캐시의 타임스탬프 관리에 사용되는, 날짜/시간 관리를 위한 라이브러리 

const app = express();
// app이라는 이름의 express 인스턴스 생성 
const PORT = process.env.PORT || 5000; 
// 서버를 실행하는 PORT 정의. 환경 변수를 사용하되, 마땅한 환경 변수가 없으면 기본값(5000) 사용

app.use(cors());
// app 인스턴스에서 cors를 활성화
app.use(bodyParser.json());
// app 인스턴스에서 본문을 json으로 파싱함 

/* 📌📌📌 --- Python 스크립트 실행 엔드포인트 ---📌📌📌*/
// 라우트: 어떤 URL로 요청이 오면, 어떤 로직을 실행할지 정하는 것
// get: 서버에서 데이터를 조회하는 것 
// post: 서버에 데이터를 전달하는 것 
app.get('/run-python/:slug', (req, res) => {
// "/run-python/slug" URL로 요청이 오면, 구문을 실행
// :slug는 동적 라우팅을 가능하게 하는 동적 파라미터임
// 어떤 slug 값이든 들어갈 수 있음
// (req, res) => {} : 콜백 함수. 클라이언트의 요청(req)을 받아 서버가 응답(res)를 보내는 로직이라는 의미 

  const slug = req.params.slug;
  // req.params는 프론트엔드로부터 요청 받은 경로의 파라미터 
  // slug 변수에, 요청 경로의 slug 값을 저장함 

  // Python 스크립트 실행
  exec(`python script.py ${slug}`, (error, stdout, stderr) => {
  // exec: node.js의 child_process 모듈에서 제공하는 메서드
  // 외부 명령어 또는 스크립트를 실행할 수 있게 해줌
  // script.py라는 스크립트를 파이썬으로 실행하고, slug를 인자로 전달함
  // 아까와 마찬가지로 콜백 함수임
  // 콜백 함수 인자로 error(실행 중 발생한 에러), stdout(출력값), stderr(표준 에러 메시지)가 포함됨 
    if (error) {
      console.error(`Error: ${error.message}`);
      return res.status(500).json({ error: 'Python script execution error' });
    }
    // error 객체가 존재한다는 것은, python 스크립트 실행 자체에 실패한 경우 
    // 예시: script.py 파일이 없거나, python이 설치되어 있지 않거나, 접근 권한이 없거나...
    if (stderr) {
      console.error(`Stderr: ${stderr}`);
      return res.status(500).json({ error: stderr });
    }
    // stderr 객체가 존재한다는 것은, python 스크립트 내부에 문제가 존재하는 경우
    // 예시: 문법에 에러가 있거나, 예외 처리가 되지 않았거나... 
    console.log(`Python Output: ${stdout.trim()}`);
    // 출력값에 공백이 있다면 제거해 콘솔에 출력하고 
    res.json({ result: stdout.trim() });
    // 출력값을 json으로 변환 
  });
});

/* 📌📌📌--- Google Sheets API + 캐시 ---📌📌📌 */

// 📌📌📌 여기부터...!!! Google Sheets API 인증
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
  try {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  console.log("Google Sheets API Response:", response.data); // ✅ 응답 데이터 로깅
  return response.data.values;
}
  catch (error) {
    console.error("Error fetching data from Google Sheets:", error); // ✅ 에러 상세 출력
    throw new Error(`Google Sheets API error: ${error.response?.status || error.message}`);
  }
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
