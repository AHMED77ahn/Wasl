// إضافة هيكل نافذة القفل تلقائياً إلى الصفحة
document.addEventListener('DOMContentLoaded', () => {
    const modalHTML = `
    <div id="unlockModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); justify-content:center; align-items:center; z-index:9999; flex-direction:column; color:#fff;">
        <h3>المحادثة مقفولة</h3>
        <p>أدخل رمز الأمان للفتح</p>
        <div style="display:flex; gap:10px; margin:15px 0;">
            <input type="password" maxlength="1" class="unlock-digit" style="width:40px; height:45px; text-align:center; font-size:20px; border-radius:6px; border:1px solid #334155; background:#1e293b; color:#fff;">
            <input type="password" maxlength="1" class="unlock-digit" style="width:40px; height:45px; text-align:center; font-size:20px; border-radius:6px; border:1px solid #334155; background:#1e293b; color:#fff;">
            <input type="password" maxlength="1" class="unlock-digit" style="width:40px; height:45px; text-align:center; font-size:20px; border-radius:6px; border:1px solid #334155; background:#1e293b; color:#fff;">
            <input type="password" maxlength="1" class="unlock-digit" style="width:40px; height:45px; text-align:center; font-size:20px; border-radius:6px; border:1px solid #334155; background:#1e293b; color:#fff;">
        </div>
        <button onclick="closeUnlockModal()" style="background:#ef4444; border:none; padding:8px 16px; color:#fff; border-radius:6px; cursor:pointer;">إلغاء</button>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
});

let currentTargetChatId = null;

// دالة قفل المحادثة من القائمة المنسدلة
function lockChat(chatId) {
    const isLockEnabled = localStorage.getItem('chat_lock_enabled');
    if (!isLockEnabled || !localStorage.getItem('chat_lock_pin')) {
        alert('يرجى تفعيل خيار قفل الدردشات من الإعدادات أولاً وتعيين الرمز!');
        window.location.href = 'chat_lock_setup.html';
        return;
    }

    let lockedChats = JSON.parse(localStorage.getItem('locked_chats_list') || '[]');
    if (!lockedChats.includes(chatId)) {
        lockedChats.push(chatId);
        localStorage.setItem('locked_chats_list', JSON.stringify(lockedChats));
        alert('تم قفل المحادثة بنجاح!');
    }
}

// دالة التحقق عند الضغط على أي محادثة لفتحها
function handleChatClick(chatId, callbackOpenChat) {
    let lockedChats = JSON.parse(localStorage.getItem('locked_chats_list') || '[]');
    
    if (lockedChats.includes(chatId)) {
        currentTargetChatId = chatId;
        document.getElementById('unlockModal').style.display = 'flex';
        setupUnlockInputs(callbackOpenChat);
    } else {
        callbackOpenChat(chatId);
    }
}

function setupUnlockInputs(callbackOpenChat) {
    const inputs = document.querySelectorAll('.unlock-digit');
    inputs.forEach(i => i.value = '');
    inputs[0].focus();

    inputs.forEach((input, index) => {
        input.oninput = () => {
            if (input.value && index < inputs.length - 1) inputs[index + 1].focus();
            
            let enteredPin = Array.from(inputs).map(i => i.value).join('');
            if (enteredPin.length === 4) {
                const savedPin = localStorage.getItem('chat_lock_pin');
                if (enteredPin === savedPin) {
                    document.getElementById('unlockModal').style.display = 'none';
                    callbackOpenChat(currentTargetChatId);
                } else {
                    alert('الرمز غير صحيح!');
                    inputs.forEach(i => i.value = '');
                    inputs[0].focus();
                }
            }
        };
    });
}

function closeUnlockModal() {
    document.getElementById('unlockModal').style.display = 'none';
}

