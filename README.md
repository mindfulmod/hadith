# Hadith · MindfulMod reader

The personal reader is at `reader/`: two complete Bukhari entries, unchanged source blocks, Cedar AI narration, and separately checked reading/audio downloads. It is an evaluation prototype: the English translations are AI-assisted working translations and the generated narration still needs listening review. The original non-religious audio feasibility pilot remains at the root.

## Run

Serve this folder with any static HTTP server, for example `python3 -m http.server 8767`. No packages, credentials, remote fonts, analytics or paid services are required. HTTPS (or localhost) is needed for offline service-worker support. GitHub Pages uses the checked Actions artifact described in the publishing section below.

## On-device acceptance

Test in Safari and again as a Home Screen app, recording separate reports for each. First use Separate recordings; then compare One continuous recording. Test locked-screen playback, both file transitions, Lock Screen pause/resume, headphones, interruption recovery, saved position after reopening, and offline playback after downloading. A successful desktop test does not certify iPhone background playback. Report iOS point release and output device in notes.

Audio uses one persistent HTML audio element, Media Session controls where supported, and guarded Audio Session playback selection. File transitions are attempted immediately on the ended event. The continuous mode is a comparison, never a silent fallback. Progress and reports are local to the browser installation. No autoplay on opening. Cache storage can be evicted by the OS; downloading is not a permanence guarantee.

## Source policy for the eventual reader

English-first; evaluate Muhammad Muhsin Khan's unabridged Darussalam edition. Establish exact edition and rights before import/narration. Preserve source wording and separate chapter material, numbered narrations and notes. Review each audio file against its source text. Read in book order, offer approximate 5–10 minute sessions ending at complete hadith, and keep bookmarks. Honour spoken forms of symbols only under an explicit agreed policy. No religious content is included in this pilot.

## Follow-up from the iPhone test

User reported locked-screen playback worked on iPhone 17 / iOS 26, but heard screeching through AirPods/Bluetooth throughout the speech. Playback also stopped when opening the Safari session on a Mac. Neither cause is confirmed.

The player now requests its playback audio session only when Play is pressed and publishes media metadata only after that request. It releases the session after completion or a failed play request. This reduces audio-session interaction on a newly opened page.

`audio/reference-uncompressed.wav` is the exact pre-AAC source for recording one, intended to isolate encoding from voice/output-device quality. Its presence is not a claim that it solves the reported screeching. No religious content is present. The original and decoded AAC had no full-scale clipped samples in the local numerical check.

## Narrator auditions

User confirmed transitions and locked-screen playback are satisfactory, and that the harsh electrical quality is present through both headphones and the phone speaker. The British Daniel system voice is rejected as a narrator.

`voices.html` offers Cedar and Marin samples generated through OpenAI.fm with the same ordinary script and a warm, calm, neutral North American delivery instruction. The original downloaded MP3s are preserved without filtering or re-encoding. `audio/auditions.json` records provenance, script and instructions. Auditions require a connection and are not part of the original offline test download. They are AI-generated and contain no hadith. The existing playback test and its tested player are preserved while the user selects the replacement narrator.

Cedar was selected by the user and is now used for the full test. All eventual hadith audio still requires review against the verified source.

## Cedar full test · v2

All three active tracks and the continuous comparison now use Cedar, with the same delivery instructions as the approved audition. Source MP3s and provenance are retained. The first ordinary test script now identifies Cedar rather than calling the narrator temporary. No hadith text is involved.

New versioned audio URLs and cache names prevent reuse of downloaded British recordings. Download again for offline testing. Progress and reports use a fresh Cedar storage key so older positions/results are not mistaken for the new recordings; the earlier local storage remains untouched. The tested playback flow is unchanged. Legacy Daniel files remain in repository history and as inactive diagnostic assets.

## Reader preview · October 2026

The actual two-entry reader is available at `reader/`. It has an illustrated welcome, day/night/device themes, adjustable typography, saved position, bookmarks, explicit read markers, expandable full narrator chains, and an Arabic/source dialog. It now combines reading, Cedar audio and a reader-scoped offline worker. The recorded scripts include both complete English blocks and the honorific wording exactly as displayed; the speech itself is an audition, not a certified narration. The original listening pilot remains at the root.

The current source route supersedes the initial Darussalam-only evaluation plan above: pinned Arabic Wikisource revision 484874 and new AI-assisted English working translations, cross-checked against the Darussalam sample and Aisha Bewley, with witness differences recorded. This is not independent scholarly certification. See `research/source-review.html` and `research/bukhari-opening-review.json`. The reader source bundle must match that JSON exactly.

Run `node reader/check-content.mjs` to verify the full copied record and Arabic hashes. Design research, evidence, palette contrast, architecture decisions and the iPhone acceptance plan are in `research/reader-design.html`. New image prompts and provenance are in `reader/assets/provenance.json`. No accounts or analytics are used. Personal state is local and separate from the pilot; cross-device sync is not implemented.

