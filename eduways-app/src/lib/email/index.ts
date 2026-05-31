// src/lib/email/index.ts
// ─────────────────────────────────────────────────────────────────
// EduWays Email Service
//
// Provider: Resend (resend.com) — recommended; free tier: 3,000/mo
// Fallback:  SendGrid or Nodemailer config shown in comments
//
// Setup:
//   1. Sign up at resend.com (free)
//   2. Verify your domain (or use onboarding@resend.dev for testing)
//   3. Add RESEND_API_KEY to .env.local
//   4. Add FROM_EMAIL to .env.local
//
// env:
//   RESEND_API_KEY=re_xxxxxxxxxxxx
//   FROM_EMAIL=noreply@eduways.com   (must match verified Resend domain)
//   APP_URL=https://www.eduways.com
// ─────────────────────────────────────────────────────────────────

import { db }        from '../db';
import { emailLog }  from '../db/schema';
import { eq }        from 'drizzle-orm';

// ── TYPES ─────────────────────────────────────────────────────────

export interface PathwayEmailData {
  user_id:     string;
  first_name:  string;
  email:       string;
  career:      string;
  home_state:  string;
  residency:   'in_state' | 'out_of_state' | 'international';
  pathways: {
    rank:      number;
    name:      string;
    from_institution?: string;
    from_url?:  string;
    to_institution?:   string;
    to_url?:    string;
    total_cost: string;    // formatted e.g. "$18,400"
    duration:   string;    // e.g. "4 years"
    roi_grade:  string;    // e.g. "A+"
    key_facts:  string[];
    is_recommended: boolean;
  }[];
}

// ── EMAIL SENDER ──────────────────────────────────────────────────

export async function sendWelcomePathwaysEmail(data: PathwayEmailData): Promise<boolean> {
  const logId = await createEmailLog(data.user_id, data.email, 'Your EduWays Pathway Results', 'welcome_pathways');

  try {
    const html    = buildPathwayEmailHTML(data);
    const text    = buildPathwayEmailText(data);
    const result  = await sendViaResend({ to: data.email, subject: 'Your EduWays Pathway Results Are Ready', html, text });
    await markEmailSent(logId, result.id);
    return true;
  } catch (err) {
    await markEmailFailed(logId, String(err));
    console.error('[email] Failed to send pathway email:', err);
    return false;
  }
}

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const url  = `${process.env.APP_URL}/verify-email?token=${token}`;
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:2rem;">
      <h2 style="color:#1B2A4A;font-size:1.4rem;margin-bottom:1rem;">Verify your EduWays account</h2>
      <p style="color:#445066;font-size:.95rem;line-height:1.65;margin-bottom:1.5rem;">Click the button below to verify your email address and activate your account.</p>
      <a href="${url}" style="display:inline-block;padding:.85rem 2rem;background:#1B2A4A;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:1rem;">Verify My Email →</a>
      <p style="color:#7A8799;font-size:.8rem;margin-top:1.5rem;">Link expires in 24 hours. If you didn't create an EduWays account, ignore this email.</p>
    </div>`;
  try {
    await sendViaResend({ to: email, subject: 'Verify your EduWays email', html, text: `Verify your email: ${url}` });
    return true;
  } catch { return false; }
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const url = `${process.env.APP_URL}/reset-password?token=${token}`;
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:2rem;">
      <h2 style="color:#1B2A4A;">Reset your EduWays password</h2>
      <p style="color:#445066;line-height:1.65;margin-bottom:1.5rem;">We received a request to reset your password. Click below to set a new one.</p>
      <a href="${url}" style="display:inline-block;padding:.85rem 2rem;background:#C8922A;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">Reset Password →</a>
      <p style="color:#7A8799;font-size:.8rem;margin-top:1.5rem;">Link expires in 1 hour. If you didn't request this, ignore this email.</p>
    </div>`;
  try {
    await sendViaResend({ to: email, subject: 'Reset your EduWays password', html, text: `Reset your password: ${url}` });
    return true;
  } catch { return false; }
}

