# Digestlit

Digestlit reads the new papers in your field for you. You give it research questions and keywords; every week or two it finds what was just published, reads each paper, and writes a Word report on what is new, how it bears on your question, and where it agrees or disagrees with earlier work. At the end of the month it can build a bigger report, from all the papers or only the ones you pick.

Live at <https://digestlit.vercel.app>.

## Status

| Phase | What | State |
| --- | --- | --- |
| 1 | Skeleton: site, sign-in, empty pages, the Digestlit look | Done |
| 2 | Trackers and paper search | Next |
| 3 | AI keys and the free tier | |
| 4 | The weekly/biweekly report and the scheduled worker | |
| 5 | Monthly section | |
| 6 | Polish and open up | |

## How it is built

- **Static site, no build step.** Plain HTML, CSS and JavaScript modules in `public/`. Vercel serves the folder as it is; `vercel.json` sends every page address to `index.html`, so links like `/trackers` work on refresh.
- **Hosting:** Vercel (free Hobby plan).
- **Accounts and data:** Supabase. Sign-in is an email magic link (no passwords). Only the public (publishable) key is in the site, in `public/js/config.js`. Row Level Security is on for every table; the rules are in `supabase/`. The Supabase JavaScript library loads from jsDelivr, pinned to one version.
- **Coming later:** a GitHub Actions worker that wakes once a day, runs every tracker that is due, and saves the Word reports.

### Files

```
public/
  index.html        page shell: top bar, footer
  css/main.css      the look: off-white, navy, one muted gold accent, serif headings
  js/app.js         routing and the sign-in gate
  js/auth.js        magic-link sign-in and the profile (Supabase)
  js/pages.js       Home, Dashboard, Trackers, Reports, Monthly, Settings, Get a key, Logo
  js/logo.js        the "Dl" monogram, in three versions
  js/config.js      public Supabase settings
  icons/icon.svg    site icon
supabase/schema.sql profiles table and its security rules (run in the Supabase SQL Editor)
vercel.json         Vercel settings
```

### Setting up Supabase

1. Create a project and run `supabase/schema.sql` in the SQL Editor.
2. Authentication → URL Configuration: set the Site URL to `https://digestlit.vercel.app` and add `https://digestlit.vercel.app/**` to the redirect URLs.
3. Put the project URL and publishable key in `public/js/config.js`.

Supabase's built-in email sender is for testing: it only delivers to the project team's addresses and sends a few emails an hour. Before Digestlit opens to everyone (Phase 6), sign-in email needs its own SMTP sender.
