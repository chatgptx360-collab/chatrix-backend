"use client";
/**
 * 1:1 voice/video call manager.
 *
 *   ─────────────────────────────────────────────────────────
 *   State diagram (mirrors the backend's calls table):
 *
 *       idle
 *        │
 *        ├── start()    →  outgoing  ─── peer accepts ─→ active ─── end ─→ idle
 *        │                       │
 *        │                       ├── peer rejects/timeout → idle
 *        │                       └── caller cancels       → idle
 *        │
 *        └── server pushes call:incoming → incoming
 *                                            │
 *                                            ├── accept() → active → end → idle
 *                                            └── reject() → idle
 *
 *   Only one call lives in the store at a time. Attempting to start a new
 *   call while one is in flight is a no-op (the UI button is disabled).
 *
 *   ─────────────────────────────────────────────────────────
 *   WebRTC plumbing:
 *
 *   - The *callee* is the impolite peer in our setup: caller creates the
 *     RTCPeerConnection on accept-confirm and emits the offer; callee
 *     responds with an answer.
 *   - We don't bother with perfect-negotiation since this is 1:1 and we
 *     never renegotiate mid-call. Track mute/unmute is done by toggling
 *     the local track's enabled flag (no SDP churn).
 *   - ICE candidates are exchanged through the gateway; trickling is
 *     enabled (we send candidates as they're discovered).
 */

import { useSyncExternalStore } from "react";
import type { Call, CallKind, IceServer, PublicUser } from "@chatrix/shared/types";
import type { IcePayload, SdpPayload } from "@chatrix/shared/events";
import { getSocket } from "./socket";

export type CallPhase = "idle" | "outgoing" | "incoming" | "active" | "ended";

interface CallSnapshot {
  phase: CallPhase;
  call: Call | null;
  peer: PublicUser | null;
  iceServers: IceServer[];
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  /** Last error to surface to the UI, if any. */
  error: string | null;
  /** Wall-clock when the call was answered (used to drive the in-call timer). */
  answeredAt: number | null;
}

const initial: CallSnapshot = {
  phase: "idle",
  call: null,
  peer: null,
  iceServers: [],
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isCameraOff: false,
  error: null,
  answeredAt: null,
};

// ---------- Mutable singletons (the WebRTC objects don't belong in React state) ----------

let pc: RTCPeerConnection | null = null;
/** Buffered remote ICE candidates received before the remote description was set. */
const pendingRemoteIce: RTCIceCandidateInit[] = [];

// ---------- Subscriber bookkeeping (manual store; React subscribes via useSyncExternalStore) ----------

let snapshot: CallSnapshot = initial;
const listeners = new Set<() => void>();

