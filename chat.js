// تكوين Firebase المبدئي لمنع انهيار الصفحة
const firebaseConfig = {
  apiKey: "AIzaSyBM_LkZr59WM4fnTvW0CKbcj-y2V8Flqto",
  authDomain: "wasl-4f5cb.firebaseapp.com",
  projectId: "wasl-4f5cb",
  storageBucket: "wasl-4f5cb.firebasestorage.app",
  messagingSenderId: "754785038144",
  appId: "1:754785038144:web:ca48f718b71148ae3394a5",
  measurementId: "G-8TMN0ER8Z3"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const auth = firebase.auth();
const db = firebase.firestore();

// إخفاء قائمة المحظورين عند تحميل الصفحة
document.addEventListener("DOMContentLoaded", function() {
    const blockedContainer = document.getElementById("blockedUsersContainer");
    if (blockedContainer) {
        blockedContainer.style.display = "none";
    }
});

// متغيرات معرفات المستخدم الحالي في الشات النشط
let activeChatUserId = null; 
let currentActiveTargetId = null; 

// دالة نظام الترقية التلقائي للنظام الملكي
async function updateRoyalBadge(userId) {
    try {
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();
        if (!doc.exists) return;

        const data = doc.data();
        
        // حساب الأيام بناءً على تاريخ إنشاء الحساب (createdAt)
        const createdAt = data.createdAt ? data.createdAt.toDate() : new Date();
        const daysActive = Math.floor((new Date() - createdAt) / (1000 * 60 * 60 * 24));

        let badge = '📜'; // الافتراضي: خادم البلاط
        let roleTitle = "خادم البلاط";

        // حساب الرتب الملكية بناءً على المدة الزمنية
        if (daysActive >= 30) {
            badge = '👑'; // أمير
            roleTitle = "أمير";
        } else if (daysActive >= 7) {
            badge = '⚖️'; // بارون
            roleTitle = "بارون";
        } else if (daysActive >= 3) {
            badge = '🛡️'; // فارس
            roleTitle = "فارس";
        }

        // رتبة الملك مخصصة للمشرفين أو الحساب الموثق بملك
        if (data.role === 'admin' || data.isKing) {
            badge = '🏰'; 
            roleTitle = "الملك";
        }

        // تحديث البيانات في Firestore في حال حدوث ترقية جديدة فقط
        if (data.badge !== badge || data.roleTitle !== roleTitle) {
            await userRef.update({ 
                badge: badge,
                roleTitle: roleTitle
            });
        }
    } catch(e) {
        console.log("خطأ في جلب الرتبة الملكية:", e);
    }
}

auth.onAuthStateChanged((user) => {
    if (user) {
        // تشغيل نظام الترقية للمستخدم الحالي فور دخوله
        updateRoyalBadge(user.uid);
  
        db.collection("users").doc(user.uid).update({
            status: "online"
        }).catch(err => console.log(err));

        // طلب إذن الإشعارات بشكل آمن لتفادي الانهيار إذا لم تكن الميزة مدعومة
        try {
            if (typeof firebase.messaging === "function") {
                const messaging = firebase.messaging();
                Notification.requestPermission().then((permission) => {
                    if (permission === 'granted') {
                        messaging.getToken({ vapidKey: 'BGp2fqSEXHD6Ng1kPMlHf_EGBFHxvY4z_7BDprfeulkK9qncNSZh0iyjj4ISWyW5At4pvyM4bMplEA9xndlbcUk' })
                        .then((currentToken) => {
                            if (currentToken) {
                                db.collection('users').doc(user.uid).update({
                                    fcmToken: currentToken
                                });
                            }
                        });
                    }
                }).catch(err => console.log("إشعارات غير مدعومة:", err));
            }
        } catch(e) {
            console.log("إشعارات الهواتف غير مهيأة:", e);
        }

        // جلب بيانات الملف الشخصي
        db.collection("users").doc(user.uid).get().then((doc) => {
            if (doc.exists) {
                const usernameInput = document.getElementById('profileUsername');
                if (usernameInput) usernameInput.value = doc.data().username || "";
            }
        }).catch(err => console.log(err));
    }
});

// التحكم بالقوائم والنوافذ
window.toggleMenu = function(e) {
    e.stopPropagation();
    const dropdown = document.getElementById('dropdownMenu');
    if (dropdown) dropdown.classList.toggle('hidden');
}

document.addEventListener('click', function() {
    const dropdown = document.getElementById('dropdownMenu');
    if (dropdown) dropdown.classList.add('hidden');
});

window.openModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('hidden');
}

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('hidden');
}

window.closeModalOnOutsideClick = function(e, id) {
    if (e.target.id === id) { closeModal(id); }
}

window.toggleTheme = function() {
    document.body.classList.toggle('light-mode');
}

window.previewImage = function(event) {
    const reader = new FileReader();
    reader.onload = function() {
        const output = document.getElementById('avatarPreview');
        if (output) {
            output.innerText = "";
            output.style.backgroundImage = `url(${reader.result})`;
            output.style.backgroundSize = "cover";
        }
    }
    if (event.target.files[0]) {
        reader.readAsDataURL(event.target.files[0]);
    }
}

