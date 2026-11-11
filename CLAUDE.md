# amvideoeditor

Vertical reels (1080x1920, 30fps) for a personal-finance creator, in Indonesian.
Brand and editing rules: `brand/STYLE.md`. Scripts per reel: `naskah/`.

## Coin-effect reels (CoinReel composition)

1. Put the raw take in `public/recordings/`, write `public/reels/<id>/choreo.json`
   (cues are phrases from the script, resolved against the transcript).
2. `node scripts/prepare-reel.mjs public/recordings/<take>.mp4 <id>`
   (footage, whisper transcript, MediaPipe tracking + person matte, coin simulation).
   After editing choreo.json only: add `--from simulate`.
3. Preview a frame: `npx remotion still CoinReel out/x.png --frame=N --props='{"reel":"<id>"}' --gl=swangle`
4. Render: `npx remotion render CoinReel out/<id>.mp4 --props='{"reel":"<id>"}' --gl=swangle --concurrency=2`
   (run stills one at a time; parallel CLI runs collide).

Setup on a fresh machine: whisper.cpp in `bin/whisper.cpp` with `ggml-small.bin`, RNNoise model `bin/rnnoise/sh.rnnn`
(from GregorR/rnnoise-models, somnolent-hogwash),
`pip install -r scripts/requirements.txt`, MediaPipe models in `bin/mediapipe/`
(hand_landmarker.task, pose_landmarker.task, selfie_multiclass.tflite), and on Linux `libegl1 libgles2`.
Large media in `public/reels/*` is gitignored; `public/reels/_test` uses third-party footage and must never be committed.

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read these installed skill files directly (use these paths even if a same-named global skill exists):
- Core filter, always on: `antislop`: `.claude/skills/antislop/SKILL.md`
- UI / visual: `antislop-ui`: `.claude/skills/antislop-ui/SKILL.md`
- Copy & text: `antislop-copywriting`: `.claude/skills/antislop-copywriting/SKILL.md`
- People: `antislop-human`: `.claude/skills/antislop-human/SKILL.md`
- Mobile / responsive: `antislop-layoutmobile`: `.claude/skills/antislop-layoutmobile/SKILL.md`
- Code comments: `antislop-code`: `.claude/skills/antislop-code/SKILL.md`
Before starting, follow the core's "Two Usage Modes" section in strict order: explicit session instruction first, then global preference, then ask. A session instruction always wins. For a resolved mode, say `antislop active: <mode> (session override).` or `antislop active: <mode> (global preference).` once before presenting findings or making edits, using the actual mode and source. Acknowledging the user's request without naming the source does not replace this notice.
Only an explicit choice of antislop during or after selects a session mode. A request to review, audit, or avoid file edits does not select a mode; read the global preference in that case. Another skill's mode does not select antislop's mode.
If the mode is unresolved, ask during/after and end the response; wait for the answer before any UI review, planning, or concept. For read-only tasks, put the active-mode notice only at the start of the final answer, never in progress messages. For editing tasks, announce before the first edit and omit it from the final answer.
To update antislop later: `npx antislop-ai --update`, or run `npx antislop-ai` and pick Overwrite them.
<!-- antislop:end -->
