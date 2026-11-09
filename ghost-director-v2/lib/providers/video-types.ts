import type { ImageData } from './image-types';

// Provider-neutral video rendering. Video models are slow, so rendering is a job: start, then poll.

export type VideoRequest = {
  shotNumber: string;
  description: string;
  camera: string;
  mood: string;
  durationSec: number;
  dialogue: string;
  frame: ImageData; // the shot's up-to-date storyboard frame; the clip starts from it
  quality: RenderQuality;
};

export type RenderQuality = 'draft' | 'final';

export type PollResult =
  | { done: false }
  | { done: true; error: string }
  | { done: true; data: Buffer; mime: string };

export interface VideoProvider {
  readonly name: string;
  owns(jobId: string): boolean; // so a job is always polled by the provider that started it
  start(req: VideoRequest): Promise<{ jobId: string }>;
  poll(jobId: string): Promise<PollResult>;
}
