================================================================
FIRST-OPEN FLOW — CONCEPT SPEC (pre-implementation)
================================================================
Status: conceptual, fresh-slate design — not yet built.
Companion to nutrition-goal-app-PROJECT-CONTEXT.txt (current shipped app)
and CHANGELOG.txt (history of the shipped app).
This file does not describe what's running today — it describes what
we've designed to replace/extend it. Treat the two as separate worlds
until implementation starts.

----------------------------------------------------------------
1. NORTH STAR
----------------------------------------------------------------
Simple, intuitive, "spam-free." A 60-year-old should be able to open
the app, set a goal (or not), and just use it — no jargon, no
over-explaining, nothing forced.

Design principles (check every screen decision against these):
1. Nothing earns a spot on the first screen unless its absence breaks
   the very next thing the user sees.
2. Guess sensibly, then let people correct — don't ask what you can
   estimate.
3. Every extra input is contextual, not upfront — it shows up at the
   moment its value is obvious.
4. Depth is something people opt into by going looking, never
   something handed to them.
5. Any invitation to do more shows once, gently, and doesn't repeat
   unless something genuinely new justifies asking again.
6. Plain words before precise ones — "your daily number" before
   "BMR," "protein" before "macro breakdown."

No labeled personas (Basic/Pro). Depth is an unlabeled dial, self
-selected through action (see §8), not a declared identity.

Three use cases, in priority order:
1. Lose weight
2. Not sure yet — just exploring
3. Build muscle
("Maintain weight" is not a selectable path yet — see §12.)

----------------------------------------------------------------
2. THE FORK (first open)
----------------------------------------------------------------
No separate "onboarding" phase exists. The fork question *is* the
onboarding — there is nothing before it.

Screen: single shared landing.
  leve
  "What brings you here?"
  [ Lose weight ]
  [ Build muscle ]
  [ Not sure yet — just exploring ]
Tapping a card advances immediately — no separate Continue button.

----------------------------------------------------------------
3. PATH A — LOSE WEIGHT
----------------------------------------------------------------
Quick setup (see §8 for the full Simple/Custom screen shape):
  Current weight: [ 82 ] kg
  Target weight:  [ 75 ] kg
  Pace: ( Relaxed ) ( Steady ✓ ) ( Ambitious )
  "≈ 14 March" (derived, not typed)
  [ Set my goal ]

Lands directly on Today, fully populated:
  Hero number + "kcal available" (see §10 for exact label rules)
  Food · Activity · Weight quick-add row

First tap of the hero number (any day, not just day one): a one-time
tooltip — "Tap anytime to see how we work this out." That's the only
explanation that exists on day one, and only because they asked for
it by tapping.

----------------------------------------------------------------
4. PATH B — BUILD MUSCLE
----------------------------------------------------------------
Same shape as Lose weight, reframed:
  Pace: ( Lean ) ( Steady ✓ ) ( Bulk )
  "≈ +250–350 kcal/day · mid-June" (a range, not a single number —
  gaining isn't linear the way losing roughly is, so a fake-precise
  single number would be dishonest)

Two real divergences from Lose weight, both deliberate:
- Protein shows on Today by default, unhidden (Lose weight keeps
  macros tucked away as advanced-until-requested). Protein isn't
  optional trivia for this goal type — we still never *ask* for a
  target (defaulted from weight, no form), but we *show* it from
  day one.
- Hero number framing flips: "kcal to go" before the surplus floor
  is reached, "kcal available" once in range — see §10.

----------------------------------------------------------------
5. PATH C — NOT SURE YET (explorer)
----------------------------------------------------------------
No setup screen at all. Lands directly on Today in no-goal mode:
  "No goal set" pill (tappable → Goal tab, entirely optional)
  Gauge: disabled state — faint solid ring, no colored arc, ~45%
  opacity (matches the real GaugeArc `disabled` behavior — NOT
  dashed, that was a wireframe mistake, corrected)
  Hero label: "kcal logged" (not "available" — nothing to be
  available against)
  Food · Activity · Weight quick-add row — fully functional

