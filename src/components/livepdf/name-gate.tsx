"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, ArrowRight } from "lucide-react";

export function NameGate({
  roomCode,
  roomName,
  onSubmit,
}: {
  roomCode: string;
  roomName?: string;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <FileText className="h-6 w-6" />
          </div>
          <CardTitle>Joining room {roomCode}</CardTitle>
          <CardDescription>
            {roomName ? roomName : "Enter a display name to continue."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="gate-name">Your display name</Label>
            <Input
              id="gate-name"
              autoFocus
              value={name}
              maxLength={30}
              placeholder="e.g. Aarav"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && onSubmit(name.trim())}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={!name.trim()}
            onClick={() => onSubmit(name.trim())}
          >
            Enter room <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
