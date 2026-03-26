# Knowledge Ingestion Guide

## What to Ingest (Priority Order)

### Tier 1: Core knowledge (always ingest)

1. **FAQ / Help Center** — the most common questions already answered
2. **Product documentation** — how the product actually works
3. **Pricing page** — customers always ask about pricing
4. **Policies** — refund, shipping, cancellation, SLA

```bash
summarize "https://company.com/faq" --length xxl
summarize "https://company.com/docs" --length xxl
summarize "https://company.com/pricing" --length medium
```

### Tier 2: Supplementary knowledge (ingest as needed)

- Past resolved tickets (export from Zendesk / Intercom / Linear)
- Internal runbooks and escalation paths
- Known bugs / workarounds list
- Changelog / recent updates (customers ask "why did X change?")

### Tier 3: Channel-specific

- Notion: use `notion` skill to query the support database
- Google Drive: use `gog` skill to list and read support docs
- Local files: `summarize "/path/to/file.pdf"` or `cat file.md`

## Structuring the Knowledge Base

When ingesting multiple sources, organize knowledge by topic so responses stay accurate:

```
Topic areas to separate:
- Account / billing
- Product usage / how-to
- Technical / bugs
- Policies (refund, shipping, cancellation)
- Integrations / third-party
```

If ingesting a large knowledge base (>20k words), summarize by topic rather than loading everything into context:

```bash
# Summarize a specific topic from the docs
summarize "https://company.com/docs/billing" --length long
```

## Handling Knowledge Gaps

When a question can't be answered from the knowledge base:

1. **Don't guess** — explicitly flag: "I don't have documentation on this — it needs human review"
2. **Log the gap** — note the unanswered question so the docs can be updated
3. **Escalate path** — route to the right person (technical, billing, executive)

Common escalation triggers:
- Account cancellation requests
- Billing disputes over $X
- Bug reports affecting multiple users
- Legal or compliance questions
- Requests from VIP / enterprise accounts

## Keeping Knowledge Fresh

- Re-ingest after major product updates or policy changes
- Track the date of each ingestion session
- If a response is corrected by a human, update the underlying doc

## Response Quality Checks

Before delivering a drafted response:

- [ ] Does it answer the actual question asked?
- [ ] Is everything stated factually accurate based on ingested knowledge?
- [ ] Is the tone consistent with the brand voice?
- [ ] Is it concise? (Cut anything that doesn't help the customer)
- [ ] Does it include a clear next step or resolution path?

## Channel Formatting

**Email responses:**
- Subject: `Re: [original subject]`
- Greeting: "Hi [Name],"
- Body: direct answer first, context second
- Sign-off: team name or agent name based on company convention

**Slack:**
- Reply in thread, not channel (avoids noise)
- Use code blocks for technical instructions
- Mention the user (@name) for visibility

**Discord:**
- Reply in the original thread
- Pin resolved answers if others might have the same question
- Use slash commands for common actions if configured
