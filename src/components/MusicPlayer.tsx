import React from 'react'
import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
const MusicPlayer = ({music}:{music:any}) => {
    console.log(music)
  return (
    <div className='w-[800px] flex flex-col gap-10'>
        <img className='w-[400px] h-[400px] mx-auto rounded-md'src="https://images.unsplash.com/photo-1458560871784-56d23406c091?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"/>
        <div>{music?.title.S}</div>
        <AudioPlayer  src={music?.url.S}/>
    </div>
  )
}

export default MusicPlayer