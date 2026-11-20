# Akta Paneri: portfolio site

A static portfolio: plain HTML, CSS and vanilla JS, no frameworks, no analytics, no cookies, no third-party requests.
Four case studies, each with a public short form and a password-protected long form.

The long forms are **really encrypted** (AES-256-GCM, key from PBKDF2-SHA256 with 600,000 iterations). The plain text lives
only in the git-ignored `private/` folder. The published page carries ciphertext, and the browser decrypts it after you type the password.

## Status: first build

- The long forms are still encrypted with the **placeholder password**, which is printed in `tools/build.mjs`. They are **not protected** until you set your own (see "Set the password"). Do this before the first push.
- Email, LinkedIn, resume, portrait and all screenshots are placeholders. `private/TODO.md` lists everything, including 91 `[FILL]` data points from the source docs.
- Medium handle `aktapaneri` is set, but the first fetch has not run yet, so the Writing page shows three labelled sample posts.

## Security: read before publishing

1. **Never upload the `private/` folder.** It holds the plain-text long forms, source docs, screenshots, the password file, `TODO.md` and `PLAN.md`.
   `.gitignore` keeps it out when you use `git push`. GitHub's "Upload files" page in the browser does **not** apply `.gitignore`, so
   only ever drag in the public site files, never `private/`.
2. **Set your own passphrase before the first push.** Until you do, the long forms open with the placeholder password that is
   printed in the public build script. Git keeps history: pages pushed while the placeholder was in use stay readable in old
   commits even after you change the password. If that happens, delete the repo and push fresh.
3. **Use a long passphrase.** The encrypted pages are public files, so anyone can download them and try guesses offline with no
   rate limit. Five or more random words, or 16+ characters. The build warns when it is shorter.
4. **Run `node tools/check.mjs --publish` before every push.** It fails if the placeholder password still opens a page, if
   long-form text leaked into a public file, or if `private/` is tracked.
5. **Rotating the password** re-encrypts everything, but old commits still open with the old password. If a password leaks and
   the content matters, start a fresh repo.
6. **Anyone with the password can copy the content.** This protects against casual and search-engine access, not against a
   recipient forwarding it. Share one passphrase per hiring process and rotate afterwards.
7. The unlocked password is kept in the tab's session storage so the other studies open without asking again; it clears when the tab
   closes or you press Lock. On a `username.github.io/repo` address every repo of yours shares one origin, so a custom domain is the cleaner setup.
8. Public pages (home, short forms, About) are readable by anyone, including their HTML comments and "to update" notes. Keep
   confidential numbers and customer names in the long forms only.

The site sends a Content-Security-Policy that allows only its own scripts, fonts and images, makes no third-party requests,
sets no cookies and has no analytics. The Medium workflow pins its actions to commit hashes and only has permission to commit to this repo.

## Preview locally

```sh
node tools/build.mjs          # build everything (needs private/ and a password)
npx serve .                   # or: python3 -m http.server 8000
```

Open the address it prints, for example `http://localhost:8000/`. Unlocking the long forms needs a **secure context**: it works on
`https://` and on `http://localhost`, but **not** from a `file://` address. Opening the HTML files directly will show the lock panel but cannot decrypt.

Check the build:

```sh
node tools/check.mjs
```

This fails if `private/` is not ignored, if any long-form sentence shows up in a public file, if the `[FILL]` counts disagree, if an internal link is broken, or if a third-party request appears.

## Repo layout

```
index.html  about/  writing/  work/  404.html      generated pages (committed, served as is)
assets/css  assets/js  assets/img  assets/fonts    styles, scripts, public images, self-hosted Inter
data/site.json                                     name, links, Medium handle, email
data/studies.json                                  titles, summaries, meta rows, metric chips for the four studies
data/posts.json  data/posts-manual.json            Medium cache and hand-added posts
src/partials  src/pages  src/short  src/figures    page templates, short forms, diagrams shared with public pages
tools/build.mjs  fetch-medium.mjs  check.mjs       the build, the Medium fetch, the checks
private/   (git-ignored, never published)
  source/<slug>.md       the Google Doc text, verbatim
  long/<slug>.html       long-form body, plain text, edited by hand
  figures/*.html         diagrams used only in long forms
  img/<slug>/fig-<n>.png confidential screenshots (encrypted into the page at build)
  .password              one line, the password
```

