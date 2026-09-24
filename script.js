/**
 * COUPLE’S HEAR - Core Application Engine
 * Real-time Synchronized Music Listening Application for Couples
 * 
 * Includes:
 * - Direct CDN Firebase Realtime Database & Firebase Storage integration
 * - Built-in fallback Local-Synchronizer for immediate dual-tab preview
 * - Audio drift correction algorithm (0.3s tolerance threshold)
 * - Autoplay restriction bypass handling
 * - Ambient floating particles canvas
 * - Responsive Web Share API and clipboard copy
 */

// =========================================================================
// SECTION 1: FIREBASE CONFIGURATION
// Replace the placeholder values below with your Firebase project credentials.
// Obtain these from Firebase Console -> Project Settings -> General -> Your apps
// =========================================================================
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Check for user-saved Firebase config from localStorage
const LOCAL_STORAGE_CFG_KEY = "couples_hear_custom_firebase_config";
const userSavedConfig = localStorage.getItem(LOCAL_STORAGE_CFG_KEY);
if (userSavedConfig) {
  try {
    const parsed = JSON.parse(userSavedConfig);
    Object.assign(firebaseConfig, parsed);
  } catch (e) {
    console.warn("Could not parse saved Firebase config", e);
  }
}

// Determine if real Firebase credentials have been configured
const isFirebaseConfigured = () => {
  return (
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== "YOUR_API_KEY" &&
    firebaseConfig.databaseURL &&
    firebaseConfig.databaseURL !== "YOUR_DATABASE_URL"
  );
};

// =========================================================================
// SECTION 2: CURATED ROMANTIC PLAYLIST (Guaranteed Working Audio Tracks)
// High-fidelity royalty-free acoustic and romantic melodies served locally
// =========================================================================
const CURATED_PLAYLIST = [
  {
    title: "Sweet Serenade",
    artist: "Romantic Acoustic Romance",
    audioUrl: "./audio/sweet_serenade.mp3",
    artworkUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
    duration: 147
  },
  {
    title: "Moonlight Piano Romance",
    artist: "Couple’s Classical Melodies",
    audioUrl: "./audio/moonlight_piano.mp3",
    artworkUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
    duration: 111
  },
  {
    title: "Lo-Fi Warm Love",
    artist: "Couple’s Chill Beats",
    audioUrl: "./audio/lofi_warm_love.mp3",
    artworkUrl: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=600&auto=format&fit=crop&q=80",
    duration: 122
  }
];

// Utility: Ensure song audioUrl is valid and automatically upgrade any legacy or broken links
function normalizeSong(song) {
  if (!song || !song.audioUrl) return CURATED_PLAYLIST[0];

  let url = String(song.audioUrl).trim();
  // Ensure relative path for GitHub Pages and subpaths
  if (url.startsWith("/audio/")) {
    url = "." + url;
    song = { ...song, audioUrl: url };
  }
  // Check if it's the broken freesound link, an invalid placeholder, or empty
  if (url.includes("freesound.org") || url.includes("YOUR_") || url === "") {
    if (song.title && song.title.toLowerCase().includes("moonlight")) {
      return { ...CURATED_PLAYLIST[1], ...song, audioUrl: CURATED_PLAYLIST[1].audioUrl, duration: CURATED_PLAYLIST[1].duration };
    } else if (song.title && song.title.toLowerCase().includes("lo-fi")) {
      return { ...CURATED_PLAYLIST[2], ...song, audioUrl: CURATED_PLAYLIST[2].audioUrl, duration: CURATED_PLAYLIST[2].duration };
    } else {
      return { ...CURATED_PLAYLIST[0], ...song, audioUrl: CURATED_PLAYLIST[0].audioUrl, duration: CURATED_PLAYLIST[0].duration };
    }
  }
  return song;
}

// Romantic Aesthetic Covers for Custom Uploaded Tracks
const ROMANTIC_COVERS = [
  "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&auto=format&fit=crop&q=80"
];

// =========================================================================
// SECTION 3: APPLICATION STATE & USER SESSION
// =========================================================================
const STATE = {
  screen: "LANDING", // LANDING, HOME, CREATE_ROOM, JOIN_ROOM, ROOM
  userId: getOrCreateUserId(),
  userName: localStorage.getItem("couples_hear_user_name") || "Host",
  currentRole: null, // "host" or "partner"
  currentRoomCode: null,
  isHost: false,
  roomData: null,
  autoplayUnlocked: false,
  isSeeking: false,
  volume: 0.8,
  isMuted: false,
  syncInterval: null,
  driftCorrectionInterval: null,
  firebaseApp: null,
  database: null,
  storage: null,
  activeRoomUnsubscribe: null,
  activePresenceRef: null,
  broadcastChannel: null
};

// Generate random unique ID per browser session
function getOrCreateUserId() {
  let id = sessionStorage.getItem("couples_hear_user_id");
  if (!id) {
    id = "user_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    sessionStorage.setItem("couples_hear_user_id", id);
  }
  return id;
}

// Generate unique 6-character room code avoiding 0/O, 1/I
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Format seconds into mm:ss
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

// Escape HTML utility to prevent XSS
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
const escapeHTML = escapeHtml;

// =========================================================================
// SECTION 4: DOM ELEMENT REFERENCES
// =========================================================================
const DOM = {
  // Screens & Containers
  landingScreen: document.getElementById("landing-screen"),
  appWrapper: document.getElementById("app-wrapper"),
  homeScreen: document.getElementById("home-screen"),
  createRoomScreen: document.getElementById("create-room-screen"),
  joinRoomScreen: document.getElementById("join-room-screen"),
  roomScreen: document.getElementById("room-screen"),
  toastContainer: document.getElementById("toast-container"),

  // Header & Nav
  btnEnterApp: document.getElementById("btn-enter-app"),
  navLogoBtn: document.getElementById("nav-logo-btn"),
  headerRoomBadge: document.getElementById("header-room-badge"),
  headerRoomCode: document.getElementById("header-room-code"),
  connectionIndicator: document.getElementById("connection-indicator"),
  connectionStatusText: document.getElementById("connection-status-text"),
  btnFirebaseSettings: document.getElementById("btn-firebase-settings"),
  btnNavLeave: document.getElementById("btn-nav-leave"),
  backendStatusBanner: document.getElementById("backend-status-banner"),
  backendBannerText: document.getElementById("backend-banner-text"),
  btnBannerConfig: document.getElementById("btn-banner-config"),

  // Home View
  userDisplayNameInput: document.getElementById("user-display-name-input"),
  cardCreateRoom: document.getElementById("card-create-room"),
  cardJoinRoom: document.getElementById("card-join-room"),
  btnOpenCreateRoom: document.getElementById("btn-open-create-room"),
  btnOpenJoinRoom: document.getElementById("btn-open-join-room"),

  // Create Room View
  btnBackFromCreate: document.getElementById("btn-back-from-create"),
  createdRoomCode: document.getElementById("created-room-code"),
  shareLinkInput: document.getElementById("share-link-input"),
  btnCopyCode: document.getElementById("btn-copy-code"),
  btnShareRoom: document.getElementById("btn-share-room"),
  btnEnterCreatedRoom: document.getElementById("btn-enter-created-room"),

  // Join Room View
  btnBackFromJoin: document.getElementById("btn-back-from-join"),
  formJoinRoom: document.getElementById("form-join-room"),
  inputRoomCode: document.getElementById("input-room-code"),
  inputPartnerName: document.getElementById("input-partner-name"),
  btnSubmitJoin: document.getElementById("btn-submit-join"),
  joinErrorBox: document.getElementById("join-error-box"),

  // Room View
  roomCodeDisplay: document.getElementById("room-code-display"),
  roomMembersCount: document.getElementById("room-members-count"),
  btnRoomCopyCode: document.getElementById("btn-room-copy-code"),
  btnRoomShare: document.getElementById("btn-room-share"),
  btnRoomLeave: document.getElementById("btn-room-leave"),
  rolePillBadge: document.getElementById("role-pill-badge"),
  headerSelectedSongChip: document.getElementById("header-selected-song-chip"),
  headerSongTitle: document.getElementById("header-song-title"),

  // Members Card
  hostCard: document.getElementById("member-card-host"),
  hostAvatarLetter: document.getElementById("host-avatar-letter"),
  hostNameDisplay: document.getElementById("host-name-display"),
  hostYouBadge: document.getElementById("host-you-badge"),
  hostStatusDot: document.getElementById("host-status-dot"),
  hostStatusText: document.getElementById("host-status-text"),

  partnerCard: document.getElementById("member-card-partner"),
  partnerAvatarLetter: document.getElementById("partner-avatar-letter"),
  partnerNameDisplay: document.getElementById("partner-name-display"),
  partnerYouBadge: document.getElementById("partner-you-badge"),
  partnerStatusDot: document.getElementById("partner-status-dot"),
  partnerStatusText: document.getElementById("partner-status-text"),
  waitingPartnerCallout: document.getElementById("waiting-partner-callout"),
  calloutCode: document.getElementById("callout-code"),
  btnCalloutCopy: document.getElementById("btn-callout-copy"),

  roleNoticeTitle: document.getElementById("role-notice-title"),
  roleNoticeDesc: document.getElementById("role-notice-desc"),

  // Audio Player
  audioElement: document.getElementById("couple-audio-element"),
  playerCard: document.getElementById("player-card"),
  selectedSongBanner: document.getElementById("selected-song-banner"),
  selectedSongLiveStatus: document.getElementById("selected-song-live-status"),
  songSelectionIndicator: document.getElementById("song-selection-indicator"),
  vinylDisc: document.getElementById("vinyl-disc"),
  albumArtworkImg: document.getElementById("album-artwork-img"),
  songTitle: document.getElementById("song-title"),
  songArtist: document.getElementById("song-artist"),
  playbackStatusPill: document.getElementById("playback-status-pill"),
  playbackStatusText: document.getElementById("playback-status-text"),
  seekSlider: document.getElementById("seek-slider"),
  sliderFill: document.getElementById("slider-fill"),
  currentTimeText: document.getElementById("current-time-text"),
  durationTimeText: document.getElementById("duration-time-text"),

  btnPrevTrack: document.getElementById("btn-prev-track"),
  btnPlayPause: document.getElementById("btn-play-pause"),
  iconPlay: document.getElementById("icon-play"),
  iconPause: document.getElementById("icon-pause"),
  btnNextTrack: document.getElementById("btn-next-track"),

  btnVolumeMute: document.getElementById("btn-volume-mute"),
  iconVolumeHigh: document.getElementById("icon-volume-high"),
  iconVolumeMuted: document.getElementById("icon-volume-muted"),
  volumeSlider: document.getElementById("volume-slider"),
  volumePercent: document.getElementById("volume-percent"),
  btnTestSound: document.getElementById("btn-test-sound"),

  // Playlist Section Elements
  playlistSection: document.getElementById("playlist-section"),
  playlistSelectedBar: document.getElementById("playlist-selected-bar"),
  psbSongTitle: document.getElementById("psb-song-title"),
  playlistTracks: document.getElementById("playlist-tracks"),
  playlistCountBadge: document.getElementById("playlist-count-badge"),
  playlistRoleHint: document.getElementById("playlist-role-hint"),
  btnClearPlaylist: document.getElementById("btn-clear-playlist"),

  // Music Source & Upload
  musicSourceSection: document.getElementById("music-source-section"),
  audioFileInput: document.getElementById("audio-file-input"),
  btnTriggerUpload: document.getElementById("btn-trigger-upload"),
  uploadDropzone: document.getElementById("upload-dropzone"),
  uploadProgressContainer: document.getElementById("upload-progress-container"),
  uploadFilename: document.getElementById("upload-filename"),
  uploadPercentage: document.getElementById("upload-percentage"),
  uploadProgressBar: document.getElementById("upload-progress-bar"),
  presetButtons: document.getElementById("preset-buttons"),

  // Autoplay Overlay
  autoplayPrompt: document.getElementById("autoplay-prompt"),
  btnStartListening: document.getElementById("btn-start-listening"),

  // Modals
  modalLeaveConfirm: document.getElementById("modal-leave-confirm"),
  btnLeaveCancel: document.getElementById("btn-leave-cancel"),
  btnLeaveConfirm: document.getElementById("btn-leave-confirm"),

  modalHostLeft: document.getElementById("modal-host-left"),
  btnReturnHomeHostLeft: document.getElementById("btn-return-home-host-left"),

  modalFirebaseConfig: document.getElementById("modal-firebase-config"),
  btnCloseConfig: document.getElementById("btn-close-config"),
  formFirebaseConfig: document.getElementById("form-firebase-config"),
  cfgApiKey: document.getElementById("cfg-apiKey"),
  cfgDatabaseURL: document.getElementById("cfg-databaseURL"),
  cfgProjectId: document.getElementById("cfg-projectId"),
  cfgStorageBucket: document.getElementById("cfg-storageBucket"),
  btnClearConfig: document.getElementById("btn-clear-config"),
  btnSaveConfig: document.getElementById("btn-save-config")
};

