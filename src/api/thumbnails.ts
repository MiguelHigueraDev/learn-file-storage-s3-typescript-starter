import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

const videoThumbnails: Map<string, Thumbnail> = new Map();

export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  const thumbnail = videoThumbnails.get(videoId);
  if (!thumbnail) {
    throw new NotFoundError("Thumbnail not found");
  }

  return new Response(thumbnail.data, {
    headers: {
      "Content-Type": thumbnail.mediaType,
      "Cache-Control": "no-store",
    },
  });
}

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = await req.formData();
  const file = formData.get("thumbnail");

  if (!file || !(file instanceof File)) {
    throw new BadRequestError("No file provided");
  }

  // 10MB
  const maxFileSize = 10 << 20;

  if (file.size > maxFileSize) {
    throw new BadRequestError("File too large");
  }

  const buffer = await file.arrayBuffer();
  const videoMetadata = getVideo(cfg.db, videoId);

  if (!videoMetadata || userID !== videoMetadata.userID) {
    throw new UserForbiddenError("User does not own video");
  }

  const thumbnail = {
    data: buffer,
    mediaType: file.type,
  };

  videoThumbnails.set(videoId, thumbnail);

  const thumbnailURL = `http://localhost:8091/api/thumbnails/${videoId}`;

  updateVideo(cfg.db, {
    ...videoMetadata,
    thumbnailURL,
  });

  const updatedVideo = getVideo(cfg.db, videoId);

  return respondWithJSON(200, updatedVideo);
}
