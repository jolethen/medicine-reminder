importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js");

const searchParams = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: searchParams.get("apiKey") || "",
  authDomain: searchParams.get("authDomain") || "",
  projectId: searchParams.get("projectId") || "",
  storageBucket: searchParams.get("storageBucket") || "",
  messagingSenderId: searchParams.get("messagingSenderId") || "",
  appId: searchParams.get("appId") || ""
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Background notifications
messaging.onBackgroundMessage((payload) => {
  const title =
    payload.notification?.title ||
    payload.data?.title ||
    "⏰ Medicine Reminder";
  const body =
    payload.notification?.body ||
    payload.data?.body ||
    "It's time to take your scheduled medicine.";

  self.registration.showNotification(title, {
    body,
    icon: payload.notification?.icon || "/icon-192.png",
    data: payload.data || {}
  });
});

// Tap notification to open/focus app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
