const express = require("express");
const path = require("path");
const fs = require("fs-extra");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, "users.json");
const JOBS_FILE = path.join(__dirname, "jobs.json");
const UPLOADS_DIR = path.join(__dirname, "public", "uploads");
const JWT_SECRET = "jobtracker-secret-key-123";

// Configure Multer for resume uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOADS_DIR));

// Persistence helpers
const getUsers = async () => {
  try { return await fs.readJson(USERS_FILE); } catch (err) { return []; }
};

const saveUsers = async (users) => {
  await fs.writeJson(USERS_FILE, users, { spaces: 2 });
};

const getJobsData = async () => {
  try { return await fs.readJson(JOBS_FILE); } catch (err) { return {}; }
};

const saveJobsData = async (data) => {
  await fs.writeJson(JOBS_FILE, data, { spaces: 2 });
};

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Auth API
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const users = await getUsers();
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: "User already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = { id: Date.now(), username, passwordHash };
    users.push(newUser);
    await saveUsers(users);

    const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ message: "User created", token, username: newUser.username });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const users = await getUsers();
    const user = users.find(u => u.username === username);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ message: "Login successful", token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Jobs API
app.post("/api/upload", authenticateToken, upload.single("resume"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  res.json({ 
    url: `/uploads/${req.file.filename}`,
    originalName: req.file.originalname
  });
});

app.get("/api/jobs", authenticateToken, async (req, res) => {
  try {
    const jobsData = await getJobsData();
    const userJobs = jobsData[req.user.username] || [];
    res.json(userJobs);
  } catch (err) {
    res.status(500).json({ error: "Could not fetch jobs" });
  }
});

app.post("/api/jobs", authenticateToken, async (req, res) => {
  try {
    const jobsData = await getJobsData();
    jobsData[req.user.username] = req.body; // Expects an array of jobs
    await saveJobsData(jobsData);
    res.json({ message: "Jobs saved" });
  } catch (err) {
    res.status(500).json({ error: "Could not save jobs" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`JobTracker running on port ${PORT}`);
});