// =========================================================================
// SECTION 5: TOAST NOTIFICATIONS
// =========================================================================
function showToast(message, type = "info", duration = 3800) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const iconSvg =
    type === "error"
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
      : type === "success"
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

  toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-hide");
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, duration);
}

// =========================================================================
// SECTION 6: VIEW SWITCHING & NAVIGATION
// =========================================================================
function showScreen(screenName) {
  STATE.screen = screenName;

  // Hide all view panels
  DOM.homeScreen.classList.remove("active");
  DOM.homeScreen.classList.add("hidden");
  DOM.createRoomScreen.classList.remove("active");
  DOM.createRoomScreen.classList.add("hidden");
  DOM.joinRoomScreen.classList.remove("active");
  DOM.joinRoomScreen.classList.add("hidden");
  DOM.roomScreen.classList.remove("active");
  DOM.roomScreen.classList.add("hidden");

  // Show requested screen
  if (screenName === "LANDING") {
    DOM.landingScreen.classList.remove("fade-out");
    DOM.landingScreen.classList.add("active");
    DOM.appWrapper.classList.add("hidden");
  } else {
    DOM.landingScreen.classList.add("fade-out");
    DOM.appWrapper.classList.remove("hidden");

    if (screenName === "HOME") {
      DOM.homeScreen.classList.remove("hidden");
      DOM.homeScreen.classList.add("active");
      DOM.headerRoomBadge.classList.add("hidden");
      DOM.connectionIndicator.classList.add("hidden");
      DOM.btnNavLeave.classList.add("hidden");
    } else if (screenName === "CREATE_ROOM") {
      DOM.createRoomScreen.classList.remove("hidden");
      DOM.createRoomScreen.classList.add("active");
      DOM.headerRoomBadge.classList.add("hidden");
      DOM.connectionIndicator.classList.add("hidden");
      DOM.btnNavLeave.classList.add("hidden");
    } else if (screenName === "JOIN_ROOM") {
      DOM.joinRoomScreen.classList.remove("hidden");
      DOM.joinRoomScreen.classList.add("active");
      DOM.headerRoomBadge.classList.add("hidden");
      DOM.connectionIndicator.classList.add("hidden");
      DOM.btnNavLeave.classList.add("hidden");
      DOM.inputRoomCode.focus();
    } else if (screenName === "ROOM") {
      DOM.roomScreen.classList.remove("hidden");
      DOM.roomScreen.classList.add("active");
      DOM.headerRoomBadge.classList.remove("hidden");
      DOM.connectionIndicator.classList.remove("hidden");
      DOM.btnNavLeave.classList.remove("hidden");
    }
  }
}

// =========================================================================
// SECTION 7: FIREBASE & LOCAL MULTI-TAB SYNCHRONIZATION ADAPTER
// =========================================================================
// The app supports dual modes:
// 1. Production Mode: Uses genuine Firebase Realtime Database & Firebase Storage
// 2. Demo Mode: Uses BroadcastChannel + localStorage across tabs/windows for instant preview
let firebaseSDK = null;

async function initSyncEngine() {
  if (isFirebaseConfigured()) {
    try {
      // Dynamic import Firebase CDN SDK
      const { initializeApp } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"
      );
      const {
        getDatabase,
        ref,
        set,
        get,
        onValue,
        update,
        remove,
        onDisconnect,
        serverTimestamp
      } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js"
      );
      const {
        getStorage,
        ref: storageRef,
        uploadBytesResumable,
        getDownloadURL
      } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js"
      );

      STATE.firebaseApp = initializeApp(firebaseConfig);
      STATE.database = getDatabase(STATE.firebaseApp);
      STATE.storage = getStorage(STATE.firebaseApp);

      firebaseSDK = {
        ref,
        set,
        get,
        onValue,
        update,
        remove,
        onDisconnect,
        serverTimestamp,
        storageRef,
        uploadBytesResumable,
        getDownloadURL
      };

      DOM.backendBannerText.textContent = "Connected to Firebase Realtime Database & Storage";
      console.log("Firebase Realtime Engine successfully initialized.");
      return;
    } catch (err) {
      console.error("Firebase SDK init failed, falling back to Broadcast Sync:", err);
      showToast("Firebase connection failed. Falling back to local preview sync.", "error");
    }
  }

  // Fallback: Local Multi-Tab Broadcast Sync Engine
  STATE.broadcastChannel = new BroadcastChannel("couples_hear_sync_channel");
  STATE.broadcastChannel.onmessage = handleBroadcastMessage;

  // Check server health and announce real-time sync connectivity
  try {
    const healthRes = await fetch("/api/health");
    if (healthRes.ok) {
      STATE.serverAvailable = true;
      if (DOM.backendBannerText) {
        DOM.backendBannerText.textContent = "● Live Sync Server Connected • Cross-device room sync active";
      }
      if (DOM.connectionStatusText) {
        DOM.connectionStatusText.textContent = "LIVE SYNC";
      }
      console.log("Couple's Hear real-time room sync server connected.");
      return;
    }
  } catch (e) {
    console.warn("Server health check note:", e);
  }

  DOM.backendBannerText.textContent = "Local Dual-Tab Sync Mode Active";
}

// Handle cross-tab messages in Demo Mode
function handleBroadcastMessage(event) {
  const { type, roomCode, payload, senderId } = event.data || {};
  if (!roomCode || roomCode !== STATE.currentRoomCode) return;
  if (senderId === STATE.userId) return; // Ignore own echoes

  if (type === "ROOM_UPDATED") {
    onRoomDataChanged(payload);
  } else if (type === "PARTNER_JOINED") {
    showToast("Partner joined the room", "success");
    onRoomDataChanged(payload);
  } else if (type === "PARTNER_LEFT") {
    showToast("Partner left the room", "info");
    onRoomDataChanged(payload);
  } else if (type === "HOST_LEFT") {
    if (!STATE.isHost) {
      DOM.modalHostLeft.classList.remove("hidden");
    }
  }
}

// =========================================================================
// SECTION 8: ROOM OPERATIONS (Create, Join, Direct Link, Leave)
// =========================================================================

// Create Room Handler
async function createRoom() {
  const hostName = DOM.userDisplayNameInput.value.trim() || "Host";
  STATE.userName = hostName;
  localStorage.setItem("couples_hear_user_name", hostName);

  const roomCode = generateRoomCode();
  STATE.currentRoomCode = roomCode;
  STATE.currentRole = "host";
  STATE.isHost = true;

  const defaultSong = CURATED_PLAYLIST[0];
  const initialPlaylist = CURATED_PLAYLIST.map((song, i) => ({
    ...song,
    id: "preset_" + i,
    source: "preset"
  }));

  const initialRoomData = {
    roomCode: roomCode,
    hostId: STATE.userId,
    hostName: hostName,
    partnerId: null,
    partnerName: null,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    members: {
      host: {
        id: STATE.userId,
        name: hostName,
        status: "Connected"
      },
      partner: null
    },
    playlist: initialPlaylist,
    song: defaultSong,
    playback: {
      isPlaying: false,
      position: 0,
      updatedAt: Date.now()
    }
  };

  // Cache room data in application state
  STATE.roomData = initialRoomData;

  // Save room to backend server so other devices can join immediately
  try {
    await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(initialRoomData)
    });
    console.log(`[Host] Room ${roomCode} created and stored on server.`);
  } catch (err) {
    console.warn("Server room create note:", err);
  }

  if (isFirebaseConfigured() && STATE.database && firebaseSDK) {
    try {
      const roomRef = firebaseSDK.ref(STATE.database, `rooms/${roomCode}`);
      await firebaseSDK.set(roomRef, initialRoomData);

      // Set up onDisconnect for Host
      const hostPresenceRef = firebaseSDK.ref(STATE.database, `rooms/${roomCode}/members/host/status`);
      firebaseSDK.onDisconnect(hostPresenceRef).set("Disconnected");
    } catch (e) {
      console.error("Firebase create room error:", e);
      showToast("Error creating room on Firebase: " + e.message, "error");
      return;
    }
  } else {
    // Local persistence
    localStorage.setItem(`couples_room_${roomCode}`, JSON.stringify(initialRoomData));
    if (STATE.broadcastChannel) {
      STATE.broadcastChannel.postMessage({
        type: "ROOM_CREATED",
        roomCode,
        payload: initialRoomData,
        senderId: STATE.userId
      });
    }
  }

  // Update UI Elements
  DOM.createdRoomCode.textContent = roomCode;
  const directLink = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
  DOM.shareLinkInput.value = directLink;

  showScreen("CREATE_ROOM");
  showToast("Room created successfully!", "success");
}

let isJoiningInProgress = false;

// Join Room Handler
async function joinRoom(codeToJoin) {
  if (isJoiningInProgress) return;
  isJoiningInProgress = true;

  try {
    let raw = (codeToJoin || DOM.inputRoomCode.value || "").trim().toUpperCase();
    if (raw.includes("ROOM=")) {
      const match = raw.match(/ROOM=([A-Z0-9]{6})/i);
      if (match) raw = match[1];
    }
    const code = raw.replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const partnerName = DOM.inputPartnerName.value.trim() || "Partner";

    if (!code || code.length !== 6) {
      showJoinError("Please enter a valid 6-character room code.");
      return;
    }

    // Direct user interaction pre-unlocks audio context
    STATE.autoplayUnlocked = true;
    if (DOM.autoplayPrompt) DOM.autoplayPrompt.classList.add("hidden");

    STATE.userName = partnerName;
    localStorage.setItem("couples_hear_user_name", partnerName);

    hideJoinError();
    DOM.btnSubmitJoin.disabled = true;
    DOM.btnSubmitJoin.textContent = "Connecting...";

    let roomData = null;
    let isHostRejoining = false;

    // 1. Join room via backend server (works across phones, tablets, PCs, multi-network)
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: STATE.userId,
          partnerName: partnerName
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.room) {
          roomData = data.room;
          if (data.isHost) {
            isHostRejoining = true;
          }
        }
      }
    } catch (e) {
      console.warn("Backend join request error:", e);
    }

    // 2. Query Firebase if configured
    if (!roomData && isFirebaseConfigured() && STATE.database && firebaseSDK) {
      try {
        const roomRef = firebaseSDK.ref(STATE.database, `rooms/${code}`);
        const snapshot = await firebaseSDK.get(roomRef);
        if (snapshot.exists()) {
          roomData = snapshot.val();
        }
      } catch (e) {
        console.warn("Firebase room query note:", e);
      }
    }

    // 3. Query local storage (same-device multi-tab fallback)
    if (!roomData) {
      const rawStored = localStorage.getItem(`couples_room_${code}`);
      if (rawStored) {
        try {
          roomData = JSON.parse(rawStored);
        } catch (e) {}
      }
    }

    // Verification Rules
    if (!roomData) {
      showJoinError("Room not found.\nPlease check the 6-character room code.");
      return;
    }

    if (isHostRejoining || roomData.hostId === STATE.userId) {
      STATE.currentRoomCode = code;
      STATE.currentRole = "host";
      STATE.isHost = true;
    } else {
      // Set Partner details
      STATE.currentRoomCode = code;
      STATE.currentRole = "partner";
      STATE.isHost = false;

      roomData.partnerId = STATE.userId;
      roomData.partnerName = partnerName;
      roomData.lastActiveAt = Date.now();
      if (!roomData.members) roomData.members = {};
      roomData.members.partner = {
        id: STATE.userId,
        name: partnerName,
        status: "Connected"
      };

      if (isFirebaseConfigured() && STATE.database && firebaseSDK) {
        try {
          const roomRef = firebaseSDK.ref(STATE.database, `rooms/${code}`);
          await firebaseSDK.update(roomRef, {
            partnerId: STATE.userId,
            partnerName: partnerName,
            lastActiveAt: Date.now(),
            "members/partner": roomData.members.partner
          });

          // Presence onDisconnect
          const partnerPresenceRef = firebaseSDK.ref(STATE.database, `rooms/${code}/members/partner/status`);
          firebaseSDK.onDisconnect(partnerPresenceRef).set("Disconnected");
        } catch (e) {
          console.error("Firebase join update error", e);
        }
      } else {
        localStorage.setItem(`couples_room_${code}`, JSON.stringify(roomData));
        if (STATE.broadcastChannel) {
          STATE.broadcastChannel.postMessage({
            type: "PARTNER_JOINED",
            roomCode: code,
            payload: roomData,
            senderId: STATE.userId
          });
        }
      }
    }

    enterActiveRoom(roomData);
    showToast("Connected to room " + code + "!", "success");
  } finally {
    DOM.btnSubmitJoin.disabled = false;
    DOM.btnSubmitJoin.textContent = "JOIN ROOM";
    isJoiningInProgress = false;
  }
}