function emit(next: Partial<CallSnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function getSnapshot(): CallSnapshot { return snapshot; }
const ssrSnapshot: CallSnapshot = initial;
function getServerSnapshot(): CallSnapshot { return ssrSnapshot; }

/** Reactive hook for components. */
export function useCall(): CallSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
/** Imperative read for non-React contexts (event handlers below). */
export function readCall(): CallSnapshot { return snapshot; }

// =============================================================================
// Public API
// =============================================================================

/**
 * Place an outbound call. Returns once the invite is acknowledged by the
 * server (i.e. the callee's device is being rung).
 */
export async function startCall(args: {
  calleeId: string;
  peer: PublicUser;
  kind: CallKind;
  chatId?: string;
}): Promise<void> {
  if (snapshot.phase !== "idle") {
    throw new Error("Already in a call.");
  }

  // Optimistic local-stream capture so the user sees their preview even
  // before the server acks. If the user denies permission we bail out
  // *before* the invite goes over the wire.
  const localStream = await getUserMediaForKind(args.kind);
  emit({
    phase: "outgoing",
    peer: args.peer,
    localStream,
    isMuted: false,
    isCameraOff: false,
    error: null,
  });

  const socket = getSocket();
  const ack = await emitWithAck(socket, "call:invite", {
    calleeId: args.calleeId,
    kind: args.kind,
    chatId: args.chatId,
  });
  if (!ack.ok) {
    teardownLocal();
    emit({ phase: "idle", error: ack.message });
    return;
  }

  emit({
    call: { // server returns callId + iceServers; build a synthetic Call snapshot
      id: ack.callId,
      chatId: args.chatId ?? null,
      callerId: "self", // overwritten when call:accepted fires; we don't render this
      calleeId: args.calleeId,
      kind: args.kind,
      status: "ringing",
      startedAt: new Date().toISOString(),
      answeredAt: null,
      endedAt: null,
      durationMs: null,
    },
    iceServers: ack.iceServers,
  });

  // Don't build the peer connection yet — we wait until call:accepted so
  // we don't waste ICE candidates pinging into the void.
}

/** Callee accepts an incoming invite. */
export async function acceptCall(): Promise<void> {
  const s = snapshot;
  if (s.phase !== "incoming" || !s.call) return;

  // Capture local media first so the preview is up before we ack.
  let localStream: MediaStream;
  try {
    localStream = await getUserMediaForKind(s.call.kind);
  } catch (err) {
    rejectCall("media-denied");
    emit({ error: (err as Error).message });
    return;
  }

  const socket = getSocket();
  const ack = await emitWithAck(socket, "call:accept", { callId: s.call.id });
  if (!ack.ok) {
    localStream.getTracks().forEach((t) => t.stop());
    emit({ phase: "idle", error: ack.message });
    return;
  }

  // Callee builds the PC now and waits for the offer to arrive over the wire.
  buildPeerConnection(ack.iceServers, localStream, "callee");
  emit({
    phase: "active",
    localStream,
    iceServers: ack.iceServers,
    answeredAt: Date.now(),
  });
}

export function rejectCall(reason?: string): void {
  const s = snapshot;
  if (s.phase !== "incoming" || !s.call) return;
  getSocket().emit("call:reject", { callId: s.call.id, reason });
  emit({ ...initial });
}

export function cancelCall(): void {
  const s = snapshot;
  if (s.phase !== "outgoing" || !s.call) return;
  getSocket().emit("call:cancel", { callId: s.call.id });
  teardownLocal();
  emit({ ...initial });
}

/** Hangup after pickup. Either side can call this. */
export function endCall(): void {
  const s = snapshot;
  if (s.phase !== "active" && s.phase !== "outgoing") return;
  if (s.call) getSocket().emit("call:end", { callId: s.call.id });
  teardownEverything();
  emit({ ...initial });
}

export function toggleMute(): void {
  const s = snapshot;
  const stream = s.localStream;
  if (!stream) return;
  const newMuted = !s.isMuted;
  stream.getAudioTracks().forEach((t) => { t.enabled = !newMuted; });
  emit({ isMuted: newMuted });
}

export function toggleCamera(): void {
  const s = snapshot;
  const stream = s.localStream;
  if (!stream) return;
  const newOff = !s.isCameraOff;
  stream.getVideoTracks().forEach((t) => { t.enabled = !newOff; });
  emit({ isCameraOff: newOff });
}

// =============================================================================
// Socket wiring — invoked once on app boot via mountCallHandlers().
// =============================================================================

let mounted = false;
export function mountCallHandlers(): void {
  if (mounted) return;
  mounted = true;
  const socket = getSocket();

  socket.on("call:incoming", ({ call, from, iceServers }) => {
    if (snapshot.phase !== "idle") {
      // Already in a call — auto-decline so we don't ghost.
      socket.emit("call:reject", { callId: call.id, reason: "busy" });
      return;
    }
    emit({
      phase: "incoming",
      call,
      peer: from,
      iceServers,
      error: null,
    });
  });

  socket.on("call:accepted", async ({ callId, by }) => {
    const s = snapshot;
    if (!s.call || s.call.id !== callId) return;
    // Caller now builds the PC and emits the offer.
    if (!s.localStream) return;
    buildPeerConnection(s.iceServers, s.localStream, "caller");
    emit({
      phase: "active",
      peer: by,
      answeredAt: Date.now(),
    });
    try {
      const offer = await pc!.createOffer();
      await pc!.setLocalDescription(offer);
      socket.emit("call:offer", {
        callId,
        sdp: { type: "offer", sdp: offer.sdp ?? "" },
      });
    } catch (err) {
      console.error("call:offer create failed", err);
      endCall();
    }
  });

  socket.on("call:rejected", () => {
    teardownEverything();
    emit({ ...initial, error: "Call declined." });
  });

  socket.on("call:cancelled", () => {
    teardownEverything();
    emit({ ...initial, error: "Caller cancelled." });
  });

  socket.on("call:ended", () => {
    teardownEverything();
    emit({ ...initial });
  });

  socket.on("call:offer", async ({ callId, sdp }) => {
    if (!pc || !snapshot.call || snapshot.call.id !== callId) return;
    try {
      await pc.setRemoteDescription({ type: "offer", sdp: sdp.sdp });
      // Drain any ICE that arrived before the remote description was set.
      for (const c of pendingRemoteIce.splice(0)) {
        await pc.addIceCandidate(c).catch(() => {});
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("call:answer", {
        callId,
        sdp: { type: "answer", sdp: answer.sdp ?? "" },
      });
    } catch (err) {
      console.error("call:offer handle failed", err);
    }
  });

  socket.on("call:answer", async ({ callId, sdp }) => {
    if (!pc || !snapshot.call || snapshot.call.id !== callId) return;
    try {
      await pc.setRemoteDescription({ type: "answer", sdp: sdp.sdp });
      for (const c of pendingRemoteIce.splice(0)) {
        await pc.addIceCandidate(c).catch(() => {});
      }
    } catch (err) {
      console.error("call:answer handle failed", err);
    }
  });

  socket.on("call:ice", async ({ callId, candidate }) => {
    if (!pc || !snapshot.call || snapshot.call.id !== callId) return;
    const init: RTCIceCandidateInit = {
      candidate: candidate.candidate,
      sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
      sdpMid: candidate.sdpMid ?? undefined,
      usernameFragment: candidate.usernameFragment ?? undefined,
    };
    if (!pc.remoteDescription) {
      pendingRemoteIce.push(init);
      return;
    }
    try { await pc.addIceCandidate(init); } catch { /* ignore */ }
  });
}

// =============================================================================
// Internals
// =============================================================================

async function getUserMediaForKind(kind: CallKind): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    throw new Error("Media devices unavailable.");
  }
  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: kind === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
  });
}

