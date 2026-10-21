const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json({ limit: '20mb' }));

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "your_verify_token_here";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN || "your_page_access_token_here";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; 
const GITHUB_REPO = process.env.GITHUB_REPO || "piyadee258910-dotcom/fb-sum-bot"; 

let db = {};
let recentCustomers = {};
let db = {};
let recentCustomers = {};

// ✨ เพิ่มฟังก์ชันดึงเวลาและวันที่ปัจจุบันของประเทศไทย (UTC+7) ตรงนี้ครับ
function getThaiTime() {
    return new Date().toLocaleTimeString('en-GB', { 
        timeZone: 'Asia/Bangkok', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
}

function getThaiDate() {
    let formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(new Date());
}
// 1. ฟังก์ชันดึงข้อมูลจาก GitHub
async function loadDataFromGitHub() {
    try {
        if (!GITHUB_TOKEN) return;
        let res = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/contents/database.json`, {
            headers: { Authorization: `token ${GITHUB_TOKEN}` }
        });
        let content = Buffer.from(res.data.content, 'base64').toString('utf8');
        db = JSON.parse(content);
        console.log("📥 โหลดข้อมูลจาก GitHub สำเร็จ!");
    } catch (err) {
        console.log("⚠️ ยังไม่มีไฟล์ database.json บน GitHub");
    }
}

// 2. ฟังก์ชันบันทึกข้อมูล database.json ลง GitHub
async function saveToGitHub() {
    if (!GITHUB_TOKEN) return;
    try {
        let path = 'database.json';
        let contentBase64 = Buffer.from(JSON.stringify(db, null, 2)).toString('base64');
        let sha = '';
        try {
            let fileRes = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
                headers: { Authorization: `token ${GITHUB_TOKEN}` }
            });
            sha = fileRes.data.sha;
        } catch (e) {}

        await axios.put(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
            message: 'Auto-update database.json via Bot',
            content: contentBase64,
            sha: sha
        }, {
            headers: { Authorization: `token ${GITHUB_TOKEN}` }
        });
    } catch (err) {
        console.error("❌ บันทึก GitHub ไม่สำเร็จ:", err.response?.data || err.message);
    }
}

loadDataFromGitHub();

// ฟังก์ชันส่งข้อความตัวอักษรทาง Messenger
async function sendMessengerMessage(recipientId, messageText) {
    try {
        if (!PAGE_ACCESS_TOKEN || PAGE_ACCESS_TOKEN === "your_page_access_token_here") return;
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: recipientId },
            message: { text: messageText }
        });
    } catch (error) {
        console.error("❌ Error sending message:", error.response?.data || error.message);
    }
}

// ฟังก์ชันส่งรูปภาพทาง Messenger
async function sendMessengerImage(recipientId, imageUrl) {
    try {
        if (!PAGE_ACCESS_TOKEN || PAGE_ACCESS_TOKEN === "your_page_access_token_here") return;
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: recipientId },
            message: {
                attachment: {
                    type: "image",
                    payload: {
                        url: imageUrl,
                        is_reusable: true
                    }
                }
            }
        });
        console.log("🖼️ ส่งรูปภาพสำเร็จ PSID:", recipientId);
    } catch (error) {
        console.error("❌ Error sending image:", error.response?.data || error.message);
    }
}

// 3. หน้าแรก
app.get('/', (req, res) => {
    res.send("Webhook server is running successfully! 🚀");
});

// 4. หน้าแอดมินด่วน (/admin)
app.get('/admin', (req, res) => {
    let customerListHTML = '';
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
                    <a href="/customer" style="background: #6c757d; color: white; text-decoration: none; padding: 8px 12px; border-radius: 5px; display: inline-block;">จัดการรายชื่อ</a>
                </div>
            </div>
        `;
    }
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Admin Quick Dashboard</title></head>
        <body style="font-family: sans-serif; background: #f0f2f5; padding: 20px; max-width: 650px; margin: auto;">
            <h2>🚀 แผงควบคุมด่วนแอดมิน</h2>
            <p><a href="/customer" style="color: #007bff; font-weight: bold; text-decoration: none;">📋 ไปที่หน้าจัดการข้อมูลลูกค้าทั้งหมด (/customer)</a></p>
            <hr style="margin-bottom: 20px; border: 0; border-top: 1px solid #ccc;">
            ${customerListHTML || '<p style="color: #666;">ยังไม่มีประวัติลูกค้าทักเข้ามา</p>'}
            <script>
                function quickAction(psid, text) {
                    fetch('/admin-test?id=' + psid + '&text=' + encodeURIComponent(text))
                        .then(res => res.text()).then(data => { alert('สำเร็จ! ' + data); location.reload(); });
                }
            </script>
        </body>
        </html>
    `);
});

// 5. หน้าจัดการลูกค้า (/customer)
app.get('/customer', (req, res) => {
    let htmlContent = '';
    for (let psid in db) {
        let customerData = db[psid];
        let customerName = customerData.name || "ยังไม่ได้ตั้งชื่อเล่น";
        let totalAllDays = 0;
        let detailsHTML = '';

        for (let date in customerData) {
            if (date === 'name') continue;
            let items = customerData[date];
            if (!Array.isArray(items)) continue;

            let dayTotal = items.reduce((sum, item) => sum + item.amount, 0);
            totalAllDays += dayTotal;

            let itemsList = items.map((item, idx) => `
                <li style="margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center;">
                    <span>[${item.time}] +${item.amount}</span>
                    <div>
                        <button onclick="editItem('${psid}', '${date}', ${idx}, ${item.amount})" style="background: #ffc107; border: none; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">แก้ไข</button>
                        <button onclick="deleteItem('${psid}', '${date}', ${idx})" style="background: #dc3545; color: white; border: none; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 4px;">ลบ</button>
                    </div>
                </li>
            `).join('');

            detailsHTML += `
                <div style="background: #f9f9f9; padding: 10px; margin-top: 8px; border-radius: 6px; border-left: 4px solid #007bff;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong>📅 วันที่: ${date}</strong> (ยอดวันนี้: ${dayTotal})
                        <div>
                            <button onclick="sendReport('${psid}', 'daily', '${date}')" style="background: #17a2b8; color: white; border: none; padding: 3px 6px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-right: 4px;">📤 ส่งยอดรายวัน</button>
                            <button onclick="clearDay('${psid}', '${date}')" style="background: #ff851b; color: white; border: none; padding: 3px 6px; border-radius: 4px; cursor: pointer; font-size: 11px;">🗑️ เคลียร์วันนึ้</button>
                        </div>
                    </div>
                    <ul style="padding-left: 20px; margin: 5px 0 0 0;">${itemsList || '<li>ไม่มีรายการ</li>'}</ul>
                </div>
            `;
        }

        htmlContent += `
            <div style="background: #fff; padding: 20px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div>
                        <h3 style="margin: 0; color: #333;">👤 ชื่อเล่น: <span style="color: #007bff;">${customerName}</span></h3>
                        <p style="margin: 4px 0 0 0; color: #888; font-size: 12px;">PSID: ${psid}</p>
                        <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">ยอดสะสมรวมทั้งหมด: <strong>${totalAllDays} บาท</strong></p>
                    </div>
                    <div>
                        <button onclick="setName('${psid}', '${customerName === 'ยังไม่ได้ตั้งชื่อเล่น' ? '' : customerName}')" style="background: #17a2b8; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; margin-right: 5px;">✏️ ตั้งชื่อเล่น</button>
                        <button onclick="sendReport('${psid}', 'all', '')" style="background: #6610f2; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; margin-right: 5px;">📨 ส่งยอดทั้งหมด</button>
                        <button onclick="addAmount('${psid}')" style="background: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; margin-right: 5px;">+ เพิ่มยอด</button>
                        <button onclick="clearAllCustomer('${psid}')" style="background: #343a40; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer;">🔥 ล้างทั้งหมด</button>
                    </div>
                </div>

                <!-- ช่องพิมพ์ข้อความอิสระ และปุ่มส่งรูปภาพแบบแยกโหมด -->
                <div style="background: #eef2f7; padding: 10px; border-radius: 6px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <input type="text" id="customMsg_${psid}" placeholder="💬 พิมพ์ข้อความอิสระ..." style="flex: 1; min-width: 200px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
                    <button onclick="sendCustomMessage('${psid}')" style="background: #007bff; color: white; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-size: 14px; white-space: nowrap;">📨 ส่งข้อความ</button>
                    
                    <div style="width: 100%; display: flex; gap: 8px; align-items: center; margin-top: 5px; flex-wrap: wrap;">
                        <input type="file" id="imageFiles_${psid}" accept="image/*" multiple style="flex: 1; min-width: 220px; font-size: 13px; padding: 4px; background: #fff; border: 1px solid #ccc; border-radius: 4px;">
                        
                        <!-- ปุ่มเดิม: ส่งรูปต้นฉบับทันทีโดยไม่แก้ไขภาพ -->
                        <button onclick="sendOriginalImagesViaGitHub('${psid}')" style="background: #198754; color: white; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-size: 14px; white-space: nowrap;">🖼️ ส่งรูปภาพ (ไม่แก้ภาพ)</button>
                        
                        <!-- ปุ่มใหม่: แก้ไขราคาเป็น 0 บาท แล้วส่งทันที -->
                        <button onclick="processAndSendZeroPrice('${psid}')" style="background: #d63384; color: white; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-size: 14px; white-space: nowrap; font-weight: bold;">✨ แก้ไขราคา 0 บาท แล้วส่งทันที</button>
                    </div>
                </div>

                ${detailsHTML}
            </div>
        `;
    }

    if (Object.keys(db).length === 0) {
        htmlContent = '<p style="text-align: center; color: #666; padding: 40px;">ยังไม่มีข้อมูลประวัติการทำรายการในระบบครับ</p>';
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Customer Management - /customer</title></head>
        <body style="font-family: sans-serif; background: #f0f2f5; padding: 20px; max-width: 800px; margin: auto;">
            <h2>📋 ระบบจัดการข้อมูลลูกค้าและรายการทั้งหมด (/customer)</h2>
            <p><a href="/admin" style="color: #007bff; text-decoration: none;">⬅️ กลับไปหน้าแอดมินด่วน</a></p>
            <hr style="margin-bottom: 20px; border: 0; border-top: 1px solid #ccc;">
            ${htmlContent}
            <script>
                function setName(psid, currentName) {
                    let name = prompt("กรอกชื่อเล่นของลูกค้า:", currentName === 'ยังไม่ได้ตั้งชื่อเล่น' ? '' : currentName);
                    if (name !== null) {
                        fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setName', psid, name }) })
                        .then(res => res.text()).then(data => { alert(data); location.reload(); });
                    }
                }
                function addAmount(psid) {
                    let amount = prompt("กรอกจำนวนเงินที่ต้องการเพิ่ม:");
                    if (amount && !isNaN(amount)) {
                        fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', psid, amount: parseFloat(amount) }) })
                        .then(res => res.text()).then(data => { alert(data); location.reload(); });
                    }
                }
                function editItem(psid, date, index, oldAmount) {
                    let newAmount = prompt("แก้ไขจำนวนเงินใหม่:", oldAmount);
                    if (newAmount && !isNaN(newAmount)) {
                        fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'edit', psid, date, index, amount: parseFloat(newAmount) }) })
                        .then(res => res.text()).then(data => { alert(data); location.reload(); });
                    }
                }
                function deleteItem(psid, date, index) {
                    if (confirm("ต้องการลบรายการนี้ใช่หรือไม่?")) {
                        fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', psid, date, index }) })
                        .then(res => res.text()).then(data => { alert(data); location.reload(); });
                    }
                }
                function clearDay(psid, date) {
                    if (confirm("ต้องการเคลียร์ยอดของวันที่ " + date + " ทั้งหมดใช่หรือไม่?")) {
                        fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clearDay', psid, date }) })
                        .then(res => res.text()).then(data => { alert(data); location.reload(); });
                    }
                }
                function clearAllCustomer(psid) {
                    if (confirm("⚠️ คำเตือน: ต้องการลบข้อมูลและประวัติทั้งหมดของลูกค้ารายนี้ใช่หรือไม่?")) {
                        fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clearAll', psid }) })
                        .then(res => res.text()).then(data => { alert(data); location.reload(); });
                    }
                }
                function sendReport(psid, type, date) {
                    let msg = type === 'daily' ? ('ต้องการส่งสรุปยอดวันที่ ' + date + ' ไปหาลูกค้าใช่หรือไม่?') : ('ต้องการส่งสรุปยอดสะสมทั้งหมดไปหาลูกค้าใช่หรือไม่?');
                    if (confirm(msg)) {
                        fetch('/customer-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sendReport', psid, type, date }) })
                        .then(res => res.text()).then(data => { alert(data); });
                    }
                }
                function sendCustomMessage(psid) {
                    let inputElem = document.getElementById('customMsg_' + psid);
                    let message = inputElem.value.trim();
                    if (!message) { alert("กรุณากรอกข้อความก่อนส่งครับ"); return; }
                    fetch('/customer-action', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify({ action: 'sendCustom', psid, message }) 
                    })
                    .then(res => res.text()).then(data => { alert(data); inputElem.value = ''; });
                }

                // ปุ่มเดิม: ส่งรูปต้นฉบับทันทีโดยไม่แก้ไขภาพ
                async function sendOriginalImagesViaGitHub(psid) {
                    let fileInput = document.getElementById('imageFiles_' + psid);
                    if (fileInput.files.length === 0) {
                        alert("กรุณาเลือกไฟล์รูปภาพอย่างน้อย 1 รูปครับ");
                        return;
                    }
                    alert("กำลังอัปโหลดและส่งรูปภาพต้นฉบับ " + fileInput.files.length + " รูป กรุณารอสักครู่...");

                    for (let file of fileInput.files) {
                        await new Promise((resolve) => {
                            let reader = new FileReader();
                            reader.onload = function(e) {
                                let base64Data = e.target.result.split(',')[1];
                                fetch('/customer-action', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'uploadAndSendImage', psid, filename: file.name, fileData: base64Data })
                                })
                                .then(res => res.text())
                                .then(() => { setTimeout(resolve, 800); })
                                .catch(() => resolve());
                            };
                            reader.readAsDataURL(file);
                        });
                    }
                    alert("ส่งรูปภาพต้นฉบับทั้งหมดสำเร็จเรียบร้อย!");
                    fileInput.value = '';
                }

                // ปุ่มใหม่: แก้ไขราคาเป็น 0 บาท แล้วส่งทันที
                async function processAndSendZeroPrice(psid) {
                    let fileInput = document.getElementById('imageFiles_' + psid);
                    if (fileInput.files.length === 0) {
                        alert("กรุณาเลือกไฟล์รูปภาพอย่างน้อย 1 รูปครับ");
                        return;
                    }
                    alert("กำลังแก้ไขราคาเป็น 0 บาท และส่งภาพ " + fileInput.files.length + " รูป กรุณารอสักครู่...");

                    for (let file of fileInput.files) {
                        await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onload = function(e) {
                                const img = new Image();
                                img.onload = function() {
                                    const canvas = document.createElement('canvas');
                                    const ctx = canvas.getContext('2d');
                                    canvas.width = img.width;
                                    canvas.height = img.height;
                                    ctx.drawImage(img, 0, 0);

                                    // คำนวณพิกัดกลบราคาเดิมตามโค้ดของคุณ
                                    const sampleX = Math.round(img.width * 0.85); 
                                    const sampleY = Math.round(img.height * 0.52);
                                    const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
                                    const bgColor = \`rgb(\${pixel[0]}, \${pixel[1]}, \${pixel[2]})\`;

                                    const searchStartX = Math.round(img.width * 0.045);
                                    const searchWidth = Math.round(img.width * 0.25);
                                    const startY = Math.round(img.height * 0.48);
                                    const endY = Math.round(img.height * 0.55);

                                    let seatLabelY = -1;
                                    const imgData = ctx.getImageData(0, 0, img.width, img.height).data;

                                    for (let y = startY; y <= endY; y++) {
                                        for (let x = searchStartX; x <= searchStartX + searchWidth; x++) {
                                            const idx = (y * img.width + x) * 4;
                                            if (imgData[idx] > 160 && imgData[idx + 1] > 160 && imgData[idx + 2] > 160) {
                                                seatLabelY = y;
                                                break;
                                            }
                                        }
                                        if (seatLabelY !== -1) break;
                                    }

                                    let targetY = (seatLabelY !== -1) ? seatLabelY - (img.height * 0.035) : Math.round(img.height * 0.465);
                                    const rectX = img.width * 0.045;
                                    const rectWidth = img.width * 0.32;
                                    const rectHeight = img.height * 0.030;

                                    ctx.fillStyle = bgColor;
                                    ctx.fillRect(rectX, targetY, rectWidth, rectHeight);

                                    const fontSize = Math.round(img.height * 0.0135); 
                                    ctx.font = \`bold \${fontSize}px 'Sukhumvit Set', 'Segoe UI', Tahoma, sans-serif\`;
                                    ctx.fillStyle = '#E5A93C';
                                    ctx.textBaseline = 'top';
                                    ctx.fillText('0 บาท', rectX, targetY + (img.height * 0.005));

                                    let cleanedDataUrl = canvas.toDataURL('image/png');
                                    let base64Data = cleanedDataUrl.split(',')[1];
                                    let fileNamePng = file.name.replace(/\\.[^/.]+$/, "") + ".png";

                                    fetch('/customer-action', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'uploadAndSendImage', psid, filename: fileNamePng, fileData: base64Data })
                                    })
                                    .then(res => res.text())
                                    .then(() => { setTimeout(resolve, 800); })
                                    .catch(() => resolve());
                                };
                                img.src = e.target.result;
                            };
                            reader.readAsDataURL(file);
                        });
                    }
                    alert("แก้ไขราคาเป็น 0 บาท และส่งรูปภาพทั้งหมดสำเร็จเรียบร้อย!");
                    fileInput.value = '';
                }
            </script>
        </body>
        </html>
    `);
});

