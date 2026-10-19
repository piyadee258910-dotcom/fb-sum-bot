const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// รหัส Token ของ Facebook Page และ Verify Token
const PAGE_ACCESS_TOKEN = 'YOUR_PAGE_ACCESS_TOKEN_HERE';
const VERIFY_TOKEN = 'my_secure_verify_token_123';

const userTotals = {};

// 1. ส่วนสำหรับ Facebook ยืนยันตัวตน Webhook (Verification)
app.get('/sum', (req, res) => {
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
app.post('/sum', (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(entry => {
            const webhookEvent = entry.messaging[0];
            const senderId = webhookEvent.sender.id;

            if (webhookEvent.message && webhookEvent.message.text) {
                const messageText = webhookEvent.message.text.trim();

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
    .catch(err => console.error('Error sending message:', err));
}

// ใช้ Port ที่ Cloud hosting กำหนดให้
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Webhook server is running on port ${PORT}`);
});