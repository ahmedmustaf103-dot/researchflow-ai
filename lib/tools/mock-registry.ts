import { createToolRegistry } from "./registry";
import { mockFetchPageTool } from "./fetch-page";
import { mockSearchTool } from "./search";

export function createMockToolRegistry() {
  const registry = createToolRegistry();
  registry.registerInternal(mockSearchTool);
  registry.registerInternal(mockFetchPageTool);
  return registry;
}