// إضافة جهة اتصال في القائمة الجانبية
window.addNewContact = async function() {
    const inputInput = document.getElementById('addSearchInput');
    if (!inputInput) return;
    const input = inputInput.value.trim();
    if (!input) return;

    try {
        const usersRef = db.collection('users');
        const querySnapshot = await usersRef.where('username', '==', input).get();
        
        let targetUid = null;
        if (!querySnapshot.empty) {
            targetUid = querySnapshot.docs[0].id;
        }

        const list = document.getElementById('contactsList');
        const item = document.createElement('div');
        item.classList.add('contact-item');
        item.innerHTML = `<div class="avatar">👤</div><div><h4>${input}</h4></div>`;
        
        item.onclick = function() {
            document.querySelectorAll('.contact-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            openPrivateChat(input, targetUid); 
        };

        list.appendChild(item);
        inputInput.value = "";
        closeModal('addPersonModal');
    } catch (e) { console.error(e); }
}



function openPrivateChat(name, targetId) {
    // تحديث المعرفات النشطة ليتمكن زر الإرسال من التعرف على المستخدم
    activeChatUserId = targetId;
    window.activeChatUserId = targetId;
    currentActiveTargetId = targetId;

    const activeName = document.getElementById('activeChatName');
    const activeStatus = document.getElementById('activeChatStatus');
    const chatArea = document.getElementById('chatArea');
    const chatForm = document.getElementById('chatForm');
    const chatMessages = document.getElementById('chatMessages');

    if (activeName) activeName.innerText = name;
    if (activeStatus) activeStatus.innerText = targetId ? "متصل حالياً" : "حساب ظاهري (لا يمكن المراسلة)";
    
    if (chatArea) chatArea.classList.remove('hidden');
    
    // إخفاء صندوق الكتابة إذا كان الحساب وهمياً ولا يملك ID
    if (chatForm) {
        targetId ? chatForm.classList.remove('hidden') : chatForm.classList.add('hidden');
    }
    
    if (chatMessages) {
        chatMessages.innerHTML = `<div class="welcome-chat">🔒 هذه بداية محادثتك الخاصة والمشفرة مع ${name}</div>`;
    }
    
    // جلب الرسائل إذا كان هناك ID حقيقي
    if (targetId && typeof loadPrivateMessages === 'function') {
        loadPrivateMessages();
    }
    
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.add('hidden-mobile');
    }
}


window.backToSidebar = function() {
    const chatArea = document.getElementById('chatArea');
    const sidebar = document.getElementById('sidebar');
    if (chatArea) chatArea.classList.add('hidden');
    if (sidebar) sidebar.classList.remove('hidden-mobile');
}

window.sendPrivateMessage = async function() {
    console.log("🚀 تم الضغط على زر الإرسال!");

    const input = document.getElementById('messageInput');
    if (!input) {
        console.error("❌ خطأ: لا يوجد عنصر بـ ID اسمه messageInput في صفحة الـ HTML!");
        alert("خطأ في تصميم الصفحة: حقل الكتابة غير موجود.");
        return;
    }

    const text = input.value.trim();
    console.log("📝 النص الموجود:", text);

    if(!text) {
        console.log("⚠️ النص فارغ، لن يتم الإرسال.");
        return;
    }

        const currentUserId = localStorage.getItem('lastSelectedUserId');
console.log("👤 المستخدم المستهدف الذي تم استخراجه من الذاكرة:", currentUserId);


    if (!currentUserId) {
        console.error("❌ لا يوجد مستخدم نشط!");
        alert("الرجاء اختيار مستخدم لبدء المحادثة معه أولاً!");
        return;
    }

    if (!auth.currentUser) {
        console.error("❌ المستخدم غير مسجل دخول!");
        return;
    }

    const myUid = auth.currentUser.uid;
    try {
        const blockCheck = await db.collection('users').doc(myUid).collection('blockedUsers').doc(currentUserId).get();
        if (blockCheck.exists) {
            alert("لا يمكنك إرسال رسائل إلى مستخدم قمت بحظره!");
            return;
        }

        await db.collection('messages').add({
    text: text,
    senderId: myUid,
    receiverId: currentUserId,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    read: false,
    replyTo: window.replyingToMessage ? window.replyingToMessage.text : null 
});

cancelReply();

        
        console.log("✅ تم إرسال الرسالة بنجاح!");
        input.value = "";
        const box = document.getElementById('chatMessages');
        if (box) box.scrollTop = box.scrollHeight;
        } catch(error) {
        // هذا التنبيه سيظهر لك رسالة الخطأ على شاشة هاتفك مباشرة
        alert("🚨 سبب فشل الإرسال: " + error.message);
        console.error("خطأ تفصيلي:", error);
    }

}


// كود إرسال حالة "جاري الكتابة"
const messageInput = document.getElementById('messageInput');
if (messageInput) {
    messageInput.addEventListener('input', () => {
        const currentUserId = window.activeChatUserId || currentActiveTargetId;
        if (currentUserId && auth.currentUser) {
            db.collection('users').doc(auth.currentUser.uid).update({
                typingTo: currentUserId
            }).catch(e => console.log(e));
        }
    });
}

window.saveProfile = function() {
    alert("💾 تم حفظ تعديلات الملف الشخصي المحدث بنجاح!");
    closeModal('profileModal');
}

window.deleteAccountPermanently = function() {
    if(confirm("⚠️ هل أنت متأكد من حذف الحساب نهائياً؟")) {
        window.location.href = "index.html";
    }
}

