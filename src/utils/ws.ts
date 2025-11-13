/**
 * Broadcasts a message to an array of WebSockets.
 *
 * @param sockets The array of WebSockets to send the message to.
 * @param message The message to send.
 * @param sender The WebSocket that sent the message (will be excluded from broadcast).
 */
export function broadcast(sockets: WebSocket[], message: string | ArrayBuffer, sender?: WebSocket) {
  for (const sock of sockets) {
    if (sock !== sender) {
      try {
        sock.send(message);
      } catch (e) {
        console.error("Failed to send message to a WebSocket:", e);
        // It's common for sockets to be in a closing state. We can ignore these errors.
      }
    }
  }
}

/**
 * A utility for creating structured WebSocket messages.
 *
 * @param type The message type.
 * @param payload The message payload.
 * @param meta Optional metadata.
 * @returns A JSON string representation of the message.
 */
export function createSocketMessage(type: string, payload: unknown, meta?: unknown): string {
  const message = {
    type,
    payload,
    meta: {
      ...meta,
      timestamp: new Date().toISOString(),
    },
  };
  return JSON.stringify(message);
}
