const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());

// Token สำหรับเชื่อมต่อ Facebook Messenger API
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "your_verify_token_here";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN || "your_page_access_token_here";

// ไฟล์สำหรับเก็บข้อมูลฐานข้อมูลแบบถาวร
const DB_FILE = path.join(__dirname, 'database.json');
const CUSTOMERS_FILE = path.join(__dirname, 'recent_customers.json');

// ฟังก์ชันโหลดข้อมูลจากไฟล์ JSON
function loadData(filePath, defaultVal = {}) {
    try {
        if (fs.existsSync(filePath)) {
            let rawData = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(rawData);
        }
    } catch (error) {
        console.error("Error reading file:", error);
    }
    return defaultVal;
}

// ฟังก์ชันบันทึกข้อมูลลงไฟล์ JSON
function saveData(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error("Error writing file:", error);
    }
}

// โหลดฐานข้อมูลขึ้นมาใช้งาน
let db = loadData(DB_FILE, {});
let recentCustomers = loadData(CUSTOMERS_FILE, {});

// ฟังก์ชันส่งข้อความกลับหาลูกค้าทาง Messenger
async function sendMessengerMessage(recipientId, messageText) {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: recipientId },
            message: { text: messageText }
        });
    } catch (error) {
        console.error("Error sending message:", error.response?.data || error.message);
    }
}

// 1. หน้าแรก
app.get('/', (req, res) => {
    res.send("Webhook server with Persistent Storage is running successfully! 🚀");
});

