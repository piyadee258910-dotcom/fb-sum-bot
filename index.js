const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(bodyParser.json());

// === Token และข้อมูลเพจของคุณ ===
const PAGE_ACCESS_TOKEN = "EAAM6LCCIUjcBSxgNN8ZAx6udmU6H2KsSKRNhz66nQbm03BOu75xNlAQY4QweSWVjrxj7ZAP54HTteBLNsoZCzfW6wPwZCmXbctbxW0K2Ivzniouk7mZAGecRx3zAv8yWA5ZAe1qZCPZBQo9fQEpNsvdRvNXZBfLNDcj8Ue7ZAfjp16Yx6PiDSO2OFq7HOky7M3NSeKxo2gHgZDZD";
const VERIFY_TOKEN = "12345";
const MY_PAGE_ID = "1308276022380261"; 

// === ตั้งค่าเชื่อมต่อ Supabase ===
const SUPABASE_URL = "https://ngnwpztrakicjtlwpfth.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DFlK6z20r5G42q0ig6bgmw_3UTjpTrq";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
            const pageId = entry.id;

            if (entry.messaging) {
                for (const webhookEvent of entry.messaging) {
                    const senderId = webhookEvent.sender ? webhookEvent.sender.id : null;
                    const recipientId = webhookEvent.recipient ? webhookEvent.recipient.id : null;

                    if (!senderId) continue;
                    if (senderId === recipientId) continue;

                    let targetChatId = recipientId; 

                    if (webhookEvent.message && webhookEvent.message.text) {
                        const messageText = webhookEvent.message.text.trim();
                        console.log(`==> ได้รับข้อความ | Target Chat/Group ID: ${targetChatId} | Sender: ${senderId} | ข้อความ: ${messageText}`);
                        
                        await processSumMessage(targetChatId, messageText, senderId);
                    }

                    if (webhookEvent.postback && webhookEvent.postback.payload) {
                        const payload = webhookEvent.postback.payload.trim();
                        console.log(`==> ได้รับปุ่มกด (Postback) | Target Chat/Group ID: ${targetChatId} | Sender: ${senderId} | Payload: ${payload}`);

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

async function getDayData(chatId, dateStr) {
    const { data, error } = await supabase
        .from('user_logs')
        .select('*')
        .eq('sender_id', chatId)
        .eq('date_str', dateStr)
        .single();

    if (error || !data) {
        return { total: 0, items: [] };
    }
    return { total: data.total, items: data.items };
}

async function saveDayData(chatId, dateStr, dayData) {
    const { error } = await supabase
        .from('user_logs')
        .upsert({ 
            sender_id: chatId, 
            date_str: dateStr, 
            total: dayData.total, 
            items: dayData.items 
        }, { 
            onConflict: 'sender_id,date_str' 
        });

    if (error) {
        console.error("❌ บันทึกลง Supabase ไม่สำเร็จ:", error.message);
    }
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

    // 1. ถ้าพิมพ์จุด (.) ตัวเดียว ให้เด้งปุ่มเมนู
    if (messageText === '.') {
        sendInteractiveMenu(senderId);
        return;
    }

    // 2. CLEAR ทั้งหมด
    if (lowerText === 'clear') {
        await supabase.from('user_logs').delete().eq('sender_id', chatId);
        sendMessengerMessage(senderId, `🗑️ รีเซ็ตยอดและรายการทั้งหมดเรียบร้อย | ยอดรวม: 0`);
        return;
    }

    // 3. CLEAR เฉพาะวัน
    if (lowerText.startsWith('clear ')) {
        const targetDate = parseDateInput(messageText.substring(6).trim());
        await supabase.from('user_logs').delete().eq('sender_id', chatId).eq('date_str', targetDate);
        sendMessengerMessage(senderId, `🗑️ ลบข้อมูลของวันที่ ${targetDate} เรียบร้อยแล้ว`);
        return;
    }

    // 4. SUM ทั้งหมด
    if (lowerText === 'sum' || lowerText === 'สรุป' || lowerText === 'list') {
        const { data: allRows } = await supabase.from('user_logs').select('*').eq('sender_id', chatId).order('date_str', { ascending: true });
        if (!allRows || allRows.length === 0) {
            sendMessengerMessage(senderId, `📅 ยังไม่มีรายการค้างในระบบ`);
            return;
        }

        let grandTotal = 0;
        let replyText = `📊 สรุปยอดค้างทั้งหมดทุกวัน:\n`;
        allRows.forEach(row => {
            if (row.items && row.items.length > 0) {
                replyText += `\n📅 [${row.date_str}] รายการ:\n`;
                row.items.forEach((item, idx) => {
                    replyText += `  ${idx + 1}. [${item.time}] +${item.amount}\n`;
                });
                replyText += `  ยอดรวมวันนึ้: ${row.total}\n`;
                grandTotal += row.total;
            }
        });
        replyText += `-------------------\n💰 ยอดรวมสุทธิทุกวัน: ${grandTotal}`;
        sendMessengerMessage(senderId, replyText);
        return;
    }

    // 5. SUM เฉพาะวัน
    if (lowerText.startsWith('sum ') || lowerText.startsWith('สรุป ')) {
        const targetDate = parseDateInput(messageText.split(/\s+/)[1]);
        sendSpecificDateSummary(chatId, targetDate, senderId);
        return;
    }

    // 6. รองรับพิมพ์ยอดเงิน (เช่น .254) -> ดักจับหลังจุดแล้วนำมารวมทันที
    if (messageText.startsWith('.')) {
        const addedNum = parseFloat(messageText.substring(1).trim());
        if (!isNaN(addedNum)) {
            let dayData = await getDayData(chatId, todayStr);
            dayData.items.push({ time: timeStr, amount: addedNum });
            dayData.total = dayData.items.reduce((sum, item) => sum + item.amount, 0);

            await saveDayData(chatId, todayStr, dayData);
            sendSpecificDateSummary(chatId, todayStr, senderId);
        }
    }
}

async function sendSpecificDateSummary(chatId, dateStr, senderId) {
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
                        { type: "postback", title: "➕ เพิ่มยอดด่วน (.254)", payload: ".254" },
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
    .catch(err => console.error('Error sending message:', err.response ? err.response.data : err.message));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Webhook server is running on port ${PORT}`);
});
