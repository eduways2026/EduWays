// src/app/dashboard/page.tsx
// Protected page — redirects to /login if not authenticated
// Shows the user's saved pathways after registration

import { getAuthUser }  from '@/lib/auth'
import { redirect }      from 'next/navigation'
import { db }            from '@/lib/db'
import { studentProfiles, savedPathways } from '@/lib/db/schema'
import { eq, asc }       from 'drizzle-orm'

export default async function DashboardPage() {
  // Auth check
  const user = await getAuthUser().catch(() => null)
  if (!user) redirect('/login')

  // Load profile + pathways
  const [profile] = await db.select().from(studentProfiles)
    .where(eq(studentProfiles.user_id, user.id)).limit(1)

  const pathways = profile
    ? await db.select().from(savedPathways)
        .where(eq(savedPathways.user_id, user.id))
        .orderBy(asc(savedPathways.pathway_rank))
    : []

  const fmt = (cents: number) =>
    new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(cents / 100)

  const residencyLabel: Record<string, string> = {
    in_state: 'In-State', out_of_state: 'Out-of-State', international: 'International'
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>My Dashboard — EduWays</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <style>{`
          *{margin:0;padding:0;box-sizing:border-box}
          :root{
            --navy:#1B2A4A;--navy-light:#EEF1F8;--gold:#C8922A;--gold-light:#FDF3E3;
            --sage:#4A7C6F;--sage-light:#EAF2F0;--gray-200:#E2E6ED;--gray-500:#7A8799;
            --gray-700:#445066;--off-white:#F8F9FB;--white:#FFFFFF;
            --shadow:0 4px 16px rgba(27,42,74,.10);--shadow-lg:0 8px 32px rgba(27,42,74,.13);
            --radius:14px;--radius-sm:8px;
          }
          body{font-family:'Inter',sans-serif;background:var(--off-white);color:var(--gray-700);}
          nav{background:#fff;border-bottom:1px solid var(--gray-200);padding:0 2.5rem;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;box-shadow:0 1px 4px rgba(27,42,74,.07);}
          .logo{font-family:'Plus Jakarta Sans',sans-serif;font-size:1.25rem;font-weight:800;color:var(--navy);}
          .logo span{color:var(--gold);}
          .nav-right{display:flex;align-items:center;gap:1rem;}
          .nav-user{font-size:.85rem;color:var(--gray-500);}
          .btn-logout{padding:.45rem 1rem;background:transparent;border:1.5px solid var(--gray-200);border-radius:var(--radius-sm);font-size:.82rem;font-weight:600;color:var(--gray-500);cursor:pointer;font-family:'Inter',sans-serif;}
          .btn-logout:hover{border-color:var(--navy);color:var(--navy);}
          .main{max-width:1040px;margin:0 auto;padding:2.5rem 2rem;}
          .page-header{margin-bottom:2rem;}
          .eyebrow{font-size:.72rem;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.5rem;}
          .page-title{font-family:'Plus Jakarta Sans',sans-serif;font-size:clamp(1.6rem,3vw,2.2rem);font-weight:800;color:var(--navy);margin-bottom:.4rem;}
          .page-sub{color:var(--gray-500);font-size:.95rem;}
          .profile-strip{background:#fff;border:1px solid var(--gray-200);border-radius:var(--radius);padding:1.25rem 1.5rem;margin-bottom:2rem;display:flex;gap:2rem;flex-wrap:wrap;align-items:center;box-shadow:0 1px 4px rgba(27,42,74,.07);}
          .profile-item{display:flex;flex-direction:column;gap:.2rem;}
          .pi-label{font-size:.65rem;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.1em;}
          .pi-val{font-size:.88rem;font-weight:600;color:var(--navy);}
          .pi-val.gold{color:var(--gold);}
          .pathways-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1.25rem;}
          .pcard{background:#fff;border:1.5px solid var(--gray-200);border-radius:var(--radius);padding:1.5rem;box-shadow:0 1px 4px rgba(27,42,74,.07);transition:all .2s;}
          .pcard:hover{box-shadow:var(--shadow);transform:translateY(-2px);}
          .pcard.recommended{border-color:var(--gold);background:var(--gold-light);}
          .pcard-tag{font-size:.65rem;font-weight:800;color:var(--gray-500);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem;}
          .pcard.recommended .pcard-tag{color:var(--gold);}
          .pcard-name{font-size:1rem;font-weight:700;color:var(--navy);margin-bottom:.25rem;line-height:1.3;}
          .pcard-sub{font-size:.78rem;color:var(--gray-500);margin-bottom:1rem;}
          .metrics{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:1rem;}
          .metric{border-radius:8px;padding:.6rem .75rem;text-align:center;}
          .metric.g{background:var(--sage-light);}
          .metric.a{background:var(--gold-light);}
          .metric.b{background:var(--navy-light);}
          .pcard.recommended .metric{background:rgba(200,146,42,.15);}
          .metric .mv{font-size:.95rem;font-weight:800;color:var(--sage);}
          .metric.a .mv{color:var(--gold);}
          .metric.b .mv{color:var(--navy);}
          .pcard.recommended .metric .mv{color:var(--gold);}
          .metric .ml{font-size:.58rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--gray-500);}
          .key-facts{list-style:none;display:flex;flex-direction:column;gap:.35rem;margin-bottom:1rem;}
          .key-facts li{font-size:.8rem;color:var(--gray-700);display:flex;gap:.5rem;align-items:flex-start;line-height:1.5;}
          .key-facts li::before{content:'→';color:var(--gold);flex-shrink:0;}
          .pcard.recommended .key-facts li::before{color:var(--gold);}
          .inst-links{display:flex;flex-direction:column;gap:.35rem;margin-bottom:1rem;}
          .inst-link{font-size:.8rem;color:var(--navy);font-weight:600;text-decoration:none;display:flex;align-items:center;gap:.35rem;}
          .inst-link:hover{color:var(--gold);text-decoration:underline;}
          .inst-link::before{content:'🏫';font-size:.75rem;}
          .empty-state{text-align:center;padding:4rem 2rem;background:#fff;border-radius:var(--radius);border:1px solid var(--gray-200);}
          .empty-state h3{font-family:'Plus Jakarta Sans',sans-serif;font-size:1.4rem;font-weight:800;color:var(--navy);margin-bottom:.5rem;}
          .empty-state p{color:var(--gray-500);margin-bottom:1.5rem;}
          .btn-gold{display:inline-flex;padding:.75rem 1.75rem;background:var(--gold);color:#fff;border:none;border-radius:var(--radius-sm);font-weight:700;font-size:.95rem;cursor:pointer;text-decoration:none;font-family:'Inter',sans-serif;}
          .btn-gold:hover{background:#B8821A;}
          @media(max-width:600px){.profile-strip{gap:1rem;}.pathways-grid{grid-template-columns:1fr;}}
        `}</style>
      </head>
      <body>
        <nav>
          <div className="logo">Edu<span>Ways</span></div>
          <div className="nav-right">
            <span className="nav-user">👋 {profile?.first_name ?? user.username}</span>
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="btn-logout">Sign Out</button>
            </form>
          </div>
        </nav>

        <div className="main">
          <div className="page-header">
            <div className="eyebrow">Your Dashboard</div>
            <h1 className="page-title">
              {profile ? `${profile.career_title} Pathways` : 'Welcome to EduWays'}
            </h1>
            <p className="page-sub">
              {pathways.length > 0
                ? `${pathways.length} pathways ranked for you · Check your email for the full breakdown`
                : 'Complete your profile to see your personalized pathways'}
            </p>
          </div>

          {profile && (
            <div className="profile-strip">
              <div className="profile-item">
                <div className="pi-label">Career Goal</div>
                <div className="pi-val gold">{profile.career_title}</div>
              </div>
              <div className="profile-item">
                <div className="pi-label">Location</div>
                <div className="pi-val">{profile.home_state}</div>
              </div>
              <div className="profile-item">
                <div className="pi-label">Residency</div>
                <div className="pi-val">{residencyLabel[profile.residency] ?? profile.residency}</div>
              </div>
              <div className="profile-item">
                <div className="pi-label">Annual Budget</div>
                <div className="pi-val">{fmt(profile.budget_cents)}</div>
              </div>
              {profile.gpa_range && (
                <div className="profile-item">
                  <div className="pi-label">GPA Range</div>
                  <div className="pi-val">{profile.gpa_range.replace(/_/g, ' – ')}</div>
                </div>
              )}
            </div>
          )}

          {pathways.length > 0 ? (
            <div className="pathways-grid">
              {pathways.map((p) => (
                <div key={p.id} className={`pcard${p.is_recommended ? ' recommended' : ''}`}>
                  <div className="pcard-tag">
                    {p.is_recommended ? '⭐ Recommended Path' : `Path ${p.pathway_rank}`}
                  </div>
                  <div className="pcard-name">{p.pathway_name}</div>
                  {p.institution_from && p.institution_to && (
                    <div className="pcard-sub">{p.institution_from} → {p.institution_to}</div>
                  )}
                  <div className="metrics">
                    <div className="metric g">
                      <div className="mv">{p.total_cost_cents ? fmt(p.total_cost_cents) : '—'}</div>
                      <div className="ml">Total Cost</div>
                    </div>
                    <div className="metric g">
                      <div className="mv">{p.duration_semesters ? `${p.duration_semesters / 2} yrs` : '—'}</div>
                      <div className="ml">Duration</div>
                    </div>
                    <div className="metric a">
                      <div className="mv">{p.roi_grade ?? '—'}</div>
                      <div className="ml">ROI Grade</div>
                    </div>
                    <div className="metric b">
                      <div className="mv">{p.pathly_score ? `${Math.round(p.pathly_score)}/100` : '—'}</div>
                      <div className="ml">Score</div>
                    </div>
                  </div>
                  {(p.key_facts as string[]).length > 0 && (
                    <ul className="key-facts">
                      {(p.key_facts as string[]).slice(0, 3).map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  )}
                  <div className="inst-links">
                    {p.institution_from_url && (
                      <a href={p.institution_from_url} target="_blank" rel="noopener noreferrer" className="inst-link">
                        {p.institution_from}
                      </a>
                    )}
                    {p.institution_to_url && (
                      <a href={p.institution_to_url} target="_blank" rel="noopener noreferrer" className="inst-link">
                        {p.institution_to}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No pathways yet</h3>
              <p>Complete the sign-up form to generate your personalized pathway recommendations.</p>
              <a href="/" className="btn-gold">Get Started →</a>
            </div>
          )}
        </div>
      </body>
    </html>
  )
}
