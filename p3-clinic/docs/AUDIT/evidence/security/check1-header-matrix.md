# HTTP security header matrix (unauthenticated, from the captured *.txt files)

legend: "-" = header absent, value = header value as captured

| endpoint | status | strict-transport-security | content-security-policy | x-frame-options | x-content-type-options | referrer-policy | permissions-policy | x-xss-protection | x-powered-by | server | set-cookie |
| endpoint | status | strict-transport-security | content-security-policy | x-frame-options | x-content-type-options | referrer-policy | permissions-policy | x-xss-protection | x-powered-by | server | set-cookie |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| / | 200 | - | - | - | - | - | - | - | `PHP/8.3.35` | `Apache/2.4.68 (Debian)` | - |
| /services/ | 200 | - | - | - | - | - | - | - | `PHP/8.3.35` | `Apache/2.4.68 (Debian)` | - |
| /team/ | 200 | - | - | - | - | - | - | - | `PHP/8.3.35` | `Apache/2.4.68 (Debian)` | - |
| /contact/ | 200 | - | - | - | - | - | - | - | `PHP/8.3.35` | `Apache/2.4.68 (Debian)` | - |
| /book/ | 200 | - | - | - | - | - | - | - | `PHP/8.3.35` | `Apache/2.4.68 (Debian)` | - |
| 404 page | 404 | - | - | - | - | - | - | - | `PHP/8.3.35` | `Apache/2.4.68 (Debian)` | - |
| /wp-login.php | 200 | - | `frame-ancestors 'self';` | `SAMEORIGIN` | - | `strict-origin-when-cross-origin` | - | - | `PHP/8.3.35` | `Apache/2.4.68 (Debian)` | PRESENT [; path ; HttpOnly] |
| /wp-json/ | 200 | - | - | - | `nosniff` | - | - | - | `PHP/8.3.35` | `Apache/2.4.68 (Debian)` | - |
| /xmlrpc.php (GET) | 405 | - | - | - | - | - | - | - | `PHP/8.3.35` | `Apache/2.4.68 (Debian)` | - |
| /wp-cron.php | 200 | - | - | - | - | - | - | - | `PHP/8.3.35` | `Apache/2.4.68 (Debian)` | - |
| /wp-admin/ (302) | 302 | - | - | - | - | - | - | - | `PHP/8.3.35` | `Apache/2.4.68 (Debian)` | - |
| /wp-admin/admin-post.php | 200 | - | `frame-ancestors 'self';` | `SAMEORIGIN` | - | `strict-origin-when-cross-origin` | - | - | `PHP/8.3.35` | `Apache/2.4.68 (Debian)` | - |
| /wp-config-sample.php (500) | 500 | - | - | - | - | - | - | - | `PHP/8.3.35` | `Apache/2.4.68 (Debian)` | - |
| /readme.html | 200 | - | - | - | - | - | - | - | - | `Apache/2.4.68 (Debian)` | - |
| /license.txt | 200 | - | - | - | - | - | - | - | - | `Apache/2.4.68 (Debian)` | - |
| /wp-cli.yml | 200 | - | - | - | - | - | - | - | - | `Apache/2.4.68 (Debian)` | - |
| failed login POST | 200 | - | `frame-ancestors 'self';` | `SAMEORIGIN` | - | `strict-origin-when-cross-origin` | - | - | `PHP/8.3.35` | `Apache/2.4.68 (Debian)` | PRESENT [; path ; HttpOnly] |

## how many of the five themed pages carry each header
  strict-transport-security: 0 / 5
  content-security-policy: 0 / 5
  x-frame-options: 0 / 5
  x-content-type-options: 0 / 5
  referrer-policy: 0 / 5
  permissions-policy: 0 / 5
  x-xss-protection: 0 / 5