// ── RESEND API CALLER ─────────────────────────────────────────────
async function sendViaResend(params: { to: string; subject: string; html: string; text: string }): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not set in environment');

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    process.env.FROM_EMAIL ?? 'EduWays <noreply@eduways.com>',
      to:      [params.to],
      subject: params.subject,
      html:    params.html,
      text:    params.text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error ${res.status}: ${err}`);
  }
  return res.json();
}

// ── EMAIL TEMPLATES ───────────────────────────────────────────────
function buildPathwayEmailHTML(data: PathwayEmailData): string {
  const appUrl    = process.env.APP_URL ?? 'https://www.eduways.com';
  const topPath   = data.pathways[0];
  const residency = data.residency === 'in_state' ? 'In-State' : data.residency === 'out_of_state' ? 'Out-of-State' : 'International';

  const pathwayCards = data.pathways.map(p => `
    <div style="border:${p.is_recommended ? '2px solid #C8922A' : '1px solid #E2E6ED'};border-radius:12px;padding:1.5rem;margin-bottom:1rem;background:${p.is_recommended ? '#FDF3E3' : '#fff'};">
      ${p.is_recommended ? '<div style="font-size:.7rem;font-weight:700;color:#C8922A;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.5rem;">⭐ RECOMMENDED PATH</div>' : `<div style="font-size:.7rem;font-weight:700;color:#7A8799;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.5rem;">PATH ${p.rank}</div>`}
      <h3 style="font-size:1rem;font-weight:700;color:#1B2A4A;margin:0 0 .25rem;">${p.name}</h3>
      ${p.from_institution && p.to_institution ? `
        <p style="font-size:.82rem;color:#7A8799;margin:0 0 .85rem;">
          ${p.from_url
            ? `<a href="${p.from_url}" style="color:#1B2A4A;font-weight:600;">${p.from_institution}</a>`
            : `<strong>${p.from_institution}</strong>`
          } →
          ${p.to_url
            ? `<a href="${p.to_url}" style="color:#1B2A4A;font-weight:600;">${p.to_institution}</a>`
            : `<strong>${p.to_institution}</strong>`
          }
        </p>` : ''}
      <div style="display:flex;gap:.75rem;margin-bottom:.85rem;flex-wrap:wrap;">
        <div style="background:${p.is_recommended ? 'rgba(200,146,42,.15)' : '#F8F9FB'};border-radius:8px;padding:.5rem .85rem;text-align:center;">
          <div style="font-size:1rem;font-weight:800;color:${p.is_recommended ? '#C8922A' : '#1B2A4A'};">${p.total_cost}</div>
          <div style="font-size:.6rem;font-weight:600;color:#7A8799;text-transform:uppercase;letter-spacing:.05em;">Total Cost</div>
        </div>
        <div style="background:${p.is_recommended ? 'rgba(200,146,42,.15)' : '#F8F9FB'};border-radius:8px;padding:.5rem .85rem;text-align:center;">
          <div style="font-size:1rem;font-weight:800;color:${p.is_recommended ? '#C8922A' : '#1B2A4A'};">${p.duration}</div>
          <div style="font-size:.6rem;font-weight:600;color:#7A8799;text-transform:uppercase;letter-spacing:.05em;">Duration</div>
        </div>
        <div style="background:${p.is_recommended ? 'rgba(200,146,42,.15)' : '#F8F9FB'};border-radius:8px;padding:.5rem .85rem;text-align:center;">
          <div style="font-size:1rem;font-weight:800;color:${p.is_recommended ? '#C8922A' : '#1B2A4A'};">${p.roi_grade}</div>
          <div style="font-size:.6rem;font-weight:600;color:#7A8799;text-transform:uppercase;letter-spacing:.05em;">Career ROI</div>
        </div>
      </div>
      ${p.key_facts.length > 0 ? `
        <ul style="margin:0;padding-left:1.15rem;font-size:.82rem;color:#445066;line-height:2;">
          ${p.key_facts.map(f => `<li>${f}</li>`).join('')}
        </ul>` : ''}
    </div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F8F9FB;font-family:Inter,-apple-system,sans-serif;">
