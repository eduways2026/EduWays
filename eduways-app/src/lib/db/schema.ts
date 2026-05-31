// src/lib/db/schema.ts
// ─────────────────────────────────────────────────────────────────
// EduWays Full Database Schema — Drizzle ORM + PostgreSQL
// Tables: users, sessions, student_profiles, pathways, career_cache
// ─────────────────────────────────────────────────────────────────
import {
  pgTable, uuid, text, integer, boolean,
  timestamp, pgEnum, real, index, unique
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ── ENUMS ─────────────────────────────────────────────────────────
export const degreeLevelEnum  = pgEnum('degree_level',  ['certificate','associate','bachelor','master','doctoral']);
export const classModeEnum    = pgEnum('class_mode',    ['in_person','online','hybrid','no_preference']);
export const scheduleTypeEnum = pgEnum('schedule_type', ['full_time','part_time','accelerated','flexible']);
export const gpaRangeEnum     = pgEnum('gpa_range',     ['below_2','2_to_2_5','2_5_to_3','3_to_3_5','3_5_to_4']);
export const residencyEnum    = pgEnum('residency',     ['in_state','out_of_state','international']);
export const emailStatusEnum  = pgEnum('email_status',  ['pending','sent','failed','bounced']);

// ── USERS ─────────────────────────────────────────────────────────
// Core account table — credentials stored with bcrypt hash
export const users = pgTable('users', {
  id:              uuid('id').primaryKey().defaultRandom(),
  email:           text('email').notNull().unique(),
  username:        text('username').notNull().unique(),
  // bcrypt hash of password — NEVER store plaintext
  password_hash:   text('password_hash').notNull(),
  email_verified:  boolean('email_verified').default(false),
  avatar_url:      text('avatar_url'),
  created_at:      timestamp('created_at').defaultNow().notNull(),
  updated_at:      timestamp('updated_at').defaultNow().notNull(),
  last_login_at:   timestamp('last_login_at'),
}, (t) => ({
  emailIdx:    index('idx_users_email').on(t.email),
  usernameIdx: index('idx_users_username').on(t.username),
}));

// ── SESSIONS ──────────────────────────────────────────────────────
// Server-side sessions — used by NextAuth / custom auth
export const sessions = pgTable('sessions', {
  id:           uuid('id').primaryKey().defaultRandom(),
  user_id:      uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  session_token:text('session_token').notNull().unique(),
  expires_at:   timestamp('expires_at').notNull(),
  created_at:   timestamp('created_at').defaultNow().notNull(),
  ip_address:   text('ip_address'),
  user_agent:   text('user_agent'),
}, (t) => ({
  tokenIdx:  index('idx_sessions_token').on(t.session_token),
  userIdx:   index('idx_sessions_user').on(t.user_id),
  expiryIdx: index('idx_sessions_expires').on(t.expires_at),
}));

// ── STUDENT PROFILES ──────────────────────────────────────────────
// One profile per user — onboarding answers + residency
export const studentProfiles = pgTable('student_profiles', {
  id:              uuid('id').primaryKey().defaultRandom(),
  user_id:         uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),

  // Step 1 — Personal
  first_name:      text('first_name').notNull(),
  last_name:       text('last_name').notNull(),
  home_state:      text('home_state').notNull(),            // 2-char e.g. "FL"

  // Step 2 — RESIDENCY (drives tuition calculation)
  residency:       residencyEnum('residency').notNull().default('in_state'),
  // Residency state = the state where the student has legal residency
  // May differ from home_state for transfer students
  residency_state: text('residency_state'),

  // Step 3 — Academic
  career_title:    text('career_title').notNull(),          // from career DB
  career_soc_code: text('career_soc_code'),                 // SOC e.g. "29-1141"
  gpa_range:       gpaRangeEnum('gpa_range'),
  transfer_credits:integer('transfer_credits').default(0),

  // Step 4 — Preferences
  budget_cents:    integer('budget_cents').notNull(),        // annual, stored as cents
  degree_level:    degreeLevelEnum('degree_level').default('bachelor'),
  class_mode:      classModeEnum('class_mode').default('no_preference'),
  schedule_type:   scheduleTypeEnum('schedule_type').default('full_time'),

  // Scoring weights (0–100)
  weight_debt:     integer('weight_debt').default(90),
  weight_speed:    integer('weight_speed').default(60),
  weight_transfer: integer('weight_transfer').default(85),
  weight_roi:      integer('weight_roi').default(70),

  // Meta
  onboarding_complete: boolean('onboarding_complete').default(false),
  created_at:      timestamp('created_at').defaultNow().notNull(),
  updated_at:      timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  userIdx:    index('idx_profiles_user').on(t.user_id),
  stateIdx:   index('idx_profiles_state').on(t.home_state),
  residencyIdx: index('idx_profiles_residency').on(t.residency),
}));

