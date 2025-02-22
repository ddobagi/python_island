const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT
// 로컬 서버의 PORT가 아니라, 네트워크 환경 내 PORT로 설정해야함! 

app.use(cors());
app.use(bodyParser.json());

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

    console.log(`Python Output: ${stdout.trim()}`); // Python 출력 로그
    res.json({ result: stdout.trim() });
  });
});

app.listen(PORT, () => {
  console.log("Server is running");
});