import { BrowserSession } from "../src/browser-session.ts";
import { auditSiteInteractions } from "../src/interaction-audit.ts";

const dir = process.argv[2];
if (!dir) { console.error("use: npx tsx scripts/audit-dir.ts <dir>"); process.exit(1); }
const session = new BrowserSession(dir);
const audit = await auditSiteInteractions(session);
console.log(JSON.stringify(audit, null, 2));
await session.close().catch(() => {});
