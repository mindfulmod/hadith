export const recording = {
  "id": "cedar-opening-v1",
  "src": "audio/opening-cedar-v1.m4a",
  "voice": "Cedar",
  "duration": 87.35997732426304,
  "chapters": [
    {
      "number": 1,
      "start": 0,
      "duration": 37.51199546485261
    },
    {
      "number": 2,
      "start": 37.51199546485261,
      "duration": 49.84798185941043
    }
  ],
  "status": "Cedar Take A delivery selected; exact spoken wording and names await listening review"
};

// An unavailable reference must never select a different recording.
export function recordedChapter(number){return recording.chapters.find(chapter=>chapter.number===number)??null;}
