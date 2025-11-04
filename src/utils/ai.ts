/**
 * AI Payload Adapter (Router)
 *
 * Creates the correct payload for ai.run() based on the model ID.
 * - gpt-oss-120b expects: { instructions, input }
 * - Llama/Mistral expect: { messages: [...] }
 * - Fallback: { prompt: "..." }
 */
export function createAiPayload(
  model: string,
  instructions: string,
  prompt: string
): Record<string, unknown> {
  // Route for gpt-oss-120b
  if (model.includes('gpt-oss-120b')) {
    return {
      instructions,
      input: prompt,
    };
  }

  // Route for Llama 3, Mistral, etc. (using messages format)
  if (model.includes('llama') || model.includes('mistral')) {
    return {
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: prompt },
      ],
    };
  }

  // Fallback for other/older text-generation models
  return {
    prompt: `${instructions}\n\n${prompt}`,
  };
}
