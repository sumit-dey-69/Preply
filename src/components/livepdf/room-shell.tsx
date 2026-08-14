"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoomHeader } from "./room-header";
import { PdfList } from "./pdf-list";
import { TimerPanel } from "./timer-panel";
import { ParticipantPanel } from "./participant-panel";
import { PresenterControls } from "./presenter-controls";
import { ConnectionIndicator } from "./connection-indicator";
import { ChatPanel } from "./chat-panel";
import { MarkersPanel } from "./markers-panel";
import { NotesPanel } from "./notes-panel";
import { ActivityFeed } from "./activity-feed";
import { useRoomSync, useElapsedMs } from "./room-sync-provider";
import { useChatNotifications } from "./use-chat-notifications";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  FileText,
  Timer as TimerIcon,
  Users,
  Radio,
  MessageSquare,
  Bookmark,
  StickyNote,
  Activity,
  PanelRightOpen,
  UserX,
} from "lucide-react";
import { formatTimer } from "@/lib/types";

// react-pdf must not be SSR'd.
const PdfViewer = dynamic(() => import("./pdf-viewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading viewer…
    </div>
  ),
});

function CompactTimerStrip({ onClick }: { onClick: () => void }) {
  const sync = useRoomSync();
  const elapsedMs = useElapsedMs();
  const { timer } = sync;
  const mode = timer.mode;
  const displayMs = mode === "countdown" && timer.duration != null
    ? Math.max(0, timer.duration - elapsedMs)
    : elapsedMs;
  const finished = mode === "countdown" && timer.status === "finished";
  const running = timer.status === "running";

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 border-b bg-gradient-to-r from-card to-muted/30 px-3 py-2 text-left transition-colors hover:bg-accent/40"
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          {running && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              running && "bg-emerald-500",
              timer.status === "paused" && "bg-amber-500",
              timer.status === "idle" && "bg-muted-foreground/40",
              finished && "bg-destructive"
            )}
          />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {mode}
        </span>
      </div>
      <span
        className={cn(
          "font-mono text-base font-bold tabular-nums tracking-tight",
          finished && "text-destructive"
        )}
      >
        {formatTimer(displayMs, mode)}
      </span>
    </button>
  );
}

