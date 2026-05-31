# EduWays — Complete Unified App

This is the full EduWays application — frontend landing page + backend API — in one Next.js project.

## How it's structured

```
eduways-app/
├── .env.local                    ← All your API keys (already filled in)
├── package.json                  ← Dependencies
├── next.config.js
├── migrations/
│   └── 0002_user_accounts.sql   ← Run this in Neon SQL Editor FIRST
├── public/
│   └── landing.html             ← Your full EduWays landing page
└── src/
    ├── app/
    │   ├── page.tsx             ← Homepage (serves landing.html)
    │   ├── dashboard/page.tsx   ← Results page after sign-up
    │   ├── login/page.tsx       ← Sign in page
    │   └── api/
    │       ├── register/        ← POST /api/register
    │       ├── auth/login/      ← POST /api/auth/login
    │       ├── auth/logout/     ← POST /api/auth/logout
    │       └── profile/         ← GET /api/profile
    └── lib/
        ├── auth/                ← Password hashing + sessions
        ├── db/                  ← Database connection + schema
        ├── email/               ← Resend email service
        └── pathways/            ← Tuition pricing engine
```

## How it all connects

```
User visits eduways.com
        ↓
  Homepage loads (landing.html from /public)
        ↓
  User fills out 4-step form + clicks "Build My Plan"
        ↓
  Form calls POST /api/register (Next.js handles it)
        ↓
  ✅ Account created in Neon database
  ✅ Pathways generated (residency-adjusted costs)
  ✅ Welcome email sent via Resend
  ✅ Session cookie set (auto login)
        ↓
  Redirect to /dashboard
        ↓
  Dashboard reads pathways from database
  Shows all 3 paths with institution links
```

## Deployment Steps

### Step 1 — Run the database migration
Go to console.neon.tech → SQL Editor → paste migrations/0002_user_accounts.sql → Run

### Step 2 — Push to GitHub
1. Create a new repo at github.com
2. Upload the entire eduways-app folder

### Step 3 — Deploy to Vercel
1. Go to vercel.com → "Add New Project"
2. Import your GitHub repo
3. Vercel detects Next.js automatically
4. Go to Settings → Environment Variables and add:
   - DATABASE_URL
   - RESEND_API_KEY
   - FROM_EMAIL
   - ONET_USERNAME
   - ONET_PASSWORD
   - BLS_API_KEY
   - NEXTAUTH_SECRET
   (All values are in your .env.local file)
5. Click Deploy — done!

Your site will be live at: https://eduways-app.vercel.app
