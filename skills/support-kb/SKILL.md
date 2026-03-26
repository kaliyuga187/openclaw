---
name: support-kb
description: Draft support responses using a company's own knowledge base. Use when asked to set up a support knowledge base, answer support tickets using company docs, draft responses to customer questions, ingest FAQ or documentation for support use, or build a system for handling incoming support requests from email, Slack, or Discord.
---

# Support Knowledge Base

Ingest a company's docs, FAQs, and past tickets — then draft accurate, on-brand responses to incoming support questions.

## Workflow

1. **Ingest knowledge** — load docs, FAQs, and past tickets into context
2. **Set tone** — establish the company's support voice
3. **Draft responses** — answer incoming questions using only ingested knowledge
4. **Review + send** — human reviews, then sends via the configured channel

## Step 1: Ingest Knowledge Sources

**From a website / help center:**
```bash
summarize "https://company.com/help" --length xxl
summarize "https://company.com/faq" --length xxl
```

**From a Notion knowledge base:**
Use the `notion` skill to query the relevant database or pages and read their content.

**From a Google Drive / Docs folder:**
Use the `gog` skill to list and read the relevant support docs.

**From local files (PDFs, markdown, text):**
```bash
summarize "/path/to/support-docs.pdf" --length xxl
cat /path/to/faq.md
```

**From past tickets:**
Export tickets as CSV or text and paste into context, or summarize a batch:
```bash
summarize "/path/to/tickets-export.txt" --length long
```

See [references/ingestion-guide.md](references/ingestion-guide.md) for tips on structuring and prioritizing knowledge sources.

## Step 2: Set the Support Voice

Before drafting responses, establish tone. Ask the user:
- "Formal or casual?"
- "Do you have any past responses I can match the tone from?"
- "Any phrases or words to always avoid?"

Store this as a short style note to reference when drafting.

## Step 3: Draft Responses

For each incoming question:
1. Search ingested knowledge for relevant information
2. Draft a response using **only** what's in the knowledge base — never guess or hallucinate facts
3. Flag if the question isn't covered in the knowledge base (don't fabricate)
4. Keep responses short: answer the question, link to docs if needed, offer next step

**Template structure:**
```
Hi [Name],

[Direct answer to the question in 1–2 sentences.]

[Optional: link to relevant doc or FAQ page]

[If needed: next step or escalation path]

[Sign-off]
```

## Step 4: Send via Channel

**Email (himalaya):**
```bash
himalaya reply --id <message-id> --body "Response text"
```

**Slack:**
Use the `slack` skill to post or reply in the support channel.

**Discord:**
Use the `discord` skill to reply in the support thread.

See [references/ingestion-guide.md](references/ingestion-guide.md) for channel-specific formatting tips.

## Key Rules

- Only answer from ingested knowledge — if unsure, say "I don't have that info, let me check" rather than guessing
- Always have a human review before sending; this drafts, it doesn't auto-send
- When a question reveals a gap in the knowledge base, flag it so the docs can be updated
- Refresh knowledge ingestion whenever docs are updated significantly
