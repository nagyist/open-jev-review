import { TypeSafeClient } from "@typesafe-ai/sdk";

export function createOpenJevClient(baseURL = process.env.OPENJEV_BASE_URL ?? "http://127.0.0.1:8009") {
  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    throw new Error("OPENJEV_BASE_URL must be a loopback HTTP origin, for example http://127.0.0.1:8009");
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash
  ) {
    throw new Error("OPENJEV_BASE_URL must be a loopback HTTP origin without credentials, path, query, or fragment");
  }

  return new TypeSafeClient({
    baseURL: url.origin,
    apiKey: "local",
    defaultModel: "openjev-local",
    logLevel: "off",
    timeout: 120_000,
    retry: { maxRetries: 0 },
    fetch: (input, init) => fetch(input, { ...init, redirect: "error" }),
  });
}

export const openJev = createOpenJevClient();
