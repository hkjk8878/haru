# Existing production deployment

- Web app: GitHub Pages, hkjk8878/haru main, root.
- Synchronization and notification server: existing Cloudflare haru-alarm Worker, now connected to the same repository and main branch.
- Deploy command: npx wrangler deploy. Root wrangler.jsonc preserves HARU KV binding, existing runtime variables and secrets, and the every-minute notification trigger.
- Recovery exports and personal JSON backups must never be committed here.
