#!/usr/bin/env bash
# Render a long CoinReel in resumable chunks, then join them with the audio.
#
# Usage: scripts/render-chunked.sh <reel-id> [chunk-frames]
#
# Each chunk is a separate video-only file in out/<reel-id>-chunks/, so an
# interrupted render resumes from the first missing chunk. Audio (voice + sfx)
# is rendered once on its own and muxed at the end, which keeps it continuous
# across chunk joins.
set -euo pipefail
cd "$(dirname "$0")/.."

REEL="$1"
CHUNK="${2:-400}"
PROPS="{\"reel\":\"$REEL\"}"
DIR="out/$REEL-chunks"
mkdir -p "$DIR"

FRAMES=$(node -e "console.log(require('./public/reels/$REEL/sim.json').frames)")
echo "frames=$FRAMES chunk=$CHUNK"

npx remotion bundle --log=error >/dev/null 2>&1 || true

i=0
for ((start = 0; start < FRAMES; start += CHUNK)); do
  end=$((start + CHUNK - 1))
  ((end >= FRAMES)) && end=$((FRAMES - 1))
  f="$DIR/part-$(printf %03d $i).mp4"
  if [[ -s "$f" ]]; then
    echo "skip $f (exists)"
  else
    echo "render frames $start-$end -> $f"
    npx remotion render CoinReel "$f.tmp.mp4" --props="$PROPS" --frames="$start-$end" \
      --gl=swangle --concurrency=3 --timeout=300000 --crf=16 --muted --log=error
    mv "$f.tmp.mp4" "$f"
    echo "done $f"
  fi
  i=$((i + 1))
done

echo "mix audio"
node scripts/mix-audio.mjs "$REEL" "$DIR/audio.wav"

ls "$DIR"/part-*.mp4 | sed "s|^|file '$PWD/|; s|$|'|" > "$DIR/list.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$DIR/list.txt" -i "$DIR/audio.wav" \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart "out/$REEL.mp4"
echo "FINISHED out/$REEL.mp4"
