// تكوين Firebase المبدئي
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

let activeChatUserId = null; 
let currentActiveTargetId = null; 
let contactedUserIds = new Set();
let queueUnsubscribe = null;
let recentContactsUnsubscribe = null;
let isRenderingContacts = false; // قفل لمنع استدعاء العرض المتزامن

// دالة نظام الترقية التلقائي للنظام الملكي
async function updateRoyalBadge(userId) {
    try {
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();
        if (!doc.exists) return;

        const data = doc.data();
        const createdAt = data.createdAt ? data.createdAt.toDate() : new Date();
        const daysActive = Math.floor((new Date() - createdAt) / (1000 * 60 * 60 * 24));

        let badge = '📜'; 
        let roleTitle = "خادم البلاط";

        if (daysActive >= 30) {
            badge = '👑';
            roleTitle = "أمير";
        } else if (daysActive >= 7) {
            badge = '⚖️';
            roleTitle = "بارون";
        } else if (daysActive >= 3) {
            badge = '🛡️';
            roleTitle = "فارس";
        }

        // تخصيص استثنائي لحساب احمد أو الملك/المطور
        if (data.username === "احمد" || data.role === 'admin' || data.isKing || userId === "iB9c5FMQefeeB9Oapp7ByWlyKle2") {
            badge = '🏰'; 
            roleTitle = "الملك المطور";
        }

        if (data.badge !== badge || data.roleTitle !== roleTitle) {
            await userRef.update({ badge: badge, roleTitle: roleTitle });
        }
    } catch (e) {
        console.error("خطأ في تحديث الرتبة:", e);
    }
}

auth.onAuthStateChanged((user) => {
    if (user) {
        updateRoyalBadge(user.uid);
  
        db.collection("users").doc(user.uid).update({ status: "online" }).catch(err => console.log(err));

        try {
            const messaging = firebase.messaging();
            Notification.requestPermission().then((permission) => {
                if (permission === 'granted') {
                    messaging.getToken({ vapidKey: 'BGp2fqSEXHD6Ng1kPMlHf_EGBFHxvY4z_7BDprfeulkK9qncNSZh0iyjj4ISWyW5At4pvyM4bMplEA9xndlbcUk' })
                    .then((currentToken) => {
                        if (currentToken) {
                            db.collection('users').doc(user.uid).update({ fcmToken: currentToken });
                        }
                    }).catch(e => console.log("FCM error:", e));
                }
            });
        } catch(e) { console.log(e); }

        db.collection("users").doc(user.uid).get().then((doc) => {
            if (doc.exists) {
                const usernameInput = document.getElementById('profileUsername');
                if (usernameInput) usernameInput.value = doc.data().username || "";
            }
        });

        loadRecentChatContacts();
    }
});

// التحكم بالقوائم والنوافذ
window.toggleMenu = function(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('dropdownMenu');
    if (dropdown) dropdown.classList.toggle('hidden');
}

document.addEventListener('click', function() {
    const dropdown = document.getElementById('dropdownMenu');
    if (dropdown) dropdown.classList.add('hidden');
});

window.openModal = function(id) {
    if (id === 'addPersonModal') {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('hidden');
        window.startRandomMatch();
        return;
    }
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('hidden');
}

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('hidden');
        if (id === 'addStoryModal') {
            const textIn = document.getElementById('storyTextInput');
            const fileIn = document.getElementById('storyImageInput');
            const prev = document.getElementById('storyImagePreview');
            if (textIn) textIn.value = '';
            if (fileIn) fileIn.value = '';
            if (prev) prev.innerHTML = '';
        }
    }
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

// 1️⃣ جلب المحادثات السابقة بدون تكرار
function loadRecentChatContacts() {
    const myUid = auth.currentUser ? auth.currentUser.uid : null;
    if (!myUid) return;

    if (recentContactsUnsubscribe) {
        recentContactsUnsubscribe();
    }

    recentContactsUnsubscribe = db.collection('messages')
        .orderBy('timestamp', 'desc')
        .onSnapshot(async (snapshot) => {
            const recentMap = new Map();
            contactedUserIds.clear();

            snapshot.forEach((doc) => {
                const data = doc.data();
                let otherId = null;

                if (data.senderId === myUid) {
                    otherId = data.receiverId;
                } else if (data.receiverId === myUid) {
                    otherId = data.senderId;
                }

                if (otherId) {
                    contactedUserIds.add(otherId);
                    if (!recentMap.has(otherId)) {
                        recentMap.set(otherId, {
                            lastText: data.text || "📷 صورة",
                            timestamp: data.timestamp
                        });
                    }
                }
            });

            await renderRecentContactsList(recentMap);
        }, (error) => {
            console.error("خطأ في تحميل المحادثات السابقة:", error);
        });
}

async function renderRecentContactsList(recentMap) {
    const userList = document.getElementById('contactsList'); 
    if (!userList) return;

    if (isRenderingContacts) return;
    isRenderingContacts = true;

    userList.innerHTML = '';

    if (recentMap.size === 0) {
        userList.innerHTML = '<p class="empty-msg" style="text-align:center; padding:20px; color:#94a3b8;">لا توجد محادثات سابقة. اضغط على الزر الأخضر (+) في الأسفل لبدء البحث عن صديق مجهول!</p>';
        isRenderingContacts = false;
        return;
    }

    const fragment = document.createDocumentFragment();

    for (let [otherId, lastMsg] of recentMap) {
        const userDoc = await db.collection('users').doc(otherId).get();
        if (!userDoc.exists) continue;

        const userData = userDoc.data();
        updateRoyalBadge(otherId);

        const isTyping = userData.typingTo === auth.currentUser.uid;
        
        // تحديد الرتبة الخاصة بأحمد
        let currentRole = userData.roleTitle || "خادم البلاط";
        if (userData.username === "احمد" || otherId === "iB9c5FMQefeeB9Oapp7ByWlyKle2") {
            currentRole = "الملك المطور";
        }

        const currentBadge = userData.badge || "📜";
        
        const statusText = isTyping ? "✏️ يكتب الآن..." : (userData.status === 'online' ? `🟢 متصل | ${currentRole}` : `⚪ غير متصل | ${currentRole}`);
        const statusColor = isTyping ? "#f59e0b" : (userData.status === 'online' ? '#22c55e' : '#64748b');

        const userItem = document.createElement('div');
        userItem.classList.add('contact-item'); 
        if (activeChatUserId === otherId) userItem.classList.add('active');
                
        userItem.innerHTML = `
            <div class="avatar">${userData.avatarUrl ? `<img src="${userData.avatarUrl}">` : '👤'}</div>
            <div style="flex: 1;">
                <h4>${userData.username || userData.email || "مستخدم مجهول"} ${currentBadge}</h4>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size: 11px; color: #94a3b8; max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${lastMsg.lastText}</span>
                    <span style="font-size: 9px; color: ${statusColor}">${statusText}</span>
                </div>
            </div>
        `;

        userItem.onclick = () => { selectUserForChat(otherId, userData); };
        fragment.appendChild(userItem);
    }

    userList.innerHTML = '';
    userList.appendChild(fragment);

    isRenderingContacts = false;
}