function buildPeerConnection(iceServers: IceServer[], local: MediaStream, role: "caller" | "callee") {
  pc = new RTCPeerConnection({
    iceServers: iceServers as RTCIceServer[],
    bundlePolicy: "balanced",
    rtcpMuxPolicy: "require",
  });

  for (const track of local.getTracks()) pc.addTrack(track, local);

  // Local ICE → wire.
  pc.onicecandidate = (e) => {
    if (!e.candidate || !snapshot.call) return;
    getSocket().emit("call:ice", {
      callId: snapshot.call.id,
      candidate: {
        candidate: e.candidate.candidate,
        sdpMLineIndex: e.candidate.sdpMLineIndex,
        sdpMid: e.candidate.sdpMid,
        usernameFragment: e.candidate.usernameFragment,
      } as IcePayload,
    });
  };

  // Remote tracks → mounted into a single MediaStream we expose on snapshot.
  const remote = new MediaStream();
  pc.ontrack = (e) => {
    e.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
    e.track.onunmute = () => emit({ remoteStream: remote });
    emit({ remoteStream: remote });
  };

  pc.onconnectionstatechange = () => {
    const state = pc?.connectionState;
    if (state === "failed" || state === "disconnected") {
      console.warn(`call peer connection ${state}`);
      // We don't auto-end on transient 'disconnected' — WebRTC may recover.
      // 'failed' is terminal; tear down.
      if (state === "failed") endCall();
    }
  };

  // role is unused for now but useful for debugging breadcrumbs.
  void role;
}

/** Stop tracks on the local mic/cam capture. Used on cancel/reject paths. */
function teardownLocal() {
  snapshot.localStream?.getTracks().forEach((t) => t.stop());
}

/** Stop tracks AND tear down the peer connection. Used after pickup. */
function teardownEverything() {
  teardownLocal();
  if (pc) {
    try { pc.close(); } catch { /* ignore */ }
    pc = null;
  }
  pendingRemoteIce.length = 0;
}

// ---------- Socket emit-with-ack helper ----------

/**
 * socket.io's ack callback typed against ClientToServerEvents. We wrap into
 * a Promise for ergonomics. A 5-second client-side timeout protects against
 * a wedged server — the call flow has its own server-side ring timeout, but
 * the *invite ack* should be near-instant.
 */
function emitWithAck<E extends "call:invite" | "call:accept">(
  socket: ReturnType<typeof getSocket>,
  event: E,
  payload: any,
): Promise<any> {
  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, code: "TIMEOUT", message: "No response from server." });
    }, 5_000);
    (socket as any).emit(event, payload, (result: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve(result);
    });
  });
}

/** Used by debug overlays. */
export function _internalDebug() {
  return { snapshot, hasPc: !!pc, pendingRemoteIce: pendingRemoteIce.length };
}
