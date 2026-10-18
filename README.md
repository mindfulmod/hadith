# Hadith · MindfulMod reader

The personal reader is at `reader/`: two complete Bukhari entries, unchanged source blocks, Cedar AI narration, and a verified offline bundle. It is an evaluation prototype: the English translations are AI-assisted working translations and the generated narration still needs listening review. The original non-religious audio feasibility pilot remains at the root.

## Run

Serve this folder with any static HTTP server, for example `python3 -m http.server 8767`. No packages, credentials, remote fonts, analytics or paid services are required. HTTPS (or localhost) is needed for offline service-worker support. Use GitHub Pages, deploying from the main branch root.

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

- `content.js` is a verbatim copy of the reviewed source record; `check-content.mjs` protects it. `source-record.json` and the full local comparison page are available offline. Publisher sites and PDFs still require a connection.
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