function RightTabs({
  value,
  onChange,
  unreadChat,
  markerCount,
  participantCount,
}: {
  value: string;
  onChange: (v: string) => void;
  unreadChat: number;
  markerCount: number;
  participantCount: number;
}) {
  return (
    <Tabs value={value} onValueChange={onChange} className="flex min-h-0 flex-1 flex-col">
      <TabsList className="grid h-9 w-full grid-cols-6 gap-0.5 rounded-none border-b bg-muted/30 p-1">
        <TabsTrigger value="timer" className="gap-0.5 text-[10px] data-[state=active]:bg-background">
          <TimerIcon className="h-3.5 w-3.5" /> Timer
        </TabsTrigger>
        <TabsTrigger value="chat" className="gap-0.5 text-[10px] data-[state=active]:bg-background">
          <MessageSquare className="h-3.5 w-3.5" /> Chat
          {unreadChat > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
              {unreadChat > 99 ? "99+" : unreadChat}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="markers" className="gap-0.5 text-[10px] data-[state=active]:bg-background">
          <Bookmark className="h-3.5 w-3.5" /> Marks
          {markerCount > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted-foreground/20 px-1 text-[9px] font-bold">
              {markerCount > 99 ? "99+" : markerCount}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="notes" className="gap-0.5 text-[10px] data-[state=active]:bg-background">
          <StickyNote className="h-3.5 w-3.5" /> Notes
        </TabsTrigger>
        <TabsTrigger value="people" className="gap-0.5 text-[10px] data-[state=active]:bg-background">
          <Users className="h-3.5 w-3.5" /> People
          {participantCount > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted-foreground/20 px-1 text-[9px] font-bold">
              {participantCount}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="activity" className="gap-0.5 text-[10px] data-[state=active]:bg-background">
          <Activity className="h-3.5 w-3.5" /> Feed
        </TabsTrigger>
      </TabsList>
      <TabsContent value="timer" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
        <TimerPanel />
      </TabsContent>
      <TabsContent value="chat" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
        <ChatPanel />
      </TabsContent>
      <TabsContent value="markers" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
        <MarkersPanel />
      </TabsContent>
      <TabsContent value="notes" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
        <NotesPanel />
      </TabsContent>
      <TabsContent value="people" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
        <ParticipantPanel />
      </TabsContent>
      <TabsContent value="activity" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
        <ActivityFeed />
      </TabsContent>
    </Tabs>
  );
}

export function RoomShell({ room }: { room: { id: string; code: string; name: string; createdAt: string } | null }) {
  const sync = useRoomSync();
  const { viewer, presenterEnabled, presenterId, participants, chat, kicked } = sync;
  useChatNotifications();
  const [mobileTab, setMobileTab] = useState("viewer");
  const [rightTab, setRightTab] = useState("timer");
  const [mobileRightTab, setMobileRightTab] = useState("timer");

  // unread chat tracking
  const lastReadChatLenRef = useRef(chat.length);
  const [unreadChat, setUnreadChat] = useState(0);
  useEffect(() => {
    if (rightTab === "chat" || mobileRightTab === "chat") {
      lastReadChatLenRef.current = chat.length;
      setUnreadChat(0);
    } else if (chat.length > lastReadChatLenRef.current) {
      setUnreadChat((c) => c + (chat.length - lastReadChatLenRef.current));
      lastReadChatLenRef.current = chat.length;
    }
  }, [chat.length, rightTab, mobileRightTab]);

  const presenterName = participants.find((p) => p.sessionId === presenterId)?.displayName;
  const markerCount = sync.markers.length;

  return (
    <div className="flex h-screen flex-col bg-background">
      {kicked && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/95 px-4 text-center backdrop-blur">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600">
            <UserX className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">You were removed</h1>
            <p className="mt-1 text-sm text-muted-foreground">The host removed you from this room.</p>
          </div>
          <a href="/" className="text-sm font-medium text-emerald-600 hover:underline">Back to home</a>
        </div>
      )}
      <RoomHeader roomName={room?.name} roomCreatedAt={room?.createdAt} />

      {/* Desktop layout: resizable 3 columns */}
      <div className="hidden min-h-0 flex-1 md:block">
        <ResizablePanelGroup direction="horizontal" autoSaveId="livepdf-layout">
          {/* left: PDF list */}
          <ResizablePanel defaultSize={18} minSize={14} maxSize={28} className="rounded-none">
            <aside className="flex h-full flex-col border-r bg-card">
              <PdfList />
            </aside>
          </ResizablePanel>
          <ResizableHandle withHandle />
          {/* center: viewer */}
          <ResizablePanel defaultSize={55} minSize={35}>
            <main className="h-full p-2.5">
              <PdfViewer />
            </main>
          </ResizablePanel>
          <ResizableHandle withHandle />
          {/* right: tabbed panels + presenter */}
          <ResizablePanel defaultSize={27} minSize={20} maxSize={36} className="rounded-none">
            <aside className="flex h-full flex-col border-l bg-card">
              <CompactTimerStrip onClick={() => setRightTab("timer")} />
              <div className="min-h-0 flex-1">
                <RightTabs
                  value={rightTab}
                  onChange={setRightTab}
                  unreadChat={unreadChat}
                  markerCount={markerCount}
                  participantCount={participants.length}
                />
              </div>
              <div className="max-h-[40%] shrink-0 overflow-auto border-t p-2.5">
                <PresenterControls />
              </div>
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile layout: tabs */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <Tabs value={mobileTab} onValueChange={setMobileTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full grid-cols-3 rounded-none border-b">
            <TabsTrigger value="files" className="gap-1 text-xs">
              <FileText className="h-3.5 w-3.5" /> Files
            </TabsTrigger>
            <TabsTrigger value="viewer" className="gap-1 text-xs">
              <Radio className="h-3.5 w-3.5" /> Viewer
            </TabsTrigger>
            <TabsTrigger value="more" className="gap-1 text-xs">
              <PanelRightOpen className="h-3.5 w-3.5" /> Panel
            </TabsTrigger>
          </TabsList>
          <TabsContent value="files" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
            <div className="h-full bg-card">
              <PdfList />
            </div>
          </TabsContent>
          <TabsContent value="viewer" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
            <div className="h-full p-2">
              <PdfViewer />
            </div>
          </TabsContent>
          <TabsContent value="more" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
            <div className="flex h-full flex-col bg-card">
              <CompactTimerStrip onClick={() => setMobileRightTab("timer")} />
              <div className="min-h-0 flex-1">
                <RightTabs
                  value={mobileRightTab}
                  onChange={setMobileRightTab}
                  unreadChat={unreadChat}
                  markerCount={markerCount}
                  participantCount={participants.length}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Sticky status bar */}
      <footer className="z-20 flex h-9 shrink-0 items-center justify-between gap-3 border-t bg-background/90 px-3 text-xs backdrop-blur sm:px-4">
        <ConnectionIndicator />
        <div className="flex items-center gap-3 text-muted-foreground">
          {viewer.pdfId && (viewer.totalPages || viewer.currentPage) > 0 && (
            <span>
              Page <span className="font-medium text-foreground">{viewer.currentPage || 1}</span> / {viewer.totalPages || "—"}
            </span>
          )}
          <span className="hidden sm:inline">
            Zoom <span className="font-medium text-foreground">{viewer.zoom === 1 ? "Fit" : Math.round((viewer.zoom || 1) * 100) + "%"}</span>
          </span>
          {presenterEnabled && (
            <span className="hidden items-center gap-1 sm:inline-flex">
              <Radio className="h-3 w-3 text-emerald-600" />
              Presenter: <span className="font-medium text-foreground">{presenterName ?? "—"}</span>
            </span>
          )}
          <Users className="h-3.5 w-3.5 sm:hidden" />
        </div>
      </footer>
    </div>
  );
}
