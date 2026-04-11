# Security Policy

## Supported Versions

Only the latest published version receives security patches. Given the project's pre-1.0 stage, fixes ship as new releases rather than backports.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities by emailing **regents_lotus9w@icloud.com** with:

- A description of the vulnerability
- Steps to reproduce or a proof-of-concept
- The affected version(s)
- Any suggested fix (optional but appreciated)

You should receive an acknowledgment within **5 business days**. We aim to provide a substantive response (confirmation, request for more info, or fix timeline) within **14 days**.

If the vulnerability is accepted, we will:
1. Develop and test a fix privately
2. Publish a patched release to npm
3. File a [GitHub Security Advisory](https://github.com/simplyarun/milieu-cli/security/advisories) so `npm audit` picks it up automatically
4. Credit the reporter in the release notes (unless you prefer anonymity)

If declined, we will explain why we do not consider it a vulnerability.

### Disclosure Timeline

Vulnerabilities are disclosed publicly at the earlier of:
- **90 days** after the initial report, or
- **7 days after the patch release**, giving users time to upgrade before exploit details are public

If a fix requires more time, we will negotiate a revised timeline with the reporter.

## Threat Model

milieu-cli is a **read-only network scanner** that makes outbound HTTP requests to user-supplied URLs. It does not run a server, accept inbound connections, or store persistent data. Its primary security considerations are:

### SSRF Protection

Since the tool fetches arbitrary URLs, Server-Side Request Forgery is the most relevant attack class. Mitigations in place:

- **DNS validation at every redirect hop** — hostnames are re-resolved and checked before each request, preventing DNS rebinding and redirect-to-internal attacks
- **Private IP blocking** — all RFC 1918, loopback, link-local, CGNAT, IPv6 ULA, and IPv4-mapped IPv6 addresses are rejected
- **Manual redirect handling** — redirects are followed explicitly (not by the HTTP client) so SSRF checks cannot be bypassed via 3xx chains
- **Redirect depth limit** — maximum of 5 hops prevents infinite redirect loops

### Resource Limits

- **Response body cap** — 5 MB maximum, enforced via streaming with early cancellation
- **Request timeout** — 10-second per-request timeout with body-read hard deadline

### Out of Scope

The following are **not** considered vulnerabilities for this project:

- **Scan results from malicious websites** — milieu-cli reports what it finds; a site returning misleading metadata is expected behavior, not a scanner bug
- **Rate limiting or blocking by target sites** — the scanner makes a modest number of sequential requests; being blocked by WAFs is expected
- **Local privilege escalation** — milieu-cli runs with the invoking user's permissions and does not require elevated privileges
- **Denial of service against the scanner itself** — e.g., a target returning an extremely slow response. Timeouts mitigate this, but targeted resource exhaustion of the scanning process is out of scope

## Security-Relevant Design Decisions

- **No code execution** — responses are parsed as text/JSON only; no `eval`, no script execution, no dynamic `import()`
- **No secrets or credentials** — milieu-cli does not use API keys, tokens, or any form of authentication
- **No persistent storage** — no databases, no caches on disk, no config files written
- **Minimal dependencies** — only three runtime dependencies (`chalk`, `commander`, `ora`), all well-established libraries, reducing supply chain risk
- **No network listeners** — the tool is purely an outbound client; it never binds to a port
