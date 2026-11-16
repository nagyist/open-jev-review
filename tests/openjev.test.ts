import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, test } from "node:test";

const requests: Array<{ state: unknown; questions: Record<string, { type: string; criteria: Record<string, unknown> | unknown[] }> }> = [];
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
  res.end(JSON.stringify({ model: "openjev-local", answers, usage: { input_tokens: 1, output_tokens: 1 } }));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
process.env.OPENJEV_BASE_URL = origin;
after(() => server.close());

const { createOpenJevClient } = await import("../src/adapters/openjev.ts");
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
  assert.deepEqual(Object.keys(requests[0].questions), ["correctness", "security", "reliability", "compatibility", "testGap"]);
  assert.equal(requests[2].questions.reviewPriority.type, "score");
});

test("rejects remote, credentialed and non-origin URLs", () => {
  for (const url of ["https://127.0.0.1:8009", "http://example.com", "http://user@127.0.0.1:8009", origin + "/path"]) {
    assert.throws(() => createOpenJevClient(url), /OPENJEV_BASE_URL/);
  }
});

test("does not follow redirects and surfaces server errors", async () => {
  const client = createOpenJevClient(origin);
  const { noul } = await import("@typesafe-ai/sdk");
  await assert.rejects(client.fetch(origin + "/redirect/v1/systemone"));
  await assert.rejects(client.systemOne({ state: "fail", questions: { check: noul("check") } }), /422/);
});
