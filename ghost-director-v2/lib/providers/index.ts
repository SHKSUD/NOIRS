import { anthropicLLM } from './anthropic-llm';
import { mockLLM } from './mock-llm';
import { geminiImage } from './gemini-image';
import { mockImage } from './mock-image';
import type { LLMProvider } from './types';
import type { ImageProvider } from './image-types';
import { mockVideo } from './mock-video';
import { omniVideo } from './omni-video';
import type { VideoProvider } from './video-types';

export type { Breakdown, LLMProvider } from './types';
export type { ImageProvider, FrameRequest } from './image-types';
export type { VideoProvider, VideoRequest, RenderQuality } from './video-types';

// LLM_PROVIDER=mock|anthropic. Default: anthropic when a key is set, otherwise mock (runs with no keys).
export function getLLM(): LLMProvider {
  const pick = process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock');
  return pick === 'anthropic' ? anthropicLLM : mockLLM;
}

// IMAGE_PROVIDER=mock|gemini. Paid image generation is opt-in, so the default is always mock.
export function getImage(): ImageProvider {
  return process.env.IMAGE_PROVIDER === 'gemini' ? geminiImage : mockImage;
}

// VIDEO_PROVIDER=mock|omni. Video costs money per second, so the default is always mock.
export function getVideo(): VideoProvider {
  return process.env.VIDEO_PROVIDER === 'omni' ? omniVideo : mockVideo;
}

// The provider that started a job must be the one that polls it, even if VIDEO_PROVIDER changed since.
export function videoFor(jobId: string): VideoProvider {
  return [mockVideo, omniVideo].find(p => p.owns(jobId)) ?? getVideo();
}
