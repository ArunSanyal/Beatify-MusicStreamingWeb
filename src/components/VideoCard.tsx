import type { Song } from "@/lib/types";

type VideoCardProps = {
  song: Song;
};

/** One row in the song list. */
const VideoCard = ({ song }: VideoCardProps) => {
  return (
    <div className="flex items-center gap-4">
      <PlayIcon className="w-6 h-6 text-gray-500 dark:text-gray-400" aria-hidden="true" />
      <div className="grid gap-1 leading-none min-w-0">
        <div className="font-medium truncate">{song.title}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {song.uploadedBy}
        </div>
      </div>
    </div>
  );
};

function PlayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

export default VideoCard;
