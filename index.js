const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// === Token และข้อมูลเพจของคุณ ===
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN || "EAAM6LCCIUjcBSxgNN8ZAx6udmU6H2KsSKRNhz66nQbm03BOu75xNlAQY4QweSWVjrxj7ZAP54HTteBLNsoZCzfW6wPwZCmXbctbxW0K2Ivzniouk7mZAGecRx3zAv8yWA5ZAe1qZCPZBQo9fQEpNsvdRvNXZBfLNDcj8Ue7ZAfjp16Yx6PiDSO2OFq7HOky7M3NSeKxo2gHgZDZD";
const VERIFY_TOKEN = "12345";
const MY_PAGE_ID = "1308276022380261"; 

// ฐานข้อมูลจำลองในหน่วยความจำชั่วคราว (หรือต่อยอดเก็บไฟล์)
let memoryDb = {};

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

// 2. ส่วนสำหรับรับข้อความแชทและปุ่มกด
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        for (const entry of body.entry) {
            if (entry.messaging) {
                for (const webhookEvent of entry.messaging) {
                    const senderId = webhookEvent.sender ? webhookEvent.sender.id : null;
                    const recipientId = webhookEvent.recipient ? webhookEvent.recipient.id : null;

                    if (!senderId) continue;
                    if (senderId === recipientId) continue;

                    let targetChatId = senderId; 

                    if (webhookEvent.message && webhookEvent.message.text) {
                        const messageText = webhookEvent.message.text.trim();
                        console.log(`==> ได้รับข้อความ | Sender ID: ${targetChatId} | ข้อความ: ${messageText}`);
                        
                        await processSumMessage(targetChatId, messageText, senderId);
                    }

                    if (webhookEvent.postback && webhookEvent.postback.payload) {
                        const payload = webhookEvent.postback.payload.trim();
                        console.log(`==> ได้รับปุ่มกด (Postback) | Sender ID: ${targetChatId} | Payload: ${payload}`);

                        await processSumMessage(targetChatId, payload, senderId);
                    }
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

function getDayData(chatId, dateStr) {
    if (!memoryDb[chatId]) memoryDb[chatId] = {};
    if (!memoryDb[chatId][dateStr]) {
        return { total: 0, items: [] };
    }
    return memoryDb[chatId][dateStr];
}

function saveDayData(chatId, dateStr, dayData) {
    if (!memoryDb[chatId]) memoryDb[chatId] = {};
    memoryDb[chatId][dateStr] = dayData;
}

function parseDateInput(inputStr) {
    inputStr = inputStr.trim();
    const parts = inputStr.split('/');
    if (parts.length === 3) {
        let day = parts[0].padStart(2, '0');
        let month = parts[1].padStart(2, '0');
        let year = parseInt(parts[2]);
        if (year > 2500) year -= 543;
        return `${year}-${month}-${day}`;
    }
    return inputStr; 
}

async function processSumMessage(chatId, messageText, senderId) {
    const lowerText = messageText.toLowerCase();
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

    // 1. ถ้าพิมพ์จุด (.) ตัวเดียว ให้เด้งปุ่มเมนูโต้ตอบ
    if (messageText === '.') {
        sendInteractiveMenu(senderId);
        return;
    }

    // 2. CLEAR ทั้งหมด
    if (lowerText === 'clear') {
        if (memoryDb[chatId]) delete memoryDb[chatId];
        sendMessengerMessage(senderId, `🗑️ รีเซ็ตยอดและรายการทั้งหมดเรียบร้อย | ยอดรวม: 0`);
        return;
    }

    // 3. CLEAR เฉพาะวัน
    if (lowerText.startsWith('clear ')) {
        const targetDate = parseDateInput(messageText.substring(6).trim());
        if (memoryDb[chatId] && memoryDb[chatId][targetDate]) {
            delete memoryDb[chatId][targetDate];
        }
        sendMessengerMessage(senderId, `🗑️ ลบข้อมูลของวันที่ ${targetDate} เรียบร้อยแล้ว`);
        return;
    }

    // 4. SUM ทั้งหมด (ดูรายการทุกวัน)
    if (lowerText === 'list' || lowerText === 'sum' || lowerText === 'ยอดรวมทั้งหมด') {
        if (!memoryDb[chatId] || Object.keys(memoryDb[chatId]).length === 0) {
            sendMessengerMessage(senderId, `📅 ยังไม่มีรายการค้างในระบบ`);
            return;
        }

        let grandTotal = 0;
        let replyText = `📊 สรุปยอดค้างทั้งหมดทุกวัน:\n`;
        for (const [dateStr, dayData] of Object.entries(memoryDb[chatId])) {
            if (dayData.items && dayData.items.length > 0) {
                replyText += `\n📅 [${dateStr}] รายการ:\n`;
                dayData.items.forEach((item, idx) => {
                    replyText += `  ${idx + 1}. [${item.time}] +${item.amount}\n`;
                });
                replyText += `  ยอดรวมวันนึ้: ${dayData.total}\n`;
                grandTotal += dayData.total;
            }
        }
        replyText += `-------------------\n💰 ยอดรวมสุทธิทุกวัน: ${grandTotal}`;
        sendMessengerMessage(senderId, replyText);
        return;
    }

    // 5. SUM เฉพาะวัน หรือพิมพ์ "สรุป"
    if (lowerText.startsWith('sum ') || lowerText === 'สรุป') {
        const targetDate = (messageText === 'สรุป') ? todayStr : parseDateInput(messageText.split(/\s+/)[1]);
        sendSpecificDateSummary(chatId, targetDate, senderId);
        return;
    }

    // 6. รองรับพิมพ์ยอดเงินขึ้นต้นด้วยจุดสองจุด (เช่น ..254)
    if (messageText.startsWith('..')) {
        const addedNum = parseFloat(messageText.substring(2).trim());
        if (!isNaN(addedNum)) {
            let dayData = getDayData(chatId, todayStr);
            dayData.items.push({ time: timeStr, amount: addedNum });
            dayData.total = dayData.items.reduce((sum, item) => sum + item.amount, 0);

            saveDayData(chatId, todayStr, dayData);
            sendSpecificDateSummary(chatId, todayStr, senderId);
        }
    }
}

function sendSpecificDateSummary(chatId, dateStr, senderId) {
    const dayData = getDayData(chatId, dateStr);
    let replyText = `📅 [${dateStr}] รายการประจำวัน:\n`;

    if (dayData.items.length === 0) {
        replyText += `ยังไม่มีรายการในวันที่นี้`;
    } else {
        dayData.items.forEach((item, index) => {
            replyText += `${index + 1}. [${item.time}] +${item.amount}\n`;
        });
        replyText += `-------------------\n💰 ยอดรวมของวัน: ${dayData.total}`;
    }
    sendMessengerMessage(senderId, replyText);
}

function sendInteractiveMenu(recipientId) {
    axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        recipient: { id: recipientId },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "📌 กรุณาเลือกคำสั่งที่ต้องการทำต่อ:",
                    buttons: [
                        { type: "postback", title: "➕ เพิ่มยอดด่วน (..254)", payload: "..254" },
                        { type: "postback", title: "📊 ดูสรุปยอดวันนี้", payload: "สรุป" },
                        { type: "postback", title: "🗑️ ล้างข้อมูลวันนี้", payload: "clear" }
                    ]
                }
            }
        }
    })
    .catch(err => console.error('Error sending interactive menu:', err.response ? err.response.data : err.message));
}

function sendMessengerMessage(recipientId, text) {
    if (!recipientId || recipientId.length < 5) return;

    axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        recipient: { id: recipientId },
        message: { text: text }
    })
    .catch(err => console.error('Error ส่งข้อความผิดพลาด:', err.response ? err.response.data : err.message));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Webhook server is running on port ${PORT}`);
});
