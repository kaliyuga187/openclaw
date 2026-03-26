---
name: content-repurpose
description: Repurpose long-form content into 10+ short-form pieces. Use when asked to repurpose, remix, chop up, or transform a podcast episode, YouTube video, blog post, transcript, PDF, or any long-form content into short-form outputs like tweets, LinkedIn posts, email newsletters, Instagram captions, or thread breakdowns — all in the creator's own voice.
---

# Content Repurpose

Turn one piece of long-form content into many short-form outputs, matched to the creator's voice.

## Workflow

1. **Get the source** — URL, transcript, audio file, PDF, or raw text
2. **Extract content** — use `summarize` or `openai-whisper` (see below)
3. **Identify voice** — ask for 2–3 examples of the creator's past writing if not obvious
4. **Generate outputs** — produce all requested formats in one pass
5. **Deliver** — paste outputs ready to copy, grouped by platform

## Step 1: Extract Source Content

**URL / article / blog post:**
```bash
summarize "https://example.com/post" --length xl
```

**YouTube video:**
```bash
summarize "https://youtu.be/VIDEO_ID" --youtube auto --length xl
```

**Local audio/video file (transcribe first):**
```bash
whisper audio.mp3 --model turbo --output_format txt
# then work from the .txt output
```

**Local PDF:**
```bash
summarize "/path/to/file.pdf" --length xl
```

**Podcast URL:**
```bash
summarize "https://pod.link/episode" --length xl
```

## Step 2: Identify Voice

Before generating, ask: "Do you have 2–3 examples of your existing posts I can match?"

If yes: analyze cadence, sentence length, vocabulary, and tone before writing.
If no: default to clear, direct, first-person, no corporate jargon.

## Step 3: Generate Outputs

Default output set (adjust based on what the user asks for):

| Format | Count | Length |
|---|---|---|
| Tweets / X posts | 5 | ≤280 chars each |
| LinkedIn post | 1 | 150–300 words, hook + body + CTA |
| Email newsletter | 1 | 200–400 words, subject line included |
| Instagram caption | 2 | 125 chars + hashtags |
| Twitter/X thread | 1 | 6–10 tweets, numbered |
| Short-form hook | 3 | One punchy sentence each |

See [references/format-guide.md](references/format-guide.md) for detailed format specs and examples per platform.

## Key Rules

- Extract the **3–5 core insights** from the source first; all outputs must come from these, not hallucinated extras
- Every output should feel like the creator wrote it, not an AI summary
- Use the creator's actual phrases and examples from the source where possible
- For LinkedIn: hook line must be compelling without "see more"
- For email: write 3 subject line options and let the creator pick