## Shared visual world

Future artwork follows `research/visual-world.json`, with an illustrated guide at `research/visual-world.html`. The user selected ten anchors from the landscape exploration to define one coherent imagined world of warm terraced valleys, stone gardens, oasis margins and ancient canopy groves. The full anchor record is `research/landscape-shortlist.json`. This supersedes the original island-veranda direction for future generation; the new reader artwork uses that direction as prototype candidates, without promoting those images into the approved reference bank or adding scene rotation. Keep the original imagery and prompt provenance, and inspect the relevant anchors before each new generation.


## Combined reader prototype · 16 October 2026

The comfortable 21px default remains. New day/night welcome scenes and a separate close-detail reading strip follow the shared visual-world guide. Originals and exact prompts are preserved in `reader/assets/originals/` and `reader/assets/garden-provenance.json`. The earlier veranda assets remain available as historical work.

The app stays buildless. Responsibilities are separated:

- `books/catalog.json` identifies content-addressed book files generated from the source record; `check-content.mjs` protects their exact text. `content.js` remains a checked compatibility copy for the archived design concepts. `source-record.json` and the full local comparison page are available offline. Publisher sites and PDFs still require a connection.
- `reader.js` renders source blocks and handles navigation. `store.js` preserves the existing local preference/bookmark key. Reading marks, scroll positions, daily preference and audio position are separate fields. No reading is automatically marked complete by audio.
- `session.mjs` plans approximately 5- or 10-minute sessions using whole entries in order, including finishing a first entry longer than the target. The current two-entry sample is shorter than either target; the UI saves a future daily preference and labels the sample honestly.
- `audio.mjs` owns one persistent audio element outside route rendering. One continuous 87-second file contains both full recordings with chapter cues; no file change is needed at the boundary. Lock-screen metadata and audio-session requests begin only after a user play action. Merely opening a page does not start audio or claim a playback session.
- `offline.mjs`, `offline-store.mjs`, `offline-view.mjs`, `integrity.mjs`, `sw.js` and generated `release.mjs` own separate downloads. Save reading keeps all available text, source notes and artwork (about 2.8 MB). The continuous Cedar recording is selected separately (about 1.4 MB); delivery comparisons are optional (about 2.0 MB). Saving audio also saves reading. Files pass SHA-256 and byte-length checks before storage; partial responses are rejected. Returning checks presence and verification receipts; Check downloads rehashes saved bytes. Interrupted saves reuse complete verified files. Cached audio supports single byte ranges. Browser/OS storage eviction remains possible.
- Updates wait for existing reader windows to close, so installing an update does not interrupt a playing session. A waiting update is shown in the offline status. More download options offers explicit removal of older reader caches; it preserves the current release, personal data, legacy pilot and unrelated library caches. Save wanted audio first to reuse unchanged verified files from an older release. Removing an audio pack is blocked while another responsive reader tab reports playing it, or a relevant tab cannot be checked.

### Narration provenance and review

