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

// Google Sheets API 인증
const auth = new google.auth.GoogleAuth({
// google sheets API에 접근하기 위한 인증 객체를 생성 
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  // google cloud platform 서비스 계정의 json 키 파일 경로를 지정
  // 직접 경로를 입력하는 대신, 보안을 위해 render의 환경 변수에서 키 파일 경로를 불러옴 
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  // API의 권한 범위를 설정함. 이 경우 읽기 권한을 부여.
});

const sheets = google.sheets({ version: 'v4', auth });
// google sheets API 클라이언트를 생성함 (스프레드 시트 파일을 저장하는 것인 듯듯)
// 앞서 생성한 auth 객체(인증 객체)를 전달해둠. 따라서, sheets 클라이언트가 작동하면 인증을 자연스럽게 거치게 됨 


// Google Sheets 정보
const spreadsheetId = '1SqlqUq05SyMU3BC2BYYIT67fdW5M5vgq4y41bByR3iE'; // 스프레드시트 ID
const range = 'data!A1:Z100'; // 데이터 범위

const cacheFile = './sheets_cache.json';
// 캐시 파일 경로를 설정

/* 📌📌📌--- Google Sheets 데이터 가져오기 --- 📌📌📌*/
async function fetchGoogleSheetData() {
// google sheets API를 호출하는 비동기 함수를 정의 
  try {
  const response = await sheets.spreadsheets.values.get({
  // spreadsheetID와 range를 인자로 사용하고, 
  // ~.spreadsheets.values.get: Google Sheets API의 메서드
  // 특정 시트의 데이터를 가져와 response 변수에 저장합니다 
  // await: 병렬 작업이 완료될 때까지 기다림 
    spreadsheetId,
    range,
  });
  console.log("Google Sheets API Response:", response.data); // ✅ 응답 데이터 로깅
  // google sheets API를 통해 호출되어 response 변수에 저장된 값을 출력합니다 
  return response.data.values;
  // response 변수에 저장된 데이터들이 배열 형태로 반환됩니다 
}
  catch (error) {
    console.error("Error fetching data from Google Sheets:", error); // ✅ 에러 상세 출력
    throw new Error(`Google Sheets API error: ${error.response?.status || error.message}`);
  }
  // 에러 핸들링 
}

/* -📌📌📌-- 캐시 다루기 ---📌📌📌 */
function saveCache(data) {
// 캐시 저장 함수 saveCache를 정의합니다
  const cacheData = {
    timestamp: moment().toISOString(),
    data,
    // cacheData 객체를 생성합니다. 
    // cacheData 객체는 timestamp와 data 정보를 포함합니다
    // timestamp는 moment 모듈을 이용해, 현재 시간을 ISO 형식으로 저장합니다 
    // data는 캐시로 저장할 실제 데이터입니다
    // data 예시: [ ["ID", "Name", "Email"],  ["1", "John Doe", "john@example.com"] ]
  };
  fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
  // cacheData를 JSON 문자열로 변환하고(null: 변환 규칙 사용 X, 2: 2칸 들여쓰기)
  // cacheFile 경로에 cacheData를 저장합니다('./sheets_cache.json로 앞서 설정)
  // fs.writeFileSync는 캐시를 읽고 쓰는 fs 모듈의 메서드.
  // 인자가 cacheFile과 JSON 형식의 cacheData인 것
}

function loadCache() {
// 캐시 불러오기 함수 loadCache를 정의합니다 
  if (fs.existsSync(cacheFile)) {
  // fs.existsSync 메서드를 통해 확인했을 때
  // cacheFile 경로에 캐시 파일이 존재한다면 
    const cachedData = JSON.parse(fs.readFileSync(cacheFile));
    // cacheFile 경로의 캐시 파일을 fs.readFileSync 메서드로 읽어와
    // JSON 형태로 변환해 cachedData 변수에 저장해 반환합니다 
    return cachedData;
  }
  return null;
  // cacheFile 경로에 캐시 파일이 존재하지 않으면 null을 반환합니다 
}

/* ------------------- API 엔드포인트 ------------------- */
/* ✅ 모든 Google Sheets 데이터 제공, 🚨 정적 라우트를 우선 실행해야함🚨 */
app.get('/google-sheets/all', async (req, res) => {
  try {
    const data = await fetchGoogleSheetData();
    res.json({
      range: "Sheet1!A1:Z100",
      majorDimension: "ROWS",
      values: data
    });
    // 🚨🚨 res에 어떤 데이터를 포함시키는지에 따라, 설정 기능 등을 넣을 수 있음! 
    // 🚨🚨 1) header 2) 설정값 3) 페이지의 slug에 따라 필터링된 데이터 이렇게 구성하는 게 좋을 듯! 
  } catch (error) {
    console.error("Error fetching all Google Sheets data:", error);
    res.status(500).json({ error: "Failed to fetch all data." });
  }
});



