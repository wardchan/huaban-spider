const request = require('superagent');
const path = require('path');
const fse = require('fs-extra');
const charset = require('superagent-charset');
const PQueue = require('p-queue');
const sanitize = require('sanitize-filename');
const extend = require('node.extend');
const customConfig = require('./config');

charset(request);

const config = {
  cookie: '',
  outputPath: path.join(__dirname, 'huaban'),
  profileID: '',
  concurrency: 5,
  appendDescToFileName: false,
};
extend(config, customConfig);

const queue = new PQueue({
  concurrency: config.concurrency,
});
queue.onEmpty().then(() => {
  console.log('Queue is empty.');
});
queue.onIdle().then(() => {
  console.log('Queue is idle.');
});

const requestHeader = {
  'Cookie': config.cookie,
  'Accept': 'application/json',
  'X-Request': 'JSON',
  'X-Requested-With': 'XMLHttpRequest',
};

const bucketURLMap = {
  'muse-img': 'muse-img.b0.upaiyun.com',
  'hbimg': 'hbimg.b0.upaiyun.com',
  'hbimg_http': 'img.hb.aicdn.com',
  'hbimg-other': 'hbimg-other.b0.upaiyun.com',
};

const fileExtNameMap = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/pjpeg': 'jpg',
  'image': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
};

let total = 0;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
};

async function crawlBoard(max) {
  const url = `http://login.meiwu.co/${config.profileID}/?limit=50&wfl=1${max ? 'max=' + max : ''}`
  const resp = await request.get(url).set(requestHeader);
  const respJSON = JSON.parse(resp.text);
  const boardArr = respJSON.user.boards;

  for (let index in boardArr) {
    const currentBoard = boardArr[index];
    await crawlPin(currentBoard);
  }

  if (boardArr.length >= 50) {
    await crawlBoard(boardArr[49].board_id);
  }
};

async function crawlPin(board, max) {
  const url = `http://login.meiwu.co/boards/${board.board_id}/?limit=20&wfl=1${max ? '&max=' + max : ''}`;

  console.log(`Crawling pin for board ${board.title}, URL=${url}`);

  const resp = await request.get(url).set(requestHeader);
  const respJSON = JSON.parse(resp.text);
  const pinArr = respJSON.board.pins;

  for (let index in pinArr) {
    total ++;
    const pin = pinArr[index];
    const fileExt = fileExtNameMap[pin.file.type.split(';')[0]];
    const fileName = `${pin.pin_id}${config.appendDescToFileName ? '-' + sanitize(pin.raw_text) : ''}.${fileExt}`;
    const targetFilePath = path.join(config.outputPath, board.title, fileName);
    queue.add(() => download(pin, targetFilePath)).then(() => {
      const msg = `Download success for ${fileName}, fileType=${pin.file.type}, queue-size=${queue.size}, pending-size=${queue.pending}, total=${total}`;
      console.log(msg);
    });
  }

  await sleep(1000);

  if (pinArr.length >= 20) {
    await crawlPin(board, pinArr[19].pin_id);
  }
};

async function download(pin, targetFilePath) {
  const file = pin.file;
  const resp = await request.get(`http://${bucketURLMap[file.bucket]}/${file.key}`);
  return await fse.outputFile(targetFilePath, resp.body);
};

(async () => {
  crawlBoard();
})();