OpenAI.fm, voice Cedar, model displayed as GPT-4o mini TTS. Two delivery prompts were auditioned on Hadith 1. Take A is used for both entries; Take B is available at `reader/audio-review.html`. Inputs and original MP3 hashes are in `reader/audio/provenance.json`. The main AAC joins decoded recordings without trimming, filtering, word edits or crossfades. English honorifics are read exactly as already written in the source translation, as requested by the user. The technical direction follows [OpenAI's text-to-speech documentation](https://developers.openai.com/api/docs/guides/text-to-speech).

Input strings match every source block exactly. Decoded source recordings have no full-scale clipped samples. These checks do not certify naturalness, pronunciation, omissions or exact spoken wording. Both audio and translation are clearly labelled under review. Human listening and independent scholarly text review remain outstanding.

### Release checks

After any shipped file changes, run:

```sh
node reader/build-release.mjs
node reader/check-content.mjs
node --test tests/*.test.mjs
```

The release builder includes core files, local source notes, both theme artworks and all playback/review audio, while excluding large original artwork. Do not hand-edit generated `release.mjs` or the release-marker line in `sw.js`. The builder changes the worker entry bytes for every bundle so metadata-only releases also trigger an update check. Preserve the canonical source review record and the full narration scripts.

Desktop browser checks: saved bundle reopened with the development server stopped; playback progressed naturally from Hadith 1 to Hadith 2 while browsing and opening sources; local comparison notes opened offline. Day/night, bookmarks, saved preferences, 320px narrow layout and the largest reading size were checked. These results do not establish locked-screen behavior on iPhone.

On the iPhone, open the reader from its Home Screen icon, choose Save reading and Save audio there, wait for both to say “Ready offline,” enable airplane mode, start the sample and lock the screen. Test the Hadith 1→2 boundary, lock-screen pause/resume, headphones, then reopening at the saved position. Safari and Home Screen installations may have separate saved data. Compare Take A and Take B for word-to-word flow and review every spoken word and name against the full scripts before approving narration.


## User acceptance · 17 October 2026

The user selected **Cedar Take A — connected audiobook reading** after comparing the two Hadith 1 takes. Take A was already used in the reader, so no audio files, timing, source wording or playback logic changed. Its generation instructions are the selected delivery baseline for future recordings; future narration still requires its own exact-word and pronunciation review.

The user reported **both hadith played successfully** after the requested Home Screen download, airplane-mode and locked-screen test on their iPhone 17 / iOS 26. This records success for the continuous two-entry sample and the chapter boundary on reader commit `29adc03`, release `opening-aa83576a4c8e`, recording `cedar-opening-v1`. It does not certify separate-file queues, every iOS version or the earlier Mac/Safari interruption case. Pause/resume and reopening behavior were not separately reported in this response.

The remaining content gate is an exact spoken-word/name audit and independent scholarly review of the working translations. Artwork remains a prototype candidate until separately accepted. Delivery selection and device feedback are recorded in `reader/audio/provenance.json`; the comparison page now reflects the selected take.


## Reader palette · 17 October 2026

The user rejected green as the primary interface colour. The accepted replacement is parchment and cocoa by day, and warm plum by night. After the user found the buttons too muted, primary actions were strengthened to copper (#ad4327) by day and vivid apricot (#f2a568) by night. `reader/reader.css` owns the theme tokens; the browser theme colour reads the active background token. Source notes and reader icons use the same warm palette. This changes presentation only; the 21px default, artwork, hadith source blocks and Cedar recordings are preserved.

Calculated sRGB contrast: body text against reading paper is 12.55:1 by day and 11.77:1 by night. Secondary text is at least 4.66:1 across background, paper and wash surfaces; primary button labels are 5.60:1 by day and 7.01:1 by night (hover: 7.35:1 and 8.98:1). Focus accents exceed 4.2:1 against these surfaces. These are palette checks, not a claim of a complete accessibility audit.


## Structural design exploration · 17 October 2026

`research/reader-next/` contains a published research study, an auditable catalogue of 208 public references from 281 candidates, 20 closer studies (including five limited browser interaction samples), and three online concepts. The review distinguishes public-page/documentation evidence from hands-on interactions; it is not 208 installed-app or visual audits. Each reference records an observation, proposed application and evidence limitation; 73 uncounted candidates are disclosed.

The concepts explore direct reading, a finite session and a listening companion. They import `reader/content.js` and `reader/recording.mjs` directly and use the existing continuous Cedar file. No source blocks or recording assets are copied or edited. Prototype preferences/bookmarks use separate `sessionStorage` keys and never touch production reader state. No prototype service worker is registered, and offline support is explicitly left with the existing reader.

The live reader layout remains the baseline while the user evaluates the alternatives. The only production presentation change in this release is stronger primary-button colour. See `research/reader-next/validation.html` for source equality, responsive observations, interaction checks and limits. Run `node research/reader-next/check-study.mjs` to verify ledger counts, study relationships and local links.


## Selected session reader · 18 October 2026

The user selected concept B as the foundation, combined with A's quiet reading and C's dedicated listening view. Returning to the installed app opens the current session with a Continue action and a separate listening choice. The two-entry sample is still labelled shorter than the saved 5- or 10-minute preference.

The production shell now has three coordinated surfaces: the finite session, a whole-hadith reading page with compact artwork and source access, and a listening view with the existing continuous recording and chapter queue. Navigation is at the bottom; the persistent player becomes compact outside the listening view. Opening a listening route alone neither starts playback nor claims the system media session. A user Play/Listen action still starts playback.

`session.mjs` now normalizes and advances a persisted contiguous session. Existing preferences, bookmarks, read marks, scroll positions and audio positions retain their existing storage key. Session cursor and audio chapter are separate. “Read & continue” / “Read & finish session” explicitly mark the current hadith; simply opening a page or playing audio never does. Session completion does not mark skipped entries. Re-reading resets the session's scroll positions and retains bookmarks/read marks. A saved session's contents do not silently grow when more entries are added.

`audio.mjs` remains the sole owner of the persistent audio element, playback position, system media controls and errors. It exposes playback state and a notification to the route shell. Route changes do not recreate the element. `offline.mjs`, range handling and the worker activation policy are unchanged. The source bundle, audio scripts, recording bytes, artwork and source dialog content are unchanged.

Validation for this release is recorded in `research/reader-next/session-validation.html`. Browser checks cover exact equality of all eight rendered source blocks, explicit completion, bookmark persistence, source-dialog focus restoration, responsive layouts, route changes during playback, and the saved reader with the local server stopped. Automated tests cover legacy-state migration, finite session persistence, malformed saved sessions, skipped entries, whole-hadith planning, media ranges and release integrity. These checks do not replace another iPhone Home Screen / locked-screen acceptance pass after the shell update.

## Safari update recovery · 18 October 2026

The user reported still seeing the old layout in a Safari tab. The previous cache-first worker could download a release but wait indefinitely while older reader clients remained open; refreshing an in-scope tab did not necessarily release those clients.

`update.html` intentionally lives outside the reader worker scope. It fetches generated `reader-version.json`, asks the reader registration to check for an update, and queries the active worker over a message port. The Open updated reader action appears only when that active worker reports the expected release. A waiting release gives explicit instructions to close other reader tabs while leaving the updater open. A failed network/version check never claims success. The page does not unregister workers, delete caches/localStorage, force activation, or navigate/reload other tabs.

The reader now has an update notice when a release is waiting and a Check for app updates link under Aa. Returning to a foreground reader also requests an update check at most once per minute. The original rule of allowing active playback to finish is preserved.

Validation: a local server initially served the previous release, then switched to the new one. A bookmarked hadith and active narration remained in the old tab while a second tab opened the updater. The updater displayed the waiting-tab explanation; old audio was still playing at 25.93 seconds. Closing that test tab allowed activation; the updater verified readiness and returned to the new reader, where the bookmark, Continue action and saved listening state remained. Thirteen automated tests pass, including generated-version equality and the worker release handshake. No source text, recordings or artwork changed. iPhone Safari recovery still needs user confirmation.

Platform references: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/update and https://web.dev/articles/service-worker-lifecycle .


## Reading with audio · 18 October 2026

The user confirmed that the Safari recovery page revealed the new session reader, then requested larger artwork, less visual weight for honorifics, direct next/previous navigation and a small player while reading. They selected automatic whole-hadith advancement with a Follow toggle.

The welcome scene now spans the content width, the reading scene is 160–260px high, and the dedicated listening scene is larger. Existing art and the accepted day/night palette are retained. `source-format.mjs` wraps three exact English honorific phrases for smaller, secondary-colour presentation; source characters, punctuation, Arabic and narration scripts are unchanged. The 21px default body uses approximately 16.4px honorifics, with a 15px minimum at smaller settings.

Reading has persistent Previous and Next controls plus equivalent footer navigation. Navigation and ending a session do not mark entries as read; the separate optional Mark as read control owns that state. Listen starts or resumes the current hadith in place. The same persistent audio element appears in a roughly 60px bottom row with play/pause, Follow, close and a link to the full listening view. No duplicate player, recording or sentence-level timing is introduced.

Follow is enabled initially and preserves the user's explicit preference. It changes to the complete next hadith at the existing audio chapter cue and reveals the complete chain. Manual browsing turns Follow off; turning it on rejoins the currently playing hadith. Automatic changes wait while sources/settings are open or the document is hidden. Existing saved places, bookmarks and read marks retain their storage key. Read markers remain independent from listening.

Validation: 15 automated tests cover exact source segmentation/escaping, legacy-state preservation, Follow conditions, release integrity and existing media ranges. All eight rendered English/Arabic blocks were compared with the canonical source and matched exactly. Browser checks covered in-place play, manual navigation while audio continued, Follow rejoining the recording, deferring a chapter transition while sources were open, full-player position preservation, and ending without adding read marks. At 320px with the largest 28px text, day/night layouts had no horizontal overflow. After saving the bundle and stopping the local server, a reload and natural audio transition from Hadith 1 to Hadith 2 succeeded, including the matching text transition. This desktop check does not certify iPhone locked-screen behavior for this new shell; a new device acceptance pass remains pending. Translation and exact spoken-word/name review are still pending.

## Full-library groundwork · 18 October 2026

The active goal is the full production reader, not an enlarged two-entry demo. `research/production-readiness.json` tracks the complete scope, evidence and remaining work. The user selected exact word/phrase search and downloadable backups before topic suggestions or account-based syncing.

The collection page now searches the currently available English and Arabic source blocks, including narrator chains, or goes directly to a hadith number. Results quote source text; display clamping does not alter the stored blocks. Search is local and does not log queries. It currently searches the two public entries, not the staged source candidate.

Aa includes backup download and validated restore. JSON files carry a format version and reference namespace. Restore previews counts, merges bookmarks/read marks without deleting existing ones, and offers an explicit option to restore reading position/settings and reopen the session. Merge can be undone while the dialog stays open. Invalid/oversized/incompatible files are rejected; transactional writes prevent a failed restore from changing live or saved state. Source text and audio are never imported through a personal backup. Valid references not currently loaded are preserved rather than discarded. The original storage key remains unchanged.

`content/sources/openiti-bukhari/` holds an unchanged, commit-pinned Arabic candidate and its upstream metadata under OpenITI's CC BY-NC-SA 4.0 terms, with attribution and hashes in `manifest.json`. It is not approved reader content. `scripts/import-bukhari.mjs` produces an exact-span inventory under `content/staging/bukhari-ar/`: 97 book sections, 7,390 unique numbered records, 173 absent expected numeric labels and 10 empty numbered spans. Absent labels are not automatically missing narrations; the later printed-witness findings below record combined and embedded passages as well as genuine local defects. These findings do not establish that the corpus is complete, nor that its edition numbering maps to other editions. The raw material includes front matter, chapter text and annotations; the importer does not silently turn those into narration text or repair missing records. The live source record and recordings are unchanged.

Run `node scripts/import-bukhari.mjs --check` to verify the pinned source and generated inventory. `node --test tests/*.test.mjs` checks source/release integrity, search, backup rejection/merge/atomicity, legacy preferences and media ranges. GitHub Reader checks runs these on pushes and pull requests with read-only repository permissions and pinned actions. At that release, Pages still deployed independently. The checked Actions pipeline below replaces that arrangement.


Browser validation for this groundwork release: the exported JSON contained the bookmark saved through the interface. Restore preview, merge, undo and incompatible-file rejection succeeded. A full restore initially exposed a stale-session cursor bug; after correction, the home Continue link pointed to restored Hadith 2 and the night preference survived reload. With the development server stopped, the saved reader reloaded, exact narrator-name search found Hadith 2, and listening resumed at the restored 44-second position. The 320px search layout did not overflow horizontally; the browser reported no runtime errors. These are desktop browser observations. The user subsequently confirmed that Safari on their iPhone saves the JSON backup to Files; iPhone restore and updated lock-screen acceptance remain pending. All 23 automated checks pass. The two public hadith, source blocks and recording bytes remain unchanged.

## Verified book files and publication records · 18 October 2026

The reader now starts from a small collection index and requests a book when reading, source access or exact search needs it. `reader/content-library.mjs` checks both the index and each book against the current release’s byte count and SHA-256, validates the namespace/reference map, shares concurrent downloads and exposes immutable text only after validation. A failed request can be retried. Search loads all published text before reporting results, so an unavailable book cannot produce a misleading “no matches.” Routing ignores stale asynchronous completions and commits a reading place only once the complete entry loads. Session estimates use checked word counts from the index. The current offline worker still installs the complete two-entry text sample; selective full-library downloads remain future work.

`content/review/opening-ledger.json` binds every entry, Arabic block set, English block set, source metadata and collection grouping to exact hashes. `node scripts/publish-books.mjs` generates the catalog and content-addressed JSON files; `--check` verifies committed output. The evaluation allowance is fixed to the existing two entries and their source hash. `--production` deliberately fails with the current ledger: production requires recorded human reviews of Arabic, English and context, reuse evidence, and no unresolved discrepancies. These are software checks of review records, not proof of reviewer identity or scholarly certification. Never create an approval on behalf of a reviewer. Audio approval remains separate.

The legacy content script stays available to the archived design exploration, but the active reader and audio-review page no longer depend on it. The source comparison record, Arabic/English wording, audio recordings, bookmark IDs and backup namespace remain unchanged.

With explicit user approval, the source coverage/offline reuse/narration inquiry was posted as [sunnah-com/api #4160](https://github.com/sunnah-com/api/issues/4160). `research/source-access-request.json` records the exact sent request. Posting a request grants no reuse permission.

Device acceptance: the user confirmed iPhone Safari backup export to Files on 18 October 2026. The user later confirmed default merge restore on iPhone. Optional full-place/settings restore and locked-screen acceptance for the latest reader release remain separate checks.

Validation for the book-file release: all eight rendered Arabic/English blocks matched the canonical source exactly. A deliberately unavailable book showed a retry screen, left the previous reading place intact, and caused search to report an unavailable collection rather than no matches. Removing that simulated failure let the same search recover. The saved reader reopened with its local server stopped, loaded text, searched, and played Cedar audio. Automated coverage includes a synthetic two-book collection, shared downloads, partial-search refusal, retries, timeouts, altered/partial responses, stale review hashes and rejected production promotion.

## Publishing and recovery

`.github/workflows/reader-checks.yml` defines a single verification → artifact → deployment pipeline. The verify job checks the source/review ledger, pinned Arabic inventory, tests and release hashes before assembling and uploading the site. Only the main branch can reach deploy; that job requires successful verification and refuses to publish an older commit when main has advanced. Workflow runs on the same branch are serialized. Publishing permissions are limited to the deployment job; verification can only read repository and Pages metadata. Actions are pinned to full commit IDs. GitHub’s documented [Pages workflow requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) inform this setup.

Repository Settings → Pages must use **GitHub Actions**, rather than branch publishing. A failed verification leaves the previously deployed site serving. Successful artifact creation alone is not a successful deployment: inspect the deploy job and the live `site-release.json`. That file identifies the Git commit, reader release and every packaged public file’s size and hash. Local previews flag an uncommitted working tree; CI refuses one. `reader-version.json` remains the updater’s exact reader-bundle marker.

For a change, regenerate book packs only when their reviewed inputs intentionally change, then run `node reader/build-release.mjs`. Run `node reader/check-content.mjs`, `node scripts/import-bukhari.mjs --check`, `node --test tests/*.test.mjs` and `git diff --check`. Stage intended files before `node scripts/build-site.mjs /absolute/new/preview-directory`: the builder includes tracked public files only, checks all HTML relative links and every offline dependency, refuses changed release bytes, and never deletes an existing output directory. Source intake, tests, build tools and repository metadata are excluded from the deployed artifact. The earlier audio pilot, landscape gallery and design studies remain available.

For recovery, identify the last verified deployed commit from Actions history and `site-release.json`, then revert the faulty change in a **new commit on main** and let the same checks and deployment run. Do not force-push history, bypass the checks or rerun an obsolete commit to overwrite a newer deployment. Restore source, review records and generated release files together; regenerate and verify if appropriate. A rollback must preserve personal-storage keys and reference namespaces. The waiting service worker and `update.html` let an open reading/listening session finish before moving to the restored bundle.

`reader/about.html` explains local personal data, backups, host requests, offline eviction, AI translation/audio status and the scope of source attribution. It is included offline. The source-correction issue form asks for exact wording, edition/reference evidence and an audio timestamp when applicable; submitting it is a separate user action. A report does not automatically alter canonical text or constitute scholarly approval.

Validation: 38 automated tests pass. The packaged site’s 167 public files and all HTML local links were checked; the reader and information page rendered from the assembled artifact. The source record and all audio bytes remain unchanged. Hosting migration and deployed artifact verification are recorded in `research/production-readiness.json`.

The first checked deployment, commit `1a1c7cbc8f8d80291c4b904c3933706eac789da6`, succeeded in [run 39176522326](https://github.com/mindfulmod/hadith/actions/runs/39176522326). Its live manifest matched all 167 packaged local-file hashes; representative reader, information, audio-pilot, landscape and design-study routes matched their local bytes. The information page rendered at 393px without horizontal overflow or runtime errors. GitHub rendered the source-correction form with the expected reference/evidence fields; no report was submitted.

`research/alternate-arabic-source-audit.json` now records the full exact-span inventory of the commit-pinned OpenITI JK000110 witness and links the selected printed comparisons described below. This remains an alternate-edition research candidate, not a complete-text certification or an approved cross-edition reference map.

## Further source and device evidence · 18 October 2026

The user confirmed that iPhone Safari can restore the exported JSON with the default merge option. This confirms export and merge restore; restoring reading position/settings and updated locked-screen playback remain separate checks.

`content/sources/islamhouse-bukhari/` retains the unchanged 2010 English EPUB distributed by IslamHouse and a commit-pinned copy of its current developer content policy. That policy explicitly permits unchanged attributed offline/app reuse without prior permission; the EPUB’s specific noncommercial restriction is retained. `research/english-source-audit.json` records 7,111 distinct reference headings across 93 books, the conflicting translator credits, abbreviated narrator introductions and source-version differences. These are intake findings, not full-body or translation certification. The candidate is excluded from the reader and deployed Pages artifact.

`python3 scripts/import-english.py --check` verifies the exact source/policy bytes and the reproducible candidate inventory. Python 3.9+ is required; no third-party packages are used. The inventory follows the EPUB spine, accounts for all 29,530 paragraphs in 97 section documents, preserves 7,111 original volume/book/report references including letter suffixes, and stores raw XHTML byte spans and exact decoded-text hashes. Books 59 and 60 each span two documents. It changes no source wording and does not infer alignment with another edition.

The inventory identified seven references containing only a narrator introduction and no narration body. These were confirmed in the original EPUB, so this candidate cannot be presented as a complete source unchanged. Conflicting translator credits and other transcription defects also remain open. `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'` independently compares all paragraph text and source spans and checks missing-section, altered-source, stale-inventory and unsupported-markup failures. The deployment workflow now runs those checks as well as the existing reader tests.

The unchanged `comparison.pdf` from the same official listing was checked at the cover and pages 422, 766, 1020, 1081, 1199, 1449 and 1484. Rendered-page inspection confirmed the same seven omissions; five display question-mark placeholders and two have no body before the next reference. Page 422 also contains a visibly truncated preceding report. The PDF is a comparison witness, not a repair source or a certified complete text. Exact source/version/page evidence is recorded in `research/english-source-audit.json`.

## Collection browsing and finite sessions · 18 October 2026

The collection opens a book index with exact-text search. Book pages list only available entries and offer separate “Read from…” and “Start a session here” actions. Optional source chapter titles and assignments are checked against the exact book pack; no chapter titles are inferred for the two-entry sample. Book and bookmark lists are paged, and search reaches every match in pages of 30. Returning from a result restores the last search page in memory; queries are not logged or persisted.

Browsing outside a session preserves its plan and continuation point, as requested by the user. Start a session here explicitly replaces it; Next session begins after its actual final entry in catalog order. Plans may cross books and nonconsecutive labels, finish at whole hadith, and stop at the available collection end. Existing valid plans do not grow when more content is published. Read marks and bookmarks stay independent. Narration availability is shown separately, so a text session never promises recordings that do not exist.

`research/navigation-verification.json` records the 53 passing automated checks and browser checks. `node tests/create-browser-fixture.mjs /absolute/new/temporary-directory` creates a clearly labelled local-only library with 95 synthetic entries alongside the two real sample entries, for manual pagination and cross-book session checks. The generator refuses an existing output directory or one inside this repository. These records must never enter the publication ledger.

The packaged reader reopened, searched and browsed with its local server stopped; Cedar crossed the natural first/second-hadith boundary and the reading page followed. All eight rendered source blocks remained exact. These desktop checks do not replace iPhone acceptance or source/voice review. A dedicated search index, edition mappings, headings without report assignments, selective offline packs and full-library audio remain future work.


## Arabic witness inventory and session acceptance · 20 October 2026

The user confirmed on their iPhone that starting a session at Hadith 2, browsing to Hadith 1 and returning to the session leaves Continue at Hadith 2. `research/navigation-verification.json` records this acceptance for release `opening-9b5e73347b22`. Updated locked-screen playback and optional full-place/settings restore remain separate checks.

`content/sources/openiti-bukhari-jk/` retains the unchanged OpenITI JK000110 Arabic file and upstream metadata at the same pinned upstream commit. `scripts/import-bukhari-jk.py` inventories every source byte exactly once: 100 top-level sections, 3,965 chapter/heading-context spans and 7,129 report spans. Six apparent report markers are chapter headings. All 7,124 numeric report labels are present, plus four suffixed labels and a second occurrence of 3905; both duplicate-labelled spans retain separate IDs. These are structural counts, not proof of complete or accurate narration.

The upstream annotator identifies a 2002 comparison witness, with different page and heading numbers, inconsistent heading continuation and removed editorial paratext. The downloaded witness is pinned by its URL and hash; its own colophon says first edition 1423 AH / 2002. It is not the 1987 edition named in the digital header and is not deployed or copied into the reader.

`research/arabic-reference-audit.json` ties selected observations to exact source spans and one-based PDF pages. The witness combines labels 408–409 and 410–411; Shamela contains each corresponding passage under its first label. The passage labelled 4137 in print is embedded in Shamela 4136 and JK 3906. The two JK 3905 occurrences correspond to distinct printed reports 4134 and 4135. Conversely, the empty Shamela sequence at 1161–1165 is followed by a misassigned body under 1167, and the empty 3382 span has a body in the witness. No source is silently repaired or merged. These are AI visual comparisons awaiting independent review, not a complete reference map or scholarly certification.

Run `python3 scripts/import-bukhari-jk.py --check` and `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'`. The checks protect full byte coverage, chapter/record distinctions, duplicate and suffixed IDs, exact evidence pointers, pinned-source integrity and reproducibility. They do not certify the visual judgements or Arabic wording. Neither the live two-entry source bundle nor its Cedar recordings changed.


## Separate offline downloads — 20 October 2026

The user selected all reading material together, with audio chosen separately. The active worker serializes save/check/remove operations across reader tabs, verifies every new or reused file, and retains completed files after cancellation, connection failure or quota errors. Readiness requires the exact release metadata and every dependency. Downloads expose progress, Stop saving, retry, Check downloads, individual audio removal and explicit cleanup of older reader copies. The storage estimate is labelled as shared website space, not guaranteed free phone storage. Keep the app open while saving; partial individual files restart.

`research/offline-packs-verification.json` records 75 passing automated checks (56 Node and 19 Python), unchanged canonical content, offline browser reload/source access and natural Cedar transition, cross-tab removal protection, cleanup/state preservation, and 320px/night/large-type checks. The two-entry sample remains an evaluation; full-collection scale and the revised download flow on iPhone still need acceptance. This does not approve translation or generated speech.


## Opening entries 3–7: traced drafts — 20 October 2026

`content/sources/wikisource-opening/` retains the exact retrieved HTML for Arabic revision 484874. `scripts/import-opening.py` reproduces 17 source blocks: foreword, chapter heading and all seven numbered records, including the final unnumbered transmission note. Decoding does not trim or normalize text. The first two entries match the current reader source exactly.

`content/review/opening-next-drafts.json` contains five new English working drafts, 32 exhaustive Arabic segment mappings, English/Arabic hashes, comparison coverage and explicit unresolved questions. The source’s chain transition in entry 6 and the chain crossing a paragraph boundary in entry 7 remain intact. Khan-family reference 1.1.3 combines source entries 3 and 4; 1.1.4–6 correspond to 5–7. These are content-matched references, not an assumed numerical offset for the entire collection.

The drafts were compared with the selected Arabic, the retained Khan-family English source, Aisha Bewley and visually inspected historical/modern Arabic pages. Differences include a shorter passage in the modern printed entry 5, lahu/laka in that entry, expanded versus abbreviated Qur’anic wording in entry 4 and technical terms requiring review. Do not silently harmonize these witnesses or claim independent review. The publisher’s earlier sample does not supply complete entries 3–7.

`research/opening-next.html` is a generated review artifact, explicitly excluded from reader admission. It preserves each complete draft and exposes Arabic, comparisons and unresolved issues. Run `PYTHONDONTWRITEBYTECODE=1 python3 scripts/import-opening.py --check`, `python3 scripts/check-opening-review.py` and `python3 scripts/build-opening-review.py --check`. The current two-entry catalog, evaluation gate, translations and audio remain unchanged. Resolve the documented choices and obtain the required reviews before production admission or new audio generation.

Review-artifact validation: all 32 rendered English and 32 Arabic segments matched the candidate record exactly. The complete Hadith 7 chain and Hadith 5 source/questions expanded correctly; 393px and 320px layouts had no horizontal overflow. All 81 automated checks pass. The source inquiry had no public reply when checked on 20 October 2026.

## Source structure and unavailable audio (20 October 2026)

`reader/source-structure.mjs` renders reviewed roles in source order: narrator chains, reports, embedded letters and transmission notes. Explicit `presentation` metadata uses `schemaVersion: 1`, with `english` and `arabic` arrays of `{block,start,end,kind}`. Offsets are Unicode code points within unchanged canonical blocks, with inclusive starts and exclusive ends. Every character, including whitespace, must be covered exactly once, without gaps, overlaps or reordering. Only the two existing hash-locked records retain their legacy chain/report mapping; new records require explicit structure. This describes presentation, not a new translation or proof of accuracy.

Both publishing and book loading enforce that structure. Presentation metadata is part of the entry/context review hash, so changing a role or boundary invalidates the recorded approval even if the wording stays the same. The reader groups consecutive chain fragments into a disclosure without moving later chains to the top; letters and transmission notes stay visible in their original position. Follow reveals every chain safely, including when an entry has no separately identified chain.

Audio requests now require an exact recorded reference. Unknown entries cannot activate playback, change position or fall back to Hadith 1. Listening navigation prepares the requested chapter each time without autoplay; an actively playing recording continues uninterrupted. A known text entry without audio has an explanatory listening destination, a reading link and a visible “No audio yet” control. Canonical source text, recording bytes, scripts, chapter timings, artwork and personal-data keys are unchanged.

Validation: 67 Node and 25 Python checks; exact source reconstruction, range omissions/reordering, stale context approvals, unknown audio requests and paused/playing navigation are covered. Browser verification uses the current two entries and a local-only Hadith 7 draft layout; the latter is not a reader admission. Per-entry edition citations, inherited-chain context and unresolved draft questions still need work before the next five records can enter the collection.


## Per-entry sources and inherited-chain context (20 October 2026)

Each catalogued entry now carries its own translation identity, Arabic input, explicit edition/page locators and local comparison-note link. The source panel opens with provenance, then offers complete Arabic and comparison sources in disclosures. It no longer assumes every future entry was compared with the opening Darussalam sample. Reference metadata is separate from narration, bound to the exact source/entry hashes, and requires its own independent human sign-off for production. The current reference review remains pending.

The user selected a brief context note above entries that continue an earlier chain. Such notes must cite evidence and link to an available reference. A chain-target link uses `#read/N/chain`, opens the previous chain and moves focus to it. Source-dialog links close the dialog first; browsing retains the established session behavior. Neither current entry needs an inherited-chain note. Local synthetic records verify this interaction without introducing invented context into the published hadith.

Local comparison-note files are derived into the reading download from the entry records. Publication checks that each destination section exists exactly once. Arabic and local notes work offline; external websites and publisher PDFs still need a connection. The manual test-library generator has explicit source roles, synthetic references and valid separate download packs.

`research/source-reference-verification.json` records 78 Node and 26 Python checks, exact rendered-text comparison, 320px/393px layouts, chain navigation and session preservation, and source access with the local server stopped. Canonical wording, audio, artwork and personal-data keys are unchanged. These checks do not certify translation or narration.

The Hadith 5 draft review now records a precise **proposed, unapplied** Arabic correction from `له` to `لك`, with the corresponding English proposal “for him” to “for you”. Existing printed comparisons and an identified passage in Ibn Hajar’s *Fath al-Bari* support review of a likely digital transcription defect. The original source and draft body are retained. The proposal validator checks its exact span, English target, evidence and pending status; it does not approve or apply a correction. Entries 3–7 remain outside the reader.
