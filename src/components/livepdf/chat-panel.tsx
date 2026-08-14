"use client";

import { useEffect, useRef, useState } from "react";
import { useRoomSync } from "./room-sync-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Send, MessageSquare, Users } from "lucide-react";

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatPanel() {
  const sync = useRoomSync();
  const { chat, me, sendChat, typingUsers, setTyping } = sync;
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // auto-scroll to bottom on new message
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  function handleSend() {
    const t = text.trim();
    if (!t) return;
    sendChat(t);
    setText("");
    setTyping(false);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Chat</h3>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {chat.length}
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="livepdf-scroll flex-1 space-y-3 overflow-y-auto p-3">
        {chat.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-3 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <MessageSquare className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs text-muted-foreground">
              Discuss the question, share hints, or coordinate who solves what.
            </p>
          </div>
        ) : (
          chat.map((msg) => {
            const isMe = msg.authorId === me?.sessionId;
            return (
              <div key={msg.id} className={cn("flex gap-2", isMe && "flex-row-reverse")}>
                <Avatar className="mt-0.5 h-7 w-7 shrink-0 border">
                  <AvatarFallback
                    className={cn(
                      "text-[10px] font-semibold",
                      isMe
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    )}
                  >
                    {initials(msg.authorName)}
                  </AvatarFallback>
                </Avatar>
                <div className={cn("flex max-w-[80%] flex-col", isMe && "items-end")}>
                  <div className="flex items-baseline gap-1.5">
                    <span className={cn("text-xs font-medium", isMe && "text-emerald-700 dark:text-emerald-400")}>
                      {isMe ? "You" : msg.authorName}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 rounded-2xl px-3 py-1.5 text-sm break-words",
                      isMe
                        ? "rounded-tr-sm bg-emerald-600 text-white"
                        : "rounded-tl-sm bg-muted text-foreground"
                    )}
                  >
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* typing indicator */}
      {typingUsers.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 pb-1 text-[11px] text-muted-foreground">
          <span className="flex gap-0.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
          </span>
          <span>
            {typingUsers.length === 1
              ? `${typingUsers[0].displayName} is typing…`
              : `${typingUsers.length} people are typing…`}
          </span>
        </div>
      )}

      <div className="border-t p-2">
        <div className="flex items-center gap-1.5">
          <Input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setTyping(e.target.value.trim().length > 0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message…"
            maxLength={1000}
            className="h-8 text-sm"
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={handleSend}
            disabled={!text.trim()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
