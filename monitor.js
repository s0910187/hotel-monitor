const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

// 飯店設定
const HOTEL_CODE = "5871f90713dc5a6a2736f2d44750cbcc";
const CHECKIN_DATES = [
  "2026/04/17",
  "2026/04/18",
  "2026/04/19",
  "2026/04/20",
  "2026/04/21",
  "2026/04/22"
];
const STATE_FILE = path.join(__dirname, "last_state.json");

// 環境變數設定
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const MAIL_TO = process.env.MAIL_TO;

/* ==============================
   Gmail 設定
================================ */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD
  }
});

/* ==============================
   工具函式
================================ */
function buildUrl(checkin, checkout) {
  const roomsParam = encodeURIComponent(JSON.stringify([{ adults: 4 }]));
  // 使用 TWD 顯示台幣價格（與本地端測試一致）
  return `https://reserve.daiwaroynet.jp/booking/result?code=${HOTEL_CODE}` +
    `&checkin=${encodeURIComponent(checkin)}` +
    `&checkout=${encodeURIComponent(checkout)}` +
    `&type=rooms&is_day_use=false&rooms=${roomsParam}` +
    `&order=recommended&is_including_occupied=false&mcp_currency=TWD`;
}

function loadLastState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function sendMail(subject, body) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !MAIL_TO) {
    console.error("❌ 郵件設定不完整，跳過發送");
    return;
  }

  try {
    await transporter.sendMail({
      from: `Hotel Monitor <${GMAIL_USER}>`,
      to: MAIL_TO,
      subject,
      text: body
    });
    console.log("✅ Email 寄送成功");
  } catch (error) {
    console.error("❌ Email 寄送失敗:", error.message);
    throw error;
  }
}

// 檢查是否為定時報告時間 (每天台灣時間 6:00 和 18:00)
function shouldSendDailyReport() {
  const now = new Date();
  // 轉換為台灣時間
  const taiwanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const hour = taiwanTime.getHours();
  const minute = taiwanTime.getMinutes();

  // 在 6:00-6:30 或 18:00-18:30 之間執行時發送報告
  return (hour === 6 || hour === 18) && minute < 30;
}

