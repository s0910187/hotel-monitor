const { chromium } = require('playwright');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// 設定檔案
const STATE_FILE = path.join(__dirname, 'last_state.json');

// 監控設定
const HOTEL_URL = 'https://www.daiwaroynet.jp/morioka-ekimae/';
const CHECKIN_DATES = [
  '2025-03-15',  // 修改為你要監控的入住日期
  '2025-03-16',
  '2025-03-17',
];

// 郵件設定
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const MAIL_TO = process.env.MAIL_TO;

// 讀取上次狀態
function loadLastState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.log('無法讀取上次狀態:', error.message);
  }
  return {};
}

// 儲存當前狀態
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log('狀態已儲存');
  } catch (error) {
    console.error('儲存狀態失敗:', error.message);
  }
}

// 發送郵件
async function sendEmail(subject, htmlContent) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !MAIL_TO) {
    console.error('❌ 郵件設定不完整，跳過發送');
    console.log('GMAIL_USER:', GMAIL_USER ? '已設定' : '未設定');
    console.log('GMAIL_APP_PASSWORD:', GMAIL_APP_PASSWORD ? '已設定' : '未設定');
    console.log('MAIL_TO:', MAIL_TO ? '已設定' : '未設定');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });

    const mailOptions = {
      from: GMAIL_USER,
      to: MAIL_TO,
      subject: subject,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ 郵件已發送:', info.messageId);
  } catch (error) {
    console.error('❌ 郵件發送失敗:', error.message);
    throw error;
  }
}

// 檢查房間可用性
async function checkRoomAvailability() {
  console.log('🔍 開始檢查房間可用性...');
  console.log('監控日期:', CHECKIN_DATES.join(', '));

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const context = await browser.newContext({
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
    });

    const page = await context.newPage();
    
    // 設定較長的超時時間
    page.setDefaultTimeout(60000);

    console.log('正在訪問飯店網站...');
    await page.goto(HOTEL_URL, { waitUntil: 'networkidle' });

    const results = {};

    for (const checkInDate of CHECKIN_DATES) {
      console.log(`\n檢查日期: ${checkInDate}`);

      try {
        // 找到預約按鈕並點擊
        const reserveButton = page.locator('a[href*="reserve"], a:has-text("予約"), button:has-text("予約")').first();
        
        if (await reserveButton.count() > 0) {
          await reserveButton.click();
          await page.waitForTimeout(3000);
        } else {
          console.log('未找到預約按鈕，嘗試直接訪問預約頁面');
          // 嘗試直接構建預約 URL（根據實際網站調整）
          const reserveUrl = HOTEL_URL.replace(/\/$/, '') + '/reserve/';
          await page.goto(reserveUrl, { waitUntil: 'networkidle' });
        }

        // 填寫入住日期
        const dateInput = page.locator('input[type="date"], input[name*="checkin"], input[name*="arrival"]').first();
        if (await dateInput.count() > 0) {
          await dateInput.fill(checkInDate);
          await page.waitForTimeout(1000);
        }

        // 點擊搜尋按鈕
        const searchButton = page.locator('button[type="submit"], button:has-text("検索"), input[type="submit"]').first();
        if (await searchButton.count() > 0) {
          await searchButton.click();
          await page.waitForTimeout(5000);
        }

        // 檢查是否有空房
        const availableRooms = await page.locator('div.room-available, .available, button:has-text("予約可"), button:not(:has-text("満室"))').count();
        const soldOut = await page.locator('.sold-out, .full, :has-text("満室"), :has-text("空室なし")').count();

        const isAvailable = availableRooms > 0 && soldOut === 0;

        results[checkInDate] = {
          available: isAvailable,
          timestamp: new Date().toISOString(),
          availableRooms: availableRooms,
          soldOutIndicators: soldOut,
        };

        console.log(`${checkInDate}: ${isAvailable ? '✅ 有空房' : '❌ 已滿房'}`);
        console.log(`  可用房間指標: ${availableRooms}, 滿房指標: ${soldOut}`);

      } catch (error) {
        console.error(`檢查 ${checkInDate} 時發生錯誤:`, error.message);
        results[checkInDate] = {
          available: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }

      // 返回首頁準備下一次檢查
      await page.goto(HOTEL_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    }

    await browser.close();
    return results;

  } catch (error) {
    await browser.close();
    throw error;
  }
}

// 比較狀態變化
function compareStates(oldState, newState) {
  const changes = [];

  for (const date in newState) {
    const oldStatus = oldState[date]?.available || false;
    const newStatus = newState[date]?.available || false;

    if (oldStatus !== newStatus) {
      changes.push({
        date,
        from: oldStatus ? '有空房' : '已滿房',
        to: newStatus ? '有空房' : '已滿房',
        newStatus,
      });
    }
  }

  return changes;
}

// 產生 HTML 郵件內容
function generateEmailHTML(changes, currentState) {
  const now = new Date();
  const taiwanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));

  let html = `
    <h2>🏨 盛岡站前大和魯內飯店監控報告</h2>
    <p><strong>檢查時間:</strong> ${taiwanTime.toLocaleString('zh-TW')} (台灣時間)</p>
    <hr>
  `;

  if (changes.length > 0) {
    html += `<h3>🔔 狀態變更</h3><ul>`;
    changes.forEach(change => {
      const emoji = change.newStatus ? '✅' : '❌';
      const color = change.newStatus ? 'green' : 'red';
      html += `
        <li>
          <strong style="color: ${color};">${emoji} ${change.date}</strong><br>
          狀態變更: ${change.from} → ${change.to}
        </li>
      `;
    });
    html += `</ul>`;
  }

  html += `<h3>📊 目前狀態</h3><ul>`;
  for (const date in currentState) {
    const status = currentState[date];
    const emoji = status.available ? '✅' : '❌';
    const color = status.available ? 'green' : 'red';
    html += `
      <li>
        <strong style="color: ${color};">${emoji} ${date}</strong>: 
        ${status.available ? '有空房' : '已滿房'}
      </li>
    `;
  }
  html += `</ul>`;

  html += `
    <hr>
    <p style="color: #666;">
      <small>此郵件由 GitHub Actions 自動發送<br>
      飯店網址: <a href="${HOTEL_URL}">${HOTEL_URL}</a></small>
    </p>
  `;

  return html;
}

