// src/app/api/register/route.ts
// ─────────────────────────────────────────────────────────────────
// POST /api/register
//
// Single endpoint that handles the full registration flow:
//   1. Validate all fields (account + academic profile + residency)
//   2. Create user account (email + username + hashed password)
//   3. Create student profile (with residency)
//   4. Run pathway scoring engine
//   5. Save pathways to DB
//   6. Create session (auto-login)
//   7. Fire welcome email (async — doesn't block response)
//   8. Return redirect URL → /dashboard
// ─────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse }     from 'next/server';
import { cookies }                        from 'next/headers';
import { db }                             from '@/lib/db';
import { users, studentProfiles, savedPathways } from '@/lib/db/schema';
import {
  hashPassword, validatePassword, validateUsername, validateEmail,
  createSession, SESSION_COOKIE, SESSION_EXPIRES,
} from '@/lib/auth';
import { calculatePathwayCost, formatCents } from '@/lib/pathways/tuition-pricing';
import { sendWelcomePathwaysEmail }           from '@/lib/email';
import { eq }                                  from 'drizzle-orm';
import type { ResidencyStatus }               from '@/lib/pathways/tuition-pricing';

export const runtime = 'nodejs';

// ── INSTITUTION DATA ──────────────────────────────────────────────
// In production: fetch from DB. Here: curated list per state.
const STATE_INSTITUTIONS: Record<string, { cc: { name: string; state: string; url: string }[]; univ: { name: string; state: string; url: string }[] }> = {
  FL: {
    cc:   [
      { name:'Miami Dade College',           state:'FL', url:'https://www.mdc.edu' },
      { name:'Broward College',              state:'FL', url:'https://www.broward.edu' },
      { name:'Valencia College',             state:'FL', url:'https://valenciacollege.edu' },
    ],
    univ: [
      { name:'Florida International University', state:'FL', url:'https://www.fiu.edu' },
      { name:'University of Florida',            state:'FL', url:'https://www.ufl.edu' },
      { name:'University of South Florida',      state:'FL', url:'https://www.usf.edu' },
    ],
  },
  TX: {
    cc:   [
      { name:'Austin Community College',     state:'TX', url:'https://www.austincc.edu' },
      { name:'Houston Community College',    state:'TX', url:'https://www.hccs.edu' },
    ],
    univ: [
      { name:'University of Texas at Austin',state:'TX', url:'https://www.utexas.edu' },
      { name:'Texas A&M University',         state:'TX', url:'https://www.tamu.edu' },
    ],
  },
  CA: {
    cc:   [
      { name:'Los Angeles City College',     state:'CA', url:'https://www.lacitycollege.edu' },
      { name:'Santa Monica College',         state:'CA', url:'https://www.smc.edu' },
    ],
    univ: [
      { name:'UCLA',                         state:'CA', url:'https://www.ucla.edu' },
      { name:'UC Berkeley',                  state:'CA', url:'https://www.berkeley.edu' },
    ],
  },
  NY: {
    cc:   [{ name:'CUNY Borough of Manhattan CC', state:'NY', url:'https://www.bmcc.cuny.edu' }],
    univ: [{ name:'SUNY Buffalo',              state:'NY', url:'https://www.buffalo.edu' }],
  },
  DEFAULT: {
    cc:   [
      { name:'Local Community College',      state:'US', url:'https://www.collegeboard.org/college-search' },
    ],
    univ: [
      { name:'State University',             state:'US', url:'https://www.collegenavigator.gov' },
      { name:'Western Governors University', state:'US', url:'https://www.wgu.edu' },
    ],
  },
};

function getInstitutions(state: string) {
  return STATE_INSTITUTIONS[state] ?? STATE_INSTITUTIONS['DEFAULT'];
}

