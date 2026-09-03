"""Isolated benchmark helper. It never imports ContentOS or writes to its database."""
import json
import sys
from youtube_transcript_api import YouTubeTranscriptApi

video_id = json.load(open(sys.argv[1], encoding="utf-8"))["videoId"]
transcript = YouTubeTranscriptApi().fetch(video_id, languages=["en", "hi"])
segments = [
    {"text": item.text, "startMs": round(item.start * 1000), "durationMs": round(item.duration * 1000)}
    for item in transcript
]
json.dump({"language": transcript.language_code, "captionType": "automatic" if transcript.is_generated else "manual", "segments": segments}, open(sys.argv[2], "w", encoding="utf-8"))
