# Security policy

## Supported versions

Only the latest release of the iNoé Espace Famille integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-inoeespacefamille](https://github.com/prohand/gladys-inoeespacefamille/security),
then **Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove emails, passwords, cookies and the portal number first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes — in particular how
the portal password and the session cookies are handled (sent to the AIGA servers only, never
logged, never written to `/data`).

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), and the iNoé
Espace Famille portal and the AIGA servers (report to AIGA, <https://www.aiga.fr>).

## Good practices for users

- Use the portal password only for the portal: if it leaks, nothing else is exposed.
- The integration only reads; it cannot book, cancel or pay. Payments stay on the portal.
- Keep Gladys and the integration up to date.
