import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, setDoc, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging.js";
import { firebaseConfig, VAPID_KEY } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const messaging = getMessaging(app);

// Date helpers
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const today = new Date();
const todayStr = today.toISOString().split("T")[0]; // YYYY-MM-DD
const todayDayName = DAYS[today.getDay()];
document.getElementById("todayDate").textContent = today.toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "short"
});

// UI Elements
const medList = document.getElementById("medList");
const loadingEl = document.getElementById("loading");
const medModal = document.getElementById("medModal");
const medForm = document.getElementById("medForm");
const photoInput = document.getElementById("photoInput");
const photoPreview = document.getElementById("photoPreview");
const daysContainer = document.getElementById("daysContainer");

let currentImageBase64 = "";
let allMedicines = [];

// Render Day Checkboxes in Form
DAYS.forEach(day => {
  const label = document.createElement("label");
  label.className = "cursor-pointer";
  label.innerHTML = `
    <input type="checkbox" name="medDays" value="${day}" checked class="peer hidden" />
    <div class="py-2 rounded-lg border text-xs font-bold peer-checked:bg-teal-600 peer-checked:text-white peer-checked:border-teal-600 bg-slate-100 text-slate-600">
      ${day}
    </div>
  `;
  daysContainer.appendChild(label);
});

// Compress image using Canvas so it fits neatly inside Firestore (< 100KB)
photoInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX_SIZE = 320;
      let width = img.width;
      let height = img.height;

      if (width > height && width > MAX_SIZE) {
        height *= MAX_SIZE / width;
        width = MAX_SIZE;
      } else if (height > MAX_SIZE) {
        width *= MAX_SIZE / height;
        height = MAX_SIZE;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      currentImageBase64 = canvas.toDataURL("image/jpeg", 0.7);
      photoPreview.src = currentImageBase64;
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// Real-time Firestore Listener
const q = query(collection(db, "medicines"), orderBy("time", "asc"));
onSnapshot(q, (snapshot) => {
  loadingEl.classList.add("hidden");
  allMedicines = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderMedicines();
});

function renderMedicines() {
  medList.innerHTML = "";
  if (allMedicines.length === 0) {
    medList.innerHTML = `<p class="text-center text-slate-500 py-10">No medicines added yet. Tap <b>+ Add Medicine</b> below.</p>`;
    return;
  }

  allMedicines.forEach(med => {
    const isScheduledToday = (med.days || DAYS).includes(todayDayName);
    const isTakenToday = med.lastTakenDate === todayStr;

    const card = document.createElement("div");
    card.className = `bg-white rounded-2xl p-4 shadow-sm border-2 transition ${
      isTakenToday ? "border-emerald-400 bg-emerald-50/40 opacity-80" : "border-slate-200"
    }`;

    card.innerHTML = `
      <div class="flex gap-4 items-center">
        <img src="${med.imageBase64 || 'https://placehold.co/120x120?text=Med'}"
             class="w-20 h-20 rounded-xl object-cover border shrink-0 bg-slate-100" />
        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-start gap-2">
            <span class="inline-block bg-teal-100 text-teal-800 text-xs font-bold px-2.5 py-1 rounded-lg">
              ⏰ ${formatTime12h(med.time)}
            </span>
            <button data-edit="${med.id}" class="text-slate-400 hover:text-teal-700 text-sm font-semibold px-2 py-1">
              ✏️ Edit
            </button>
          </div>
          <h3 class="text-xl font-bold text-slate-900 truncate mt-1">${med.name}</h3>
          <p class="text-slate-600 text-base">${med.dosage}</p>
          <p class="text-xs text-slate-400 mt-1">${(med.days || []).join(", ")}</p>
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-slate-100">
        ${
          !isScheduledToday
            ? `<div class="text-center text-sm font-medium text-slate-400 py-2">Not scheduled for today (${todayDayName})</div>`
            : `<button data-toggle="${med.id}" class="w-full py-3 rounded-xl font-bold text-lg transition active:scale-98 ${
                isTakenToday
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 hover:bg-teal-50 text-teal-800 border-2 border-teal-600"
              }">
                ${isTakenToday ? "✅ Taken Today" : "Mark as Taken"}
              </button>`
        }
      </div>
    `;

    medList.appendChild(card);
  });

  // Attach button events
  document.querySelectorAll("[data-toggle]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-toggle");
      const med = allMedicines.find(m => m.id === id);
      const newDate = med.lastTakenDate === todayStr ? "" : todayStr;
      await updateDoc(doc(db, "medicines", id), { lastTakenDate: newDate });
    });
  });

  document.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(btn.getAttribute("data-edit")));
  });
}

