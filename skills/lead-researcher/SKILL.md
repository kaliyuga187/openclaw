---
name: lead-researcher
description: Research a prospect and generate a personalized outreach message. Use when asked to research a company, prospect, or lead and write a cold email, LinkedIn message, DM, or outreach pitch — or when asked to do prospect research, find talking points for outreach, or personalize a sales message for a specific company or contact.
---

# Lead Researcher

Research a target company or contact, then generate a personalized outreach message based on specific angles relevant to their business.

## Workflow

1. **Get the target** — company name, website URL, LinkedIn URL, or contact name
2. **Research** — gather intel from website, recent news, and public signals
3. **Identify angle** — pick the strongest hook relevant to what you're selling
4. **Write outreach** — generate personalized message(s) for the requested channel
5. **Deliver** — ready-to-send copy with subject line / opener + follow-up option

## Step 1: Research the Target

**Summarize their website:**
```bash
summarize "https://company.com" --length medium
summarize "https://company.com/about" --length medium
```

**Look up local business details (if applicable):**
```bash
# requires GOOGLE_PLACES_API_KEY
goplaces "CompanyName City"
```

**Check for recent news / blog posts:**
```bash
# add their blog to blogwatcher and scan
blogwatcher add "CompanyName Blog" https://company.com/blog
blogwatcher scan
blogwatcher articles
```

**Summarize a specific recent article or announcement:**
```bash
summarize "https://company.com/blog/recent-post" --length short
```

See [references/research-checklist.md](references/research-checklist.md) for a full intel-gathering checklist and what signals to look for.

## Step 2: Identify the Angle

Choose one primary hook per outreach. Don't stack multiple angles in one message.

| Signal | Angle |
|---|---|
| Recent funding / launch | Congratulate + tie to pain point |
| Recent blog post / content | Reference their POV, add to the conversation |
| Hiring for a role | Connect their growth need to your offer |
| Specific tool/stack they use | Show you understand their workflow |
| Industry pain point | Lead with the problem, not your product |

## Step 3: Write the Outreach

**Email:**
- Subject: specific, under 7 words, reference their company or content
- Opener: 1 sentence that proves you did homework (reference the angle)
- Body: 2–3 sentences max — what you do + why it's relevant to them specifically
- CTA: one low-friction ask (15-min call, quick question, reply yes/no)

**LinkedIn DM:**
- 3–4 sentences max, no pitch in the first message
- Lead with the angle, end with a genuine question

**WhatsApp / direct:**
```bash
wacli send "+1234567890" "message text here"
```

**Email via himalaya:**
```bash
himalaya send --to "contact@company.com" --subject "Subject" --body "Body"
```

See [references/outreach-templates.md](references/outreach-templates.md) for channel-specific templates and A/B variants.

## Key Rules

- Personalized outreach gets 3–5x the response rate of templates — specificity is the whole point
- Never fabricate facts; only use what was found in research
- One CTA per message — asking for too much kills replies
- Write a follow-up message at the same time (send if no reply in 3–5 days)
