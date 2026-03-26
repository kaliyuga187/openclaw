---
name: proposal-generator
description: Generate a professional proposal or statement of work (SOW). Use when asked to write a proposal, create a statement of work, draft a project brief, build a client proposal, generate a quote document, or prepare a scope-of-work for a client — including filling in scope, timeline, pricing, deliverables, and terms.
---

# Proposal Generator

Generate a professionally formatted proposal or SOW from a short conversation or intake, ready to send to a client.

## Workflow

1. **Run intake** — gather the 6 key inputs (see below)
2. **Choose format** — Google Doc, Markdown, or PDF
3. **Generate sections** — produce all standard sections in one pass
4. **Review pricing** — confirm numbers before delivering
5. **Deliver** — formatted document ready to send or copy-paste

## Step 1: Intake

Ask for these 6 inputs before writing anything. If any are missing, ask — don't guess.

| Input | Example |
|---|---|
| Client name + company | "Acme Corp / Jane Smith" |
| Project description | "Redesign their e-commerce checkout flow" |
| Key deliverables | "New wireframes, 3 design rounds, final Figma file" |
| Timeline | "6 weeks, starting April 1" |
| Pricing | "$8,500 flat / $150/hr / TBD" |
| Your company name | "Studio XYZ" |

Optional but useful: any known constraints, revision limits, payment terms, kill fee.

## Step 2: Generate the Proposal

Standard sections to include:

```
1. Cover / Header       — Your name, client name, date, project title
2. Executive Summary    — 2–3 sentences: what you're doing and why it matters
3. Scope of Work        — Bulleted list of exactly what's included
4. Out of Scope         — What's explicitly NOT included (prevents scope creep)
5. Deliverables         — Concrete outputs with format and quantity
6. Timeline             — Phase breakdown or milestone table
7. Investment           — Pricing table: line items, subtotal, payment schedule
8. Terms                — Revision policy, kill fee, IP ownership, confidentiality
9. Next Steps           — How to approve (sign here, reply to accept, etc.)
```

See [references/section-guide.md](references/section-guide.md) for detailed guidance on each section, common language, and pricing structures.

## Step 3: Output Formats

**Markdown (default — paste anywhere):**
Generate directly in the conversation.

**Google Doc:**
Use the `gog` skill — create a new Doc, paste content, share link with client.

**PDF:**
Generate Markdown first, then:
```bash
# convert with pandoc if available
pandoc proposal.md -o proposal.pdf
```

**Template in assets:**
See [assets/proposal-template.md](assets/proposal-template.md) for a blank Markdown template to fill in.

## Key Rules

- Always write an "Out of Scope" section — this is as important as what's included
- Pricing section: show line items, not just a total (builds trust and reduces negotiation)
- Write a "Next Steps" CTA at the end — tell the client exactly what to do to move forward
- If pricing is TBD, leave a placeholder and note it clearly rather than guessing
- Offer to write a shorter 1-page version if the client asked for something quick