function showJoinError(msg) {
  DOM.joinErrorBox.textContent = msg;
  DOM.joinErrorBox.classList.remove("hidden");
}

function hideJoinError() {
  DOM.joinErrorBox.textContent = "";
  DOM.joinErrorBox.classList.add("hidden");
}

// Enter and start synchronizing with the active room
function enterActiveRoom(initialData) {
  // If initialData is null or missing, attempt to recover from state or localStorage
  if (!initialData) {
    if (STATE.roomData) {
      initialData = STATE.roomData;
    } else if (STATE.currentRoomCode) {
      const stored = localStorage.getItem(`couples_room_${STATE.currentRoomCode}`);
      if (stored) {
        try {
          initialData = JSON.parse(stored);
        } catch (e) {}
      }
    }
  }

  // Guaranteed fallback room data to ensure the player never fails on empty/null room
  if (!initialData) {
    const fallbackPlaylist = CURATED_PLAYLIST.map((song, i) => ({
      ...song,
      id: "preset_" + i,
      source: "preset"
    }));
    initialData = {
      roomCode: STATE.currentRoomCode || "ROOM",
      hostId: STATE.userId,
      hostName: STATE.userName || "Host",
      partnerId: null,
      partnerName: null,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      members: {
        host: {
          id: STATE.userId,
          name: STATE.userName || "Host",
          status: "Connected"
        },
        partner: null
      },
      playlist: fallbackPlaylist,
      song: fallbackPlaylist[0],
      playback: {
        isPlaying: false,
        position: 0,
        updatedAt: Date.now()
      }
    };
  }

  STATE.roomData = initialData;

  // Header & Badges
  DOM.headerRoomCode.textContent = STATE.currentRoomCode || initialData.roomCode;
  DOM.roomCodeDisplay.textContent = STATE.currentRoomCode || initialData.roomCode;
  DOM.calloutCode.textContent = STATE.currentRoomCode || initialData.roomCode;

  // Setup Host vs Partner Roles
  if (STATE.isHost) {
    DOM.rolePillBadge.textContent = "HOST";
    DOM.rolePillBadge.className = "role-pill host-role";
    DOM.roleNoticeTitle.textContent = "HOST CONTROLS PLAYBACK";
    DOM.roleNoticeDesc.textContent = "You control play, pause, seek, and song selection.";
    DOM.musicSourceSection.classList.remove("hidden");

    // Enable player controls for Host
    DOM.btnPlayPause.disabled = false;
    DOM.btnPrevTrack.disabled = false;
    DOM.btnNextTrack.disabled = false;
    DOM.seekSlider.disabled = false;

    if (DOM.btnClearPlaylist) DOM.btnClearPlaylist.classList.remove("hidden");
    if (DOM.playlistRoleHint) DOM.playlistRoleHint.textContent = "Tap any song to play in sync • Tracks automatically advance 1 by 1 in continuous queue.";
  } else {
    DOM.rolePillBadge.textContent = "PARTNER";
    DOM.rolePillBadge.className = "role-pill partner-role";
    DOM.roleNoticeTitle.textContent = "PLAYBACK CONTROLLED BY HOST";
    DOM.roleNoticeDesc.textContent = "Listen and enjoy together. Only the host controls the track.";
    DOM.musicSourceSection.classList.add("hidden");

    // Disable partner playback control buttons
    DOM.btnPlayPause.disabled = true;
    DOM.btnPrevTrack.disabled = true;
    DOM.btnNextTrack.disabled = true;
    DOM.seekSlider.disabled = true;

    if (DOM.btnClearPlaylist) DOM.btnClearPlaylist.classList.add("hidden");
    if (DOM.playlistRoleHint) DOM.playlistRoleHint.textContent = "Listening to Host’s queue • Tracks advance automatically 1 by 1.";

    // Show Autoplay Unlock Banner for Partner
    if (!STATE.autoplayUnlocked) {
      DOM.autoplayPrompt.classList.remove("hidden");
    }
  }

  // Ensure playlist is initialized in room data
  if (!initialData.playlist || !Array.isArray(initialData.playlist) || initialData.playlist.length === 0) {
    initialData.playlist = CURATED_PLAYLIST.map((song, i) => ({
      ...song,
      id: "preset_" + i,
      source: "preset"
    }));
  } else {
    initialData.playlist = initialData.playlist.map(normalizeSong);
  }

  STATE.roomData = initialData;

  showScreen("ROOM");
  renderRoomMembers(initialData);
  loadSong(initialData.song || initialData.playlist[0]);
  renderPlaylistUI();

  // If partner joins while session is already active, sync playback immediately!
  if (!STATE.isHost && initialData.playback) {
    syncPartnerPlayback(initialData.playback);
  }

  // Subscribe to real-time room updates
  listenToRoom(STATE.currentRoomCode);

  // Start periodic synchronization and drift correction
  startDriftCorrectionLoop();
}

