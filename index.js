if (event.message.type === 'image') {
                    recentCustomers[userId] = { lastMessage: '🖼 [LINE ส่งรูปภาพ/สลิป]', time: getThaiTime() };
                    
                    try {
                        // 1. ดึง Content ของรูปภาพจาก LINE Messaging API
                        let messageId = event.message.id;
                        let lineMediaRes = await axios.get(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
                            headers: { 'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
                            responseType: 'arraybuffer'
                        });

                        let base64Image = Buffer.from(lineMediaRes.data).toString('base64');
                        let uniqueName = `uploads/line_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;

                        // 2. อัปโหลดรูปภาพขึ้น GitHub Repository
                        await axios.put(`https://api.github.com/repos/${GITHUB_REPO}/contents/${uniqueName}`, {
                            message: 'Upload image from LINE OA',
                            content: base64Image
                        }, { 
                            headers: { Authorization: `token ${GITHUB_TOKEN}` } 
                        });

                        let publicGithubUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${uniqueName}`;

                        // 3. ส่งรูปภาพพร้อมแคปชันเข้าไปที่ Telegram
                        await sendTelegramPhoto(publicGithubUrl, `🖼 <b>[LINE] ลูกค้า [${custName}] ส่งรูปภาพ/สลิปมาใหม่:</b>`);

                    } catch (err) {
                        console.error("❌ ดึงรูปหรือส่งรูปจาก LINE เข้า Telegram ไม่สำเร็จ:", err.response?.data || err.message);
                        await sendTelegramMessage(`🖼 <b>[LINE] ลูกค้า [${custName}] ส่งรูปภาพ/สลิปมาใหม่</b> (ไม่สามารถโหลดรูปภาพแสดงได้อัตโนมัติ)`);
                    }
                }
