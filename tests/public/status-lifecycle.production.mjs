// T039 production route proof.  Redirects are inspected manually, rather than followed,
// so a canonical trailing-slash redirect cannot mask a lifecycle response.
const baseUrl = process.env.HILLS_PHASE11_URL ?? "http://127.0.0.1:3231";
const cases = [
  ["/coffee/public-test-coffee-published/", 200],
  ["/coffee/public-test-coffee-draft/", 404],
  ["/coffee/public-test-coffee-archived/", 404],
  ["/coffee/public-test-coffee-unknown/", 404],
  ["/origins/public-test-origin-active/", 200],
  ["/origins/public-test-origin-inactive/", 404],
  ["/origins/public-test-origin-archived/", 404],
  ["/origins/public-test-origin-unknown/", 404],
];
for (const [path, expected] of cases) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, received ${response.status}`);
}
for (const canonicalPath of ["/coffee/public-test-coffee-published/", "/origins/public-test-origin-active/"]) {
  const withoutSlash = canonicalPath.slice(0, -1);
  const response = await fetch(`${baseUrl}${withoutSlash}`, { redirect: "manual" });
  if (!response.status.toString().startsWith("30") || response.headers.get("location") !== canonicalPath) {
    throw new Error(`${withoutSlash}: expected trailing-slash redirect to ${canonicalPath}, received ${response.status} ${response.headers.get("location")}`);
  }
}
console.log("T039 production lifecycle routes passed");
