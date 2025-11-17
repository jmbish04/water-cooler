import type { DurableObject } from "cloudflare:workers";
import { broadcast } from "../utils/ws";

/**
 * A Durable Object that manages a WebSocket chat room.
 * It uses the hibernatable WebSocket API for scalability.
 */
export class RoomDO implements DurableObject {
  ctx: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.ctx = state;
  }

  /**
   * The fetch handler is called when a request is sent to the Durable Object.
   * It's responsible for upgrading the HTTP connection to a WebSocket connection.
   */
  async fetch(request: Request): Promise<Response> {
    // A WebSocket upgrade request is expected.
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade request", { status: 426 });
    }

    // Create a new WebSocket pair. The client-side socket is returned to the user,
    // while the server-side socket is passed to the runtime.
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // This is the crucial part of the hibernatable WebSocket API.
    // It hands off the server-side socket to the Cloudflare runtime,
    // allowing the Durable Object to hibernate when no messages are being sent.
    this.ctx.acceptWebSocket(server);

    // The client-side socket is returned to the user, establishing the connection.
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Called by the runtime when a WebSocket message is received.
   * @param ws The WebSocket the message was received on.
   * @param message The message content.
   */
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const textMessage = typeof message === "string" ? message : new TextDecoder().decode(message);

    // Broadcast the received message to all other connected clients in this room.
    broadcast([...this.ctx.getWebSockets()], textMessage, ws);
  }

  /**
   * Called by the runtime when a WebSocket is closed.
   * @param ws The WebSocket that was closed.
   * @param code The close code.
   * @param reason The close reason.
   * @param wasClean Whether the connection closed cleanly.
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    console.log(`WebSocket closed: code=${code}, reason="${reason}", wasClean=${wasClean}`);
    // The runtime automatically removes the closed socket from the list of WebSockets.
    // No manual cleanup of the socket is needed here.
  }

  /**
   * Called by the runtime when a WebSocket error occurs.
   * @param ws The WebSocket that encountered an error.
   * @param error The error that occurred.
   */
  async webSocketError(ws: WebSocket, error: unknown) {
    console.error("WebSocket error:", error);
    // The runtime will automatically close the socket after this handler returns.
  }
}