// Real-time Room Listener
function listenToRoom(roomCode) {
  if (STATE.eventSource) {
    STATE.eventSource.close();
    STATE.eventSource = null;
  }

  // Connect to Server-Sent Events (SSE) stream for real-time live sync across devices
  try {
    const es = new EventSource(`/api/rooms/${roomCode}/events?userId=${encodeURIComponent(STATE.userId)}`);
    STATE.eventSource = es;

    es.onmessage = (event) => {
      if (!event.data || event.data.startsWith(":")) return;
      try {
        const msg = JSON.parse(event.data);
        if ((msg.type === "INIT" || msg.type === "PARTNER_JOINED" || msg.type === "MEMBER_STATUS") && msg.room) {
          onRoomDataChanged(msg.room);
        } else if (msg.type === "PLAYBACK_UPDATE" && msg.playback) {
          if (msg.senderId !== STATE.userId) {
            if (STATE.roomData) STATE.roomData.playback = msg.playback;
            if (!STATE.isHost) syncPartnerPlayback(msg.playback);
          }
        } else if (msg.type === "SONG_UPDATE") {
          if (msg.senderId !== STATE.userId) {
            if (msg.song) loadSong(msg.song);
            if (msg.playback && !STATE.isHost) syncPartnerPlayback(msg.playback);
          }
        } else if (msg.type === "PLAYLIST_UPDATE") {
          if (msg.senderId !== STATE.userId) {
            if (msg.playlist) {
              STATE.roomData.playlist = msg.playlist.map(normalizeSong);
              renderPlaylistUI();
            }
            if (msg.song) loadSong(msg.song);
            if (msg.playback && !STATE.isHost) syncPartnerPlayback(msg.playback);
          }
        }
      } catch (err) {
        console.warn("SSE event parsing note:", err);
      }
    };

    es.onerror = (e) => {
      console.warn("SSE stream notice:", e);
    };
  } catch (err) {
    console.warn("EventSource setup warning:", err);
  }

  if (isFirebaseConfigured() && STATE.database && firebaseSDK) {
    const roomRef = firebaseSDK.ref(STATE.database, `rooms/${roomCode}`);
    STATE.activeRoomUnsubscribe = firebaseSDK.onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        onRoomDataChanged(data);
      } else {
        // Room was deleted or closed
        if (!STATE.isHost) {
          DOM.modalHostLeft.classList.remove("hidden");
        }
      }
    });
  } else {
    // Polling fallback to keep state synchronized across devices
    if (STATE.syncInterval) clearInterval(STATE.syncInterval);
    STATE.syncInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/rooms/${roomCode}`);
        if (res.ok) {
          const json = await res.json();
          if (json.room) {
            onRoomDataChanged(json.room);
            return;
          }
        }
      } catch (e) {}

      const raw = localStorage.getItem(`couples_room_${roomCode}`);
      if (raw) {
        try {
          const data = JSON.parse(raw);
          onRoomDataChanged(data);
        } catch (e) {}
      }
    }, 1500);
  }
}

// When room data updates from Firebase or Broadcast
function onRoomDataChanged(newData) {
  if (!newData) return;
  const oldData = STATE.roomData;
  STATE.roomData = newData;

  renderRoomMembers(newData);

  // Detect if partner joined
  if (oldData && !oldData.partnerId && newData.partnerId && STATE.isHost) {
    showToast(`${newData.partnerName || "Partner"} joined the room!`, "success");
  }

  // Detect if host left
  if (oldData && oldData.members?.host?.status !== "Disconnected" && newData.members?.host?.status === "Disconnected") {
    if (!STATE.isHost) {
      DOM.modalHostLeft.classList.remove("hidden");
    }
  }

  // Detect playlist updates
  if (newData.playlist && Array.isArray(newData.playlist)) {
    STATE.roomData.playlist = newData.playlist.map(normalizeSong);
    renderPlaylistUI();
  }

  // Detect song change
  if (
    newData.song &&
    (!oldData?.song || oldData.song.audioUrl !== newData.song.audioUrl || oldData.song.title !== newData.song.title)
  ) {
    loadSong(newData.song);
    renderPlaylistUI();
    if (!STATE.isHost) {
      showToast(`Now Playing: ${newData.song.title || "New Track"}`, "info");
    }
  }

  // Synchronize playback state if partner (or non-controlling host)
  if (!STATE.isHost && newData.playback) {
    syncPartnerPlayback(newData.playback);
  }
}

// Render Members Section
function renderRoomMembers(roomData) {
  const members = roomData?.members || {};
  const host = members.host;
  const partner = members.partner;

  // Host Display
  if (host) {
    DOM.hostNameDisplay.textContent = host.name || "Host";
    DOM.hostAvatarLetter.textContent = (host.name || "H").charAt(0).toUpperCase();
    DOM.hostYouBadge.classList.toggle("hidden", !STATE.isHost);
    updateStatusBadge(DOM.hostStatusDot, DOM.hostStatusText, host.status || "Connected");
  }

  // Partner Display
  if (partner && partner.id) {
    DOM.partnerNameDisplay.textContent = partner.name || "Partner";
    DOM.partnerAvatarLetter.textContent = (partner.name || "P").charAt(0).toUpperCase();
    DOM.partnerYouBadge.classList.toggle("hidden", STATE.isHost);
    updateStatusBadge(DOM.partnerStatusDot, DOM.partnerStatusText, partner.status || "Connected");
    DOM.waitingPartnerCallout.classList.add("hidden");
    DOM.roomMembersCount.textContent = "2 MEMBERS";
  } else {
    DOM.partnerNameDisplay.textContent = "Waiting for partner...";
    DOM.partnerAvatarLetter.textContent = "P";
    DOM.partnerYouBadge.classList.add("hidden");
    updateStatusBadge(DOM.partnerStatusDot, DOM.partnerStatusText, "Waiting");
    DOM.waitingPartnerCallout.classList.toggle("hidden", !STATE.isHost);
    DOM.roomMembersCount.textContent = "1 MEMBER";
  }
}

function updateStatusBadge(dotElem, textElem, status) {
  textElem.textContent = status;
  dotElem.className = "status-dot";
  if (status === "Listening" || status === "Connected") {
    dotElem.classList.add("green");
  } else if (status === "Paused" || status === "Buffering") {
    dotElem.classList.add("amber");
  } else {
    dotElem.classList.add("gray");
  }
}

// Update self status in room
async function updateMemberStatus(newStatus) {
  if (!STATE.currentRoomCode || !STATE.roomData) return;
  const roleKey = STATE.isHost ? "host" : "partner";

  if (STATE.roomData.members && STATE.roomData.members[roleKey]) {
    STATE.roomData.members[roleKey].status = newStatus;
  }

  if (isFirebaseConfigured() && STATE.database && firebaseSDK) {
    try {
      const statusRef = firebaseSDK.ref(
        STATE.database,
        `rooms/${STATE.currentRoomCode}/members/${roleKey}/status`
      );
      await firebaseSDK.set(statusRef, newStatus);
    } catch (e) {}
  } else {
    localStorage.setItem(`couples_room_${STATE.currentRoomCode}`, JSON.stringify(STATE.roomData));
    if (STATE.broadcastChannel) {
      STATE.broadcastChannel.postMessage({
        type: "ROOM_UPDATED",
        roomCode: STATE.currentRoomCode,
        payload: STATE.roomData,
        senderId: STATE.userId
      });
    }
  }
}

// Leave Room
async function leaveRoom() {
  if (STATE.currentRoomCode) {
    const code = STATE.currentRoomCode;

    // Notify backend server of leaving
    try {
      fetch(`/api/rooms/${code}/member`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: STATE.isHost ? "host" : "partner",
          status: "Left",
          senderId: STATE.userId
        })
      }).catch(() => {});
    } catch (e) {}

    if (isFirebaseConfigured() && STATE.database && firebaseSDK) {
      try {
        if (STATE.isHost) {
          // Notify partner that host left
          const hostStatusRef = firebaseSDK.ref(STATE.database, `rooms/${code}/members/host/status`);
          await firebaseSDK.set(hostStatusRef, "Disconnected");
        } else {
          // Remove partner
          const partnerRef = firebaseSDK.ref(STATE.database, `rooms/${code}/members/partner`);
          await firebaseSDK.remove(partnerRef);
          const partnerIdRef = firebaseSDK.ref(STATE.database, `rooms/${code}/partnerId`);
          await firebaseSDK.remove(partnerIdRef);
        }
      } catch (e) {}
    } else {
      // Local clean up
      if (STATE.broadcastChannel) {
        STATE.broadcastChannel.postMessage({
          type: STATE.isHost ? "HOST_LEFT" : "PARTNER_LEFT",
          roomCode: code,
          senderId: STATE.userId
        });
      }
      if (STATE.isHost) {
        localStorage.removeItem(`couples_room_${code}`);
      }
    }
  }

  // Reset audio
  DOM.audioElement.pause();
  DOM.audioElement.src = "";
  DOM.playerCard.classList.remove("player-playing");

  if (STATE.eventSource) {
    STATE.eventSource.close();
    STATE.eventSource = null;
  }
  if (STATE.syncInterval) clearInterval(STATE.syncInterval);
  if (STATE.driftCorrectionInterval) clearInterval(STATE.driftCorrectionInterval);

  STATE.currentRoomCode = null;
  STATE.currentRole = null;
  STATE.isHost = false;
  STATE.roomData = null;

  showScreen("HOME");
  showToast("Left room", "info");
}

// =========================================================================
// SECTION 9: AUDIO PLAYBACK & SYNCHRONIZATION ENGINE
// =========================================================================

// Update Live Playback Status Pill in UI
function updatePlaybackStatusUI(status, customMessage) {
  if (!DOM.playbackStatusPill || !DOM.playbackStatusText) return;

  DOM.playbackStatusPill.className = `playback-status-pill ${status}`;

  if (customMessage) {
    DOM.playbackStatusText.textContent = customMessage;
  } else if (status === "playing") {
    DOM.playbackStatusText.textContent = STATE.isHost
      ? "Playing • In sync with Partner"
      : "Playing • In sync with Host";
    DOM.btnPlayPause.classList.remove("pulse-active");
  } else if (status === "paused") {
    if (STATE.isHost) {
      DOM.playbackStatusText.textContent = "Paused • Tap Play to start";
      DOM.btnPlayPause.classList.add("pulse-active");
    } else {
      DOM.playbackStatusText.textContent = "Paused • Waiting for Host to play";
      DOM.btnPlayPause.classList.remove("pulse-active");
    }
  } else if (status === "buffering") {
    DOM.playbackStatusText.textContent = "Buffering audio...";
    DOM.btnPlayPause.classList.remove("pulse-active");
  } else if (status === "error") {
    DOM.playbackStatusText.textContent = "Audio problem • Tap Test Sound";
    DOM.btnPlayPause.classList.remove("pulse-active");
  }

  // Update top banner live badge status
  if (DOM.selectedSongLiveStatus) {
    if (status === "playing") {
      DOM.selectedSongLiveStatus.textContent = "● PLAYING IN SYNC";
      DOM.selectedSongLiveStatus.style.background = "#d1fae5";
      DOM.selectedSongLiveStatus.style.color = "#047857";
      DOM.selectedSongLiveStatus.style.borderColor = "#a7f3d0";
    } else if (status === "paused") {
      DOM.selectedSongLiveStatus.textContent = "⏸ PAUSED";
      DOM.selectedSongLiveStatus.style.background = "#fef3c7";
      DOM.selectedSongLiveStatus.style.color = "#b45309";
      DOM.selectedSongLiveStatus.style.borderColor = "#fde68a";
    } else if (status === "buffering") {
      DOM.selectedSongLiveStatus.textContent = "⏳ BUFFERING";
      DOM.selectedSongLiveStatus.style.background = "#e0e7ff";
      DOM.selectedSongLiveStatus.style.color = "#4338ca";
      DOM.selectedSongLiveStatus.style.borderColor = "#c7d2fe";
    }
  }
}

// Load a new song into the audio player
function loadSong(song) {
  const normalized = normalizeSong(song);
  if (!normalized || !normalized.audioUrl) return;

  // Keep roomData synced if it contained an old song reference
  if (STATE.roomData && STATE.roomData.song) {
    STATE.roomData.song = normalized;
  }

  const currentSrc = DOM.audioElement.currentSrc || DOM.audioElement.src;
  const targetUrl = new URL(normalized.audioUrl, window.location.href).href;

  if (currentSrc !== targetUrl) {
    DOM.audioElement.src = normalized.audioUrl;
    DOM.audioElement.load();
  }

  // Ensure volume is set properly
  if (DOM.audioElement.volume === 0 && !STATE.isMuted) {
    DOM.audioElement.volume = STATE.volume || 0.8;
  }

  const activeTitle = normalized.title || "Romantic Melody";
  DOM.songTitle.textContent = activeTitle;
  DOM.songArtist.textContent = normalized.artist || "Couple’s Hear";

  // Also update high-visibility selected song displays across the interface
  if (DOM.headerSongTitle) {
    DOM.headerSongTitle.textContent = activeTitle;
  }
  if (DOM.psbSongTitle) {
    DOM.psbSongTitle.textContent = activeTitle;
  }

  if (normalized.artworkUrl) {
    DOM.albumArtworkImg.src = normalized.artworkUrl;
  }

  if (normalized.duration) {
    DOM.durationTimeText.textContent = formatTime(normalized.duration);
    DOM.seekSlider.max = normalized.duration;
  }

  updatePlaybackStatusUI(DOM.audioElement.paused ? "paused" : "playing");
  renderPlaylistUI();
}

// Host controls: write playback state to Firebase or local storage
async function updatePlaybackState(isPlaying, position) {
  if (!STATE.isHost || !STATE.currentRoomCode) return;

  const now = Date.now();
  const playbackObj = {
    isPlaying: Boolean(isPlaying),
    position: Number(position) || 0,
    updatedAt: now
  };

  if (!STATE.roomData) STATE.roomData = {};
  STATE.roomData.playback = playbackObj;

  // Broadcast to backend server for all connected devices
  try {
    fetch(`/api/rooms/${STATE.currentRoomCode}/playback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isPlaying: Boolean(isPlaying),
        position: Number(position) || 0,
        updatedAt: now,
        senderId: STATE.userId
      })
    }).catch(() => {});
  } catch (e) {}

  if (isFirebaseConfigured() && STATE.database && firebaseSDK) {
    try {
      const pbRef = firebaseSDK.ref(STATE.database, `rooms/${STATE.currentRoomCode}/playback`);
      await firebaseSDK.update(pbRef, playbackObj);
    } catch (e) {
      console.error("Firebase update playback error", e);
    }
  } else {
    localStorage.setItem(`couples_room_${STATE.currentRoomCode}`, JSON.stringify(STATE.roomData));
    if (STATE.broadcastChannel) {
      STATE.broadcastChannel.postMessage({
        type: "ROOM_UPDATED",
        roomCode: STATE.currentRoomCode,
        payload: STATE.roomData,
        senderId: STATE.userId
      });
    }
  }
}

// Partner synchronizer: calculates expected position accounting for network delay
function syncPartnerPlayback(playback) {
  if (STATE.isHost || !playback) return;

  const now = Date.now();
  const elapsed = (now - (playback.updatedAt || now)) / 1000;
  const expectedPosition = playback.isPlaying ? playback.position + Math.max(0, elapsed) : playback.position;

  // Check play/pause state
  if (playback.isPlaying) {
    DOM.iconPlay.classList.add("hidden");
    DOM.iconPause.classList.remove("hidden");
    DOM.playerCard.classList.add("player-playing");

    // Correct time if drifted or on initial sync
    const currentDrift = Math.abs(DOM.audioElement.currentTime - expectedPosition);
    if (currentDrift > 0.35 || DOM.audioElement.currentTime === 0) {
      try {
        DOM.audioElement.currentTime = Math.max(0, expectedPosition);
      } catch (e) {}
    }

    // Play if paused
    if (DOM.audioElement.paused) {
      const p = DOM.audioElement.play();
      if (p !== undefined) {
        p.then(() => {
          STATE.autoplayUnlocked = true;
          if (DOM.autoplayPrompt) DOM.autoplayPrompt.classList.add("hidden");
        }).catch((err) => {
          console.warn("Autoplay deferred:", err);
          if (DOM.autoplayPrompt) DOM.autoplayPrompt.classList.remove("hidden");
        });
      }
    }
  } else {
    DOM.iconPlay.classList.remove("hidden");
    DOM.iconPause.classList.add("hidden");
    DOM.playerCard.classList.remove("player-playing");

    if (Math.abs(DOM.audioElement.currentTime - playback.position) > 0.2) {
      try {
        DOM.audioElement.currentTime = Math.max(0, playback.position);
      } catch (e) {}
    }
    if (!DOM.audioElement.paused) {
      DOM.audioElement.pause();
    }
  }
}