function formatTime12h(time24) {
  if (!time24) return "";
  const [h, m] = time24.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

// Modal Open / Close / Edit
document.getElementById("openModalBtn").addEventListener("click", () => {
  medForm.reset();
  document.getElementById("medId").value = "";
  document.getElementById("modalTitle").textContent = "Add Medicine";
  document.getElementById("deleteMedBtn").classList.add("hidden");
  currentImageBase64 = "";
  photoPreview.src = "https://placehold.co/120x120?text=No+Photo";
  document.querySelectorAll('input[name="medDays"]').forEach(cb => (cb.checked = true));
  medModal.classList.remove("hidden");
  medModal.classList.add("flex");
});

document.getElementById("closeModalBtn").addEventListener("click", () => {
  medModal.classList.add("hidden");
  medModal.classList.remove("flex");
});

function openEditModal(id) {
  const med = allMedicines.find(m => m.id === id);
  if (!med) return;

  document.getElementById("medId").value = med.id;
  document.getElementById("modalTitle").textContent = "Edit Medicine";
  document.getElementById("medName").value = med.name;
  document.getElementById("medDosage").value = med.dosage;
  document.getElementById("medTime").value = med.time;
  currentImageBase64 = med.imageBase64 || "";
  photoPreview.src = currentImageBase64 || "https://placehold.co/120x120?text=No+Photo";

  const activeDays = med.days || DAYS;
  document.querySelectorAll('input[name="medDays"]').forEach(cb => {
    cb.checked = activeDays.includes(cb.value);
  });

  document.getElementById("deleteMedBtn").classList.remove("hidden");
  medModal.classList.remove("hidden");
  medModal.classList.add("flex");
}

// Save Medicine
medForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("medId").value;
  const selectedDays = Array.from(document.querySelectorAll('input[name="medDays"]:checked')).map(cb => cb.value);

  const payload = {
    name: document.getElementById("medName").value.trim(),
    dosage: document.getElementById("medDosage").value.trim(),
    time: document.getElementById("medTime").value,
    days: selectedDays,
    imageBase64: currentImageBase64
  };

  if (id) {
    await updateDoc(doc(db, "medicines", id), payload);
  } else {
    payload.lastTakenDate = "";
    await addDoc(collection(db, "medicines"), payload);
  }

  medModal.classList.add("hidden");
  medModal.classList.remove("flex");
});

// Delete Medicine
document.getElementById("deleteMedBtn").addEventListener("click", async () => {
  const id = document.getElementById("medId").value;
  if (id && confirm("Remove this medicine?")) {
    await deleteDoc(doc(db, "medicines", id));
    medModal.classList.add("hidden");
    medModal.classList.remove("flex");
  }
});

// Enable Push Notifications & Save Token
document.getElementById("enableNotifBtn").addEventListener("click", async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert("Please allow notifications in your browser settings.");
      return;
    }

    const params = new URLSearchParams({
      apiKey: firebaseConfig.apiKey || "",
      authDomain: firebaseConfig.authDomain || "",
      projectId: firebaseConfig.projectId || "",
      storageBucket: firebaseConfig.storageBucket || "",
      messagingSenderId: firebaseConfig.messagingSenderId || "",
      appId: firebaseConfig.appId || ""
    });

    const swReg = await navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?${params.toString()}`
    );
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    if (token) {
      await setDoc(doc(db, "settings", "mom_device"), {
        fcmToken: token,
        updatedAt: new Date().toISOString()
      });
      alert("Alerts enabled on this phone!");
    }
  } catch (err) {
    console.error("Notification setup error:", err);
    alert("Could not enable alerts: " + err.message);
  }
});

// Foreground notification alert when app is open
onMessage(messaging, (payload) => {
  alert(`⏰ ${payload.notification?.title}\n${payload.notification?.body}`);
});
             