<div style="max-width:600px;margin:2rem auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(27,42,74,.12);">

  <!-- Header -->
  <div style="background:#1B2A4A;padding:2rem 2rem 1.5rem;text-align:center;">
    <div style="font-family:sans-serif;font-size:1.4rem;font-weight:800;color:#fff;letter-spacing:-.02em;">
      Edu<span style="color:#C8922A;">Ways</span>
    </div>
    <p style="color:rgba(255,255,255,.75);font-size:.85rem;margin:.4rem 0 0;">Your Education Pathway Results</p>
  </div>

  <!-- Body -->
  <div style="padding:2rem;">
    <h1 style="font-size:1.4rem;font-weight:800;color:#1B2A4A;margin:0 0 .4rem;">
      Hi ${data.first_name}, your pathways are ready! 🎓
    </h1>
    <p style="color:#445066;font-size:.95rem;line-height:1.7;margin-bottom:1.75rem;">
      Based on your goal of becoming a <strong>${data.career}</strong> in <strong>${data.home_state}</strong>
      (${residency} student), here are your three recommended education pathways ranked by ROI.
    </p>

    <!-- CTA Button -->
    <div style="text-align:center;margin-bottom:2rem;">
      <a href="${appUrl}/dashboard"
         style="display:inline-block;padding:.9rem 2.25rem;background:#C8922A;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:1rem;box-shadow:0 4px 14px rgba(200,146,42,.3);">
        View My Full Dashboard →
      </a>
    </div>

    <!-- Pathway Cards -->
    <h2 style="font-size:.9rem;font-weight:700;color:#1B2A4A;text-transform:uppercase;letter-spacing:.08em;margin-bottom:1rem;">
      Your Recommended Pathways
    </h2>
    ${pathwayCards}

    <!-- Residency note -->
    <div style="background:#EEF1F8;border-radius:10px;padding:1rem 1.25rem;margin-top:1.25rem;">
      <p style="margin:0;font-size:.82rem;color:#445066;line-height:1.65;">
        <strong>💡 Residency note:</strong> Costs above are calculated for a
        <strong>${residency}</strong> student in <strong>${data.home_state}</strong>.
        In-state status significantly reduces tuition at public institutions.
        <a href="${appUrl}/dashboard" style="color:#C8922A;font-weight:600;">Update your residency status →</a>
      </p>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#F8F9FB;border-top:1px solid #E2E6ED;padding:1.25rem 2rem;text-align:center;">
    <p style="font-size:.78rem;color:#7A8799;margin:0 0 .4rem;">
      © ${new Date().getFullYear()} EduWays · Helping students make smarter education decisions
    </p>
    <p style="font-size:.78rem;color:#7A8799;margin:0;">
      <a href="${appUrl}/settings" style="color:#7A8799;">Update preferences</a> ·
      <a href="${appUrl}/unsubscribe" style="color:#7A8799;">Unsubscribe</a>
    </p>
  </div>
</div>
</body>
</html>`;
}

function buildPathwayEmailText(data: PathwayEmailData): string {
  const lines = [
    `Hi ${data.first_name},`,
    '',
    `Your EduWays pathway results for ${data.career} in ${data.home_state} are ready.`,
    '',
    '─────────────────────────────────',
    'YOUR RECOMMENDED PATHWAYS',
    '─────────────────────────────────',
  ];
  data.pathways.forEach(p => {
    lines.push(`\n${p.is_recommended ? '⭐ RECOMMENDED — ' : ''}Path ${p.rank}: ${p.name}`);
    if (p.from_institution && p.to_institution) {
      lines.push(`  ${p.from_institution} → ${p.to_institution}`);
      if (p.from_url) lines.push(`  ${p.from_institution}: ${p.from_url}`);
      if (p.to_url)   lines.push(`  ${p.to_institution}: ${p.to_url}`);
    }
    lines.push(`  Total Cost: ${p.total_cost} · Duration: ${p.duration} · ROI: ${p.roi_grade}`);
    p.key_facts.forEach(f => lines.push(`  • ${f}`));
  });
  lines.push('', '─────────────────────────────────');
  lines.push(`View your full dashboard: ${process.env.APP_URL ?? 'https://www.eduways.com'}/dashboard`);
  lines.push('', '© EduWays · Unsubscribe: ' + (process.env.APP_URL ?? '') + '/unsubscribe');
  return lines.join('\n');
}

// ── DB HELPERS ────────────────────────────────────────────────────
async function createEmailLog(userId: string, toEmail: string, subject: string, template: string): Promise<string> {
  const [row] = await db.insert(emailLog).values({ user_id: userId, to_email: toEmail, subject, template }).returning({ id: emailLog.id });
  return row.id;
}
async function markEmailSent(id: string, providerId?: string): Promise<void> {
  await db.update(emailLog).set({ status: 'sent', provider_id: providerId, sent_at: new Date() }).where(eq(emailLog.id, id));
}
async function markEmailFailed(id: string, error: string): Promise<void> {
  await db.update(emailLog).set({ status: 'failed', error_message: error }).where(eq(emailLog.id, id));
}
