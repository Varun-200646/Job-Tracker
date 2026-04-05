# JobTracker — Job Application Manager

> A full-featured job application tracker built as a college mini project, deployed on Render.

## 🚀 Features

- **Kanban Board** — visualise applications across Applied → Interview → Offer → Rejected
- **Add / Edit / Delete** — full CRUD for job applications
- **Analytics Dashboard** — donut chart, bar chart, monthly timeline
- **Live Search** — filter by role, company or location instantly
- **Status Change** — move cards between columns directly on the board
- **Dark / Light Mode** — persists across sessions
- **Responsive** — works on mobile, tablet and desktop

## 🛠 Tech Stack

| Layer      | Technology          |
|------------|---------------------|
| Backend    | Node.js + Express   |
| Frontend   | Vanilla HTML/CSS/JS |
| Storage    | localStorage        |
| Deployment | Render (free tier)  |

## 💻 Run Locally

```bash
npm install
npm start
```
Open → http://localhost:3000

## ☁️ Deploy on Render

1. Push this repo to GitHub
2. Go to render.com → New → Web Service
3. Connect your repo and set:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
4. Click Create Web Service

## 📁 Project Structure

```
jobtracker/
├── server.js           # Express server
├── package.json        # Dependencies & scripts
├── .gitignore
├── README.md
└── public/
    ├── index.html      # Main SPA
    ├── css/style.css   # All styles
    └── js/app.js       # All logic
```

## 📊 College Project Details

- **Project Name:** Job Application Tracker
- **Cloud Platform:** Render
- **Architecture:** Client-Server (Node.js backend + SPA frontend)
- **Key Concepts Demonstrated:** REST API, Static file serving, SPA routing, Cloud deployment, Responsive design
