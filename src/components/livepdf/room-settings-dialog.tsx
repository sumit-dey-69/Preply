"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoomSync } from "./room-sync-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Settings, Copy, Check, Trash2, LogOut, Calendar, Users, FileText, Hash, Lock, Unlock, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export function RoomSettingsDialog({
  open,
  onOpenChange,
  roomName,
  roomCreatedAt,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roomName?: string;
  roomCreatedAt?: string;
}) {
  const sync = useRoomSync();
  const router = useRouter();
  const { toast } = useToast();
  const { isHost } = sync;
  const [editName, setEditName] = useState(roomName ?? "");
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // fetch password status when dialog opens
  useEffect(() => {
    if (!open) return;
    fetch(`/api/rooms/${sync.roomCode}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.room) setHasPassword(!!data.room.hasPassword);
      })
      .catch(() => {});
  }, [open, sync.roomCode]);

  async function handleSetPassword() {
    const pw = password.trim();
    if (!pw) return;
    setSavingPassword(true);
    try {
      const res = await fetch(`/api/rooms/${sync.roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set password");
      setHasPassword(true);
      setPassword("");
      toast({ title: "Password set", description: "The room is now locked." });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleRemovePassword() {
    setSavingPassword(true);
    try {
      const res = await fetch(`/api/rooms/${sync.roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removePassword: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove password");
      setHasPassword(false);
      setPassword("");
      toast({ title: "Password removed", description: "The room is now open." });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleRename() {
    const name = editName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/rooms/${sync.roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rename failed");
      toast({ title: "Room renamed", description: data.room.name });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Rename failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(sync.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1500);
    } catch {}
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${sync.roomCode}`);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    } catch {}
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    try {
      const res = await fetch(`/api/rooms/${sync.roomCode}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast({ title: "Room deleted", description: "All data has been removed." });
      router.push("/");
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  }

  function handleLeave() {
    router.push("/");
  }

  const created = roomCreatedAt ? new Date(roomCreatedAt) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" /> Room Settings
          </DialogTitle>
          <DialogDescription>Manage room name, share link, and participants.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* room info */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Code</p>
                <p className="font-mono font-semibold">{sync.roomCode}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">People</p>
                <p className="font-semibold">{sync.participants.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">PDFs</p>
                <p className="font-semibold">{sync.pdfs.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Created</p>
                <p className="font-semibold">
                  {created ? created.toLocaleDateString([], { month: "short", day: "numeric" }) : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* share */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Share room</Label>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="h-8 flex-1 gap-1.5 text-xs" onClick={copyCode}>
                {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                Copy code
              </Button>
              <Button variant="outline" size="sm" className="h-8 flex-1 gap-1.5 text-xs" onClick={copyLink}>
                {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                Copy link
              </Button>
            </div>
            {/* QR code */}
            <div className="flex flex-col items-center gap-1.5 rounded-lg border bg-muted/30 p-3">
              <div className="rounded-lg bg-white p-2 shadow-sm">
                <QRCodeSVG
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/room/${sync.roomCode}`}
                  size={128}
                  level="M"
                  className="h-32 w-32"
                />
              </div>
              <p className="text-center text-[10px] text-muted-foreground">
                Scan to join on mobile
              </p>
            </div>
          </div>

          <Separator />

          {/* rename (host only) */}
          {isHost ? (
            <div className="space-y-2">
              <Label htmlFor="room-name-input" className="text-xs font-medium">
                Room name
              </Label>
              <div className="flex gap-1.5">
                <Input
                  id="room-name-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={60}
                  className="h-8 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleRename()}
                />
                <Button size="sm" className="h-8 shrink-0" onClick={handleRename} disabled={saving || !editName.trim()}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Only the host can rename or delete this room.
            </div>
          )}

          <Separator />

          {/* password lock (host only) */}
          {isHost ? (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs font-medium">
                <Lock className="h-3.5 w-3.5" /> Room password
                {hasPassword && (
                  <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[9px] font-medium text-emerald-600">
                    <ShieldCheck className="h-2.5 w-2.5" /> locked
                  </Badge>
                )}
              </Label>
              {hasPassword ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder="New password (leave blank to keep)"
                    maxLength={100}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 gap-1.5 text-xs"
                    onClick={handleRemovePassword}
                    disabled={savingPassword}
                    title="Remove password"
                  >
                    <Unlock className="h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder="Set a password to lock the room"
                    maxLength={100}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 text-xs"
                    onClick={handleSetPassword}
                    disabled={savingPassword || !password.trim()}
                  >
                    {savingPassword ? "…" : "Lock"}
                  </Button>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                {hasPassword
                  ? "Only people with the password can view this room."
                  : "Anyone with the room code can join. Set a password to restrict access."}
              </p>
            </div>
          ) : null}

          <Separator />

          {/* danger zone */}
          <div className="space-y-2">
            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={handleLeave}>
              <LogOut className="h-3.5 w-3.5" /> Leave room
            </Button>
            {isHost && (
              <Button
                variant={confirmDelete ? "destructive" : "outline"}
                size="sm"
                className="w-full gap-1.5 text-xs"
                onClick={handleDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {confirmDelete ? "Click again to confirm delete" : "Delete room"}
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