// جلب مستخدمي فايربيس الحقيقيين وعرضهم في القائمة بالتحديثات الملكية
db.collection('users').onSnapshot((snapshot) => {
    const userList = document.getElementById('contactsList'); 
    if (!userList) return;

    if (snapshot.empty) {
        userList.innerHTML = '<p class="empty-msg">لا يوجد أشخاص مضافين حالياً. اضغط على (+) في الأسفل لإضافة صديق.</p>';
        return;
    }

    userList.innerHTML = '';

    snapshot.forEach((doc) => {
        const userData = doc.data();
        if (auth.currentUser && doc.id === auth.currentUser.uid) return;
        
        // تشغيل فحص وتحديث الرتبة لكل مستخدم يظهر في القائمة تلقائياً
        updateRoyalBadge(doc.id);

        const isTyping = auth.currentUser ? (userData.typingTo === auth.currentUser.uid) : false;
        const currentRole = userData.roleTitle || "خادم البلاط";
        const currentBadge = userData.badge || "📜";
        
        const statusText = isTyping ? "✏️ يكتب الآن..." : (userData.status === 'online' ? `🟢 متصل | ${currentRole}` : `⚪ غير متصل | ${currentRole}`);
        const statusColor = isTyping ? "#f59e0b" : (userData.status === 'online' ? '#22c55e' : '#64748b');

        const userItem = document.createElement('div');
        userItem.classList.add('contact-item'); 
                
        userItem.innerHTML = `
            <div class="avatar">👤</div>
            <div>
                <h4>${userData.username || userData.email || "مستخدم مجهول"} ${currentBadge}</h4>
                <span style="font-size: 10px; color: ${statusColor}">${statusText}</span>
            </div>
        `;

        userItem.onclick = () => {
          localStorage.setItem('lastSelectedUserId', doc.id);

            document.querySelectorAll('.contact-item').forEach(i => i.classList.remove('active'));
            userItem.classList.add('active');

            activeChatUserId = doc.id;
            window.activeChatUserId = doc.id;
            currentActiveTargetId = doc.id; 

            const activeChatName = document.getElementById('activeChatName');
            if (activeChatName) {
                activeChatName.innerHTML = `${userData.username || userData.email || "مستخدم مجهول"} <span style="font-size:16px;">${currentBadge}</span>`;
            }
            
            const activeChatStatus = document.getElementById('activeChatStatus');
            if (activeChatStatus) {
                activeChatStatus.innerText = `الرتبة الملكية: ${currentRole}`;
            }

            const chatForm = document.getElementById('chatForm');
            if (chatForm) chatForm.classList.remove('hidden');

            loadPrivateMessages();

            if (window.innerWidth <= 768) {
                const sidebar = document.getElementById('sidebar');
                if (sidebar) sidebar.classList.add('hidden-mobile');
                const chatArea = document.getElementById('chatArea');
                if (chatArea) chatArea.classList.remove('hidden');
            }
        };

        userList.appendChild(userItem);
    });
});

// دالة عرض الرسائل الخاصة
function loadPrivateMessages() {
    const currentUserId = window.activeChatUserId || activeChatUserId || currentActiveTargetId;
    if (!currentUserId || !auth.currentUser) return;

    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    if (window.privateChatUnsubscribe) {
        window.privateChatUnsubscribe();
    }

    window.privateChatUnsubscribe = db.collection('messages')
        .orderBy('timestamp')
        .onSnapshot((snapshot) => {
            chatMessages.innerHTML = ''; 

            snapshot.forEach((doc) => {
                const data = doc.data();
                const isSentByMe = data.senderId === auth.currentUser.uid && data.receiverId === currentUserId;
                const isReceivedFromHim = data.senderId === currentUserId && data.receiverId === auth.currentUser.uid;

              // تحديث الرسالة إلى مقروءة إذا كانت واردة لي
if (isReceivedFromHim && data.read === false) {
    doc.ref.update({ read: true });
}

                if (isSentByMe || isReceivedFromHim) {
                    const msgDiv = document.createElement('div');
                    msgDiv.classList.add('message', isSentByMe ? 'sent' : 'received');
// إضافة ميزة السحب للرد
let startX;
msgDiv.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
});

msgDiv.addEventListener('touchend', (e) => {
    let endX = e.changedTouches[0].clientX;
    // إذا سحب المستخدم أكثر من 50 بكسل لليمين
    if (endX - startX > 50) {
        showReplyBox(data.text); // استدعاء دالة إظهار صندوق الرد
        window.replyingToMessage = { id: doc.id, text: data.text }; // حفظ بيانات الرسالة للرد
    }
});

                  let statusHtml = '';
if (isSentByMe) {
    if (data.read === true) {
        statusHtml = '<span style="color: #34b7f1; font-size: 12px; margin-left: 5px; float: left;">✔✔</span>';
    } else {
        statusHtml = '<span style="color: #888; font-size: 12px; margin-left: 5px; float: left;">✔</span>';
    }
}

                    let reactionsHtml = '';
                    if (data.reactions) {
                        Object.keys(data.reactions).forEach(emoji => {
                            const count = data.reactions[emoji].length;
                            reactionsHtml += `<span class="reaction-badge">${emoji} ${count}</span>`;
                        });
                    }

                  

                    const actionButtonsHtml = isSentByMe ? `
                        <div class="message-actions" style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px; display: flex; justify-content: space-around;">
                            <span onclick="editMessage('${doc.id}', \`${data.text}\`)" style="cursor:pointer; font-size:12px;">✏️ تعديل</span>
                            <span onclick="deleteMessage('${doc.id}')" style="cursor:pointer; font-size:12px; color:#ef4444;">🗑️ حذف</span>
                        </div>
                    ` : '';

// تعريف متغير الرد
let replyHtml = '';
if (data.replyTo) {
    replyHtml = `<div style="background: rgba(255,255,255,0.1); padding: 6px; border-radius: 8px; font-size: 13px; margin-bottom: 6px; border-left: 3px solid #34b7f1; color: #fff;">رد على: ${data.replyTo}</div>`;
}

// رسم الرسالة بالكامل
msgDiv.innerHTML = `
    <div class="message-text">${data.text} ${statusHtml}</div>
    <div class="reactions-container">${reactionsHtml}</div>
    <div id="emoji-menu-${doc.id}" class="emoji-menu" style="display:none;">
        <div class="emojis-row" style="display:flex; justify-content:space-around; margin-bottom:4px;">
            <span onclick="addReaction('${doc.id}', '❤️')">❤️</span>
            <span onclick="addReaction('${doc.id}', '👍')">👍</span>
            <span onclick="addReaction('${doc.id}', '😂')">😂</span>
            <span onclick="addReaction('${doc.id}', '💚')">💚</span>
        </div>
    </div>
    ${actionButtonsHtml}
`;


                    setupLongPress(msgDiv, doc.id);
                    
                    const time = data.timestamp ? data.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
                    const timeDiv = document.createElement('div');
                    timeDiv.style.fontSize = "10px";
                    timeDiv.style.marginTop = "4px";
                    timeDiv.style.opacity = "0.7";
                    timeDiv.innerText = time;
                    msgDiv.appendChild(timeDiv);

                    chatMessages.appendChild(msgDiv);
                } 
            }); 

            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
}

