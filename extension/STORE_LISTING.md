# Portfolio Builder Companion — store listing

Use this text when publishing to the Microsoft Edge Add-ons store (free) and, later,
the Chrome Web Store (one-time US$5 developer fee). Build the upload with:

```sh
PB_APP_ORIGINS=https://<your-project>.web.app,https://<your-domain> pnpm --filter @pb/extension build
```

and upload `extension/portfolio-builder-extension.zip`.

## Name

Portfolio Builder Companion

## Short description (≤132 characters)

Borrow the look of sites you like, read your blog feed and check your links for Portfolio Builder. Runs on your computer only.

## Description

Portfolio Builder makes a personal website from your resume and projects. This
companion extension does the few things a web page isn't allowed to do on its own:

- **Inspiration capture.** Paste the address of a site you like in Portfolio Builder,
  or click the toolbar button while visiting it. The extension opens the site in a
  small window, takes screenshots and reads its colours, fonts and layout, then hands
  them to your Portfolio Builder tab so your design can borrow from it.
- **Blog feeds.** Reads your blog's RSS or Atom feed so your posts can appear on your
  portfolio.
- **Link checks.** Checks that the links on your portfolio still work.

Everything happens on your computer. The extension has no servers, no analytics and
no account. It asks for access to a site only when you capture it or read its feed,
one site at a time, and you can remove that access in the browser's extension
settings at any time.

## Category

Productivity

## Permissions and why they're needed

| Permission                                         | Why                                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `activeTab`                                        | Capture the page you're on when you click "Send this page".                             |
| `scripting`                                        | Read colours, fonts and layout from a page you chose to capture.                        |
| `storage`                                          | Keep pages you sent from the toolbar until Portfolio Builder picks them up (at most 3). |
| Optional site access (`https://*/*`, `http://*/*`) | Asked for one site at a time, only when you capture it or read its feed.                |
| Content script on Portfolio Builder's own address  | Lets the Portfolio Builder tab talk to the extension. It runs on no other site.         |

## Privacy policy

Portfolio Builder Companion does not collect, store or send personal data to anyone.

- Screenshots, colours, fonts and layout notes from pages you capture are passed only
  to your open Portfolio Builder tab, which keeps them on your computer.
- Pages sent with the toolbar button are kept in the extension's local storage until
  Portfolio Builder picks them up, then deleted.
- Feeds and link checks are requested without cookies. Their results go only to your
  Portfolio Builder tab.
- There is no analytics, tracking or advertising, and no data is sold or shared.

## Screenshots to prepare (1280×800)

1. The Inspiration step with a captured site: palette, fonts and "Borrow" toggles.
2. The permission window ("Allow access to example.com?").
3. The toolbar popup ("Send this page").

## Test notes for reviewers

Load the app at the address in `PB_APP_ORIGINS`, open a portfolio, go to Setup →
Inspiration, paste `https://example.com` and choose Analyze. Approve the site access
prompt; the capture appears with its colours and fonts.
