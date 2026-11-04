"use client";

import * as React from "react";
import { RefreshCw, Trash2, Download, History, Play, Pause } from "lucide-react";
import { getApiUrl } from "@/lib/api";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";

interface HistoryItem {
  filename: string;
  url: string;
  created_at: string;
  size_kb: number;
}

export function HistoryTab() {
  const [history, setHistory] = React.useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [playingFile, setPlayingFile] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const fetchHistory = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(getApiUrl("/api/history"));
      const data = await res.json();
      const rawList = data.items || data.files || [];
      const loadedItems: HistoryItem[] = rawList.map((item: any) => ({
        filename: item.filename,
        url: getApiUrl(item.url || item.audio_url),
        created_at: item.created_at,
        size_kb: item.size_kb,
      }));
      setHistory(loadedItems);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await fetch(getApiUrl(`/api/history/${filename}`), { method: "DELETE" });
      await fetchHistory();
    } catch (err) {
      alert("Delete failed: " + err);
    }
  };

  const togglePlay = (url: string) => {
    if (playingFile === url) {
      audioRef.current?.pause();
      setPlayingFile(null);
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      audioRef.current.src = url;
      audioRef.current.play();
      audioRef.current.onended = () => setPlayingFile(null);
      setPlayingFile(url);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            <span>🗂️ ប្រវត្តិសំឡេងដែលបានបង្កើត (Generated Khmer Audio Library)</span>
          </CardTitle>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={fetchHistory}
            isLoading={isLoading}
            className="text-xs gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
        <CardDescription>
          Browse, listen to, download, or clean up all audio files previously generated in your studio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-10 text-xs text-slate-500">Loading audio library...</div>
        ) : history.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            No audio files generated yet. Head over to the Voice Cloning &amp; Speech Studio tab to synthesize speech!
          </div>
        ) : (
          <div className="space-y-2.5">
            {history.map((item) => (
              <div
                key={item.filename}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-800/80 bg-[#080d19] text-xs hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => togglePlay(item.url)}
                    className="w-8 h-8 rounded-full bg-slate-800 text-slate-200 hover:text-white flex-shrink-0"
                  >
                    {playingFile === item.url ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5 ml-0.5" />
                    )}
                  </Button>

                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-200 truncate font-mono text-[12px]">
                      {item.filename}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>{item.created_at}</span>
                      <span>·</span>
                      <span className="font-mono">{item.size_kb} KB</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <a
                    href={item.url}
                    download={item.filename}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                    title="Download WAV"
                  >
                    <Download className="w-4 h-4" />
                  </a>

                  <button
                    type="button"
                    onClick={() => handleDelete(item.filename)}
                    className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800/80 transition-colors cursor-pointer"
                    title="Delete file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

