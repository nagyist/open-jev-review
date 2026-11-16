import assert from "node:assert/strict";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { promisify } from "node:util";

const requests: Array<{ model: string; state: unknown; questions: Record<string, { type: string; criteria: Record<string, unknown> | unknown[] }> }> = [];
const server = createServer(async (req, res) => {
  if (req.url === "/redirect/v1/systemone") {
    res.writeHead(302, { location: "http://example.com/" }).end();
    return;
  }
  if (req.method !== "POST" || req.url !== "/v1/systemone") {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  const request = JSON.parse(body);
  if (request.state === "fail") {
    res.writeHead(422, { "content-type": "application/json" }).end(JSON.stringify({ detail: "request too long" }));
    return;
  }
  requests.push(request);
  const answers = Object.fromEntries(Object.entries(request.questions).map(([name, value]) => {
    const question = value as { type: string; criteria: Record<string, unknown> | unknown[] };
    if (question.type === "noul") return [name, { type: "noul", noul: 0.2 }];
    if (question.type === "score") return [name, { type: "score", score: 1.5, confidence: 0.8 }];
    const choice = Object.keys(question.criteria)[0];
    return [name, { type: "choice", choice, confidence: 0.8, probabilities: { [choice]: 1 } }];
  }));
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ model: request.model, answers, usage: { input_tokens: 1, output_tokens: 1 } }));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
process.env.OPENJEV_BASE_URL = origin;
delete process.env.REVIEW_PROVIDER;
delete process.env.REVIEW_MODEL;
after(() => server.close());

const { createDecisionClient } = await import("../src/adapters/decision-client.ts");
const { screenFile, profileFile } = await import("../src/review/judgments.ts");
const { screenSourceFile, profileSourceFile } = await import("../src/review/codebase-judgments.ts");

test("both review modes send typed questions to the local server", async () => {
  const changed = { path: "example.ts", patch: "@@ -1 +1 @@\n-old\n+new" };
  const source = { path: "example.ts", content: "export const example = 1;" };
  const changeScreen = await screenFile(changed, []);
  const sourceScreen = await screenSourceFile(source, []);
  assert.equal(changeScreen.probabilities.correctness, 0.2);
  assert.equal(sourceScreen.probabilities.testGap, 0.2);
  assert.equal((await profileFile(changed, changeScreen.probabilities)).reviewPriority, 1.5);
  assert.equal((await profileSourceFile(source, sourceScreen.probabilities)).category, "entrypoint");
  assert.equal(requests.length, 4);
  assert.ok(requests.every((request) => request.model === "openjev-local"));
  assert.deepEqual(Object.keys(requests[0].questions), ["correctness", "security", "reliability", "compatibility", "testGap"]);
  assert.equal(requests[2].questions.reviewPriority.type, "score");
});

test("rejects invalid URLs for either provider", () => {
  for (const provider of ["openjev", "kev"]) {
    const variable = provider === "kev" ? "KEV_BASE_URL" : "OPENJEV_BASE_URL";
    for (const url of ["not a URL", "https://127.0.0.1:8009", "http://example.com", "http://user@127.0.0.1:8009", origin + "/path", origin + "?query", origin + "#fragment"]) {
      assert.throws(() => createDecisionClient({ REVIEW_PROVIDER: provider, [variable]: url }), new RegExp(variable));
    }
  }
});

test("does not follow redirects and surfaces server errors", async () => {
  const { noul } = await import("@typesafe-ai/sdk");
  for (const provider of ["openjev", "kev"]) {
    const client = createDecisionClient({ REVIEW_PROVIDER: provider, OPENJEV_BASE_URL: origin, KEV_BASE_URL: origin });
    await assert.rejects(client.fetch(origin + "/redirect/v1/systemone"));
    await assert.rejects(client.systemOne({ state: "fail", questions: { check: noul("check") } }), /422/);
  }
});

test("selects provider-specific defaults and allows model overrides", async () => {
  const { noul } = await import("@typesafe-ai/sdk");
  for (const provider of ["openjev", "kev"]) {
    for (const model of [undefined, "custom-model"]) {
      const variable = provider === "kev" ? "KEV_BASE_URL" : "OPENJEV_BASE_URL";
      const otherVariable = provider === "kev" ? "OPENJEV_BASE_URL" : "KEV_BASE_URL";
      const client = createDecisionClient({
        REVIEW_PROVIDER: provider,
        REVIEW_MODEL: model,
        [variable]: origin,
        [otherVariable]: "http://example.com",
      });
      await client.systemOne({ state: "example", questions: { check: noul("check") } });
      assert.equal(requests.at(-1)?.model, model ?? (provider === "kev" ? "kev-latest" : "openjev-local"));
    }
  }
});

test("rejects unknown providers and blank model names", () => {
  for (const provider of ["", "unknown"]) {
    assert.throws(() => createDecisionClient({ REVIEW_PROVIDER: provider }), /REVIEW_PROVIDER/);
  }
  for (const model of ["", "   "]) {
    assert.throws(() => createDecisionClient({ REVIEW_MODEL: model }), /REVIEW_MODEL/);
  }
});

test("both review modes use Kev when selected through the environment", async () => {
  const start = requests.length;
  await promisify(execFile)(process.execPath, ["--input-type=module", "-e", `
    const { screenFile, profileFile } = await import(${JSON.stringify(new URL("../src/review/judgments.ts", import.meta.url).href)});
    const { screenSourceFile, profileSourceFile } = await import(${JSON.stringify(new URL("../src/review/codebase-judgments.ts", import.meta.url).href)});
    const changed = { path: "example.ts", patch: "@@ -1 +1 @@\\n-old\\n+new" };
    const source = { path: "example.ts", content: "export const example = 1;" };
    const changes = await screenFile(changed, []);
    const codebase = await screenSourceFile(source, []);
    await profileFile(changed, changes.probabilities);
    await profileSourceFile(source, codebase.probabilities);
  `], {
    env: { ...process.env, REVIEW_PROVIDER: "kev", KEV_BASE_URL: origin, OPENJEV_BASE_URL: "http://example.com", REVIEW_MODEL: "kev-latest" },
  });
  const kevRequests = requests.slice(start);
  assert.equal(kevRequests.length, 4);
  assert.ok(kevRequests.every((request) => request.model === "kev-latest"));
  assert.deepEqual([...new Set(kevRequests.flatMap((request) => Object.values(request.questions).map((question) => question.type)))].sort(), ["choice", "noul", "score"]);
});
