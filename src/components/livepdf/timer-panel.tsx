"use client";

import { useEffect, useMemo, useState } from "react";
import { useRoomSync, useElapsedMs } from "./room-sync-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Play, Pause, RotateCcw, Timer as TimerIcon, AlarmClock, Flag, Trash2 } from "lucide-react";
import { COUNTDOWN_PRESETS_MIN } from "@/lib/constants";
import { formatTimer } from "@/lib/types";
import type { TimerMode } from "@/lib/types";

interface Lap {
  index: number;
  totalMs: number;
  splitMs: number;
  at: number;
}

const LAPS_KEY = (roomCode: string) => `livepdf:laps:${roomCode}`;

export function TimerPanel() {
  const sync = useRoomSync();
  const { timer } = sync;
  const elapsedMs = useElapsedMs();
  const [customMin, setCustomMin] = useState<string>("");
  const [laps, setLaps] = useState<Lap[]>([]);

  // Load persisted laps on mount / room change
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LAPS_KEY(sync.roomCode));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setLaps(parsed);
      }
    } catch {
      /* ignore */
    }
  }, [sync.roomCode]);

  // Persist laps whenever they change
  useEffect(() => {
    try {
      if (laps.length > 0) {
        window.localStorage.setItem(LAPS_KEY(sync.roomCode), JSON.stringify(laps));
      } else {
        window.localStorage.removeItem(LAPS_KEY(sync.roomCode));
      }
    } catch {
      /* ignore */
    }
  }, [laps, sync.roomCode]);

  const mode = timer.mode;
  const remainingMs = useMemo(() => {
    if (mode !== "countdown" || timer.duration == null) return 0;
    return Math.max(0, timer.duration - elapsedMs);
  }, [mode, timer.duration, elapsedMs]);

  const displayMs = mode === "countdown" ? remainingMs : elapsedMs;
  const displayLabel = formatTimer(displayMs, mode);

  // finished ring pulse
  const finished = mode === "countdown" && timer.status === "finished";

  function startStopwatch() {
    sync.timerStart("stopwatch");
  }
  function startCountdown(durationMs: number) {
    sync.timerStart("countdown", durationMs);
  }
  function pause() {
    sync.timerPause();
  }
  function resume() {
    sync.timerResume();
  }
  function reset() {
    sync.timerReset();
    setLaps([]);
  }
  function recordLap() {
    if (mode !== "stopwatch" || timer.status !== "running") return;
    const prevTotal = laps.length > 0 ? laps[laps.length - 1].totalMs : 0;
    setLaps((prev) => [
      ...prev,
      {
        index: prev.length + 1,
        totalMs: elapsedMs,
        splitMs: elapsedMs - prevTotal,
        at: Date.now(),
      },
    ]);
  }
  function clearLaps() {
    setLaps([]);
  }
  function switchMode(m: TimerMode) {
    // reset then set mode by starting fresh
    reset();
    if (m === "countdown") {
      // start a default 5 min countdown immediately
      startCountdown(5 * 60 * 1000);
    } else {
      startStopwatch();
    }
  }

  const status = timer.status;
  const isRunning = status === "running";
  const isPaused = status === "paused";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <TimerIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Timer</h3>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
            isRunning && "bg-emerald-500/10 text-emerald-600",
            isPaused && "bg-amber-500/10 text-amber-600",
            status === "idle" && "bg-muted text-muted-foreground",
            finished && "bg-destructive/10 text-destructive"
          )}
        >
          {finished ? "finished" : status}
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {/* mode tabs */}
        <Tabs value={mode} onValueChange={(v) => switchMode(v as TimerMode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="stopwatch" className="gap-1.5 text-xs">
              <TimerIcon className="h-3.5 w-3.5" /> Stopwatch
            </TabsTrigger>
            <TabsTrigger value="countdown" className="gap-1.5 text-xs">
              <AlarmClock className="h-3.5 w-3.5" /> Countdown
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* big display */}
        <div
          className={cn(
            "relative flex flex-col items-center justify-center rounded-xl border bg-gradient-to-br from-card to-muted/40 py-5",
            finished && "animate-pulse border-destructive/40"
          )}
        >
          <div className="absolute right-2 top-2 flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className={cn("relative flex h-1.5 w-1.5", isRunning && "flex")}>
              {isRunning && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
              <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", isRunning ? "bg-emerald-500" : "bg-muted-foreground/40")} />
            </span>
            server-synced
          </div>
          <p className={cn("font-mono text-4xl font-bold tabular-nums tracking-tight", finished && "text-destructive")}>
            {displayLabel}
          </p>
          {mode === "countdown" && timer.duration != null && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              of {formatTimer(timer.duration, "countdown")}
            </p>
          )}
          {mode === "stopwatch" && (
            <p className="mt-1 text-[11px] text-muted-foreground">elapsed</p>
          )}
        </div>

        {/* controls */}
        <div className="grid grid-cols-3 gap-2">
          {status === "idle" || status === "finished" ? (
            <Button
              className="col-span-3 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => (mode === "stopwatch" ? startStopwatch() : startCountdown(timer.duration ?? 5 * 60 * 1000))}
            >
              <Play className="h-4 w-4" /> {status === "finished" ? "Restart" : "Start"}
            </Button>
          ) : (
            <>
              {isRunning ? (
                <Button variant="default" className="gap-1.5" onClick={pause}>
                  <Pause className="h-4 w-4" /> Pause
                </Button>
              ) : (
                <Button variant="default" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700" onClick={resume}>
                  <Play className="h-4 w-4" /> Resume
                </Button>
              )}
              <Button variant="outline" className="gap-1.5" onClick={reset}>
                <RotateCcw className="h-4 w-4" /> Reset
              </Button>
              {mode === "countdown" && timer.duration != null && (
                <Button variant="secondary" className="gap-1.5" onClick={() => startCountdown(timer.duration)}>
                  <Flag className="h-4 w-4" /> Again
                </Button>
              )}
              {mode === "stopwatch" && isRunning && (
                <Button variant="secondary" className="gap-1.5" onClick={recordLap} title="Record a lap split">
                  <Flag className="h-4 w-4" /> Lap
                </Button>
              )}
            </>
          )}
        </div>

        {/* stopwatch laps */}
        {mode === "stopwatch" && laps.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Laps ({laps.length})</p>
              <button
                onClick={clearLaps}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-destructive"
                title="Clear laps"
              >
                <Trash2 className="h-3 w-3" /> clear
              </button>
            </div>
            <ScrollArea className="max-h-32 rounded-lg border">
              <ul className="divide-y">
                {laps.map((lap) => (
                  <li key={lap.index} className="flex items-center justify-between px-2.5 py-1.5 text-xs">
                    <span className="font-mono text-muted-foreground">#{lap.index}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">{formatTimer(lap.splitMs, "stopwatch")}</span>
                    <span className="font-mono font-medium tabular-nums">{formatTimer(lap.totalMs, "stopwatch")}</span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}

        {/* countdown presets */}
        {mode === "countdown" && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Quick start</p>
            <div className="grid grid-cols-3 gap-1.5">
              {COUNTDOWN_PRESETS_MIN.map((m) => (
                <Button
                  key={m}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => startCountdown(m * 60 * 1000)}
                  disabled={isRunning}
                >
                  {m < 60 ? `${m}m` : `${m / 60}h`}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={600}
                value={customMin}
                onChange={(e) => setCustomMin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="custom (min)"
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const n = parseInt(customMin, 10);
                    if (!isNaN(n) && n > 0) startCountdown(n * 60 * 1000);
                  }
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                className="h-8 shrink-0 text-xs"
                disabled={!customMin || parseInt(customMin, 10) <= 0}
                onClick={() => {
                  const n = parseInt(customMin, 10);
                  if (!isNaN(n) && n > 0) startCountdown(n * 60 * 1000);
                }}
              >
                Start
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
