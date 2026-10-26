const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json({ limit: '20mb' }));

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "your_verify_token_here";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN || "your_page_access_token_here";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; 
const GITHUB_REPO = process.env.GITHUB_REPO || "piyadee258910-dotcom/fb-sum-bot"; 

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let db = {};
let recentCustomers = {};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getThaiTime() {
    return new Date().toLocaleTimeString('en-GB', { 
        timeZone: 'Asia/Bangkok', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
}

function getThaiDate() {
    let formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(new Date());
}

async function sendTelegramMessage(text) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: text,
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [
                    ["พี่บอย", "มาดามแป้ง"],
                    ["ดาอี"]
                ],
                resize_keyboard: true,
                is_persistent: true
            }
        });
    } catch (err) {
        console.error("❌ ส่ง Telegram Message ไม่สำเร็จ:", err.response?.data || err.message);
    }
}

async function sendTelegramPhoto(photoUrl, caption) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
            chat_id: TELEGRAM_CHAT_ID,
            photo: photoUrl,
            caption: caption,
            parse_mode: 'HTML'
        });
    } catch (err) {
        console.error("❌ ส่ง Telegram Photo ไม่สำเร็จ:", err.response?.data || err.message);
    }
}

async function loadDataFromGitHub() {
    try {
        if (!GITHUB_TOKEN) return;
        let res = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/contents/database.json`, {
            headers: { Authorization: `token ${GITHUB_TOKEN}` }
        });
        let content = Buffer.from(res.data.content, 'base64').toString('utf8');
        db = JSON.parse(content);
        console.log("📥 โหลดข้อมูลจาก GitHub สำเร็จ!");
    } catch (err) {
        console.log("⚠ ยังไม่มีไฟล์ database.json บน GitHub");
    }
}

async function saveToGitHub() {
    if (!GITHUB_TOKEN) return;
    try {
        let path = 'database.json';
        let contentBase64 = Buffer.from(JSON.stringify(db, null, 2)).toString('base64');
        let sha = '';
        try {
            let fileRes = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
                headers: { Authorization: `token ${GITHUB_TOKEN}` }
            });
            sha = fileRes.data.sha;
        } catch (e) {}

        await axios.put(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
            message: 'Auto-update database.json via Bot',
            content: contentBase64,
            sha: sha
        }, {
            headers: { Authorization: `token ${GITHUB_TOKEN}` }
        });
    } catch (err) {
        console.error("❌ บันทึก GitHub ไม่สำเร็จ:", err.response?.data || err.message);
    }
}

loadDataFromGitHub();

async function sendMessengerMessage(recipientId, messageText) {
    try {
        if (!PAGE_ACCESS_TOKEN || PAGE_ACCESS_TOKEN === "your_page_access_token_here") return;
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: recipientId },
            message: { text: messageText }
        });
    } catch (error) {
        console.error("❌ Error sending message:", error.response?.data || error.message);
    }
}

async function sendMessengerImage(recipientId, imageUrl) {
    try {
        if (!PAGE_ACCESS_TOKEN || PAGE_ACCESS_TOKEN === "your_page_access_token_here") return;
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: recipientId },
            message: {
                attachment: {
                    type: "image",
                    payload: {
                        url: imageUrl,
                        is_reusable: true
                    }
                }
            }
        });
    } catch (error) {
        console.error("❌ Error sending image:", error.response?.data || error.message);
    }
}

async function sendLineMessage(userId, messageText) {
    if (!LINE_CHANNEL_ACCESS_TOKEN) return;
    try {
        await axios.post('https://api.line.me/v2/bot/message/push', {
            to: userId,
            messages: [{ type: 'text', text: messageText }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
            }
        });
    } catch (error) {
        console.error("❌ Error sending LINE message:", error.response?.data || error.message);
    }
}

async function sendLineImage(userId, imageUrl) {
    if (!LINE_CHANNEL_ACCESS_TOKEN) return;
    try {
        await axios.post('https://api.line.me/v2/bot/message/push', {
            to: userId,
            messages: [{
                type: 'image',
                originalContentUrl: imageUrl,
                previewImageUrl: imageUrl
            }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
            }
        });
    } catch (error) {
        console.error("❌ Error sending LINE image:", error.response?.data || error.message);
    }
}

app.get('/', (req, res) => {
    res.send("Webhook server is running successfully! 🚀");
});

app.get('/admin', (req, res) => {
    let customerListHTML = '';
    for (let psid in recentCustomers) {
        let cust = recentCustomers[psid];
        customerListHTML += `
            <div style="background: #fff; padding: 15px; margin-bottom: 12px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>ID/PSID:</strong> ${psid} <br>
                    <small style="color: #666;">ข้อความล่าสุด: ${cust.lastMessage || '-'}</small>
                </div>
                <div>
                    <button onclick="quickAction('${psid}', '..100')" style="background: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; margin-right: 5px;">+100</button>
                    <button onclick="quickAction('${psid}', '..500')" style="background: #007bff; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; margin-right: 5px;">+500</button>
                    <a href="/customer" style="background: #6c757d; color: white; text-decoration: none; padding: 8px 12px; border-radius: 5px; display: inline-block;">จัดการรายชื่อ</a>
                </div>
            </div>
        `;
    }
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Admin Quick Dashboard</title></head>
        <body style="font-family: sans-serif; background: #f0f2f5; padding: 20px; max-width: 650px; margin: auto;">
            <h2>🚀 แผงควบคุมด่วนแอดมิน</h2>
            <p>
                <a href="/customer-grid" style="color: #28a745; font-weight: bold; text-decoration: none; margin-right: 15px;">🔲 เปิดหน้าตารางด่วน (/customer-grid)</a>
                <a href="/customer" style="color: #007bff; font-weight: bold; text-decoration: none;">📋 หน้าจัดการข้อมูลทั้งหมด (/customer)</a>
            </p>
            <hr style="margin-bottom: 20px; border: 0; border-top: 1px solid #ccc;">
            ${customerListHTML || '<p style="color: #666;">ยังไม่มีประวัติลูกค้าทักเข้ามา</p>'}
            <script>
                function quickAction(psid, text) {
                    fetch('/admin-test?id=' + psid + '&text=' + encodeURIComponent(text))
                        .then(res => res.text()).then(data => { alert('สำเร็จ! ' + data); location.reload(); });
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/customer-grid', (req, res) => {
    let gridCardsHTML = '';
    
    try {
        for (let psid in db) {
            let cust = db[psid];
            // ข้ามถ้าไม่ใช่ Object หรือไม่มีข้อมูล
            if (!cust || typeof cust !== 'object') continue;
            
            let custName = cust.name ? String(cust.name) : "ยังไม่ตั้งชื่อ";
            let totalAllDays = 0;
            
            for (let date in cust) {
                if (date === 'name') continue;
                let items = cust[date];
                // เช็คว่า items เป็น Array จริงๆ ถึงจะบวกยอด
                if (Array.isArray(items)) {
                    totalAllDays += items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
                }
            }

            // Safe string สำหรับใส่ใน JavaScript onclick
            let safeName = custName.replace(/'/g, "\\'").replace(/"/g, '&quot;');

            gridCardsHTML += `
                <div class="customer-card" onclick="quickAddAmount('${psid}', '${safeName}')">
                    <div class="cust-name">${custName}</div>
                    <div class="cust-id">${psid}</div>
                    <div class="cust-total">ยอดรวม: <span>${totalAllDays.toLocaleString()}</span> ฿</div>
                </div>
            `;
        }
    } catch (err) {
        console.error("❌ Error generating grid HTML:", err);
    }

    if (!gridCardsHTML) {
        gridCardsHTML = '<p style="text-align: center; color: #888; grid-column: 1 / -1; font-size: 18px; padding: 40px;">ยังไม่มีข้อมูลลูกค้าในระบบ</p>';
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="th">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Customer Grid Dashboard</title>
            <style>
                * { box-sizing: border-box; }
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: #f4f6f9;
                    margin: 0;
                    padding: 20px;
                }
                h2 { color: #333; margin-bottom: 5px; }
                .nav-links { margin-bottom: 20px; }
                .nav-links a {
                    color: #007bff;
                    text-decoration: none;
                    font-weight: bold;
                    margin-right: 15px;
                }
                .nav-links a:hover { text-decoration: underline; }
                
                .grid-container {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                    gap: 15px;
                    width: 100%;
                }
                
                .customer-card {
                    background: #ffffff;
                    border: 2px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 20px 15px;
                    text-align: center;
                    cursor: pointer;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.02);
                    transition: all 0.2s ease-in-out;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    min-height: 120px;
                }
                .customer-card:hover {
                    transform: translateY(-4px);
                    border-color: #007bff;
                    box-shadow: 0 6px 12px rgba(0, 123, 255, 0.15);
                    background: #f8fbff;
                }
                .customer-card:active { transform: scale(0.97); }
                
                .cust-name {
                    font-size: 18px;
                    font-weight: bold;
                    color: #2d3748;
                    margin-bottom: 6px;
                    word-break: break-word;
                }
                .cust-id {
                    font-size: 11px;
                    color: #a0aec0;
                    margin-bottom: 10px;
                }
                .cust-total {
                    font-size: 14px;
                    color: #4a5568;
                    background: #edf2f7;
                    padding: 4px 10px;
                    border-radius: 20px;
                    width: 100%;
                }
                .cust-total span { color: #28a745; font-weight: bold; }
            </style>
        </head>
        <body>
            <h2>🔲 แผงควบคุมด่วนแบบตาราง (Customer Grid)</h2>
            <div class="nav-links">
                <a href="/customer">📋 หน้าจัดการรายชื่อแบบเดิม</a>
                <a href="/admin">⬅ กลับหน้าแอดมิน</a>
            </div>
            
            <div class="grid-container">
                ${gridCardsHTML}
            </div>

            <script>
                function quickAddAmount(psid, custName) {
                    let input = prompt("เพิ่มยอดให้: [" + custName + "]\\nกรอกจำนวนเงิน (กด Enter เพื่อส่งได้ทันที):");
                    if (!input) return;
                    
                    let cleanInput = input.replace(/[^0-9.]/g, '');
                    let amount = parseFloat(cleanInput);
                    
                    if (isNaN(amount) || amount <= 0) {
                        alert("❌ จำนวนเงินไม่ถูกต้อง");
                        return;
                    }

                    fetch('/customer-action', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'add', psid: psid, amount: amount })
                    })
                    .then(res => res.text())
                    .then(data => {
                        alert("✅ สำเร็จ! เพิ่มยอด +" + amount + " ให้ " + custName + " เรียบร้อย");
                        location.reload();
                    })
                    .catch(err => {
                        alert("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ");
                        console.error(err);
                    });
                }
            </script>
        </body>
        </html>
    `);
});
// 📋 หน้าเดิม: จัดการข้อมูลและรายการทั้งหมดทำงานได้สมบูรณ์เช่นเดิม
app.get('/customer', (req, res) => {
    let htmlContent = '';
    for (let psid in db) {
        let customerData = db[psid];
        let customerName = customerData.name || "ยังไม่ได้ตั้งชื่อเล่น";
        let totalAllDays = 0;
        let detailsHTML = '';

        for (let date in customerData) {
            if (date === 'name') continue;
            let items = customerData[date];
            if (!Array.isArray(items)) continue;

            let dayTotal = items.reduce((sum, item) => sum + item.amount, 0);
            totalAllDays += dayTotal;

            let itemsList = items.map((item, idx) => `
                <li style="margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center;">
                    <span>[${item.time}] +${item.amount}</span>
                    <div>
                        <button onclick="editItem('${psid}', '${date}', ${idx}, ${item.amount})" style="background: #ffc107; border: none; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">แก้ไข</button>
                        <button onclick="deleteItem('${psid}', '${date}', ${idx})" style="background: #dc3545; color: white; border: none; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 4px;">ลบ</button>
                    </div>
                </li>
            `).join('');

            detailsHTML += `
                <div style="background: #f9f9f9; padding: 10px; margin-top: 8px; border-radius: 6px; border-left: 4px solid #007bff;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong>📅 วันที่: ${date}</strong> (ยอดวันนี้: ${dayTotal})
                        <div>
                            <button onclick="copyDailyReport('${psid}', '${date}')" style="background: #6c757d; color: white; border: none; padding: 3px 6px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-right: 4px;">📋 คัดลอกยอดวันนี้</button>
                            <button onclick="sendReport('${psid}', 'daily', '${date}')" style="background: #17a2b8; color: white; border: none; padding: 3px 6px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-right: 4px;">📤 ส่งยอดรายวัน</button>
                            <button onclick="clearDay('${psid}', '${date}')" style="background: #ff851b; color: white; border: none; padding: 3px 6px; border-radius: 4px; cursor: pointer; font-size: 11px;">🗑 เคลียร์วันนึ้</button>
                        </div>
                    </div>
                    <ul style="padding-left: 20px; margin: 5px 0 0 0;">${itemsList || '<li>ไม่มีรายการ</li>'}</ul>
                </div>
            `;
        }

        htmlContent += `
            <div style="background: #fff; padding: 20px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div>
                        <h3 style="margin: 0; color: #333;">👤 ชื่อเล่น: <span style="color: #007bff;">${customerName}</span></h3>
                        <p style="margin: 4px 0 0 0; color: #888; font-size: 12px;">ID: ${psid}</p>
                        <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">ยอดสะสมรวมทั้งหมด: <strong>${totalAllDays} บาท</strong></p>
                    </div>
                    <div>
                        <button onclick="setName('${psid}', '${customerName === 'ยังไม่ได้ตั้งชื่อเล่น' ? '' : customerName}')" style="background: #17a2b8; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; margin-right: 5px;">✏ ตั้งชื่อเล่น</button>
                        <button onclick="sendReport('${psid}', 'all', '')" style="background: #6610f2; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; margin-right: 5px;">📨 ส่งยอดทั้งหมด</button>
                        <button onclick="addAmount('${psid}')" style="background: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; margin-right: 5px;">+ เพิ่มยอด</button>
                        <button onclick="customAddAmount('${psid}')" style="background: #fd7e14; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; margin-right: 5px;">✨ ตกแต่งยอด</button>
                        <button onclick="clearAllCustomer('${psid}')" style="background: #343a40; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer;">🔥 ล้างทั้งหมด</button>
                    </div>
                </div>

                <div style="background: #eef2f7; padding: 10px; border-radius: 6px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <input type="text" id="customMsg_${psid}" placeholder="💬 พิมพ์ข้อความอิสระ..." style="flex: 1; min-width: 200px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
                    <button onclick="sendCustomMessage('${psid}')" style="background: #007bff; color: white; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-size: 14px; white-space: nowrap;">📨 ส่งข้อความ</button>
                </div>

                ${detailsHTML}
            </div>
        `;
    }

    if (Object.keys(db).length === 0) {
        htmlContent = '<p style="text-align: center; color: #666; padding: 40px;">ยังไม่มีข้อมูลประวัติการทำรายการในระบบครับ</p>';
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Customer Management - /customer</title></head>
        <body style="font-family: sans-serif; background: #f0f2f5; padding: 20px; max-width: 800px; margin: auto;">
            <h2>📋 ระบบจัดการข้อมูลลูกค้าและรายการทั้งหมด (/customer)</h2>
            <p>
                <a href="/customer-grid" style="color: #28a745; font-weight: bold; text-decoration: none; margin-right: 15px;">🔲 เปิดหน้าตารางด่วน (/customer-grid)</a>
                <a href="/admin" style="color: #007bff; font-weight: bold; text-decoration: none;">⬅ กลับไปหน้าแอดมิน</a>
            </p>
            <hr style="margin-bottom: 20px; border: 0; border-top: 1px solid #ccc;">
            ${htmlContent}
            <script>
                function setName(psid, currentName) {
                    let name = prompt("กรอกชื่อเล่นของลูกค้า:", currentName === 'ยังไม่ได้ตั้งชื่อเล่น' ? '' : currentName);
                    if (name !== null) {
                        fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setName', psid, name }) })
                        .then(res => res.text()).then(data => { alert(data); location.reload(); });
                    }
                }
                function addAmount(psid) {
                    let amount = prompt("กรอกจำนวนเงินที่ต้องการเพิ่ม:");
                    if (amount && !isNaN(amount)) {
                        fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', psid, amount: parseFloat(amount) }) })
                        .then(res => res.text()).then(data => { alert(data); location.reload(); });
                    }
                }
                function customAddAmount(psid) {
                    let input = prompt("กรอกเวลาและจำนวนเงิน (ตัวอย่าง: 17.00 200 หรือ 17:00 200):");
                    if (!input) return;
                    let parts = input.trim().split(/\\s+/);
                    if (parts.length < 2) { alert("กรุณากรอกรูปแบบให้ถูกต้อง เช่น 17.00 200"); return; }
                    let timeInput = parts[0].replace('.', ':');
                    let amountInput = parseFloat(parts[1]);
                    if (isNaN(amountInput)) { alert("จำนวนเงินไม่ถูกต้อง"); return; }
                    fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'customAdd', psid, time: timeInput, amount: amountInput }) })
                    .then(res => res.text()).then(data => { alert(data); location.reload(); });
                }
                function editItem(psid, date, index, oldAmount) {
                    let newAmount = prompt("แก้ไขจำนวนเงินใหม่:", oldAmount);
                    if (newAmount && !isNaN(newAmount)) {
                        fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'edit', psid, date, index, amount: parseFloat(newAmount) }) })
                        .then(res => res.text()).then(data => { alert(data); location.reload(); });
                    }
                }
                function deleteItem(psid, date, index) {
                    if (confirm("ต้องการลบรายการนี้ใช่หรือไม่?")) {
                        fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', psid, date, index }) })
                        .then(res => res.text()).then(data => { alert(data); location.reload(); });
                    }
                }
                function clearDay(psid, date) {
                    if (confirm("ต้องการเคลียร์ยอดของวันที่ " + date + " ทั้งหมดใช่หรือไม่?")) {
                        fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clearDay', psid, date }) })
                        .then(res => res.text()).then(data => { alert(data); location.reload(); });
                    }
                }
                function clearAllCustomer(psid) {
                    if (confirm("⚠ คำเตือน: ต้องการลบข้อมูลและประวัติทั้งหมดของลูกค้ารายนี้ใช่หรือไม่?")) {
                        fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clearAll', psid }) })
                        .then(res => res.text()).then(data => { alert(data); location.reload(); });
                    }
                }
                function sendReport(psid, type, date) {
                    let msg = type === 'daily' ? ('ต้องการส่งสรุปยอดวันที่ ' + date + ' ไปหาลูกค้าใช่หรือไม่?') : ('ต้องการส่งสรุปยอดสะสมทั้งหมดไปหาลูกค้าใช่หรือไม่?');
                    if (confirm(msg)) {
                        fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sendReport', psid, type, date }) })
                        .then(res => res.text()).then(data => { alert(data); });
                    }
                }
                function copyDailyReport(psid, date) {
                    fetch('/customer-action', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify({ action: 'getDailyReportText', psid, date }) 
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.text) {
                            window.prompt("📋 คัดลอกข้อความด้านล่างนี้ (กด Ctrl+C แล้วกด Enter):", data.text);
                        } else {
                            alert("❌ ไม่พบข้อมูลยอดของวันนี้");
                        }
                    });
                }
                function sendCustomMessage(psid) {
                    let inputElem = document.getElementById('customMsg_' + psid);
                    let message = inputElem.value.trim();
                    if (!message) { alert("กรุณากรอกข้อความก่อนส่งครับ"); return; }
                    fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sendCustom', psid, message }) })
                    .then(res => res.text()).then(data => { alert(data); inputElem.value = ''; });
                }
            </script>
        </body>
        </html>
    `);
});

function sortItemsByTime(itemsArray) {
    return itemsArray.sort((a, b) => a.time.localeCompare(b.time));
}

function findPsidByNameQuery(nameQuery) {
    if (!nameQuery) return null;
    let q = nameQuery.trim().toLowerCase();
    let altQ = q.replace(/^พี/, 'พี่');

    for (let psid in db) {
        let custName = (db[psid].name || "").trim().toLowerCase();
        if (custName) {
            if (custName.includes(q) || custName.includes(altQ) || q.includes(custName)) {
                return psid;
            }
        }
    }
    return null;
}

app.post('/customer-action', express.json({ limit: '20mb' }), async (req, res) => {
    let { action, psid, date, index, amount, type, name, message, time } = req.body;
    let today = getThaiDate();
    if (!db[psid]) db[psid] = {};
    let timeNow = getThaiTime();

    if (action === 'setName') {
        db[psid].name = name;
        await saveToGitHub();
        return res.send("บันทึกชื่อเล่นสำเร็จ!");
    } else if (action === 'sendCustom') {
        if (!message) return res.status(400).send("ไม่มีข้อความที่ต้องการส่ง");
        if (psid.startsWith('U')) {
            await sendLineMessage(psid, message);
        } else {
            await sendMessengerMessage(psid, message);
        }
        return res.send("ส่งข้อความหาลูกค้าเรียบร้อยแล้ว");
    } else if (action === 'getDailyReportText') {
        let customerData = db[psid];
        if (!customerData) return res.json({ text: "" });
        
        let items = customerData[date] || [];
        let dayTotal = items.reduce((sum, item) => sum + item.amount, 0);
        let listText = items.map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
        
        let reportMessage = `📅 [${date}] รายการประจำวัน:\n${listText || 'ไม่มีรายการ'}\n-------------------\n💰 ยอดรวมของวัน: ${dayTotal} บาท`;
        return res.json({ text: reportMessage });
    } else if (action === 'add') {
        if (!db[psid][today]) db[psid][today] = [];
        db[psid][today].push({ time: timeNow, amount: amount });
        sortItemsByTime(db[psid][today]);
        await saveToGitHub();

        let total = db[psid][today].reduce((sum, item) => sum + item.amount, 0);
        let listText = db[psid][today].map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
        let reportMsg = `📅 [${today}] รายการประจำวัน:\n${listText}\n-------------------\n💰 ยอดรวมของวัน: ${total} บาท`;
        
        if (psid.startsWith('U')) {
            await sendLineMessage(psid, reportMsg);
        } else {
            await sendMessengerMessage(senderPSID || psid, reportMsg);
        }
        return res.send("เพิ่มยอดและส่งข้อความหาลูกค้าสำเร็จ!");
    } else if (action === 'customAdd') {
        let targetDate = today;
        if (!db[psid][targetDate]) db[psid][targetDate] = [];
        db[psid][targetDate].push({ time: time || timeNow, amount: amount });
        sortItemsByTime(db[psid][targetDate]);
        await saveToGitHub();
        return res.send("เพิ่มรายการแบบกำหนดเวลาสำเร็จ!");
    } else if (action === 'edit') {
        if (db[psid][date] && db[psid][date][index]) {
            db[psid][date][index].amount = amount;
            db[psid][date][index].time = timeNow;
            sortItemsByTime(db[psid][date]);
            await saveToGitHub();
            return res.send("แก้ไขข้อมูลและอัปเดตเวลาเรียบร้อย!");
        } else { return res.status(400).send("ไม่พบรายการ"); }
    } else if (action === 'delete') {
        if (db[psid][date] && db[psid][date][index] !== undefined) {
            db[psid][date].splice(index, 1);
            await saveToGitHub();
            return res.send("ลบรายการสำเร็จ!");
        } else { return res.status(400).send("ไม่พบรายการ"); }
    } else if (action === 'clearDay') {
        if (db[psid][date]) {
            db[psid][date] = [];
            await saveToGitHub();
            return res.send("เคลียร์ยอดประจำวันสำเร็จ!");
        } else { return res.status(400).send("ไม่พบข้อมูลวันที่ต้องการเคลียร์"); }
    } else if (action === 'clearAll') {
        delete db[psid];
        await saveToGitHub();
        return res.send("ลบข้อมูลทั้งหมดของลูกค้ารายนี้เรียบร้อยแล้ว!");
    } else if (action === 'sendReport') {
        let customerData = db[psid];
        if (!customerData) return res.status(400).send("ไม่พบข้อมูลลูกค้า");
        let reportMessage = "";
        if (type === 'daily') {
            let items = customerData[date] || [];
            let dayTotal = items.reduce((sum, item) => sum + item.amount, 0);
            let listText = items.map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
            reportMessage = `📅 สรุปยอดประจำวัน [${date}]:\n${listText || 'ไม่มีรายการ'}\n-------------------\n💰 ยอดรวมของวัน: ${dayTotal} บาท`;
        } else if (type === 'all') {
            let grandTotal = 0;
            let fullText = `📊 สรุปรายการยอดซื้อทั้งหมดของคุณ:\n`;
            for (let d in customerData) {
                if (d === 'name') continue;
                let items = customerData[d];
                if (!Array.isArray(items)) continue;
                let dTotal = items.reduce((sum, item) => sum + item.amount, 0);
                grandTotal += dTotal;
                fullText += `\n📅 วันที่ ${d}:\n` + items.map((item, idx) => `  - [${item.time}] +${item.amount}`).join('\n') + `\n  (ยอดรวมวันนี้: ${dTotal})`;
            }
            fullText += `\n-------------------\n💰 ยอดสะสมรวมทั้งหมด: ${grandTotal} บาท`;
            reportMessage = fullText;
        }
        if (psid.startsWith('U')) {
            await sendLineMessage(psid, reportMessage);
        } else {
            await sendMessengerMessage(psid, reportMessage);
        }
        return res.send("ส่งรายงานสรุปยอดไปหาลูกค้าสำเร็จ!");
    } else { 
        return res.status(400).send("Action ไม่ถูกต้อง"); 
    }
});

app.post('/webhook', async (req, res) => {
    let body = req.body;
    if (body.object === 'page') {
        for (let entry of body.entry) {
            let webhook_event = entry.messaging[0];
            let senderPSID = webhook_event.sender.id;

            if (senderPSID === "1422397037618559") continue;

            if (webhook_event.message) {
                let msg = webhook_event.message;
                let custName = db[senderPSID]?.name || `ID: ${senderPSID}`;

                if (msg.text) {
                    let incomingText = msg.text.trim();
                    recentCustomers[senderPSID] = { lastMessage: incomingText, time: getThaiTime() };
                    await sendTelegramMessage(`💬 <b>[FB] ข้อความใหม่จาก [${custName}]:</b>\n${incomingText}`);

                    let today = getThaiDate();
                    if (!db[senderPSID]) db[senderPSID] = {};
                    if (!db[senderPSID][today]) db[senderPSID][today] = [];

                    if (incomingText.startsWith('.')) {
                        let amount = parseFloat(incomingText.replace(/^\.+/, ''));
                        if (!isNaN(amount)) {
                            let timeNow = getThaiTime();
                            db[senderPSID][today].push({ time: timeNow, amount: amount });
                            sortItemsByTime(db[senderPSID][today]);
                            await saveToGitHub();
                            let total = db[senderPSID][today].reduce((sum, item) => sum + item.amount, 0);
                            let listText = db[senderPSID][today].map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
                            
                            let replyMessage = `📅 [${today}] รายการประจำวัน:\n${listText}\n-------------------\n💰 ยอดรวมของวัน: ${total} บาท`;
                            await sendMessengerMessage(senderPSID, replyMessage);
                        }
                    }
                }

                if (msg.attachments && msg.attachments.length > 0) {
                    for (let attachment of msg.attachments) {
                        if (attachment.type === 'image') {
                            let imageUrl = attachment.payload.url;
                            recentCustomers[senderPSID] = { lastMessage: '🖼 [ส่งรูปภาพ/สลิป]', time: getThaiTime() };
                            await sendTelegramPhoto(imageUrl, `🖼 <b>[FB] ลูกค้า [${custName}] ส่งรูปภาพ/สลิปมาใหม่:</b>`);
                        }
                    }
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

app.post('/line-webhook', async (req, res) => {
    let body = req.body;
    if (body.events) {
        for (let event of body.events) {
            if (event.type === 'message' && event.source && event.source.userId) {
                let userId = event.source.userId;
                let custName = db[userId]?.name || `LINE ID: ${userId.substring(0, 8)}`;

                if (event.message.type === 'text') {
                    let incomingText = event.message.text.trim();
                    recentCustomers[userId] = { lastMessage: incomingText, time: getThaiTime() };
                    await sendTelegramMessage(`💬 <b>[LINE] ข้อความใหม่จาก [${custName}]:</b>\n${incomingText}`);

                    let today = getThaiDate();
                    if (!db[userId]) db[userId] = {};
                    if (!db[userId][today]) db[userId][today] = [];

                    if (incomingText.startsWith('.')) {
                        let amount = parseFloat(incomingText.replace(/^\.+/, ''));
                        if (!isNaN(amount)) {
                            let timeNow = getThaiTime();
                            db[userId][today].push({ time: timeNow, amount: amount });
                            sortItemsByTime(db[userId][today]);
                            await saveToGitHub();
                            let total = db[userId][today].reduce((sum, item) => sum + item.amount, 0);
                            let listText = db[userId][today].map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
                            
                            let replyMessage = `📅 [${today}] รายการประจำวัน:\n${listText}\n-------------------\n💰 ยอดรวมของวัน: ${total} บาท`;
                            await sendLineMessage(userId, replyMessage);
                        }
                    }
                }

                if (event.message.type === 'image') {
                    let messageId = event.message.id;
                    recentCustomers[userId] = { lastMessage: '🖼 [LINE ส่งรูปภาพ/สลิป]', time: getThaiTime() };
                    
                    try {
                        let imgRes = await axios.get(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
                            headers: { 'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
                            responseType: 'arraybuffer'
                        });
                        let base64Image = Buffer.from(imgRes.data).toString('base64');
                        let uniqueName = `uploads/line_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;

                        await axios.put(`https://api.github.com/repos/${GITHUB_REPO}/contents/${uniqueName}`, {
                            message: 'Upload image from LINE bot',
                            content: base64Image
                        }, { headers: { Authorization: `token ${GITHUB_TOKEN}` } });

                        let publicImageUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${uniqueName}`;
                        await sendTelegramPhoto(publicImageUrl, `🖼 <b>[LINE] ลูกค้า [${custName}] ส่งรูปภาพ/สลิปมาใหม่:</b>`);
                    } catch (err) {
                        console.error("❌ ดึงรูปจาก LINE ไม่สำเร็จ:", err.response?.data || err.message);
                        await sendTelegramMessage(`🖼 <b>[LINE] ลูกค้า [${custName}] ส่งรูปภาพมา (ไม่สามารถดึงรูปแสดงได้)</b>`);
                    }
                }
            }
        }
    }
    res.status(200).send('OK');
});

let lockedAdminTargetPsid = null;
let lockExpireTimer = null;

function setAdminLock(psid) {
    lockedAdminTargetPsid = psid;
    if (lockExpireTimer) clearTimeout(lockExpireTimer);
    lockExpireTimer = setTimeout(() => {
        lockedAdminTargetPsid = null;
    }, 30000);
}

app.post('/telegram-webhook', express.json(), async (req, res) => {
    let update = req.body;
    if (update.message && update.message.chat) {
        let chatId = String(update.message.chat.id);
        
        if (TELEGRAM_CHAT_ID && chatId === String(TELEGRAM_CHAT_ID)) {
            let messageObj = update.message;
            let text = messageObj.text || messageObj.caption || "";
            let photo = messageObj.photo;

            let targetId = null;
            let actualText = text;

            if (text) {
                let parts = text.trim().split(/\s+/);
                let found = findPsidByNameQuery(parts[0]);
                if (found) {
                    targetId = found;
                    actualText = parts.slice(1).join(" "); 
                    setAdminLock(targetId); 
                }
            }

            if (!targetId && lockedAdminTargetPsid) {
                targetId = lockedAdminTargetPsid;
                setAdminLock(targetId); 
            }

            if (!targetId) {
                let recentKeys = Object.keys(recentCustomers);
                targetId = recentKeys.length > 0 ? recentKeys[recentKeys.length - 1] : null;
            }

            if (!targetId) {
                let allIds = Object.keys(db);
                if (allIds.length > 0) {
                    targetId = allIds[allIds.length - 1];
                }
            }

            const lockedTargetId = targetId;
            if (lockedTargetId) {
                setAdminLock(lockedTargetId); 
            }

            if (lockedTargetId) {
                let custName = db[lockedTargetId]?.name || lockedTargetId;

                if (photo && photo.length > 0) {
                    let fileId = photo[photo.length - 1].file_id;
                    try {
                        let fileRes = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
                        let filePath = fileRes.data.result.file_path;
                        let telegramFileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

                        let imgRes = await axios.get(telegramFileUrl, { responseType: 'arraybuffer' });
                        let base64Image = Buffer.from(imgRes.data).toString('base64');
                        let uniqueName = `uploads/admin_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;

                        await axios.put(`https://api.github.com/repos/${GITHUB_REPO}/contents/${uniqueName}`, {
                            message: 'Upload image from Telegram admin',
                            content: base64Image
                        }, { headers: { Authorization: `token ${GITHUB_TOKEN}` } });

                        let publicGithubUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${uniqueName}`;

                        console.log("⏳ กำลังรอ 10 วินาทีก่อนส่งรูป...");
                        await sleep(10000);

                        if (lockedTargetId.startsWith('U')) {
                            await sendLineImage(lockedTargetId, publicGithubUrl);
                            await sendTelegramMessage(`🖼 ส่งรูปภาพผ่าน GitHub หา LINE <b>${custName}</b> เรียบร้อยแล้ว!`);
                        } else {
                            await sendMessengerImage(lockedTargetId, publicGithubUrl);
                            await sendTelegramMessage(`🖼 ส่งรูปภาพผ่าน GitHub หา Facebook <b>${custName}</b> เรียบร้อยแล้ว!`);
                        }
                    } catch (err) {
                        console.error("❌ อัปโหลดหรือส่งรูปจาก Telegram ไม่สำเร็จ:", err.response?.data || err.message);
                        await sendTelegramMessage(`❌ ส่งรูปภาพไม่สำเร็จ: ${err.message}`);
                    }
                } 
                else if (actualText) {
                    let today = getThaiDate();
                    if (actualText.startsWith('.')) {
                        let amount = parseFloat(actualText.replace(/^\.+/, ''));
                        if (!isNaN(amount)) {
                            if (!db[lockedTargetId]) db[lockedTargetId] = {};
                            if (!db[lockedTargetId][today]) db[lockedTargetId][today] = [];
                            let timeNow = getThaiTime();

                            db[lockedTargetId][today].push({ time: timeNow, amount: amount });
                            sortItemsByTime(db[lockedTargetId][today]);
                            await saveToGitHub();

                            let total = db[lockedTargetId][today].reduce((sum, item) => sum + item.amount, 0);
                            let listText = db[lockedTargetId][today].map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
                            let reportMsg = `📅 [${today}] รายการประจำวัน:\n${listText}\n-------------------\n💰 ยอดรวมของวัน: ${total} บาท`;
                            
                            if (lockedTargetId.startsWith('U')) {
                                await sendLineMessage(lockedTargetId, reportMsg);
                            } else {
                                await sendMessengerMessage(lockedTargetId, reportMsg);
                            }
                            await sendTelegramMessage(`✅ บันทึกยอด +${amount} ให้ <b>${custName}</b> และส่งยอดให้ลูกค้าแล้ว! (ยอดวันนี้: ${total} บาท)`);
                        }
                    } else {
                        if (lockedTargetId.startsWith('U')) {
                            await sendLineMessage(lockedTargetId, actualText);
                        } else {
                            await sendMessengerMessage(lockedTargetId, actualText);
                        }
                        await sendTelegramMessage(`📤 ส่งข้อความหา <b>${custName}</b> เรียบร้อย:\n"${actualText}"`);
                    }
                }
            } else {
                await sendTelegramMessage(`❌ ไม่พบเป้าหมายลูกค้าในระบบ`);
            }
        }
    }
    res.status(200).send('OK');
});

app.get('/admin-test', async (req, res) => {
    let psid = req.query.id;
    let text = req.query.text;
    if (!psid || !text) return res.send("❌ กรุณาระบุ ?id=ID&text=ข้อความ");

    let today = getThaiDate();
    if (!db[psid]) db[psid] = {};
    if (!db[psid][today]) db[psid][today] = [];

    let amount = parseFloat(text.replace(/^\.+/, ''));
    let replyMessage = "";
    if (!isNaN(amount)) {
        let timeNow = getThaiTime();
        db[psid][today].push({ time: timeNow, amount: amount });
        sortItemsByTime(db[psid][today]);
        await saveToGitHub();

        let total = db[psid][today].reduce((sum, item) => sum + item.amount, 0);
        let listText = db[psid][today].map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
        replyMessage = `📅 [${today}] รายการประจำวัน:\n${listText}\n-------------------\n💰 ยอดรวมของวัน: ${total} บาท`;
    } else {
        replyMessage = `⚙ แอดมิน: ${text}`;
    }

    if (psid.startsWith('U')) {
        await sendLineMessage(psid, replyMessage);
    } else {
        await sendMessengerMessage(psid, replyMessage);
    }
    res.send(`✅ ดำเนินการให้ ID: ${psid} เรียบร้อย!`);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Webhook server is running on port ${PORT}`);
});
