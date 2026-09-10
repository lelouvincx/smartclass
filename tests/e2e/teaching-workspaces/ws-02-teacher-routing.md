# WS-02: Wrong-site teachers reach their teaching site

Before running, follow the [shared setup and reporting rules](README.md).

1. Sign in as the English teacher on Maths. Expect navigation to English, without a join prompt or protected Maths content.
2. If English has no session, sign in there. Expect the English teacher dashboard.
3. Repeat in reverse with the Maths teacher. Repeat with previously used sessions on both origins to expose redirect loops.
4. Inspect the destination URL. Expect no password, token or OAuth code in the URL.
5. Sign in as the platform admin on each site. Expect the admin to stay on the chosen site.

Pass: teachers reach the configured teaching site without a loop or session transfer; the admin stays.