Keep `private/` somewhere safe on your machine. It is the only place the plain long-form text exists. It is not in git, so back it up.

## Set the password

1. Choose a long passphrase (four or more random words). The protection is only as strong as the password.
2. Put it on one line in `private/.password`, or set it for one build: `PORTFOLIO_PASSWORD='your passphrase' node tools/build.mjs`.
3. Run `node tools/build.mjs`, commit, push.

Share the password per application, and rotate it by changing it and rebuilding. Rebuilding re-encrypts all four studies with fresh random salts.
Note that older ciphertext stays in git history, so anyone who got the old password can still read the old versions. If a password leaks, assume
the versions published while it was valid are readable.

Unlocking stores the password in `sessionStorage` for that browser tab so all four studies open together. The Lock button clears it.

## Add images

Every screenshot slot is a labelled placeholder showing what to capture. Drop the image at the path shown on the placeholder, for example
`private/img/scrut-automation/fig-1.png` (1600 px wide, 16:10 unless noted), then rebuild. The build replaces the placeholder with the image and
embeds it, base64-encoded, **inside the encrypted payload**, so confidential screenshots never sit in the public repo. It warns if a page's payload exceeds 5 MB.
Blur or replace customer names and data before saving.

Public images (portrait, OG card) go in `assets/img/`. The portrait slot on the About page is a labelled box in `src/pages/about.html`.

## Fill the TODO items

`private/TODO.md` is generated by the build and is never published, because it describes what is inside the locked studies. Each `[FILL: ...]` from the source docs shows in the long form as a dashed amber "to update" chip.
Hover or focus it for the hint, or open any page with `?draft=1` to show every hint inline with a counter.

To fill one: edit `private/long/<slug>.html`, replace the `[FILL: ...]` text with the real content, and rebuild. Do the same in `private/source/<slug>.md` to keep the source in step.
Gaps on public pages are `[GAP: ...]` in `data/studies.json`, `src/short/*.html` and `src/pages/about.html`. Labels inside diagrams that stand in for real data are listed in section 6 of `private/TODO.md`.

## Medium

The handle `aktapaneri` is set in `data/site.json`. Medium's feed returns only the ten most recent posts and blocks browser requests, so posts are fetched at build time:

```sh
node tools/fetch-medium.mjs && node tools/build.mjs
```

`.github/workflows/medium.yml` does this daily and on manual run, then runs `node tools/build.mjs --public-only`, which rebuilds the public pages and leaves the encrypted long forms untouched
(the workflow has no access to `private/`). Add older posts by hand in `data/posts-manual.json`. Once real posts exist, the sample entries disappear.

## Deploy (GitHub Pages)

1. Create a new GitHub repository and push this folder (`private/` is ignored, so it stays local).
2. In the repository, go to Settings, Pages, then Deploy from a branch, and choose `main` and `/ (root)`.
3. The site appears at `https://<username>.github.io/<repo>/`. All links are relative, so it works at a subpath as well as at a domain root. The `404.html` page uses root-absolute links: if you publish at a subpath, set `basePath` in `data/site.json` (for example `"/portfolio"`) and rebuild.

### Custom domain

A `CNAME` file for `aktapaneri.com` is **not** created, because that domain currently serves the existing site. When you are ready to switch, add a file named `CNAME` containing `aktapaneri.com`,
set the domain in Settings, Pages, and point the DNS records at GitHub Pages. Confirm `siteUrl` in `data/site.json` (used for the sitemap and Open Graph tags).

## Notes

- Fonts: Inter variable (SIL Open Font License, see `assets/fonts/Inter-LICENSE.txt`), self-hosted.
- `tools/make-og.mjs` re-renders `assets/img/og.svg` to `og.png` (needs Playwright; optional).
- Visual reference is Linear's feel (dark, quiet, precise). No Linear assets or copy are used.
