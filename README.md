# Hadith · MindfulMod reader

The personal reader is at `reader/`: two complete Bukhari entries, unchanged source blocks, Cedar AI narration, and a verified offline bundle. It is an evaluation prototype: the English translations are AI-assisted working translations and the generated narration still needs listening review. The original non-religious audio feasibility pilot remains at the root.

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
- `offline.mjs`, `integrity.mjs`, `sw.js` and generated `release.mjs` own the reader bundle. The worker has only the reader scope; it does not replace the legacy pilot worker or delete pilot caches. Each required file is checked by SHA-256 and byte length. Partial responses are rejected, interrupted saves can reuse verified files, and readiness is rechecked after returning. Cached audio supports single byte ranges. The current bundle is approximately 6.1 MB, including both delivery comparisons. Browser/OS storage eviction remains possible.
- Updates wait for existing reader windows to close, so installing an update does not interrupt a playing session. A waiting update is shown in the offline status. Cache cleanup across old releases is not yet automated; current and legacy pilot caches are preserved.

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

On the iPhone, open the reader from its Home Screen icon, save there, wait for “Ready offline,” enable airplane mode, start the sample and lock the screen. Test the Hadith 1→2 boundary, lock-screen pause/resume, headphones, then reopening at the saved position. Safari and Home Screen installations may have separate saved data. Compare Take A and Take B for word-to-word flow and review every spoken word and name against the full scripts before approving narration.


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

`content/sources/openiti-bukhari/` holds an unchanged, commit-pinned Arabic candidate and its upstream metadata under OpenITI's CC BY-NC-SA 4.0 terms, with attribution and hashes in `manifest.json`. It is not approved reader content. `scripts/import-bukhari.mjs` produces an exact-span inventory under `content/staging/bukhari-ar/`: 97 book sections, 7,390 unique numbered records, 173 absent expected numbers and 10 empty numbered records. These findings do not establish that the corpus is complete, nor that its edition numbering maps to other editions. The raw material includes front matter, chapter text and annotations; the importer does not silently turn those into narration text or repair missing records. The live source record and recordings are unchanged.

Run `node scripts/import-bukhari.mjs --check` to verify the pinned source and generated inventory. `node --test tests/*.test.mjs` checks source/release integrity, search, backup rejection/merge/atomicity, legacy preferences and media ranges. GitHub Reader checks runs these on pushes and pull requests with read-only repository permissions and pinned actions. At that release, Pages still deployed independently. The checked Actions pipeline below replaces that arrangement.


Browser validation for this groundwork release: the exported JSON contained the bookmark saved through the interface. Restore preview, merge, undo and incompatible-file rejection succeeded. A full restore initially exposed a stale-session cursor bug; after correction, the home Continue link pointed to restored Hadith 2 and the night preference survived reload. With the development server stopped, the saved reader reloaded, exact narrator-name search found Hadith 2, and listening resumed at the restored 44-second position. The 320px search layout did not overflow horizontally; the browser reported no runtime errors. These are desktop browser observations. The user subsequently confirmed that Safari on their iPhone saves the JSON backup to Files; iPhone restore and updated lock-screen acceptance remain pending. All 23 automated checks pass. The two public hadith, source blocks and recording bytes remain unchanged.

## Verified book files and publication records · 18 October 2026

The reader now starts from a small collection index and requests a book when reading, source access or exact search needs it. `reader/content-library.mjs` checks both the index and each book against the current release’s byte count and SHA-256, validates the namespace/reference map, shares concurrent downloads and exposes immutable text only after validation. A failed request can be retried. Search loads all published text before reporting results, so an unavailable book cannot produce a misleading “no matches.” Routing ignores stale asynchronous completions and commits a reading place only once the complete entry loads. Session estimates use checked word counts from the index. The current offline worker still installs the complete two-entry text sample; selective full-library downloads remain future work.

`content/review/opening-ledger.json` binds every entry, Arabic block set, English block set, source metadata and collection grouping to exact hashes. `node scripts/publish-books.mjs` generates the catalog and content-addressed JSON files; `--check` verifies committed output. The evaluation allowance is fixed to the existing two entries and their source hash. `--production` deliberately fails with the current ledger: production requires recorded human reviews of Arabic, English and context, reuse evidence, and no unresolved discrepancies. These are software checks of review records, not proof of reviewer identity or scholarly certification. Never create an approval on behalf of a reviewer. Audio approval remains separate.

The legacy content script stays available to the archived design exploration, but the active reader and audio-review page no longer depend on it. The source comparison record, Arabic/English wording, audio recordings, bookmark IDs and backup namespace remain unchanged.

