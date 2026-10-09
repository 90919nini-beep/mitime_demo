// Shared rendering + variable-allow-list logic, duplicated from
// email-send-campaign/_shared/sendCampaign.ts's own renderTemplate --
// same convention as this repo's existing per-function _shared
// duplication (cors.ts, requireRole.ts) rather than a cross-function
// import, since each Edge Function deploys as its own isolated bundle.
// Keep this byte-for-byte identical to sendCampaign.ts's copy whenever
// either changes, so a template that passes or fails validation here
// behaves exactly the same way in a real send.
export const ALLOWED_VARS = ["first_name", "project_name", "pattern_name", "project_url"] as const;

export function renderTemplate(html: string, vars: Partial<Record<(typeof ALLOWED_VARS)[number], string>>): string {
  return html.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, name) => {
    if ((ALLOWED_VARS as readonly string[]).includes(name)) {
      return vars[name as (typeof ALLOWED_VARS)[number]] ?? "";
    }
    return match; // unknown placeholder left as-is, never evaluated
  });
}

// Scans for every {{placeholder}} the template actually uses and returns
// the ones NOT in ALLOWED_VARS. Production (sendCampaign) silently leaves
// an unknown placeholder as literal text rather than erroring -- this
// test tool deliberately fails loudly instead, so a template with a typo'd
// or not-yet-supported variable is caught before anyone reviews a preview
// that quietly rendered "{{typo_name}}" as visible junk text.
export function findUnsupportedVariables(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) {
    const name = m[1];
    if (!(ALLOWED_VARS as readonly string[]).includes(name)) found.add(name);
  }
  return [...found];
}
