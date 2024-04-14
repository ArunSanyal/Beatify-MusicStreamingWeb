import React from 'react';

// Define a type for the video data
type VideoData = {
  title: string;
  thumbnailUrl: string;
  channelName: string;
  viewCount: string;
  createdAt: string;
};

// Example video data for illustration. In a real app, this would likely come from props or an API.
const videoData: VideoData = {
  title: "Sample Video Title",
  thumbnailUrl: "https://via.placeholder.com/210x118",
  channelName: "Channel Name",
  viewCount: "1.2M views",
  createdAt: "2 weeks ago",
};

// Define props for the VideoCard component. Here, we're making the video prop optional and providing a default value.
type VideoCardProps = {
  video?: VideoData;
};

const VideoCard: React.FC<VideoCardProps> = ({ video = videoData }) => {
  return (
    <div className="flex items-center gap-4">
                <PlayIcon className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                <div className="grid gap-1 leading-none">
                  <div className="font-medium">{video.title.S}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Daft Punk</div>
                </div>
                <div className="ml-auto text-xs">5:20</div>
              </div>
  );
};

function PlayIcon(props:any) {
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
  )
}

export default VideoCard;