// Periodic Drift Correction Loop (every 2.5s)
function startDriftCorrectionLoop() {
  if (STATE.driftCorrectionInterval) clearInterval(STATE.driftCorrectionInterval);

  STATE.driftCorrectionInterval = setInterval(() => {
    // Only partner needs drift correction against host's timestamp
    if (STATE.isHost || !STATE.roomData?.playback) return;
    const pb = STATE.roomData.playback;

    if (pb.isPlaying && !DOM.audioElement.paused) {
      const now = Date.now();
      const elapsed = (now - pb.updatedAt) / 1000;
      const expectedPosition = pb.position + Math.max(0, elapsed);
      const drift = expectedPosition - DOM.audioElement.currentTime;

      // If drift is significant (> 0.35s), adjust smoothly
      if (Math.abs(drift) > 0.35) {
        console.log(`[Drift Correction] Correcting drift of ${drift.toFixed(3)}s`);
        DOM.audioElement.currentTime = expectedPosition;
      }
    }
  }, 2500);
}

// =========================================================================
// SECTION 10: AUDIO EVENT LISTENERS & CONTROLS
// =========================================================================

// Audio Time Update
DOM.audioElement.addEventListener("timeupdate", () => {
  const current = DOM.audioElement.currentTime || 0;
  const duration = DOM.audioElement.duration || 0;

  DOM.currentTimeText.textContent = formatTime(current);

  if (!STATE.isSeeking && duration > 0) {
    DOM.seekSlider.value = current;
    const pct = (current / duration) * 100;
    DOM.sliderFill.style.width = `${pct}%`;
  }
});

// Audio Metadata Loaded
DOM.audioElement.addEventListener("loadedmetadata", () => {
  const duration = DOM.audioElement.duration || 0;
  DOM.seekSlider.max = duration;
  DOM.durationTimeText.textContent = formatTime(duration);

  // Sync partner playback immediately once audio metadata loads
  if (!STATE.isHost && STATE.roomData?.playback) {
    syncPartnerPlayback(STATE.roomData.playback);
  }
});

DOM.audioElement.addEventListener("canplay", () => {
  if (!STATE.isHost && STATE.roomData?.playback?.isPlaying && DOM.audioElement.paused && STATE.autoplayUnlocked) {
    syncPartnerPlayback(STATE.roomData.playback);
  }
});

// Audio Status Events
DOM.audioElement.addEventListener("play", () => {
  DOM.iconPlay.classList.add("hidden");
  DOM.iconPause.classList.remove("hidden");
  DOM.playerCard.classList.add("player-playing");
  updateMemberStatus("Listening");
});

DOM.audioElement.addEventListener("pause", () => {
  DOM.iconPlay.classList.remove("hidden");
  DOM.iconPause.classList.add("hidden");
  DOM.playerCard.classList.remove("player-playing");
  updateMemberStatus("Paused");
});

DOM.audioElement.addEventListener("waiting", () => {
  updateMemberStatus("Buffering");
});

DOM.audioElement.addEventListener("error", () => {
  const err = DOM.audioElement.error;
  console.warn("Audio element error:", err ? (err.message || err.code) : "Unknown");
  updateMemberStatus("Paused");
  updatePlaybackStatusUI("paused");
});

DOM.audioElement.addEventListener("ended", () => {
  DOM.playerCard.classList.remove("player-playing");
  updatePlaybackStatusUI("paused");
  if (STATE.isHost) {
    // 1-by-1 Continuous Playback: Advance automatically to next playlist track!
    playNextPlaylistTrack(true);
  }
});

// Play / Pause Button Handler (Host Only)
DOM.btnPlayPause.addEventListener("click", () => {
  if (!STATE.isHost) {
    showToast("Playback is controlled by the host", "info");
    return;
  }

  if (DOM.audioElement.paused) {
    DOM.audioElement
      .play()
      .then(() => {
        updatePlaybackState(true, DOM.audioElement.currentTime);
      })
      .catch((e) => {
        showToast("Audio playback error: " + e.message, "error");
      });
  } else {
    DOM.audioElement.pause();
    updatePlaybackState(false, DOM.audioElement.currentTime);
  }
});

// Seek Slider Interaction (Host Only)
DOM.seekSlider.addEventListener("input", (e) => {
  if (!STATE.isHost) return;
  STATE.isSeeking = true;
  const newTime = parseFloat(e.target.value);
  const duration = DOM.audioElement.duration || 1;
  DOM.currentTimeText.textContent = formatTime(newTime);
  DOM.sliderFill.style.width = `${(newTime / duration) * 100}%`;
});

DOM.seekSlider.addEventListener("change", (e) => {
  if (!STATE.isHost) return;
  const newTime = parseFloat(e.target.value);
  DOM.audioElement.currentTime = newTime;
  STATE.isSeeking = false;
  updatePlaybackState(!DOM.audioElement.paused, newTime);
});

// Previous Track Button (Host Only)
DOM.btnPrevTrack.addEventListener("click", () => {
  if (!STATE.isHost) {
    showToast("Only the host can change tracks", "info");
    return;
  }
  if (DOM.audioElement.currentTime > 3) {
    DOM.audioElement.currentTime = 0;
    updatePlaybackState(!DOM.audioElement.paused, 0);
  } else {
    playPreviousPlaylistTrack();
  }
});

// Next Track Button (Host Only)
DOM.btnNextTrack.addEventListener("click", () => {
  if (!STATE.isHost) {
    showToast("Only the host can change tracks", "info");
    return;
  }
  playNextPlaylistTrack(false);
});

// =========================================================================
// SECTION 10: DYNAMIC PLAYLIST & SEQUENTIAL 1-BY-1 PLAYBACK ENGINE
// =========================================================================

// Retrieve current active playlist array
function getActivePlaylist() {
  if (STATE.roomData?.playlist && Array.isArray(STATE.roomData.playlist) && STATE.roomData.playlist.length > 0) {
    return STATE.roomData.playlist;
  }
  return CURATED_PLAYLIST.map((song, i) => ({
    ...song,
    id: "preset_" + i,
    source: "preset"
  }));
}

// Get current track index within the active playlist
function getCurrentTrackIndex() {
  const playlist = getActivePlaylist();
  const currentSong = STATE.roomData?.song;
  if (!currentSong) return 0;

  const foundIndex = playlist.findIndex((t) => {
    if (currentSong.id && t.id && currentSong.id === t.id) return true;
    if (currentSong.audioUrl && t.audioUrl && currentSong.audioUrl === t.audioUrl) return true;
    if (currentSong.title && t.title && currentSong.title === t.title) return true;
    return false;
  });

  return foundIndex >= 0 ? foundIndex : 0;
}

// Render dynamic playlist items with live active indicator, equalizer & host controls
function renderPlaylistUI() {
  if (!DOM.playlistTracks) return;

  const playlist = getActivePlaylist();
  const currentIndex = getCurrentTrackIndex();

  if (DOM.playlistCountBadge) {
    DOM.playlistCountBadge.textContent = `${playlist.length} Song${playlist.length === 1 ? "" : "s"}`;
  }

  if (playlist.length === 0) {
    DOM.playlistTracks.innerHTML = `
      <div class="playlist-empty-state">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-2v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-2" />
        </svg>
        <p>No songs in the playlist yet.</p>
        <p style="font-size: 0.72rem; margin-top: 4px; opacity: 0.85;">Host can upload songs or choose curated presets below.</p>
      </div>
    `;
    return;
  }

  DOM.playlistTracks.innerHTML = playlist
    .map((track, idx) => {
      const isActive = idx === currentIndex;
      const cleanTitle = escapeHTML(track.title || "Untitled Song");
      const cleanArtist = escapeHTML(track.artist || "Couple’s Hear");
      const durationStr = track.duration ? formatTime(track.duration) : "--:--";
      const coverImg = track.artworkUrl || ROMANTIC_COVERS[idx % ROMANTIC_COVERS.length];

      return `
        <div 
          id="playlist-item-${idx}" 
          class="playlist-item ${isActive ? "active" : ""} ${STATE.isHost ? "clickable" : ""}" 
          onclick="${STATE.isHost ? `window.selectPlaylistTrack(${idx}, true)` : `window.notifyPartnerPlaylistClick()`}"
          title="${STATE.isHost ? `Play "${cleanTitle}"` : `Listening to ${cleanTitle}`}"
        >
          <div class="playlist-track-index-wrap">
            ${
              isActive
                ? `<div class="equalizer-wave">
                     <span class="equalizer-bar"></span>
                     <span class="equalizer-bar"></span>
                     <span class="equalizer-bar"></span>
                   </div>`
                : `<span class="playlist-track-index">#${idx + 1}</span>`
            }
          </div>

          <img 
            src="${coverImg}" 
            alt="${cleanTitle}" 
            class="playlist-track-thumb" 
            loading="lazy"
            onerror="this.style.display='none'"
          />

          <div class="playlist-track-details">
            <div class="playlist-track-title">${cleanTitle}</div>
            <div class="playlist-track-meta-row">
              <span class="playlist-track-artist">${cleanArtist}</span>
              ${isActive ? `<span class="now-playing-pill">NOW PLAYING</span>` : ""}
            </div>
          </div>

          <div class="playlist-track-right">
            <span class="playlist-track-duration">${durationStr}</span>
            ${
              STATE.isHost
                ? `<button 
                     type="button" 
                     class="btn-remove-track" 
                     onclick="window.removeTrackFromPlaylist(${idx}, event)"
                     title="Remove from playlist"
                   >
                     <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                       <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                     </svg>
                   </button>`
                : ""
            }
          </div>
        </div>
      `;
    })
    .join("");

  // Update preset button active highlights and badge to match if current song is one of presets
  if (DOM.presetButtons) {
    const btns = DOM.presetButtons.querySelectorAll(".preset-btn");
    const currentTrack = playlist[currentIndex];
    btns.forEach((btn, i) => {
      const preset = CURATED_PLAYLIST[i];
      const isMatching = currentTrack && preset && (currentTrack.title === preset.title || currentTrack.audioUrl === preset.audioUrl);
      btn.classList.toggle("active", Boolean(isMatching));
      const badge = btn.querySelector(".preset-selected-badge");
      if (badge) {
        badge.classList.toggle("hidden", !isMatching);
      }
    });
  }

  // Update header and playlist selected title banner
  const activeTrack = playlist[currentIndex];
  if (activeTrack) {
    const trackTitle = activeTrack.title || "Romantic Melody";
    if (DOM.psbSongTitle) DOM.psbSongTitle.textContent = trackTitle;
    if (DOM.headerSongTitle) DOM.headerSongTitle.textContent = trackTitle;
  }
}

// Partner clicks playlist track hint
window.notifyPartnerPlaylistClick = function () {
  showToast("Playback selection is controlled by the Host", "info");
};

// Select and play a specific track from playlist by index
window.selectPlaylistTrack = async function (index, autoPlay = true) {
  if (!STATE.isHost) return;

  const playlist = getActivePlaylist();
  if (index < 0 || index >= playlist.length) return;

  const selectedTrack = playlist[index];
  await updateRoomSong(selectedTrack, autoPlay);
  renderPlaylistUI();
};

// Advance to the next track in the playlist (1-by-1 automatic or manual)
function playNextPlaylistTrack(autoAdvance = false) {
  if (!STATE.isHost) return;

  const playlist = getActivePlaylist();
  if (!playlist.length) return;

  const currentIndex = getCurrentTrackIndex();
  const nextIndex = (currentIndex + 1) % playlist.length;
  const nextTrack = playlist[nextIndex];

  window.selectPlaylistTrack(nextIndex, true);

  if (autoAdvance) {
    showToast(`Playing next: "${nextTrack.title || "Next Song"}"`, "info");
  }
}

// Return to previous track in the playlist
function playPreviousPlaylistTrack() {
  if (!STATE.isHost) return;

  const playlist = getActivePlaylist();
  if (!playlist.length) return;

  const currentIndex = getCurrentTrackIndex();
  const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;

  window.selectPlaylistTrack(prevIndex, true);
}

// Remove a track from the playlist (Host Only)
window.removeTrackFromPlaylist = async function (index, event) {
  if (event) event.stopPropagation();
  if (!STATE.isHost) return;

  const playlist = [...getActivePlaylist()];
  if (index < 0 || index >= playlist.length) return;

  const removedSong = playlist[index];
  const currentIndex = getCurrentTrackIndex();
  const isRemovingActive = index === currentIndex;

  playlist.splice(index, 1);

  // If playlist became empty, restore default preset
  if (playlist.length === 0) {
    playlist.push({
      ...CURATED_PLAYLIST[0],
      id: "preset_0",
      source: "preset"
    });
  }

  let nextSongToPlay = STATE.roomData?.song;
  if (isRemovingActive) {
    const newTargetIndex = Math.min(index, playlist.length - 1);
    nextSongToPlay = playlist[newTargetIndex];
  }

  await syncRoomPlaylist(playlist, nextSongToPlay, isRemovingActive);
  showToast(`Removed "${removedSong.title || "Song"}" from playlist`, "info");
  renderPlaylistUI();
};

// Clear / Reset entire playlist (Host Only)
if (DOM.btnClearPlaylist) {
  DOM.btnClearPlaylist.addEventListener("click", async () => {
    if (!STATE.isHost) return;
    const defaultList = CURATED_PLAYLIST.map((s, i) => ({
      ...s,
      id: "preset_" + i,
      source: "preset"
    }));
    await syncRoomPlaylist(defaultList, defaultList[0], true);
    showToast("Playlist reset to default romantic songs", "info");
    renderPlaylistUI();
  });
}

// Centralized sync for playlist and song across Firebase and BroadcastChannel
async function syncRoomPlaylist(newPlaylist, newSong, autoPlay = false) {
  if (!STATE.isHost || !STATE.currentRoomCode) return;

  if (!STATE.roomData) STATE.roomData = {};
  STATE.roomData.playlist = newPlaylist.map(normalizeSong);
  if (newSong) {
    STATE.roomData.song = normalizeSong(newSong);
    STATE.roomData.playback = {
      isPlaying: autoPlay,
      position: 0,
      updatedAt: Date.now()
    };
    loadSong(STATE.roomData.song);
    DOM.audioElement.currentTime = 0;
  }

  // Broadcast playlist and song update to backend server
  try {
    fetch(`/api/rooms/${STATE.currentRoomCode}/playlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playlist: STATE.roomData.playlist,
        song: newSong ? STATE.roomData.song : undefined,
        senderId: STATE.userId
      })
    }).catch(() => {});
  } catch (e) {}

  if (isFirebaseConfigured() && STATE.database && firebaseSDK) {
    try {
      const roomRef = firebaseSDK.ref(STATE.database, `rooms/${STATE.currentRoomCode}`);
      const updatePayload = {
        playlist: STATE.roomData.playlist,
        lastActiveAt: Date.now()
      };
      if (newSong) {
        updatePayload.song = STATE.roomData.song;
        updatePayload.playback = STATE.roomData.playback;
      }
      await firebaseSDK.update(roomRef, updatePayload);
    } catch (e) {
      console.error("Firebase update playlist error", e);
    }
  } else {
    localStorage.setItem(`couples_room_${STATE.currentRoomCode}`, JSON.stringify(STATE.roomData));
    if (STATE.broadcastChannel) {
      STATE.broadcastChannel.postMessage({
        type: "ROOM_UPDATED",
        roomCode: STATE.currentRoomCode,
        payload: STATE.roomData,
        senderId: STATE.userId
      });
    }
  }

  if (autoPlay && newSong) {
    DOM.audioElement.play().catch(() => {});
  }
}