// 2. หน้าแอดมินด่วน (/admin)
app.get('/admin', (req, res) => {
    let customerListHTML = '';
    
    for (let psid in recentCustomers) {
        let cust = recentCustomers[psid];
        customerListHTML += `
            <div style="background: #fff; padding: 15px; margin-bottom: 12px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>PSID:</strong> ${psid} <br>
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

// 3. หน้าจัดการลูกค้า (/customer)
app.get('/customer', (req, res) => {
    let htmlContent = '';

    for (let psid in db) {
        let customerData = db[psid];
        let totalAllDays = 0;
        let detailsHTML = '';

        for (let date in customerData) {
            let items = customerData[date];
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
                    <strong>📅 วันที่: ${date}</strong> (ยอดวันนี้: ${dayTotal})
                    <ul style="padding-left: 20px; margin: 5px 0 0 0;">${itemsList || '<li>ไม่มีรายการ</li>'}</ul>
                </div>
            `;
        }

        htmlContent += `
            <div style="background: #fff; padding: 20px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="margin: 0; color: #333;">👤 PSID: ${psid} ${psid === '28921055437528917' ? '⭐ (พี่บอย)' : ''}</h3>
                        <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">ยอดสะสมรวมทั้งหมด: <strong>${totalAllDays} บาท</strong></p>
                    </div>
                    <div>
                        <button onclick="addAmount('${psid}')" style="background: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer;">+ เพิ่มยอด</button>
                    </div>
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
            <p><a href="/admin" style="color: #007bff; text-decoration: none;">⬅️ กลับไปหน้าแอดมินด่วน</a></p>
            <hr style="margin-bottom: 20px; border: 0; border-top: 1px solid #ccc;">
            ${htmlContent}

            <script>
                function addAmount(psid) {
                    let amount = prompt("กรอกจำนวนเงินที่ต้องการเพิ่ม (เช่น 100 หรือ 500):");
                    if (amount && !isNaN(amount)) {
                        fetch('/customer-action', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'add', psid: psid, amount: parseFloat(amount) })
                        }).then(res => res.text()).then(data => { alert(data); location.reload(); });
                    }
                }

                function editItem(psid, date, index, oldAmount) {
                    let newAmount = prompt("แก้ไขจำนวนเงินใหม่:", oldAmount);
                    if (newAmount && !isNaN(newAmount)) {
                        fetch('/customer-action', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'edit', psid: psid, date: date, index: index, amount: parseFloat(newAmount) })
                        }).then(res => res.text()).then(data => { alert(data); location.reload(); });
                    }
                }

                function deleteItem(psid, date, index) {
                    if (confirm("ต้องการลบรายการนี้ใช่หรือไม่?")) {
                        fetch('/customer-action', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'delete', psid: psid, date: date, index: index })
                        }).then(res => res.text()).then(data => { alert(data); location.reload(); });
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// API รองรับการจัดการข้อมูลลูกค้า พร้อมบันทึกลงไฟล์
app.post('/customer-action', express.json(), (req, res) => {
    let { action, psid, date, index, amount } = req.body;
    let today = new Date().toISOString().split('T')[0];

    if (!db[psid]) db[psid] = {};

    if (action === 'add') {
        if (!db[psid][today]) db[psid][today] = [];
        let timeNow = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        db[psid][today].push({ time: timeNow, amount: amount });
        res.send("เพิ่มยอดสำเร็จ!");
    } else if (action === 'edit') {
        if (db[psid][date] && db[psid][date][index]) {
            db[psid][date][index].amount = amount;
            res.send("แก้ไขข้อมูลสำเร็จ!");
        } else {
            return res.status(400).send("ไม่พบรายการที่ต้องการแก้ไข");
        }
    } else if (action === 'delete') {
        if (db[psid][date] && db[psid][date][index] !== undefined) {
            db[psid][date].splice(index, 1);
            res.send("ลบรายการสำเร็จ!");
        } else {
            return res.status(400).send("ไม่พบรายการที่ต้องการลบ");
        }
    } else {
        return res.status(400).send("Action ไม่ถูกต้อง");
    }

    // เซฟข้อมูลลงไฟล์ทันทีทุกครั้งที่มีการเปลี่ยนแปลง
    saveData(DB_FILE, db);
});

// 4. Webhook รับข้อความ Messenger
app.post('/webhook', (req, res) => {
    let body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(entry => {
            let webhook_event = entry.messaging[0];
            let senderPSID = webhook_event.sender.id;

            if (webhook_event.message && webhook_event.message.text) {
                let incomingText = webhook_event.message.text.trim();
                recentCustomers[senderPSID] = { lastMessage: incomingText, time: new Date().toLocaleTimeString() };
                saveData(CUSTOMERS_FILE, recentCustomers);

                let today = new Date().toISOString().split('T')[0];
                if (!db[senderPSID]) db[senderPSID] = {};
                if (!db[senderPSID][today]) db[senderPSID][today] = [];

                let replyMessage = "";
                if (incomingText.startsWith('.')) {
                    let amount = parseFloat(incomingText.replace(/^\.+/, ''));
                    if (!isNaN(amount)) {
                        let timeNow = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                        db[senderPSID][today].push({ time: timeNow, amount: amount });
                        saveData(DB_FILE, db); // เซฟลงไฟล์

                        let total = db[senderPSID][today].reduce((sum, item) => sum + item.amount, 0);
                        let listText = db[senderPSID][today].map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
                        replyMessage = `📅 [${today}] รายการประจำวัน:\n${listText}\n-------------------\n💰 ยอดรวมของวัน: ${total}`;
                    }
                }
                if (replyMessage) sendMessengerMessage(senderPSID, replyMessage);
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// 5. ลิงก์ทดสอบด่วน /admin-test
app.get('/admin-test', (req, res) => {
    let psid = req.query.id;
    let text = req.query.text;
    if (!psid || !text) return res.send("❌ กรุณาระบุ ?id=PSID&text=ข้อความ");

    let today = new Date().toISOString().split('T')[0];
    if (!db[psid]) db[psid] = {};
    if (!db[psid][today]) db[psid][today] = [];

    let amount = parseFloat(text.replace(/^\.+/, ''));
    let replyMessage = "";
    if (!isNaN(amount)) {
        let timeNow = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        db[psid][today].push({ time: timeNow, amount: amount });
        saveData(DB_FILE, db); // เซฟลงไฟล์

        let total = db[psid][today].reduce((sum, item) => sum + item.amount, 0);
        let listText = db[psid][today].map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
        replyMessage = `📅 [${today}] รายการประจำวัน:\n${listText}\n-------------------\n💰 ยอดรวมของวัน: ${total}`;
    } else {
        replyMessage = `⚙️ แอดมิน: ${text}`;
    }

    sendMessengerMessage(psid, replyMessage);
    res.send(`✅ ดำเนินการให้ PSID: ${psid} เรียบร้อย!`);
});

// รันเซิร์ฟเวอร์
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Webhook server with Persistent Storage is running on port ${PORT}`);
});