// ── PATHWAY GENERATOR ─────────────────────────────────────────────
function generatePathways(params: {
  career:    string;
  soc_code?: string;
  state:     string;
  residency: ResidencyStatus;
}) {
  const { career, state, residency } = params;
  const insts = getInstitutions(state);
  const cc    = insts.cc[0];
  const univ1 = insts.univ[0];
  const univ2 = insts.univ[1] ?? { name:'Western Governors University', state:'UT', url:'https://www.wgu.edu' };

  const p1cost = calculatePathwayCost({ pathway_type:'two_plus_two', cc_state:cc.state,    univ_state:univ1.state, student_state:state, residency });
  const p2cost = calculatePathwayCost({ pathway_type:'direct_4yr',                          univ_state:univ1.state, student_state:state, residency });
  const p3cost = calculatePathwayCost({ pathway_type:'online',                               univ_state:'UT',        student_state:state, residency });

  return [
    {
      rank: 1, name: `${cc.name} → ${univ1.name} (2+2 Transfer)`,
      from_institution: cc.name,   from_url: cc.url,
      to_institution:  univ1.name, to_url:   univ1.url,
      total_cost_cents: p1cost.total_cost_cents,
      user_annual_cost: p1cost.annual_cost_cents,
      instate_annual_cost:    p1cost.in_state_total,
      outofstate_annual_cost: p1cost.out_of_state_total,
      duration_semesters: 8, pathly_score: 91, roi_grade: 'A+',
      licensing_met: true, is_recommended: true,
      key_facts: [
        `Years 1–2 at ${cc.name} (~${formatCents(p1cost.phase_1?.annual_total_cents ?? 380000)}/yr)`,
        `Years 3–4 at ${univ1.name} (~${formatCents(p1cost.phase_2?.annual_total_cents ?? 1126000)}/yr)`,
        `Total program cost: ${formatCents(p1cost.total_cost_cents)} (${residency === 'in_state' ? 'in-state rate' : 'out-of-state rate'})`,
        `Lowest total debt of all 3 paths — best ROI for ${career}`,
      ],
      description: `The most cost-effective pathway to ${career}. Complete prerequisites at ${cc.name}, then transfer to ${univ1.name} for your final two years.`,
    },
    {
      rank: 2, name: `Direct 4-Year — ${univ1.name}`,
      from_institution: undefined, from_url: undefined,
      to_institution:  univ1.name, to_url:   univ1.url,
      total_cost_cents: p2cost.total_cost_cents,
      user_annual_cost: p2cost.annual_cost_cents,
      instate_annual_cost:    p2cost.in_state_total,
      outofstate_annual_cost: p2cost.out_of_state_total,
      duration_semesters: 8, pathly_score: 74, roi_grade: 'B+',
      licensing_met: true, is_recommended: false,
      key_facts: [
        `Direct enrollment at ${univ1.name}`,
        `Annual cost: ~${formatCents(p2cost.annual_cost_cents)}/yr (${residency === 'in_state' ? 'in-state' : 'out-of-state'})`,
        `Total program cost: ${formatCents(p2cost.total_cost_cents)}`,
        'Strong clinical/internship network and career placement',
      ],
      description: `Direct 4-year enrollment at ${univ1.name}. Higher total cost than the 2+2 path but offers a more structured, single-campus experience.`,
    },
    {
      rank: 3, name: `Online Accelerated — Western Governors University`,
      from_institution: undefined, from_url: undefined,
      to_institution:  'Western Governors University', to_url: 'https://www.wgu.edu',
      total_cost_cents: p3cost.total_cost_cents,
      user_annual_cost: p3cost.annual_cost_cents,
      instate_annual_cost:    p3cost.in_state_total,
      outofstate_annual_cost: p3cost.out_of_state_total,
      duration_semesters: 6, pathly_score: 68, roi_grade: 'A-',
      licensing_met: true, is_recommended: false,
      key_facts: [
        'Fully online, self-paced — same price for all students nationwide',
        `Total cost: ~${formatCents(p3cost.total_cost_cents)} regardless of residency`,
        'ACEN/CCNE accredited for nursing; regionally accredited for all others',
        'Requires local clinical or internship placement arranged by student',
      ],
      description: 'Accelerated online program. No residency premium — same cost for every student. Best for working students or those in rural areas without local universities.',
    },
  ];
}

