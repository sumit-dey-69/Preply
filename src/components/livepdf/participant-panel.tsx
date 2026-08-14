"use client";

import { useRoomSync } from "./room-sync-provider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Crown, Radio, Users, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// deterministic avatar color from name
const AVATAR_COLORS = [
  "from-emerald-500/20 to-teal-500/20 text-emerald-700 dark:text-emerald-400",
  "from-amber-500/20 to-orange-500/20 text-amber-700 dark:text-amber-400",
  "from-rose-500/20 to-pink-500/20 text-rose-700 dark:text-rose-400",
  "from-violet-500/20 to-purple-500/20 text-violet-700 dark:text-violet-400",
  "from-sky-500/20 to-blue-500/20 text-sky-700 dark:text-sky-400",
];

function colorForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function ParticipantPanel() {
  const sync = useRoomSync();
  const { participants, me, presenterEnabled, isHost, kickParticipant } = sync;
  const { toast } = useToast();

  const sorted = [...participants].sort((a, b) => {
    if (a.isHost && !b.isHost) return -1;
    if (!a.isHost && b.isHost) return 1;
    return a.joinedAt - b.joinedAt;
  });

  function initials(name: string) {
    return name.slice(0, 2).toUpperCase();
  }

  function handleKick(sessionId: string, name: string) {
    if (!confirm(`Remove ${name} from the room?`)) return;
    kickParticipant(sessionId);
    toast({ title: `${name} was removed` });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Participants</h3>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {participants.length}
          </span>
        </div>
        {presenterEnabled && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
            <Radio className="h-2.5 w-2.5" /> presenter on
          </span>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          <ul className="space-y-1">
            {sorted.map((p) => {
              const isMe = p.sessionId === me?.sessionId;
              const canKick = isHost && !isMe && !p.isHost;
              return (
                <li
                  key={p.id}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-2 py-1.5",
                    isMe ? "bg-accent/60" : "hover:bg-accent/40"
                  )}
                >
                  <div className="relative">
                    <Avatar className="h-8 w-8 border">
                      <AvatarFallback className={cn("bg-gradient-to-br text-[11px] font-semibold", colorForName(p.displayName))}>
                        {initials(p.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-sm font-medium">
                      {p.displayName}
                      {isMe && <span className="text-[10px] text-muted-foreground">(you)</span>}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {p.isHost ? "host" : "member"}
                      {presenterEnabled && p.isPresenter ? " · presenter" : ""}
                    </p>
                  </div>
                  {p.isHost && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                  {presenterEnabled && p.isPresenter && !p.isHost && (
                    <Radio className="h-3.5 w-3.5 text-emerald-600" />
                  )}
                  {canKick && (
                    <button
                      onClick={() => handleKick(p.sessionId, p.displayName)}
                      className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      title={`Remove ${p.displayName}`}
                    >
                      <UserX className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
            {participants.length === 0 && (
              <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                No participants yet.
              </li>
            )}
          </ul>
        </div>
      </ScrollArea>
    </div>
  );
}