// Update Room Song in Firebase / Storage & sync with playlist
async function updateRoomSong(songObj, autoPlay = true) {
  if (!STATE.isHost || !STATE.currentRoomCode) return;

  const normalized = normalizeSong(songObj);
  let playlist = [...getActivePlaylist()];

  // Ensure song is present in the playlist
  const exists = playlist.some(
    (t) => (t.id && t.id === normalized.id) || t.audioUrl === normalized.audioUrl || t.title === normalized.title
  );
  if (!exists) {
    playlist.push(normalized);
  }

  await syncRoomPlaylist(playlist, normalized, autoPlay);
}

// Preset button clicks: adds preset to playlist or switches to it
DOM.presetButtons.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!STATE.isHost) {
      showToast("Only host can change songs", "info");
      return;
    }
    const idx = parseInt(btn.dataset.index, 10);
    const track = CURATED_PLAYLIST[idx];
    if (!track) return;

    const presetSong = {
      ...track,
      id: "preset_" + idx,
      source: "preset"
    };

    updateRoomSong(presetSong, true);
    showToast(`Playing: "${track.title}"`, "info");
  });
});

// Volume Controls (Local to each device so couple can set their own comfort)
DOM.volumeSlider.addEventListener("input", (e) => {
  const val = parseFloat(e.target.value);
  STATE.volume = val;
  DOM.audioElement.volume = val;
  DOM.volumePercent.textContent = `${Math.round(val * 100)}%`;

  if (val === 0) {
    STATE.isMuted = true;
    DOM.iconVolumeHigh.classList.add("hidden");
    DOM.iconVolumeMuted.classList.remove("hidden");
  } else {
    STATE.isMuted = false;
    DOM.iconVolumeHigh.classList.remove("hidden");
    DOM.iconVolumeMuted.classList.add("hidden");
  }
});

DOM.btnVolumeMute.addEventListener("click", () => {
  STATE.isMuted = !STATE.isMuted;
  if (STATE.isMuted) {
    DOM.audioElement.volume = 0;
    DOM.volumeSlider.value = 0;
    DOM.volumePercent.textContent = "0%";
    DOM.iconVolumeHigh.classList.add("hidden");
    DOM.iconVolumeMuted.classList.remove("hidden");
  } else {
    DOM.audioElement.volume = STATE.volume || 0.8;
    DOM.volumeSlider.value = STATE.volume || 0.8;
    DOM.volumePercent.textContent = `${Math.round((STATE.volume || 0.8) * 100)}%`;
    DOM.iconVolumeHigh.classList.remove("hidden");
    DOM.iconVolumeMuted.classList.add("hidden");
  }
});

// Autoplay Unlock Modal
DOM.btnStartListening.addEventListener("click", () => {
  STATE.autoplayUnlocked = true;
  DOM.autoplayPrompt.classList.add("hidden");

  if (STATE.roomData?.playback) {
    syncPartnerPlayback(STATE.roomData.playback);
  } else {
    DOM.audioElement.play().catch(() => {});
  }
  showToast("Synchronized audio active!", "success");
});

// Test Audio Sound Synthesizer Check
function playAudioChimeTest() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      showToast("AudioContext not supported by browser", "error");
      return;
    }

    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    // Gentle romantic chime chord: C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz), C6 (1046.50Hz)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0, now + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.12 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.85);
    });

    showToast("Speaker sound check: crystal clear!", "success");
  } catch (err) {
    console.error("Test audio error:", err);
    showToast("Could not play sound test: " + err.message, "error");
  }
}

if (DOM.btnTestSound) {
  DOM.btnTestSound.addEventListener("click", playAudioChimeTest);
}

// =========================================================================
// SECTION 11: MULTI-SONG UPLOADING & DRAG-AND-DROP QUEUE ENGINE
// =========================================================================

// Measure duration of an audio file via an Audio element
function getAudioFileDuration(file) {
  return new Promise((resolve) => {
    try {
      const tempAudio = document.createElement("audio");
      tempAudio.preload = "metadata";
      const objUrl = URL.createObjectURL(file);
      tempAudio.src = objUrl;

      tempAudio.onloadedmetadata = () => {
        const dur = Math.round(tempAudio.duration);
        URL.revokeObjectURL(objUrl);
        resolve(dur || 0);
      };

      tempAudio.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve(0);
      };
    } catch (e) {
      resolve(0);
    }
  });
}

// Multi-file upload processor: accepts FileList or Array of Files
async function handleMultipleFilesUpload(fileList) {
  if (!STATE.isHost) {
    showToast("Only the host can upload music", "info");
    return;
  }

  const rawFiles = Array.from(fileList || []);
  if (!rawFiles.length) return;

  const allowedExtensions = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"];
  const validFiles = [];

  for (const file of rawFiles) {
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    const isAudioType = file.type.startsWith("audio/") || allowedExtensions.includes(ext);

    if (!isAudioType) {
      showToast(`Skipped "${file.name}" (not a supported audio format)`, "error");
      continue;
    }

    if (file.size > 50 * 1024 * 1024) {
      showToast(`Skipped "${file.name}" (exceeds 50MB limit)`, "error");
      continue;
    }

    validFiles.push(file);
  }

  if (!validFiles.length) {
    showToast("No valid audio files to upload", "error");
    return;
  }

  // Display upload progress container
  DOM.uploadProgressContainer.classList.remove("hidden");
  DOM.uploadProgressBar.style.width = "0%";
  DOM.uploadPercentage.textContent = "0%";
  DOM.uploadFilename.textContent = `Preparing ${validFiles.length} song${validFiles.length > 1 ? "s" : ""}...`;

  const newSongsList = [];
  const totalCount = validFiles.length;

  for (let i = 0; i < totalCount; i++) {
    const file = validFiles[i];
    const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
    const coverArt = ROMANTIC_COVERS[(Date.now() + i) % ROMANTIC_COVERS.length];

    DOM.uploadFilename.textContent = `Uploading ${i + 1} of ${totalCount}: ${file.name}`;
    const baseProgress = (i / totalCount) * 100;
    DOM.uploadProgressBar.style.width = `${Math.round(baseProgress)}%`;
    DOM.uploadPercentage.textContent = `${Math.round(baseProgress)}%`;

    const duration = await getAudioFileDuration(file);

    let finalAudioUrl = null;

    // Firebase Storage upload if configured
    if (isFirebaseConfigured() && STATE.storage && firebaseSDK) {
      try {
        const fileStorageRef = firebaseSDK.storageRef(
          STATE.storage,
          `rooms/${STATE.currentRoomCode}/${Date.now()}_${i}_${file.name}`
        );
        const uploadTask = firebaseSDK.uploadBytesResumable(fileStorageRef, file);

        await new Promise((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const fileProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * (100 / totalCount);
              const totalPct = Math.round(baseProgress + fileProgress);
              DOM.uploadProgressBar.style.width = `${totalPct}%`;
              DOM.uploadPercentage.textContent = `${totalPct}%`;
            },
            (error) => {
              console.error("Storage upload error:", error);
              reject(error);
            },
            async () => {
              finalAudioUrl = await firebaseSDK.getDownloadURL(uploadTask.snapshot.ref);
              resolve();
            }
          );
        });
      } catch (err) {
        console.warn("Storage upload failed, using local URL fallback:", err);
      }
    }

    // Server storage upload fallback so both partners can hear uploaded tracks
    if (!finalAudioUrl) {
      try {
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "x-filename": encodeURIComponent(file.name),
            "Content-Type": file.type || "application/octet-stream"
          },
          body: file
        });
        if (uploadRes.ok) {
          const uploadJson = await uploadRes.json();
          if (uploadJson && uploadJson.url) {
            finalAudioUrl = uploadJson.url;
          }
        }
      } catch (uploadErr) {
        console.warn("Server file upload note:", uploadErr);
      }
    }

    // Local / direct URL fallback
    if (!finalAudioUrl) {
      finalAudioUrl = URL.createObjectURL(file);
    }

    const songObj = {
      id: "upload_" + Date.now() + "_" + i + "_" + Math.random().toString(36).substring(2, 6),
      title: cleanTitle,
      artist: STATE.userName || "Uploaded Track",
      audioUrl: finalAudioUrl,
      duration: duration,
      artworkUrl: coverArt,
      source: "upload"
    };

    newSongsList.push(songObj);
  }

  // Update progress to complete
  DOM.uploadProgressBar.style.width = "100%";
  DOM.uploadPercentage.textContent = "All songs ready!";

  // Append new songs to existing playlist
  const currentPlaylist = [...getActivePlaylist()];
  const updatedPlaylist = [...currentPlaylist, ...newSongsList];

  // If player was paused or nothing was playing, start first new song
  const shouldPlayFirst = DOM.audioElement.paused || !STATE.roomData?.song;
  const targetSongToPlay = shouldPlayFirst ? newSongsList[0] : (STATE.roomData?.song || newSongsList[0]);

  await syncRoomPlaylist(updatedPlaylist, targetSongToPlay, shouldPlayFirst);
  renderPlaylistUI();

  showToast(`Added ${newSongsList.length} song${newSongsList.length > 1 ? "s" : ""} to playlist!`, "success");

  // Reset file input
  if (DOM.audioFileInput) {
    DOM.audioFileInput.value = "";
  }

  setTimeout(() => {
    DOM.uploadProgressContainer.classList.add("hidden");
  }, 2200);
}

