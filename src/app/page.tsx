"use client"
import MusicPlayer from "@/components/MusicPlayer";
import VideoCard from "@/components/VideoCard";
import { GetBlogs } from "@/utils/dynamoDB";
import axios from "axios";
import { useEffect, useState } from "react";

export default function Home() {
  const [videoList,setVideoList] = useState([])
  const [selectedMusic,setSelectedMusic] = useState()
  useEffect(()=>{
    const getVideos=async()=>{
      try {
        // const response = await axios.get('https://4h9z57rxib.execute-api.us-east-1.amazonaws.com/Arun/musics')
        const response = await GetBlogs()
        setVideoList(response)
      } catch (error) {
        
      } 
    }
    getVideos();
  },[])

  console.log(videoList)

  return (
    <div className="max-h-screen flex">
      <div className="w-1/4 border-r border-gray-200 overflow-y-auto">
        <div className="px-4 py-2 flex flex-col gap-8">

          { videoList && videoList.map((item) => (
            <div className="hover:bg-gray-100 cursor-pointer p-4 rounded-md"  onClick={() => setSelectedMusic(item)}>
              <VideoCard video={item} />
            </div>
          ))}
        </div>
      </div>
      <div className="p-10 mx-auto">
        <MusicPlayer music={selectedMusic} />
      </div>
    </div>

  );
}
