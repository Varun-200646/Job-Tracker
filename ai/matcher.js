/**
 * AI Job Matcher Module
 * Uses TF-IDF vectorization + cosine similarity for resume ↔ job matching.
 * Runs locally — no external API or keys required.
 */

// ── Skill Dictionary ────────────────────────────────────────────────
const SKILL_CATEGORIES = {
  languages: [
    "javascript", "typescript", "python", "java", "c++", "c#", "c",
    "go", "golang", "rust", "ruby", "php", "swift", "kotlin", "scala",
    "r", "matlab", "perl", "dart", "lua", "haskell", "elixir"
  ],
  frontend: [
    "react", "reactjs", "react.js", "angular", "angularjs", "vue", "vuejs",
    "vue.js", "svelte", "nextjs", "next.js", "nuxt", "nuxtjs", "gatsby",
    "html", "html5", "css", "css3", "sass", "scss", "less", "tailwind",
    "tailwindcss", "bootstrap", "material ui", "chakra ui", "styled components",
    "webpack", "vite", "babel", "jquery", "redux", "mobx", "zustand"
  ],
  backend: [
    "node", "nodejs", "node.js", "express", "expressjs", "fastify", "nestjs",
    "django", "flask", "fastapi", "spring", "spring boot", "rails",
    "ruby on rails", "laravel", "asp.net", ".net", "graphql", "rest",
    "restful", "api", "microservices", "grpc"
  ],
  databases: [
    "sql", "mysql", "postgresql", "postgres", "mongodb", "mongo", "redis",
    "elasticsearch", "dynamodb", "cassandra", "sqlite", "oracle", "firebase",
    "firestore", "supabase", "prisma", "mongoose", "sequelize"
  ],
  devops: [
    "docker", "kubernetes", "k8s", "aws", "azure", "gcp", "google cloud",
    "ci/cd", "jenkins", "github actions", "gitlab ci", "terraform",
    "ansible", "nginx", "apache", "linux", "unix", "bash", "shell",
    "devops", "cloud", "heroku", "vercel", "netlify", "render"
  ],
  data: [
    "machine learning", "deep learning", "ai", "artificial intelligence",
    "data science", "data analysis", "data engineering", "pandas", "numpy",
    "scikit-learn", "tensorflow", "pytorch", "keras", "nlp",
    "natural language processing", "computer vision", "opencv", "tableau",
    "power bi", "spark", "hadoop", "etl", "data pipeline"
  ],
  tools: [
    "git", "github", "gitlab", "bitbucket", "jira", "confluence", "slack",
    "figma", "sketch", "adobe xd", "postman", "swagger", "vscode",
    "intellij", "agile", "scrum", "kanban"
  ],
  mobile: [
    "react native", "flutter", "ios", "android", "swift", "kotlin",
    "xamarin", "ionic", "cordova", "expo"
  ],
  testing: [
    "jest", "mocha", "chai", "cypress", "selenium", "playwright",
    "testing library", "enzyme", "junit", "pytest", "tdd", "bdd",
    "unit testing", "integration testing", "e2e testing"
  ]
};

// Flatten all skills into a single list
const ALL_SKILLS = Object.values(SKILL_CATEGORIES).flat();

// ── Resume Parser ───────────────────────────────────────────────────

/**
 * Parse raw resume text into structured data.
 * @param {string} text - Raw text extracted from the PDF resume
 * @returns {{ skills: string[], experience: string[], education: string[], rawText: string }}
 */
function parseResume(text) {
  const lower = text.toLowerCase();
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  // 1. Extract skills — match against dictionary
  const foundSkills = new Set();
  for (const skill of ALL_SKILLS) {
    // Word-boundary matching to avoid partial matches
    const regex = new RegExp(`\\b${escapeRegex(skill)}\\b`, "i");
    if (regex.test(lower)) {
      foundSkills.add(skill);
    }
  }

  // 2. Extract experience sections
  const experience = extractSection(lines, [
    "experience", "work experience", "professional experience",
    "employment", "work history", "projects"
  ]);

  // 3. Extract education sections
  const education = extractSection(lines, [
    "education", "academic", "qualification", "degree", "university", "college"
  ]);

  return {
    skills: [...foundSkills].sort(),
    experience,
    education,
    rawText: text.substring(0, 5000) // cap stored raw text
  };
}

/**
 * Extract lines belonging to a section based on heading keywords.
 */
