require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs-extra");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { PDFParse } = require("pdf-parse");
const { parseResume, computeMatch } = require("./ai/matcher");

const app = express();
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, "users.json");
const JOBS_FILE = path.join(__dirname, "jobs.json");
const RESUMES_FILE = path.join(__dirname, "resumes.json");
const VAULT_FILE = path.join(__dirname, "vault.json");
const UPLOADS_DIR = path.join(__dirname, "public", "uploads");
const JWT_SECRET = "jobtracker-secret-key-123";

// Ensure uploads directory exists
fs.ensureDirSync(UPLOADS_DIR);

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer for resume uploads
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'jobtracker-resumes',
    resource_type: 'raw',
    allowed_formats: ['pdf', 'doc', 'docx']
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

const getResumesData = async () => {
  try { return await fs.readJson(RESUMES_FILE); } catch (err) { return {}; }
};

const saveResumesData = async (data) => {
  await fs.writeJson(RESUMES_FILE, data, { spaces: 2 });
};

const getVaultData = async () => {
  try { return await fs.readJson(VAULT_FILE); } catch (err) { return {}; }
};

const saveVaultData = async (data) => {
  await fs.writeJson(VAULT_FILE, data, { spaces: 2 });
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
    url: req.file.path,
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

// ── AI Resume Upload ────────────────────────────────────────────
app.post("/api/upload-resume", authenticateToken, upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Only accept PDFs
    if (!req.file.originalname.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ error: "Only PDF files are supported for AI parsing" });
    }

    // Read the uploaded file and extract text
    const response = await fetch(req.file.path);
    const arrayBuffer = await response.arrayBuffer();
    const dataBuffer = Buffer.from(arrayBuffer);
    const parser = new PDFParse({ verbosity: 0 });
    await parser.load(dataBuffer);
    const rawText = await parser.getText();

    if (!rawText || rawText.trim().length < 20) {
      return res.status(400).json({ error: "Could not extract enough text from this PDF. Try a different resume." });
    }

    // Parse resume into structured data
    const parsed = parseResume(rawText);
    parsed.uploadedAt = new Date().toISOString();
    parsed.fileName = req.file.originalname;

    // Store per user
    const resumes = await getResumesData();
    resumes[req.user.username] = parsed;
    await saveResumesData(resumes);

    res.json({
      message: "Resume parsed successfully",
      data: {
        skills: parsed.skills,
        experience: parsed.experience,
        education: parsed.education,
        fileName: parsed.fileName,
        uploadedAt: parsed.uploadedAt
      }
    });
  } catch (err) {
    console.error("Resume upload error:", err);
    res.status(500).json({ error: "Failed to parse resume" });
  }
});

// ── AI Job Matching ─────────────────────────────────────────────
app.post("/api/match-job", authenticateToken, async (req, res) => {
  try {
    const { jobDescription } = req.body;
    if (!jobDescription || jobDescription.trim().length < 10) {
      return res.status(400).json({ error: "Job description is too short" });
    }

    // Load user's resume
    const resumes = await getResumesData();
    const userResume = resumes[req.user.username];

    if (!userResume) {
      return res.status(404).json({ error: "No resume uploaded yet. Please upload your resume first." });
    }

    // Run AI match
    const result = computeMatch(userResume, jobDescription);
    res.json(result);
  } catch (err) {
    console.error("Match error:", err);
    res.status(500).json({ error: "Failed to compute match" });
  }
});

// ── Get stored resume data ──────────────────────────────────────
app.get("/api/resume", authenticateToken, async (req, res) => {
  try {
    const resumes = await getResumesData();
    const userResume = resumes[req.user.username];
    if (!userResume) {
      return res.json({ hasResume: false });
    }
    res.json({
      hasResume: true,
      data: {
        skills: userResume.skills,
        experience: userResume.experience,
        education: userResume.education,
        fileName: userResume.fileName,
        uploadedAt: userResume.uploadedAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load resume data" });
  }
});

// ── Resume Vault API ─────────────────────────────────────────────

// Upload a resume to the vault
app.post("/api/vault/upload", authenticateToken, upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { label, jobDescription, tags } = req.body;
    const resumeEntry = {
      id: Date.now() + "-" + Math.round(Math.random() * 1e9),
      fileName: req.file.filename,
      originalName: req.file.originalname,
      label: label || req.file.originalname,
      jobDescription: jobDescription || "",
      tags: tags ? JSON.parse(tags) : [],
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
      url: req.file.path,
      cloudinaryId: req.file.filename
    };

    const vault = await getVaultData();
    if (!vault[req.user.username]) vault[req.user.username] = [];
    vault[req.user.username].unshift(resumeEntry);
    await saveVaultData(vault);

    res.status(201).json({ message: "Resume uploaded", resume: resumeEntry });
  } catch (err) {
    console.error("Vault upload error:", err);
    res.status(500).json({ error: "Failed to upload resume" });
  }
});

// List all resumes in the vault
app.get("/api/vault", authenticateToken, async (req, res) => {
  try {
    const vault = await getVaultData();
    const userResumes = vault[req.user.username] || [];
    res.json(userResumes);
  } catch (err) {
    res.status(500).json({ error: "Failed to load vault" });
  }
});

// Download a specific resume
app.get("/api/vault/:id/download", authenticateToken, async (req, res) => {
  try {
    const vault = await getVaultData();
    const userResumes = vault[req.user.username] || [];
    const resume = userResumes.find(r => r.id === req.params.id);

    if (!resume) {
      return res.status(404).json({ error: "Resume not found" });
    }

    if (resume.url) {
      return res.redirect(resume.url);
    } else {
      const filePath = path.join(UPLOADS_DIR, resume.fileName);
      if (!await fs.pathExists(filePath)) {
        return res.status(404).json({ error: "File no longer exists on server" });
      }
      return res.download(filePath, resume.originalName);
    }
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ error: "Failed to download resume" });
  }
});

// Delete a resume from the vault
app.delete("/api/vault/:id", authenticateToken, async (req, res) => {
  try {
    const vault = await getVaultData();
    const userResumes = vault[req.user.username] || [];
    const resumeIndex = userResumes.findIndex(r => r.id === req.params.id);

    if (resumeIndex === -1) {
      return res.status(404).json({ error: "Resume not found" });
    }

    const resume = userResumes[resumeIndex];

    // Delete the file from Cloudinary or disk
    if (resume.cloudinaryId) {
      await cloudinary.uploader.destroy(resume.cloudinaryId, { resource_type: 'raw' });
    } else {
      const filePath = path.join(UPLOADS_DIR, resume.fileName);
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }
    }

    userResumes.splice(resumeIndex, 1);
    vault[req.user.username] = userResumes;
    await saveVaultData(vault);

    res.json({ message: "Resume deleted" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete resume" });
  }
});

// Update resume metadata (label, tags)
app.patch("/api/vault/:id", authenticateToken, async (req, res) => {
  try {
    const vault = await getVaultData();
    const userResumes = vault[req.user.username] || [];
    const resume = userResumes.find(r => r.id === req.params.id);

    if (!resume) {
      return res.status(404).json({ error: "Resume not found" });
    }

    if (req.body.label) resume.label = req.body.label;
    if (req.body.tags) resume.tags = req.body.tags;
    if (req.body.jobDescription !== undefined) resume.jobDescription = req.body.jobDescription;

    await saveVaultData(vault);
    res.json({ message: "Resume updated", resume });
  } catch (err) {
    res.status(500).json({ error: "Failed to update resume" });
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
