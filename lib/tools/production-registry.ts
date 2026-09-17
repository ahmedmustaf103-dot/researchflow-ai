import { getEnv } from "@/lib/env";
import { createJinaFetchPageTool } from "./fetch-page/jina";
import { createToolRegistry } from "./registry";
import { createBraveSearchTool } from "./search/brave";

export function createProductionToolRegistry() {
  const env = getEnv();
  const registry = createToolRegistry();

  registry.registerInternal(
    createBraveSearchTool({
      apiKey: env.BRAVE_API_KEY,
    }),
  );
  registry.registerInternal(
    createJinaFetchPageTool({
      apiKey: env.JINA_API_KEY,
    }),
  );

  return registry;
}
