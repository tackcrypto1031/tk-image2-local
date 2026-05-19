type CodexImageMode = 'generate' | 'edit' | 'outpaint' | 'inpaint';

interface CodexGenerateRequest {
  jobId?: string;
  mode: CodexImageMode;
  prompt: string;
  style?: string;
  aspectRatio?: string;
  images?: Array<{ dataUrl: string }>;
}

interface CodexGeneratedImage {
  id: string;
  dataUrl: string;
  filePath: string;
  width: number;
  height: number;
  contentType: string;
}

interface CodexHealthResult {
  ok: boolean;
  checks: {
    codexVersion: string | null;
    authStatus: string | null;
    referenceImages: boolean;
    outputLastMessage: boolean;
    codexBin: string;
    imageModel: string;
  };
  blockingIssues: string[];
}

interface CodexSetupResult {
  ok: boolean;
  message: string;
  pid?: number;
}

interface CodexImageBridge {
  health(): Promise<CodexHealthResult>;
  setupCodexCli(): Promise<CodexSetupResult>;
  generate(request: CodexGenerateRequest): Promise<CodexGeneratedImage>;
  autoOutpaintPrompt(request: { jobId?: string; image: string; prompt?: string }): Promise<string>;
  cancel(jobId: string): Promise<{ cancelled: boolean }>;
  loadCanvas(): Promise<unknown[] | null>;
  saveCanvas(elements: unknown[]): Promise<{ ok: boolean; filePath: string }>;
}

interface Window {
  codexImage?: CodexImageBridge;
}