// Trigger file chooser on button click
DOM.btnTriggerUpload.addEventListener("click", () => {
  if (!STATE.isHost) {
    showToast("Only host can upload music", "info");
    return;
  }
  DOM.audioFileInput.click();
});

// File input change handler (supports multiple files)
DOM.audioFileInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files.length > 0) {
    handleMultipleFilesUpload(e.target.files);
  }
});

// Drag & Drop Multiple Files Support
if (DOM.uploadDropzone) {
  ["dragenter", "dragover"].forEach((eventName) => {
    DOM.uploadDropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (STATE.isHost) {
        DOM.uploadDropzone.classList.add("drag-active");
      }
    });
  });

  ["dragleave", "dragend"].forEach((eventName) => {
    DOM.uploadDropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      DOM.uploadDropzone.classList.remove("drag-active");
    });
  });

  DOM.uploadDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    DOM.uploadDropzone.classList.remove("drag-active");

    if (!STATE.isHost) {
      showToast("Only the host can add songs", "info");
      return;
    }

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleMultipleFilesUpload(e.dataTransfer.files);
    }
  });
}

// Drag & Drop onto Player Card also supported
if (DOM.playerCard) {
  DOM.playerCard.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (STATE.isHost) {
      DOM.playerCard.style.outline = "2px dashed var(--primary-pink)";
    }
  });

  DOM.playerCard.addEventListener("dragleave", () => {
    DOM.playerCard.style.outline = "";
  });

  DOM.playerCard.addEventListener("drop", (e) => {
    e.preventDefault();
    DOM.playerCard.style.outline = "";
    if (STATE.isHost && e.dataTransfer?.files?.length > 0) {
      handleMultipleFilesUpload(e.dataTransfer.files);
    }
  });
}

// =========================================================================
// SECTION 12: COPY & WEB SHARE API
// =========================================================================
function copyTextToClipboard(text, successMsg) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(text)
      .then(() => showToast(successMsg, "success"))
      .catch(() => fallbackCopy(text, successMsg));
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, successMsg) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand("copy");
    showToast(successMsg, "success");
  } catch (err) {
    showToast("Could not copy: " + text, "error");
  }
  document.body.removeChild(textArea);
}

// Share Room using Web Share API or Clipboard Fallback
function shareRoom(roomCode) {
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
  const shareData = {
    title: "Couple’s Hear",
    text: `Join me on Couple’s Hear.\nRoom Code: ${roomCode}\nListen to the same music together.`,
    url: shareUrl
  };

  if (navigator.share) {
    navigator
      .share(shareData)
      .catch((err) => {
        if (err.name !== "AbortError") {
          copyTextToClipboard(shareUrl, "Room link copied!");
        }
      });
  } else {
    copyTextToClipboard(shareUrl, "Room link copied!");
  }
}

// Copy Code Buttons
DOM.btnCopyCode.addEventListener("click", () => {
  copyTextToClipboard(STATE.currentRoomCode, "Room code copied!");
});

DOM.btnRoomCopyCode.addEventListener("click", () => {
  copyTextToClipboard(STATE.currentRoomCode, "Room code copied!");
});

// Share Buttons
DOM.btnShareRoom.addEventListener("click", () => {
  shareRoom(STATE.currentRoomCode);
});

DOM.btnRoomShare.addEventListener("click", () => {
  shareRoom(STATE.currentRoomCode);
});