function sortItemsByTime(itemsArray) {
    return itemsArray.sort((a, b) => a.time.localeCompare(b.time));
}

// 6. API จัดการข้อมูลและส่งข้อความ
app.post('/customer-action', express.json({ limit: '20mb' }), async (req, res) => {
    let { action, psid, date, index, amount, type, name, message, filename, fileData } = req.body;
    let today = new Date().toISOString().split('T')[0];
    if (!db[psid]) db[psid] = {};

    let timeNow = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    if (action === 'setName') {
        db[psid].name = name;
        await saveToGitHub();
        return res.send("บันทึกชื่อเล่นสำเร็จ!");
    } else if (action === 'sendCustom') {
        if (!message) return res.status(400).send("ไม่มีข้อความที่ต้องการส่ง");
        await sendMessengerMessage(psid, message);
        return res.send("ส่งข้อความหาลูกค้าเรียบร้อยแล้ว");
    } else if (action === 'uploadAndSendImage') {
        if (!fileData || !filename) return res.status(400).send("ไม่พบข้อมูลไฟล์รูปภาพ");
        try {
            let uniqueName = `uploads/${Date.now()}_${filename.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
            
            await axios.put(`https://api.github.com/repos/${GITHUB_REPO}/contents/${uniqueName}`, {
                message: 'Upload image via admin panel',
                content: fileData
            }, {
                headers: { Authorization: `token ${GITHUB_TOKEN}` }
            });

            let publicImageUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${uniqueName}`;
            await sendMessengerImage(psid, publicImageUrl);
            return res.send("อัปโหลดและส่งรูปสำเร็จ");
        } catch (err) {
            console.error("❌ อัปโหลดรูปขึ้น GitHub ไม่สำเร็จ:", err.response?.data || err.message);
            return res.status(500).send("อัปโหลดรูปไม่สำเร็จ");
        }
    } else if (action === 'add') {
        if (!db[psid][today]) db[psid][today] = [];
        db[psid][today].push({ time: timeNow, amount: amount });
        
        sortItemsByTime(db[psid][today]);

        let total = db[psid][today].reduce((sum, item) => sum + item.amount, 0);
        let listText = db[psid][today].map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
        let reportMsg = `📅 [${today}] รายการประจำวัน:\n${listText}\n-------------------\n💰 ยอดรวมของวัน: ${total} บาท`;
        await sendMessengerMessage(psid, reportMsg);

        res.send("เพิ่มยอดและส่งข้อความหาลูกค้าสำเร็จ!");
    } else if (action === 'edit') {
        if (db[psid][date] && db[psid][date][index]) {
            db[psid][date][index].amount = amount;
            db[psid][date][index].time = timeNow;
            sortItemsByTime(db[psid][date]);
            res.send("แก้ไขข้อมูลและอัปเดตเวลาเรียบร้อย!");
        } else { return res.status(400).send("ไม่พบรายการ"); }
    } else if (action === 'delete') {
        if (db[psid][date] && db[psid][date][index] !== undefined) {
            db[psid][date].splice(index, 1);
            res.send("ลบรายการสำเร็จ!");
        } else { return res.status(400).send("ไม่พบรายการ"); }
    } else if (action === 'clearDay') {
        if (db[psid][date]) {
            db[psid][date] = [];
            res.send("เคลียร์ยอดประจำวันสำเร็จ!");
        } else { return res.status(400).send("ไม่พบข้อมูลวันที่ต้องการเคลียร์"); }
    } else if (action === 'clearAll') {
        delete db[psid];
        res.send("ลบข้อมูลทั้งหมดของลูกค้ารายนี้เรียบร้อยแล้ว!");
    } else if (action === 'sendReport') {
        let customerData = db[psid];
        if (!customerData) return res.status(400).send("ไม่พบข้อมูลลูกค้า");

        let reportMessage = "";
        if (type === 'daily') {
            let items = customerData[date] || [];
            let dayTotal = items.reduce((sum, item) => sum + item.amount, 0);
            let listText = items.map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
            reportMessage = `📅 สรุปยอดประจำวัน [${date}]:\n${listText || 'ไม่มีรายการ'}\n-------------------\n💰 ยอดรวมของวัน: ${dayTotal} บาท`;
        } else if (type === 'all') {
            let grandTotal = 0;
            let fullText = `📊 สรุปรายการยอดซื้อทั้งหมดของคุณ:\n`;
            for (let d in customerData) {
                if (d === 'name') continue;
                let items = customerData[d];
                if (!Array.isArray(items)) continue;
                let dTotal = items.reduce((sum, item) => sum + item.amount, 0);
                grandTotal += dTotal;
                fullText += `\n📅 วันที่ ${d}:\n` + items.map((item, idx) => `  - [${item.time}] +${item.amount}`).join('\n') + `\n  (ยอดรวมวันนี้: ${dTotal})`;
            }
            fullText += `\n-------------------\n💰 ยอดสะสมรวมทั้งหมด: ${grandTotal} บาท`;
            reportMessage = fullText;
        }

        await sendMessengerMessage(psid, reportMessage);
        return res.send("ส่งรายงานสรุปยอดไปหาลูกค้าทาง Messenger สำเร็จ!");
    } else { 
        return res.status(400).send("Action ไม่ถูกต้อง"); 
    }

    await saveToGitHub();
});

// 7. Webhook รับข้อความ Messenger ปกติ
app.post('/webhook', async (req, res) => {
    let body = req.body;
    if (body.object === 'page') {
        for (let entry of body.entry) {
            let webhook_event = entry.messaging[0];
            let senderPSID = webhook_event.sender.id;

            if (webhook_event.message && webhook_event.message.text) {
                let incomingText = webhook_event.message.text.trim();
                recentCustomers[senderPSID] = { lastMessage: incomingText, time: new Date().toLocaleTimeString() };

                let today = new Date().toISOString().split('T')[0];
                if (!db[senderPSID]) db[senderPSID] = {};
                if (!db[senderPSID][today]) db[senderPSID][today] = [];

                let replyMessage = "";
                if (incomingText.startsWith('.')) {
                    let amount = parseFloat(incomingText.replace(/^\.+/, ''));
                    if (!isNaN(amount)) {
                        let timeNow = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                        db[senderPSID][today].push({ time: timeNow, amount: amount });
                        
                        sortItemsByTime(db[senderPSID][today]);
                        await saveToGitHub();

                        let total = db[senderPSID][today].reduce((sum, item) => sum + item.amount, 0);
                        let listText = db[senderPSID][today].map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
                        replyMessage = `📅 [${today}] รายการประจำวัน:\n${listText}\n-------------------\n💰 ยอดรวมของวัน: ${total} บาท`;
                    }
                }
                if (replyMessage) await sendMessengerMessage(senderPSID, replyMessage);
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// 8. ลิงก์ทดสอบด่วน /admin-test
app.get('/admin-test', async (req, res) => {
    let psid = req.query.id;
    let text = req.query.text;
    if (!psid || !text) return res.send("❌ กรุณาระบุ ?id=PSID&text=ข้อความ");

    let today = new Date().toISOString().split('T')[0];
    if (!db[psid]) db[psid] = {};
    if (!db[psid][today]) db[psid][today] = [];

    let amount = parseFloat(text.replace(/^\.+/, ''));
    let replyMessage = "";
    if (!isNaN(amount)) {
        let timeNow = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        db[psid][today].push({ time: timeNow, amount: amount });
        
        sortItemsByTime(db[psid][today]);
        await saveToGitHub();

        let total = db[psid][today].reduce((sum, item) => sum + item.amount, 0);
        let listText = db[psid][today].map((item, idx) => `${idx + 1}. [${item.time}] +${item.amount}`).join('\n');
        replyMessage = `📅 [${today}] รายการประจำวัน:\n${listText}\n-------------------\n💰 ยอดรวมของวัน: ${total} บาท`;
    } else {
        replyMessage = `⚙️ แอดมิน: ${text}`;
    }

    await sendMessengerMessage(psid, replyMessage);
    res.send(`✅ ดำเนินการให้ PSID: ${psid} เรียบร้อย!`);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Webhook server is running on port ${PORT}`);
});