/* ✅ 캐시된 Google Sheets 데이터 제공 (API key 보호) */
app.get('/google-sheets/:slug', async (req, res) => {
// 라우트: 어떤 URL로 요청이 오면, 어떤 로직을 실행할지 정하는 것
// .get: get 요청(서버에서 데이터 조회)를 처리하는 라우트라는 뜻
// "/google-sheets/slug" URL로 요청이 오면, 구문을 실행
// :slug는 동적 라우팅을 가능하게 하는 동적 파라미터임
// 어떤 slug 값이든 들어갈 수 있음
// (req, res) => {} : 콜백 함수.
// 클라이언트의 요청(req)을 받아 서버가 응답(res)를 보내는 로직이라는 의미
  const slug = req.params.slug;
  // req.params는 프론트엔드로부터 요청 받은 경로의 파라미터 
  // slug 변수에, 요청 경로의 slug 값을 저장함   

  try {
    const data = await fetchGoogleSheetData(); 
    // 앞서 정의한 fetchGoogleSheetData 함수를 호출하고,
    // 병렬 작업이 끝날 때까지 기다렸다가 그 결과를 data 변수에 저장
    // fetchGoogleSheetData(): 스프레드시트 내 데이터를 행과 열 그대로 저장 
    const headers = data[0];
    const toggles = data[1];
    // 첫 번째 행은 헤더로 간주함 
    const slugIndex = headers.indexOf("slug");
    // 헤더로 slug가 적혀 있는 열의 열 번호를 slugIndex 변수에 저장 

    console.log("Data fetched from Google Sheets: ", data);
    console.log("Slug Index: ", slugIndex);
    
    const matchedRow = data.find((row, index) => index !== 0 && row[slugIndex] === slug);
    // 헤더는 제외한, slugIndex 열의 데이터 중 
    // 요청 경로의 slug 값과 같은 값을 가지는 cell을 찾고,
    // 해당 cell을 data 객체이서 찾아 matchedRow 변수에 저장함 
    if (matchedRow) {
      // matchedRow 변수에 저장된 값이 있으면 
      res.json({
        range: "Sheet1!A1:Z100",
        majorDimension: "ROWS",
        values: [headers, toggles, matchedRow]
        // 위와 같은 구조의 json 파일로 결과를 반환 
      });
    } else {
      res.status(404).json({ error: "No data found for the given slug." });
      // matchedRow 변수에 저장된 값이 없으면 404 에러 표시 
    }
  } catch (error) {
    console.error("Error serving cached data:", error);
    res.status(500).json({ error: "Failed to serve cached data." });
    // try 블록 내에서 에러가 발생하면 catch (error) 구문을 통해 에러 핸들링 
  }
});


/* ✅ Webhook 엔드포인트 (Google Sheets 변경 감지) */
app.post('/update', async (req, res) => {
// 이번에는 post 요청을 처리하는 라우트
// "/update" 경로로 요청이 오면 구문 실행
// (req, res) => {} : 콜백 함수.
// 클라이언트의 요청(req)을 받아 서버가 응답(res)를 보내는 로직이라는 의미
  const { slug, action, secret } = req.body;
  // post 요청(req)의 본문(body) 데이터에서
  // slug, action, secret 필드를 추출함 
  // slug: 프론트엔드로부터 요청 받은 경로의 파라미터 
  // action: 수행할 작업(update, delete 등)
  // secret: webhook 요청의 보안을 위해 설정할 수 있는 비밀 키 

  // Webhook 보안 검증 (비밀 키 확인)
  const expectedSecret = process.env.WEBHOOK_SECRET;
  // render에 webhook_secret이라는 환경 변수(비밀 키)를 설정해둠. 이 비밀 키 불러오기. 
  if (secret !== expectedSecret) {
    // google apps script를 통해 전달되는 secret 값이 expectedSecret과 일치하지 않으면 
    console.warn("Unauthorized Webhook attempt detected.");
    return res.status(403).send("Unauthorized");
    // 접근이 차단됨 
  }

  console.log(`Received webhook for slug: ${slug}, action: ${action}`);
  // secret가 expectedSecret이 일치한다면 구문이 실행되고 로그가 출력됨 
  try {
    if (action === 'update') {
      // 요청된 액션이 업데이트라면 
      const data = await fetchGoogleSheetData();
      // fetchGoogleSheetData 함수를 호출한 결과(스프레드시트, 행과 열 그대로)를
      // data 변수에 저장합니다 
      saveCache(data);
      // data 변수에 저장된 값을, 캐시에 저장합니다 
      console.log("Cache updated after Google Sheets edit.");
      res.status(200).send("Cache updated successfully.");
      // 성공적으로 캐시가 업데이트 되었다고 로그를 출력합니다 
    } else {
      res.status(400).send("Unsupported action.");
      // 요청된 액션이 업데이트가 아니라면, 지원하지 않는 액션이라고 전달합니다 
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).send("Failed to update cache.");
    // try 블록 내에서 에러가 발생하면 에러 메시지를 출력합니다 
  }
});

/* ------------------- 서버 실행 ------------------- */
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
// express 서버를 지정된 PORT에서 실행합니다
// PORT는 앞서 설정한 대로 환경 변수 값이 사용됩니다
// 콜백함수이기는 하지만, 별다른 인자 없이 실행됩니다 