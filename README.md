<!-- Everything in assets/ comes from scripts/build.mjs: npm install && npm run build -->

<a href="https://securebusinesshub.com">
  <img alt="Ferran Fabra, founder of SecureBusinessHub. I write security guides and build free tools for small businesses that don't have an IT department." src="./assets/banner.d86abcbd.svg" width="100%">
</a>

<p align="center">
  <a href="https://securebusinesshub.com"><img alt="securebusinesshub.com" src="./assets/nav/site.f00c07a4.svg" height="38"></a>
  <a href="https://securebusinesshub.com/tools"><img alt="Free tools" src="./assets/nav/tools.0d64dd07.svg" height="38"></a>
  <a href="https://securebusinesshub.com/toolkit/starter-kit"><img alt="Starter Kit" src="./assets/nav/kit.777d4e3a.svg" height="38"></a>
  <a href="https://securebusinesshub.com/glossary"><img alt="Glossary" src="./assets/nav/glossary.db0f7c91.svg" height="38"></a>
  <a href="https://securebusinesshub.com/contact"><img alt="Contact" src="./assets/nav/contact.4aec3bf6.svg" height="38"></a>
</p>

<img alt="Flight log. Role: solo founder and developer of SecureBusinessHub. Readers: small businesses where security is somebody's side job. Shipped: 6 free security tools, a 228-term glossary, the Starter Kit. Runs on: React and TypeScript on Cloudflare Workers, D1 and R2. Studying: ASIR degree, cybersecurity track. Speaks: Català, Español, English. Next: offensive security." src="./assets/log.965f012d.svg" width="100%">

## What I'm building

<a href="https://securebusinesshub.com/tools">
  <img alt="SecureBusinessHub's six free tools drawn as a constellation: spoofing check, lookalike domains, exposure check, baseline check, header analyzer, breach clock" src="./assets/sbh.53ed789c.svg" width="100%">
</a>

[SecureBusinessHub](https://securebusinesshub.com) is a cybersecurity publication for small and medium businesses. I write the articles, and I build, run and deploy the site myself. Most security writing is aimed at enterprise SOC teams or is quietly selling a product. SBH is for the ten-person company where security landed on whoever was nearest: guides you can get through in an afternoon, and free tools that each answer one question.

| Tool | What it tells you |
| :--- | :--- |
| [Email Spoofing Check](https://securebusinesshub.com/tools/email-spoofing-check) | Whether your SPF, DKIM and DMARC records stop someone sending mail as you |
| [Lookalike-Domain Finder](https://securebusinesshub.com/tools/lookalike-domain-finder) | Near-copies of your domain that someone has already registered |
| [Website Exposure Check](https://securebusinesshub.com/tools/website-exposure-check) | Your security headers, TLS certificate and cookie flags, as an outsider sees them |
| [Security Baseline Check](https://securebusinesshub.com/tools/security-baseline-check) | A pass or fail against a [published baseline](https://securebusinesshub.com/tools/security-baseline-check/methodology). Sites that pass get a badge, and it's re-checked every week |
| [Email Header Analyzer](https://securebusinesshub.com/tools/email-header-analyzer) | Where a suspicious email really came from. You paste the headers and the analysis runs in your browser |
| [Breach-Notification Clock](https://securebusinesshub.com/tools/breach-notification-deadline-calculator) | The minute your GDPR 72-hour window to notify the regulator closes |

## How it's built

<img alt="Request path: a visitor reaches a Cloudflare Worker, which renders every page with HTMLRewriter. The Worker reads articles and tool data from D1, serves Starter Kit files from R2, runs the chatbot on Workers AI, and takes payments through Stripe Checkout. The front end is a Vite build of React, TypeScript and Tailwind." src="./assets/stack.848686cf.svg" width="100%">

The front end is Vite, React and TypeScript with Tailwind, set in Fraunces and Inter. A Cloudflare Worker renders each page through `HTMLRewriter`, so search engines get real HTML instead of an empty shell. Articles live in D1 and downloads in R2. Stripe Checkout handles Starter Kit payments, and buyers get their files through a download token. Search is Pagefind, which runs in the browser, and the site chatbot runs on Workers AI.

Outside SBH I'm finishing a higher vocational degree in Systems Administration and Networks (ASIR) on the cybersecurity track. That means Cisco switching and routing, VLANs, Linux and Windows Server, and databases. Once it's done I want to move into offensive security.

## Where to start reading

<p align="center">
  <a href="https://securebusinesshub.com/article/sme-ransomware-survival-guide"><img alt="The Ransomware Survival Guide" src="./assets/guides/01-ransomware.31d2827f.svg" width="49%"></a>
  <a href="https://securebusinesshub.com/article/cyber-insurance-denied-sme"><img alt="Why Your Cyber Insurance Was Denied" src="./assets/guides/02-insurance.d3194917.svg" width="49%"></a>
  <a href="https://securebusinesshub.com/article/deepfake-fraud-sme-defense"><img alt="The Voice of Your CEO? Deepfake fraud against small businesses" src="./assets/guides/03-deepfake.e8fbad6b.svg" width="49%"></a>
  <a href="https://securebusinesshub.com/article/gdpr-compliance-guide"><img alt="NIS2 and GDPR for Small Business" src="./assets/guides/04-nis2-gdpr.43d43ac4.svg" width="49%"></a>
  <a href="https://securebusinesshub.com/article/anti-social-engineering"><img alt="Hacking the Human: an anti-social-engineering toolkit" src="./assets/guides/05-social.d0a24a09.svg" width="49%"></a>
  <a href="https://securebusinesshub.com/article/shadow-it-remote-work-risks"><img alt="Shadow IT in a Remote Team" src="./assets/guides/06-shadowit.ff44ca7c.svg" width="49%"></a>
</p>

There's more on the site: [every guide](https://securebusinesshub.com/guides), the free [Defense Toolkit](https://securebusinesshub.com/toolkit), and a [security assessment](https://securebusinesshub.com/assessment).

<br>

<p align="center">
  <sub>Catalonia, ES · I work in Català, Español and English · <a href="https://securebusinesshub.com/contact">get in touch</a></sub>
</p>
