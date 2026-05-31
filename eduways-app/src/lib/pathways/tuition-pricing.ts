// src/lib/pathways/tuition-pricing.ts
// ─────────────────────────────────────────────────────────────────
// Residency-Aware Tuition Pricing Engine
//
// Calculates accurate tuition costs based on:
//   - Institution type (CC, public 4yr, private, online)
//   - Residency status (in-state, out-of-state, international)
//   - State of the institution
//   - State of the student's legal residency
//
// Data sources: NCES IPEDS 2023-24, College Board 2023-24
// ─────────────────────────────────────────────────────────────────

export type ResidencyStatus = 'in_state' | 'out_of_state' | 'international';
export type InstitutionType = 'community_college' | 'public_4yr' | 'private_4yr' | 'online';

export interface TuitionEstimate {
  annual_tuition_cents:  number;
  annual_fees_cents:     number;
  annual_total_cents:    number;
  total_program_cents:   number;
  residency_applied:     ResidencyStatus;
  savings_vs_outstate:   number;   // 0 if already out-of-state
  note?:                 string;
}

// ── NATIONAL AVERAGES BY INSTITUTION TYPE & RESIDENCY ─────────────
// Source: College Board Trends in College Pricing 2023-24
// All amounts in cents (× 100 from dollars)
const NATIONAL_AVERAGES: Record<InstitutionType, Record<ResidencyStatus, { tuition: number; fees: number }>> = {
  community_college: {
    in_state:      { tuition: 380000,  fees: 50000  },  // $3,800 + $500
    out_of_state:  { tuition: 920000,  fees: 50000  },  // $9,200 + $500
    international: { tuition: 960000,  fees: 50000  },
  },
  public_4yr: {
    in_state:      { tuition: 1126000, fees: 130000 },  // $11,260 + $1,300
    out_of_state:  { tuition: 2988000, fees: 130000 },  // $29,880 + $1,300
    international: { tuition: 3100000, fees: 130000 },
  },
  private_4yr: {
    in_state:      { tuition: 4154000, fees: 160000 },  // $41,540 — private same for all
    out_of_state:  { tuition: 4154000, fees: 160000 },
    international: { tuition: 4350000, fees: 160000 },
  },
  online: {
    in_state:      { tuition: 720000,  fees: 30000  },  // $7,200 — online same for all
    out_of_state:  { tuition: 720000,  fees: 30000  },
    international: { tuition: 720000,  fees: 30000  },
  },
};

// ── STATE-SPECIFIC OVERRIDES ──────────────────────────────────────
// States with notably different CC or public 4yr tuition from national avg
// Source: IPEDS State Data Center 2023-24
const STATE_CC_INSTATE: Record<string, number> = {
  CA: 115000,   // California CC — $1,150 (heavily subsidized)
  FL: 320000,   // Florida CC — $3,200
  TX: 270000,   // Texas CC — $2,700
  NY: 590000,   // CUNY CC — $5,900
  WA: 410000,   // Washington CC — $4,100
  NC: 180000,   // NC Community College — $1,800
  GA: 300000,   // Georgia CC — $3,000
  OH: 460000,   // Ohio CC — $4,600
  IL: 430000,   // Illinois CC — $4,300
  VA: 490000,   // Virginia CC — $4,900
};

const STATE_PUBLIC4YR_INSTATE: Record<string, number> = {
  CA: 1440000,  // CSU/UC system
  FL: 620000,   // Florida SUS — among lowest in nation
  TX: 1120000,
  NY: 750000,   // SUNY
  WA: 1280000,
  NC: 760000,   // UNC system
  GA: 1230000,
  OH: 1220000,
  IL: 1680000,
  VA: 1560000,
  UT: 910000,   // Utah — low in-state
  WY: 550000,   // Wyoming — lowest in nation
  MT: 740000,
  ND: 840000,
  SD: 910000,
  NE: 1010000,
  KS: 1000000,
  MO: 1140000,
  AR: 930000,
  MS: 870000,
  AL: 1110000,
  TN: 980000,
  SC: 1360000,
  MA: 1580000,
  CT: 1700000,
  NJ: 1660000,
  PA: 1840000,
  MI: 1550000,
  MN: 1570000,
  WI: 1010000,
  IN: 1020000,
  CO: 1140000,
  AZ: 1270000,
  NV: 860000,
  NM: 780000,
  ID: 850000,
  OR: 1360000,
  HI: 1220000,
  AK: 870000,
};

