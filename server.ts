import express from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer } from "vite";

const publicDir = path.join(process.cwd(), "public");
const audioDir = path.join(publicDir, "audio");
const uploadsDir = path.join(publicDir, "uploads");

try {
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });
} catch (err) {
  console.warn("[Storage] Warning creating directories:", err);
}

interface PlaybackState {
  isPlaying: boolean;
  position: number;
  updatedAt: number;
}

interface MemberInfo {
  id: string;
  name: string;
  status: string;
}

interface RoomData {
  roomCode: string;
  hostId: string;
  hostName: string;
  partnerId?: string | null;
  partnerName?: string | null;
  createdAt: number;
  lastActiveAt: number;
  members: {
    host?: MemberInfo;
    partner?: MemberInfo | null;
  };
  playlist: any[];
  song: any;
  playback: PlaybackState;
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Health check endpoint for Cloud Run and container liveness probes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Direct audio and uploads static serving with byte range support for HTML5 <audio>
app.use("/audio", express.static(audioDir, { maxAge: "1d", acceptRanges: true }));
app.use("/uploads", express.static(uploadsDir, { maxAge: "1d", acceptRanges: true }));

// PWA Service Worker & Web App Manifest routes (must have custom headers)
app.get("/sw.js", (req, res) => {
  const swPath = path.join(publicDir, "sw.js");
  if (fs.existsSync(swPath)) {
    res.setHeader("Service-Worker-Allowed", "/");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.type("application/javascript").sendFile(swPath);
  } else {
    res.status(404).send("Not found");
  }
});

app.get("/manifest.json", (req, res) => {
  const manifestPath = path.join(publicDir, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    res.type("application/manifest+json").sendFile(manifestPath);
  } else {
    res.status(404).send("Not found");
  }
});

app.get("/ads.txt", (req, res) => {
  const adsPath = path.join(publicDir, "ads.txt");
  const rootAdsPath = path.join(process.cwd(), "ads.txt");
  const targetPath = fs.existsSync(adsPath) ? adsPath : rootAdsPath;
  if (fs.existsSync(targetPath)) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(targetPath);
  } else {
    res.status(404).send("Not found");
  }
});

app.get("/robots.txt", (req, res) => {
  const robotsPath = path.join(publicDir, "robots.txt");
  if (fs.existsSync(robotsPath)) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.sendFile(robotsPath);
  } else {
    res.status(404).send("Not found");
  }
});

app.use(express.static(publicDir));

app.use(express.json({ limit: "25mb" }));

// In-memory room store & active SSE client subscribers
const rooms = new Map<string, RoomData>();
const subscribers = new Map<string, Set<express.Response>>();
const roomsFilePath = path.join(process.cwd(), "rooms_store.json");

function loadStoredRooms() {
  try {
    if (fs.existsSync(roomsFilePath)) {
      const data = fs.readFileSync(roomsFilePath, "utf-8");
      const obj = JSON.parse(data);
      for (const [k, v] of Object.entries(obj)) {
        rooms.set(k, v as RoomData);
      }
      console.log(`[Store] Loaded ${rooms.size} persistent rooms from disk.`);
    }
  } catch (err) {
    console.warn("[Store] Error loading rooms from disk:", err);
  }
}

function persistRooms() {
  try {
    const obj: Record<string, RoomData> = {};
    for (const [k, v] of rooms.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(roomsFilePath, JSON.stringify(obj, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Store] Error persisting rooms to disk:", err);
  }
}

// Load existing rooms on module initialization
loadStoredRooms();

function getOrCreateSubscribers(roomCode: string): Set<express.Response> {
  const code = roomCode.toUpperCase();
  let set = subscribers.get(code);
  if (!set) {
    set = new Set();
    subscribers.set(code, set);
  }
  return set;
}

function broadcastToRoom(roomCode: string, payload: any, excludeRes?: express.Response) {
  const code = roomCode.toUpperCase();
  const roomSubs = subscribers.get(code);
  if (!roomSubs) return;

  const dataStr = `data: ${JSON.stringify(payload)}\n\n`;
  for (const clientRes of roomSubs) {
    if (clientRes !== excludeRes) {
      try {
        clientRes.write(dataStr);
      } catch (err) {
        roomSubs.delete(clientRes);
      }
    }
  }
}

// ---------------- API ROUTES ----------------

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", activeRooms: rooms.size });
});