DOM.btnCalloutCopy.addEventListener("click", () => {
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${STATE.currentRoomCode}`;
  copyTextToClipboard(shareUrl, "Room link copied!");
});

// =========================================================================
// SECTION 13: UI EVENTS & MODAL CONTROLS
// =========================================================================

// Landing Page Tap to Enter
DOM.landingScreen.addEventListener("click", () => {
  showScreen("HOME");
});

DOM.btnEnterApp.addEventListener("click", (e) => {
  e.stopPropagation();
  showScreen("HOME");
});

// Home Screen Action Cards
DOM.cardCreateRoom.addEventListener("click", createRoom);
DOM.btnOpenCreateRoom.addEventListener("click", (e) => {
  e.stopPropagation();
  createRoom();
});

DOM.cardJoinRoom.addEventListener("click", () => showScreen("JOIN_ROOM"));
DOM.btnOpenJoinRoom.addEventListener("click", (e) => {
  e.stopPropagation();
  showScreen("JOIN_ROOM");
});

// Back Buttons
DOM.btnBackFromCreate.addEventListener("click", () => showScreen("HOME"));
DOM.btnBackFromJoin.addEventListener("click", () => showScreen("HOME"));
DOM.navLogoBtn.addEventListener("click", () => {
  if (STATE.currentRoomCode) {
    DOM.modalLeaveConfirm.classList.remove("hidden");
  } else {
    showScreen("HOME");
  }
});

// Enter Created Room
DOM.btnEnterCreatedRoom.addEventListener("click", () => {
  enterActiveRoom(STATE.roomData);
});

// Join Room Form Submit
DOM.formJoinRoom.addEventListener("submit", (e) => {
  if (e) e.preventDefault();
  joinRoom();
});

DOM.inputRoomCode.addEventListener("input", (e) => {
  let val = e.target.value.toUpperCase();
  if (val.includes("ROOM=")) {
    const match = val.match(/ROOM=([A-Z0-9]{6})/i);
    if (match) val = match[1];
  }
  e.target.value = val.replace(/[^A-Z0-9]/g, "").slice(0, 6);
});

DOM.inputRoomCode.addEventListener("paste", () => {
  setTimeout(() => {
    let val = DOM.inputRoomCode.value.toUpperCase();
    if (val.includes("ROOM=")) {
      const match = val.match(/ROOM=([A-Z0-9]{6})/i);
      if (match) val = match[1];
    }
    DOM.inputRoomCode.value = val.replace(/[^A-Z0-9]/g, "").slice(0, 6);
  }, 10);
});

// Leave Room Flow
DOM.btnNavLeave.addEventListener("click", () => {
  DOM.modalLeaveConfirm.classList.remove("hidden");
});

DOM.btnRoomLeave.addEventListener("click", () => {
  DOM.modalLeaveConfirm.classList.remove("hidden");
});

DOM.btnLeaveCancel.addEventListener("click", () => {
  DOM.modalLeaveConfirm.classList.add("hidden");
});

DOM.btnLeaveConfirm.addEventListener("click", () => {
  DOM.modalLeaveConfirm.classList.add("hidden");
  leaveRoom();
});

DOM.btnReturnHomeHostLeft.addEventListener("click", () => {
  DOM.modalHostLeft.classList.add("hidden");
  leaveRoom();
});

// Firebase Config Modal
DOM.btnFirebaseSettings.addEventListener("click", () => {
  DOM.cfgApiKey.value = firebaseConfig.apiKey === "YOUR_API_KEY" ? "" : firebaseConfig.apiKey;
  DOM.cfgDatabaseURL.value = firebaseConfig.databaseURL === "YOUR_DATABASE_URL" ? "" : firebaseConfig.databaseURL;
  DOM.cfgProjectId.value = firebaseConfig.projectId === "YOUR_PROJECT_ID" ? "" : firebaseConfig.projectId;
  DOM.cfgStorageBucket.value = firebaseConfig.storageBucket === "YOUR_PROJECT.appspot.com" ? "" : firebaseConfig.storageBucket;
  DOM.modalFirebaseConfig.classList.remove("hidden");
});

DOM.btnBannerConfig.addEventListener("click", () => {
  DOM.btnFirebaseSettings.click();
});

DOM.btnCloseConfig.addEventListener("click", () => {
  DOM.modalFirebaseConfig.classList.add("hidden");
});

DOM.btnClearConfig.addEventListener("click", () => {
  localStorage.removeItem(LOCAL_STORAGE_CFG_KEY);
  location.reload();
});

DOM.formFirebaseConfig.addEventListener("submit", () => {
  const newConfig = {
    apiKey: DOM.cfgApiKey.value.trim(),
    databaseURL: DOM.cfgDatabaseURL.value.trim(),
    projectId: DOM.cfgProjectId.value.trim(),
    storageBucket: DOM.cfgStorageBucket.value.trim()
  };

  localStorage.setItem(LOCAL_STORAGE_CFG_KEY, JSON.stringify(newConfig));
  DOM.modalFirebaseConfig.classList.add("hidden");
  showToast("Firebase settings saved! Reloading...", "success");
  setTimeout(() => location.reload(), 1000);
});

// =========================================================================
// SECTION 14: AMBIENT FLOATING PARTICLES CANVAS
// =========================================================================
function initParticles() {
  const canvas = document.getElementById("particles-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = [];
  const particleCount = 38;

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 3.5 + 1.2,
      speedX: (Math.random() - 0.5) * 0.4,
      speedY: -Math.random() * 0.5 - 0.2,
      opacity: Math.random() * 0.5 + 0.2,
      hue: Math.random() > 0.6 ? 330 : 345
    });
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    for (let p of particles) {
      p.x += p.speedX;
      p.y += p.speedY;

      if (p.y < -10) {
        p.y = height + 10;
        p.x = Math.random() * width;
      }
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 80%, 75%, ${p.opacity})`;
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  animate();
}

// =========================================================================
// SECTION 15: INITIALIZATION & DIRECT URL PARAMETER CHECK
// =========================================================================
// Helper to run startup logic whether DOM is already ready or loading
function bootstrapApp() {
  try {
    initParticles();
  } catch (err) {
    console.warn("Particles init note:", err);
  }

  initSyncEngine().catch((err) => {
    console.warn("Sync engine init note:", err);
  });

  // Check URL parameters for direct room link (?room=LOVE7K)
  const urlParams = new URLSearchParams(window.location.search);
  const directRoomParam = urlParams.get("room") || (window.location.hash.startsWith("#room=") ? window.location.hash.replace("#room=", "") : null);

  if (directRoomParam && DOM.inputRoomCode) {
    const cleanedCode = directRoomParam.trim().toUpperCase();
    if (cleanedCode.length === 6) {
      DOM.inputRoomCode.value = cleanedCode;
      showScreen("JOIN_ROOM");
      showToast(`Detected room ${cleanedCode}. Tap Join to enter!`, "info");
      initSitePoliciesAndNavEngine();
      initPWAAppEngine();
      return;
    }
  }

  // Default: Start at Landing screen
  showScreen("LANDING");

  // Initialize Navigation, Modals, Contact Form & Privacy Handlers
  initSitePoliciesAndNavEngine();

  // Initialize Progressive Web App (PWA) Engine & Install Handlers
  initPWAAppEngine();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", bootstrapApp);
} else {
  bootstrapApp();
}

// =========================================================================
// SECTION 16: NAVIGATION, MODALS & PRIVACY POLICIES ENGINE
// =========================================================================

function initSitePoliciesAndNavEngine() {
  // 1. Header & Footer Navigation Scroll Handlers
  document.querySelectorAll("[data-target-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const target = btn.getAttribute("data-target-action");

      // Update active state in nav
      document.querySelectorAll(".nav-menu-link").forEach((link) => link.classList.remove("active"));
      if (btn.classList.contains("nav-menu-link")) {
        btn.classList.add("active");
      }

      if (target === "home") {
        if (STATE.currentScreen !== "PLAYER") {
          showScreen("LANDING");
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      // If user is currently in player room or join screen, switch view if needed
      if (STATE.currentScreen !== "LANDING" && STATE.currentScreen !== "PLAYER") {
        showScreen("LANDING");
      }

      const elementId = `section-${target}`;
      const element = document.getElementById(elementId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  // 2. Policy & Legal Modal Handlers
  const policyModals = ["privacy-policy", "terms-of-service", "about-us", "contact-us", "cookie-policy", "ios-install", "app-install"];

  function openModal(name) {
    const modal = document.getElementById(`modal-${name}`);
    if (modal) {
      modal.classList.remove("hidden");
      document.body.style.overflow = "hidden"; // prevent background scroll
    }
  }

  function closeModal(name) {
    const modal = document.getElementById(`modal-${name}`);
    if (modal) {
      modal.classList.add("hidden");
      document.body.style.overflow = "";
    }
  }

  // Open modal buttons
  document.querySelectorAll("[data-open-modal]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const modalName = btn.getAttribute("data-open-modal");
      openModal(modalName);
    });
  });

  // Close modal buttons
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const modalName = btn.getAttribute("data-close-modal");
      closeModal(modalName);
    });
  });

  // Close on backdrop click
  policyModals.forEach((name) => {
    const modal = document.getElementById(`modal-${name}`);
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          closeModal(name);
        }
      });
    }
  });

  // Close on Escape key
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      policyModals.forEach((name) => closeModal(name));
    }
  });

  // 3. Contact Form Submission (Live server endpoint with feedback)
  const contactForm = document.getElementById("contact-form");
  const contactFeedback = document.getElementById("contact-feedback-message");
  const contactSubmitBtn = document.getElementById("btn-submit-contact");

  if (contactForm) {
    contactForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById("contact-name");
      const emailInput = document.getElementById("contact-email");
      const categoryInput = document.getElementById("contact-category");
      const messageInput = document.getElementById("contact-message");

      const name = nameInput.value.trim();
      const email = emailInput.value.trim();
      const category = categoryInput ? categoryInput.value : "General Inquiry";
      const message = messageInput.value.trim();

      if (!name || !email || !message) {
        if (contactFeedback) {
          contactFeedback.className = "form-feedback-alert error";
          contactFeedback.textContent = "Please fill out all required fields.";
          contactFeedback.classList.remove("hidden");
        }
        return;
      }

      // Loading state
      if (contactSubmitBtn) {
        contactSubmitBtn.disabled = true;
        contactSubmitBtn.style.opacity = "0.7";
      }

      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, category, message }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          if (contactFeedback) {
            contactFeedback.className = "form-feedback-alert success";
            contactFeedback.textContent = data.message || "Thank you! Your message has been received. Our editorial team will get back to you shortly.";
            contactFeedback.classList.remove("hidden");
          }
          contactForm.reset();
          setTimeout(() => {
            closeModal("contact-us");
            if (contactFeedback) contactFeedback.classList.add("hidden");
          }, 3500);
        } else {
          throw new Error(data.error || "Failed to deliver message.");
        }
      } catch (err) {
        if (contactFeedback) {
          contactFeedback.className = "form-feedback-alert error";
          contactFeedback.textContent = err.message || "Network error. Please try again later.";
          contactFeedback.classList.remove("hidden");
        }
      } finally {
        if (contactSubmitBtn) {
          contactSubmitBtn.disabled = false;
          contactSubmitBtn.style.opacity = "";
        }
      }
    });
  }

  // 4. Cookie Consent Banner & Preferences
  const cookieBanner = document.getElementById("cookie-consent-banner");
  const btnCookieAccept = document.getElementById("btn-cookie-accept");
  const btnCookiePrefs = document.getElementById("btn-cookie-preferences");
  const btnSaveCookieSettings = document.getElementById("btn-save-cookie-settings");

  const storedConsent = localStorage.getItem("coupleshear_cookies_consent");

  if (!storedConsent && cookieBanner) {
    // Show banner after brief delay so user sees initial render smoothly
    setTimeout(() => {
      cookieBanner.classList.remove("hidden");
    }, 800);
  }

  if (btnCookieAccept) {
    btnCookieAccept.addEventListener("click", () => {
      localStorage.setItem("coupleshear_cookies_consent", "accepted_all");
      if (cookieBanner) cookieBanner.classList.add("hidden");
      showToast("Cookie preferences saved. Thank you!", "success");
    });
  }

  if (btnCookiePrefs) {
    btnCookiePrefs.addEventListener("click", () => {
      openModal("cookie-policy");
    });
  }

  if (btnSaveCookieSettings) {
    btnSaveCookieSettings.addEventListener("click", () => {
      const analyticsCookies = document.getElementById("toggle-analytics-cookies")?.checked ?? true;

      const consentData = {
        essential: true,
        advertising: false,
        analytics: analyticsCookies,
        timestamp: Date.now()
      };

      localStorage.setItem("coupleshear_cookies_consent", JSON.stringify(consentData));
      closeModal("cookie-policy");
      if (cookieBanner) cookieBanner.classList.add("hidden");
      showToast("Custom privacy preferences updated.", "success");
    });
  }

  // 5. Mobile Navigation toggle (Scroll down to How it works)
  const mobileNavToggle = document.getElementById("btn-mobile-nav-toggle");
  if (mobileNavToggle) {
    mobileNavToggle.addEventListener("click", () => {
      const howItWorks = document.getElementById("section-how-it-works");
      if (howItWorks) {
        howItWorks.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }
}

// =========================================================================
// SECTION 17: PROGRESSIVE WEB APP (PWA) & MOBILE APP INSTALL ENGINE
// =========================================================================

function initPWAAppEngine() {
  // 1. Service Worker Registration
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .then((reg) => {
          console.log("[PWA Engine] Service worker registered successfully. Scope:", reg.scope);
          
          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                  showToast("App updated in background! Ready for instant synchronized listening.", "info");
                }
              };
            }
          };
        })
        .catch((err) => {
          console.warn("[PWA Engine] Service worker registration note:", err);
        });
    });
  }

  // 2. DOM Elements
  const topInstallBar = document.getElementById("top-install-bar");
  const notificationCard = document.getElementById("notification-card-clickable");
  const btnTopBarInstall = document.getElementById("btn-top-bar-install");
  const btnDismissTopBar = document.getElementById("btn-dismiss-top-bar");
  const btnLandingInstall = document.getElementById("btn-landing-install");
  const btnPwaInstall = document.getElementById("btn-pwa-install");
  const btnIosInstall = document.getElementById("btn-ios-install");
  const offlineIndicator = document.getElementById("pwa-offline-indicator");
  const offlineText = document.getElementById("pwa-offline-text");

  let deferredInstallPrompt = null;

  // Function to dismiss notification bar with smooth slide-up
  function dismissInstallNotification(e) {
    if (e && typeof e.stopPropagation === "function") {
      e.stopPropagation();
    }
    if (topInstallBar) {
      topInstallBar.classList.add("slide-up");
      setTimeout(() => {
        topInstallBar.style.display = "none";
      }, 350);
    }
    sessionStorage.setItem("coupleshear_topbar_dismissed", "true");
  }

  // Check top bar session dismissal
  if (topInstallBar) {
    const topBarDismissed = sessionStorage.getItem("coupleshear_topbar_dismissed");
    if (topBarDismissed === "true") {
      topInstallBar.style.display = "none";
    }
  }

  // 3. Detect Standalone / Already Installed App Mode
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true ||
    document.referrer.includes("android-app://");

  if (isStandalone) {
    console.log("[PWA Engine] Running in native Standalone App mode.");
    if (topInstallBar) topInstallBar.style.display = "none";
    if (btnPwaInstall) btnPwaInstall.classList.add("hidden");
    if (btnLandingInstall) btnLandingInstall.classList.add("hidden");
    if (btnIosInstall) btnIosInstall.classList.add("hidden");
    return;
  }

  // 4. Platform Detection (iOS vs Android/Desktop)
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  // 5. Chromium / Android / Desktop Install Prompt Capture
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;

    // Ensure buttons and notification bar are visible if not dismissed
    const topBarDismissed = sessionStorage.getItem("coupleshear_topbar_dismissed");
    if (!topBarDismissed && topInstallBar) {
      topInstallBar.style.display = "block";
      topInstallBar.classList.remove("slide-up");
    }

    if (btnPwaInstall) {
      btnPwaInstall.classList.remove("hidden");
    }
    if (btnLandingInstall) {
      btnLandingInstall.classList.remove("hidden");
    }
  });

  // Function to hide all install UI after successful installation
  function hideAllInstallUI() {
    if (topInstallBar) {
      topInstallBar.classList.add("slide-up");
      setTimeout(() => {
        topInstallBar.style.display = "none";
      }, 350);
    }
    if (btnPwaInstall) btnPwaInstall.classList.add("hidden");
    if (btnLandingInstall) btnLandingInstall.classList.add("hidden");
    if (btnIosInstall) btnIosInstall.classList.add("hidden");
  }

  // Handler for triggering installation prompt or guided modal
  async function triggerAppInstall(e) {
    if (e && typeof e.stopPropagation === "function") {
      e.stopPropagation();
      e.preventDefault();
    }

    // A. Native Browser Prompt Available (Chromium, Edge, Android)
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        const choiceResult = await deferredInstallPrompt.userChoice;
        if (choiceResult && choiceResult.outcome === "accepted") {
          showToast("Couple's Hear installed! Launch it anytime from your home screen or desktop.", "success");
          hideAllInstallUI();
        }
      } catch (err) {
        console.warn("[PWA Engine] Install prompt exception:", err);
      } finally {
        deferredInstallPrompt = null;
      }
      return;
    }

    // B. iOS Safari Guided Flow
    if (isIOS) {
      const iosModal = document.getElementById("modal-ios-install");
      if (iosModal) {
        iosModal.classList.remove("hidden");
        document.body.style.overflow = "hidden";
      }
      return;
    }

    // C. Universal Browser Instructions Modal (Chrome/Edge desktop, Safari Mac, Android without active prompt, Firefox)
    const appModal = document.getElementById("modal-app-install");
    if (appModal) {
      appModal.classList.remove("hidden");
      document.body.style.overflow = "hidden";
    } else {
      showToast(
        "To install Couple's Hear on your device, tap your browser's menu (⋮ or Share) and select 'Install app' or 'Add to Home screen'.",
        "info",
        6000
      );
    }
  }

  // Bind clicking the notification bar card itself to install on device
  if (notificationCard) {
    notificationCard.addEventListener("click", (e) => {
      // If user clicked the close button inside the card, do not trigger install
      if (e.target.closest("#btn-dismiss-top-bar") || e.target.closest(".notification-dismiss-btn")) {
        return;
      }
      triggerAppInstall(e);
    });
  }

  // Bind all Top and in-app Install triggers
  if (btnTopBarInstall) {
    btnTopBarInstall.addEventListener("click", triggerAppInstall);
  }

  if (btnLandingInstall) {
    btnLandingInstall.addEventListener("click", triggerAppInstall);
  }

  if (btnPwaInstall) {
    btnPwaInstall.addEventListener("click", triggerAppInstall);
  }

  if (btnIosInstall) {
    btnIosInstall.addEventListener("click", triggerAppInstall);
  }

  if (btnDismissTopBar) {
    btnDismissTopBar.addEventListener("click", dismissInstallNotification);
  }

  // 6. App Installed Event
  window.addEventListener("appinstalled", () => {
    console.log("[PWA Engine] App installed successfully by user.");
    showToast("Couple's Hear was installed! Enjoy synchronized couple music.", "success");
    hideAllInstallUI();
  });

  // 7. Network Connectivity (Online / Offline)
  function handleNetworkChange() {
    if (!offlineIndicator) return;

    if (!navigator.onLine) {
      if (offlineText) {
        offlineText.textContent = "Offline Mode • Playing cached music & offline shell";
      }
      offlineIndicator.classList.remove("hidden");
    } else {
      if (offlineText) {
        offlineText.textContent = "Back online • Real-time sync restored";
      }
      setTimeout(() => {
        offlineIndicator.classList.add("hidden");
      }, 2500);
    }
  }

  window.addEventListener("online", handleNetworkChange);
  window.addEventListener("offline", handleNetworkChange);

  if (!navigator.onLine) {
    handleNetworkChange();
  }
}