// الاستماع الآمن لحدث اختيار صورة (مع الفحص لمنع تعطل الأكواد)
const imageInputEl = document.getElementById('imageInput');
if (imageInputEl) {
    imageInputEl.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const storageRef = firebase.storage().ref('chat_images/' + Date.now() + file.name);
        storageRef.put(file).then(snapshot => {
            snapshot.ref.getDownloadURL().then(url => {
                db.collection('messages').add({
                    text: "📷 صورة",
                    imageUrl: url, 
                    senderId: auth.currentUser.uid,
                    receiverId: window.activeChatUserId || currentActiveTargetId, 
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
        }).catch(error => {
            console.error("خطأ في رفع الصورة: ", error);
            alert("حدث خطأ أثناء رفع الصورة");
        });
    });
}

function setupLongPress(element, messageId) {
    let pressTimer;
    element.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => {
            const menu = document.getElementById('emoji-menu-' + messageId);
            if (menu) {
                document.querySelectorAll('.emoji-menu').forEach(m => m.style.display = 'none');
                menu.style.display = 'block';
                menu.style.top = '-55px'; 
                menu.style.left = '50%';
                menu.style.transform = 'translateX(-50%)';
            }
        }, 800);
    });
    element.addEventListener('touchend', () => clearTimeout(pressTimer));
    element.addEventListener('touchmove', () => clearTimeout(pressTimer));
}

function addReaction(messageId, emoji) {
    if (!auth.currentUser) return;
    db.collection('messages').doc(messageId).update({
        [`reactions.${emoji}`]: firebase.firestore.FieldValue.arrayUnion(auth.currentUser.uid)
    }).then(() => {
        const menu = document.getElementById('emoji-menu-' + messageId);
        if (menu) menu.style.display = 'none';
    }).catch(e => console.log(e));
}

window.deleteMessage = function(messageId) {
    if (confirm("⚠️ هل تريد حذف هذه الرسالة للجميع؟")) {
        db.collection('messages').doc(messageId).delete()
        .then(() => { console.log("تم الحذف بنجاح"); })
        .catch(error => { console.error("خطأ بالحذف:", error); alert("لم نتمكن من حذف الرسالة."); });
    }
}

window.editMessage = function(messageId, currentText) {
    const newText = prompt("✏️ قم بتعديل رسالتك:", currentText);
    if (newText !== null && newText.trim() !== "") {
        db.collection('messages').doc(messageId).update({ text: newText.trim() })
        .then(() => { console.log("تم تعديل الرسالة بنجاح"); })
        .catch(error => { console.error("خطأ بالتعديل:", error); alert("لم نتمكن من تعديل الرسالة."); });
    }
}