With explicit user approval, the source coverage/offline reuse/narration inquiry was posted as [sunnah-com/api #4160](https://github.com/sunnah-com/api/issues/4160). `research/source-access-request.json` records the exact sent request. Posting a request grants no reuse permission.

Device acceptance: the user confirmed iPhone Safari backup export to Files on 18 October 2026. Restore on iPhone and locked-screen acceptance for the latest reader release remain separate outstanding checks.

Validation for the book-file release: all eight rendered Arabic/English blocks matched the canonical source exactly. A deliberately unavailable book showed a retry screen, left the previous reading place intact, and caused search to report an unavailable collection rather than no matches. Removing that simulated failure let the same search recover. The saved reader reopened with its local server stopped, loaded text, searched, and played Cedar audio. Automated coverage includes a synthetic two-book collection, shared downloads, partial-search refusal, retries, timeouts, altered/partial responses, stale review hashes and rejected production promotion.

## Publishing and recovery

`.github/workflows/reader-checks.yml` defines a single verification → artifact → deployment pipeline. The verify job checks the source/review ledger, pinned Arabic inventory, tests and release hashes before assembling and uploading the site. Only the main branch can reach deploy; that job requires successful verification and refuses to publish an older commit when main has advanced. Workflow runs on the same branch are serialized. Publishing permissions are limited to the deployment job; verification can only read repository and Pages metadata. Actions are pinned to full commit IDs. GitHub’s documented [Pages workflow requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) inform this setup.

Repository Settings → Pages must use **GitHub Actions**, rather than branch publishing. A failed verification leaves the previously deployed site serving. Successful artifact creation alone is not a successful deployment: inspect the deploy job and the live `site-release.json`. That file identifies the Git commit, reader release and every packaged public file’s size and hash. Local previews flag an uncommitted working tree; CI refuses one. `reader-version.json` remains the updater’s exact reader-bundle marker.

For a change, regenerate book packs only when their reviewed inputs intentionally change, then run `node reader/build-release.mjs`. Run `node reader/check-content.mjs`, `node scripts/import-bukhari.mjs --check`, `node --test tests/*.test.mjs` and `git diff --check`. Stage intended files before `node scripts/build-site.mjs /absolute/new/preview-directory`: the builder includes tracked public files only, checks all HTML relative links and every offline dependency, refuses changed release bytes, and never deletes an existing output directory. Source intake, tests, build tools and repository metadata are excluded from the deployed artifact. The earlier audio pilot, landscape gallery and design studies remain available.

For recovery, identify the last verified deployed commit from Actions history and `site-release.json`, then revert the faulty change in a **new commit on main** and let the same checks and deployment run. Do not force-push history, bypass the checks or rerun an obsolete commit to overwrite a newer deployment. Restore source, review records and generated release files together; regenerate and verify if appropriate. A rollback must preserve personal-storage keys and reference namespaces. The waiting service worker and `update.html` let an open reading/listening session finish before moving to the restored bundle.

`reader/about.html` explains local personal data, backups, host requests, offline eviction, AI translation/audio status and the scope of source attribution. It is included offline. The source-correction issue form asks for exact wording, edition/reference evidence and an audio timestamp when applicable; submitting it is a separate user action. A report does not automatically alter canonical text or constitute scholarly approval.

Validation: 38 automated tests pass. The packaged site’s 167 public files and all HTML local links were checked; the reader and information page rendered from the assembled artifact. The source record and all audio bytes remain unchanged. Hosting migration and deployed artifact verification are recorded in `research/production-readiness.json`.

The first checked deployment, commit `1a1c7cbc8f8d80291c4b904c3933706eac789da6`, succeeded in [run 39176522326](https://github.com/mindfulmod/hadith/actions/runs/39176522326). Its live manifest matched all 167 packaged local-file hashes; representative reader, information, audio-pilot, landscape and design-study routes matched their local bytes. The information page rendered at 393px without horizontal overflow or runtime errors. GitHub rendered the source-correction form with the expected reference/evidence fields; no report was submitted.

`research/alternate-arabic-source-audit.json` records a preliminary marker audit of the commit-pinned OpenITI JK000110 witness. Its broad numeric range is 1–7,124, with no absent labels under that pattern, but the pattern also catches six mis-tagged chapter headings, suffixed records and a duplicate 3905. This is an alternate-edition research lead, not a complete-text certification or a mapping to the current Shamela numbering.

## Further source and device evidence · 18 October 2026

The user confirmed that iPhone Safari can restore the exported JSON with the default merge option. This confirms export and merge restore; restoring reading position/settings and updated locked-screen playback remain separate checks.

`content/sources/islamhouse-bukhari/` retains the unchanged 2010 English EPUB distributed by IslamHouse and a commit-pinned copy of its current developer content policy. That policy explicitly permits unchanged attributed offline/app reuse without prior permission; the EPUB’s specific noncommercial restriction is retained. `research/english-source-audit.json` records 7,111 distinct reference headings across 93 books, the conflicting translator credits, abbreviated narrator introductions and source-version differences. These are intake findings, not full-body or translation certification. The candidate is excluded from the reader and deployed Pages artifact.

`python3 scripts/import-english.py --check` verifies the exact source/policy bytes and the reproducible candidate inventory. Python 3.9+ is required; no third-party packages are used. The inventory follows the EPUB spine, accounts for all 29,530 paragraphs in 97 section documents, preserves 7,111 original volume/book/report references including letter suffixes, and stores raw XHTML byte spans and exact decoded-text hashes. Books 59 and 60 each span two documents. It changes no source wording and does not infer alignment with another edition.

The inventory identified seven references containing only a narrator introduction and no narration body. These were confirmed in the original EPUB, so this candidate cannot be presented as a complete source unchanged. Conflicting translator credits and other transcription defects also remain open. `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'` independently compares all paragraph text and source spans and checks missing-section, altered-source, stale-inventory and unsupported-markup failures. The deployment workflow now runs those checks as well as the existing reader tests.

The unchanged `comparison.pdf` from the same official listing was checked at the cover and pages 422, 766, 1020, 1081, 1199, 1449 and 1484. Rendered-page inspection confirmed the same seven omissions; five display question-mark placeholders and two have no body before the next reference. Page 422 also contains a visibly truncated preceding report. The PDF is a comparison witness, not a repair source or a certified complete text. Exact source/version/page evidence is recorded in `research/english-source-audit.json`.
