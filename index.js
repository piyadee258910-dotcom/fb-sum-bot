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

// กำหนด LINE User ID ของแอดมินสำหรับพิมพ์สั่งการผ่าน LINE OA
const ADMIN_LINE_USER_ID = process.env.ADMIN_LINE_USER_ID || "UXXXXXXXXXXXXXXXXXXXXXXXXX"; 

let db = {};
let recentCustomers = {};

// เก็บรายการ messageId ของ LINE ที่เคยประมวลผลไปแล้ว เพื่อป้องกันการดึงมาวนซ้ำ
let processedLineMessageIds = new Set();

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
            <p><a href="/customer" style="color: #007bff; font-weight: bold; text-decoration: none;">📋 ไปที่หน้าจัดการข้อมูลลูกค้าทั้งหมด (/customer)</a></p>
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
            <p><a href="/admin" style="color: #007bff; text-decoration: none;">⬅ กลับไปหน้าแอดมินด่วน</a></p>
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
        let custName