// 主程式
async function main() {
  try {
    console.log('='.repeat(60));
    console.log('🏨 盛岡站前大和魯內飯店監控系統');
    console.log('='.repeat(60));

    // 檢查房間可用性
    const currentState = await checkRoomAvailability();

    // 讀取上次狀態
    const lastState = loadLastState();

    // 比較變化
    const changes = compareStates(lastState, currentState);

    console.log('\n' + '='.repeat(60));
    console.log('📊 檢查結果');
    console.log('='.repeat(60));

    if (changes.length > 0) {
      console.log('🔔 偵測到狀態變更:');
      changes.forEach(change => {
        console.log(`  • ${change.date}: ${change.from} → ${change.to}`);
      });

      // 發送變更通知
      const subject = `🔔 飯店監控 - 偵測到房間狀態變更`;
      const html = generateEmailHTML(changes, currentState);
      await sendEmail(subject, html);

    } else {
      console.log('ℹ️  狀態無變化');

      // 每天發送一次定時報告（可選）
      const hour = new Date().getHours();
      if (hour === 8) {  // 台灣時間早上 8 點發送定時報告
        console.log('📧 發送每日定時報告');
        const subject = `📊 飯店監控 - 每日定時報告`;
        const html = generateEmailHTML([], currentState);
        await sendEmail(subject, html);
      }
    }

    // 儲存當前狀態
    saveState(currentState);

    console.log('\n✅ 監控完成');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ 執行失敗:', error);
    process.exit(1);
  }
}

// 執行主程式
main();
