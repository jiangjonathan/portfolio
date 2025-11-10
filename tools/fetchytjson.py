#!/usr/bin/env python3
import requests
import json

def fetch_youtube_metadata(video_url: str):
    """Fetch oEmbed metadata JSON for any YouTube video link."""
    endpoint = "https://www.youtube.com/oembed"
    params = {"url": video_url, "format": "json"}
    response = requests.get(endpoint, params=params)
    response.raise_for_status()
    return response.json()

def main():
    print("🎥 YouTube Metadata Fetcher")
    print("Enter a YouTube link (or 'q' to quit):")

    while True:
        video_url = input("> ").strip()
        if not video_url:
            continue
        if video_url.lower() in {"q", "quit", "exit"}:
            print("Exiting.")
            break
        try:
            data = fetch_youtube_metadata(video_url)
            print(json.dumps(data, indent=2))
        except requests.exceptions.RequestException as e:
            print(f"❌ Error fetching metadata: {e}")
        print("\nEnter another link or 'q' to quit:")

if __name__ == "__main__":
    main()
