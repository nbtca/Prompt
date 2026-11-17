# Security Policy

Prompt sends credentials only to the allowlisted campus WebVPN and CAS login
flow. Passwords stay in memory, are masked during entry and are never accepted
through flags, environment variables or files. Interactive browser challenges
fail closed.

An optional persisted CookieJar is a bearer secret. Prompt writes it atomically
to the user's state directory with `0700` directory and `0600` file permissions
on POSIX systems. Use `nbtca schedule logout` to remove it, or `--one-shot` to
avoid reading or writing a session.

Exam and grade queries use allowlisted, read-only academic endpoints. Prompt
discards unrelated identity fields and does not cache these records. To mark
new grades, it stores a salted HMAC-SHA256 fingerprint of each course whose
result has been published, with `0600` permissions; the file holds no result.
`nbtca schedule logout` removes it. JSON output
contains personal academic information; redirected output and terminal scrollback
may retain it.

Exported calendars may reveal a person's routine and location. Keep session and
ICS files private.

Report vulnerabilities through GitHub Security Advisories. Never include
credentials, cookies, raw campus responses, exam arrangements, grades or personal
calendars in public issues.
