import Image from "next/image";
import AudioPlayer from "react-h5-audio-player";
import "react-h5-audio-player/lib/styles.css";

import type { Song } from "@/lib/types";

const COVER_IMAGE =
  "https://images.unsplash.com/photo-1458560871784-56d23406c091?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";

const MusicPlayer = ({ song }: { song: Song | null }) => {
  return (
    <div className="w-[800px] flex flex-col gap-10">
      <Image
        className="w-[400px] h-[400px] mx-auto rounded-md object-cover"
        src={COVER_IMAGE}
        alt="Concert stage lights used as album cover art"
        width={400}
        height={400}
        priority
      />
      <div aria-live="polite">
        {song ? (
          <>
            <div className="font-semibold">{song.title}</div>
            <div className="text-sm text-gray-500">{song.uploadedBy}</div>
          </>
        ) : (
          <div className="text-gray-500">Select a song to start playing.</div>
        )}
      </div>
      <AudioPlayer src={song?.url} />
    </div>
  );
};

export default MusicPlayer;