// ── SAVED PATHWAYS ────────────────────────────────────────────────
// Generated pathway results saved per user — allows returning users to see results
export const savedPathways = pgTable('saved_pathways', {
  id:            uuid('id').primaryKey().defaultRandom(),
  user_id:       uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  profile_id:    uuid('profile_id').references(() => studentProfiles.id).notNull(),

  // Pathway data (JSON snapshot of scoring engine output)
  pathway_rank:  integer('pathway_rank').notNull(),          // 1 = top recommended
  pathway_name:  text('pathway_name').notNull(),
  institution_from: text('institution_from'),                // CC name
  institution_to:   text('institution_to'),                  // University name
  institution_from_url: text('institution_from_url'),        // for email links
  institution_to_url:   text('institution_to_url'),          // for email links
  total_cost_cents:  integer('total_cost_cents'),
  duration_semesters:integer('duration_semesters'),
  pathly_score:      real('pathly_score'),                   // 0–100
  roi_grade:         text('roi_grade'),                      // A+, B, etc.
  licensing_met:     boolean('licensing_met').default(false),
  description:       text('description'),
  key_facts:         text('key_facts').array().default([]),   // bullet points

  // Residency-adjusted costs
  instate_annual_cost:    integer('instate_annual_cost'),
  outofstate_annual_cost: integer('outofstate_annual_cost'),
  user_annual_cost:       integer('user_annual_cost'),        // actual based on residency

  is_recommended:    boolean('is_recommended').default(false),
  created_at:        timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userIdx:    index('idx_pathways_user').on(t.user_id),
  profileIdx: index('idx_pathways_profile').on(t.profile_id),
}));

// ── EMAIL LOG ─────────────────────────────────────────────────────
// Tracks every transactional email sent — for debugging and resend logic
export const emailLog = pgTable('email_log', {
  id:           uuid('id').primaryKey().defaultRandom(),
  user_id:      uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  to_email:     text('to_email').notNull(),
  subject:      text('subject').notNull(),
  template:     text('template').notNull(),                  // "welcome_pathways"
  status:       emailStatusEnum('status').default('pending'),
  provider_id:  text('provider_id'),                         // Resend/SendGrid message ID
  error_message:text('error_message'),
  sent_at:      timestamp('sent_at'),
  created_at:   timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userIdx:   index('idx_email_user').on(t.user_id),
  statusIdx: index('idx_email_status').on(t.status),
}));

// ── VERIFICATION TOKENS ───────────────────────────────────────────
// Email verification + password reset tokens
export const verificationTokens = pgTable('verification_tokens', {
  id:         uuid('id').primaryKey().defaultRandom(),
  user_id:    uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  token:      text('token').notNull().unique(),
  type:       text('type').notNull(),                        // "email_verify" | "password_reset"
  expires_at: timestamp('expires_at').notNull(),
  used_at:    timestamp('used_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  tokenIdx: index('idx_vtokens_token').on(t.token),
  userIdx:  index('idx_vtokens_user').on(t.user_id),
}));

// ── RELATIONS ─────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ one, many }) => ({
  profile:  one(studentProfiles, { fields: [users.id], references: [studentProfiles.user_id] }),
  sessions: many(sessions),
  pathways: many(savedPathways),
  emails:   many(emailLog),
  tokens:   many(verificationTokens),
}));

export const studentProfilesRelations = relations(studentProfiles, ({ one, many }) => ({
  user:     one(users, { fields: [studentProfiles.user_id], references: [users.id] }),
  pathways: many(savedPathways),
}));

export const savedPathwaysRelations = relations(savedPathways, ({ one }) => ({
  user:    one(users,           { fields: [savedPathways.user_id],   references: [users.id] }),
  profile: one(studentProfiles, { fields: [savedPathways.profile_id], references: [studentProfiles.id] }),
}));
