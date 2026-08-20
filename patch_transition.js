const fs = require('fs');
let ts = fs.readFileSync('assets/ts/page-transition-engine.ts', 'utf-8');
ts = ts.replace(/function hasSiteIdentity[\s\S]*?function exitClassName/m, 'function exitClassName');
ts = ts.replace(/,\s*"identity-exit-down"/, '');
ts = ts.replace(/,\s*shouldAnimateIdentityExit/, '');
fs.writeFileSync('assets/ts/page-transition-engine.ts', ts);

let router = fs.readFileSync('assets/ts/daybook-router.ts', 'utf-8');
router = router.replace(/if\s*\(engine\.shouldAnimateIdentityExit\(newDocument\)\)\s*\{\s*document\.documentElement\.classList\.add\("identity-exit-down"\);\s*\}/, '');
fs.writeFileSync('assets/ts/daybook-router.ts', router);