// SEO Routes
app.get("/robots.txt", (req, res) => {
  const robotsPath = path.join(publicDir, "robots.txt");
  if (fs.existsSync(robotsPath)) {
    res.type("text/plain").sendFile(robotsPath);
  } else {
    res.type("text/plain").send("User-agent: *\nAllow: /\nDisallow: /api/\n");
  }
});

app.get("/sitemap.xml", (req, res) => {
  const sitemapPath = path.join(publicDir, "sitemap.xml");
  if (fs.existsSync(sitemapPath)) {
    res.type("application/xml").sendFile(sitemapPath);
  } else {
    res.status(404).send("Not found");
  }
});

// Contact & Feedback API Endpoint
app.post("/api/contact", (req, res) => {
  const { name, email, category, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: "Name, email, and message are required." });
  }

  console.log(`[Contact Form Received] From: ${name} <${email}> [${category}]: ${message}`);
  
  // Persist contact message log
  try {
    const contactLogPath = path.join(process.cwd(), "contact_inquiries.json");
    let logs: any[] = [];
    if (fs.existsSync(contactLogPath)) {
      logs = JSON.parse(fs.readFileSync(contactLogPath, "utf-8"));
    }
    logs.push({
      id: "msg_" + Date.now(),
      name,
      email,
      category: category || "General Inquiry",
      message,
      timestamp: Date.now(),
      date: new Date().toISOString()
    });
    fs.writeFileSync(contactLogPath, JSON.stringify(logs, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Contact Log Note]", err);
  }

  res.json({
    success: true,
    message: "Thank you for contacting Couple's Hear! We have received your message and will respond within 24-48 business hours."
  });
});

// Create Room
app.post("/api/rooms", (req, res) => {
  const roomData = req.body as RoomData;
  if (!roomData || !roomData.roomCode) {
    return res.status(400).json({ error: "Invalid room payload: roomCode is required" });
  }

  const code = roomData.roomCode.toUpperCase();
  roomData.roomCode = code;
  roomData.createdAt = roomData.createdAt || Date.now();
  roomData.lastActiveAt = Date.now();

  rooms.set(code, roomData);
  persistRooms();
  console.log(`[Room Created] Room ${code} created by ${roomData.hostName}`);

  return res.json({ success: true, room: roomData });
});

// Get Room
app.get("/api/rooms/:code", (req, res) => {
  const code = req.params.code.toUpperCase();
  let room = rooms.get(code);
  if (!room) {
    loadStoredRooms();
    room = rooms.get(code);
  }

  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  return res.json({ success: true, room });
});

// Join Room (Partner or Rejoining Host)
app.post("/api/rooms/:code/join", (req, res) => {
  const code = req.params.code.toUpperCase();
  const { partnerId, partnerName } = req.body;
  let room = rooms.get(code);

  if (!room) {
    loadStoredRooms();
    room = rooms.get(code);
  }

  if (!room) {
    return res.status(404).json({ error: "Room not found. Please verify the 6-character room code." });
  }

  // If host is rejoining
  if (room.hostId === partnerId || (room.hostName && room.hostName.toLowerCase() === (partnerName || "").toLowerCase())) {
    if (room.members?.host) {
      room.members.host.status = "Connected";
    }
    rooms.set(code, room);
    persistRooms();
    return res.json({ success: true, room, isHost: true });
  }

  // Partner joins
  room.partnerId = partnerId;
  room.partnerName = partnerName || "Partner";
  room.lastActiveAt = Date.now();

  if (!room.members) {
    room.members = {};
  }
  room.members.partner = {
    id: partnerId,
    name: partnerName || "Partner",
    status: "Connected"
  };

  rooms.set(code, room);
  persistRooms();

  // Broadcast to all connected clients in the room
  broadcastToRoom(code, {
    type: "PARTNER_JOINED",
    roomCode: code,
    room,
    senderId: partnerId
  });

  console.log(`[Partner Joined] Partner ${partnerName} joined room ${code}`);
  return res.json({ success: true, room, isHost: false });
});

