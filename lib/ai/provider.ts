import type { ZodType } from "zod";

export interface GenerateTextInput {
  system?: string;
  prompt: string;
}

export interface GenerateTextResult {
  text: string;
}

export interface GenerateObjectInput {
  system?: string;
  prompt: string;
}

export interface GenerateObjectResult<T> {
  object: T;
}

export interface ProviderToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface GenerateWithToolsInput {
  system?: string;
  prompt: string;
}

export interface ToolCall {
  id?: string;
  name: string;
  arguments: unknown;
}

export interface GenerateWithToolsResult {
  text?: string;
  toolCalls: ToolCall[];
}

export interface EmbedInput {
  texts: string[];
}

export interface EmbedResult {
  embeddings: number[][];
}

/**
 * Provider-agnostic LLM interface.
 * Gemini implements this in Phase 2; tests use a mock.
 */
export interface LLMProvider {
  readonly id: string;
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
  generateObject<T>(
    input: GenerateObjectInput,
    schema: ZodType<T>,
  ): Promise<GenerateObjectResult<T>>;
  generateWithTools(
    input: GenerateWithToolsInput,
    tools: ProviderToolDefinition[],
  ): Promise<GenerateWithToolsResult>;
  embed(input: EmbedInput): Promise<EmbedResult>;
}
