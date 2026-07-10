# Security Policy

## School credentials

Prompt sends the student id and an in-memory encrypted password only to the
school's WebVPN/CAS login flow. It does not offer `--password`, password
environment variables or credential files. Password and verification input is
masked and is never written to preferences, state, cache, ICS or logs.

If the school requests a slider, OTP, FIDO or another browser challenge, Prompt
fails closed. It does not automate or bypass the challenge.

## Authenticated transport

Authentication redirects are restricted to exact HTTPS hosts and routes for
the NingboTech WebVPN, authentication service and JWXT. CAS `service` and
WebVPN `origin` parameters are validated against explicit callback routes.
Caller-supplied `Cookie`, `Authorization` and `Host` headers are rejected.

Errors expose only stable local codes and stages. Response bodies, redirect
queries, cookies, encrypted passwords and underlying network error objects are
not included in user-facing output.

## Persisted session

The optional persisted CookieJar is a bearer secret. It is stored under the
user's state directory with a versioned schema, an atomic write, a `0700`
directory and a `0600` file on POSIX systems. The saved account hint is masked,
and Prompt never adds the full student id or password to the state schema. The
opaque school cookies must still be treated as bearer secrets. Sessions have a
sliding seven-day local expiry.

Use `nbtca schedule logout` to clear it. Use `--one-shot` on a shared or
untrusted computer so no session is read or written.

## Timetable and ICS privacy

Raw JWXT responses are processed in memory. Only timetable fields needed for
normalization are passed to `@nbtca/nbtcal`; the student profile object is
discarded. Generated ICS files can reveal a person's location and routine, so
they are created with mode `0600` where supported and should not be uploaded to
public or "secret-link" hosting.

## Reporting vulnerabilities

Use the repository's GitHub Security Advisory page. Do not include credentials,
cookies, raw school responses or a personal ICS in a public issue.
