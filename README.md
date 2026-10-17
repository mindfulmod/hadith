# Hadith · Listening Pilot

A buildless GitHub Pages audio feasibility test for iPhone 17 / iOS 26. This is not the hadith reader and contains **no hadith text or narration**. The active test is explicitly labelled non-religious AI-generated speech, narrated by the user-selected Cedar voice through OpenAI.fm. Transcripts are in `audio/transcripts.json`.

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

The actual two-entry reader is available at `reader/`. It has an illustrated welcome, day/night/device themes, adjustable typography, saved position, bookmarks, explicit read markers, expandable full narrator chains, and an Arabic/source dialog. It is a design and content preview; it has no hadith audio and does not yet register a reader offline worker. The original listening pilot remains at the root.

The current source route supersedes the initial Darussalam-only evaluation plan above: pinned Arabic Wikisource revision 484874 and new AI-assisted English working translations, cross-checked against the Darussalam sample and Aisha Bewley, with witness differences recorded. This is not independent scholarly certification. See `research/source-review.html` and `research/bukhari-opening-review.json`. The reader source bundle must match that JSON exactly.

Run `node reader/check-content.mjs` to verify the full copied record and Arabic hashes. Design research, evidence, palette contrast, architecture decisions and the iPhone acceptance plan are in `research/reader-design.html`. New image prompts and provenance are in `reader/assets/provenance.json`. No accounts or analytics are used. Personal state is local and separate from the pilot; cross-device sync is not implemented.

## Shared visual world

Future artwork follows `research/visual-world.json`, with an illustrated guide at `research/visual-world.html`. The user selected ten anchors from the landscape exploration to define one coherent imagined world of warm terraced valleys, stone gardens, oasis margins and ancient canopy groves. The full anchor record is `research/landscape-shortlist.json`. This supersedes the original island-veranda direction for future generation; it does not itself replace the current reader artwork or approve any scene-rotation behavior. Keep the original imagery and prompt provenance, and inspect the relevant anchors before each new generation.