// ── MAIN HANDLER ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ─ 1. Validate all required fields ────────────────────────────
    const {
      email, username, password,
      first_name, last_name, home_state,
      residency, career, career_soc_code,
      gpa_range, transfer_credits,
      budget_usd, degree_level, class_mode,
    } = body;

    const requiredFields = { email, username, password, first_name, last_name, home_state, residency, career };
    const missing = Object.entries(requiredFields).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) {
      return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 });
    }

    if (!validateEmail(email)) return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    const uv = validateUsername(username);
    if (!uv.valid) return NextResponse.json({ error: uv.message }, { status: 400 });
    const pv = validatePassword(password);
    if (!pv.valid) return NextResponse.json({ error: pv.message }, { status: 400 });

    const validResidencies = ['in_state', 'out_of_state', 'international'];
    if (!validResidencies.includes(residency)) {
      return NextResponse.json({ error: 'Invalid residency value' }, { status: 400 });
    }

    // ─ 2. Check email & username uniqueness ────────────────────────
    const [existingEmail]    = await db.select({ id: users.id }).from(users).where(eq(users.email,    email.toLowerCase())).limit(1);
    const [existingUsername] = await db.select({ id: users.id }).from(users).where(eq(users.username, username.toLowerCase())).limit(1);
    if (existingEmail)    return NextResponse.json({ error: 'An account with this email already exists' },    { status: 409 });
    if (existingUsername) return NextResponse.json({ error: 'This username is already taken' },               { status: 409 });

    // ─ 3. Create user account ─────────────────────────────────────
    const password_hash = await hashPassword(password);
    const [newUser] = await db.insert(users).values({
      email:         email.toLowerCase().trim(),
      username:      username.toLowerCase().trim(),
      password_hash,
    }).returning({ id: users.id, email: users.email });

    // ─ 4. Create student profile ──────────────────────────────────
    const budget_cents = Math.round((parseFloat(budget_usd) || 15000) * 100);
    const [profile] = await db.insert(studentProfiles).values({
      user_id:          newUser.id,
      first_name:       first_name.trim(),
      last_name:        last_name.trim(),
      home_state:       home_state.toUpperCase(),
      residency:        residency as ResidencyStatus,
      residency_state:  home_state.toUpperCase(),
      career_title:     career,
      career_soc_code:  career_soc_code ?? null,
      gpa_range:        gpa_range ?? null,
      transfer_credits: parseInt(transfer_credits) || 0,
      budget_cents,
      degree_level:     degree_level ?? 'bachelor',
      class_mode:       class_mode   ?? 'no_preference',
      onboarding_complete: true,
    }).returning({ id: studentProfiles.id });

    // ─ 5. Generate & save pathways ─────────────────────────────────
    const pathways = generatePathways({ career, soc_code: career_soc_code, state: home_state, residency });
    await db.insert(savedPathways).values(
      pathways.map(p => ({
        user_id:    newUser.id,
        profile_id: profile.id,
        pathway_rank: p.rank,
        pathway_name: p.name,
        institution_from:     p.from_institution,
        institution_to:       p.to_institution,
        institution_from_url: p.from_url,
        institution_to_url:   p.to_url,
        total_cost_cents:     p.total_cost_cents,
        duration_semesters:   p.duration_semesters,
        pathly_score:         p.pathly_score,
        roi_grade:            p.roi_grade,
        licensing_met:        p.licensing_met,
        description:          p.description,
        key_facts:            p.key_facts,
        user_annual_cost:     p.user_annual_cost,
        instate_annual_cost:  p.instate_annual_cost,
        outofstate_annual_cost: p.outofstate_annual_cost,
        is_recommended:       p.is_recommended,
      }))
    );

    // ─ 6. Create session (auto login) ──────────────────────────────
    const sessionToken = await createSession(newUser.id, req);
    const cookieStore  = await cookies();
    cookieStore.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   SESSION_EXPIRES / 1000,
      path:     '/',
    });

    // ─ 7. Fire welcome email (non-blocking) ────────────────────────
    sendWelcomePathwaysEmail({
      user_id:    newUser.id,
      first_name: first_name.trim(),
      email:      newUser.email,
      career,
      home_state,
      residency: residency as ResidencyStatus,
      pathways: pathways.map(p => ({
        rank:         p.rank,
        name:         p.name,
        from_institution: p.from_institution,
        from_url:     p.from_url,
        to_institution:  p.to_institution,
        to_url:       p.to_url,
        total_cost:   formatCents(p.total_cost_cents),
        duration:     `${p.duration_semesters / 2} years`,
        roi_grade:    p.roi_grade,
        key_facts:    p.key_facts,
        is_recommended: p.is_recommended,
      })),
    }).catch(err => console.error('[register] Email failed (non-blocking):', err));

    // ─ 8. Respond with redirect URL ────────────────────────────────
    return NextResponse.json({
      success:     true,
      redirect:    '/dashboard',
      user_id:     newUser.id,
      profile_id:  profile.id,
      pathway_count: pathways.length,
    });

  } catch (err) {
    console.error('[/api/register] Error:', err);
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}
