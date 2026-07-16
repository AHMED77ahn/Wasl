importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "const firebaseConfig = {
  apiKey: "AIzaSyBM_LkZr59WM4fnTvW0CKbcj-y2V8Flqto",
  authDomain: "wasl-4f5cb.firebaseapp.com",
  projectId: "wasl-4f5cb",
  storageBucket: "wasl-4f5cb.firebasestorage.app",
  messagingSenderId: "754785038144",
  appId: "1:754785038144:web:ca48f718b71148ae3394a5",
  measurementId: "G-8TMN0ER8Z3"
};",
  projectId: "wasl-4f5cb",
  messagingSenderId: "754785038144",
  appId: "1:754785038144:web:ca48f718b71148ae3394a5"
});

const messaging = firebase.messaging();

// هذه الدالة تعمل في الخلفية عند وصول إشعار
messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.png' // يمكنك وضع رابط لصورة شعار تطبيقك هنا
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});
