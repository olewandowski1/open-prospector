# Confirm A Missing Contact Route By Search

Status: Accepted

Extends [ADR 0018](0018-confirm-an-absent-website-by-search.md) with the second claim worth one
search, and keeps the cost rule that decision set: per-business search is spent only where a wrong
answer loses a candidate.

[Candidate Businesses must carry at least one Contact Route](../Domain-Language.md), so
`evaluateBusinessIdentity` excludes a business the report left without one as `missing-contact`.
That is correct when no public route exists and wrong when the report simply did not look. Directory
pages commonly mask numbers behind a reveal control, and the discovery report is told never to
invent a detail it did not see, so a runtime that respects the rule reports none.

Two Car repair garage runs in Toruń on 2026-09-13, same Search Brief and same OpenCode DeepSeek V4.1
Flash model, showed the loss. The first read directories that publish numbers and assessed 10
businesses of 12; the second read `nowosci.com.pl` and `dobrymechanik.pl`, whose numbers are behind
"Pokaż numer telefonu", and its report said so for seven businesses ("I did not reveal it"). Report
verification dropped nothing, so nothing was wrong in the report, yet seven of twelve businesses
were excluded before any assessment and the run reached the target with zero qualified candidates.

## Decision

`CorroborateBusiness` spends one bounded search before it evaluates a business whose structured
report named no Contact Route, and only when no other exclusion already applies: the report is the
discovery report contract, the search reuses the report-then-structure path and the existing
verifier, and the business is matched by normalized name so a neighbour's number cannot be
attached.

- **A route it confirms is merged into the structured business** and evaluated normally, so a
  business that publishes a number elsewhere is no longer lost to the directory that hid it.
- **A route it cannot confirm leaves the exclusion in place.** The exclusion reason now reads
  "reported or confirmed", because the stage can no longer tell the two apart and should not claim
  a verification happened when none did.
- **The search is recorded as decision signals** (`ContactRouteConfirmed` or
  `ContactRouteSearchFoundNone`) in the identity event, so the spend and its outcome stay visible in
  the Technical Run Log.
- **It spends nothing when a route already exists, or when the business is centrally controlled,
  online-only, or ambiguous.** Those exclusions do not turn on contact details.

## Cost

One report call and one structure call, only for otherwise-eligible businesses with no contact
route. The measured runs spent nothing on the first (every business carried a route after
verification) and seven searches on the second. It is the same order as ADR 0018's absence
confirmation and follows the same rule: the spend follows the doubt.

## Consequences

- Eligibility no longer depends on which public page the first search happened to read, which was
  the largest source of run-to-run difference between the two measured runs.
- The confirming search is a second opinion from the same runtime, not an independent one. It reads
  different pages, but a runtime that is systematically wrong about a business will be wrong twice.
- A business whose number exists only behind a reveal control still cannot be confirmed, because the
  runtime is forbidden to bypass barriers. It stays excluded, now with a reason that names the cause
  honestly.
- The report prompt now searches `brief.query` rather than the category alone, which is what
  [ADR 0018](0018-confirm-an-absent-website-by-search.md) always described. Until this change the
  confirming search for an absent website searched the whole market, and the four planned discovery
  query angles all produced the same search.
