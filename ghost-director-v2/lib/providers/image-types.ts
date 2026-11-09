// Provider-neutral image generation. Frames are made from one shot plus the locked references of its characters.

export type ImageData = { data: Buffer; mime: string };

export type FrameCharacter = {
  name: string;
  styleNote: string;
  reference: ImageData | null; // the locked reference image, if one was uploaded
};

export type FrameRequest = {
  shotNumber: string;
  sceneHeading: string;
  description: string;
  framing: string;
  camera: string;
  mood: string;
  characters: FrameCharacter[];
};

export interface ImageProvider {
  readonly name: string;
  generateFrame(req: FrameRequest): Promise<ImageData>;
}
