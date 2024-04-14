"use client"
import React, { useState } from "react";
import axios from "axios";
import { ChangeEvent } from "react";
import { createVideoEntry } from "@/utils/dynamoDB";
import toast from "react-hot-toast";

async function uploadToS3({title,file}) {
  // const formData = new FormData(e.target);

  // const file = formData.get("file");

  if (!file) {
    return null;
  }

  // @ts-ignore
  // const fileType = encodeURIComponent(file.type);

  const { data } = await axios.get(`/api/upload/${title}`);

  const { uploadUrl, key } = data;

  await axios.put(uploadUrl, file);
  try{
    const dynamoResponse =await  createVideoEntry({title,author:"Arun",url:`https://d1adguy2szy7zv.cloudfront.net/${key}`})
    console.log(dynamoResponse);

  }
  catch(e){
    console.log(e)
  }

  // return key;
}

const page = () => {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  async function handleSubmit(e: ChangeEvent<HTMLFormElement>) {
    e.preventDefault();

    const key = await uploadToS3({title,file});
    toast.success("Successfully uploaded music")
    
  }
  return (
    <div className=" mt-[100px] flex flex-col justify-center items-center">
      <div>

    <p className="text-lg font-semibold mb-4 text-[30px] mb-10">Please select a Music to upload</p>
    <form onSubmit={handleSubmit} className="space-y-4 flex gap-4 flex-col">
      <div>
        <label className="block">
          <span className="text-gray-700">Title:</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            name="title"
            required
            className="p-2 block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </label>
      </div>
      <div>
        <label className="block">
          <span className="text-gray-700">File:</span>
          <input
            type="file"
            accept="audio/mp3"
            onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
            name="file"
            required
            className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </label>
      </div>
      <button
        type="submit"
        className="inline-block bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 focus:outline-none focus:bg-blue-600"
      >
        Upload
      </button>
    </form>
      </div>
  </div>
  
  );
};

export default page;
