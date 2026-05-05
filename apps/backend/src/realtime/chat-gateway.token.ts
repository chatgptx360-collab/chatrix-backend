/**
 * Symbol token for injecting `ChatGateway` without creating a runtime
 * import cycle.
 *
 * Why this exists:
 *   - `MessagesService` (in src/modules/messages) needs to call into the
 *     realtime gateway, and the gateway needs to call back into messages.
 *   - A direct class import on both sides creates a circular `require`,
 *     which the swc/CJS output resolves with live bindings — those throw
 *     TDZ when the second module's decorator metadata is evaluated before
 *     the first module finishes initialising.
 *   - Importing `ChatGateway` *as a type* and resolving it through a plain
 *     symbol token sidesteps the cycle entirely on the messages side.
 *
 * RealtimeModule registers this symbol via `useExisting: ChatGateway` so
 * both the class and the token resolve to the same singleton.
 */
export const CHAT_GATEWAY = Symbol("CHAT_GATEWAY");
