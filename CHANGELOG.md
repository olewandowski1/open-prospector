# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Confirm a missing Contact Route by one bounded search before a business is excluded for lacking
  one, spending nothing when a route exists or another exclusion applies, and naming the outcome in
  the Technical Run Log. Two runs on one brief had qualified 8 candidates against 0. See
  [ADR 0019](docs/adr/0019-confirm-a-missing-contact-route-by-search.md).
- Reassess a Candidate Business from its review panel, repeating the market and runtime of the run
  that found it so no discovery call is spent and the earlier findings are kept.
- Add `pnpm inspect:check`, capturing a fixture site through the real inspection pipeline under the
  worker loader so a transpiler helper leaking into the page fails the build.

### Changed

- Read the Codex and OpenCode model lists from the installed CLIs instead of the checked-in
  manifest, which still offered the retired Ox Alpha Free. The OpenCode picker keeps only the
  `opencode-go` provider and defaults to DeepSeek V4.1 Flash; a CLI that cannot be read falls back to
  the checked-in list, and Claude stays curated because its CLI lists no models.
- Add a `ConfirmAbsentWebsite` stage between inspection and assessment, searching for the one
  business by name. A website it finds is inspected rather than scored as absent, and a confirmed
  absence is recorded as pages read, which lifts the [ADR 0017](docs/adr/0017-corroborate-an-absent-website.md)
  cap on evidence. It spends nothing when the business already carries two public pages. See
  [ADR 0018](docs/adr/0018-confirm-an-absent-website-by-search.md).
- Ask discovery (`discovery-report-v3`) to look for a website by name before reporting none and to
  corroborate each business from more than one page. One market had reported nine car repair garages
  of nine as having no website from a single listing, and one such claim in three was wrong while
  carrying the highest score. The rule explicitly prefers businesses without a website, which is
  what the product exists to find.
- Ask the discovery report (`discovery-report-v2`) to write the page address inside every business
  block it belongs to. A report naming one source for all entries lost every contact to the
  co-location rule, and with them all twelve businesses.
- Cap an absent website corroborated by fewer than two public pages (`opportunity-score-v6`) at
  severity 4 and about 86, instead of 5 and 95 to 98.5. Across fourteen cities, 25 of the 31 leads
  scoring 95 or above rested on a single directory listing. The cap lifts when the business is seen
  on another page. See [ADR 0017](docs/adr/0017-corroborate-an-absent-website.md).
- Qualify at 72 points rather than 60 (`opportunity-score-v5`). Almost every website has a
  severity 3 defect, so the old threshold sat in an empty band and three markets produced 26
  candidates and 26 qualified. The queue now holds 15 of 53 businesses instead of 50. See
  [ADR 0016](docs/adr/0016-qualify-on-a-blocked-visitor-not-a-defect.md).
- Anchor the severity bands: a first screen with no visible way to act is severity 4, while an
  accessibility or layout defect on a completable page is 3 at most. A garage with no way to act
  now outscores one with a visible telephone and hero action, 76.8 against 68.8.
- Raise at most one Website Opportunity per class.
- Stop scoring first contentful paint, measured at 296 ms and 3,448 ms for one page across runs; it
  is still recorded and shown. Rescoring a business now moves its total by at most 1.3 points with
  severity identical.
- Attach the captured desktop and mobile screenshots to the Website Assessment so presentation is
  judged from what a visitor sees rather than body text. Codex and OpenCode accept attachments;
  Claude still reads text and measurements only.
- Rebalance the Opportunity Score to severity 55% and measured defects 10%, reading the worst
  captured page rather than the mean.
- Score recorded per-page measurements instead of how confident the runtime felt. Confidence sat at
  24 to 25 of 25 for every candidate with captured pages while six of eight observed candidates fell
  in one severity band within a point; the measurements now spread them across 7.6 points.
- Require a Website Assessment to classify or explicitly dismiss every deterministic measurement it
  was given, and stop counting the technology a page is built with as an opportunity. Five
  unlabelled controls had gone unmentioned on one business while nine scored severity 3 on another,
  which decided qualification.
- Limit a fully blocked website inspection to severity 4 and confidence 0.6, keep it reviewable, and
  present it as Limited Website Evidence.
