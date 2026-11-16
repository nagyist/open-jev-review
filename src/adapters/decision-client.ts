import { TypeSafeClient } from "@typesafe-ai/sdk";

export function createDecisionClient(env: NodeJS.ProcessEnv = process.env) {
  const provider = env.REVIEW_PROVIDER ?? "openjev";
  if (provider !== "openjev" && provider !== "kev") {
    throw new Error("REVIEW_PROVIDER must be openjev or kev");
  }
  const urlVariable = provider === "kev" ? "KEV_BASE_URL" : "OPENJEV_BASE_URL";
  const baseURL = env[urlVariable] ?? "http://127.0.0.1:8009";
  const model = env.REVIEW_MODEL ?? (provider === "kev" ? "kev-latest" : "openjev-local");
  if (!model.trim()) throw new Error("REVIEW_MODEL must not be empty");

  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    throw new Error(`${urlVariable} must be a loopback HTTP origin, for example http://127.0.0.1:8009`);
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash
  ) {
    throw new Error(`${urlVariable} must be a loopback HTTP origin without credentials, path, query, or fragment`);
  }

  return new TypeSafeClient({
    baseURL: url.origin,
    apiKey: "local",
    defaultModel: model,
    logLevel: "off",
    timeout: 120_000,
    retry: { maxRetries: 0 },
    fetch: (input, init) => fetch(input, { ...init, redirect: "error" }),
  });
}

export const decisionClient = createDecisionClient();
