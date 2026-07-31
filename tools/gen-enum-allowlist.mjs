/* Regenerates the ENUM_TEACHER / ENUM_SCHOOL allow-lists used by
   apps-script/Code.gs, straight from the shipped HTML so the server-side check
   can never drift from what the forms actually offer.

   Run after adding or renaming any option:
       cd tools && npm i jsdom && node gen-enum-allowlist.mjs
   then copy the generated block into Code.gs and redeploy.

   It also fails loudly if a MULTI-select value ever contains ", ": the wire
   format joins multi values with ", ", so such a value would need greedy
   matching instead of a plain split. Several SINGLE values already contain
   ", " ("oui, voiture") and are matched whole for exactly this reason.
*/
/* Builds the server-side allow-list straight from the shipped HTML, so it can
   never drift from what the forms actually offer. Also flags anything that would
   make naive ", " splitting unsafe on the wire. */
import { JSDOM } from "jsdom";
import fs from "fs";

const R = new URL("../", import.meta.url).pathname;   // repo root
const FORMS = [
  ["index.html", "teacher"],
  ["administration.html", "teacher"],   // same sheet family / same field names
  ["schools.html", "school"],
];

// Never validated as an enum: free text, numbers, files, tokens, bookkeeping.
const SKIP = new Set([
  "website",                                  // honeypot
  "first_name","last_name","age","neighborhood","whatsapp","email",
  "city_other","diploma_other","specialty","university","schools",
  "admin_position_other","subject_other_text","skill_other_text",
  "salary_custom","consent","truth_consent","profile_type",
  "cv","certs","photo","work_cert",
  // schools free text
  "school_name","area","contact_name","phone","notes","subject_other",
  "budget_custom","usage_consent",
]);

/* Retired fields: gone from every form, but pages cached in a visitor's browser
   still submit them. Keeping their allow-list is the only reason a stale client
   shows up in the "Rejected Values" tab instead of slipping through unnoticed --
   that is how the lang_ar submission was spotted. Drop an entry only once you
   are content to stop seeing it. */
const RETIRED = {
  teacher: {
    lang_ar: ["aucune connaissance", "basique", "excellent", "intermediaire"],
    lang_es: ["aucune connaissance", "basique", "excellent", "intermediaire"],
    lang_de: ["aucune connaissance", "basique", "excellent", "intermediaire"],
  },
  school: {},
};

const groups = { teacher: {}, school: {} };
const kind   = { teacher: {}, school: {} };   // field -> "single" | "multi"

for (const [file, family] of FORMS) {
  const doc = new JSDOM(fs.readFileSync(R + file, "utf8")).window.document;
  const form = doc.querySelector("form");
  if (!form) { console.log("no form in " + file); continue; }

  form.querySelectorAll("input[name], select[name]").forEach(el => {
    const name = el.getAttribute("name");
    if (!name || SKIP.has(name)) return;

    let values = [], k;
    if (el.tagName === "SELECT") {
      values = [...el.querySelectorAll("option")].map(o => o.getAttribute("value")).filter(v => v);
      k = "single";
    } else if (el.type === "radio")    { values = [el.value]; k = "single"; }
    else if (el.type === "checkbox")   { values = [el.value]; k = "multi";  }
    else return;                                        // text/tel/number/file

    if (!values.length) return;
    groups[family][name] = groups[family][name] || new Set();
    values.forEach(v => groups[family][name].add(v));
    // a name used as both is treated as multi (the looser parse)
    kind[family][name] = kind[family][name] === "multi" ? "multi" : k;
  });
}

// retired fields are not in any HTML, so they are folded in after the scan
for (const family of ["teacher", "school"]) {
  for (const [f, vals] of Object.entries(RETIRED[family])) {
    if (groups[family][f]) { console.log(`  NOTE ${f} is back on a form -- drop it from RETIRED`); continue; }
    groups[family][f] = new Set(vals);
    kind[family][f] = "single";
  }
}

let unsafe = 0;
for (const family of ["teacher", "school"]) {
  console.log("\n######## " + family);
  for (const f of Object.keys(groups[family]).sort()) {
    const vals = [...groups[family][f]].sort();
    const k = kind[family][f];
    const commas = vals.filter(v => v.includes(", "));
    console.log(`  ${f.padEnd(20)} ${k.padEnd(7)} ${String(vals.length).padStart(3)} values` +
                (commas.length ? `   <-- ${commas.length} contain ", "` : ""));
    if (k === "multi" && commas.length) { unsafe += commas.length; console.log("      UNSAFE for naive split: " + JSON.stringify(commas)); }
  }
}
console.log(unsafe ? `\n!! ${unsafe} multi value(s) contain ", " -> greedy matching required`
                   : `\nno multi value contains ", " (single-selects with commas are matched whole)`);

// ---- emit the Code.gs literal ----
const emit = (family) => {
  const out = [];
  for (const f of Object.keys(groups[family]).sort()) {
    const vals = [...groups[family][f]].sort();
    out.push(`    ${f}: [${vals.map(v => JSON.stringify(v)).join(", ")}]`);
  }
  return out.join(",\n");
};
const js =
`/* ===== SERVER-SIDE ALLOW-LIST (generated from the shipped forms) =====
   The browser already restricts these, but that is UX only: a request sent
   straight to this Web App URL bypasses the page entirely. Without this check
   arbitrary text can land in the columns the database and the matching depend
   on. Regenerate whenever an option is added to a form. */
var ENUM_KIND = ${JSON.stringify(
  Object.fromEntries(["teacher","school"].map(fam => [fam, kind[fam]])), null, 2
).replace(/\n/g, "\n")};

var ENUM_TEACHER = {
${emit("teacher")}
};

var ENUM_SCHOOL = {
${emit("school")}
};
`;
fs.writeFileSync(new URL("./enums.generated.js", import.meta.url), js);
console.log("\nwrote enums.js  (" + js.split("\n").length + " lines)");
