const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// === Token และข้อมูลเพจของคุณ ===
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN || "EAAM6LCCIUjcBSxgNN8ZAx6udmU6H2KsSKRNhz66nQbm03BOu75xNlAQY4QweSWVjrxj7ZAP54HTteBLNsoZCzfW6wPwZCmXbctbxW0K2Ivzniouk7mZAGecRx3zAv8yWA5ZAe1qZCPZBQo9fQEpNsvdRvNXZBfLNDcj8Ue7ZAfjp16Yx6PiDSO2OFq7HOky7M3NSeKxo2gHgZDZD";
const VERIFY_TOKEN = "12345";
const MY_PAGE_ID = "1308276022380261"; 

// GitHub Config สำหรับเก็บข้อมูลเป็นไฟล์ JSON
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || "piyadee258910-dotcom";
const GITHUB_REPO = process.env.GITHUB_REPO || "fb-sum-bot";
const FILE_PATH = "user_logs.json";

// ฟังก์ชันดึงข้อมูลจากไฟล์ JSON บน GitHub
async function getGitHubFile() {
    try {
        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`;
        const response = await axios.get(url, {
            headers: { Authorization: `token ${GITHUB_TOKEN}` }
        });
        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        return { data: JSON.parse(content), sha: response.data.sha };
    } catch (error) {
        return { data: {}, sha: null };
    }
}

// ฟังก์ชันบันทึกข้อมูลอัปเดตลงไฟล์ JSON บน GitHub
async function saveGitHubFile(updatedData, sha) {
    try {
        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`;
        const contentEncoded = Buffer.from(JSON.stringify(updatedData, null, 2)).toString('base64');
        
        const body = {
            message: "Update user logs via bot",
            content: contentEncoded,
            sha: sha 
        };

        const response = await axios.put(url, body, {
            headers: { 
                Authorization: `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data.content.sha;
    } catch (error) {
        console.error("❌ บันทึกลง GitHub ไม่สำเร็จ:", error.response ? error.response.data : error.message);
    }
}

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

// 2. ส่วนสำหรับรับข้อความ Webhook จาก Facebook ปกติ
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        for (const entry of body.entry) {
            if (entry.messaging) {
                for (const webhookEvent of entry.messaging) {
                    
                    const messageObj = webhookEvent.message;
                    if (!messageObj) continue;

                    const messageText = messageObj.text ? messageObj.text.trim() : '';
                    if (!messageText) continue;

                    const senderId = webhookEvent.sender ? webhookEvent.sender.id : null;
                    if (!senderId || senderId === MY_PAGE_ID) continue;

                    console.log(`==> [Customer Message] ลูกค้า (${senderId}) ส่งเข้ามา: ${messageText}`);
                    await processSumMessage(senderId, messageText, senderId);
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// 3. 🚀 [Admin Shortcut Endpoint] สำหรับจำลองแอดมินยิงคำสั่งตรงหา PSID ของลูกค้า
// วิธีใช้: เปิดเบราว์เซอร์ไปที่ https://fb-sum-bot.onrender.com/admin-test?id=40596878549910707&text=..100
app.get('/admin-test', async (req, res) => {
    const targetChatId = req.query.id; // ดึง PSID ลูกค้าจาก URL
    const commandText = req.query.text; // ดึงข้อความคำสั่ง เช่น ..100 หรือ สรุป

    if (!targetChatId || !commandText) {
        return res.status(400).send("❌ กรุณาระบุ ?id=...&text=... ให้ครบถ้วน");
    }

    console.log(`==> [Admin Test API] สั่งการไปยังลูกค้า (${targetChatId}): ${commandText}`);
    await processSumMessage(targetChatId, commandText, targetChatId);

    res.status(200).send(`✅ ประมวลผลคำสั่ง "${commandText}" ให้ลูกค้า ID: ${targetChatId} เรียบร้อยแล้ว!`);
});

async function getDayData(chatId, dateStr) {
    const { data } = await getGitHubFile();
    if (!data[chatId] || !data[chatId][dateStr]) {
        return { total: 0, items: [] };
    }
    return data[chatId][dateStr];
}

async function saveDayData(chatId, dateStr, dayData) {
    const { data, sha } = await getGitHubFile();
    if (!data[chatId]) data[chatId] = {};
    data[chatId][dateStr] = dayData;
    await saveGitHubFile(data, sha);
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

async function processSumMessage(chatId, messageText, responseTargetId) {
    const lowerText = messageText.toLowerCase();
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

    if (messageText === '.') {
        sendInteractiveMenu(responseTargetId);
        return;
    }

    if (lowerText === 'clear') {
        const { data, sha } = await getGitHubFile();
        if (data[chatId]) {
            delete data[chatId];
            await saveGitHubFile(data, sha);
        }
        sendMessengerMessage(responseTargetId, `🗑️ รีเซ็ตยอดและรายการทั้งหมดเรียบร้อย | ยอดรวม: 0`);
        return;
    }

    if (lowerText.startsWith('clear ')) {
        const targetDate = parseDateInput(messageText.substring(6).trim());
        const { data, sha } = await getGitHubFile();
        if (data[chatId] && data[chatId][targetDate]) {
            delete data[chatId][targetDate];
            await saveGitHubFile(data, sha);
        }
        sendMessengerMessage(responseTargetId, `🗑️ ลบข้อมูลของวันที่ ${targetDate} เรียบร้อยแล้ว`);
        return;
    }

    if (lowerText === 'list' || lowerText === 'sum' || lowerText === 'ยอดรวมทั้งหมด') {
        const { data } = await getGitHubFile();
        if (!data[chatId] || Object.keys(data[chatId]).length === 0) {
            sendMessengerMessage(responseTargetId, `📅 ยังไม่มีรายการค้างในระบบ`);
            return;
        }

        let grandTotal = 0;
        let replyText = `📊 สรุปยอดค้างทั้งหมดทุกวัน:\n`;
        for (const [dateStr, dayData] of Object.entries(data[chatId])) {
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
        sendMessengerMessage(responseTargetId, replyText);
        return;
    }

    if (lowerText.startsWith('sum ') || lowerText === 'สรุป') {
        const targetDate = (messageText === 'สรุป') ? todayStr : parseDateInput(messageText.split(/\s+/)[1]);
        sendSpecificDateSummary(chatId, targetDate, responseTargetId);
        return;
    }

    if (messageText.startsWith('..')) {
        const addedNum = parseFloat(messageText.substring(2).trim());
        if (!isNaN(addedNum)) {
            let dayData = await getDayData(chatId, todayStr);
            dayData.items.push({ time: timeStr, amount: addedNum });
            dayData.total = dayData.items.reduce((sum, item) => sum + item.amount, 0);

            await saveDayData(chatId, todayStr, dayData);
            sendSpecificDateSummary(chatId, todayStr, responseTargetId);
        }
    }
}

async function sendSpecificDateSummary(chatId, dateStr, responseTargetId) {
    const dayData = await getDayData(chatId, dateStr);
    let replyText = `📅 [${dateStr}] รายการประจำวัน:\n`;

    if (dayData.items.length === 0) {
        replyText += `ยังไม่มีรายการในวันที่นี้`;
    } else {
        dayData.items.forEach((item, index) => {
            replyText += `${index + 1}. [${item.time}] +${item.amount}\n`;
        });
        replyText += `-------------------\n💰 ยอดรวมของวัน: ${dayData.total}`;
    }
    sendMessengerMessage(responseTargetId, replyText);
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