Zero proactive nudges anywhere on this screen. The only invitation
to set a goal lives quietly in the Goal tab's own empty state:
  "No goal yet. Set one anytime — takes under a minute."
  [ Set a goal ]
Nothing reaches out to the explorer first. This is the strictest
reading of "no nags," confirmed deliberately even though it means
some explorers may never realize a goal is an option unless they
tap that tab.

Activity already doesn't touch the main number for explorers (it's
tracked separately, with its own inline note: "Activity is tracked
but not counted toward your total"). That note explains the *fact*,
but on its own it risks reading as "this did nothing" the first time
someone logs activity with no goal — which can quietly discourage
the next attempt. So this path also gets its own first-tap teaching
moment (§9) — its job is different from the lose/build versions:
not teaching a budget mechanic (there is no budget), but confirming
the entry mattered and will count toward something the moment a goal
exists. Resolved — no longer a contradiction with §9.

----------------------------------------------------------------
6. EXPLORER → GOAL CONVERSION
----------------------------------------------------------------
Trigger: tapping "No goal set" (Today pill) or "Set a goal" (Goal
tab empty state).

Trimmed fork (same component as §2, "Not sure yet" removed — they
already answered that by tapping in here):
  ← back
  "What's your goal?"
  [ Lose weight ]
  [ Build muscle ]
Leads into the same Quick Setup screen as a brand-new user would
get (§3/§4), with two differences:
- Current weight arrives pre-filled from their most recent logged
  weight entry, if one exists — editable, not locked.
- Start date defaults to today, same as new setup. If they backdate
  it, any already-logged days inside that window count toward the
  goal's history automatically (the start date is the only thing
  that decides this — no separate retroactive logic).

Confirmation that a goal now exists: no banner, no toast, no text
at all. The gauge's own transition — faint empty ring → filled,
colored arc with a real number — is the entire confirmation.

----------------------------------------------------------------
7. DATA PHILOSOPHY — WHAT WE ASK, AND WHEN
----------------------------------------------------------------
Height / age / sex are never asked at first open. BMR is estimated
from weight alone to start (labeled quietly as a starting estimate,
never as a precise fact), and gets richer only through three
separate, optional, non-overlapping channels:

  First open ──┬─ In-context nudge   (earned — e.g. tapping "why is
               │                      my number X," or a later,
               │                      value-justified trend tune-up
               │                      offer)
               ├─ Self-serve         (Account, anytime, zero prompting)
               └─ Advanced depth     (opt-in, never imposed — §8)

Important distinction, since §8 introduced a "Custom" mode after this
section was first written: height/age/sex are PERSON-level facts,
not GOAL-level ones. They never appear on the goal creation/edit
screen, in either Simple or Custom mode — Custom only adds precision
to THIS goal's parameters (dates, deficit, name), not the person's
profile. Height/age/sex live exclusively in the two doors above
(in-context nudge, self-serve/Account) — full stop, regardless of
which toggle state someone's goal was set up in.

Units (kg/lbs) are different — they're tied to the weight field
itself, so they show up inline in BOTH Simple and Custom (wherever
a weight value is entered), not deferred anywhere:

Units (kg/lbs): default from device region (not language — many
English-speaking regions are metric), kg as ultimate fallback. No
separate toggle screen — the unit label on the weight field itself
is tappable inline ("82 kg" → "kg" flips to "lbs").

Weight cadence: defaults to weekly going forward (the current
shipped app defaults to daily — `?? 'daily'` appears in three
places: AccountScreen.tsx, TodayScreen.tsx ×2 — all three need
updating to flip this). Daily stays available as an Account-only
setting. No introduction, no nudge toward daily — it simply lives
in Account for anyone who goes looking.

