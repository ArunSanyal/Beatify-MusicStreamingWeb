"use client";

import { useEffect, useState } from "react";

import MusicPlayer from "@/components/MusicPlayer";
import VideoCard from "@/components/VideoCard";
import { fetchSongs } from "@/lib/api-client";
import type { Song } from "@/lib/types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; songs: Song[] };

export default function Home() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSongs()
      .then((songs) => {
        if (!cancelled) setState({ status: "ready", songs });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Could not load songs.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-h-screen flex">
      <section
        aria-label="Song list"
        className="w-1/4 border-r border-gray-200 overflow-y-auto"
      >
        <div className="px-4 py-2 flex flex-col gap-8">
          {state.status === "loading" && (
            <p className="p-4 text-gray-500" role="status">
              Loading songs…
            </p>
          )}

          {state.status === "error" && (
            <p className="p-4 text-red-600" role="alert">
              {state.message}
            </p>
          )}

          {state.status === "ready" && state.songs.length === 0 && (
            <p className="p-4 text-gray-500">No songs yet. Upload one to get started.</p>
          )}

          {state.status === "ready" && state.songs.length > 0 && (
            <ul className="flex flex-col gap-8">
              {state.songs.map((song) => (
                <li key={song.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedSong(song)}
                    aria-pressed={selectedSong?.id === song.id}
                    className="w-full text-left hover:bg-gray-100 cursor-pointer p-4 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 aria-pressed:bg-gray-100"
                  >
                    <VideoCard song={song} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <div className="p-10 mx-auto">
        <MusicPlayer song={selectedSong} />
      </div>
    </div>
  );
}
