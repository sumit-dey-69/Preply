"use client";

import { useRoomSync } from "./room-sync-provider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radio, Crown } from "lucide-react";

export function PresenterControls() {
  const sync = useRoomSync();
  const { isHost, presenterEnabled, presenterId, participants, me } = sync;

  if (!isHost) {
    // non-hosts just see the current state read-only
    if (!presenterEnabled) return null;
    const presenter = participants.find((p) => p.sessionId === presenterId);
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5">
        <Radio className="h-3.5 w-3.5 text-emerald-600" />
        <span className="text-xs">
          Presenter: <span className="font-semibold">{presenter?.displayName ?? "—"}</span>
        </span>
      </div>
    );
  }

  const presenter = participants.find((p) => p.sessionId === presenterId);

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="presenter-mode" className="flex items-center gap-1.5 text-xs font-medium">
          <Radio className="h-3.5 w-3.5 text-emerald-600" />
          Presenter mode
        </Label>
        <Switch
          id="presenter-mode"
          checked={presenterEnabled}
          onCheckedChange={(v) => sync.togglePresenterMode(v)}
        />
      </div>
      {presenterEnabled && (
        <div className="flex items-center gap-2">
          <Crown className="h-3.5 w-3.5 text-amber-500" />
          <Select
            value={presenterId ?? undefined}
            onValueChange={(v) => sync.setPresenter(v === "__shared__" ? null : v)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Assign presenter" />
            </SelectTrigger>
            <SelectContent>
              {participants.map((p) => (
                <SelectItem key={p.sessionId} value={p.sessionId} className="text-xs">
                  {p.displayName}
                  {p.sessionId === me?.sessionId ? " (you)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <p className="text-[10px] leading-tight text-muted-foreground">
        {presenterEnabled
          ? `Only ${presenter?.displayName ?? "the presenter"} can drive the PDF viewer.`
          : "Shared mode — everyone can control the viewer."}
      </p>
    </div>
  );
}