- Rename repository, package, workspace, backup, and export identifiers to Open Prospector.
- Present Overview as a fixed list of the 10 most recent Candidate Businesses linking to the Review
  Workspace.
- Load filtered candidate exports, evidence, and contacts in three bounded database queries rather
  than per candidate.
- Split the New Run sheet into bootstrap, form, field, runtime, and preflight components.
- Enforce the repository rule that source comments stay concise, single-line rationale.
- Recognise a business by any route it carries rather than one computed key. Identity matched by
  exact fingerprint, so one business forked on which telephone a run listed first, on whether the
  country code was written, and on whether a telephone was captured at all; three runs produced 20
  records for 15 businesses and a stale score could never be refreshed on the copy it sat on. See
  [ADR 0015](docs/adr/0015-resolve-identity-by-any-shared-route.md).

### Security

- Apply one runtime environment allowlist to probes and task execution, preserving custom Codex
  homes and excluding inherited provider credentials.
- Reject over-limit Suppression Entry reasons consistently at the route and persistence boundaries.
- Document private vulnerability reporting and enable it for the repository.

### Fixed

- Drop a `websiteUrl` the report does not support. `verifyAgainstReport` spread the claimed business
  back into its output, so a rejected address survived, one run storing `renocarserwis.pl` and a
  false WebsiteConfirmed signal. The verified business is rebuilt field by field.
- Confirm a missing Contact Route by the Search Area's locality rather than the report's street
  address, which had put a postcode into the search; one run's confirmation returned nothing for
  three businesses the corrected query finds.
- Search `brief.query` in the report prompt instead of the category alone, so the planned discovery
  angles differ and `ConfirmAbsentWebsite` searches the business it names. See
  [ADR 0018](docs/adr/0018-confirm-an-absent-website-by-search.md).
- Say "reported or confirmed" in the missing-contact exclusion reason, which claimed a verification
  that had never run.
- Keep a business whose telephone arrived from more than one page; the unique contact pair aborted
  corroboration and lost four of ten businesses in one run. Contacts and presences are written once
  each.
- Bound contact verification to the business's own cited sources, so a neighbour's telephone can no
  longer be attributed when the section around the name cannot be located.
- Key a business on the digits of its telephone; `tel. 59 842 82 91` and `59 842 82 91` had
  described two businesses. A telephone holding no digits falls through to website or name.
- Give Codex and Claude assessments the same time budget as OpenCode. They had inherited a
  two-minute default, and five businesses lost their refreshed score.
- Report the Claude CLI as ready when its status names an unread field such as `analyticsDisabled`,
  while still refusing a payload that carries a credential.
- Settle a run stranded midway through cancelling or pausing. Two runs had sat in Cancelling for a
  day; the recovery sweep now cancels what a cancelled run left and keeps what a paused run resumes.
- Rate a dismissible obstacle such as a consent dialog, newsletter overlay, or age gate as severity
  3, not 4. One garage had moved 11.4 points between identical assessments and now reproduces
  within 0.6 points.
- Keep one Website Opportunity per class in application code, since the runtime reported duplicates
  despite the instruction.
- Read a finished reassessment as Reassessed rather than Exhausted, since it names its business and
  has no target to exhaust.
- Give the verification gate a timeout the contended Windows CI runner can meet.
- Capture a screenshot that depicts the page rather than the preloader over it, retried until the
  image can show the text. One home page went from 6 KB of flat colour to 728 KB showing its
  telephone and enquiry action.
- Withhold a screenshot too small to depict the page's text. A flat preloader had been read as a
  broken site at severity 5 and 90.8 when the page held 3,965 characters of services and contact
  details.
- Show one Candidate Business per row, reading its current score, with notes and follow-up carrying
  onto the new score while the decision resets. The workspace had listed 183 rows for 120
  businesses.
- Inspect a one-page website as one page rather than recording a navigation failure for a contact
  fragment.
- Capture HTTPS website evidence: name Basic in the proxy tunnel challenge, stop a tunnel reset from
  crashing the worker, define the transpiler helper inside the inspected page, and record the
  underlying navigation failure in an Inspection Block.