----------------------------------------------------------------
8. GOAL CREATION / EDIT — ONE SCREEN, SIMPLE/CUSTOM TOGGLE
----------------------------------------------------------------
This supersedes earlier drafts of this screen (a "have a specific
date in mind?" link, then a 4th pace pill, then a header "More
control" button — all replaced by this).

There is exactly one goal-creation/edit screen, ever, per goal type.
A segmented control at the top reads "Simple | Custom" (same visual
component already used elsewhere in the app for this kind of
toggle, e.g. the existing Tracking step's Simple/Detailed control —
labeled differently here on purpose, see note below).

Simple (default for everyone, always, no exceptions, no persona
detection, no "show advanced after N days"):
  Current weight / Target weight
  Pace pills (Relaxed/Steady/Ambitious or Lean/Steady/Bulk)
  Derived date text
  [ Set my goal ]

Custom (same screen, toggle flipped):
  Goal name (optional — defaults to "New goal" if left blank;
  confirmed in current code: `name.trim() || 'New goal'`)
  Start date / Target date (real date pickers, same labels as the
  current app's Dates section)
  Deficit/surplus slider + review card (reusing the current app's
  existing component as-is — confirmed in code: this number is pure
  weight-and-time math, NOT BMR-dependent, so it's stable regardless
  of profile accuracy)
  → Optional, skippable height/age/sex offer, inline, not gated
    behind a tap (Custom is itself the opt-in signal) — placed here
    specifically because what comes next IS BMR-dependent: confirmed
    in code, `totalCal = BMR + deficit/surplus` feeds the macro-gram
    math on the next step. Asking here means the first BMR-dependent
    number anyone sees already reflects whatever accuracy they chose
    to provide, instead of being shown an estimate that then jumps
    after the fact.
  Tracking step (macro style) — unaffected by the Simple/Custom
  toggle itself, but now downstream of the optional offer above.

Editing always opens this same screen, never a different or richer
one. The toggle simply opens pre-set to whichever side the goal was
created on (Simple-created goal opens to Simple; Custom-created
opens to Custom), and the person can flip it freely. Switching sides
preserves whatever was entered on the other side — nothing resets,
nothing is discarded, even fields invisible on the current side.

Macro-style tracking itself ("Simple/Detailed" carb/fat distribution)
is unaffected by the toggle — only its inputs changed, per above.

Label note: "Simple/Detailed" is already used by the Tracking step
for a different choice (macro distribution depth). Reusing identical
wording here for a different decision would blur the two, hence
"Simple/Custom" for this screen specifically.

Validation (confirmed in current code, carried over as-is): the
button is always tappable, never disabled. Validation happens on
tap, with inline red text under the specific offending field —
e.g. "Target must be lower than start weight" (lose), "Target must
be higher than start weight" (gain), "Target date must be after
start date." No blocking, no pre-emptive graying-out.

Back-arrow behavior (quick setup, reached from the fork): returns to
the fork question and resets all fields except current weight
(current weight is a fact about the person, independent of which
goal type they picked; target/pace are tied to the type, so those
reset).

Abandoning setup mid-way: no draft-saving, no resume logic. Cost to
redo is a few seconds; not worth building state persistence for.

----------------------------------------------------------------
9. ACTIVITY-TAP TEACHING MOMENT
----------------------------------------------------------------
Trigger: the first time a person ever taps INTO Activity logging —
not gated by whether a goal exists, since the underlying mechanic
(activity changes your number) is the same fact regardless.

Presentation: a bottom sheet (not a toast/banner), recycling and
adapting the existing onboarding "Daily Allowance" demo asset
(animated gauge + flash-pill notification + growing log list,
already built in OnboardingDailyAllowance.tsx) — ending in a CTA
that continues into the real activity-entry form. One-time,
dismissible, never repeats once seen for a given flavor (below).

Seen-state is tracked per goal-type *flavor*, not globally — three
independent one-time flags, and genuinely three separate pieces of
content (not one asset with swapped copy):
  - Lose-flavored: shown once, ever, the first time someone on a
    lose-type goal taps into Activity. A second lose goal later
    shows nothing. Deficit framing — "that earned you back kcal."
  - Build-flavored: a genuinely different explanation (surplus
    framing — "your eating target just went up, fuel the work"),
    earns its own independent first-time showing even if the lose
    version has already been seen.
  - Explore-flavored: different job entirely. There's no budget to
    point to, so this isn't a mechanic explanation — it's
    reassurance that the entry was saved and will count toward
    something the moment a goal exists. Without this, the existing
    inline note ("activity is tracked but not counted toward your
    total") risks reading as "this did nothing" on first use, which
    can quietly discourage logging again. Resolves the contradiction
    that used to sit here against §5.

No equivalent teaching moment for food logging in any path — eating
already matches people's existing intuition; only activity's effect
(or lack of one) is counter-intuitive enough to warrant this.

The existing demo asset's content is built around deficit framing
(Granola/Pasta/Run, "On target"/"Over" badges) — fine as a stopgap
for the lose-flavored version, but a genuinely surplus-flavored
build version still needs its own content (not yet designed — §12).

A self-serve version of these same explanations should also live in
an Account "learning" section — content and structure not yet
designed (§12).

----------------------------------------------------------------
10. HERO NUMBER COPY — REUSE, DON'T REINVENT
----------------------------------------------------------------
Confirmed directly from current code (TodayScreen.tsx) — this is
already-shipped, already-iterated language. Do not invent new
wording for this; reuse exactly:
  "kcal available" — normal state, BOTH goal types (room left)
  "kcal to go"      — gain only, before reaching the surplus floor
  "kcal over"       — either type, past budget
One word ("available") does double duty across both goal types in
the normal case — that unification is the better existing answer,
not something to "improve" on.

----------------------------------------------------------------
11. COPY & TONE — CALIBRATED AGAINST THE REAL APP
----------------------------------------------------------------
Checked directly against the current "New goal" screen's actual
copy. The shipped app's voice is sparse — section labels and field
labels only ("Set your goal," "Goal name," "Weight," "Start (kg),"
"Dates"). No intro sentences, no reassurance lines, no rhetorical
questions.

Earlier drafts of the new screens over-added narrative copy ("let's
set your target," "you can change this anytime") — corrected. New
screens should match the existing sparse, label-driven voice, not
introduce a more casual/talkative register that doesn't exist
anywhere else in the app.

----------------------------------------------------------------
12. OPEN ITEMS — NOT YET DECIDED, PARKED FOR LATER
----------------------------------------------------------------
- Account "learning" section: content and structure not designed.
  When tackled, reframe around explaining each goal type (what it
  means, how it's calculated) rather than abstract mechanic-FAQ
  questions — terminology like "available" or "digestion calories"
  isn't something a new user would recognize well enough to ask
  about directly.
- Build-muscle-flavored AND explore-flavored content for the
  teaching sheet in §9 — only the lose-flavored asset currently
  exists (recycled from the existing onboarding demo). Both of the
  other two need original content, not just reworded copy on the
  same asset.
- "Maintain weight" as a real, selectable goal type. Currently not
  selectable at all (disabled in the existing TYPES list) and
  quietly falls into "Not sure yet" by default. A dedicated
  maintain-flavored teaching-sheet variant only makes sense once
  this actually ships as its own path.
- Exact final copy for the Simple/Custom info row under each state
  (proposed but not stress-tested):
    Simple: "We'll set your pace and date automatically. You can
    fine-tune anytime."
    Custom: "Set your own dates and daily target."
- Decided: the height/age/sex offer inside Custom mode (§8) sits
  between the review card and Tracking — settled placement, not just
  a candidate. Still open: exact copy/UI for that inline offer, and
  whether the same offer should also exist anywhere in Simple mode
  (currently it doesn't — Simple never shows a BMR-dependent number
  during setup at all, so there's no equivalent moment to hang it on
  there).
