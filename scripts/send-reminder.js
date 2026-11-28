import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const TIMEZONE = "Asia/Kolkata";
const LOOKBACK_MINUTES = 15;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!rawServiceAccount) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT environment variable.");
}

const serviceAccount = JSON.parse(rawServiceAccount);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
const messaging = getMessaging();

function getLocalClockParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );

  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  const minute = Number(parts.minute);
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const dayName = parts.weekday.slice(0, 3);

  return { dateStr, dayName, minutesSinceMidnight: hour * 60 + minute };
}

function parseTimeToMinutes(time24) {
  if (!time24 || !/^\d{2}:\d{2}$/.test(time24)) return null;
  const [h, m] = time24.split(":").map(Number);
  return h * 60 + m;
}

async function run() {
  const deviceSnap = await db.doc("settings/mom_device").get();
  const fcmToken = deviceSnap.exists ? deviceSnap.data()?.fcmToken : null;

  if (!fcmToken) {
    console.log("No fcmToken found at settings/mom_device. Skipping.");
    return;
  }

  const now = new Date();
  const { dateStr: todayStr, dayName: todayDayName, minutesSinceMidnight: nowMins } =
    getLocalClockParts(now, TIMEZONE);

  const medsSnap = await db.collection("medicines").get();
  if (medsSnap.empty) {
    console.log("No medicines in Firestore.");
    return;
  }

  const appUrl = process.env.APP_URL || "https://example.com";
  let sentCount = 0;

  for (const docSnap of medsSnap.docs) {
    const med = docSnap.data();
    const scheduledDays = Array.isArray(med.days) && med.days.length > 0 ? med.days : DAYS;

    if (!scheduledDays.includes(todayDayName)) continue;
    if (med.lastTakenDate === todayStr) continue;
    if (med.lastNotifiedDate === todayStr) continue;

    const medMins = parseTimeToMinutes(med.time);
    if (medMins === null) continue;

    const diff = nowMins - medMins;
    if (diff >= 0 && diff < LOOKBACK_MINUTES) {
      await messaging.send({
        token: fcmToken,
        notification: {
          title: "Medicine Reminder",
          body: `Time to take: ${med.name} (${med.dosage})`,
        },
        webpush: {
          fcmOptions: {
            link: appUrl,
          },
        },
      });

      await docSnap.ref.update({ lastNotifiedDate: todayStr });
      sentCount += 1;
      console.log(`Sent reminder for ${med.name} scheduled at ${med.time}`);
    }
  }

  console.log(`Done. Sent ${sentCount} reminder(s).`);
}

run().catch((err) => {
  console.error("Error sending reminders:", err);
  process.exit(1);
});
    
