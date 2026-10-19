const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// === ใส่ Token ของคุณลงในเครื่องหมายคำพูดตรงๆ ได้เลย ===
const PAGE_ACCESS_TOKEN = "EAAM6LCCIUjcBSxgNN8ZAx6udmU6H2KsSKRNhz66nQbm03BOu75xNlAQY4QweSWVjrxj7ZAP54HTteBLNsoZCzfW6wPwZCmXbctbxW0K2Ivzniouk7mZAGecRx3zAv8yWA5ZAe1qZCPZBQo9fQEpNsvdRvNXZBfLNDcj8Ue7ZAfjp16Yx6PiDSO2OFq7HOky7M3NSeKxo2gHgZDZD";
const VERIFY_TOKEN = "12345";

const userTotals = {};

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

// 2. ส่วนสำหรับรับข้อความแชทเพื่อบวกเลข
app.post('/webhook', (req, res) => {
    // พิมพ์ข้อมูลดิบทั้งหมดที่ Facebook ส่งมาลงใน Logs ของ Render เพื่อตรวจสอบ
    console.log("==> RECEIVED WEBHOOK BODY:", JSON.stringify(req.body, null, 2));

    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(entry => {
            // เช็กโครงสร้างป้องกัน Error กรณีทดสอบส่งจากหน้า Developer
            if (entry.messaging && entry.messaging[0]) {
                const webhookEvent = entry.messaging[0];
                const senderId = webhookEvent.sender.id;

                if (webhookEvent.message && webhookEvent.message.text) {
                    const messageText = webhookEvent.message.text.trim();
                    console.log(`==> ได้รับข้อความจาก Sender ID ${senderId}: ${messageText}`);

                    if (messageText.startsWith('.')) {
                        const numStr = messageText.substring(1).trim();
                        const addedNum = parseFloat(numStr);

                        if (!isNaN(addedNum)) {
                            if (!userTotals[senderId]) {
                                userTotals[senderId] = 0;
                            }

                            userTotals[senderId] += addedNum;

                            const replyText = `บวกเพิ่ม: ${addedNum} | ยอดรวมสะสม: ${userTotals[senderId]}`;
                            sendMessengerMessage(senderId, replyText);
                        }
                    }
                }
            }
        });

        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

function sendMessengerMessage(recipientId, text) {
    axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        recipient: { id: recipientId },
        message: { text: text }
    })
    .then(() => console.log(`==> ส่งข้อความหา ${recipientId} สำเร็จ`))
    .catch(err => console.error('Error sending message:', err.response ? err.response.data : err.message));
}

// ใช้ Port ที่ Cloud hosting กำหนดให้
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Webhook server is running on port ${PORT}`);
});
