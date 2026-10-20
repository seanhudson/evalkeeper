# Security

## Reporting a vulnerability

Please report security issues privately through
[GitHub's private vulnerability reporting](https://github.com/seanhudson/evalkeeper/security/advisories/new),
not as a public issue. You'll get a reply within a week, and a fix or a
plan as soon as the issue is confirmed.

## Supported versions

Until 1.0, only the latest release gets security fixes.

## How the repo stays safe

- Dependabot opens weekly updates, and its security alerts are on.
- CI fails on any high or critical `npm audit` advisory, and CodeQL scans
  every change.
- A scrub check keeps private names and email addresses out of the
  repository.
- Evalkeeper never sends your cases anywhere: it calls only the models
  your suites call, with the inputs you gave them.
