"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { setDisplayName } from "@/lib/participant";
import { addRecentRoom, loadRecentRooms, removeRecentRoom, type RecentRoom } from "@/lib/recent-rooms";
import {
    ArrowRight,
    Clock,
    FileText,
    Github,
    Hash,
    Loader2,
    MousePointerClick,
    Radio,
    ShieldCheck,
    Sparkles,
    Timer,
    Users,
    X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const FEATURES = [
  {
    icon: Radio,
    title: "Real-time sync",
    desc: "Page, scroll, zoom and rotation stay in lockstep across every browser via WebSockets.",
  },
  {
    icon: Timer,
    title: "Shared timers",
    desc: "A server-authoritative stopwatch & countdown keep everyone on the exact same clock.",
  },
  {
    icon: Users,
    title: "Anonymous rooms",
    desc: "Create a room, share the code, and start solving together — no accounts required.",
  },
  {
    icon: MousePointerClick,
    title: "Presenter mode",
    desc: "Hand control to one presenter, or let everyone drive in shared mode.",
  },
];

export default function Home() {
  const router = useRouter();
  const { toast } = useToast();

  const [createName, setCreateName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joining, setJoining] = useState(false);

  async function handleCreate() {
    const name = createName.trim();
    if (!name) {
      toast({ title: "Enter your name", description: "Pick a display name so others recognize you.", variant: "destructive" });
      return;
    }
    setCreating(true);
    setDisplayName(name);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostName: name, name: roomName.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create room");
      toast({ title: "Room created", description: `Room code: ${data.room.code}` });
      addRecentRoom(data.room.code, data.room.name || `${name}'s Study Room`);
      router.push(`/room/${data.room.code}`);
    } catch (e: any) {
      toast({ title: "Could not create room", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    const name = joinName.trim();
    if (code.length !== 6) {
      toast({ title: "Invalid code", description: "Room codes are 6 characters (A–Z, 2–9).", variant: "destructive" });
      return;
    }
    if (!name) {
      toast({ title: "Enter your name", description: "Pick a display name so others recognize you.", variant: "destructive" });
      return;
    }
    setJoining(true);
    try {
      const res = await fetch(`/api/rooms/${code}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Room not found");
      setDisplayName(name);
      addRecentRoom(code, data.room?.name || code);
      router.push(`/room/${code}`);
    } catch (e: any) {
      setJoining(false);
      toast({ title: "Room not found", description: "Double-check the code and try again.", variant: "destructive" });
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ambient gradient backdrop */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-32 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,oklch(0.5_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.5_0_0/0.04)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      </div>

      {/* nav */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <FileText className="h-5 w-5" />
            </div>
            <div className="leading-none">
              <p className="text-base font-semibold tracking-tight">Preply</p>
              <p className="text-[11px] text-muted-foreground">Collaborative PDF study room</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="hidden gap-1.5 sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live sync engine
            </Badge>
            <ThemeToggle className="h-8 w-8" />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* hero */}
        <section className="mx-auto max-w-6xl px-4 pb-6 pt-12 text-center sm:px-6 sm:pt-20">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Study together, solve faster
          </div>
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
            One shared PDF viewer,
            <br className="hidden sm:block" /> synced across every browser.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            Create a private study room, upload a question paper, and let everyone read, scroll,
            zoom and time themselves together — as if you were looking at the same screen.
          </p>
        </section>

        {/* create / join */}
        <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <div className="grid gap-5 md:grid-cols-2">
            {/* create */}
            <Card className="relative overflow-hidden border-emerald-500/30 shadow-sm">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                    <Radio className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-lg">Create a room</CardTitle>
                </div>
                <CardDescription>
                  Spin up a new room and get a shareable code + link.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="create-name">Your display name</Label>
                  <Input
                    id="create-name"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. Aarav"
                    maxLength={30}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="room-name">Room name (optional)</Label>
                  <Input
                    id="room-name"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g. JEE Mock Test"
                    maxLength={60}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={handleCreate} disabled={creating} className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radio className="mr-2 h-4 w-4" />}
                  Create room
                </Button>
              </CardFooter>
            </Card>

            {/* join */}
            <Card className="relative overflow-hidden shadow-sm">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                    <Hash className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-lg">Join a room</CardTitle>
                </div>
                <CardDescription>
                  Enter a room code shared by your study partner.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="join-code">Room code</Label>
                  <Input
                    id="join-code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))}
                    placeholder="A7K9P2"
                    className="font-mono text-lg tracking-[0.4em] uppercase"
                    inputMode="text"
                    autoComplete="off"
                    onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="join-name">Your display name</Label>
                  <Input
                    id="join-name"
                    value={joinName}
                    onChange={(e) => setJoinName(e.target.value)}
                    placeholder="e.g. Diya"
                    maxLength={30}
                    onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={handleJoin} disabled={joining} variant="default" className="w-full">
                  {joining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  Join room
                </Button>
              </CardFooter>
            </Card>
          </div>
        </section>

        {/* recent rooms */}
        <RecentRoomsSection />

        {/* features */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <Separator className="mb-10" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="group rounded-xl border bg-card p-5 transition-colors hover:bg-accent/40">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-medium">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Filename sanitized & path-traversal safe</span>
            <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> PDF-only uploads · max 25MB</span>
            <span className="inline-flex items-center gap-1.5"><Github className="h-3.5 w-3.5" /> Open architecture</span>
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t bg-background/80">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>Preply — real-time collaborative PDF study room.</p>
          <p>Built with Next.js · Socket.IO · Prisma · react-pdf</p>
        </div>
      </footer>
    </div>
  );
}

function RecentRoomsSection() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RecentRoom[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setRooms(loadRecentRooms());
    setMounted(true);
  }, []);

  function handleOpen(code: string) {
    router.push(`/room/${code}`);
  }

  function handleRemove(code: string, e: React.MouseEvent) {
    e.stopPropagation();
    removeRecentRoom(code);
    setRooms(loadRecentRooms());
  }

  if (!mounted || rooms.length === 0) return null;

  return (
    <section className="mx-auto max-w-4xl px-4 pb-2 sm:px-6">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Recent rooms</h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((r) => (
          <button
            key={r.code}
            onClick={() => handleOpen(r.code)}
            className="group relative flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all hover:border-emerald-500/40 hover:shadow-sm"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.name || "Untitled room"}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{r.code}</p>
            </div>
            <span
              onClick={(e) => handleRemove(r.code, e)}
              className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              title="Remove from recent"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
