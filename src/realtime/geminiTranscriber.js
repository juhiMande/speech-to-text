import { GoogleGenAI, Modality } from "@google/genai";

const SAMPLE_RATE = 16000;
const FLUSH_WAIT_MS = 1500;

// The Live API is a conversational model. We ask it to stay silent and only
// read the transcription of what the user said; any reply it makes is ignored.
const SYSTEM_PROMPT =
  "You are used only as a speech transcription backend. " +
  "Do not answer, translate or comment on anything you hear. Stay silent.";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class GeminiTranscriber {
  name = "Gemini Live";

  constructor({ apiKey, model, languages = [], onText, onError }) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set on the server");
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
    this.languages = languages;
    this.onText = onText;
    this.onError = onError;
    this.committed = "";
    this.interim = "";
    this.closed = false;
    this.finishing = false;
  }

  get text() {
    return (this.committed + this.interim).trim();
  }

  async start() {
    const inputAudioTranscription = this.languages.length ? { languageCodes: this.languages } : {};

    this.session = await this.ai.live.connect({
      model: this.model,
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription,
        systemInstruction: SYSTEM_PROMPT,
      },
      callbacks: {
        onmessage: (message) => this.handleMessage(message),
        onerror: (event) => this.onError(event?.message || "Gemini Live connection error"),
        onclose: (event) => {
          this.closed = true;
          if (!this.finishing && event?.reason) this.onError(`Gemini Live closed: ${event.reason}`);
        },
      },
    });
  }

  handleMessage(message) {
    const content = message.serverContent;
    if (!content) return;

    // interim = low-latency guess for the words being spoken right now
    if (content.interimInputTranscription?.text) {
      this.interim = content.interimInputTranscription.text;
      this.onText(this.text);
    }
    // inputTranscription = confirmed fragments, appended in order
    if (content.inputTranscription?.text) {
      this.committed += content.inputTranscription.text;
      this.interim = "";
      this.onText(this.text);
    }
  }

  sendAudio(buffer) {
    if (this.closed) return;
    this.session.sendRealtimeInput({
      audio: { data: buffer.toString("base64"), mimeType: `audio/pcm;rate=${SAMPLE_RATE}` },
    });
  }

  async finish() {
    this.finishing = true;
    if (!this.closed) {
      try {
        this.session.sendRealtimeInput({ audioStreamEnd: true });
      } catch {
        // connection already gone, return what we have
      }
      await sleep(FLUSH_WAIT_MS); // let the last fragments arrive
    }
    return this.text;
  }

  close() {
    this.finishing = true;
    try {
      this.session?.close();
    } catch {
      // ignore
    }
  }
}
