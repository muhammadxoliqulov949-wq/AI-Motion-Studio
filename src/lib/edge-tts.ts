/**
 * Free text-to-speech with Microsoft's neural voices through the "read aloud" service of the Edge
 * browser: no API key, no billing, and real Uzbek voices (uz-UZ-MadinaNeural, uz-UZ-SardorNeural).
 *
 * This is a small client written for this project on top of `ws` (MIT). It deliberately does not use
 * the `edge-tts` npm package: that one is CC BY-NC-SA (non-commercial, share-alike).
 *
 * Caveats worth knowing: it is an unofficial endpoint (Microsoft can change or block it, and some
 * datacenter IPs get refused), so callers should keep an official fallback (Azure AI Speech) available.
 */
import { randomBytes, randomUUID } from "node:crypto";
import WebSocket from "ws";
import { secMsGecV2 } from "./edge-tts-token";

const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
/**
 * The service checks that the client looks like a recent Edge. Microsoft bumps this now and then; if
 * synthesis starts failing with HTTP 403, set EDGE_TTS_CHROMIUM_VERSION to a current Edge version.
 */
const CHROMIUM_VERSION = process.env.EDGE_TTS_CHROMIUM_VERSION || "143.0.3650.75";
const HOST = "speech.platform.bing.com";
const WS_PATH = "/consumer/speech/synthesize/readaloud/edge/v1";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
/** Seconds between the Windows file-time epoch (1601) and the Unix epoch. */
const WIN_EPOCH = 11644473600;

export interface EdgeSpeakOptions {
  text: string;
  /** Voice short name, e.g. "uz-UZ-MadinaNeural". */
  voice: string;
  /** Offsets in percent relative to the voice's default. */
  rate?: number;
  pitch?: number;
  volume?: number;
  timeoutMs?: number;
}

/** The anti-abuse token the service expects (v2): see ./edge-tts-token.ts. */
const secMsGec = (skewSeconds = 0) => {
  const ticks = Math.floor(Date.now() / 1000 + skewSeconds) + WIN_EPOCH;
  return secMsGecV2(`${(BigInt(ticks - (ticks % 300)) * BigInt(10000000)).toString()}${TOKEN}`);
};

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const pct = (n: number | undefined) => `${(n ?? 0) >= 0 ? "+" : ""}${Math.round(n ?? 0)}%`;
const hz = (percent: number | undefined) => {
  const v = Math.round((percent ?? 0) * 1.5);
  return `${v >= 0 ? "+" : ""}${v}Hz`;
};
const stamp = () => new Date().toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");

const buildSsml = ({ text, voice, rate, pitch, volume }: EdgeSpeakOptions) => {
  const lang = voice.split("-").slice(0, 2).join("-");
  const r = Math.max(-60, Math.min(100, rate ?? 0));
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
    `<voice name='${voice}'><prosody pitch='${hz(pitch)}' rate='${pct(r)}' volume='${pct(volume)}'>${escapeXml(text)}</prosody></voice></speak>`
  );
};

export class EdgeTtsError extends Error {
  constructor(
    message: string,
    /** True when the service refused us (blocked IP, bad token): worth trying another provider. */
    public refused = false,
  ) {
    super(message);
  }
}

const connect = (skewSeconds: number) =>
  new Promise<WebSocket>((resolve, reject) => {
    const url = `wss://${HOST}${WS_PATH}?TrustedClientToken=${TOKEN}&Sec-MS-GEC=${secMsGec(skewSeconds)}&Sec-MS-GEC-Version=2-${CHROMIUM_VERSION}&ConnectionId=${randomUUID().replace(/-/g, "")}`;
    const ws = new WebSocket(url, {
      headers: {
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_VERSION.split(".")[0]}.0.0.0 Safari/537.36 Edg/${CHROMIUM_VERSION.split(".")[0]}.0.0.0`,
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
        // The service also expects a browser-like machine id cookie.
        Cookie: `muid=${randomBytes(16).toString("hex").toUpperCase()};`,
      },
    });
    ws.once("open", () => resolve(ws));
    ws.once("unexpected-response", (_req, res) => {
      // 403 carries the server's clock in the Date header: lets the caller retry with a corrected token.
      const date = res.headers.date ? Date.parse(res.headers.date) : NaN;
      ws.terminate();
      const err = new EdgeTtsError(`Edge TTS rad etdi (HTTP ${res.statusCode})`, true) as EdgeTtsError & { skew?: number };
      if (Number.isFinite(date)) err.skew = date / 1000 - Date.now() / 1000;
      reject(err);
    });
    ws.once("error", (e) => reject(new EdgeTtsError(`Edge TTS ulanishi muvaffaqiyatsiz: ${e.message}`, true)));
  });

const synthesizeOnce = async (opts: EdgeSpeakOptions, skewSeconds: number) => {
  const ws = await connect(skewSeconds);
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new EdgeTtsError("Edge TTS javob bermadi (vaqt tugadi)"));
    }, opts.timeoutMs ?? 25_000);
    const finish = (fn: () => void) => {
      clearTimeout(timer);
      fn();
    };

    ws.on("message", (data, isBinary) => {
      if (!isBinary) {
        const text = data.toString();
        if (text.includes("Path:turn.end")) {
          ws.close();
          finish(() => (chunks.length ? resolve(new Uint8Array(Buffer.concat(chunks))) : reject(new EdgeTtsError("Edge TTS bo'sh audio qaytardi"))));
        }
        return;
      }
      // Binary frame: 2-byte big-endian header length, the header text, then the audio bytes.
      const buf = data as Buffer;
      if (buf.length < 2) return;
      const headerLen = buf.readUInt16BE(0);
      if (buf.subarray(2, 2 + headerLen).toString().includes("Path:audio")) chunks.push(new Uint8Array(buf.subarray(2 + headerLen)));
    });
    ws.on("error", (e) => finish(() => reject(new EdgeTtsError(`Edge TTS xatosi: ${e.message}`, true))));
    ws.on("close", () => finish(() => chunks.length || reject(new EdgeTtsError("Edge TTS ulanishi uzildi"))));

    const config = JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" }, outputFormat: OUTPUT_FORMAT } } } });
    ws.send(`X-Timestamp:${stamp()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${config}`, (e) => e && finish(() => reject(new EdgeTtsError(`Edge TTS: ${e.message}`))));
    ws.send(`X-RequestId:${randomUUID().replace(/-/g, "")}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp()}Z\r\nPath:ssml\r\n\r\n${buildSsml(opts)}`);
  });
};

/** Text → MP3 bytes. Retries once with the server's clock when the first handshake is refused. */
export const edgeSpeak = async (opts: EdgeSpeakOptions): Promise<Uint8Array> => {
  try {
    return await synthesizeOnce(opts, 0);
  } catch (err) {
    const skew = (err as { skew?: number }).skew;
    if (typeof skew === "number" && Math.abs(skew) > 1) return synthesizeOnce(opts, skew);
    if (err instanceof EdgeTtsError && err.refused) return synthesizeOnce(opts, 0); // one plain retry for flaky handshakes
    throw err;
  }
};
