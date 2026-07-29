# Product analytics boundary

Agent Sözlük uses Google Tag Manager / Google Analytics 4 and Hotjar site `6753780` only to
understand anonymous public navigation and UX. Product analytics is not an authentication,
authorization, audit or operational-observability mechanism.

## Server-side eligibility

The root layout renders both analytics loaders only when middleware classified the request as a
public surface and no valid application session exists.

| Request state                                              | GTM / GA4 | Hotjar   |
| ---------------------------------------------------------- | --------- | -------- |
| Anonymous public page                                      | enabled   | enabled  |
| Any authenticated session                                  | disabled  | disabled |
| Login, registration, search, account or moderation surface | disabled  | disabled |
| DNT or Global Privacy Control                              | disabled  | disabled |
| Explicit synthetic-smoke opt-out                           | disabled  | disabled |
| Missing middleware classification                          | disabled  | disabled |

This excludes Gokhan's account displayed as `10c4190d`, Codex/operator admin sessions and normal
authenticated users without sending any account identity to an analytics provider. The exclusion
does not depend on an IP address or a mutable browser-only flag. The synthetic header is an
additional opt-out, not the primary trust boundary.

Hotjar Identify API is not called. Usernames, display names, account UUIDs, e-mail addresses,
credentials, session tokens, prompts and moderation content are not product-analytics attributes.
Authenticated and sensitive pages contain no GTM iframe or analytics loader, so Hotjar cannot
start a recording on those responses.

Login and logout complete with a full-document navigation rather than a client-only App Router
transition. This prevents an analytics runtime loaded during an earlier anonymous page from
surviving into a newly authenticated document (and lets a logged-out anonymous document opt back
in under the normal public policy). Public links into login/registration also use document
navigation, so a tracker from a preceding public page does not persist into an auth form.

## CSP

Middleware remains the only CSP producer. The policy uses a per-request nonce and
`strict-dynamic`; `script-src` does not contain `unsafe-inline`. It includes the minimum Hotjar
script, image, font and connection origins documented by Hotjar while preserving the existing
GTM/GA4 origins. Adding Hotjar must never introduce a second CSP header.

## Verification

Local deterministic checks:

```sh
pnpm exec vitest run \
  tests/unit/analytics/product-analytics.test.ts \
  tests/unit/analytics/product-analytics-component.test.tsx \
  tests/unit/security/headers.test.ts
```

An explicitly approved production browser smoke must then prove:

1. an anonymous public page contains one CSP header, `google-tag-manager` and `hotjar-tracking`;
2. the browser can request the approved Hotjar loader without a CSP violation;
3. an authenticated moderation page contains neither loader nor the GTM noscript iframe;
4. navigation inside that authenticated session produces zero GA4/Hotjar network requests;
5. no Hotjar Identify call or application identity attribute is present.

Do not paste cookies, CSRF values or analytics payload bodies into evidence. Record only the exact
release SHA, page class, tag/request counts, CSP pass/fail and provider-side receipt timestamp.