window.openTargetProfile = async function() {
    if (!currentActiveTargetId) {
        alert("يرجى اختيار صديق أولاً لبدء المحادثة وعرض ملفه الشخصي.");
        return; 
    }
    try {
        const userDoc = await db.collection('users').doc(currentActiveTargetId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            // إضافة الرتبة واللقب في الملف الشخصي المعروض للصديق أيضاً
            const userBadge = userData.badge || "📜";
            const userRole = userData.roleTitle || "خادم البلاط";

            const nameEl = document.getElementById('targetFullName');
            if (nameEl) nameEl.innerText = (userData.fullName || userData.username || "لا يوجد اسم") + " " + userBadge;
            
            const userEl = document.getElementById('targetUsername');
            if (userEl) userEl.innerText = "@" + (userData.username || "بدون_مستخدم") + ` (${userRole})`;
            
            const avatarDiv = document.getElementById('targetAvatar');
            if (avatarDiv) {
                if (userData.avatarUrl) {
                    avatarDiv.innerHTML = `<img src="${userData.avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                } else { avatarDiv.innerText = "💬"; }
            }

                        openModal('targetProfileModal');
        } else { 
            alert("لم يتم العثور على بيانات هذا المستخدم."); 
        }
    } catch (error) { 
        console.error("خطأ في جلب البيانات:", error); 
    }
}

window.handleBlockAction = async function() {
    if (!currentActiveTargetId || !auth.currentUser) return;
    if (confirm("هل أنت متأكد من أنك تريد حظر هذا المستخدم؟ لن تتمكنا من المراسلة مجدداً.")) {
        const myUid = auth.currentUser.uid;
        try {
            await db.collection('users').doc(myUid).collection('blockedUsers').doc(currentActiveTargetId).set({
                blockedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert("تم الحظر بنجاح.");
            closeModal('targetProfileModal');
            location.reload();
        } catch (error) { 
            console.error("خطأ أثناء الحظر:", error); 
        }
    }
}

window.handleReportAction = async function() {
    if (!currentActiveTargetId || !auth.currentUser) return;

    const reason = prompt("يرجى كتابة سبب الإبلاغ عن هذا المستخدم:");
    if (reason === null) return; 
    if (reason.trim() === "") {
        alert("يجب كتابة سبب للإبلاغ.");
        return;
    }

    try {
        await db.collection('reports').add({
            reportedUserId: currentActiveTargetId,
            reportedBy: auth.currentUser.uid,
            reason: reason.trim(),
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert("🚨 تم تقديم الإبلاغ بنجاح للإدارة وسنراجع الحالة فوراً.");
        closeModal('targetProfileModal');
    } catch(e) {
        console.error("خطأ في تقديم البلاغ:", e);
    }
}
/* ==========================================================================
   نظام المراسيم الملكية (الحالات - Stories)
   ========================================================================== */

// 1. دالة معاينة الصورة المختارة للمرسوم قبل الرفع
window.previewStoryImage = function(event) {
    const reader = new FileReader();
    reader.onload = function() {
        const output = document.getElementById('storyImagePreview');
        if (output) {
            output.innerHTML = `<img src="${reader.result}" style="max-width:100%; max-height:150px; border-radius:8px; border: 2px solid #f59e0b;">`;
        }
    }
    if (event.target.files[0]) {
        reader.readAsDataURL(event.target.files[0]);
    }
}

// 2. دالة نشر المرسوم الملكي الجديد وحفظه في Firebase
window.publishRoyalDecree = async function() {
    if (!auth.currentUser) {
        alert("يجب تسجيل الدخول أولاً لنشر مرسوم!");
        return;
    }

    const textInput = document.getElementById('storyTextInput');
    const fileInput = document.getElementById('storyImageInput');
    const text = textInput ? textInput.value.trim() : "";
    const file = fileInput && fileInput.files ? fileInput.files[0] : null;

    if (!text && !file) {
        alert("الرجاء كتابة نص أو إرفاق صورة لنشر مرسومك الملكي!");
        return;
    }

    const myUid = auth.currentUser.uid;
    
    try {
        // جلب بيانات المستخدم الملكية لإلحاقها بالمرسوم
        const userDoc = await db.collection('users').doc(myUid).get();
        const userData = userDoc.data() || {};
        const username = userData.username || auth.currentUser.email || "مستخدم مجهول";
        const badge = userData.badge || "📜";
        const roleTitle = userData.roleTitle || "خادم البلاط";

        let imageUrl = "";

        // إذا كان هناك صورة، نرفعها أولاً إلى Storage
        if (file) {
            const storageRef = firebase.storage().ref('stories/' + Date.now() + "_" + file.name);
            const snapshot = await storageRef.put(file);
            imageUrl = await snapshot.ref.getDownloadURL();
        }

        // حفظ المرسوم في مجموعة 'stories'
        await db.collection('stories').add({
            userId: myUid,
            username: username,
            badge: badge,
            roleTitle: roleTitle,
            text: text,
            imageUrl: imageUrl,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("📢 تم نشر مرسومك الملكي بنجاح في المملكة!");
        
        // تصفير الحقول وإغلاق النافذة
        if (textInput) textInput.value = "";
        if (fileInput) fileInput.value = "";
        const preview = document.getElementById('storyImagePreview');
        if (preview) preview.innerHTML = "";
        
        closeModal('addStoryModal');

    } catch (error) {
        console.error("خطأ أثناء نشر المرسوم:", error);
        alert("🚨 فشل نشر المرسوم: " + error.message);
    }
}

// 3. الاستماع المباشر للمراسيم (الحالات) النشطة وعرضها
db.collection('stories')
    .orderBy('timestamp', 'desc')
    .onSnapshot((snapshot) => {
        const list = document.getElementById('activeStoriesList');
        if (!list) return;
        list.innerHTML = '';

        const now = new Date();

        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!data.timestamp) return;

            // حساب الوقت لاستبعاد الحالات التي مر عليها أكثر من 24 ساعة
            const storyTime = data.timestamp.toDate();
            const diffInHours = (now - storyTime) / (1000 * 60 * 60);

            if (diffInHours > 24) return; // تخطي الحالة إذا تجاوزت 24 ساعة

            const storyItem = document.createElement('div');
            storyItem.classList.add('story-item');
            
            // إذا كانت الحالة تحتوي على صورة، نعرضها داخل الدائرة، وإلا نعرض إيموجي ملكي افتراضي
            const avatarContent = data.imageUrl 
                ? `<img src="${data.imageUrl}">` 
                : `<span style="font-size: 22px;">📜</span>`;

            storyItem.innerHTML = `
                <div class="story-avatar">
                    ${avatarContent}
                </div>
                <span>${data.username}</span>
            `;

            // عند الضغط على الحالة يتم عرضها
            storyItem.onclick = () => {
                viewStory(data);
            };

            list.appendChild(storyItem);
        });
    });

// 4. دالة عرض تفاصيل المرسوم (الحالة) عند النقر عليها
window.viewStory = function(data) {
    let message = `📜 مرسوم ملكي عاجل!\nالناشر: ${data.username} (${data.roleTitle} ${data.badge})\n\n`;
    
    if (data.text) {
        message += `💬 نص المرسوم:\n"${data.text}"\n`;
    }
    
    if (data.imageUrl) {
        message += `\n🖼️ يحتوي المرسوم على صورة مرفقة (سيتم فتحها لك الآن).`;
        alert(message);
        window.open(data.imageUrl, '_blank'); // فتح صورة الحالة في لسان تبويب جديد بشكل مؤقت
    } else {
        alert(message);
    }
}
/* ==========================================================================
   لوحة الشرف الملكية (Leaderboard)
   ========================================================================== */

// 1. دالة لجلب وترتيب المستخدمين وعرضهم في لوحة الشرف
window.loadLeaderboard = function() {
    const listContainer = document.getElementById('leaderboardList');
    if (!listContainer) return;

    listContainer.innerHTML = '<p class="empty-msg" style="text-align:center;">جاري تحميل قائمة الشرف الملكية...</p>';

    db.collection('users').get().then((snapshot) => {
        let usersArray = [];

        snapshot.forEach((doc) => {
            const data = doc.data();
            
            // حساب أيام النشاط بناءً على تاريخ الإنشاء لترتيبهم كـ "ولاء للمملكة"
            let createdAt = new Date();
            if (data.createdAt) {
                // إذا كان مخزناً كـ Timestamp من فايربيس أو نص
                createdAt = typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate() : new Date(data.createdAt);
            }
            
            // حساب عدد الأيام الفارق بين اليوم وتاريخ التسجيل (بحد أدنى يوم واحد)
            const diffTime = Math.abs(new Date() - createdAt);
            const daysActive = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

            usersArray.push({
                id: doc.id,
                username: data.username || data.fullName || "مستخدم مجهول",
                badge: data.badge || "📜",
                roleTitle: data.roleTitle || "خادم البلاط",
                daysActive: daysActive
            });
        });

        // ترتيب المستخدمين تنازلياً حسب أيام النشاط والولاء (الأقدم أولاً)
        usersArray.sort((a, b) => b.daysActive - a.daysActive);

        listContainer.innerHTML = ''; // تفريغ القائمة قبل العرض الجديد

        if (usersArray.length === 0) {
            listContainer.innerHTML = '<p class="empty-msg" style="text-align:center;">لا يوجد فرسان مسجلون حالياً!</p>';
            return;
        }

        usersArray.forEach((user, index) => {
            const rank = index + 1;
            let rankClass = '';
            let rankDisplay = rank;

            // تمييز المراكز الثلاثة الأولى بأيقونات خاصة
            if (rank === 1) { rankClass = 'rank-1'; rankDisplay = '👑'; }
            else if (rank === 2) { rankClass = 'rank-2'; rankDisplay = '🥈'; }
            else if (rank === 3) { rankClass = 'rank-3'; rankDisplay = '🥉'; }

            const item = document.createElement('div');
            item.classList.add('leaderboard-item');
            item.innerHTML = `
                <div class="leaderboard-user-info">
                    <div class="leaderboard-rank ${rankClass}">${rankDisplay}</div>
                    <div style="text-align: right;">
                        <h4 style="margin: 0; font-size: 14px; color: #fff;">${user.username} ${user.badge}</h4>
                        <small style="color: #64748b; font-size: 11px;">${user.roleTitle}</small>
                    </div>
                </div>
                <span class="user-points">⚡ ${user.daysActive} يوم</span>
            `;
            listContainer.appendChild(item);
        });
    }).catch(err => {
        console.error("خطأ في تحميل لوحة الشرف:", err);
        listContainer.innerHTML = '<p class="empty-msg" style="text-align:center; color: #ef4444;">فشل تحميل لوحة الشرف الملكية.</p>';
    });
}

// 2. تحديث دالة فتح الـ Modal لتقوم بتشغيل جلب البيانات فوراً عند فتح لوحة الشرف
if (typeof window.openModal === 'function') {
    const originalOpenModal = window.openModal;
    window.openModal = function(id) {
        if (id === 'leaderboardModal') {
            window.loadLeaderboard(); // تشغيل الجلب التلقائي للبيانات
        }
        originalOpenModal(id);
    }
} else {
    // في حال لم تكن الدالة معرفة كـ window سابقاً
    window.openModal = function(id) {
        if (id === 'leaderboardModal') {
            window.loadLeaderboard();
        }
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove('hidden');
    }
}
/* ==========================================================================
   نظام صندوق النميمة والاعترافات المجهولة
   ========================================================================== */

window.sendAnonymousGossip = async function() {
    const textInput = document.getElementById('gossipText');
    const text = textInput ? textInput.value.trim() : "";

    if (!text) {
        alert("الرجاء كتابة شائعة أو اعتراف أولاً قبل الإرسال!");
        return;
    }

    try {
        // نرسل الرسالة مباشرة إلى مجموعة الشات العام 'messages' (أو اسم المجموعة التي تستخدمها للشات العام لديك)
        // وبدلاً من بياناتك الحقيقية، نضع اسماً وإيموجي غامضين
        await db.collection('messages').add({
            userId: "anonymous_gossip_user", // معرّف وهمي لضمان عدم تتبع الرسالة لك
            username: "همس مجهول 🕵️",
            badge: "🤫",
            roleTitle: "شائعات البلاط",
            text: `📢 نميمة ملكية عاجلة:\n"${text}"`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("🤫 تم بث النميمة في المملكة بنجاح! لا أحد يعرف أنك الفاعل...");
        
        // تصفير الحقل وإغلاق النافذة
        if (textInput) textInput.value = "";
        closeModal('gossipModal');

    } catch (error) {
        console.error("خطأ أثناء إرسال النميمة:", error);
        alert("🚨 فشل إرسال النميمة: " + error.message);
    }
}
/* ==========================================================================
   إضافة: نظام جلب وعرض جريدة النميمة الملكية
   ========================================================================== */

// 1. دالة جلب النميمات من الفايربيس وعرضها داخل الجريدة
window.loadGossipNewspaper = function() {
    const newspaperContainer = document.getElementById('gossipNewspaper');
    if (!newspaperContainer) return;

    // إظهار رسالة تحميل مؤقتة
    newspaperContainer.innerHTML = `<p style="text-align:center; color:#94a3b8; font-size:13px;">جاري تصفح أوراق الجريدة السرية... 📰</p>`;

    // جلب آخر 30 نميمة مرتبة من الأحدث إلى الأقدم من جدول gossips
    db.collection('gossips')
      .orderBy('timestamp', 'desc')
      .limit(30)
      .get()
      .then((querySnapshot) => {
          newspaperContainer.innerHTML = ""; // تفريغ الحاوية

          if (querySnapshot.empty) {
              newspaperContainer.innerHTML = `
                <p style="text-align:center; color:#64748b; font-size:13px; margin-top:20px;">
                    لا توجد نميمات أو اعترافات حتى الآن. كن أول من يهمس بسره! 🤫
                </p>`;
              return;
          }

          querySnapshot.forEach((doc) => {
              const data = doc.data();
              const gossipText = data.text || "";
              
              // تنسيق الوقت بشكل بسيط
              let timeString = "منذ قليل";
              if (data.timestamp) {
                  const date = data.timestamp.toDate();
                  timeString = date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
              }

              // إنشاء بطاقة النميمة وإضافتها
              const gossipCard = document.createElement('div');
              gossipCard.className = 'gossip-card';
              gossipCard.innerHTML = `
                  <div class="gossip-card-header">
                      <span>🕵️ همس مجهول</span>
                      <span class="gossip-card-time">${timeString}</span>
                  </div>
                  <div class="gossip-card-body">
                      "${gossipText}"
                  </div>
              `;
              newspaperContainer.appendChild(gossipCard);
          });
      })
      .catch((error) => {
          console.error("خطأ أثناء جلب الجريدة:", error);
          newspaperContainer.innerHTML = `<p style="text-align:center; color:#ef4444; font-size:13px;">فشل تحميل الجريدة الملكية!</p>`;
      });
}

// 2. ربط تشغيل الدالة تلقائياً عند قيام المستخدم بالضغط لفتح نافذة الجريدة
// سنضيف مستمع حدث (Event Listener) للزر أو نقوم بتعديل استدعاء المودال بأمان
const originalOpenModalNewspaper = window.openModal;
window.openModal = function(modalId) {
    if (typeof originalOpenModalNewspaper === 'function') {
        originalOpenModalNewspaper(modalId);
    } else {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('hidden');
    }

    // تشغيل الجلب تلقائياً إذا فُتحت نافذة الجريدة
    if (modalId === 'newspaperModal') {
        loadGossipNewspaper();
    }
}
/* ==========================================================================
   توجيه دالة الإرسال لتخزين النميمة في جدول الجريدة (gossips)
   ========================================================================== */
window.sendAnonymousGossip = async function() {
    const textInput = document.getElementById('gossipText');
    const text = textInput ? textInput.value.trim() : "";

    if (!text) {
        alert("الرجاء كتابة شائعة أو اعتراف أولاً قبل الإرسال!");
        return;
    }

    try {
        // هنا السر! نقوم بحفظها في جدول 'gossips' لتقرأها الجريدة بنجاح
        await db.collection('gossips').add({
            text: text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("🤫 تم إرسال نميمتك بنجاح سراً! لقد سُجلت في أروقة الجريدة...");
        
        if (textInput) textInput.value = "";
        closeModal('gossipModal');

        // إذا كانت نافذة الجريدة مفتوحة بالخلفية، نقوم بتحديثها فوراً لتظهر الرسالة الجديدة
        if (typeof loadGossipNewspaper === 'function') {
            loadGossipNewspaper();
        }

    } catch (error) {
        console.error("خطأ أثناء إرسال النميمة:", error);
        alert("🚨 فشل إرسال النميمة: " + error.message);
    }
}

// دالة فتح نافذة الإشعارات
window.openNotificationsModal = function() {
    // التأكد من وجود النافذة أولاً قبل محاولة فتحها
    const modal = document.getElementById('notificationsModal');
    if (modal) {
        modal.style.display = 'block';
    } else {
        console.log("لم يتم العثور على نافذة الإشعارات (notificationsModal)");
    }
}


// دالة لجلب وعرض الإشعارات
window.fetchNotifications = function() {
    const list = document.getElementById('notificationsList');
    list.innerHTML = "جاري التحميل...";

    db.collection('notifications')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .onSnapshot((snapshot) => {
        list.innerHTML = ""; // تفريغ القائمة أولاً
        if (snapshot.empty) {
            list.innerHTML = "<p>لا توجد إشعارات جديدة.</p>";
            return;
        }
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            const div = document.createElement('div');
            div.style.padding = "10px";
            div.style.borderBottom = "1px solid #333";
            div.innerHTML = `<p>${data.text}</p>`;
            list.appendChild(div);
        });
    });
}

// استدعاء الدالة فور تشغيل التطبيق
fetchNotifications();



function logVisit(visitorName) {
    // التأكد من أن المستخدم قد سجل دخوله
    if (!visitorName) {
        visitorName = "مستخدم مجهول";
    }

    // إضافة الزيارة إلى قاعدة بيانات Firestore
    db.collection("profile_visits").add({
        name: visitorName,
        time: new Date() // يسجل الوقت الحالي تلقائياً
    })
    .then(() => {
        console.log("تم تسجيل زيارة جديدة لـ: " + visitorName);
    })
    .catch((error) => {
        console.error("خطأ في تسجيل الزيارة: ", error);
    });
}

// --- دالة تسجيل زيارة الملف الشخصي ---
function logVisit(visitorName) {
    db.collection("profile_visits").add({
        name: visitorName || "مستخدم مجهول",
        time: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
        console.log("تم تسجيل الزيارة بنجاح!");
    })
    .catch((error) => {
        console.error("حدث خطأ:", error);
    });
}

// استدعاء الدالة تلقائياً عند فتح الصفحة
window.onload = function() {
    // يمكنك هنا وضع اسم المستخدم الفعلي إذا كان متاحاً في تطبيقك
    // مثال: logVisit(currentUser.displayName);
    logVisit("userName"); 
};


function loadVisitHistory() {
    const list = document.getElementById("visitsList");
    
    // التأكد من وجود العنصر في الصفحة حتى لا يحدث خطأ
    if (!list) return; 

    list.innerHTML = "جاري تحميل الزوار..."; 

    // الاتصال بـ Firebase لجلب البيانات
    db.collection("profile_visits")
        .orderBy("time", "desc") // ترتيب حسب الأحدث
        .limit(5) // عرض آخر 5 زوار فقط
        .get()
        .then((snapshot) => {
            list.innerHTML = ""; // تفريغ القائمة قبل إضافة البيانات الجديدة
            
            if (snapshot.empty) {
                list.innerHTML = "لا يوجد زوار حتى الآن.";
                return;
            }

            snapshot.forEach((doc) => {
                let data = doc.data();
                // تحويل الوقت من Firebase إلى تنسيق مفهوم (ساعة ودقيقة)
                let time = data.time ? new Date(data.time.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "وقت غير معروف";
                
                let li = document.createElement("li");
                li.innerHTML = `👤 ${data.name} - <span style="color:#999">${time}</span>`;
                list.appendChild(li);
            });
        })
        .catch((error) => {
            console.error("خطأ في جلب بيانات الزوار:", error);
            list.innerHTML = "تعذر تحميل السجل.";
        });
}


function loadBlockedUsers() {
    const container = document.getElementById("blockedUsersContainer");
    const listArea = document.getElementById("blockedListArea");

    if (container.style.display === "none") {
        container.style.display = "block";
        listArea.innerHTML = "جاري البحث عن المحظورين...";

        // التأكد من استعلام قاعدة البيانات
        db.collection("users").where("isBlocked", "==", true).get()
            .then((snapshot) => {
                listArea.innerHTML = ""; // مسح "جاري التحميل"
                
                if (snapshot.empty) {
                    listArea.innerHTML = "قائمة المحظورين فارغة.";
                    return;
                }

                snapshot.forEach((doc) => {
                    let user = doc.data();
                    listArea.innerHTML += `<p>🚫 ${user.roleTitle || "مستخدم بدون اسم"}</p>`;



                });
            })
            .catch((error) => {
                console.error("خطأ Firebase:", error);
                listArea.innerHTML = "خطأ في الاتصال: " + error.message;
            });
    } else {
        container.style.display = "none";
    }
}

// دالة لفحص حالة الإشعارات وإظهار النافذة للمستخدمين الجدد
window.addEventListener('load', () => {
    if ("Notification" in window) {
        // إذا لم يحدد المستخدم موقفه سابقاً من الإشعارات
        if (Notification.permission === "default") {
            // ننتظر 4 ثوانٍ بعد فتح الشات لتظهر النافذة بشكل أنيق ولا تسبب إزعاجاً فورياً
            setTimeout(() => {
                const modal = document.getElementById('notificationModal');
                if (modal) {
                    modal.style.display = 'flex';
                }
            }, 4000);
        }
    }
});

// دالة طلب إذن الإشعارات الرسمي من المتصفح أو النظام
function requestNotificationPermission() {
    Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
            console.log("تم منح صلاحية الإشعارات بنجاح!");
            // هنا يمكنكِ مستقبلاً ربط التوكن بـ Firebase Cloud Messaging (FCM) لشحنها لمتجر بلاي
        } else {
            console.log("تم رفض صلاحية الإشعارات من قبل المستخدم.");
        }
        closeNotificationModal();
    });
}

// دالة إغلاق النافذة المنبثقة
function closeNotificationModal() {
    const modal = document.getElementById('notificationModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// دالة لإظهار صندوق الرد
function showReplyBox(text) {
    const container = document.getElementById('replyContainer');
    const replyText = document.getElementById('replyText');
    
    replyText.innerText = text; // وضع نص الرسالة التي يتم الرد عليها
    container.style.display = 'block'; // إظهار الصندوق
    document.getElementById('messageInput').focus(); // تركيز الكتابة تلقائياً
}

// دالة لإلغاء الرد
function cancelReply() {
    const container = document.getElementById('replyContainer');
    container.style.display = 'none'; // إخفاء الصندوق
    window.replyingToMessage = null; // مسح الرسالة المحفوظة
}