/* ==============================
   核心抓取邏輯
================================ */
async function checkAllDates() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process'
    ]
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  // 捕捉瀏覽器內部的 console.log
  page.on('console', msg => {
    if (msg.type() === 'log' || msg.type() === 'error') {
      console.log(`[Browser] ${msg.text()}`);
    }
  });

  const results = {};
  const lastState = loadLastState();
  const notifications = [];

  for (let i = 0; i < CHECKIN_DATES.length - 1; i++) {
    const checkin = CHECKIN_DATES[i];
    const checkout = CHECKIN_DATES[i + 1];
    const url = buildUrl(checkin, checkout);

    console.log(`\n🔍 正在抓取 ${checkin} ~ ${checkout} ...`);
    console.log(`🌐 URL: ${url}`);

    try {
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 60000
      });

      // 等待頁面完全加載
      await page.waitForTimeout(8000);

      try {
        await page.waitForSelector('body', { timeout: 5000 });
      } catch (e) {
        console.log('  ⚠️  頁面載入逾時，繼續嘗試...');
      }

      // 抓取頁面上所有可能的房型資訊
      const data = await page.evaluate(() => {
        const bodyText = document.body.innerText;

        // 嘗試找所有房型卡片
        const possibleContainers = [
          ...document.querySelectorAll('[class*="room"]'),
          ...document.querySelectorAll('[class*="Room"]'),
          ...document.querySelectorAll('[class*="card"]'),
          ...document.querySelectorAll('[class*="Card"]'),
      const data = await page.evaluate((roomType) => {
            // 1. 捕捉全頁文字以供 debug
            const fullPageText = document.body.innerText;
            console.log('全頁文字長度:', fullPageText.length);

            const currencySymbols = ['NT$', 'TWD', '¥', 'JPY', '円', '$'];
            for (const sym of currencySymbols) {
              if (fullPageText.includes(sym)) {
                const index = fullPageText.indexOf(sym);
                console.log(`發現符號 ${sym}！附近的文字: ${fullPageText.substring(index - 20, index + 40).replace(/\n/g, ' ')}`);
              }
            }

            if (fullPageText.length < 2000) {
              console.log('頁面內容過短，完整文字內容:', fullPageText.replace(/\s+/g, ' '));
            }

            const roomElements = Array.from(document.querySelectorAll('.room-item, .room_item, [class*="room-item"], [class*="RoomItem"], .room-type-item, .room_type_item'));

            let targetRoom = null;
            for (const el of roomElements) {
              const text = el.innerText;
              if (roomType.some(keyword => text.includes(keyword))) {
                targetRoom = el;
                break;
              }
            }

            // 如果沒找到特定容器，嘗試找包含關鍵字的任何大容器
            if (!targetRoom) {
              const allDivs = Array.from(document.querySelectorAll('div'));
              for (const div of allDivs) {
                if (div.children.length > 5 && roomType.some(keyword => div.innerText.includes(keyword))) {
                  targetRoom = div;
                  break;
                }
              }
            }

            if (!targetRoom) {
              return { isAvailable: false, error: "找不到四人房型" };
            }

            const roomText = targetRoom.innerText;
            const isSoldOut = roomText.includes("滿房") || roomText.includes("空室なし") || roomText.includes("Sold Out") || roomText.includes("満室");

            let price = null;

            // 強化價格搜尋：在 targetRoom 內搜尋所有包含數字且有貨幣符號的文字
            const pricePatterns = [
              /NT\$\s*([\d,]+)/i,
              /TWD\s*([\d,]+)/i,
              /([\d,]+)\s*TWD/i,
              /¥\s*([\d,]+)/,
              /([\d,]+)\s*円/,
              /JPY\s*([\d,]+)/i,
              /[¥￥円]\s*([\d,]+)/
            ];

            // 遍歷所有子元素找價格
            const allElements = Array.from(targetRoom.querySelectorAll('*'));
            for (const el of allElements) {
              const text = el.innerText.trim();
              for (const pattern of pricePatterns) {
                const match = text.match(pattern);
                if (match) {
                  const priceStr = match[1].replace(/,/g, '');
                  const parsedPrice = parseInt(priceStr);
                  if (parsedPrice > 500 && parsedPrice < 1000000 && parsedPrice !== 2026) {
                    if (!price || parsedPrice < price) { // 取最低價
                      price = parsedPrice;
                    }
                  }
                }
              }
            }

            // 如果還是沒找到，嘗試從 roomText 直接匹配
            if (!price) {
              for (const pattern of pricePatterns) {
                const match = roomText.match(pattern);
                if (match) {
                  const priceStr = match[1].replace(/,/g, '');
                  const parsedPrice = parseInt(priceStr);
                  if (parsedPrice > 500 && parsedPrice < 1000000 && parsedPrice !== 2026) {
                    price = parsedPrice;
                    break;
                  }
                }
              }
            }

            return {
              isAvailable: !isSoldOut,
              price: price,
              debugText: roomText.substring(0, 200)
            };
          });

        console.log(`  📊 結果: 可訂=${data.isAvailable}, 價格=NT$${data.price ?? '未知'}`);
        if (data.error) {
          console.log(`  ⚠️  ${data.error}`);
        }

        const prev = lastState[checkin];
        results[checkin] = { isAvailable: data.isAvailable, price: data.price };

        // 通知條件 1：空房釋出
        if (data.isAvailable && (!prev || !prev.isAvailable)) {
          const msg = `【空房釋出】${checkin} 價格：NT$${data.price ?? "未知"}`;
          notifications.push(msg);
          console.log(`  🔔 ${msg}`);
        }

        // 通知條件 2：價格下降
        if (
          data.isAvailable &&
          prev?.isAvailable &&
          data.price &&
          prev.price &&
          data.price < prev.price
        ) {
          const msg = `【價格下降】${checkin} NT$${prev.price.toLocaleString()} → NT$${data.price.toLocaleString()}`;
          notifications.push(msg);
          console.log(`  💰 ${msg}`);
        }

        // 延遲避免請求過快
        await page.waitForTimeout(2000);

      } catch (err) {
        console.error(`  ❌ ${checkin} 抓取失敗:`, err.message);
        results[checkin] = { isAvailable: false, price: null, error: err.message };
      }
    }

  await browser.close();
    saveState(results);

    // 檢查是否需要發送定時報告
    const isDailyReportTime = shouldSendDailyReport();

    if (isDailyReportTime) {
      console.log("\n📅 定時報告時間，準備發送每日報告...");

      const now = new Date();
      const taiwanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
      const reportLines = [
        `【定時報告】${taiwanTime.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`,
        "",
        "=== 盛岡站前大和魯內飯店 四人房 房況報告 ===",
        ""
      ];

      for (const [date, info] of Object.entries(results)) {
        const status = info.isAvailable ? "✅ 有空房" : "❌ 滿房";
        const price = info.price ? `NT$${info.price.toLocaleString()}` : "未知";
        reportLines.push(`${date}: ${status} | 價格: ${price}`);
      }

      reportLines.push("");
      reportLines.push("此為定時報告，每天早上6:00和晚上6:00自動發送。");
      reportLines.push("若有空房釋出或價格下降，將立即另外通知。");

      try {
        await sendMail(
          "【定時報告】盛岡站前大和魯內飯店 四人房 房況",
          reportLines.join("\n")
        );
        console.log("✅ 定時報告已發送");
      } catch (error) {
        console.error("❌ 定時報告發送失敗");
      }
    }

    // 發送變動通知
    if (notifications.length > 0) {
      console.log("\n📧 準備寄送變動通知 Email...");
      try {
        await sendMail(
          "【盛岡站前大和魯內】4人房 房況 / 價格變動通知",
          notifications.join("\n")
        );
        console.log("✅ 變動通知 Email 寄送成功");
      } catch (mailErr) {
        console.error("❌ 變動通知 Email 寄送失敗:", mailErr.message);
      }
    }

    return { results, notifications };
  }

  /* ==============================
     主程式
  ================================ */
  (async () => {
    try {
      console.log("=".repeat(60));
      console.log("🏨 盛岡站前大和魯內飯店監控系統");
      console.log("=".repeat(60));
      console.log("📅 開始檢查房型...");

      const data = await checkAllDates();

      console.log("\n" + "=".repeat(60));
      console.log("✅ 檢查完成！");
      console.log("=".repeat(60));
      console.log("\n📊 結果摘要:");

      for (const [date, info] of Object.entries(data.results)) {
        const status = info.isAvailable ? '✅ 有房' : '❌ 滿房';
        const price = info.price ? `NT$${info.price.toLocaleString()}` : '未知';
        console.log(`  ${date}: ${status} | 價格: ${price}`);
      }

      if (data.notifications.length > 0) {
        console.log("\n🔔 通知內容:");
        data.notifications.forEach(n => console.log("  📧 " + n));
      } else {
        console.log("\n💤 暫無新通知");
      }
    } catch (err) {
      console.error("❌ 執行錯誤：", err);
      process.exit(1);
    }
  })();