function selectUserForChat(userId, userData) {
    document.querySelectorAll('.contact-item').forEach(i => i.classList.remove('active'));

    activeChatUserId = userId;
    window.activeChatUserId = userId;
    currentActiveTargetId = userId; 

    const activeChatName = document.getElementById('activeChatName');
    if (activeChatName) {
        activeChatName.innerHTML = `${userData.username || userData.email || "مستخدم مجهول"} <span style="font-size:16px;">${userData.badge || "📜"}</span>`;
    }
    
    const activeChatStatus = document.getElementById('activeChatStatus');
    if (activeChatStatus) {
        // التحقق مما إذا كان المستخدم هو احمد أو المطور
        if (userData.username === "احمد" || userId === "iB9c5FMQefeeB9Oapp7ByWlyKle2") {
            activeChatStatus.innerText = `الرتبة الملكية: الملك المطور`;
        } else {
            activeChatStatus.innerText = `الرتبة الملكية: ${userData.roleTitle || "خادم البلاط"}`;
        }
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
}

// 2️⃣ المطابقة العشوائية المباشرة
window.startRandomMatch = async function() {
    closeModal('addPersonModal');

    const myUid = auth.currentUser ? auth.currentUser.uid : null;
    if (!myUid) {
        alert("يرجى تسجيل الدخول أولاً للبدء بالبحث.");
        return;
    }

    try {
        const blockedSnap = await db.collection('users').doc(myUid).collection('blockedUsers').get();
        const blockedSet = new Set();
        blockedSnap.forEach(doc => blockedSet.add(doc.id));

        const queueRef = db.collection('waiting_queue');
        const queueSnap = await queueRef.limit(10).get();

        let matchedUser = null;
        queueSnap.forEach(doc => {
            const candidateId = doc.id;
            if (candidateId !== myUid && !blockedSet.has(candidateId)) {
                matchedUser = candidateId;
            }
        });

        if (matchedUser) {
            await queueRef.doc(matchedUser).delete().catch(() => {});
            const matchedUserDoc = await db.collection('users').doc(matchedUser).get();
            if (matchedUserDoc.exists) {
                const userData = matchedUserDoc.data();
                alert(`🎉 تم العثور على مستخدم مجهول! جاري فتح الدردشة مع: ${userData.username || "صديق جديد"}`);
                selectUserForChat(matchedUser, userData);
                return;
            }
        }

        const allUsersSnap = await db.collection('users').get();
        const eligibleUsers = [];

        allUsersSnap.forEach(doc => {
            const uid = doc.id;
            if (uid !== myUid && !blockedSet.has(uid) && !contactedUserIds.has(uid)) {
                eligibleUsers.push({ id: uid, ...doc.data() });
            }
        });

        if (eligibleUsers.length > 0) {
            const randomIndex = Math.floor(Math.random() * eligibleUsers.length);
            const selectedUser = eligibleUsers[randomIndex];

            alert(`🎲 تم العثور على شخص مجهول! جاري فتح الدردشة مع: ${selectedUser.username || "صديق جديد"}`);
            selectUserForChat(selectedUser.id, selectedUser);
        } else {
            await queueRef.doc(myUid).set({
                userId: myUid,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            alert("🔍 جاري البحث عن مستخدم مجهول للتحدث معه... تم وضعك في قائمة الانتظار المباشرة.");
            
            if (queueUnsubscribe) queueUnsubscribe();
            queueUnsubscribe = queueRef.doc(myUid).onSnapshot(docSnap => {
                if (!docSnap.exists) {
                    queueUnsubscribe();
                    loadRecentChatContacts();
                }
            });
        }

    } catch (error) {
        console.error("خطأ في البحث العشوائي:", error);
        alert("حدث خطأ أثناء إجراء البحث العشوائي، يرجى المحاولة مرة أخرى.");
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const bindFloatingBtn = () => {
        const btns = document.querySelectorAll('.floating-btn, #addBtn, .add-user-btn, [onclick*="addPersonModal"]');
        btns.forEach(btn => {
            btn.removeAttribute('onclick');
            btn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                window.startRandomMatch();
                return false;
            };
        });
    };
    bindFloatingBtn();
    setTimeout(bindFloatingBtn, 1000);
});

window.addNewContact = function() {
    const inputInput = document.getElementById('addSearchInput');
    if (!inputInput) return;
    const input = inputInput.value.trim();

    if (input) {
        db.collection('users').where('username', '==', input).get().then((snapshot) => {
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                selectUserForChat(doc.id, doc.data());
                inputInput.value = "";
                closeModal('addPersonModal');
            } else { alert("لم يتم العثور على مستخدم بهذا الاسم."); }
        }).catch(err => console.error("خطأ بالبحث:", err));
    }
}

window.backToSidebar = function() {
    const chatArea = document.getElementById('chatArea');
    const sidebar = document.getElementById('sidebar');
    if (chatArea) chatArea.classList.add('hidden');
    if (sidebar) sidebar.classList.remove('hidden-mobile');
}

window.sendPrivateMessage = async function() {
    const input = document.getElementById('messageInput');
    if (!input) return;
    const text = input.value.trim();
    if(!text) return;

    const currentUserId = window.activeChatUserId || activeChatUserId || currentActiveTargetId;
    if (!currentUserId) {
        alert("الرجاء اختيار مستخدم لبدء المحادثة معه أولاً!");
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
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        input.value = "";
        const box = document.getElementById('chatMessages');
        if (box) box.scrollTop = box.scrollHeight;
    } catch(error) {
        console.error("خطأ في التحقق أو الإرسال:", error);
    }
}

const msgInp = document.getElementById('messageInput');
if (msgInp) {
    msgInp.addEventListener('input', () => {
        const currentUserId = window.activeChatUserId || currentActiveTargetId;
        if (currentUserId && auth.currentUser) {
            db.collection('users').doc(auth.currentUser.uid).update({ typingTo: currentUserId }).catch(e => console.log(e));
        }
    });
}

window.saveProfile = function() {
    const user = firebase.auth().currentUser;
    if (!user) { alert("⚠️ يجب أن تكون مسجلاً للدخول لتعديل ملفك!"); return; }

    const fullName = document.getElementById('profileFullName').value.trim();
    const username = document.getElementById('profileUsername').value.trim();
    const birthdate = document.getElementById('profileBirthdate').value;
    const avatarInput = document.getElementById('avatarInput');

    if (!fullName || !username) {
        alert("📜 فضلاً، يرجى ملء الاسم الكامل واسم المستخدم أولاً!");
        return;
    }

    function uploadData(avatarDataUrl = null) {
        const updateData = {
            fullName: fullName,
            username: username,
            birthdate: birthdate || "",
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (avatarDataUrl) updateData.avatarUrl = avatarDataUrl;

        firebase.firestore().collection('users').doc(user.uid).set(updateData, { merge: true })
        .then(() => {
            alert("💾 تم حفظ تعديلات الملف الشخصي بنجاح!");
            closeModal('profileModal');
        })
        .catch((error) => alert("❌ فشل في حفظ البيانات!"));
    }

    if (avatarInput && avatarInput.files.length > 0) {
        const file = avatarInput.files[0];
        if (file.size > 1024 * 1024) { alert("⚠️ حجم الصورة كبير جداً، اختر صورة أصغر!"); return; }

        const reader = new FileReader();
        reader.onload = function(e) { uploadData(e.target.result); };
        reader.readAsDataURL(file);
    } else { uploadData(); }
};

window.deleteAccountPermanently = function() {
    if(confirm("⚠️ هل أنت متأكد من حذف الحساب نهائياً؟")) {
        window.location.href = "index.html";
    }
}

function loadPrivateMessages() {
    const currentUserId = window.activeChatUserId || activeChatUserId || currentActiveTargetId;
    if (!currentUserId) return;

    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    if (window.privateChatUnsubscribe) window.privateChatUnsubscribe();

    window.privateChatUnsubscribe = db.collection('messages')
        .orderBy('timestamp')
        .onSnapshot((snapshot) => {
            chatMessages.innerHTML = '';

            snapshot.forEach((doc) => {
                const data = doc.data();
                const isSentByMe = data.senderId === auth.currentUser.uid && data.receiverId === currentUserId;
                const isReceivedFromHim = data.senderId === currentUserId && data.receiverId === auth.currentUser.uid;

                if (isSentByMe || isReceivedFromHim) {
                    if (isReceivedFromHim && data.isRead !== true) {
                        doc.ref.update({ isRead: true }).catch(err => console.error("خطأ تحديث القراءة:", err));
                    }

                    const msgDiv = document.createElement('div');
                    msgDiv.classList.add('message', isSentByMe ? 'sent' : 'received');

                    let reactionsHtml = '';
                    if (data.reactions) {
                        Object.keys(data.reactions).forEach(emoji => {
                            const count = data.reactions[emoji].length;
                            reactionsHtml += `<span class="reaction-badge">${emoji}${count}</span>`;
                        });
                    }

                    const actionButtonsHtml = isSentByMe ? `
                        <div class="message-actions" style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px; display: flex; justify-content: space-around;">
                            <span onclick="editMessage('${doc.id}', \`${data.text}\`)" style="cursor:pointer; font-size:12px;">✏️ تعديل</span>
                            <span onclick="deleteMessage('${doc.id}')" style="cursor:pointer; font-size:12px; color:#ef4444;">🗑️ حذف</span>
                        </div>
                    ` : '';

                    let statusHtml = '';
                    if (isSentByMe) {
                        statusHtml = data.isRead === true ? 
                            `<span style="color: #38bdf8; margin-left: 6px; font-size: 13px; font-weight: bold;">✓✓</span>` : 
                            `<span style="color: #94a3b8; margin-left: 6px; font-size: 13px;">✓</span>`;
                    }

                    msgDiv.innerHTML = `
                        <div class="message-text">
                            <span>${data.text}</span>
                            ${statusHtml}
                        </div>
                        ${data.imageUrl ? `<img src="${data.imageUrl}">` : ''}
                        <div class="reactions-container">${reactionsHtml}</div>
                        ${actionButtonsHtml}
                        <div id="emoji-menu-${doc.id}" class="emoji-menu">
                            <div class="emojis-row" style="display:flex; justify- space-around; margin-bottom: 4px;">
                                <span onclick="addReaction('${doc.id}', '❤️')">❤️</span>
                                <span onclick="addReaction('${doc.id}', '👍')">👍</span>
                                <span onclick="addReaction('${doc.id}', '😂')">😂</span>
                                <span onclick="addReaction('${doc.id}', '💚')">💚</span>
                            </div>
                        </div>
                    `;

                    if (typeof setupLongPress === 'function') setupLongPress(msgDiv, doc.id);

                    const time = data.timestamp ? data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
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

const imgElem = document.getElementById('imageInput');
if (imgElem) {
    imgElem.addEventListener('change', (e) => {
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
        }).catch(error => alert("حدث خطأ أثناء رفع الصورة"));
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
    db.collection('messages').doc(messageId).update({
        [`reactions.${emoji}`]: firebase.firestore.FieldValue.arrayUnion(auth.currentUser.uid)
    }).then(() => {
        const menu = document.getElementById('emoji-menu-' + messageId);
        if (menu) menu.style.display = 'none';
    });
}

window.deleteMessage = function(messageId) {
    if (confirm("⚠️ هل تريد حذف هذه الرسالة للجميع؟")) {
        db.collection('messages').doc(messageId).delete().catch(error => alert("لم نتمكن من حذف الرسالة."));
    }
}

window.editMessage = function(messageId, currentText) {
    const newText = prompt("✏️ قم بتعديل رسالتك:", currentText);
    if (newText !== null && newText.trim() !== "") {
        db.collection('messages').doc(messageId).update({ text: newText.trim() }).catch(error => alert("لم نتمكن من تعديل الرسالة."));
    }
}

window.openTargetProfile = async function() {
    if (!currentActiveTargetId) { alert("يرجى اختيار صديق أولاً."); return; }
    try {
        const userDoc = await db.collection('users').doc(currentActiveTargetId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            let displayRole = userData.roleTitle || "خادم البلاط";
            if (userData.username === "احمد" || currentActiveTargetId === "iB9c5FMQefeeB9Oapp7ByWlyKle2") {
                displayRole = "الملك المطور";
            }

            const nameElem = document.getElementById('targetFullName');
            if (nameElem) nameElem.innerText = (userData.fullName || userData.username || "لا يوجد اسم") + " " + (userData.badge || "📜");
            
            const unameElem = document.getElementById('targetUsername');
            if (unameElem) unameElem.innerText = "@" + (userData.username || "بدون_مستخدم") + ` (${displayRole})`;
            
            const avatarDiv = document.getElementById('targetAvatar');
            if (avatarDiv) {
                avatarDiv.innerHTML = userData.avatarUrl ? `<img src="${userData.avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : "💬";
            }
            openModal('targetProfileModal');
        }
    } catch (error) { console.error("خطأ في جلب البيانات:", error); }
}

window.handleBlockAction = async function() {
    if (!currentActiveTargetId) return;
    if (confirm("هل أنت متأكد من أنك تريد حظر هذا المستخدم؟")) {
        const myUid = auth.currentUser.uid;
        try {
            await db.collection('users').doc(myUid).collection('blockedUsers').doc(currentActiveTargetId).set({
                blockedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert("تم الحظر بنجاح.");
            closeModal('targetProfileModal');
            location.reload();
        } catch (error) { console.error(error); }
    }
}

window.handleReportAction = async function() {
    if (!currentActiveTargetId) return;
    const reason = prompt("يرجى كتابة سبب الإبلاغ عن هذا المستخدم:");
    if (!reason || reason.trim() === "") return;

    try {
        await db.collection('reports').add({
            reportedUserId: currentActiveTargetId,
            reportedBy: auth.currentUser.uid,
            reason: reason.trim(),
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert("📢 تم إرسال بلاغك بنجاح!");
        closeModal('targetProfileModal');
    } catch (error) { alert("حدث خطأ أثناء إرسال البلاغ."); }
}

window.loadBlockedUsers = async function() {
    const myUid = auth.currentUser.uid;
    const container = document.getElementById('blockedUsersContainer');
    const listArea = document.getElementById('blockedListArea');

    if (!container || !listArea) return;

    if (!container.classList.contains('hidden')) {
        container.classList.add('hidden');
        return;
    }

    listArea.innerHTML = "<p style='font-size:12px; color:#64748b;'>جاري تحميل القائمة...</p>";
    container.classList.remove('hidden');

    try {
        const blockedSnapshot = await db.collection('users').doc(myUid).collection('blockedUsers').get();
        if (blockedSnapshot.empty) {
            listArea.innerHTML = "<p style='font-size:12px; color:#22c55e;'>لا يوجد مستخدمون محظورون حالياً.</p>";
            return;
        }

        listArea.innerHTML = ""; 
        blockedSnapshot.forEach(async (blockedDoc) => {
            const blockedUserId = blockedDoc.id;
            const userDoc = await db.collection('users').doc(blockedUserId).get();
            const username = userDoc.exists ? (userDoc.data().username || userDoc.data().email) : "مستخدم مجهول";

            const row = document.createElement('div');
            row.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; background:rgba(255,255,255,0.05); padding:6px 10px; border-radius:6px;";
            row.innerHTML = `
                <span style="font-size: 13px;">${username}</span>
                <button onclick="unblockUser('${blockedUserId}')" style="background:#22c55e; color:white; border:none; padding:3px 8px; border-radius:4px; font-size:11px; cursor:pointer;">إلغاء الحظر</button>
            `;
            listArea.appendChild(row);
        });
    } catch (error) { listArea.innerHTML = "<p style='font-size:12px; color:#ef4444;'>حدث خطأ أثناء جلب القائمة.</p>"; }
}

window.unblockUser = async function(blockedUserId) {
    if (confirm("هل تريد إلغاء الحظر؟")) {
        try {
            await db.collection('users').doc(auth.currentUser.uid).collection('blockedUsers').doc(blockedUserId).delete();
            alert("تم إلغاء الحظر بنجاح.");
            location.reload(); 
        } catch (error) { alert("فشل إلغاء الحظر."); }
    }
}

// المراسيم الملكية (الحالات)
function previewStoryImage(event) {
    const previewContainer = document.getElementById('storyImagePreview');
    if (!previewContainer) return;
    previewContainer.innerHTML = '';
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.cssText = 'max-height:140px; border-radius:8px; object-fit:cover;';
            previewContainer.appendChild(img);
        }
        reader.readAsDataURL(file);
    }
}

async function publishRoyalDecree() {
    const textInput = document.getElementById('storyTextInput');
    if (!textInput) return;
    const text = textInput.value.trim();
    if (!text) { alert('عذراً، اكتب نص المرسوم أولاً!'); return; }

    try {
        await firebase.firestore().collection('royal_stories').add({
            text: text,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('📢 تم إرسال المرسوم الملكي بنجاح!');
        closeModal('addStoryModal');
    } catch (error) { alert("لم نتمكن من النشر: " + error.message); }
}

function listenToRoyalStories() {
    const storiesContainer = document.getElementById('royalStoriesContainer');
    if (!storiesContainer) return;

    firebase.firestore().collection('royal_stories').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        storiesContainer.innerHTML = `
            <div class="story-circle add-story-btn" onclick="openModal('addStoryModal')">
                <div class="story-avatar">➕</div>
                <span class="story-name">مرسومك</span>
            </div>
        `;
        snapshot.forEach((doc) => {
            const story = doc.data();
            const storyElement = document.createElement('div');
            storyElement.className = 'story-circle';
            storyElement.onclick = () => { alert(`📜 مرسوم ملكي:\n\n"${story.text}"`); };
            storyElement.innerHTML = `<div class="story-avatar">📜</div><span class="story-name">مرسوم جديد</span>`;
            storiesContainer.appendChild(storyElement);
        });
    });
}

window.addEventListener('DOMContentLoaded', () => { listenToRoyalStories(); });

// لوحة الفرسان والشرف
function loadLeaderboard() {
    const leaderboardList = document.getElementById('leaderboardList');
    if (!leaderboardList) return;
    leaderboardList.innerHTML = '<p style="text-align:center; color:#64748b;">⚡ جاري استدعاء فرسان المملكة...</p>';

    firebase.firestore().collection('users').get().then((snapshot) => {
        leaderboardList.innerHTML = '';
        if (snapshot.empty) { leaderboardList.innerHTML = '<p style="text-align:center; color:#64748b;">🏰 لا يوجد فرسان مسجلون بعد!</p>'; return; }

        let usersArray = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            usersArray.push({ fullName: data.fullName || 'عضو ملكي', username: data.username || 'user', points: data.points || 0 });
        });

        usersArray.sort((a, b) => b.points - a.points);
        let index = 1;
        usersArray.slice(0, 10).forEach((user) => {
            createLeaderboardItem(leaderboardList, index, user.fullName, user.username, user.points);
            index++;
        });
    });
}

function createLeaderboardItem(container, index, name, username, points) {
    let medal = index === 1 ? '🥇' : index === 2 ? '🥈' : index === 3 ? '🥉' : `🏅 ${index}`;
    const item = document.createElement('div');
    item.className = `leaderboard-item rank-${index <= 3 ? index : 'default'}`;
    item.style.cssText = 'display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.05); padding:15px; border-radius:12px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.1);';
    item.innerHTML = `
        <span style="color: #d4af37; font-weight: bold; font-size: 15px;">✨ ${points} نقطة</span>
        <div style="display: flex; align-items: center; gap: 12px; text-align: right;">
            <div>
                <strong style="color: #fff; display: block; font-size: 16px;">${name}</strong>
                <span style="font-size: 12px; color: #94a3b8;">@${username}</span>
            </div>
            <span style="font-size: 24px; display: flex; align-items: center;">${medal}</span>
        </div>
    `;
    container.appendChild(item);
}

// النميمة والأسرار
function sendAnonymousGossip() {
    const gossipText = document.getElementById('gossipText');
    if (!gossipText || gossipText.value.trim() === "") { alert("🚨 اكتب سرك أولاً!"); return; }

    firebase.firestore().collection('gossip').add({
        content: gossipText.value.trim(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        alert("🤫 تم نفث سرك بنجاح!");
        gossipText.value = "";
        closeModal('gossipModal');
    }).catch(error => alert("❌ فشل إرسال النميمة."));
}

function loadNewspaper() {
    const gossipList = document.getElementById('gossipList');
    if (!gossipList) return;
    gossipList.innerHTML = '<p style="text-align:center; color:#64748b;">⏳ جاري فك طلاسم الأسرار...</p>';

    firebase.firestore().collection('gossip').orderBy('timestamp', 'desc').get().then((snapshot) => {
        gossipList.innerHTML = '';
        if (snapshot.empty) { gossipList.innerHTML = '<p style="text-align:center; color:#64748b;">🤫 لا توجد نمائم بعد!</p>'; return; }

        snapshot.forEach((doc) => {
            const data = doc.data();
            const item = document.createElement('div');
            item.style.cssText = 'padding:12px; background:rgba(255,255,255,0.03); border-right:3px solid #8b5cf6; border-radius:6px; margin-bottom:10px; font-size:14px; color:#f8fafc;';
            item.innerHTML = `
                <div style="font-style: italic;">"${data.content}"</div>
                <div style="font-size: 10px; color: #64748b; margin-top: 8px; text-align: left;">
                    ${data.timestamp ? new Date(data.timestamp.toDate()).toLocaleDateString('ar-EG') : 'منذ قليل'}
                </div>
            `;
            gossipList.appendChild(item);
        });
    });
}

function toggleNotifications() {
    const badge = document.getElementById('notificationBadge');
    if (badge) { badge.textContent = '0'; badge.classList.add('hidden'); }
    alert('🔔 لا توجد إشعارات جديدة حالياً!');
}

function updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    if (badge && count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
}

// أوسمة المطور والملك
const myName = "احمد";
const observer = new MutationObserver(() => {
    document.querySelectorAll('.contact-item, .chat-header').forEach(item => {
        if (item.innerText.includes(myName)) {
            if (!item.querySelector('.king-badge')) {
                const nameContainer = item.querySelector('h4') || item.querySelector('#activeChatName');
                if (nameContainer) nameContainer.innerHTML += ' <span class="king-badge">👑 الملك</span>';
            }
            if (!item.querySelector('.developer-badge')) {
                const nameContainer = item.querySelector('h4') || item.querySelector('#activeChatName');
                if (nameContainer) nameContainer.innerHTML += ' <span class="developer-badge">المطور</span>';
            }
        }
    });
});
observer.observe(document.body, { childList: true, subtree: true });

setInterval(() => {
    const myUserId = "iB9c5FMQefeeB9Oapp7ByWlyKle2"; 
    const userElements = document.querySelectorAll('.user-name, .message-sender'); 
    userElements.forEach(el => {
        if (el.getAttribute('data-uid') === myUserId || el.innerText.includes("احمد")) {
            if (!el.classList.contains('is-king-processed')) {
                el.innerHTML = `<span class="king-title">الملك 👑</span> <span class="king-dev-badge">المطور</span>`;
                el.classList.add('is-king-processed'); 
            }
        }
    });
}, 1000);


// ==========================================
// 🌐 نظام الترجمة الشامل لجميع عناصر الواجهة والقوائم
// ==========================================


    
  // ==========================================
// 🌐 نظام الترجمة الشامل لجميع عناصر الواجهة والقوائم
// ==========================================

const appTranslations = {
    ar: {
        dir: "rtl",
        // 1. القائمة المنبثقة الرئيسية
        profileMenu: "👤 ملفي الشخصي",
        leaderboardMenu: "🏆 لوحة الشرف",
        gossipBoxMenu: "🤫 صندوق النميمة",
        gossipPaperMenu: "📰 جريدة النميمة",
        settingsMenu: "⚙️ الإعدادات",
        
        // 2. خانة البحث والهيدر
        searchInput: "🔍بحث عن أشخاص...",
        headerTitle: "سجل الدردشات الاحترافي",
        
        // 3. نافذة الإعدادات
        settingsTitle: "⚙️ الإعدادات",
        themeBtn: "🌓 تغيير نمط التطبيق (ليلي / نهاري)",
        blockedBtn: "🚫 عرض قائمة المحظورين",
        langLabel: "🌐 لغة التطبيق:",
        ranksBtn: "👑 نظام الرتب الملكية",
        privacyBtn: "🛡️ الخصوصية وأمان البيانات",
        aboutBtn: "ℹ️ حول التطبيق",
        addAccountBtn: "➕ إضافة حساب جديد آخر",
        logoutBtn: "🚪 تسجيل الخروج",
        
        // 4. عناصر شاشة المحادثة والنوافذ
        sendBtn: "إرسال",
        inputPlaceholder: "...اكتب رسالتك هنا"
    },
    en: {
        dir: "ltr",
        // 1. Main Dropdown Menu
        profileMenu: "👤 My Profile",
        leaderboardMenu: "🏆 Leaderboard",
        gossipBoxMenu: "🤫 Gossip Box",
        gossipPaperMenu: "📰 Gossip Gazette",
        settingsMenu: "⚙️ Settings",
        
        // 2. Search & Header
        searchInput: "🔍 Search for people...",
        headerTitle: "Professional Chat Log",
        
        // 3. Settings Modal
        settingsTitle: "⚙️ Settings",
        themeBtn: "🌓 Toggle Theme (Dark / Light)",
        blockedBtn: "🚫 View Blocked Users",
        langLabel: "🌐 App Language:",
        ranksBtn: "👑 Royal Ranks System",
        privacyBtn: "🛡️ Privacy & Data Safety",
        aboutBtn: "ℹ️ About App",
        addAccountBtn: "➕ Add Another Account",
        logoutBtn: "🚪 Log Out",
        
        // 4. Chat Elements
        sendBtn: "Send",
        inputPlaceholder: "Type your message..."
    }
};

function changeAppLanguage(lang) {
    localStorage.setItem('wasl_app_lang', lang);
    applyAppLanguage(lang);
}

function applyAppLanguage(lang) {
    const currentLang = appTranslations[lang] ? lang : 'ar';
    const t = appTranslations[currentLang];
    
    // 1. تغيير اتجاه الصفحة
    document.documentElement.dir = t.dir;
    document.documentElement.lang = currentLang;
    
    // 2. ترجمة خيارات القائمة المنبثقة
    const mainDropdown = document.querySelectorAll('.dropdown-menu a, .dropdown-menu button, .menu-content a, .menu-content button');
    if (mainDropdown.length >= 5) {
        mainDropdown[0].textContent = t.profileMenu;
        mainDropdown[1].textContent = t.leaderboardMenu;
        mainDropdown[2].textContent = t.gossipBoxMenu;
        mainDropdown[3].textContent = t.gossipPaperMenu;
        mainDropdown[4].textContent = t.settingsMenu;
    }
    
    // 3. ترجمة خانة البحث
    const searchInput = document.querySelector('input[type="search"]') || document.querySelector('input[placeholder*="بحث"]') || document.querySelector('input[placeholder*="Search"]');
    if (searchInput) searchInput.placeholder = t.searchInput;
    
    // 4. ترجمة أزرار نافذة الإعدادات
    const settingsHeader = document.querySelector('#settingsModal h2');
    if (settingsHeader) settingsHeader.textContent = t.settingsTitle;
    
    const langLabel = document.querySelector('#settingsModal label');
    if (langLabel) langLabel.textContent = t.langLabel;
    
    const modalButtons = document.querySelectorAll('#settingsModal button');
    if (modalButtons.length >= 7) {
        modalButtons[0].textContent = t.themeBtn;
        modalButtons[1].textContent = t.blockedBtn;
        modalButtons[2].textContent = t.ranksBtn;
        modalButtons[3].textContent = t.privacyBtn;
        modalButtons[4].textContent = t.aboutBtn;
        modalButtons[5].textContent = t.addAccountBtn;
        modalButtons[6].textContent = t.logoutBtn;
    }
    
    // 5. مربع كتابة الرسائل
    const messageInput = document.getElementById('messageInput');
    if (messageInput) messageInput.placeholder = t.inputPlaceholder;
    
    // 6. اختيار القائمة المنسدلة
    const langSelect = document.querySelector('#settingsModal select');
    if (langSelect) langSelect.value = currentLang;
}

// التشغيل التلقائي عند فتح أو إنعاش الصفحة
document.addEventListener('DOMContentLoaded', () => {
    const savedLanguage = localStorage.getItem('wasl_app_lang') || 'ar';
    applyAppLanguage(savedLanguage);
});


 // ==========================================
// 🌐 نظام الترجمة الشامل لجميع النوافذ والعناصر
// ==========================================

function translateExtraElements(lang) {
    const isEn = lang === 'en';

    // 1. زر حذف الحساب وزر الإغلاق في الإعدادات
    const deleteAccountBtn = document.querySelector('#deleteAccountBtn, .delete-account-btn, button[onclick*="delete"]');
    if (deleteAccountBtn) {
        deleteAccountBtn.textContent = isEn ? '⚠️ Delete Account Permanently' : '⚠️ حذف الحساب نهائياً';
    }

    // 2. ترجمة زر الإغلاق الأحمر في كل النوافذ
    document.querySelectorAll('.modal button, .modal-content button, #settingsModal button').forEach(btn => {
        const txt = btn.textContent.trim();
        if (txt === 'إغلاق' || txt === 'Close') {
            btn.textContent = isEn ? 'Close' : 'إغلاق';
        }
    });

    // 3. نافذة الملف الشخصي (Profile Modal)
    const profileModal = document.getElementById('profileModal');
    if (profileModal) {
        const title = profileModal.querySelector('h2, .modal-title');
        if (title) title.textContent = isEn ? '👤 My Profile' : '👤 ملفي الشخصي';

        const saveBtn = profileModal.querySelector('#saveProfileBtn, .btn-save, button[type="submit"]');
        if (saveBtn) saveBtn.textContent = isEn ? '💾 Save' : '💾 حفظ';

        const changePhotoBtn = profileModal.querySelector('#changePhotoBtn, .change-photo');
        if (changePhotoBtn) changePhotoBtn.textContent = isEn ? 'Change Photo' : 'تغيير الصورة';

        const fullNameInput = profileModal.querySelector('#fullNameInput, input[name="fullname"]');
        if (fullNameInput) fullNameInput.placeholder = isEn ? 'Full Name' : 'الاسم الكامل';
    }

    // 4. لوحة الشرف (Leaderboard Modal)
    const leaderboardModal = document.getElementById('leaderboardModal');
    if (leaderboardModal) {
        const title = leaderboardModal.querySelector('h2');
        if (title) title.textContent = isEn ? '🏆 Kingdom Leaderboard' : '🏆 لوحة الشرف للمملكة';

        const subTitle = leaderboardModal.querySelector('p');
        if (subTitle) subTitle.textContent = isEn ? 'The most active and loyal knights in the Royal Court!' : 'فرسان المملكة الأكثر نشاطاً وولاءً في البلاط الملكي!';

        // ترجمة كلمة "نقطة" دون المساس بأسماء الحسابات
        leaderboardModal.querySelectorAll('.points, .user-points').forEach(el => {
            if (isEn && el.textContent.includes('نقطة')) el.textContent = el.textContent.replace('نقطة', 'pts');
            else if (!isEn && el.textContent.includes('pts')) el.textContent = el.textContent.replace('pts', 'نقطة');
        });
    }

    // 5. صندوق النميمة (Gossip Box Modal)
    const gossipModal = document.getElementById('gossipModal');
    if (gossipModal) {
        const title = gossipModal.querySelector('h2');
        if (title) title.textContent = isEn ? '🤫 Gossip Box' : '🤫 صندوق النميمة';

        const subTitle = gossipModal.querySelector('p');
        if (subTitle) subTitle.textContent = isEn ? 'Write whatever you dare! Your identity remains completely anonymous.' : 'اكتب ما تشاء بجرأة! هويتك ستظل مجهولة بالكامل.';

        const textarea = gossipModal.querySelector('textarea');
        if (textarea) textarea.placeholder = isEn ? 'Write your secret, confession, or gossip here...' : '...اكتب سرك، اعترافك، أو نميمتك هنا';

        const sendBtn = gossipModal.querySelector('#sendGossipBtn, .btn-purple');
        if (sendBtn) sendBtn.textContent = isEn ? '🚀 Send Secret to Everyone' : '🚀 إرسال سراً للجميع';

        const cancelBtn = gossipModal.querySelector('#cancelGossipBtn, .btn-danger');
        if (cancelBtn) cancelBtn.textContent = isEn ? 'Cancel' : 'إلغاء';
    }

    // 6. جريدة النميمة (Gossip Gazette Modal)
    const paperModal = document.getElementById('gossipPaperModal');
    if (paperModal) {
        const title = paperModal.querySelector('h2');
        if (title) title.textContent = isEn ? '📰 Royal Gossip Gazette' : '📰 جريدة النميمة الملكية';

        const subTitle = paperModal.querySelector('p');
        if (subTitle) subTitle.textContent = isEn ? 'Latest secret news, confessions, and whispers!' : 'آخر الأخبار السرية، الاعترافات، والهمسات!';
    }
}

// دمج الاستدعاء مباشرة مع دالة applyAppLanguage الأصلية
if (typeof applyAppLanguage === 'function') {
    const originalApply = applyAppLanguage;
    applyAppLanguage = function(lang) {
        originalApply(lang);
        translateExtraElements(lang);
    };
}

// تنفيذ فوري لتحديث العناصر بعد فتح النوافذ أو التبديل
document.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('wasl_app_lang') || 'ar';
    translateExtraElements(savedLang);
});







// ==========================================
// 🎯 كود ترجمة الكلمات المحددة (خفيف وبدون تعليق)
// ==========================================

function translateMySpecificList(lang) {
    const isEn = lang === 'en';

    // 1. الأزرار (حفظ، تغيير الصورة، إرسال سراً، إلغاء)
    document.querySelectorAll('button, .btn').forEach(btn => {
        const txt = btn.textContent.trim();
        if (txt === 'حفظ' || txt === '💾 حفظ' || txt === 'Save' || txt === '💾 Save') {
            btn.innerHTML = isEn ? '💾 Save' : '💾 حفظ';
        }
        if (txt === 'تغيير الصورة' || txt === 'Change Photo') {
            btn.textContent = isEn ? 'Change Photo' : 'تغيير الصورة';
        }
        if (txt.includes('إرسال سراً للجميع') || txt.includes('Send Secret to Everyone')) {
            btn.innerHTML = isEn ? '🚀 Send Secret to Everyone' : '🚀 إرسال سراً للجميع';
        }
        if (txt === 'إلغاء' || txt === 'Cancel') {
            btn.textContent = isEn ? 'Cancel' : 'إلغاء';
        }
    });

    // 2. المدخلات والنصوص (الاسم الكامل، اسم المستخدم، تحديد المواليد)
    document.querySelectorAll('input, label, div, span').forEach(el => {
        if (el.tagName === 'INPUT') {
            if (el.placeholder === 'الاسم الكامل' || el.placeholder === 'Full Name') {
                el.placeholder = isEn ? 'Full Name' : 'الاسم الكامل';
            }
        } else if (el.children.length === 0) {
            const txt = el.textContent.trim();
            if (txt === 'اسم المستخدم' || txt === 'Username') {
                el.textContent = isEn ? 'Username' : 'اسم المستخدم';
            }
            if (txt === 'تحديد المواليد' || txt === 'Select Birth Year') {
                el.textContent = isEn ? 'Select Birth Year' : 'تحديد المواليد';
            }
        }
    });

    // 3. نصوص الجريدة (العنوان والوصف)
    document.querySelectorAll('h2, h3, p, div').forEach(el => {
        if (el.children.length === 0) {
            const txt = el.textContent.trim();
            if (txt.includes('جريدة النميمة الملكية') || txt.includes('Royal Gossip Gazette')) {
                el.textContent = isEn ? '📰 Royal Gossip Gazette' : '📰 جريدة النميمة الملكية';
            }
            if (txt.includes('آخر الأخبار السرية، الاعترافات، والهمسات!') || txt.includes('Latest secret news')) {
                el.textContent = isEn ? 'Latest secret news, confessions, and whispers!' : 'آخر الأخبار السرية، الاعترافات، والهمسات!';
            }
        }
    });
}

// دمج الترجمة مع دالة اللغة الأصلية بدون استخدام Observer
if (typeof applyAppLanguage === 'function') {
    const originalApplyFunc = applyAppLanguage;
    applyAppLanguage = function(lang) {
        originalApplyFunc(lang);
        translateMySpecificList(lang);
    };
}

// تشغيل الترجمة مرة واحدة عند فتح أي نافذة من أزرار التطبيق
document.addEventListener('click', (e) => {
    setTimeout(() => {
        const activeLang = localStorage.getItem('wasl_app_lang') || 'ar';
        translateMySpecificList(activeLang);
    }, 150);
});





// ==========================================
// 🎯 كود ترجمة العبارتين الأخيرتين فقط
// ==========================================

// 1. ترجمة نص التحميل في لوحة الشرف
function translateLoadingText(lang) {
    const isEn = lang === 'en';
    document.querySelectorAll('div, span, p').forEach(el => {
        if (el.children.length === 0) {
            const txt = el.textContent.trim();
            if (txt.includes('جاري استدعاء فرسان المملكة') || txt.includes('Summoning Kingdom Knights')) {
                el.textContent = isEn ? '⚡ Summoning Kingdom Knights...' : '⚡ ...جاري استدعاء فرسان المملكة';
            }
        }
    });
}

// 2. ترجمة رسالة الـ Alert المباشرة عند الضغط على زر (+)
const originalAlert = window.alert;
window.alert = function (message) {
    const activeLang = localStorage.getItem('wasl_app_lang') || 'ar';
    if (activeLang === 'en' && typeof message === 'string') {
        if (message.includes('تم العثور على شخص مجهول! جاري فتح الدردشة مع:')) {
            message = message.replace('تم العثور على شخص مجهول! جاري فتح الدردشة مع:', '🎲 Anonymous user found! Opening chat with:');
        }
    }
    return originalAlert(message);
};

// تشغيل فحص الترجمة لوحة الشرف عند النقرة وبفارق زمني بسيط للتحميل
document.addEventListener('click', () => {
    const activeLang = localStorage.getItem('wasl_app_lang') || 'ar';
    translateLoadingText(activeLang);
    setTimeout(() => translateLoadingText(activeLang), 400);
});






// ==========================================
// 🎯 كود ترجمة نصوص صفحة الرتب الملكية فقط
// ==========================================

function translateRoyalRanksPage(lang) {
    const isEn = lang === 'en';

    // قائمة ترجمة الكلمات العربية المتبقية في الصور
    const translations = [
        // العناوين والمقدمات
        { ar: 'نظام الرتب الملكية - وصل', en: 'Wasl - Royal Ranks System' },
        { ar: '"مرحباً بك في نظام الرتب الملكي الخاص بتطبيق "وصل!', en: '"Welcome to the Royal Ranks System for Wasl app!"' },
        { ar: 'الرتبة السيادية العليا في التطبيق (الإدارة العامة)', en: 'Supreme Sovereign Rank in App (General Management)' },
        { ar: 'النخبة ومساعدو الإدارة المباشرين (المشرف العام)', en: 'Elite Direct Admin Assistants (General Supervisor)' },
        { ar: 'الممنوحة لداعمي التطبيق (VIP) رتبة كبار الشخصيات والمستمرين فيه', en: 'VIP rank granted to app supporters and continuous members' },
        { ar: 'رتبة خادم البلاط (الأعضاء الجدد)', en: 'Court Servant Rank (New Members)' },
        
        // تفاصيل النقاط داخل الرتب
        { ar: 'إمكانية: (Reactions) تفاعلات حصرية', en: 'Ability to use exclusive Reactions' },
        { ar: 'تلوين الاسم:', en: 'Name Coloring:' },
        { ar: 'تزيين الملف الشخصي وتوضيح مكانة العضو.', en: 'Decorates personal profile and highlights member status.' },
        { ar: 'أولوية معالجة (Flagging) التبليغ السريع:', en: 'Priority Processing for Fast Flagging:' },
        { ar: 'القدرة على قراءة الرسائل والمشاركة بالكتابة في غرف الدردشة العامة فقط.', en: 'Ability to read and write messages in public chat rooms only.' },
        { ar: 'لا يمكنه استخدام (Reactions) التفاعلات الحصرية أو تغيير خلفيات الدردشة في هذه المرحلة.', en: 'Cannot use exclusive Reactions or change chat backgrounds at this stage.' },
        { ar: 'تطبيق وصل', en: 'Wasl App' }
    ];

    document.querySelectorAll('h1, h2, h3, h4, p, span, div, li').forEach(el => {
        if (el.children.length === 0) {
            const txt = el.textContent.trim();
            translations.forEach(item => {
                if (isEn && txt.includes(item.ar)) {
                    el.textContent = el.textContent.replace(item.ar, item.en);
                } else if (!isEn && txt.includes(item.en)) {
                    el.textContent = el.textContent.replace(item.en, item.ar);
                }
            });
        }
    });
}

// دمج مع دالة التبديل الأصلية أو تشغيلها مباشرة
if (typeof applyAppLanguage === 'function') {
    const originalApplyFunc = applyAppLanguage;
    applyAppLanguage = function(lang) {
        originalApplyFunc(lang);
        translateRoyalRanksPage(lang);
    };
}

// تشغيل الترجمة عند تحميل الصفحة
const activeLang = localStorage.getItem('wasl_app_lang') || 'ar';
translateRoyalRanksPage(activeLang);






// ==========================================
// 🎯 كود مباشر واستثنائي لترجمة صفحة الرتب الملكية
// ==========================================

function forceTranslateRanksPage(lang) {
    const isEn = lang === 'en';

    // قاموس مطابق تماماً للنصوص الظاهرة في الصور
    const dictionary = [
        {
            ar: 'الرتبة السيادية العليا في التطبيق (الإدارة العامة)',
            en: 'Supreme Sovereign Rank in App (General Management)'
        },
        {
            ar: 'النخبة ومساعدو الإدارة المباشرين (المشرف العام)',
            en: 'Elite Direct Admin Assistants (General Supervisor)'
        },
        {
            ar: 'الممنوحة لداعمي التطبيق (VIP) رتبة كبار الشخصيات والمستمرين فيه',
            en: 'VIP rank granted to app supporters and continuous members'
        },
        {
            ar: 'رتبة خادم البلاط (الأعضاء الجدد)',
            en: 'Court Servant Rank (New Members)'
        },
        {
            ar: 'القدرة على قراءة الرسائل والمشاركة بالكتابة في غرف الدردشة العامة فقط.',
            en: 'Ability to read and write messages in public chat rooms only.'
        },
        {
            ar: 'لا يمكنه استخدام (Reactions) التفاعلات الحصرية أو تغيير خلفيات الدردشة في هذه المرحلة.',
            en: 'Cannot use exclusive Reactions or change chat backgrounds at this stage.'
        },
        {
            ar: 'تزيين الملف الشخصي وتوضيح مكانة العضو.',
            en: 'Decorates personal profile and highlights member status.'
        },
        {
            ar: 'أولوية معالجة (Flagging) التبليغ السريع:',
            en: 'Priority Processing for Fast Flagging:'
        },
        {
            ar: 'إمكانية: (Reactions) تفاعلات حصرية',
            en: 'Ability to use exclusive Reactions'
        },
        {
            ar: 'تلوين الاسم:',
            en: 'Name Coloring:'
        },
        {
            ar: 'تطبيق وصل',
            en: 'Wasl App'
        }





      
    ];

    // الاستهداف المباشر لجميع العناصر التي تحتوي نصوصاً
    const elements = document.querySelectorAll('body *:not(script):not(style)');

    elements.forEach(el => {
        // الترجمة فقط إذا كان العنصر يحتوي على نص وليس لديه أطفال (أو لديه نص مباشر)
        if (el.childNodes.length > 0) {
            el.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') {
                    dictionary.forEach(item => {
                        if (isEn && node.nodeValue.includes(item.ar)) {
                            node.nodeValue = node.nodeValue.replace(item.ar, item.en);
                        } else if (!isEn && node.nodeValue.includes(item.en)) {
                            node.nodeValue = node.nodeValue.replace(item.en, item.ar);
                        }
                    });
                }
            });
        }
    });
}









setInterval(function() {
    const lang = localStorage.getItem('wasl_app_lang') || 'ar';
    const allElements = document.querySelectorAll('button, a, div, span, p');
    
    allElements.forEach(el => {
        // التأكد من أننا نغير النص داخل الزر نفسه فقط وليس القائمة بالكامل
        if (el.children.length === 0) {
            if (el.textContent.includes('المتجر الملكي') || el.textContent.includes('Royal Store')) {
                if (lang === 'en') {
                    el.innerHTML = '🛍️ Royal Store';
                } else {
                    el.innerHTML = '🛍️ المتجر الملكي';
                }
            }
        }
    });
}, 100);



// ==========================================
// كود ترجمة قائمة المحظورين تلقائياً (JS)
// ==========================================
setInterval(function() {
    const lang = localStorage.getItem('wasl_app_lang') || 'ar';
    const allElements = document.querySelectorAll('div, span, p, h3, h4');
    
    allElements.forEach(el => {
        if (el.children.length === 0) {
            let text = el.textContent.trim();
            
            // ترجمة العنوان والعنوان الفرعي
            if (lang === 'en') {
                if (text === 'الأشخاص المحظورون:') {
                    el.textContent = 'Blocked Users:';
                }
                if (text === 'لا يوجد مستخدمون محظورون حالياً.') {
                    el.textContent = 'No blocked users at the moment.';
                }
            } else {
                if (text === 'Blocked Users:') {
                    el.textContent = 'الأشخاص المحظورون:';
                }
                if (text === 'No blocked users at the moment.') {
                    el.textContent = 'لا يوجد مستخدمون محظورون حالياً.';
                }
            }
        }
    });
}, 100);





// تشغيل الدالة فوراً وعند التنقل/النقرات
(function initRanksTranslation() {
    const activeLang = localStorage.getItem('wasl_app_lang') || 'ar';
    
    // تشغيل فوري
    forceTranslateRanksPage(activeLang);

    // تشغيل متكرر خفيف لضمان ترجمة الأجزاء التي تحمل متأخرة
    setTimeout(() => forceTranslateRanksPage(activeLang), 200);
    setTimeout(() => forceTranslateRanksPage(activeLang), 600);
})();









// ==========================================
// التحديث التلقائي لزر حسابي (عربي / إنجليزي)
// ==========================================
setInterval(() => {
    const lang = localStorage.getItem('wasl_app_lang') || 'ar';
    const accBtn = document.querySelector('.account-btn-text');
    
    if (accBtn) {
        if (lang === 'en') {
            accBtn.innerHTML = '👤 My Account';
        } else {
            accBtn.innerHTML = '👤 حسابي';
        }
    }
}, 200);










// فتح نافذة الإعدادات تلقائياً إذا جاء المستخدم من صفحة حول التطبيق
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('open_settings') === 'true') {
        localStorage.removeItem('open_settings'); // مسح الإشارة
        
        // محاولة الضغط على زر الإعدادات تلقائياً أو إظهار النافذة
        const settingsBtn = document.querySelector('.settings-btn, #settingsBtn, [onclick*="setting"]');
        if (settingsBtn) {
            settingsBtn.click();
        } else {
            const settingsModal = document.querySelector('#settingsModal, .settings-modal');
            if (settingsModal) settingsModal.style.display = 'block';
        }
    }
});





// ==========================================
// 1. تنظيف السجلات القديمة المخفية بالخطأ (مرة واحدة)
// ==========================================
if (!localStorage.getItem('v2_fix_applied')) {
    localStorage.removeItem('deletedChatIds');
    localStorage.setItem('v2_fix_applied', 'true');
}

// ==========================================
// 2. كود إدارة التثبيت والحذف المعالج بالكامل
// ==========================================

let timer = null;
let selectedChatCard = null;

const overlay = document.getElementById('chatPreviewOverlay');
const previewWrapper = document.getElementById('previewCardWrapper');
const pinBtn = document.getElementById('pinChatBtn');
const deleteBtn = document.getElementById('deleteChatBtn');

let pinnedChatIds = (JSON.parse(localStorage.getItem('pinnedChatIds')) || []).filter(id => id && typeof id === 'string');
let deletedChatIds = (JSON.parse(localStorage.getItem('deletedChatIds')) || []).filter(id => id && typeof id === 'string');

// استخراج الـ ID الحقيقي فقط ومنع التخمين الخاطئ
function getChatId(element) {
    if (!element || element.classList.contains('empty-msg')) return null;
    return element.getAttribute('data-id') || element.dataset.id || element.dataset.username || element.id || null;
}

// دالة التثبيت والترتيب بدون إخفاء عشوائي
function applyPinsAndFilters() {
    const contactsContainer = document.getElementById('contactsList');
    if (!contactsContainer) return;

    const chatItems = Array.from(contactsContainer.children);
    const pinnedItems = [];
    const normalItems = [];

    chatItems.forEach(card => {
        if (card.classList.contains('empty-msg')) return;

        // إعطاء ID تلقائي إذا كان العنصر يفتقده لتجنب الإخفاء
        let chatId = getChatId(card);
        if (!chatId) {
            const titleElement = card.querySelector('h3, h4, .user-name, .chat-name, strong') || card;
            chatId = titleElement.innerText.replace('📌', '').trim();
            if (chatId) card.setAttribute('data-id', chatId);
        }

        // إخفاء العنصر فقط إذا كان محذوفاً صراحة
        if (chatId && deletedChatIds.includes(chatId)) {
            card.style.display = 'none';
            return;
        } else {
            card.style.display = '';
        }

        let pinIcon = card.querySelector('.pinned-badge-icon');

        if (chatId && pinnedChatIds.includes(chatId)) {
            if (!pinIcon) {
                pinIcon = document.createElement('span');
                pinIcon.className = 'pinned-badge-icon';
                pinIcon.innerText = ' 📌';
                pinIcon.style.cssText = 'font-size: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;';
                
                const titleElement = card.querySelector('h3, h4, .user-name, .chat-name, strong') || card;
                titleElement.appendChild(pinIcon);
            }
            pinnedItems.push(card);
        } else {
            if (pinIcon) pinIcon.remove();
            normalItems.push(card);
        }
    });

    // إعادة الترتيب بوضع المثبتة في الأعلى
    pinnedItems.forEach(card => contactsContainer.appendChild(card));
    normalItems.forEach(card => contactsContainer.appendChild(card));
}

// أحداث المعاينة والضغط المطول
document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('#contactsList')) e.preventDefault();
});

document.addEventListener('touchstart', (e) => {
    const chatCard = e.target.closest('#contactsList > *');
    if (!chatCard || chatCard.classList.contains('empty-msg')) return;

    selectedChatCard = chatCard;
    timer = setTimeout(() => {
        openPreview(selectedChatCard);
    }, 800);
}, { passive: true });

document.addEventListener('touchend', clearTimer);
document.addEventListener('touchmove', clearTimer);

function clearTimer() {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
}

function openPreview(element) {
    if (!element || !overlay) return;
    if (navigator.vibrate) navigator.vibrate(60);

    const chatId = getChatId(element);
    const isPinned = chatId && pinnedChatIds.includes(chatId);

    if (pinBtn) {
        pinBtn.innerHTML = isPinned ? '📌 إلغاء التثبيت' : '📌 تثبيت المحادثة';
    }

    if (previewWrapper) {
        previewWrapper.innerHTML = '';
        const clone = element.cloneNode(true);
        const clonePinIcon = clone.querySelector('.pinned-badge-icon');
        if (clonePinIcon) clonePinIcon.remove();
        previewWrapper.appendChild(clone);
    }
    
    overlay.classList.add('active');
}

function closePreview() {
    if (overlay) overlay.classList.remove('active');
    selectedChatCard = null;
}

if (overlay) {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePreview();
    });
}

// أزرار التثبيت والحذف
if (pinBtn) {
    pinBtn.onclick = () => {
        const chatId = getChatId(selectedChatCard);
        if (chatId) {
            const index = pinnedChatIds.indexOf(chatId);
            if (index > -1) {
                pinnedChatIds.splice(index, 1);
            } else {
                pinnedChatIds.push(chatId);
            }
            localStorage.setItem('pinnedChatIds', JSON.stringify(pinnedChatIds));
            applyPinsAndFilters();
        }
        closePreview();
    };
}

if (deleteBtn) {
    deleteBtn.onclick = () => {
        const chatId = getChatId(selectedChatCard);
        if (chatId) {
            pinnedChatIds = pinnedChatIds.filter(id => id !== chatId);
            localStorage.setItem('pinnedChatIds', JSON.stringify(pinnedChatIds));

            if (!deletedChatIds.includes(chatId)) {
                deletedChatIds.push(chatId);
                localStorage.setItem('deletedChatIds', JSON.stringify(deletedChatIds));
            }
            applyPinsAndFilters();
        } else if (selectedChatCard) {
            selectedChatCard.remove();
        }
        closePreview();
    };
}

// تشغيل المراقبة والترتيب عند إضافة عنصر جديد
const contactsListObserver = document.getElementById('contactsList');
if (contactsListObserver) {
    let isUpdating = false;
    const observer = new MutationObserver(() => {
        if (isUpdating) return;
        isUpdating = true;
        applyPinsAndFilters();
        setTimeout(() => { isUpdating = false; }, 100);
    });
    observer.observe(contactsListObserver, { childList: true });
}

document.addEventListener('DOMContentLoaded', applyPinsAndFilters);





// ==========================================
// التحديث التلقائي لأزرار تثبيت وحذف المحادثة ( عربي / إنجليزي )
// ==========================================
setInterval(() => {
    const lang = localStorage.getItem('wasl_app_lang') || 'ar';
    const pinBtn = document.getElementById('pinChatBtn');
    const deleteBtn = document.getElementById('deleteChatBtn');

    if (pinBtn) {
        const text = pinBtn.textContent.trim();
        if (lang === 'en') {
            if (text.includes('إلغاء التثبيت')) {
                pinBtn.textContent = '📌 Unpin Chat';
            } else if (text.includes('تثبيت المحادثة')) {
                pinBtn.textContent = '📌 Pin Chat';
            }
        } else {
            if (text.includes('Unpin Chat')) {
                pinBtn.textContent = '📌 إلغاء التثبيت';
            } else if (text.includes('Pin Chat')) {
                pinBtn.textContent = '📌 تثبيت المحادثة';
            }
        }
    }

    if (deleteBtn) {
        const text = deleteBtn.textContent.trim();
        if (lang === 'en') {
            if (text.includes('حذف المحادثة')) {
                deleteBtn.textContent = '🗑️ Delete Chat';
            }
        } else {
            if (text.includes('Delete Chat')) {
                deleteBtn.textContent = '🗑️ حذف المحادثة';
            }
        }
    }
}, 200);









function openSuggestionsPage() {
    window.location.href = 'suggest.html';
}





// ==========================================
// كود إصلاح وتحديث سجل المحادثات (تلقائي)
// ==========================================

(function initChatListAutoFix() {
    // دالة لتحديث سجل قائمة المحادثات للطرفين
    function syncUserChatList(senderId, receiverId, lastText) {
        if (!senderId || !receiverId) return;

        // الوقت الحالي الخاص بالفايربيس
        const timeNow = (typeof firebase !== 'undefined' && firebase.database && firebase.database.ServerValue) 
            ? firebase.database.ServerValue.TIMESTAMP 
            : Date.now();

        const updateDataForSender = {
            peerId: receiverId,
            lastMessage: lastText,
            timestamp: timeNow
        };

        const updateDataForReceiver = {
            peerId: senderId,
            lastMessage: lastText,
            timestamp: timeNow
        };

        // تحديث مسار سجل المحادثات للمرسل والمستقبل
        if (typeof firebase !== 'undefined' && firebase.database) {
            firebase.database().ref('user_chats/' + senderId + '/' + receiverId).update(updateDataForSender);
            firebase.database().ref('user_chats/' + receiverId + '/' + senderId).update(updateDataForReceiver);
        }
    }

    // مراقبة الرسائل بعد تأكد تسجيل الدخول
    function startListeningForMessages() {
        if (typeof firebase === 'undefined' || !firebase.auth) return;

        firebase.auth().onAuthStateChanged(function(user) {
            if (!user) return;
            const myUid = user.uid;

            // الاستماع لكل جديد في عقدة الرسائل
            firebase.database().ref('messages').on('child_added', function(chatGroup) {
                chatGroup.ref.limitToLast(1).on('child_added', function(msgSnap) {
                    const msg = msgSnap.val();
                    if (!msg) return;

                    // جلب الأطراف بغض النظر عن مسمى الحقل في الداتا بيز
                    const sender = msg.sender || msg.senderId || msg.from || msg.uid;
                    const receiver = msg.receiver || msg.receiverId || msg.to || msg.peerId;
                    const text = msg.text || msg.message || msg.content || 'رسالة جديدة';

                    if (sender === myUid || receiver === myUid) {
                        syncUserChatList(sender, receiver, text);
                    }
                });
            });
        });
    }

    // تشغيل الفحص
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        startListeningForMessages();
    } else {
        document.addEventListener('DOMContentLoaded', startListeningForMessages);
    }
})();



// ==========================================
// الكود المصحح لقراءة جميع المحادثات من كولكشن chats
// ==========================================

(function fixChatListRendering() {
    function startListeningToChats() {
        if (typeof firebase === 'undefined' || !firebase.auth || !firebase.firestore) return;

        const db = firebase.firestore();

        firebase.auth().onAuthStateChanged(function(user) {
            if (!user) return;
            const myUid = user.uid;

            // الاستماع المباشر لكولكشن chats بناءً على مصفوفة users الظاهرة في الفايرستور
            db.collection('chats')
              .where('users', 'array-contains', myUid)
              .onSnapshot(function(snapshot) {
                  // تحويل المستندات لمصفوفة مرتبة يدوياً لتفادي تجاهل المستندات التي تفتقر لتاريخ
                  let chatList = [];

                  snapshot.forEach(function(doc) {
                      const data = doc.data();
                      
                      // استخراج المعرف الخاص بالطرف الآخر من مصفوفة users
                      const usersArr = data.users || [];
                      const peerId = usersArr.find(id => id !== myUid);

                      if (peerId) {
                          chatList.push({
                              docId: doc.id,
                              peerId: peerId,
                              lastMessage: data.lastMessage || 'رسالة',
                              updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt)) : new Date(0)
                          });
                      }
                  });

                  // ترتيب المحادثات من الأحدث إلى الأقدم
                  chatList.sort((a, b) => b.updatedAt - a.updatedAt);

                  // إذا كانت لديك دالة لعرض القائمة في الواجهة
                  if (typeof renderMyChatListUI === 'function') {
                      renderMyChatListUI(chatList);
                  }
              }, function(error) {
                  console.error("خطأ قراءة المحادثات:", error);
              });
        });
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        startListeningToChats();
    } else {
        document.addEventListener('DOMContentLoaded', startListeningToChats);
    }
})();






// ==========================================
// إصلاح اختفاء المحادثات وتأكيد الإرسال في السجل
// ==========================================

(function fixChatHistoryAndSending() {
    // دالة موحدة لضمان وجود المحادثة في قائمة السجل
    window.ensureChatExistsInHistory = function(receiverId, lastMessageText) {
        const currentUser = firebase.auth().currentUser;
        if (!currentUser || !receiverId) return Promise.reject("معلومات غير مكتملة");

        const myUid = currentUser.uid;
        const db = firebase.firestore();
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();

        // إنشاء معرف محادثة موحد ومستقر بين الطرفين
        const chatId = [myUid, receiverId].sort().join('_');

        // تحديث أو إنشاء مستند الدردشة في سجل المحادثات
        return db.collection('chats').doc(chatId).set({
            chatId: chatId,
            users: [myUid, receiverId],
            lastMessage: lastMessageText || 'رسالة جديدة',
            lastSender: myUid,
            updatedAt: timestamp
        }, { merge: true });
    };

    // اعتراض دالة الإرسال الرئيسية وتأكيد المزامنة قبل الخروج
    const originalSendMessage = window.sendMessage;
    if (typeof originalSendMessage === 'function') {
        window.sendMessage = async function(...args) {
            const receiverId = window.currentReceiverId || window.activePeerId || (typeof activeUser !== 'undefined' ? activeUser.id : null);
            
            // تنفيذ الإرسال الأصلي
            const result = originalSendMessage.apply(this, args);

            // تأكيد حفظ المحادثة في السجل مباشرة
            if (receiverId) {
                const inputEl = document.querySelector('input[type="text"], textarea');
                const text = inputEl ? inputEl.value : 'رسالة';
                await window.ensureChatExistsInHistory(receiverId, text);
            }

            return result;
        };
    }

    // إجبار النظام على تحديث السجل عند إرسال أي عنصر في الشاشة
    document.addEventListener('click', function(e) {
        const sendBtn = e.target.closest('#sendBtn, .send-btn, [onClick*="send"]');
        if (sendBtn) {
            const receiverId = window.currentReceiverId || window.activePeerId || (typeof activeUser !== 'undefined' ? activeUser.id : null);
            const inputEl = document.querySelector('input[type="text"], textarea');
            const text = inputEl ? inputEl.value : '';

            if (receiverId && text.trim() !== '') {
                window.ensureChatExistsInHistory(receiverId, text);
            }
        }
    }, true);
})();





// ==========================================
// نظام قفل الدردشات مع استثناء محادثة المطور
// ==========================================

(function enforceChatLockSecurityWithDevException() {
    // ⚠️ ضع معرف المطور الخاص بك هنا بدقة (Developer UID)
    const DEVELOPER_UID = "iB9c5FMQefeeB9Oapp7ByWlyKIe2"; 

    const originalOpenChat = window.openChat;
    
    if (typeof originalOpenChat === 'function') {
        window.openChat = function(userId, ...args) {
            // 1. استثناء المطور: إذا كان المستخدم هو المطور، افتح المحادثة فوراً بدون قفل
            if (userId === DEVELOPER_UID) {
                const chatBox = document.querySelector('.chat-messages, .messages-container, #chatBox, #chatMessages, .chat-body');
                if (chatBox) chatBox.style.visibility = 'visible';

                const lockModal = document.querySelector('#lockModal, .lock-modal, #pinModal, [id*="lock"]');
                if (lockModal) lockModal.style.display = 'none';

                return originalOpenChat.apply(this, [userId, ...args]);
            }

            // 2. فحص بقية المستخدمين المقفلة محادثاتهم
                    // فحص قفل المحادثة المحددة فقط
        const isLocked = localStorage.getItem('pin_' + userId) !== null;

        if (!isLocked) {
          return originalOpenChat.apply(this, [userId, ...args]);
        }

        // إخفاء المحادثة وإظهار نافذة الرمز
        const chatBox = document.querySelector('.chat-messages, .messages-container, #chatBox, #chatMessages, .chat-body');
        if (chatBox) chatBox.style.visibility = 'hidden';

        const lockModal = document.querySelector('#lockModal, .lock-modal, #pinModal, [id*="lock"]');
        if (lockModal) lockModal.style.display = 'flex';

        window.pendingLockedUserId = userId;
        window.pendingOpenArgs = args;

        };
    }






  // 1. التحقق من رمز المحادثة المحددة فقط
document.addEventListener('click', function(e) {
  const confirmBtn = e.target.closest('#unlockBtn, .unlock-btn, [onClick*="unlock"], [onClick*="checkPin"]');
  
  if (confirmBtn && window.pendingLockedUserId) {
    const pinInput = document.querySelector('input[type="password"], input[placeholder*="PIN"], .pin-input');
    const enteredPin = pinInput ? pinInput.value.trim() : '';
    
    // قراءة الرمز المخصص لمعرف هذه المحادثة فقط
    const targetId = window.pendingLockedUserId;
    const savedPin = localStorage.getItem('pin_' + targetId);

    if (savedPin && enteredPin === savedPin) {
      const chatBox = document.querySelector('.chat-messages, .messages-container, #chatBox, #chatMessages, .chat-body');
      if (chatBox) chatBox.style.visibility = 'visible';

      const lockModal = document.querySelector('#lockModal, .lock-modal, #pinModal, [id*="lock"]');
      if (lockModal) lockModal.style.display = 'none';

      if (typeof originalOpenChat === 'function') {
        originalOpenChat.apply(window, [targetId, ...(window.pendingOpenArgs || [])]);
      }

      window.pendingLockedUserId = null;
      if (pinInput) pinInput.value = '';
    } else {
      alert("الرمز السري غير صحيح لهذه المحادثة!");
    }
  }
}, true);

})();




// ==========================================
// زر المحادثة العامة 🌐 (لاصق فوق زر + مباشرة)
// ==========================================
(function() {
    const oldBtn = document.getElementById("globalChatBtn");
    if (oldBtn) oldBtn.remove();

    const globalBtn = document.createElement("button");
    globalBtn.id = "globalChatBtn";
    globalBtn.innerHTML = "🌐";
    globalBtn.title = "المحادثة العامة للجميع";
    
    // تم تعديل bottom إلى 85px ليصبح فوق الزر الأخضر مباشرة
    globalBtn.style.cssText = `
        position: fixed;
        bottom: 85px;
        left: 13px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background-color: #4e54c8;
        color: white;
        border: none;
        font-size: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
        z-index: 99;
        transition: transform 0.2s;
    `;

    globalBtn.onmousedown = () => globalBtn.style.transform = "scale(0.9)";
    globalBtn.onmouseup = () => globalBtn.style.transform = "scale(1)";

    document.body.appendChild(globalBtn);

    globalBtn.addEventListener("click", function () {
        window.location.href = "global-chat.html";
    });
})();




// مراقبة نافذة الإعدادات لإخفاء أو إظهار زر الكرة الأرضية تلقائياً
const settingsModal = document.getElementById('settingsModal');
if (settingsModal) {
    const observer = new MutationObserver(() => {
        const globeBtn = document.getElementById('globalChatBtn');
        if (globeBtn) {
            if (settingsModal.classList.contains('hidden')) {
                globeBtn.style.display = 'flex'; // إظهار الزر عند إغلاق الإعدادات
            } else {
                globeBtn.style.display = 'none'; // إخفاء الزر عند فتح الإعدادات
            }
        }
    });
    observer.observe(settingsModal, { attributes: true, attributeFilter: ['class'] });
}

(function() {
    const chatForm = document.getElementById('chatForm');
    const globalBtn = document.getElementById('globalChatBtn');
    if (!chatForm || !globalBtn) return;

    const observer = new MutationObserver(function() {
        const isHidden = chatForm.hasAttribute('hidden') || chatForm.style.display === 'none';
        
        if (isHidden) {
            // إذا كان الشات مخفياً (أنت في القائمة أو خرجت) -> أظهر الأيقونة
            globalBtn.style.setProperty('display', 'flex', 'important');
        } else {
            // إذا كان الشات ظاهراً (أنت داخل المحادثة) -> اخفِ الأيقونة
            globalBtn.style.setProperty('display', 'none', 'important');
        }
    });

    observer.observe(chatForm, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
})();


// 1. تعديل دالة فتح النوافذ لتخفي الأيقونة فوراً
if (typeof openModal === 'function') {
    const originalOpenModal = openModal;
    window.openModal = function(modalId) {
        originalOpenModal(modalId); // تشغيل فتح النافذة العادي
        const globalBtn = document.getElementById('globalChatBtn');
        if (globalBtn) {
            globalBtn.style.setProperty('display', 'none', 'important');
        }
    };
}

// 2. دالة عامة لمراقبة أزرار الإغلاق أو الرجوع لإعادة إظهار الأيقونة
document.addEventListener('click', function(event) {
    // إذا تم النقر على زر إغلاق أو زر يحمل أمر إغلاق النافذة
    const target = event.target;
    if (target.innerText.includes('إغلاق') || target.classList.contains('close-btn') || target.getAttribute('onclick')?.includes('Close')) {
        setTimeout(() => {
            const globalBtn = document.getElementById('globalChatBtn');
            // تأكد أننا لسنا داخل الشات قبل إظهارها
            const chatForm = document.getElementById('chatForm');
            const isChatOpen = chatForm && !chatForm.hasAttribute('hidden') && window.getComputedStyle(chatForm).display !== 'none';
            
            if (globalBtn && !isChatOpen) {
                globalBtn.style.setProperty('display', 'flex', 'important');
            }
        }, 100);
    }
});






// فتح نافذة كود الدعوة وعرض الـ UID
function openReferralModal() {
    const modal = document.getElementById('referralModal');
    const input = document.getElementById('myReferralCodeInput');
    
    if (auth.currentUser) {
        input.value = auth.currentUser.uid;
    } else {
        input.value = "يرجى تسجيل الدخول أولاً";
    }
    
    modal.style.display = 'flex';
}

// إغلاق النافذة
function closeReferralModal() {
    document.getElementById('referralModal').style.display = 'none';
}

// نسخ الكود المكتوب في الحقلي
function copyReferralCodeFromInput() {
    const input = document.getElementById('myReferralCodeInput');
    
    if (!auth.currentUser) {
        alert("يرجى تسجيل الدخول أولاً!");
        return;
    }
    
    input.select();
    input.setSelectionRange(0, 99999); // للهواتف

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(input.value).then(() => {
            alert("تم نسخ كود الدعوة بنجاح! 👑");
        }).catch(() => {
            document.execCommand('copy');
            alert("تم نسخ كود الدعوة بنجاح! 👑");
        });
    } else {
        document.execCommand('copy');
        alert("تم نسخ كود الدعوة بنجاح! 👑");
    }
}





// دالة إنشاء حساب جديد مع فحص كود الدعوة
async function handleUserRegistration(email, password, username, referralCodeInput) {
    try {
        // 1. إنشاء الحساب في Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const newUser = userCredential.user;
        const newUid = newUser.uid;

        // 2. تجهيز بيانات المستخدم الجديد
        const userData = {
            uid: newUid,
            username: username,
            email: email,
            referralCount: 0, // عدد أصدقائه الذين دعاهم
            role: "عضو",       // الرتبة الافتراضية
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // 3. إذا قام المستخدم بوضع كود دعوة أثناء التسجيل
        if (referralCodeInput && referralCodeInput.trim() !== "") {
            const inviterUid = referralCodeInput.trim();
            const inviterRef = db.collection('users').doc(inviterUid);
            
            const inviterDoc = await inviterRef.get();
            if (inviterDoc.exists()) {
                // زيادة عداد الدعوات للشخص الداعي +1
                await inviterRef.update({
                    referralCount: firebase.firestore.FieldValue.increment(1)
                });
                
                // التحقق هل وصل الداعي إلى 5 دعوات ليصبح ملك الشات؟
                const updatedInviter = (await inviterRef.get()).data();
                if (updatedInviter.referralCount >= 5 && updatedInviter.role !== "ملك الشات") {
                    await inviterRef.update({
    role: "👑 ملك الشات",
    crownedAt: firebase.firestore.FieldValue.serverTimestamp()
});

                }
            }
        }

        // 4. حفظ بيانات المستخدم الجديد في Firestore
        await db.collection('users').doc(newUid).set(userData);
        
        alert("تم إنشاء الحساب بنجاح!");
        // التوجيه لصفحة الشات
        window.location.href = "chat.html";

    } catch (error) {
        console.error("خطأ في التسجيل:", error);
        alert("حدث خطأ أثناء التسجيل: " + error.message);
    }
}




// فحص وتطبيق نظام الـ 7 أيام لملك الشات
auth.onAuthStateChanged(user => {
    if (user) {
        db.collection('users').doc(user.uid).onSnapshot(async doc => {
            if (doc.exists) {
                const data = doc.data();
                
                if (data.role === "👑 ملك الشات" && data.crownedAt) {
                    const crownedDate = data.crownedAt.toDate();
                    const currentDate = new Date();
                    const diffInDays = (currentDate - crownedDate) / (1000 * 60 * 60 * 24);
                    
                    if (diffInDays >= 7) {
                        await db.collection('users').doc(user.uid).update({
                            role: "عضو",
                            referralCount: 0
                        });
                    }
                }
            }
        });
    }
});





