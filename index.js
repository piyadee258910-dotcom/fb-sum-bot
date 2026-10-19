const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// === Token ของคุณ ===
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
    console.log("==> RECEIVED WEBHOOK BODY:", JSON.stringify(req.body, null, 2));

    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(entry => {
            
            // กรณีที่ 1: รับจากที่ผู้ใช้พิมพ์คุยจริงใน Messenger (messaging array)
            if (entry.messaging) {
                entry.messaging.forEach(webhookEvent => {
                    const senderId = webhookEvent.sender ? webhookEvent.sender.id : null;

                    if (webhookEvent.message && webhookEvent.message.text && senderId) {
                        const messageText = webhookEvent.message.text.trim();
                        console.log(`==> [Messenger Chat] ได้รับข้อความจาก ${senderId}: ${messageText}`);
                        
                        processSumMessage(senderId, messageText);
                    }
                });
            }

            // กรณีที่ 2: รับจากปุ่มกดทดสอบ (Test) ในหน้า Meta Developer (changes array)
            if (entry.changes) {
                entry.changes.forEach(change => {
                    if (change.field === 'messages' && change.value && change.value.message) {
                        const senderId = change.value.sender ? change.value.sender.id : "test_user";
                        const messageText = change.value.message.text ? change.value.message.text.trim() : "";
                        console.log(`==> [Test Button] ได้รับข้อมูลทดสอบ: ${messageText}`);
                        
                        // ถ้ากดทดสอบด้วยข้อความปกติ ให้จำลองบวกเลขสมมติ เช่น ส่ง .50 มาเทสต์
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

// ฟังก์ชันคำนวณบวกเลขสะสม
function processSumMessage(senderId, messageText) {
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

function sendMessengerMessage(recipientId, text) {
    // ถ้าเป็นการเทสต์จากหน้า Developer (ID เป็นเลขจำลองสั้นๆ) API อาจจะส่งกลับไม่ได้ ให้ข้ามการยิงหา Facebook เพื่อไม่ให้ขึ้น Error Log
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

// ใช้ Port ที่ Cloud hosting กำหนดให้
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Webhook server is running on port ${PORT}`);
});
