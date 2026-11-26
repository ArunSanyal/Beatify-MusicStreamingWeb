import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact | Beatify",
};

export default function ContactPage() {
  return (
    <div className="mt-[100px] flex flex-col items-center gap-4 px-4 text-center">
      <h1 className="font-semibold text-[30px]">Contact</h1>
      <p className="text-gray-700 max-w-md">
        Beatify is a portfolio project. Questions, feedback or bug reports are welcome on
        GitHub.
      </p>
      <a
        href="https://github.com/ArunSanyal"
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
      >
        GitHub profile
      </a>
    </div>
  );
}
