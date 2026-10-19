const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// === Token ของคุณ ===
const PAGE_ACCESS_TOKEN = "EAAM6LCCIUjcBSxgNN8ZAx6udmU6H2KsSKRNhz66nQbm03BOu75xNlAQY4QweSWVjrxj7ZAP54HTteBLNsoZCzfW6wPwZCmXbctbxW0K2Ivzniouk7mZAGecRx3zAv8yWA5ZAe1qZCPZBQo9fQEpNsvdRvNXZBfLNDcj8Ue7ZAfjp16Yx6PiDSO2OFq7HOky7M3NSeKxo2gHgZDZD";
const VERIFY_TOKEN = "12345";

// โครงสร้างเก็บข้อมูล: userLogs[senderId] = { "2026-10-19": { total: 83, items: [...] } }
const userLogs = {};

// 1. ส่วนสำหรับ Facebook ยืนยันตัวตน Webhook (Verification)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// 2. ส่วนสำหรับรับข้อความแชท
app.post('/webhook', (req, res) => {
    console.log("==> RECEIVED WEBHOOK BODY:", JSON.stringify(req.body, null, 2));

    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(entry => {
            if (entry.messaging) {
                entry.messaging.forEach(webhookEvent => {
                    const senderId = webhookEvent.sender ? webhookEvent.sender.id : null;
                    const recipientId = webhookEvent.recipient ? webhookEvent.recipient.id : null;

                    if (webhookEvent.message && webhookEvent.message.text && senderId) {
                        const messageText = webhookEvent.message.text.trim();
                        
                        if (senderId === recipientId) {
                            return;
                        }

                        console.log(`==> [Messenger Chat] ได้รับข้อความจาก ${senderId}: ${messageText}`);
                        processSumMessage(senderId, messageText);
                    }
                });
            }
        });

        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// ฟังก์ชันแปลงวันที่ให้เป็นรูปแบบมาตรฐาน YYYY-MM-DD
function parseDateInput(inputStr) {
    inputStr = inputStr.trim();
    const parts = inputStr.split('/');
    if (parts.length === 3) {
        let day = parts[0].padStart(2, '0');
        let month = parts[1].padStart(2, '0');
        let year = parseInt(parts[2]);
        if (year > 2500) {
            year -= 543;
        }
        return `${year}-${month}-${day}`;
    }
    return inputStr; 
}

// ฟังก์ชันประมวลผลข้อความ
function processSumMessage(senderId, messageText) {
    const lowerText = messageText.toLowerCase();

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

    if (!userLogs[senderId]) {
        userLogs[senderId] = {};
    }

    // --- 1. จัดการคำสั่ง CLEAR ---
    if (lowerText === 'clear') {
        userLogs[senderId] = {}; 
        sendMessengerMessage(senderId, `🗑️ รีเซ็ตยอดและรายการทั้งหมดทุกวันเรียบร้อย | ยอดรวม: 0`);
        return;
    }
    if (lowerText.startsWith('clear ')) {
        const rawDate = messageText.substring(6);
        const targetDate = parseDateInput(rawDate);
        if (userLogs[senderId][targetDate]) {
            delete userLogs[senderId][targetDate];
            sendMessengerMessage(senderId, `🗑️ ลบข้อมูลของวันที่ ${targetDate} เรียบร้อยแล้ว`);
        } else {
            sendMessengerMessage(senderId, `❌ ไม่พบข้อมูลของวันที่ ${targetDate}`);
        }
        return;
    }

    // --- 2. จัดการคำสั่ง SUM หรือ สรุป ---
    if (lowerText === 'sum' || lowerText === 'สรุป' || lowerText === 'list') {
        sendTotalSummary(senderId);
        return;
    }
    if (lowerText.startsWith('sum ') || lowerText.startsWith('สรุป ')) {
        const rawDate = messageText.split(' ')[1];
        const targetDate = parseDateInput(rawDate);
        sendSpecificDateSummary(senderId, targetDate);
        return;
    }

    // --- 3. บวกลบเลขปกติ (ขึ้นต้นด้วยจุด) บันทึกลง "วันนี้" ---
    if (messageText.startsWith('.')) {
        const numStr = messageText.substring(1).trim();
        const addedNum = parseFloat(numStr);

        if (!isNaN(addedNum)) {
            if (!userLogs[senderId][todayStr]) {
                userLogs[senderId][todayStr] = { total: 0, items: [] };
            }

            userLogs[senderId][todayStr].total += addedNum;
            userLogs[senderId][todayStr].items.push({ time: timeStr, amount: addedNum });

            sendSpecificDateSummary(senderId, todayStr);
        }
    }
}

// ฟังก์ชันแสดงสรุปยอดรวมทั้งหมดทุกวันที่ค้างอยู่ (เอาวันที่ขึ้นก่อน)
function sendTotalSummary(senderId) {
    const allDates = Object.keys(userLogs[senderId]);
    if (allDates.length === 0) {
        sendMessengerMessage(senderId, `📅 ยังไม่มีรายการค้างในระบบ`);
        return;
    }

    allDates.sort(); 
    let grandTotal = 0;
    let replyText = `📊 สรุปยอดค้างทั้งหมดทุกวัน:\n`;

    allDates.forEach(dateStr => {
        const dayData = userLogs[senderId][dateStr];
        if (dayData.items.length > 0) {
            replyText += `\n📅 [${dateStr}] รายการ:\n`;
            dayData.items.forEach((item, idx) => {
                replyText += `  ${idx + 1}. [${item.time}] +${item.amount}\n`;
            });
            replyText += `  ยอดรวมวันนึ้: ${dayData.total}\n`;
            grandTotal += dayData.total;
        }
    });

    replyText += `-------------------\n💰 ยอดรวมสุทธิทุกวัน: ${grandTotal}`;
    sendMessengerMessage(senderId, replyText);
}

// ฟังก์ชันแสดงสรุปยอดเฉพาะวันที่เลือก (เอาวันที่ขึ้นก่อน)
function sendSpecificDateSummary(senderId, dateStr) {
    const dayData = userLogs[senderId][dateStr];
    let replyText = `📅 [${dateStr}] รายการประจำวัน:\n`;

    if (!dayData || dayData.items.length === 0) {
        replyText += `ยังไม่มีรายการในวันที่นี้`;
    } else {
        dayData.items.forEach((item, index) => {
            replyText += `${index + 1}. [${item.time}] +${item.amount}\n`;
        });
        replyText += `-------------------\n💰 ยอดรวมของวัน: ${dayData.total}`;
    }

    sendMessengerMessage(senderId, replyText);
}

function sendMessengerMessage(recipientId, text) {
    if (recipientId === "12334" || recipientId.length < 5) {
        console.log(`==> ข้ามการส่งข้อความตอบกลับเนื่องจากเป็น Test ID: ${recipientId}`);
        return;
    }

    axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        recipient: { id: recipientId },
        message: { text: text }
    })
    .then(() => console.log(`==> ส่งข้อความหา ${recipientId} สำเร็จ`))
    .catch(err => console.error('Error sending message:', err.response ? err.response.data : err.message));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Webhook server is running on port ${PORT}`);
});
