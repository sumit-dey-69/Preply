"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RoomSyncProvider } from "@/components/livepdf/room-sync-provider";
import { RoomShell } from "@/components/livepdf/room-shell";
import { NameGate } from "@/components/livepdf/name-gate";
import { loadLocalParticipant, setDisplayName } from "@/lib/participant";
import { addRecentRoom } from "@/lib/recent-rooms";
import { Loader2, FileQuestion, ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface RoomInfo {
  id: string;
  code: string;
  name: string;
  createdAt: string;
  hasPassword?: boolean;
}

type Status = "loading" | "not_found" | "ready" | "need_name" | "locked";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params?.code ?? "").toString().toUpperCase();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [displayName, setDisplayNameState] = useState<string>("");
  const [passwordInput, setPasswordInput] = useState("");
  const [checkingPassword, setCheckingPassword] = useState(false);

  async function checkRoom(pw?: string) {
    try {
      const url = pw
        ? `/api/rooms/${code}?password=${encodeURIComponent(pw)}`
        : `/api/rooms/${code}`;
      const res = await fetch(url);
      if (res.status === 401) {
        const data = await res.json();
        if (data.locked) {
          setStatus("locked");
          return;
        }
      }
      if (!res.ok) {
        setStatus("not_found");
        return;
      }
      const data = await res.json();
      setRoom(data.room);
      const local = loadLocalParticipant();
      if (!local || !local.displayName || local.displayName.startsWith("Guest-")) {
        setStatus("need_name");
      } else {
        setDisplayNameState(local.displayName);
        setStatus("ready");
      }
    } catch {
      setStatus("not_found");
    }
  }

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${code}`);
        if (!cancelled && res.status === 401) {
          const data = await res.json();
          if (data.locked) {
            setStatus("locked");
            return;
          }
        }
        if (!cancelled && !res.ok) {
          setStatus("not_found");
          return;
        }
        if (cancelled) return;
        const data = await res.json();
        setRoom(data.room);
        const local = loadLocalParticipant();
        if (!local || !local.displayName || local.displayName.startsWith("Guest-")) {
          setStatus("need_name");
        } else {
          setDisplayNameState(local.displayName);
          addRecentRoom(code, data.room?.name || code);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("not_found");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  function handleNameSubmit(name: string) {
    setDisplayName(name);
    setDisplayNameState(name);
    if (room) addRecentRoom(code, room.name || code);
    setStatus("ready");
  }

  async function handlePasswordSubmit() {
    const pw = passwordInput.trim();
    if (!pw) return;
    setCheckingPassword(true);
    try {
      const res = await fetch(`/api/rooms/${code}?password=${encodeURIComponent(pw)}`);
      if (res.status === 401) {
        toast({ title: "Wrong password", description: "Please try again.", variant: "destructive" });
        return;
      }
      if (!res.ok) {
        setStatus("not_found");
        return;
      }
      const data = await res.json();
      setRoom(data.room);
      toast({ title: "Welcome", description: "Password accepted." });
      // store password in sessionStorage so subsequent API calls use it
      try {
        sessionStorage.setItem(`livepdf:pw:${code}`, pw);
      } catch {}
      const local = loadLocalParticipant();
      if (!local || !local.displayName || local.displayName.startsWith("Guest-")) {
        setStatus("need_name");
      } else {
        setDisplayNameState(local.displayName);
        setStatus("ready");
      }
    } catch {
      toast({ title: "Error", description: "Could not verify password.", variant: "destructive" });
    } finally {
      setCheckingPassword(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
          <FileQuestion className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Room not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The room <span className="font-mono font-medium">{code}</span> doesn’t exist or has been closed.
          </p>
        </div>
        <Button onClick={() => router.push("/")} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to home
        </Button>
      </div>
    );
  }

  if (status === "locked") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-amber-500/10 blur-3xl" />
        </div>
        <Card className="w-full max-w-sm shadow-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
              <Lock className="h-6 w-6" />
            </div>
            <CardTitle>Room locked</CardTitle>
            <CardDescription>
              {room?.name ? room.name : `Room ${code}`} requires a password to join.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="password"
              autoFocus
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
              placeholder="Enter room password"
              maxLength={100}
            />
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => router.push("/")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button
              className="flex-1 bg-amber-600 text-white hover:bg-amber-700"
              onClick={handlePasswordSubmit}
              disabled={checkingPassword || !passwordInput.trim()}
            >
              {checkingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
              Unlock
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (status === "need_name") {
    return <NameGate roomCode={code} roomName={room?.name} onSubmit={handleNameSubmit} />;
  }

  return (
    <RoomSyncProvider roomCode={code} displayName={displayName}>
      <RoomShell room={room} />
    </RoomSyncProvider>
  );
}
