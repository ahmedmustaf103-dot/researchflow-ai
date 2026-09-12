import { getEnv } from "@/lib/env";
import { createJinaFetchPageTool } from "./fetch-page/jina";
import { createToolRegistry } from "./registry";
import { createTavilySearchTool } from "./search/tavily";

export function createProductionToolRegistry() {
  const env = getEnv();
  const registry = createToolRegistry();

  registry.registerInternal(
    createTavilySearchTool({
      apiKey: env.TAVILY_API_KEY,
    }),
  );
  registry.registerInternal(
    createJinaFetchPageTool({
      apiKey: env.JINA_API_KEY,
    }),
  );

  return registry;
}
