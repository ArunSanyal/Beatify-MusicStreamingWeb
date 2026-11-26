"use client";

import { useRef, useState, type FormEvent } from "react";
import toast from "react-hot-toast";

import { uploadSong } from "@/lib/api-client";
import { MAX_TITLE_LENGTH, validateFile, validateTitle } from "@/lib/validation";

export default function UploadPage() {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isUploading) return;

    const titleCheck = validateTitle(title);
    if (!titleCheck.ok) {
      toast.error(titleCheck.error);
      return;
    }
    const fileCheck = validateFile(file);
    if (!fileCheck.ok || !file) {
      toast.error(fileCheck.ok ? "Please choose an MP3 file." : fileCheck.error);
      return;
    }

    setIsUploading(true);
    try {
      await uploadSong(titleCheck.value, file);
      toast.success("Successfully uploaded music");
      setTitle("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="mt-[100px] flex flex-col justify-center items-center">
      <div>
        <h1 className="font-semibold text-[30px] mb-10">Please select a Music to upload</h1>
        <form onSubmit={handleSubmit} className="space-y-4 flex gap-4 flex-col">
          <div>
            <label htmlFor="title" className="block text-gray-700">
              Title:
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              name="title"
              required
              maxLength={MAX_TITLE_LENGTH}
              disabled={isUploading}
              className="p-2 block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="file" className="block text-gray-700">
              File (MP3, max 15 MB):
            </label>
            <input
              id="file"
              ref={fileInputRef}
              type="file"
              accept=".mp3,audio/mpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              name="file"
              required
              disabled={isUploading}
              className="block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={isUploading}
            aria-busy={isUploading}
            className="inline-block bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 focus:outline-none focus:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isUploading ? "Uploading…" : "Upload"}
          </button>
        </form>
      </div>
    </div>
  );
}
