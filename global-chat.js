document.addEventListener("DOMContentLoaded", () => {
    const db = firebase.firestore();
    const auth = firebase.auth();

    const input = document.getElementById("globalMessageInput");
    const sendBtn = document.getElementById("sendGlobalBtn");
    const container = document.getElementById("globalMessagesContainer");

    async function sendGlobalMessage() {
        if (!input) return;
        const text = input.value.trim();
        if (text === "") return;

        const user = auth.currentUser;
        if (!user) return;

        try {
            // جلب بيانات المستخدم الحالية لمعرفة رتبته واسمه الحقيقي
            const userDoc = await db.collection("users").doc(user.uid).get();
            const userData = userDoc.exists ? userDoc.data() : {};
            
            const realName = userData.username || user.displayName || "مستخدم";
            const userRole = userData.role || "عضو";

            await db.collection("global_messages").add({
                senderId: user.uid,
                userName: realName, // الاسم الحقيقي
                role: userRole,     // رتبة المستخدم (👑 ملك الشات أو عضو)
                text: text,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            input.value = "";
        } catch (error) {
            alert("خطأ في قاعدة البيانات: " + error.message);
        }
    }

    if (sendBtn) {
        sendBtn.addEventListener("click", sendGlobalMessage);
    }

    if (input) {
        input.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                sendGlobalMessage();
            }
        });
    }

    // جلب وعرض الرسائل لحظياً
    if (container) {
        db.collection("global_messages")
            .orderBy("timestamp", "asc")
            .onSnapshot((snapshot) => {
                container.innerHTML = "";
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    const currentUserId = auth.currentUser ? auth.currentUser.uid : null;
                    const isMe = data.senderId === currentUserId;

                    const msgDiv = document.createElement("div");
                    msgDiv.className = `message-bubble ${isMe ? 'sent' : 'received'}`;
                    
                    let timeText = "";
                    if (data.timestamp && data.timestamp.toDate) {
                        timeText = data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    }

                    // --- منطق عرض الاسم والرتبة ---
                    let displayName = "مستخدم مجهول";
                    let badgeHTML = "";

                    // إذا كان ملك الشات: نكشف اسمه الحقيقي ونضيف التاج
                    if (data.role === "👑 ملك الشات") {
                        displayName = data.userName; // الاسم الحقيقي
                        badgeHTML = `<span style="background: #f59e0b; color: #000; font-size: 0.75em; font-weight: bold; padding: 2px 6px; border-radius: 4px; margin-right: 5px;">👑 ملك الشات</span>`;
                    }

                    msgDiv.innerHTML = `
                        <div style="font-size: 0.75em; font-weight: bold; color: ${data.role === '👑 ملك الشات' ? '#f59e0b' : '#00bcd4'}; margin-bottom: 2px; display: flex; align-items: center;">
                            <span>${displayName}</span>
                            ${badgeHTML}
                        </div>
                        <p style="margin:0; word-break: break-word;">${data.text}</p>
                        <span style="font-size: 0.65em; opacity: 0.7; display: block; text-align: left; margin-top: 2px;">${timeText}</span>
                    `;
                    container.appendChild(msgDiv);
                });
                container.scrollTop = container.scrollHeight;
            }, (error) => {
                console.error("خطأ في استقبال الرسائل: ", error);
            });
    }
});




// فتح النافذة وقراءة المستخدمين عند الضغط على زر "المستخدمين 👑"
document.getElementById("dev-users-btn").onclick = function() {
  document.getElementById("dev-modal").style.display = "flex";
  loadUsersForDev();
};

// جلب المستخدمين وتحديث حالتهم
function loadUsersForDev() {
  const usersListDiv = document.getElementById("users-list");
  
  firebase.database().ref('users').on('value', (snapshot) => {
    usersListDiv.innerHTML = "";
    
    if (!snapshot.exists()) {
      usersListDiv.innerHTML = "<p style='text-align:center;'>لا يوجد مستخدمين حالياً</p>";
      return;
    }

    snapshot.forEach((childSnapshot) => {
      const userId = childSnapshot.key;
      const userData = childSnapshot.val();
      const isKing = userData.isChatKing || false;
      const userName = userData.name || "مستخدم مجهول";

      const userRow = document.createElement("div");
      userRow.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 8px; background: #2a2a2a; border-radius: 6px;";
      
      userRow.innerHTML = `
        <span style="font-size: 13px; font-weight: bold;">${userName}</span>
        <button onclick="toggleChatKing('${userId}', ${isKing})" style="padding: 5px 10px; font-size: 11px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; background: ${isKing ? '#e74c3c' : '#f1c40f'}; color: ${isKing ? '#fff' : '#000'};">
          ${isKing ? 'إغلاق ملك الشات' : 'وضع ملك الشات'}
        </button>
      `;
      usersListDiv.appendChild(userRow);
    });
  });
}

// التبديل بين تفعيل وإلغاء ملك الشات
function toggleChatKing(userId, currentState) {
  firebase.database().ref('users/' + userId).update({
    isChatKing: !currentState
  });
}
