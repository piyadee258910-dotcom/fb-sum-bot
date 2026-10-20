const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Token สำหรับเชื่อมต่อ Facebook Messenger API
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "your_verify_token_here";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN || "your_page_access_token_here";

// เก็บข้อมูลยอดขายแยกตาม PSID และวันที่
const db = {}; 
// เก็บรายชื่อลูกค้าล่าสุดเพื่อให้หน้าแอดมินกดง่าย
if (!global.recentCustomers) global.recentCustomers = {};

// ฟังก์ชันแมป PSID ให้เป็นชื่อเล่นที่อ่านง่าย
function getCustomerDisplayName(psid) {
    const nameMap = {
        "28515546574783938": "น้องบอล",
        "28339410642427843": "มาดามแป้ง"
    };
    return nameMap[psid] || psid;
}

// ฟังก์ชันส่งข้อความกลับไปหาลูกค้าทาง Messenger
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

// 1. หน้าแรกของเซิร์ฟเวอร์
app.get('/', (req, res) => {
    res.send("Webhook server is running successfully! 🚀");
});

// 2. หน้าแอดมินแดชบอร์ด (/admin) พร้อมตารางแสดงรายการยอดขาย
app.get('/admin', (req, res) => {
    let customerListHTML = '';
    const recentCustomers = global.recentCustomers;
    let today = new Date().toISOString().split('T')[0];
    
    for (let psid in recentCustomers) {
        let cust = recentCustomers[psid];
        let displayName = getCustomerDisplayName(psid);
        
        let totalToday = 0;
        let itemsListHTML = '';

        if (db[psid] && db[psid][today] && db[psid][today].length > 0) {
            totalToday = db[psid][today].reduce((sum, item) => sum + item.amount, 0);
            
            // สร้างตารางแสดงรายการยอดขายของลูกค้ารายนี้
            itemsListHTML = `
                <table class="sales-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>เวลา</th>
                            <th>ยอดเงิน</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            db[psid][today].forEach((item, idx) => {
                itemsListHTML += `
                    <tr>
                        <td>${idx + 1}</td>
                        <td>${item.time}</td>
                        <td>+${item.amount.toLocaleString()}</td>
                    </tr>
                `;
            });
            itemsListHTML += `
                    </tbody>
                </table>
            `;
        } else {
            itemsListHTML = `<p class="no-sales">ยังไม่มีรายการยอดขายในวันนี้</p>`;
        }

        customerListHTML += `
            <div class="customer-card">
                <div class="customer-info">
                    <strong>ชื่อลูกค้า:</strong> <span class="name-text">${displayName}</span> <br>
                    <small style="color: #888;">PSID: ${psid}</small><br>
                    <small class="last-msg">💬 ข้อความล่าสุด: ${cust.lastMessage || '-'}</small><br>
                    <span class="badge-total">💰 ยอดรวมวันนี้: <strong>${totalToday.toLocaleString()}</strong> บาท</span>
                </div>
                
                <div class="sales-section">
                    ${itemsListHTML}
                </div>

                <div class="action-buttons">
                    <button class="btn btn-success" onclick="quickAction('${psid}', '..100')">+100</button>
                    <button class="btn btn-primary" onclick="quickAction('${psid}', '..500')">+500</button>
                    <button class="btn btn-warning" onclick="customPrompt('${psid}', '${displayName}')">กำหนดเอง</button>
                    <button class="btn btn-danger" onclick="clearData('${psid}', '${displayName}')">ล้างยอด</button>
                </div>
            </div>
        `;
    }

    if (Object.keys(recentCustomers).length === 0) {
        customerListHTML = '<div class="empty-state">ยังไม่มีประวัติลูกค้าทักเข้ามาในระบบ ลองให้ลูกค้าทักข้อความมาใหม่อีกครั้งครับ 📭</div>';
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Quick Dashboard</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f0f2f5; padding: 20px; max-width: 750px; margin: auto; color: #333; }
                h2 { color: #1877f2; margin-bottom: 5px; }
                p.sub-title { color: #65676b; margin-top: 0; }
                .customer-card { background: #fff; padding: 18px; margin-bottom: 15px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); display: flex; flex-direction: column; gap: 12px; }
                .customer-info { word-break: break-all; }
                .name-text { color: #1877f2; font-size: 1.1em; font-weight: bold; }
                .last-msg { color: #65676b; display: inline-block; margin-top: 4px; }
                .badge-total { display: inline-block; margin-top: 6px; color: #2e7d32; background: #e8f5e9; padding: 3px 8px; border-radius: 6px; font-size: 0.95em; }
                
                /* สไตล์ตารางยอดขาย */
                .sales-section { margin-top: 5px; }
                .sales-table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 0.9em; }
                .sales-table th, .sales-table td { border: 1px solid #e4e6eb; padding: 6px 10px; text-align: left; }
                .sales-table th { background-color: #f7f8fa; color: #4b4f56; }
                .no-sales { color: #8a8d91; font-size: 0.9em; font-style: italic; margin: 5px 0; }

                .action-buttons { display: flex; flex-wrap: wrap; gap: 6px; border-top: 1px solid #eee; padding-top: 10px; }
                .btn { border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.9em; transition: opacity 0.2s; }
                .btn:hover { opacity: 0.85; }
                .btn-success { background: #2e7d32; color: white; }
                .btn-primary { background: #1877f2; color: white; }
                .btn-warning { background: #ffc107; color: #000; }
                .btn-danger { background: #dc3545; color: white; }
                .empty-state { background: #fff; padding: 30px; text-align: center; border-radius: 10px; color: #65676b; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
                hr { border: 0; border-top: 1px solid #ced0d4; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <h2>🚀 แผงควบคุมด่วนแอดมิน</h2>
            <p class="sub-title">จัดการและบวกยอดขายส่งเข้าแชทลูกค้าผ่าน Messenger ได้ทันที</p>
            <hr>
            ${customerListHTML}

            <script>
                function quickAction(psid, text) {
                    fetch('/admin-test?id=' + psid + '&text=' + encodeURIComponent(text))
                        .then(res => res.text())
                        .then(data => {
                            location.reload();
                        })
                        .catch(err => alert('เกิดข้อผิดพลาด: ' + err));
                }

                function customPrompt(psid, name) {
                    let cmd = prompt("กรอกยอดที่ต้องการบวกให้กับ " + name + " (เช่น 250 หรือ ..250):");
                    if (cmd) {
                        let formattedText = cmd.startsWith('.') ? cmd : '..' + cmd;
                        quickAction(psid, formattedText);
                    }
                }

                function clearData(psid, name) {
                    if (confirm("คุณต้องการล้างยอดขายประจำวันนี้ของ " + name + " ใช่หรือไม่?")) {
                        quickAction(psid, 'clear');
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// 3. Webhook Verify (สำหรับยืนยันกับ Meta)
app.get('/webhook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

// 4. Webhook รับข้อความจาก Messenger (แก้ไขโครงสร้างปีกกาให้ถูกต้องเรียบร้อยแล้ว)
app.post('/webhook', (req, res) => {
    let body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(entry => {
            let webhook_event = entry.messaging[0];
            let senderPSID = webhook_event.sender.id;

            if (webhook_event.message && webhook_event.message.text) {
                let incomingText = webhook_event.message.text.trim();

                // บันทึกเก็บไว้ในรายการล่าสุด
                global.recentCustomers[senderPSID] = {
                    lastMessage: incomingText,
                    time: new Date().toLocaleTimeString()
                };

                let today = new Date().toISOString().split('T')[0];
                if (!db[senderPSID]) db[senderPSID] = {};
                if (!db[senderPSID][today]) db[senderPSID][today] = [];

                let replyMessage = "";

                if (incomingText.startsWith('.')) {
                    let amountStr = incomingText.replace(/^\.+/, '');
                    let amount = parseFloat(amountStr);

                    if (!isNaN(amount)) {
                        let timeNow = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                        db[senderPSID][today].push({ time: timeNow, amount: amount });

                        let total = db[senderPSID][today].reduce((sum, item) => sum + item.amount, 0);
                        let listText = db[senderPSID][today].map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
                        replyMessage = `📅 [${today}] รายการประจำวัน:\n${listText}\n-------------------\n💰 ยอดรวมของวัน: ${total}`;
                    }
                } 
                else if (incomingText.toLowerCase().startsWith('clear')) {
                    db[senderPSID][today] = [];
                    replyMessage = `🗑️ ล้างข้อมูลของวันที่ ${today} เรียบร้อยแล้ว`;
                }

                if (replyMessage) {
                    sendMessengerMessage(senderPSID, replyMessage);
                }
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// 5. ลิงก์ทดสอบด่วนหลังบ้านผ่านเบราว์เซอร์ (/admin-test)
app.get('/admin-test', (req, res) => {
    let psid = req.query.id;
    let text = req.query.text;

    if (!psid || !text) {
        return res.send("❌ กรุณาระบุ ?id=PSID&text=ข้อความ ให้ครบถ้วน");
    }

    let today = new Date().toISOString().split('T')[0];
    if (!db[psid]) db[psid] = {};
    if (!db[psid][today]) db[psid][today] = [];

    let replyMessage = "";

    if (text.toLowerCase().startsWith('clear')) {
        db[psid][today] = [];
        replyMessage = `🗑️ ล้างข้อมูลยอดขายประจำวันที่ ${today} เรียบร้อยแล้ว`;
    } else {
        let amount = parseFloat(text.replace(/^\.+/, ''));
        if (!isNaN(amount)) {
            let timeNow = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            db[psid][today].push({ time: timeNow, amount: amount });

            let total = db[psid][today].reduce((sum, item) => sum + item.amount, 0);
            let listText = db[psid][today].map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
            replyMessage = `📅 [${today}] รายการประจำวัน:\n${listText}\n-------------------\n💰 ยอดรวมของวัน: ${total}`;
        } else {
            replyMessage = `⚙️ แอดมินสั่งการ: ${text}`;
        }
    }

    sendMessengerMessage(psid, replyMessage);
    res.send(`✅ ทำรายการสำเร็จ`);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Webhook server is running on port ${PORT}`);
});