// ── CORE PRICING FUNCTION ─────────────────────────────────────────
export function calculateTuition(params: {
  institution_type:  InstitutionType;
  institution_state: string;         // 2-char
  student_residency: ResidencyStatus;
  student_state:     string;         // 2-char — legal residency state
  duration_semesters: number;        // total program length
}): TuitionEstimate {
  const { institution_type, institution_state, student_residency, student_state, duration_semesters } = params;

  // Determine effective residency for this institution
  // A student is "in-state" only if their legal residency matches the school's state
  let effectiveResidency: ResidencyStatus = student_residency;
  if (student_residency === 'in_state' && student_state !== institution_state) {
    effectiveResidency = 'out_of_state';
  }
  if (student_residency === 'international') {
    effectiveResidency = 'international';
  }

  // Get base rates
  const base = NATIONAL_AVERAGES[institution_type][effectiveResidency];
  let tuition = base.tuition;
  const fees  = base.fees;

  // Apply state-specific override for in-state CC
  if (effectiveResidency === 'in_state' && institution_type === 'community_college') {
    tuition = STATE_CC_INSTATE[institution_state] ?? tuition;
  }
  // Apply state-specific override for in-state public 4yr
  if (effectiveResidency === 'in_state' && institution_type === 'public_4yr') {
    tuition = STATE_PUBLIC4YR_INSTATE[institution_state] ?? tuition;
  }

  const annual_total = tuition + fees;
  const years        = duration_semesters / 2;
  const total_program = Math.round(annual_total * years);

  // Calculate savings vs out-of-state (for display)
  const oos_base    = NATIONAL_AVERAGES[institution_type]['out_of_state'];
  const oos_annual  = (institution_type === 'community_college'
    ? (STATE_CC_INSTATE[institution_state] ?? oos_base.tuition)
    : (STATE_PUBLIC4YR_INSTATE[institution_state] ?? oos_base.tuition)) + oos_base.fees;
  const savings = effectiveResidency === 'in_state'
    ? Math.max(0, Math.round((oos_annual - annual_total) * years))
    : 0;

  const note = effectiveResidency !== student_residency
    ? `Note: ${institution_state} tuition applied at out-of-state rate because student's legal residency is ${student_state}.`
    : undefined;

  return {
    annual_tuition_cents:  tuition,
    annual_fees_cents:     fees,
    annual_total_cents:    annual_total,
    total_program_cents:   total_program,
    residency_applied:     effectiveResidency,
    savings_vs_outstate:   savings,
    note,
  };
}

// ── PATHWAY COST BUILDER ──────────────────────────────────────────
export interface PathwayCostBreakdown {
  phase_1?: TuitionEstimate;   // CC phase (for 2+2 paths)
  phase_2?: TuitionEstimate;   // University phase
  total_cost_cents: number;
  annual_cost_cents: number;   // blended average
  residency_note?: string;
  in_state_total: number;      // for comparison
  out_of_state_total: number;
}

export function calculatePathwayCost(params: {
  pathway_type: 'two_plus_two' | 'direct_4yr' | 'online' | 'certificate';
  cc_state?:     string;
  univ_state?:   string;
  student_state: string;
  residency:     ResidencyStatus;
  career_field?: string;
}): PathwayCostBreakdown {
  const { pathway_type, cc_state, univ_state, student_state, residency } = params;

  if (pathway_type === 'two_plus_two' && cc_state && univ_state) {
    const phase1 = calculateTuition({
      institution_type:   'community_college',
      institution_state:  cc_state,
      student_residency:  residency,
      student_state,
      duration_semesters: 4,
    });
    const phase2 = calculateTuition({
      institution_type:   'public_4yr',
      institution_state:  univ_state,
      student_residency:  residency,
      student_state,
      duration_semesters: 4,
    });
    const total = phase1.total_program_cents + phase2.total_program_cents;
    // In-state comparison
    const p1is = calculateTuition({ institution_type:'community_college', institution_state:cc_state, student_residency:'in_state', student_state:cc_state, duration_semesters:4 });
    const p2is = calculateTuition({ institution_type:'public_4yr', institution_state:univ_state, student_residency:'in_state', student_state:univ_state, duration_semesters:4 });
    const p1oos = calculateTuition({ institution_type:'community_college', institution_state:cc_state, student_residency:'out_of_state', student_state:'XX', duration_semesters:4 });
    const p2oos = calculateTuition({ institution_type:'public_4yr', institution_state:univ_state, student_residency:'out_of_state', student_state:'XX', duration_semesters:4 });
    return {
      phase_1:            phase1,
      phase_2:            phase2,
      total_cost_cents:   total,
      annual_cost_cents:  Math.round(total / 4),
      residency_note:     phase1.note ?? phase2.note,
      in_state_total:     p1is.total_program_cents + p2is.total_program_cents,
      out_of_state_total: p1oos.total_program_cents + p2oos.total_program_cents,
    };
  }

  if (pathway_type === 'direct_4yr' && univ_state) {
    const est = calculateTuition({
      institution_type:   'public_4yr',
      institution_state:  univ_state,
      student_residency:  residency,
      student_state,
      duration_semesters: 8,
    });
    const is_est  = calculateTuition({ institution_type:'public_4yr', institution_state:univ_state, student_residency:'in_state',      student_state:univ_state, duration_semesters:8 });
    const oos_est = calculateTuition({ institution_type:'public_4yr', institution_state:univ_state, student_residency:'out_of_state',  student_state:'XX',       duration_semesters:8 });
    return {
      phase_2:            est,
      total_cost_cents:   est.total_program_cents,
      annual_cost_cents:  est.annual_total_cents,
      residency_note:     est.note,
      in_state_total:     is_est.total_program_cents,
      out_of_state_total: oos_est.total_program_cents,
    };
  }

  // Online / certificate fallback
  const est = calculateTuition({
    institution_type:   'online',
    institution_state:  univ_state ?? 'US',
    student_residency:  'in_state', // online = same for everyone
    student_state,
    duration_semesters: 6,
  });
  return {
    total_cost_cents:   est.total_program_cents,
    annual_cost_cents:  est.annual_total_cents,
    in_state_total:     est.total_program_cents,
    out_of_state_total: est.total_program_cents,
  };
}

// ── FORMATTING HELPERS ────────────────────────────────────────────
export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(cents / 100);
}

export function residencyLabel(r: ResidencyStatus): string {
  return { in_state:'In-State', out_of_state:'Out-of-State', international:'International' }[r];
}
