'use client'
// src/app/login/page.tsx
import { useState } from 'react'

export default function LoginPage() {
  const [em,  setEm]  = useState('')
  const [pw,  setPw]  = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!em || !pw) { setErr('Please enter your email and password.'); return }
    setLoading(true); setErr('')
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, password: pw }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Login failed.'); setLoading(false); return }
      window.location.href = data.redirect || '/dashboard'
    } catch {
      setErr('Network error. Please try again.')
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Sign In — EduWays</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <style>{`
          *{margin:0;padding:0;box-sizing:border-box}
          body{font-family:'Inter',sans-serif;background:#F8F9FB;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;}
          .card{background:#fff;border:1px solid #E2E6ED;border-radius:20px;padding:2.75rem;width:100%;max-width:420px;box-shadow:0 8px 32px rgba(27,42,74,.13);}
          .logo{font-family:'Plus Jakarta Sans',sans-serif;font-size:1.4rem;font-weight:800;color:#1B2A4A;margin-bottom:.4rem;}
          .logo span{color:#C8922A;}
          h2{font-family:'Plus Jakarta Sans',sans-serif;font-size:1.5rem;font-weight:800;color:#1B2A4A;margin-bottom:.35rem;}
          p.sub{color:#7A8799;font-size:.9rem;margin-bottom:1.75rem;}
          .fg{display:flex;flex-direction:column;gap:.4rem;margin-bottom:1rem;}
          label{font-size:.82rem;font-weight:600;color:#445066;}
          input{padding:.7rem 1rem;border:1.5px solid #E2E6ED;border-radius:8px;font-size:.9rem;font-family:'Inter',sans-serif;color:#1B2A4A;outline:none;width:100%;}
          input:focus{border-color:#1B2A4A;box-shadow:0 0 0 3px rgba(27,42,74,.08);}
          .btn{width:100%;padding:.9rem;background:#1B2A4A;color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;margin-top:.5rem;}
          .btn:hover{background:#243660;}
          .btn:disabled{opacity:.6;cursor:not-allowed;}
          .error{background:#FDECEA;border:1px solid #C0392B;border-radius:8px;padding:.75rem 1rem;font-size:.85rem;color:#C0392B;margin-bottom:1rem;}
          .footer-link{text-align:center;margin-top:1.25rem;font-size:.82rem;color:#7A8799;}
          .footer-link a{color:#C8922A;font-weight:600;text-decoration:none;}
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="logo">Edu<span>Ways</span></div>
          <h2>Welcome back</h2>
          <p className="sub">Sign in to view your saved pathways and academic plan.</p>
          {err && <div className="error">{err}</div>}
          <div className="fg">
            <label>Email Address</label>
            <input
              type="email" placeholder="maria@gmail.com"
              value={em} onChange={e => setEm(e.target.value)} onKeyDown={handleKey}
            />
          </div>
          <div className="fg">
            <label>Password</label>
            <input
              type="password" placeholder="Your password"
              value={pw} onChange={e => setPw(e.target.value)} onKeyDown={handleKey}
            />
          </div>
          <button className="btn" onClick={handleLogin} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
          <div className="footer-link">
            Don&apos;t have an account? <a href="/">Create one free →</a>
          </div>
        </div>
      </body>
    </html>
  )
}
