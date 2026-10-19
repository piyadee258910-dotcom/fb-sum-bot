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

// 2. ส่วนสำหรับรับข้อความแชท
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        for (const entry of body.entry) {
            const pageId = entry.id;

            if (entry.messaging) {
                for (const webhookEvent of entry.messaging) {
                    const senderId = webhookEvent.sender ? webhookEvent.sender.id : null;
                    const recipientId = webhookEvent.recipient ? webhookEvent.recipient.id : null;

                    if (webhookEvent.message && webhookEvent.message.text && senderId) {
                        const messageText = webhookEvent.message.text.trim();
                        
                        if (senderId === recipientId) continue;

                        console.log(`==> ได้รับข้อความจาก sender: ${senderId}, recipient: ${recipientId}, pageId: ${pageId}`);
                        
                        // 🔍 [จุดที่แก้ไข]: 
                        // - ถ้า senderId ไม่ใช่เพจ (แปลว่าลูกค้าพิมพ์มา) ให้ข้าม (ไม่รับคำสั่งจากลูกค้า)
                        const isFromPage = (senderId === pageId || senderId === MY_PAGE_ID);
                        if (!isFromPage) {
                            console.log(`==> ข้ามข้อความจากลูกค้า (${senderId}): ${messageText}`);
                            continue;
                        }

                        // ถ้าแอดมินพิมพ์ส่งในแชทไหน แชทนั้น (recipientId) คือเป้าหมายที่จะบันทึกยอดและส่งข้อความตอบกลับ
                        const targetChatId = recipientId;

                        console.log(`==> ได้รับคำสั่งจากแอดมิน ส่งไปยังแชทลูกค้า: ${targetChatId} -> ข้อความ: ${messageText}`);
                        await processSumMessage(targetChatId, messageText, targetChatId);
                    }
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// ฟังก์ชันดึงข้อมูลจาก Supabase
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

// ฟังก์ชันบันทึกข้อมูลลง Supabase
async function saveDayData(chatId, dateStr, dayData) {
    const { data } = await supabase
        .from('user_logs')
        .select('id')
        .eq('sender_id', chatId)
        .eq('date_str', dateStr)
        .single();

    if (data) {
        await supabase
            .from('user_logs')
            .update({ total: dayData.total, items: dayData.items })
            .eq('sender_id', chatId)
            .eq('date_str', dateStr);
    } else {
        await supabase
            .from('user_logs')
            .insert([{ sender_id: chatId, date_str: dateStr, total: dayData.total, items: dayData.items }]);
    }
}

// ฟังก์ชันแปลงวันที่
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

// ฟังก์ชันประมวลผลข้อความหลัก
async function processSumMessage(chatId, messageText, targetChatId) {
    const lowerText = messageText.toLowerCase();
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

    // --- CLEAR ทั้งหมด ---
    if (lowerText === 'clear') {
        await supabase.from('user_logs').delete().eq('sender_id', chatId);
        sendMessengerMessage(targetChatId, `🗑️ รีเซ็ตยอดและรายการทั้งหมดทุกวันเรียบร้อย | ยอดรวม: 0`);
        return;
    }

    // --- CLEAR เฉพาะวัน ---
    if (lowerText.startsWith('clear ')) {
        const targetDate = parseDateInput(messageText.substring(6).trim());
        await supabase.from('user_logs').delete().eq('sender_id', chatId).eq('date_str', targetDate);
        sendMessengerMessage(targetChatId, `🗑️ ลบข้อมูลของวันที่ ${targetDate} เรียบร้อยแล้ว`);
        return;
    }

    // --- EDIT รายการ ---
    if (lowerText.startsWith('edit ')) {
        const parts = messageText.split(/\s+/);
        if (parts.length >= 4) {
            const targetDate = parseDateInput(parts[1]);
            const indexNo = parseInt(parts[2]) - 1;
            const newAmount = parseFloat(parts[3]);

            let dayData = await getDayData(chatId, targetDate);
            if (dayData.items[indexNo] !== undefined && !isNaN(newAmount)) {
                dayData.items[indexNo].amount = newAmount;
                dayData.items[indexNo].time = timeStr;

                dayData.total = dayData.items.reduce((sum, item) => sum + item.amount, 0);

                await saveDayData(chatId, targetDate, dayData);
                sendMessengerMessage(targetChatId, `✏️ แก้ไขรายการที่ ${parts[2]} วันที่ ${targetDate} เป็น +${newAmount} สำเร็จ!`);
                sendSpecificDateSummary(chatId, targetDate, targetChatId);
            } else {
                sendMessengerMessage(targetChatId, `❌ แก้ไขไม่สำเร็จ: ไม่พบวันที่หรือลำดับรายการที่ระบุ`);
            }
        }
        return;
    }

    // --- SUM ทั้งหมด ---
    if (lowerText === 'sum' || lowerText === 'สรุป' || lowerText === 'list') {
        const { data: allRows } = await supabase.from('user_logs').select('*').eq('sender_id', chatId).order('date_str', { ascending: true });
        if (!allRows || allRows.length === 0) {
            sendMessengerMessage(targetChatId, `📅 ยังไม่มีรายการค้างในระบบ`);
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
        sendMessengerMessage(targetChatId, replyText);
        return;
    }

    // --- SUM เฉพาะวัน ---
    if (lowerText.startsWith('sum ') || lowerText.startsWith('สรุป ')) {
        const targetDate = parseDateInput(messageText.split(/\s+/)[1]);
        sendSpecificDateSummary(chatId, targetDate, targetChatId);
        return;
    }

    // --- บวกลบเลขปกติ (.) ---
    if (messageText.startsWith('.')) {
        const addedNum = parseFloat(messageText.substring(1).trim());
        if (!isNaN(addedNum)) {
            let dayData = await getDayData(chatId, todayStr);
            dayData.items.push({ time: timeStr, amount: addedNum });
            dayData.total = dayData.items.reduce((sum, item) => sum + item.amount, 0);

            await saveDayData(chatId, todayStr, dayData);
            sendSpecificDateSummary(chatId, todayStr, targetChatId);
        }
    }
}

async function sendSpecificDateSummary(chatId, dateStr, targetChatId) {
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
    sendMessengerMessage(targetChatId, replyText);
}

function sendMessengerMessage(recipientId, text) {
    if (!recipientId || recipientId === "12334" || recipientId.length < 5) return;

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