- Invoke each provider's fixed update command and terminate the whole updater process tree when a
  readiness or update command exceeds its bounds.
- Enforce the loopback Host boundary before dynamic pages, Server Component requests, Server
  Actions, and API routes, not just API routes.
- Neutralize spreadsheet formulas in CSV exports, restore unfiltered exports of every candidate,
  prevent responses from being cached or content-sniffed, and exercise review, correction, and
  export round trips in the isolated workspace suite.
- Reject unknown review reasons and over-limit notes or corrections instead of persisting invalid
  state or truncating reader-authored text.
- Key eligible businesses without a telephone or website on a verified contact route, so same-name
  neighbours cannot share candidate or suppression state.
- Keep the Overview candidate table within its pane when all desktop columns are visible.
- Verify the isolated destructive workspace suite with platform-native path semantics on Windows
  and Linux.
- Run dependency setup and browser caching on Node 24 GitHub Actions.
- Wait for runtime readiness before the browser suite decides whether steering is available.
- Disclose when the run list, review queue, or recent-candidate overview holds rows back, and keep
  overview metrics complete beyond those bounds.
- Surface candidate overview database failures instead of empty metrics, including saved Search
  Brief and runtime preferences.
- Keep same-name businesses in one locality separate when their corroborated fingerprints differ.
- Preserve newly created workspace-operation locks while their owner initializes them, and let only
  the owning lease remove a lock file.
- Route browser inspection through an authenticated loopback proxy that validates DNS and connects
  to the approved numeric address, preventing DNS rebinding between validation and connection.
- Show captured screenshots and deterministic measurements in candidate details without exposing
  local artifact paths, and warn that backups are unencrypted and may contain personal data.
- Run the verification gate on Linux and Windows, include the synthetic and isolated workspace
  browser suites on Linux, and require opt-in live runs to finish rather than accepting cancellation
  or infrastructure failure.
- Validate exact backup metadata and non-secret configuration, bound archive entry counts and
  metadata sizes, preserve setup error details, and replace the vulnerable development esbuild
  dependency.
- Give OpenCode discovery only public search tools, while structuring and assessment run with every
  tool denied and external plugins disabled.
- Exhaust the attempt budget of tasks abandoned by repeated worker exits so they settle visibly
  instead of being reclaimed forever.
- Terminate the whole per-task process tree on runtime timeouts, output bounds, and interruptions.
- Give cancellation precedence in final-task settlement, complete taskless late pauses, and repair
  stranded taskless paused runs on resume.
- Restore evidence-backed eligibility when a Suppression Entry is lifted, including scores cleared
  by earlier versions.
- Keep candidate detail infrastructure failures as server errors instead of reporting missing
  candidates.
- Preserve the web process's clickable loopback URL across worker restarts in the combined
  development terminal.
- Stop candidate detail loading on bounded request failures, offer a retry, and preview the actual
  layout while loading.
- Accept the local app on `127.0.0.1` or `localhost` while rejecting foreign browser origins on
  state-changing routes.
- Remove a deleted business's task checkpoints, failures, and business-scoped log entries while
  retaining unrelated run history.
- Update unfinished discovery task input when resuming with another runtime, removing the previous
  provider's configuration.
- Require Supporting Observation timestamps to match the cited evidence supplied to the assessment
  runtime.
- Replay versioned synthetic fixtures through production verification, identity, citation, scoring,
  and qualification rules without network access in the MVP quality gate.
- Exercise the assembled worker pipeline, durable handoffs, restart idempotency, and isolated
  per-business failures in a deterministic offline suite.
- Respond to page scrolling across the full content region while content stays centered and width
  limited.

## [0.0.1] - 2026-08-23

### Added

- Location and category based discovery for independent businesses.
- Public website inspection with source URLs, observation times, and deterministic candidate scoring.
- Durable, resumable execution through a local worker and SQLite workspace.
- Claude, Codex, and OpenCode runtime support through clients installed and authenticated locally.
- Candidate review, correction, suppression, and export workflows.

[Unreleased]: https://github.com/olewandowski1/open-prospector/compare/961156c...HEAD
[0.0.1]: https://github.com/olewandowski1/open-prospector/tree/961156c
