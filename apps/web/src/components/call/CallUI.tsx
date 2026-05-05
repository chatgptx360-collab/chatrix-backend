"use client";
/**
 * Top-level Call UI. Mounted once at the app shell so a call can pop in
 * from any screen.
 *
 *   - phase=incoming   → ringing modal with Accept / Decline
 *   - phase=outgoing   → "Calling…" overlay with Cancel
 *   - phase=active     → full-screen call (video tiles or audio avatar +
 *                         mute / camera / end controls)
 *   - phase=ended/idle → nothing
 *
 * The component is a render-only shell — all state lives in lib/call.ts.
 */

import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";
import {
  acceptCall, cancelCall, endCall, mountCallHandlers,
  rejectCall, toggleCamera, toggleMute, useCall,
} from "@/lib/call";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

export function CallUI() {
  const c = useCall();

  // Wire socket listeners exactly once.
  useEffect(() => { mountCallHandlers(); }, []);

  if (c.phase === "idle" || c.phase === "ended") return null;
  if (c.phase === "incoming") return <IncomingCall />;
  return <ActiveCall />;
}

// =============================================================================
// Incoming — modal-style ringing prompt with Accept / Decline.
// =============================================================================

function IncomingCall() {
  const c = useCall();
  if (!c.peer || !c.call) return null;
  const isVideo = c.call.kind === "video";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[min(92vw,400px)] rounded-3xl bg-surface border border-border shadow-2xl overflow-hidden">
        <div className="px-6 pt-7 pb-5 flex flex-col items-center text-center">
          <Avatar
            url={c.peer.avatarUrl}
            name={c.peer.displayName ?? c.peer.username}
            size={96}
          />
          <p className="mt-4 text-[18px] font-semibold text-fg">
            {c.peer.displayName ?? `@${c.peer.username}`}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            Incoming {isVideo ? "video" : "voice"} call
          </p>
        </div>

        <div className="flex items-center justify-around px-6 pb-7">
          <button
            type="button"
            onClick={() => rejectCall("declined")}
            aria-label="Decline call"
            className="h-16 w-16 rounded-full bg-danger text-white flex items-center justify-center shadow-lg hover:opacity-95 active:scale-95 transition"
          >
            <PhoneOff size={26} />
          </button>
          <button
            type="button"
            onClick={() => acceptCall()}
            aria-label="Accept call"
            className="h-16 w-16 rounded-full bg-success-gradient bg-emerald-500 text-white flex items-center justify-center shadow-lg hover:opacity-95 active:scale-95 transition"
          >
            <Phone size={26} fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Active call (and outgoing-ringing) — full-screen overlay.
// =============================================================================

function ActiveCall() {
  const c = useCall();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [elapsed, setElapsed] = useState(0);

  // Bind streams to the media elements.
  useEffect(() => {
    if (localVideoRef.current && c.localStream) {
      localVideoRef.current.srcObject = c.localStream;
    }
    if (remoteVideoRef.current && c.remoteStream) {
      remoteVideoRef.current.srcObject = c.remoteStream;
    }
    if (remoteAudioRef.current && c.remoteStream) {
      remoteAudioRef.current.srcObject = c.remoteStream;
    }
  }, [c.localStream, c.remoteStream]);

  // In-call timer.
  useEffect(() => {
    if (!c.answeredAt) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - c.answeredAt!) / 1000)), 500);
    return () => clearInterval(t);
  }, [c.answeredAt]);

  if (!c.peer || !c.call) return null;
  const isVideo = c.call.kind === "video";
  const isOutgoing = c.phase === "outgoing";
  const showControls = c.phase === "active" || isOutgoing;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0e0d12] text-white">
      {/* === Stage === */}
      <div className="flex-1 relative overflow-hidden">
        {isVideo && c.remoteStream ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover bg-black"
          />
        ) : (
          // Voice call OR video call still establishing — show peer avatar.
          <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950">
            <Avatar
              url={c.peer.avatarUrl}
              name={c.peer.displayName ?? c.peer.username}
              size={140}
            />
            <p className="mt-6 text-[22px] font-semibold">
              {c.peer.displayName ?? `@${c.peer.username}`}
            </p>
            <p className="mt-1 text-[13px] text-white/60 tabular-nums">
              {isOutgoing
                ? "Calling…"
                : c.remoteStream
                  ? fmtDuration(elapsed)
                  : "Connecting…"}
            </p>
          </div>
        )}

        {/* Video call: floating PiP for own camera */}
        {isVideo && c.localStream && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute bottom-6 right-6 w-32 h-44 rounded-2xl object-cover border-2 border-white/30 shadow-xl",
              c.isCameraOff && "hidden",
            )}
          />
        )}

        {/* Voice call: hidden audio sink for the remote stream */}
        {!isVideo && (
          <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
        )}

        {/* Header: peer info + duration (overlay on video) */}
        {isVideo && (
          <div className="absolute top-0 inset-x-0 px-5 py-4 flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent">
            <Avatar
              url={c.peer.avatarUrl}
              name={c.peer.displayName ?? c.peer.username}
              size={36}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold truncate">
                {c.peer.displayName ?? `@${c.peer.username}`}
              </p>
              <p className="text-[12px] text-white/70 tabular-nums">
                {isOutgoing ? "Calling…" : c.remoteStream ? fmtDuration(elapsed) : "Connecting…"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* === Controls === */}
      {showControls && (
        <div className="px-6 py-7 flex items-center justify-center gap-5 bg-[#0e0d12]">
          <CallButton
            onClick={toggleMute}
            active={c.isMuted}
            label={c.isMuted ? "Unmute" : "Mute"}
          >
            {c.isMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </CallButton>

          <button
            type="button"
            onClick={isOutgoing ? cancelCall : endCall}
            aria-label={isOutgoing ? "Cancel call" : "End call"}
            className="h-16 w-16 rounded-full bg-danger text-white flex items-center justify-center shadow-lg hover:opacity-95 active:scale-95 transition"
          >
            <PhoneOff size={26} />
          </button>

          {isVideo ? (
            <CallButton
              onClick={toggleCamera}
              active={c.isCameraOff}
              label={c.isCameraOff ? "Camera on" : "Camera off"}
            >
              {c.isCameraOff ? <VideoOff size={22} /> : <Video size={22} />}
            </CallButton>
          ) : (
            // Spacer so the End button stays centred in voice calls.
            <div className="w-12 h-12" />
          )}
        </div>
      )}
    </div>
  );
}

function CallButton({
  onClick, active, label, children,
}: {
  onClick: () => void;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "h-12 w-12 rounded-full flex items-center justify-center transition active:scale-95",
        active
          ? "bg-white text-zinc-900"
          : "bg-white/10 text-white hover:bg-white/15",
      )}
    >
      {children}
    </button>
  );
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