// Real-Time Server-Sent Events (SSE) Stream
app.get("/api/rooms/:code/events", (req, res) => {
  const code = req.params.code.toUpperCase();
  const userId = (req.query.userId as string) || "anonymous";
  const room = rooms.get(code);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const roomSubs = getOrCreateSubscribers(code);
  roomSubs.add(res);

  // Send initial room state if available
  if (room) {
    res.write(`data: ${JSON.stringify({ type: "INIT", roomCode: code, room })}\n\n`);
  }

  // Heartbeat interval to keep connection alive through cloud proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    roomSubs.delete(res);
  });
});

// Update Playback State (Playing/Paused/Position)
app.post("/api/rooms/:code/playback", (req, res) => {
  const code = req.params.code.toUpperCase();
  const { isPlaying, position, updatedAt, senderId } = req.body;
  const room = rooms.get(code);

  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const pb: PlaybackState = {
    isPlaying: Boolean(isPlaying),
    position: Number(position) || 0,
    updatedAt: updatedAt || Date.now()
  };

  room.playback = pb;
  room.lastActiveAt = Date.now();
  rooms.set(code, room);
  persistRooms();

  broadcastToRoom(code, {
    type: "PLAYBACK_UPDATE",
    roomCode: code,
    playback: pb,
    senderId
  });

  return res.json({ success: true });
});

// Update Song
app.post("/api/rooms/:code/song", (req, res) => {
  const code = req.params.code.toUpperCase();
  const { song, playback, senderId } = req.body;
  const room = rooms.get(code);

  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  if (song) room.song = song;
  if (playback) room.playback = playback;
  room.lastActiveAt = Date.now();
  rooms.set(code, room);
  persistRooms();

  broadcastToRoom(code, {
    type: "SONG_UPDATE",
    roomCode: code,
    song: room.song,
    playback: room.playback,
    senderId
  });

  return res.json({ success: true });
});

// Update Playlist
app.post("/api/rooms/:code/playlist", (req, res) => {
  const code = req.params.code.toUpperCase();
  const { playlist, song, playback, senderId } = req.body;
  const room = rooms.get(code);

  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  if (playlist) room.playlist = playlist;
  if (song) room.song = song;
  if (playback) {
    room.playback = playback;
  } else if (song) {
    room.playback = {
      isPlaying: true,
      position: 0,
      updatedAt: Date.now()
    };
  }
  room.lastActiveAt = Date.now();
  rooms.set(code, room);
  persistRooms();

  broadcastToRoom(code, {
    type: "PLAYLIST_UPDATE",
    roomCode: code,
    playlist: room.playlist,
    song: room.song,
    playback: room.playback,
    senderId
  });

  return res.json({ success: true });
});

// Member Status Update (Connected / Disconnected / Left)
app.post("/api/rooms/:code/member", (req, res) => {
  const code = req.params.code.toUpperCase();
  const { role, status, senderId } = req.body;
  const room = rooms.get(code);

  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  if (role === "host" && room.members?.host) {
    room.members.host.status = status;
  } else if (role === "partner" && room.members?.partner) {
    room.members.partner.status = status;
    if (status === "Disconnected" || status === "Left") {
      room.partnerId = null;
      room.partnerName = null;
      room.members.partner = null;
    }
  }
  rooms.set(code, room);
  persistRooms();

  broadcastToRoom(code, {
    type: "MEMBER_STATUS",
    roomCode: code,
    role,
    status,
    room,
    senderId
  });

  return res.json({ success: true });
});

// Audio Upload Endpoint
app.post("/api/upload", (req, res) => {
  const rawHeader = req.headers["x-filename"];
  let originalName = "uploaded_track.mp3";
  if (typeof rawHeader === "string") {
    try {
      originalName = decodeURIComponent(rawHeader);
    } catch {
      originalName = rawHeader;
    }
  }
  const ext = path.extname(originalName) || ".mp3";
  const cleanBase = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
  const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${cleanBase}${ext}`;
  const targetPath = path.join(uploadsDir, uniqueName);

  const writeStream = fs.createWriteStream(targetPath);
  req.pipe(writeStream);

  writeStream.on("finish", () => {
    console.log(`[Upload] File saved: ${uniqueName}`);
    return res.json({ success: true, url: `/uploads/${uniqueName}` });
  });

  writeStream.on("error", (err) => {
    console.error("[Upload Error] Failed to write file:", err);
    return res.status(500).json({ error: "Failed to save audio file" });
  });
});

// ---------------- VITE & STATIC SERVING ----------------

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Couple's Hear Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