function extractSection(lines, headingKeywords) {
  const results = [];
  let capturing = false;
  let capturedCount = 0;

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Check if this line is a section heading
    const isHeading = headingKeywords.some(k => lower.includes(k)) &&
                      line.length < 80;

    if (isHeading) {
      capturing = true;
      capturedCount = 0;
      continue;
    }

    // Stop capturing if we hit another section heading (all-caps or short bold-like lines)
    if (capturing && capturedCount > 0 && line.length < 40 &&
        /^[A-Z\s&]+$/.test(line) && line.length > 3) {
      capturing = false;
      continue;
    }

    if (capturing && capturedCount < 8) {
      if (line.length > 5) {
        results.push(line);
        capturedCount++;
      }
    }
  }

  return results;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


// ── TF-IDF Matching Engine ──────────────────────────────────────────

/**
 * Tokenize text into normalized word tokens.
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9#+.\-/]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/**
 * Build a term-frequency map from tokens.
 */
function termFrequency(tokens) {
  const tf = {};
  for (const t of tokens) {
    tf[t] = (tf[t] || 0) + 1;
  }
  // Normalize by total token count
  const total = tokens.length || 1;
  for (const key in tf) {
    tf[key] /= total;
  }
  return tf;
}

/**
 * Compute cosine similarity between two TF vectors.
 */
function cosineSimilarity(tfA, tfB) {
  const allTerms = new Set([...Object.keys(tfA), ...Object.keys(tfB)]);
  let dot = 0, magA = 0, magB = 0;

  for (const term of allTerms) {
    const a = tfA[term] || 0;
    const b = tfB[term] || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Compute match score between stored resume data and a job description.
 * @param {{ skills: string[], experience: string[], education: string[], rawText: string }} resumeData
 * @param {string} jobDescription
 * @returns {{ score: number, missingSkills: string[], matchedSkills: string[], recommendation: string }}
 */
function computeMatch(resumeData, jobDescription) {
  if (!resumeData || !jobDescription) {
    return { score: 0, missingSkills: [], matchedSkills: [], recommendation: "No data available" };
  }

  const jdLower = jobDescription.toLowerCase();

  // 1. Skill-based matching (40% weight)
  const jobSkills = new Set();
  for (const skill of ALL_SKILLS) {
    const regex = new RegExp(`\\b${escapeRegex(skill)}\\b`, "i");
    if (regex.test(jdLower)) {
      jobSkills.add(skill);
    }
  }

  const resumeSkillSet = new Set(resumeData.skills.map(s => s.toLowerCase()));
  const matchedSkills = [];
  const missingSkills = [];

  for (const skill of jobSkills) {
    if (resumeSkillSet.has(skill)) {
      matchedSkills.push(skill);
    } else {
      missingSkills.push(skill);
    }
  }

  const skillScore = jobSkills.size > 0
    ? (matchedSkills.length / jobSkills.size)
    : 0.5; // If no specific skills detected, give neutral score

  // 2. Text similarity via TF-IDF (40% weight)
  const resumeText = [
    resumeData.rawText || "",
    resumeData.skills.join(" "),
    resumeData.experience.join(" "),
    resumeData.education.join(" ")
  ].join(" ");

  const resumeTokens = tokenize(resumeText);
  const jobTokens = tokenize(jobDescription);

  const tfResume = termFrequency(resumeTokens);
  const tfJob = termFrequency(jobTokens);
  const textSimilarity = cosineSimilarity(tfResume, tfJob);

  // 3. Experience keyword overlap (20% weight)
  const experienceText = resumeData.experience.join(" ").toLowerCase();
  const jobKeywords = jobTokens.filter(t => t.length > 3);
  const uniqueJobKeywords = [...new Set(jobKeywords)];
  const expOverlap = uniqueJobKeywords.length > 0
    ? uniqueJobKeywords.filter(k => experienceText.includes(k)).length / uniqueJobKeywords.length
    : 0;

  // Weighted final score
  const rawScore = (skillScore * 0.4) + (textSimilarity * 0.4) + (expOverlap * 0.2);
  const score = Math.min(Math.round(rawScore * 100), 100);

  // Recommendation
  let recommendation;
  if (score >= 70) {
    recommendation = "Strong Match ✅ — You're a great fit for this role!";
  } else if (score >= 45) {
    recommendation = "Moderate Match ⚠️ — Consider upskilling in missing areas.";
  } else {
    recommendation = "Weak Match ❌ — Significant skill gaps detected.";
  }

  return {
    score,
    matchedSkills,
    missingSkills,
    recommendation
  };
}

module.exports = { parseResume, computeMatch };
