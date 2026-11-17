# Security

Do not put credentials, exploit details involving live accounts, private workspace content or unredacted diagnostics in public issues. Use GitHub's private vulnerability reporting if enabled, or contact the repository maintainers privately through an established channel. There is no dedicated public security email or response-time guarantee configured by this repository.

The packaged shell is trusted local code and receives a method-limited native bridge. Remote application pages must never receive that bridge. Browser profiles are scoped by service/account/organization; service authorization remains authoritative. Shared authentication is not a grant of filesystem, terminal or cross-workspace access.

Credentials use Windows Credential Manager. Workstream drafts are local Windows DPAPI-encrypted files scoped by service/account/organization/workstream; they are not end-to-end cloud synchronization or protection against another process already running as the same Windows user. Local navigation state and browser profiles remain under the current user's application data directory.

Sensitive service actions use existing human approval flows. Writes must not be retried automatically. Authentication pages open in the user's default browser, and authentication handoff tickets must not enter shell JavaScript, URLs, diagnostic output or Git.

Before publishing diagnostic files, inspect them for workspace names, resource titles, URLs, application content and terminal output. Build and review captures are excluded from version control by default.
