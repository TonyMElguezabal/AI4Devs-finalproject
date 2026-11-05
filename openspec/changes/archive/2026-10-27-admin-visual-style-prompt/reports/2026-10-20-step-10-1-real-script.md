# Step 10.1 Report - Real script with the "Warry" visual style prompt

- Date: 2026-10-20
- Change: admin-visual-style-prompt (JOS-201)
- Agent: Claude Sonnet 5.5

## Setup
- Real backend on port 3199 with a throwaway `DB_PATH` and `PROJECTS_ROOT`; frontend on 5173. Prompt and reference image were saved by the User on `/admin`.
- Only `OPENAI_KEY` and `ELEVENLABS_KEY` were available, so the Fal and RunningHub stages could not call a provider. Decomposition waits on the voice-over's narration timestamps, which is why ElevenLabs was needed.
- Script (5 sentences, English): "Most people think getting rich requires a genius-level strategy. Warren Buffett says the opposite: be patient and let compound interest work for decades. A small amount invested early grows into a fortune, while waiting costs you years you cannot get back. The market will crash many times, and the winners are the ones who keep calm and keep holding. Start today, stay consistent, and time will do the heavy lifting."
- The run stored `visual_style_prompt` (2,255 characters, starting "You are an AI visual prompt engineer...").

## Result
Decomposition produced 3 scenes (the style prompt asks to merge ideas). Every `IMAGE` instruction repeats the full Warry description: elderly billionaire investor, silver side-parted hair, thick gray eyebrows, black rounded rectangular glasses, navy suit, white shirt, red tie, brown leather shoes, full body, clean 2D cartoon on white with bold outlines. Verified for scenes 1, 2 and 3. PASS.

## Generated instructions
### Scene 1

IMAGE: Create a single horizontal 16:9 clean 2D cartoon illustration on a white background with bold outlines, simple soft shading, and slightly exaggerated proportions, featuring Warry, a cartoon version of Warren Buffett: a friendly elderly billionaire investor with a large expressive head, fair warm-toned skin, neatly combed silver side-parted hair, thick gray eyebrows, black rounded rectangular glasses, a gentle confident smile, a dark navy business suit, white dress shirt, bright red tie, and brown leather shoes, shown full-body with a trustworthy, approachable personality. Place a small crossed-out maze of complicated strategy arrows to his left and a clear sequence of increasingly tall coin stacks beneath calendar markers labeled 10, 20, and 30 years to his right, while Warry keeps one hand in his pocket and points reassuringly toward the long-term compounding path.

VIDEO: Animate Warry giving the complicated maze a brief skeptical eyebrow raise, then turning his gaze toward the growing coin stacks with a gentle smile and a small pointing gesture. Keep the camera and all graphic elements fixed, using only subtle character gestures and natural blinking throughout the fragment, with no speech, lip-sync, or audio.

### Scene 2

IMAGE: Create a single horizontal 16:9 clean 2D cartoon illustration on a white background with bold outlines, simple soft shading, and slightly exaggerated proportions, featuring Warry, a cartoon version of Warren Buffett: a friendly elderly billionaire investor with a large expressive head, fair warm-toned skin, neatly combed silver side-parted hair, thick gray eyebrows, black rounded rectangular glasses, a gentle confident smile, a dark navy business suit, white dress shirt, bright red tie, and brown leather shoes, shown full-body with a trustworthy, approachable personality. Beside Warry, show two simple parallel investment timelines ending at the same finish line: an upper path labeled START EARLY begins with one small coin and compounds into a towering coin stack, while a lower path labeled START LATE begins after several faded calendar pages and ends with a much smaller stack, with Warry keeping one hand in his pocket and pointing to the early starting coin.

VIDEO: Animate Warry briefly lowering his eyebrows with concern as he looks at the lost calendar years, then giving the early starting coin a small encouraging pointing gesture and a confident nod. Hold the camera, timelines, calendars, and coin stacks completely still, allowing only restrained facial and body gestures with natural blinking and no speech, lip-sync, or audio.

### Scene 3

IMAGE: Create a single horizontal 16:9 clean 2D cartoon illustration on a white background with bold outlines, simple soft shading, and slightly exaggerated proportions, featuring Warry, a cartoon version of Warren Buffett: a friendly elderly billionaire investor with a large expressive head, fair warm-toned skin, neatly combed silver side-parted hair, thick gray eyebrows, black rounded rectangular glasses, a gentle confident smile, a dark navy business suit, white dress shirt, bright red tie, and brown leather shoes, shown full-body with a trustworthy, approachable personality. Show a long market chart with several dramatic red downturns followed by recoveries behind Warry, who stands calmly holding a small investment jar close to his body and points toward a conveyor belt marked TODAY with evenly spaced coin deposits, ending at a large calendar-shaped crane labeled TIME that lifts a heavy stack of coins.

VIDEO: Animate Warry taking a subtle steadying breath while holding the investment jar securely, then smiling and giving a small affirmative nod toward the TODAY deposit point. Keep the camera, market chart, conveyor belt, deposits, and calendar crane fixed, using only gentle character gestures and natural blinking, with no speech, lip-sync, or audio.

