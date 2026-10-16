# Hadith · Listening Pilot

A buildless GitHub Pages audio feasibility test for iPhone 17 / iOS 26. This is not the hadith reader and contains **no hadith text or narration**. All speech is explicitly labelled non-religious test content, generated using the installed macOS Daniel voice at 150 words/minute. Transcripts are in `audio/transcripts.json`.

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
