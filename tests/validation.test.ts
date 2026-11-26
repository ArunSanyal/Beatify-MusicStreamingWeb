import { describe, expect, it } from "vitest";

import {
  MAX_FILE_SIZE_BYTES,
  buildS3Key,
  isValidS3Key,
  slugify,
  validateFile,
  validateSaveSongRequest,
  validateTitle,
  validateUploadRequest,
} from "@/lib/validation";

const ID = "123e4567-e89b-42d3-a456-426614174000";

describe("validateTitle", () => {
  it("trims and accepts a normal title", () => {
    expect(validateTitle("  My Song  ")).toEqual({ ok: true, value: "My Song" });
  });

  it.each([undefined, null, 42, "", "   "])("rejects %j", (input) => {
    expect(validateTitle(input).ok).toBe(false);
  });

  it("accepts exactly 100 characters and rejects 101", () => {
    expect(validateTitle("a".repeat(100)).ok).toBe(true);
    expect(validateTitle("a".repeat(101)).ok).toBe(false);
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
  });

  it("strips accents", () => {
    expect(slugify("Café Déjà Vu")).toBe("cafe-deja-vu");
  });

  it("removes path traversal and S3-unsafe characters", () => {
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
    expect(slugify("a/b\\c?d#e%f")).toBe("a-b-c-d-e-f");
  });

  it("falls back to 'song' when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("song");
    expect(slugify("日本語")).toBe("song");
  });

  it("caps length at 60 without a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("buildS3Key / isValidS3Key", () => {
  it("builds a key under songs/ that passes validation", () => {
    const key = buildS3Key(ID, "My Song");
    expect(key).toBe(`songs/${ID}-my-song.mp3`);
    expect(isValidS3Key(key)).toBe(true);
  });

  it.each([
    "songs/../secret.mp3",
    `other/${ID}-x.mp3`,
    `songs/${ID}-x.wav`,
    `songs/not-a-uuid-x.mp3`,
    `songs/${ID}-X.mp3`,
    42,
  ])("rejects %j", (key) => {
    expect(isValidS3Key(key)).toBe(false);
  });
});

describe("validateUploadRequest", () => {
  const valid = { title: "Song", contentType: "audio/mpeg", size: 1024 };

  it("accepts a valid request and trims the title", () => {
    expect(validateUploadRequest({ ...valid, title: " Song " })).toEqual({
      ok: true,
      value: { title: "Song", contentType: "audio/mpeg", size: 1024 },
    });
  });

  it.each([undefined, null, "text", [], 5])("rejects non-object body %j", (body) => {
    expect(validateUploadRequest(body).ok).toBe(false);
  });

  it("rejects a missing title", () => {
    expect(validateUploadRequest({ ...valid, title: "" }).ok).toBe(false);
  });

  it.each(["audio/wav", "audio/mp3", "video/mp4", undefined])(
    "rejects content type %j",
    (contentType) => {
      expect(validateUploadRequest({ ...valid, contentType }).ok).toBe(false);
    },
  );

  it.each([0, -1, 1.5, "1024", undefined])("rejects size %j", (size) => {
    expect(validateUploadRequest({ ...valid, size }).ok).toBe(false);
  });

  it("accepts exactly 15 MB and rejects one byte more", () => {
    expect(validateUploadRequest({ ...valid, size: MAX_FILE_SIZE_BYTES }).ok).toBe(true);
    expect(validateUploadRequest({ ...valid, size: MAX_FILE_SIZE_BYTES + 1 }).ok).toBe(false);
  });
});

describe("validateSaveSongRequest", () => {
  it("accepts a title and a valid key", () => {
    const key = buildS3Key(ID, "x");
    expect(validateSaveSongRequest({ title: "x", key })).toEqual({
      ok: true,
      value: { title: "x", key },
    });
  });

  it("rejects an arbitrary key", () => {
    expect(validateSaveSongRequest({ title: "x", key: "anything.mp3" }).ok).toBe(false);
  });
});

describe("validateFile", () => {
  it("accepts an MP3 under the limit", () => {
    expect(validateFile({ type: "audio/mpeg", size: 10 }).ok).toBe(true);
  });

  it("rejects missing, wrong type, empty and oversized files", () => {
    expect(validateFile(null).ok).toBe(false);
    expect(validateFile({ type: "audio/wav", size: 10 }).ok).toBe(false);
    expect(validateFile({ type: "audio/mpeg", size: 0 }).ok).toBe(false);
    expect(validateFile({ type: "audio/mpeg", size: MAX_FILE_SIZE_BYTES + 1 }).ok).toBe(false);
  });
});
