"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRoomSync } from "./room-sync-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { FileText, Copy, Check, Users, LogOut, Link2, Settings, Keyboard } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { RoomSettingsDialog } from "./room-settings-dialog";
import { ShortcutsDialog } from "./shortcuts-dialog";

export function RoomHeader({
  roomName,
  roomCreatedAt,
}: {
  roomName?: string;
  roomCreatedAt?: string;
}) {
  const sync = useRoomSync();
  const router = useRouter();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(sync.roomCode);
      setCopied(true);
      toast({ title: "Room code copied", description: sync.roomCode });
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  async function copyInvite() {
    const url = `${window.location.origin}/room/${sync.roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      toast({ title: "Invite link copied", description: "Share it with your study partner." });
      setTimeout(() => setCopiedLink(false), 1500);
    } catch {}
  }

  function leave() {
    router.push("/");
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background/90 px-3 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">{roomName || "Preply"}</p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={copyCode}
                className="group inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                title="Copy room code"
              >
                {sync.roomCode}
                {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="hidden gap-1.5 px-2 py-1 sm:flex">
            <Users className="h-3 w-3" />
            {sync.participants.length}
          </Badge>
          {sync.me && (
            <div className="hidden items-center gap-1.5 rounded-full border bg-muted/40 py-0.5 pl-0.5 pr-2 md:flex">
              <Avatar className="h-6 w-6 border">
                <AvatarFallback className="bg-gradient-to-br from-emerald-500/20 to-amber-500/20 text-[10px] font-semibold">
                  {sync.me.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium">{sync.me.displayName}</span>
            </div>
          )}
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={copyInvite}>
            {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Invite</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSettingsOpen(true)}
            title="Room settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="h-4 w-4" />
          </Button>
          <ThemeToggle className="h-8 w-8" />
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={leave}>
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </Button>
        </div>
      </header>

      <RoomSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        roomName={roomName}
        roomCreatedAt={roomCreatedAt}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}
