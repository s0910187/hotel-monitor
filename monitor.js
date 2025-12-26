const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

// 飯店設定
const HOTEL_CODE = "5871f90713dc5a6a2736f2d44750cbcc";
const ROOM_KEYWORDS = [
  'フォースルーム',
  'フォース',
  'クアッドルーム',
  'クアッド',
  '四人房',
  '4人房',
  'Quad room',
  'Quad Room',
  'QUAD ROOM',
  'quad room'
];
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
    `&order=recommended&is_including_occupied=false&mcp_currency=JPY&lang=ja-JP`;
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
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: 'ja-JP',
    extraHTTPHeaders: {
      'Accept-Language': 'ja-JP,ja;q=0.9,zh-TW;q=0.8,zh;q=0.7,en-US;q=0.6,en;q=0.5'
    }
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

    console.log(`\n🔍 [${i + 1}/${CHECKIN_DATES.length - 1}] 正在檢查 ${checkin} ~ ${checkout} ...`);

    let data = null;
    // 策略：優先嘗試 JPY，若失敗則嘗試 TWD
    const currenciesToTry = ['JPY', 'TWD'];

    for (const curr of currenciesToTry) {
      const url = buildUrl(checkin, checkout, curr);
      console.log(`  🌐 嘗試幣別: ${curr}`);

      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
        await page.waitForTimeout(8000); // 等待頁面穩定

        // 檢查當前幣別並切換 (如果需要)
        const currentCurr = await page.evaluate(() => {
          const btn = document.querySelector('button.navbar-button.px-2.mr-1, .multiple-currency button');
          return btn ? btn.innerText.trim() : null;
        });

        // 判斷是否需要切換
        const needsSwitch = (curr === 'JPY' && currentCurr && !currentCurr.includes('¥')) ||
          (curr === 'TWD' && currentCurr && !currentCurr.includes('NT$'));

        if (needsSwitch) {
          console.log(`  🔄 當前顯示為 ${currentCurr}，正在切換至 ${curr === 'JPY' ? '¥' : 'NT$'}...`);
          try {
            await page.click('button.navbar-button.px-2.mr-1, .multiple-currency button');
            await page.waitForSelector('.modal-content, .currency-modal', { timeout: 5000 });

            const targetText = curr === 'JPY' ? '¥' : 'NT$';
            const clicked = await page.evaluate((txt) => {
              const buttons = Array.from(document.querySelectorAll('button.currency-btn'));
              const target = buttons.find(b => b.innerText.includes(txt));
              if (target) {
                target.click();
                return true;
              }
              return false;
            }, targetText);

            if (clicked) {
              await page.waitForLoadState('networkidle');
              await page.waitForTimeout(5000); // 切換幣別後等待較長時間
              console.log(`  ✅ 幣別切換完成`);
            } else {
              console.log(`  ⚠️ 找不到 ${targetText} 切換按鈕`);
            }
          } catch (e) {
            console.log(`  ❌ 切換幣別失敗: ${e.message}`);
          }
        }

        data = await page.evaluate(({ keywords, targetCurr }) => {
          try {
            // 尋找包含房型關鍵字的元素
            const allElements = Array.from(document.querySelectorAll('*'));
            let foundEl = null;
            for (const el of allElements) {
              if (el.children.length === 0 && keywords.some(kw => el.innerText && el.innerText.includes(kw))) {
                foundEl = el;
                break;
              }
            }

            if (!foundEl) return { error: "找不到房型關鍵字" };

            // 向上尋找包含價格或狀態的卡片容器
            let targetRoom = foundEl;
            for (let i = 0; i < 8; i++) {
              if (targetRoom.parentElement && (
                targetRoom.innerText.includes("¥") ||
                targetRoom.innerText.includes("NT$") ||
                targetRoom.innerText.includes("$") ||
                targetRoom.innerText.includes("円") ||
                targetRoom.innerText.includes("Sold Out") ||
                targetRoom.innerText.includes("満室")
              )) {
                break;
              }
              if (targetRoom.parentElement) targetRoom = targetRoom.parentElement;
            }

            const text = targetRoom.innerText || "";
            const availableSigns = ["空室あり", "残り", "left", "予約する", "Book", "選擇", "Select"];
            const soldOutSigns = ["滿房", "滿室", "満室", "空室なし", "Sold Out", "No rooms available", "受付終了", "予約不可"];

            const hasAvailable = availableSigns.some(kw => text.includes(kw));
            const hasSoldOut = soldOutSigns.some(kw => text.includes(kw));

            let isAvailable = hasAvailable;
            if (!hasAvailable && hasSoldOut) isAvailable = false;
            if (!hasAvailable && !hasSoldOut) isAvailable = text.includes("¥") || text.includes("NT$") || text.includes("$") || text.includes("円");

            // 搜尋價格
            const pricePatterns = [
              { p: /NT\$\s*([\d,]+(?:\.\d+)?)/i, c: 'TWD' },
              { p: /TWD\s*([\d,]+(?:\.\d+)?)/i, c: 'TWD' },
              { p: /¥\s*([\d,]+)/, c: 'JPY' },
              { p: /([\d,]+)\s*円/, c: 'JPY' },
              { p: /JPY\s*([\d,]+)/i, c: 'JPY' },
              { p: /\$\s*([\d,]+(?:\.\d+)?)/, c: 'USD' }
            ];

            let foundPrice = null;
            let foundCurr = null;

            const elementsToSearch = [targetRoom, ...Array.from(targetRoom.querySelectorAll('*'))];
            for (const el of elementsToSearch) {
              if (!el || !el.innerText) continue;
              const t = el.innerText;
              for (const item of pricePatterns) {
                const m = t.match(item.p);
                if (m && m[1]) {
                  const val = parseFloat(m[1].replace(/,/g, ''));
                  if (val > 5 && val !== 2026) {
                    // 優先權：目標幣別 > JPY > TWD > USD
                    const priority = { [targetCurr]: 4, 'JPY': 3, 'TWD': 2, 'USD': 1 };
                    const currentP = priority[item.c] || 0;
                    const foundP = priority[foundCurr] || 0;

                    if (!foundPrice || currentP > foundP || (currentP === foundP && val < foundPrice)) {
                      foundPrice = val;
                      foundCurr = item.c;
                    }
                  }
                }
              }
            }

            return { isAvailable, price: foundPrice, currency: foundCurr };
          } catch (e) {
            return { error: e.message };
          }
        }, { keywords: ROOM_KEYWORDS, targetCurr: curr });

        if (data.isAvailable && data.price) {
          if (data.currency === curr) {
            break; // 成功抓到目標幣別
          } else if (data.currency === 'USD') {
            console.log(`  ⚠️ 抓到 USD 價格 ($${data.price})，嘗試切換備援...`);
            continue;
          } else if (data.currency === 'TWD' && curr === 'JPY') {
            continue;
          }
        } else if (data.isAvailable && !data.price) {
          console.log(`  ⚠️ 未抓到價格，嘗試切換備援...`);
          continue;
        } else {
          break;
        }
      } catch (err) {
        console.error(`  ❌ ${curr} 嘗試失敗:`, err.message);
      }
    }

    if (!data || data.error) {
      console.log(`  ⚠️  ${data?.error || "抓取失敗"}`);
      results[checkin] = { isAvailable: false, price: null, currency: null };
    } else {
      const currencyLabel = data.currency === 'JPY' ? '¥' : (data.currency === 'TWD' ? 'NT$' : '');
      console.log(`  📊 結果: 可訂=${data.isAvailable}, 價格=${currencyLabel}${data.price ?? '未知'}`);
      results[checkin] = { isAvailable: data.isAvailable, price: data.price, currency: data.currency };

      const prev = lastState[checkin];
      const priceDisplay = data.price ? `${currencyLabel}${data.price.toLocaleString()}` : "未知";

      if (data.isAvailable && (!prev || !prev.isAvailable)) {
        notifications.push(`【空房釋出】${checkin} 價格：${priceDisplay}`);
      } else if (data.isAvailable && prev?.isAvailable && data.price && prev.price && data.currency === prev.currency && data.price < prev.price) {
        notifications.push(`【價格下降】${checkin} ${currencyLabel}${prev.price.toLocaleString()} → ${priceDisplay}`);
      }
    }
    await page.waitForTimeout(1000);
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
      const currencyLabel = info.currency === 'JPY' ? '¥' : (info.currency === 'TWD' ? 'NT$' : '');
      const price = info.price ? `${currencyLabel}${info.price.toLocaleString()}` : "未知";
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
      const currencyLabel = info.currency === 'JPY' ? '¥' : (info.currency === 'TWD' ? 'NT$' : '');
      const price = info.price ? `${currencyLabel}${info.price.toLocaleString()}` : '未知';
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
