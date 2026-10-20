const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Token สำหรับเชื่อมต่อ Facebook Messenger API
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "your_verify_token_here";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN || "your_page_access_token_here";

// เก็บข้อมูลยอดขายแยกตาม PSID และวันที่ (ในหน่วยความจำเซิร์ฟเวอร์)
const db = {}; 
// เก็บรายชื่อลูกค้าล่าสุดเพื่อให้หน้าแอดมินกดง่าย
if (!global.recentCustomers) global.recentCustomers = {};

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

// 2. หน้าแอดมินแดชบอร์ด (/admin) สำหรับคลิกดูรายชื่อและกดปุ่มบวกยอดด่วน
app.get('/admin', (req, res) => {
    let customerListHTML = '';
    const recentCustomers = global.recentCustomers;
    
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
                    <button onclick="customPrompt('${psid}')" style="background: #ffc107; color: black; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer;">กำหนดเอง</button>
                </div>
            </div>
        `;
    }

    if (Object.keys(recentCustomers).length === 0) {
        customerListHTML = '<p style="color: #666; text-align: center;">ยังไม่มีประวัติลูกค้าทักเข้ามาในระบบ ลองให้ลูกค้าทักข้อความมาใหม่อีกครั้งครับ</p>';
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Admin Quick Dashboard</title>
            <style>
                body { font-family: sans-serif; background: #f0f2f5; padding: 20px; max-width: 650px; margin: auto; }
                h2 { color: #333; }
            </style>
        </head>
        <body>
            <h2>🚀 แผงควบคุมด่วนแอดมิน (Admin Quick Dashboard)</h2>
            <p>คลิกปุ่มเพื่อบวกยอดส่งเข้าแชทลูกค้าได้ทันทีโดยไม่ต้องหา PSID</p>
            <hr style="margin-bottom: 20px; border: 0; border-top: 1px solid #ccc;">
            ${customerListHTML}

            <script>
                function quickAction(psid, text) {
                    fetch('/admin-test?id=' + psid + '&text=' + encodeURIComponent(text))
                        .then(res => res.text())
                        .then(data => {
                            alert('สำเร็จ! ' + data);
                            location.reload();
                        })
                        .catch(err => alert('เกิดข้อผิดพลาด: ' + err));
                }

                function customPrompt(psid) {
                    let cmd = prompt("กรอกคำสั่งที่ต้องการ (เช่น ..250 หรือ Edit YYYY-MM-DD ลำดับ ยอด):");
                    if (cmd) {
                        quickAction(psid, cmd);
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

// 4. Webhook รับข้อความจาก Messenger
app.post('/webhook', (req, res) => {
    let body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(entry => {
            let webhook_event = entry.messaging[0];
            let senderPSID = webhook_event.sender.id;

            if (webhook_event.message && webhook_event.message.text) {
                let incomingText = webhook_event.message.text.trim();

                // บันทึกเก็บไว้ในรายการล่าสุดสำหรับหน้าแอดมิน
                global.recentCustomers[senderPSID] = {
                    lastMessage: incomingText,
                    time: new Date().toLocaleTimeString()
                };

                // ดึงวันที่ปัจจุบัน (YYYY-MM-DD)
                let today = new Date().toISOString().split('T')[0];
                if (!db[senderPSID]) db[senderPSID] = {};
                if (!db[senderPSID][today]) db[senderPSID][today] = [];

                let replyMessage = "";

                // ตรวจสอบคำสั่งบวกยอด (ขึ้นต้นด้วย . หรือ ..)
                if (incomingText.startsWith('.')) {
                    let amountStr = incomingText.replace(/^\.+/, ''); // ตัดจุดออก
                    let amount = parseFloat(amountStr);

                    if (!isNaN(amount)) {
                        let timeNow = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                        db[senderPSID][today].push({ time: timeNow, amount: amount });

                        // คำนวณยอดรวมของวัน
                        let total = db[senderPSID][today].reduce((sum, item) => sum + item.amount, 0);
                        
                        let listText = db[senderPSID][today].map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
                        replyMessage = `📅 [${today}] รายการประจำวัน:\n${listText}\n-------------------\n💰 ยอดรวมของวัน: ${total}`;
                    }
                } 
                // คำสั่งเคลียร์ข้อมูลประจำวัน (Clear)
                else if (incomingText.toLowerCase().startsWith('clear')) {
                    db[senderPSID][today] = [];
                    replyMessage = `🗑️ ล้างข้อมูลของวันที่ ${today} เรียบร้อยแล้ว`;
                }

                // ส่งข้อความตอบกลับถ้ามีข้อมูล
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

    let amount = parseFloat(text.replace(/^\.+/, ''));
    let replyMessage = "";

    if (!isNaN(amount)) {
        let timeNow = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        db[psid][today].push({ time: timeNow, amount: amount });

        let total = db[psid][today].reduce((sum, item) => sum + item.amount, 0);
        let listText = db[psid][today].map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
        replyMessage = `📅 [${today}] รายการประจำวัน:\n${listText}\n-------------------\n💰 ยอดรวมของวัน: ${total}`;
    } else {
        replyMessage = `⚙️ แอดมินสั่งการ: ${text}`;
    }

    // ส่งข้อความเข้าแชทลูกค้าผ่าน API ทันที
    sendMessengerMessage(psid, replyMessage);
    res.send(`✅ ประพฤติกรรมคำสั่ง "${text}" ให้ลูกค้า ID: ${psid} เรียบร้อยแล้ว!`);
});

// รันเซิร์ฟเวอร์บนพอร์ต 10000
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Webhook server is running on port ${PORT}`);
});
