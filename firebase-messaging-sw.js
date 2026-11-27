import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getMessaging, onBackgroundMessage } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging.js";

// Read Firebase config from the URL query string used when registering the SW
const searchParams = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: searchParams.get("apiKey") || "",
  authDomain: searchParams.get("authDomain") || "",
  projectId: searchParams.get("projectId") || "",
  storageBucket: searchParams.get("storageBucket") || "",
  messagingSenderId: searchParams.get("messagingSenderId") || "",
  appId: searchParams.get("appId") || ""
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// Display notification when the app is in the background or closed
onBackgroundMessage(messaging, (payload) => {
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

// Open or focus the app when the notification is tapped
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
                    
