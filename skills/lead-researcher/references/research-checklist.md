# Lead Research Checklist

## Signals to Gather

Work through these in order of effort. Stop when you have enough for a strong angle.

### Tier 1: Quick wins (2–3 min)

- [ ] **Website homepage** — what do they claim to do? What pain do they solve?
- [ ] **About page** — founding story, team size, mission
- [ ] **Services/Products page** — what do they sell and to whom?
- [ ] **Recent blog post or announcement** — what are they talking about right now?

```bash
summarize "https://company.com" --length medium
summarize "https://company.com/about" --length short
summarize "https://company.com/blog" --length short
```

### Tier 2: Deeper signals (5–10 min)

- [ ] **LinkedIn company page** — headcount, recent posts, hiring activity
- [ ] **Job postings** — what roles are they hiring? Reveals growth areas and pain points
- [ ] **Recent press / news mentions** — funding, launches, partnerships, awards
- [ ] **Their customers** — who do they serve? (Check case studies, testimonials)

```bash
# Summarize a specific blog post or press release
summarize "https://company.com/blog/recent-post" --length medium
```

### Tier 3: Local / specific (if needed)

- [ ] **Google Places lookup** — location, reviews, industry category
- [ ] **RSS / blog feed monitoring** — what topics do they consistently publish about?

```bash
goplaces "CompanyName City"
blogwatcher add "Company" https://company.com/feed
blogwatcher scan
```

## What to Look For

### Buying signals (they need what you're selling)
- Hiring for a role your service could replace or augment
- Recently funded (have budget + urgency to execute)
- Just launched a new product or market expansion
- Blog post about a problem you solve
- Team growing fast (scaling pains)

### Conversation angles
- Recent win to congratulate: "Congrats on the Series A — what's next?"
- Shared perspective: "Read your post on X — completely agree / here's a different take"
- Specific problem: "Most [their role] at [company size] struggle with Y — how are you handling it?"
- Mutual connection or shared context: reference it early

## What NOT to Do

- Don't reference anything that could feel creepy (personal social media, photos, etc.)
- Don't list 5 things you found — pick the single strongest angle
- Don't mention you "researched" them — just demonstrate that you did
- Don't send until you can finish this sentence: "I'm reaching out because specifically for them..."
